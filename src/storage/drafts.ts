import { TFile, TFolder, normalizePath, type App } from "obsidian";
import * as path from "path";
import { vaultBasePath } from "./vaultPath";
import type { DraftImage, PlatformDraft } from "../types";

/**
 * Vault-side storage for generated drafts.
 *
 * Drafts are written as regular Markdown notes inside the configured output
 * folder so they stay in sync with the vault and can be version controlled
 * together with the rest of the user's notes.
 */

/** Matches markdown image syntax, capturing alt text and the target. */
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Extracts the image references from a note body. */
export function extractImageReferences(body: string): Array<{ alt: string; target: string }> {
	const images: Array<{ alt: string; target: string }> = [];
	let match = IMAGE_PATTERN.exec(body);
	while (match !== null) {
		images.push({ alt: match[1] ?? "", target: match[2] });
		match = IMAGE_PATTERN.exec(body);
	}
	IMAGE_PATTERN.lastIndex = 0;
	return images;
}

/**
 * Resolves the image references of a note to real files in the vault.
 *
 * Only vault attachments are resolved; remote links are skipped because there
 * is no local file to hand to the publishing service.
 */
export async function resolveImages(app: App, notePath: string, body: string): Promise<DraftImage[]> {
	const resolved: DraftImage[] = [];
	const seen = new Set<string>();
	const noteFolder = vaultDirname(notePath);
	const basePath = vaultBasePath(app);

	for (const reference of extractImageReferences(body)) {
		const target = reference.target.trim();
		if (!target || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) continue;

		const decoded = safeDecode(target);
		const candidates = decoded.startsWith("/")
			? [normalizePath(decoded)]
			: [normalizePath(`${noteFolder ? `${noteFolder}/` : ""}${decoded}`), normalizePath(decoded)];

		for (const candidate of candidates) {
			if (seen.has(candidate)) continue;
			const file = app.vault.getAbstractFileByPath(candidate);
			if (file instanceof TFile) {
				seen.add(candidate);
				resolved.push({
					vaultPath: file.path,
					absolutePath: basePath ? path.join(basePath, file.path) : file.path,
					alt: reference.alt,
					bytes: file.stat.size,
				});
				break;
			}
		}
	}

	return resolved;
}

/** Returns the folder part of a vault path, or an empty string at the root. */
export function vaultDirname(notePath: string): string {
	const index = notePath.lastIndexOf("/");
	return index === -1 ? "" : notePath.slice(0, index);
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** Serialises a draft into the Markdown body written to the vault. */
export function draftToMarkdown(draft: PlatformDraft): string {
	const frontmatter = [
		"---",
		"freewrite-platform: " + draft.platformId,
		"freewrite-title: " + JSON.stringify(draft.title),
		"freewrite-tags: " + JSON.stringify(draft.tags),
		"freewrite-summary: " + JSON.stringify(draft.summary),
		"---",
		"",
	].join("\n");

	const body = draft.body.trim();
	const tags = draft.tags.length > 0 ? `\n\n${draft.tags.map((tag) => `#${tag}`).join(" ")}` : "";

	return `${frontmatter}\n# ${draft.title}\n\n${body}${tags}\n`;
}

/**
 * Writes a draft into the vault.
 *
 * @returns The path of the note that was written.
 */
export async function writeDraftNote(
	app: App,
	outputFolder: string,
	platformId: string,
	draft: PlatformDraft,
	baseName: string,
): Promise<string> {
	const folderPath = normalizePath(outputFolder);
	await ensureFolder(app, folderPath);

	const fileName = `${sanitiseFileName(baseName)}-${sanitiseFileName(platformId)}.md`;
	const filePath = normalizePath(`${folderPath}/${fileName}`);

	const existing = app.vault.getAbstractFileByPath(filePath);
	if (existing instanceof TFile) {
		await app.vault.process(existing, () => draftToMarkdown(draft));
		return existing.path;
	}

	await app.vault.create(filePath, draftToMarkdown(draft));
	return filePath;
}

/** Creates a folder and its parents when they do not exist yet. */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (!folderPath || folderPath === "/") return;
	const existing = app.vault.getAbstractFileByPath(folderPath);
	if (existing instanceof TFolder) return;

	const segments = folderPath.split("/").filter(Boolean);
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		const found = app.vault.getAbstractFileByPath(current);
		if (!(found instanceof TFolder)) {
			await app.vault.createFolder(current);
		}
	}
}

/** Removes characters that are not safe in a file name. */
export function sanitiseFileName(value: string): string {
	const cleaned = value
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 60);
	return cleaned || "draft";
}
