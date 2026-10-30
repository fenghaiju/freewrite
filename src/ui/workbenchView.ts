import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type FreeWritePlugin from "../main";
import type { PlatformDraft, PlatformSpec } from "../types";
import { allPlatformIds, platformName, resolvePlatforms } from "../platforms/registry";
import { resolveImages } from "../storage/drafts";
import { runPipeline, type PlatformProgress } from "../orchestration/pipeline";

export const WORKBENCH_VIEW_TYPE = "freewrite-workbench";

/**
 * The main freeWrite panel.
 *
 * A source note is loaded on the left, the target platforms are picked in the
 * middle, and the generated drafts appear on the right with per-platform
 * publishing actions.
 */
export class WorkbenchView extends ItemView {
	private sourceFile: TFile | null = null;
	private sourceBody = "";
	private platforms: PlatformSpec[] = [];
	private drafts: PlatformDraft[] = [];
	private progress: PlatformProgress[] = [];
	private running = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: FreeWritePlugin,
	) {
		super(leaf);
	}

	override getViewType(): string {
		return WORKBENCH_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "freeWrite";
	}

	override getIcon(): string {
		return "pen-line";
	}

	override async onOpen(): Promise<void> {
		this.render();
	}

	override async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Loads a note as the rewrite source. */
	async loadSource(file: TFile): Promise<void> {
		this.sourceFile = file;
		this.sourceBody = await this.plugin.app.vault.cachedRead(file);
		this.drafts = [];
		this.progress = [];
		this.render();
	}

	/** Rebuilds the whole panel. */
	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("freewrite-workbench");

		this.renderHeader(container);
		this.renderSourceSection(container);
		this.renderPlatformSection(container);
		this.renderDraftSection(container);
	}

	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: "freewrite-header" });
		const title = header.createDiv({ cls: "freewrite-header-title" });
		title.createEl("h3", { text: "freeWrite" });

		const status = this.plugin.runtime.getStatus();
		const badge = header.createDiv({ cls: `freewrite-status freewrite-status-${status.running ? "on" : "off"}` });
		badge.setText(status.running ? `OpenCode ${status.version ?? "ready"}` : "OpenCode not running");

		const actions = header.createDiv({ cls: "freewrite-header-actions" });
		const settingsButton = actions.createEl("button", {
			cls: "freewrite-icon-button",
			attr: { "aria-label": "Open settings" },
		});
		setIcon(settingsButton, "settings");
		settingsButton.addEventListener("click", () => {
			void (this.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting.open();
			void (this.app as unknown as { setting: { openTabById(id: string): void } }).setting.openTabById(
				"freewrite",
			);
		});
	}

	private renderSourceSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: "freewrite-section" });
		section.createEl("h4", { text: "Source" });

		if (!this.sourceFile) {
			const empty = section.createDiv({ cls: "freewrite-empty" });
			empty.setText("Open a note and run “Rewrite for platforms” to use it as the source.");
			return;
		}

		const file = this.sourceFile;
		const meta = section.createDiv({ cls: "freewrite-source-meta" });
		meta.createSpan({ cls: "freewrite-source-name", text: file.basename });
		meta.createSpan({ cls: "freewrite-source-size", text: `${this.sourceBody.length} characters` });

		const actions = section.createDiv({ cls: "freewrite-source-actions" });
		const rewrite = actions.createEl("button", { cls: "freewrite-button mod-cta" });
		rewrite.setText(this.running ? "Rewriting…" : "Rewrite for platforms");
		rewrite.disabled = this.running;
		rewrite.addEventListener("click", () => void this.startRewrite());

		const clear = actions.createEl("button", { cls: "freewrite-button" });
		clear.setText("Clear");
		clear.addEventListener("click", () => {
			this.sourceFile = null;
			this.sourceBody = "";
			this.drafts = [];
			this.render();
		});
	}

	private renderPlatformSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: "freewrite-section" });
		section.createEl("h4", { text: "Platforms" });

		const settings = this.plugin.settings;
		const all = resolvePlatforms(
			allPlatformIds(settings.platformOverrides),
			settings.platformOverrides,
		);
		this.platforms = resolvePlatforms(settings.enabledPlatforms, settings.platformOverrides);

		const list = section.createDiv({ cls: "freewrite-platform-list" });
		for (const platform of all) {
			const enabled = settings.enabledPlatforms.includes(platform.id);
			const row = list.createDiv({ cls: `freewrite-platform-row${enabled ? " is-enabled" : ""}` });

			const checkbox = row.createEl("input", { type: "checkbox" });
			checkbox.checked = enabled;
			checkbox.addEventListener("change", () => {
				const current = new Set(this.plugin.settings.enabledPlatforms);
				if (checkbox.checked) current.add(platform.id);
				else current.delete(platform.id);
				this.plugin.settings.enabledPlatforms = Array.from(current);
				void this.plugin.saveSettings();
			});

			const label = row.createDiv({ cls: "freewrite-platform-label" });
			label.createSpan({ cls: "freewrite-platform-name", text: platform.name });
			label.createSpan({
				cls: "freewrite-platform-hint",
				text: platform.titleLimit > 0 ? `title ≤ ${platform.titleLimit}` : "no title",
			});
		}
	}

	private renderDraftSection(container: HTMLElement): void {
		const section = container.createDiv({ cls: "freewrite-section" });
		section.createEl("h4", { text: "Drafts" });

		if (this.progress.length > 0) {
			const progressList = section.createDiv({ cls: "freewrite-progress" });
			for (const item of this.progress) {
				const row = progressList.createDiv({ cls: `freewrite-progress-row is-${item.status}` });
				row.createSpan({ cls: "freewrite-progress-name", text: item.platform.name });
				row.createSpan({ cls: "freewrite-progress-status", text: statusLabel(item.status) });
			}
		}

		if (this.drafts.length === 0) {
			if (this.progress.length === 0) {
				const empty = section.createDiv({ cls: "freewrite-empty" });
				empty.setText("No drafts yet.");
			}
			return;
		}

		for (const draft of this.drafts) {
			this.renderDraft(section, draft);
		}
	}

	private renderDraft(section: HTMLElement, draft: PlatformDraft): void {
		const card = section.createDiv({ cls: "freewrite-draft" });

		const head = card.createDiv({ cls: "freewrite-draft-head" });
		head.createSpan({
			cls: "freewrite-draft-platform",
			text: platformName(draft.platformId, this.plugin.settings.platformOverrides),
		});
		head.createSpan({ cls: "freewrite-draft-time", text: `${(draft.durationMs / 1000).toFixed(1)}s` });

		card.createDiv({ cls: "freewrite-draft-title", text: draft.title || "(untitled)" });

		const body = card.createDiv({ cls: "freewrite-draft-body" });
		body.setText(draft.body.length > 600 ? `${draft.body.slice(0, 600)}…` : draft.body);

		if (draft.tags.length > 0) {
			const tags = card.createDiv({ cls: "freewrite-draft-tags" });
			for (const tag of draft.tags) {
				tags.createSpan({ cls: "freewrite-tag", text: `#${tag}` });
			}
		}

		if (draft.warnings.length > 0) {
			const warnings = card.createDiv({ cls: "freewrite-warnings" });
			for (const warning of draft.warnings) {
				warnings.createDiv({ cls: "freewrite-warning", text: warning });
			}
		}

		const actions = card.createDiv({ cls: "freewrite-draft-actions" });
		const copy = actions.createEl("button", { cls: "freewrite-button" });
		copy.setText("Copy");
		copy.addEventListener("click", () => void this.copyDraft(draft));

		const publish = actions.createEl("button", { cls: "freewrite-button mod-cta" });
		publish.setText("Publish");
		publish.addEventListener("click", () => void this.publishDraft(draft));
	}

	private async copyDraft(draft: PlatformDraft): Promise<void> {
		const { formatDraftForClipboard, copyToClipboard } = await import("../publish/clipboard");
		const ok = await copyToClipboard(formatDraftForClipboard(draft));
		new Notice(ok ? "Draft copied to the clipboard" : "Could not access the clipboard");
	}

	private async publishDraft(draft: PlatformDraft): Promise<void> {
		const settings = this.plugin.settings;
		const platform = resolvePlatforms([draft.platformId], settings.platformOverrides)[0];
		if (!platform) {
			new Notice("Unknown platform");
			return;
		}

		if (settings.publishChannel === "clipboard" || settings.publishChannel === "both") {
			const { publishViaClipboard } = await import("../publish/clipboard");
			const ok = await publishViaClipboard(draft, platform.publishUrl, settings.openPublishPage);
			if (ok) {
				new Notice(`Draft copied for ${platform.name}${settings.openPublishPage ? " and the compose page opened" : ""}`);
			}
		}

		if (settings.publishChannel === "bridge" || settings.publishChannel === "both") {
			await this.plugin.sendToBridge([draft], this.sourceFile);
		}
	}

	/** Runs the rewrite pipeline for the loaded source note. */
	private async startRewrite(): Promise<void> {
		if (!this.sourceFile || this.running) return;
		if (this.platforms.length === 0) {
			new Notice("Select at least one platform first");
			return;
		}

		this.running = true;
		this.drafts = [];
		this.progress = this.platforms.map((platform) => ({ platform, status: "pending" }));
		this.render();

		try {
			const client = await this.plugin.runtime.ensureClient();
			const sessionId = await client.createSession(this.sourceFile?.basename ?? "freeWrite");
			const settings = this.plugin.settings;
			const images = await resolveImages(this.plugin.app, this.sourceFile?.path ?? "", this.sourceBody);

			const drafts = await runPipeline(
				client,
				sessionId,
				{
					source: this.sourceBody,
					sourceTitle: this.sourceFile?.basename ?? "",
					platforms: this.platforms,
					model: settings.defaultModel || undefined,
					agent: settings.defaultAgent || undefined,
					systemPrompt: settings.systemPrompt,
					images,
				},
				{
					onPlatformStart: (platform) => {
						this.setProgress(platform.id, "running");
					},
					onPlatformDone: (draft) => {
						this.drafts.push(draft);
						this.setProgress(draft.platformId, "done");
					},
					onPlatformError: (platform, error) => {
						this.setProgress(platform.id, "error");
						new Notice(`${platform.name}: ${error}`);
					},
				},
			);

			this.drafts = drafts;

			if (drafts.length > 0) {
				await this.plugin.saveDrafts(drafts, this.sourceFile);
				if (settings.bridge.enabled && settings.bridge.trigger === "auto") {
					await this.plugin.sendToBridge(drafts, this.sourceFile);
				}
			}
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			this.running = false;
			this.render();
		}
	}

	private setProgress(platformId: string, status: PlatformProgress["status"]): void {
		const item = this.progress.find((entry) => entry.platform.id === platformId);
		if (item) item.status = status;
		this.render();
	}
}

function statusLabel(status: PlatformProgress["status"]): string {
	switch (status) {
		case "pending":
			return "waiting";
		case "running":
			return "running";
		case "done":
			return "done";
		case "error":
			return "failed";
		default:
			return status;
	}
}
