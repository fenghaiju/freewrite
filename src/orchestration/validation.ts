import type { PlatformDraft, PlatformSpec } from "../types";
import { weightedLength } from "../platforms/registry";

/**
 * Validation of a generated draft against the target platform's constraints.
 *
 * The checks are advisory: they surface problems in the UI instead of blocking
 * the draft, because the user can always edit the text before publishing.
 */

export interface ValidationResult {
	warnings: string[];
}

/** Validates a draft against its platform specification. */
export function validateDraft(platform: PlatformSpec, draft: Omit<PlatformDraft, "warnings" | "durationMs">): ValidationResult {
	const warnings: string[] = [];

	const titleLength = platform.titleLimit > 0 ? weightedLength(draft.title) : 0;
	if (platform.titleLimit > 0 && titleLength > platform.titleLimit) {
		warnings.push(`Title is ${titleLength} weighted characters, over the ${platform.titleLimit} character limit.`);
	}
	if (platform.titleLimit > 0 && draft.title.length === 0) {
		warnings.push("The title is empty.");
	}

	const bodyLength = weightedLength(draft.body);
	if (bodyLength < platform.bodyRange[0]) {
		warnings.push(`The body is ${bodyLength} weighted characters, below the ${platform.bodyRange[0]} character target.`);
	} else if (bodyLength > platform.bodyRange[1]) {
		warnings.push(`The body is ${bodyLength} weighted characters, over the ${platform.bodyRange[1]} character target.`);
	}

	if (platform.usesTags) {
		if (draft.tags.length === 0) {
			warnings.push("This platform expects topic tags but the draft has none.");
		} else if (draft.tags.length > platform.tagLimit) {
			warnings.push(`The draft has ${draft.tags.length} tags, more than the ${platform.tagLimit} tag limit.`);
		}
	}

	if (!platform.keepMarkdown && hasMarkdownSyntax(draft.body)) {
		warnings.push("The body still contains Markdown syntax that this platform does not render.");
	}

	return { warnings };
}

/** Detects Markdown syntax in a body that is meant to be plain text. */
export function hasMarkdownSyntax(body: string): boolean {
	const patterns = [
		/^#{1,6}\s+\S/m, // headings
		/\*\*[^*\n]+\*\*/, // bold
		/^\s*[-*+]\s+\S/m, // unordered list
		/^\s*\d+\.\s+\S/m, // ordered list
		/```/, // fenced code
		/!?\[[^\]]*\]\([^)]*\)/, // links and images
		/`[^`\n]+`/, // inline code
		/^\s*>\s+\S/m, // quote
	];

	return patterns.some((pattern) => pattern.test(body));
}
