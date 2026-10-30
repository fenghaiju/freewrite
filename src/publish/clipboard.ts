import type { PlatformDraft } from "../types";

/**
 * Clipboard delivery.
 *
 * freeWrite never posts to a social platform directly. The default delivery
 * path puts the finished draft on the clipboard and opens the platform's own
 * compose page, so the user performs the final publish action from a session
 * they are signed in to.
 */

/** Formats a draft as plain text for the clipboard. */
export function formatDraftForClipboard(draft: PlatformDraft): string {
	const lines: string[] = [];

	if (draft.title) {
		lines.push(draft.title);
		lines.push("");
	}
	if (draft.body) {
		lines.push(draft.body);
	}
	if (draft.tags.length > 0) {
		lines.push("");
		lines.push(draft.tags.map((tag) => `#${tag}`).join(" "));
	}

	return lines.join("\n").trim();
}

/** Copies text to the system clipboard. */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * Copies a draft to the clipboard and optionally opens the platform's compose
 * page in the default browser.
 */
export async function publishViaClipboard(
	draft: PlatformDraft,
	publishUrl: string,
	openPublishPage: boolean,
): Promise<boolean> {
	const text = formatDraftForClipboard(draft);
	const copied = await copyToClipboard(text);
	if (openPublishPage && publishUrl) {
		window.open(publishUrl, "_blank");
	}
	return copied;
}
