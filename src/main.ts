import { Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, mergeSettings, type FreeWriteSettings } from "./settings";
import { RuntimeManager } from "./runtime/manager";
import { WORKBENCH_VIEW_TYPE, WorkbenchView } from "./ui/workbenchView";
import { FreeWriteSettingTab } from "./ui/settingsTab";
import { InlineEditModal } from "./ui/inlineEditModal";
import { resolvePlatforms } from "./platforms/registry";
import { writeDraftNote } from "./storage/drafts";
import { vaultBasePath } from "./storage/vaultPath";
import { buildBridgePayload, postToBridge } from "./publish/bridge";
import type { BridgeResult, PlatformDraft } from "./types";

export default class FreeWritePlugin extends Plugin {
	settings: FreeWriteSettings = DEFAULT_SETTINGS;
	runtime!: RuntimeManager;

	override async onload(): Promise<void> {
		await this.loadSettings();

		this.runtime = new RuntimeManager(this.app, () => this.settings);

		this.registerView(WORKBENCH_VIEW_TYPE, (leaf: WorkspaceLeaf) => new WorkbenchView(leaf, this));

		this.addRibbonIcon("pen-line", "Open freeWrite", () => void this.activateView());

		this.addCommand({
			id: "open-workbench",
			name: "Open the workbench",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "rewrite-current-note",
			name: "Rewrite the current note for platforms",
			editorCheckCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.rewriteActiveNote(file);
				return true;
			},
		});

		this.addCommand({
			id: "rewrite-selection",
			name: "Rewrite the selection",
			editorCheckCallback: (checking, editor) => {
				const selection = editor.getSelection();
				if (!selection) return false;
				if (!checking) new InlineEditModal(this.app, this, editor, selection).open();
				return true;
			},
		});

		this.addSettingTab(new FreeWriteSettingTab(this.app, this));
	}

	override async onunload(): Promise<void> {
		await this.runtime.shutdown();
	}

	/** Loads the persisted settings. */
	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
	}

	/** Persists the current settings. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Opens the workbench panel, revealing it when it is already open. */
	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(WORKBENCH_VIEW_TYPE);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("Could not open the freeWrite panel");
			return;
		}
		await leaf.setViewState({ type: WORKBENCH_VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	/** Loads a note into the workbench and makes sure the panel is visible. */
	async rewriteActiveNote(file: TFile): Promise<void> {
		await this.activateView();
		const view = this.getWorkbenchView();
		if (!view) {
			new Notice("Could not open the freeWrite panel");
			return;
		}
		await view.loadSource(file);
	}

	/** Returns the workbench view when it is open. */
	getWorkbenchView(): WorkbenchView | null {
		const leaves = this.app.workspace.getLeavesOfType(WORKBENCH_VIEW_TYPE);
		if (leaves.length === 0) return null;
		const view = leaves[0].view;
		return view instanceof WorkbenchView ? view : null;
	}

	/** Writes the generated drafts into the vault. */
	async saveDrafts(drafts: PlatformDraft[], source: TFile | null): Promise<void> {
		const baseName = source?.basename ?? "draft";
		for (const draft of drafts) {
			await writeDraftNote(this.app, this.settings.outputFolder, draft.platformId, draft, baseName);
		}
	}

	/**
	 * Posts drafts to the user's publishing service.
	 *
	 * @param drafts - Drafts to deliver.
	 * @param source - The note the drafts were rewritten from.
	 */
	async sendToBridge(drafts: PlatformDraft[], source: TFile | null): Promise<BridgeResult | null> {
		const bridge = this.settings.bridge;
		if (!bridge.enabled) {
			new Notice("The publishing service is disabled in the plugin settings");
			return null;
		}
		if (!bridge.endpoint.trim()) {
			new Notice("No publishing endpoint is configured");
			return null;
		}

		const sourceInfo = {
			vaultName: this.app.vault.getName(),
			vaultPath: vaultBasePath(this.app),
			notePath: source?.path ?? "",
			noteTitle: source?.basename ?? "",
			raw: source ? await this.app.vault.cachedRead(source) : "",
		};

		const platforms = resolvePlatforms(
			drafts.map((draft) => draft.platformId),
			this.settings.platformOverrides,
		);

		const payload = buildBridgePayload({
			source: sourceInfo,
			drafts,
			platforms,
			includeSource: bridge.includeSource,
			publish: true,
			scheduleAt: null,
		});

		try {
			const result = await postToBridge(bridge, payload);
			if (result.ok) {
				new Notice(`Sent ${drafts.length} draft${drafts.length === 1 ? "" : "s"} to the publishing service`);
			} else {
				new Notice(`The publishing service responded with ${result.status}`);
			}
			return result;
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			return null;
		}
	}

	/** Sends a minimal payload to verify that the endpoint accepts requests. */
	async testBridge(): Promise<BridgeResult> {
		const bridge = this.settings.bridge;
		if (!bridge.endpoint.trim()) {
			throw new Error("No publishing endpoint is configured");
		}

		const payload = buildBridgePayload({
			source: {
				vaultName: this.app.vault.getName(),
				vaultPath: vaultBasePath(this.app),
				notePath: "",
				noteTitle: "",
				raw: "",
			},
			drafts: [],
			platforms: [],
			includeSource: false,
			publish: false,
			scheduleAt: null,
		});

		return postToBridge(bridge, payload);
	}

	/** Restarts the OpenCode runtime, for example after changing providers. */
	async restartRuntime(): Promise<void> {
		await this.runtime.shutdown();
		await this.runtime.ensureClient();
	}

	/** Looks for the OpenCode executable without starting the server. */
	async detect(): Promise<{ path: string | null; version?: string }> {
		const result = await this.runtime.detect();
		return { path: result.path, version: result.version };
	}
}
