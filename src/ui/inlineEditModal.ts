import { Modal, Notice, type App, type Editor } from "obsidian";
import type FreeWritePlugin from "../main";
import { buildSystemPrompt, buildUserPrompt, parseDraft } from "../orchestration/prompts";
import { PLATFORMS } from "../platforms/registry";
import type { PlatformSpec } from "../types";

/**
 * Inline rewriting of the current selection.
 *
 * The proposed replacement is shown in a preview so the user can accept or
 * discard it before anything in the note changes.
 */
export class InlineEditModal extends Modal {
	private result = "";
	private running = false;
	private platform: PlatformSpec;

	constructor(
		app: App,
		private readonly plugin: FreeWritePlugin,
		private readonly editor: Editor,
		private readonly selection: string,
	) {
		super(app);
		this.platform = PLATFORMS[0];
	}

	override onOpen(): void {
		this.modalEl.addClass("freewrite-inline-modal");
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Rewrite selection" });

		const original = contentEl.createDiv({ cls: "freewrite-inline-original" });
		original.createEl("h4", { text: "Original" });
		original.createDiv({ cls: "freewrite-inline-text", text: this.selection });

		const options = contentEl.createDiv({ cls: "freewrite-inline-options" });
		const select = options.createEl("select", { cls: "dropdown" });
		for (const platform of PLATFORMS) {
			const option = select.createEl("option", { value: platform.id, text: platform.name });
			if (platform.id === this.platform.id) option.selected = true;
		}
		select.addEventListener("change", () => {
			const found = PLATFORMS.find((platform) => platform.id === select.value);
			if (found) this.platform = found;
		});

		const instructions = contentEl.createDiv({ cls: "freewrite-inline-instructions" });
		instructions.createEl("label", { text: "Instructions (optional)" });
		const textarea = instructions.createEl("textarea", { cls: "freewrite-inline-textarea" });
		textarea.placeholder = "For example: make it shorter and more formal.";

		const preview = contentEl.createDiv({ cls: "freewrite-inline-preview" });
		preview.createEl("h4", { text: "Result" });
		const previewText = preview.createDiv({ cls: "freewrite-inline-text" });
		previewText.setText("Press Rewrite to generate a result.");

		const actions = contentEl.createDiv({ cls: "freewrite-inline-actions" });

		const rewrite = actions.createEl("button", { cls: "freewrite-button mod-cta" });
		rewrite.setText("Rewrite");
		rewrite.addEventListener("click", () => void this.run(textarea.value, previewText, rewrite));

		const apply = actions.createEl("button", { cls: "freewrite-button" });
		apply.setText("Apply");
		apply.disabled = true;
		apply.addEventListener("click", () => this.apply());

		const cancel = actions.createEl("button", { cls: "freewrite-button" });
		cancel.setText("Cancel");
		cancel.addEventListener("click", () => this.close());
	}

	private async run(instructions: string, previewText: HTMLElement, button: HTMLElement): Promise<void> {
		if (this.running) return;
		this.running = true;
		button.setText("Rewriting…");
		previewText.setText("");

		try {
			const client = await this.plugin.runtime.ensureClient();
			const sessionId = await client.createSession("freeWrite inline rewrite");
			const settings = this.plugin.settings;

			const system = buildSystemPrompt({
				source: this.selection,
				sourceTitle: "",
				platform: this.platform,
				systemPrompt: settings.systemPrompt,
			});
			const user = buildUserPrompt({
				source: this.selection,
				sourceTitle: "",
				platform: this.platform,
				extraInstructions: instructions,
			});

			let text = "";
			const stream = client.prompt(sessionId, user, {
				model: settings.defaultModel || undefined,
				agent: settings.defaultAgent || undefined,
				system,
			});

			let result = await stream.next();
			while (!result.done) {
				if (result.value.type === "text") {
					text += result.value.text;
					previewText.setText(text);
				}
				result = await stream.next();
			}

			const finalText = result.value.text || text;
			const parsed = parseDraft(finalText);
			this.result = parsed?.body ?? finalText.trim();
			previewText.setText(this.result);

			const applyButton = this.modalEl.querySelector<HTMLButtonElement>(
				".freewrite-inline-actions button:nth-child(2)",
			);
			if (applyButton) applyButton.disabled = this.result.length === 0;
		} catch (error) {
			previewText.setText("");
			new Notice(error instanceof Error ? error.message : String(error));
		} finally {
			this.running = false;
			button.setText("Rewrite");
		}
	}

	private apply(): void {
		if (!this.result) return;
		this.editor.replaceSelection(this.result);
		this.close();
		new Notice("Selection rewritten");
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
