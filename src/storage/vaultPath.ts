import { FileSystemAdapter, type App } from "obsidian";

/**
 * Helpers for working with the vault's location on disk.
 *
 * `getBasePath` only exists on the file system adapter, which is the only
 * adapter available on desktop. The plugin is desktop only, so the lookup
 * always succeeds there, but the type system does not know that.
 */

/** Returns the absolute path of the vault root, or an empty string. */
export function vaultBasePath(app: App): string {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	return "";
}
