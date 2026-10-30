/**
 * Browser stand-in for Node's `path` module.
 *
 * Only the members that `src/storage/drafts.ts` uses are needed, and the mockup
 * never writes to disk.
 */

export function join(...parts: string[]): string {
	const joined = parts.filter((part) => part.length > 0).join("/");
	return joined.replace(/\/+/g, "/");
}

export function resolve(...parts: string[]): string {
	return join(...parts);
}

export function dirname(value: string): string {
	const index = value.lastIndexOf("/");
	return index === -1 ? "" : value.slice(0, index);
}

export function basename(value: string): string {
	const index = value.lastIndexOf("/");
	return index === -1 ? value : value.slice(index + 1);
}

export const sep = "/";
