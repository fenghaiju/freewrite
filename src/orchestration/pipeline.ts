import type { DraftImage, PlatformDraft, PlatformSpec } from "../types";
import type { OpenCodeClient } from "../runtime/client";
import { buildSystemPrompt, buildUserPrompt, parseDraft } from "./prompts";
import { validateDraft } from "./validation";

/**
 * The one-note-to-many-platforms rewrite pipeline.
 *
 * A single session is reused for every platform so the model keeps the source
 * article in context and the run is cheaper than starting a fresh session per
 * platform.
 */

export interface PipelineOptions {
	/** Body of the source note. */
	source: string;
	/** Title of the source note. */
	sourceTitle: string;
	/** Platforms to produce drafts for. */
	platforms: PlatformSpec[];
	/** Model in `provider/model` form. */
	model?: string;
	/** OpenCode agent used for the rewrite. */
	agent?: string;
	/** Extra system prompt from settings. */
	systemPrompt?: string;
	/** Extra user instructions for this run. */
	extraInstructions?: string;
	/** Images referenced by the source note. */
	images?: DraftImage[];
}

export interface PlatformProgress {
	platform: PlatformSpec;
	status: "pending" | "running" | "done" | "error";
	draft?: PlatformDraft;
	error?: string;
}

export interface PipelineCallbacks {
	/** Called when a platform starts. */
	onPlatformStart?: (platform: PlatformSpec) => void;
	/** Called when a platform finishes successfully. */
	onPlatformDone?: (draft: PlatformDraft) => void;
	/** Called when a platform fails. */
	onPlatformError?: (platform: PlatformSpec, error: string) => void;
	/** Called for streamed assistant output of the current platform. */
	onStream?: (platform: PlatformSpec, text: string) => void;
}

/** Thrown when the model returns something that is not a usable draft. */
export class PipelineError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PipelineError";
	}
}

/**
 * Runs the pipeline for every platform.
 *
 * @returns One draft per platform. Platforms that fail are reported through the
 * callbacks and omitted from the result.
 */
export async function runPipeline(
	client: OpenCodeClient,
	sessionId: string,
	options: PipelineOptions,
	callbacks: PipelineCallbacks = {},
): Promise<PlatformDraft[]> {
	const drafts: PlatformDraft[] = [];

	for (const platform of options.platforms) {
		callbacks.onPlatformStart?.(platform);
		const startedAt = Date.now();

		try {
			const system = buildSystemPrompt({
				source: options.source,
				sourceTitle: options.sourceTitle,
				platform,
				systemPrompt: options.systemPrompt,
			});
			const user = buildUserPrompt({
				source: options.source,
				sourceTitle: options.sourceTitle,
				platform,
				extraInstructions: options.extraInstructions,
			});

			let streamBuffer = "";
			const stream = client.prompt(sessionId, user, {
				model: options.model,
				agent: options.agent,
				system,
			});

			let result = await stream.next();
			let text = "";
			while (!result.done) {
				if (result.value.type === "text") {
					text += result.value.text;
					streamBuffer += result.value.text;
					callbacks.onStream?.(platform, streamBuffer);
				}
				result = await stream.next();
			}
			const finalText = result.value.text || text;

			const parsed = parseDraft(finalText);
			if (!parsed) {
				throw new PipelineError(
					`The model did not return a usable draft for ${platform.name}. Try a different model or rewrite the request.`,
				);
			}

			const draftBase = {
				platformId: platform.id,
				title: parsed.title,
				body: parsed.body,
				tags: parsed.tags,
				summary: parsed.summary,
				images: options.images ?? [],
			};
			const { warnings } = validateDraft(platform, draftBase);

			const draft: PlatformDraft = {
				...draftBase,
				durationMs: Date.now() - startedAt,
				warnings,
			};

			drafts.push(draft);
			callbacks.onPlatformDone?.(draft);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			callbacks.onPlatformError?.(platform, message);
		}
	}

	return drafts;
}
