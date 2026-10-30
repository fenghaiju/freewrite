/**
 * Shared domain types for freeWrite.
 */

export type PublishChannel = "clipboard" | "bridge" | "both";

export type PublishTrigger = "manual" | "auto";

/** A user-managed model provider. freeWrite writes these into OpenCode's own config. */
export interface ProviderProfile {
	/** OpenCode provider id, e.g. `anthropic`, `my-proxy`. */
	id: string;
	/** Human readable label shown in settings. */
	name: string;
	/**
	 * AI SDK package used to talk to the provider.
	 * Leave empty for providers OpenCode already knows about.
	 */
	npm?: string;
	/** Base URL for OpenAI-compatible or proxy endpoints. */
	baseUrl?: string;
	/**
	 * API key. Stored in the plugin's local data file and pushed into
	 * OpenCode's own credential store. Never sent anywhere except OpenCode.
	 */
	apiKey?: string;
	/** Model ids offered by this provider. */
	models: string[];
	/** Extra provider options merged into the generated OpenCode config. */
	options?: Record<string, unknown>;
}

/** A single platform the pipeline can produce a draft for. */
export interface PlatformSpec {
	id: string;
	name: string;
	/** Short description of the audience, injected into the rewrite prompt. */
	audience: string;
	/** Maximum characters allowed in the title. */
	titleLimit: number;
	/** Preferred body length range, in Chinese characters. */
	bodyRange: [number, number];
	/** Whether the platform expects topic hashtags. */
	usesTags: boolean;
	/** Maximum number of topics/tags. */
	tagLimit: number;
	/** Official compose page opened when the user publishes from the clipboard. */
	publishUrl: string;
	/** Content style hints injected into the rewrite prompt. */
	style: string;
	/** Markdown is preserved verbatim (technical platforms). */
	keepMarkdown?: boolean;
}

/** Result of rewriting one note for one platform. */
export interface PlatformDraft {
	platformId: string;
	title: string;
	body: string;
	tags: string[];
	summary: string;
	/** Wall-clock milliseconds the rewrite took. */
	durationMs: number;
	/** Non-fatal problems found while validating the draft. */
	warnings: string[];
	/** Images referenced by the source note, resolved to vault paths. */
	images: DraftImage[];
}

export interface DraftImage {
	/** Path relative to the vault root. */
	vaultPath: string;
	/** Absolute path on disk. */
	absolutePath: string;
	/** Original markdown alt text. */
	alt: string;
	/** File size in bytes. */
	bytes: number;
}

/** Payload posted to the user's own publishing service. */
export interface BridgePayload {
	schema: "freewrite/bridge@1";
	taskId: string;
	createdAt: string;
	source: BridgeSource;
	targets: BridgeTarget[];
	options: BridgeOptions;
}

export interface BridgeSource {
	vaultName: string;
	vaultPath: string;
	notePath: string;
	noteTitle: string;
	raw: string;
}

export interface BridgeTarget {
	platformId: string;
	platformName: string;
	title: string;
	body: string;
	tags: string[];
	summary: string;
	publishUrl: string;
	images: Array<{
		name: string;
		vaultPath: string;
		absolutePath: string;
		mimeType: string;
		bytes: number;
	}>;
}

export interface BridgeOptions {
	/** Publish immediately instead of queueing for the user's scheduler. */
	publish: boolean;
	/** ISO timestamp for scheduled publishing, or null for immediate. */
	scheduleAt: string | null;
}

/** Result of a single bridge call. */
export interface BridgeResult {
	ok: boolean;
	status: number;
	body: string;
}

/** Normalised streaming events surfaced to the UI. */
export type RuntimeEvent =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "tool"; name: string; status: string; input?: string; output?: string }
	| { type: "error"; message: string }
	| { type: "done"; text: string; cost?: number };
