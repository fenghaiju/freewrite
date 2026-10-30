/**
 * Minimal stand-in for the `obsidian` module.
 *
 * The real package only ships type declarations; the runtime is provided by
 * the Obsidian application. Tests that touch vault code use this stub so they
 * can run in plain Node.
 */

export class TAbstractFile {
	path = "";
	name = "";
}

export class TFile extends TAbstractFile {
	extension = "md";
	stat = { size: 0, ctime: 0, mtime: 0 };
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
}

export function normalizePath(path: string): string {
	const cleaned = path.replace(/\\/g, "/").replace(/\/+/g, "/");
	const prefixed = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
	return prefixed.replace(/\/$/, "") || "/";
}

export class FileSystemAdapter {
	getBasePath(): string {
		return "";
	}
}

export class Notice {
	constructor(public message: string) {}
	hide() {}
}

export class Setting {
	constructor(public containerEl?: unknown) {}
}

export class PluginSettingTab {
	containerEl = { empty: () => {}, addClass: () => {} };
	constructor(
		public app: unknown,
		public plugin: unknown,
	) {}
	display() {}
}

export class Modal {
	modalEl = { addClass: () => {} };
	contentEl = { empty: () => {} };
	constructor(public app: unknown) {}
	open() {}
	close() {}
}

export class ItemView {
	leaf: unknown;
	contentEl: unknown;
	constructor(leaf: unknown) {
		this.leaf = leaf;
	}
}

export class Plugin {
	app: unknown;
	constructor(app?: unknown, public manifest?: unknown) {
		this.app = app;
	}
	addCommand() {}
	addRibbonIcon() {}
	addSettingTab() {}
	registerView() {}
	async loadData(): Promise<unknown> {
		return {};
	}
	async saveData(): Promise<void> {}
}

export type WorkspaceLeaf = unknown;
export type App = unknown;
export type Editor = unknown;
