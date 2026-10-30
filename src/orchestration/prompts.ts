import type { PlatformSpec } from "../types";

/**
 * Prompt construction for the rewrite pipeline.
 *
 * The model is asked to return a JSON object so the result can be parsed
 * deterministically instead of scraped out of prose.
 */

export interface PromptOptions {
	/** The note body that should be rewritten. */
	source: string;
	/** Title of the source note. */
	sourceTitle: string;
	/** Platform the rewrite targets. */
	platform: PlatformSpec;
	/** Extra instructions from the user. */
	extraInstructions?: string;
	/** Additional system prompt configured by the user. */
	systemPrompt?: string;
}

/** Builds the system prompt for a rewrite request. */
export function buildSystemPrompt(options: PromptOptions): string {
	const lines = [
		"You are a professional Chinese content editor who specialises in rewriting one article into platform-native drafts.",
		"You always answer with a single JSON object and nothing else. No prose, no markdown fences, no explanations.",
		"The JSON object must have exactly these keys:",
		'  "title": string',
		'  "body": string',
		'  "tags": string[]',
		'  "summary": string',
		"",
		"Rules:",
		"- Keep every fact from the source article. Never invent facts, numbers or citations.",
		"- Do not mention that the text was rewritten, translated or adapted.",
		"- Do not add a greeting, a sign-off, or any note about the output format.",
		"- Escape newlines inside JSON strings with \\n.",
	];

	if (options.systemPrompt?.trim()) {
		lines.push("", "Additional instructions from the user:", options.systemPrompt.trim());
	}

	return lines.join("\n");
}

/** Builds the user prompt for a rewrite request. */
export function buildUserPrompt(options: PromptOptions): string {
	const { platform, source, sourceTitle } = options;
	const parts: string[] = [];

	parts.push(`Target platform: ${platform.name}`);
	parts.push(`Audience: ${platform.audience}`);
	parts.push(`Title length limit: ${platform.titleLimit > 0 ? `${platform.titleLimit} characters` : "not applicable"}`);
	parts.push(`Body length target: ${platform.bodyRange[0]}-${platform.bodyRange[1]} characters`);
	parts.push(`Style: ${platform.style}`);
	if (platform.keepMarkdown) {
		parts.push("Markdown formatting is supported on this platform, so keep code blocks, lists and headings.");
	} else {
		parts.push("This platform does not support Markdown, so write plain text without any Markdown syntax.");
	}
	if (platform.usesTags) {
		parts.push(`Provide up to ${platform.tagLimit} topic tags. Return them without the leading '#'.`);
	} else {
		parts.push("This platform does not use topic tags. Return an empty tags array.");
	}
	if (options.extraInstructions?.trim()) {
		parts.push("", `Extra instructions: ${options.extraInstructions.trim()}`);
	}

	parts.push("", "--- SOURCE ARTICLE ---", `Title: ${sourceTitle}`, source, "--- END SOURCE ARTICLE ---");

	parts.push(
		"",
		"Write the draft now. Respond with the JSON object only.",
		`Remember: title within ${platform.titleLimit > 0 ? `${platform.titleLimit} characters` : "the platform limit"}, body within ${platform.bodyRange[0]}-${platform.bodyRange[1]} characters.`,
	);

	return parts.join("\n");
}

/** A parsed draft returned by the model. */
export interface ParsedDraft {
	title: string;
	body: string;
	tags: string[];
	summary: string;
}

/**
 * Extracts the draft object from a model response.
 *
 * The model is instructed to answer with JSON only, but real models sometimes
 * wrap the answer in a markdown fence or add a sentence around it, so the
 * parser falls back to locating the outermost JSON object.
 */
export function parseDraft(raw: string): ParsedDraft | null {
	const text = raw.trim();
	if (!text) return null;

	const candidates: string[] = [];
	const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
	if (fenced?.[1]) candidates.push(fenced[1].trim());
	candidates.push(text);

	for (const candidate of candidates) {
		const direct = tryParse(candidate);
		if (direct) return direct;

		const start = candidate.indexOf("{");
		const end = candidate.lastIndexOf("}");
		if (start !== -1 && end > start) {
			const sliced = tryParse(candidate.slice(start, end + 1));
			if (sliced) return sliced;
		}
	}

	return null;
}

function tryParse(candidate: string): ParsedDraft | null {
	try {
		const value = JSON.parse(candidate) as Record<string, unknown>;
		if (typeof value !== "object" || value === null) return null;
		const body = typeof value.body === "string" ? value.body : "";
		if (!body) return null;

		const rawTags = Array.isArray(value.tags) ? value.tags : [];
		const tags = rawTags
			.map((tag) => String(tag).replace(/^#+/, "").trim())
			.filter((tag) => tag.length > 0);

		return {
			title: typeof value.title === "string" ? value.title.trim() : "",
			body: body.trim(),
			tags,
			summary: typeof value.summary === "string" ? value.summary.trim() : "",
		};
	} catch {
		return null;
	}
}
