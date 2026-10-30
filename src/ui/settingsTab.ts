import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type FreeWritePlugin from "../main";
import { PLATFORMS } from "../platforms/registry";
import type { ProviderProfile } from "../types";

/**
 * Settings tab.
 *
 * Everything the user configures here stays local to their vault. API keys are
 * handed to OpenCode's own credential store and are never sent to a third
 * party by the plugin.
 */
export class FreeWriteSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: FreeWritePlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("freewrite-settings");

		this.renderRuntimeSection(containerEl);
		this.renderModelSection(containerEl);
		this.renderProviderSection(containerEl);
		this.renderPlatformSection(containerEl);
		this.renderOutputSection(containerEl);
		this.renderBridgeSection(containerEl);
		this.renderPrivacySection(containerEl);
	}

	private renderRuntimeSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("OpenCode").setHeading();

		const status = this.plugin.runtime.getStatus();
		const statusSetting = new Setting(containerEl)
			.setName("OpenCode status")
			.setDesc(status.running ? `Connected on ${status.baseUrl}` : "The OpenCode server is not running.");
		statusSetting.settingEl.addClass("freewrite-setting-status");

		new Setting(containerEl)
			.setName("OpenCode executable")
			.setDesc("Path to the opencode binary. Leave empty to detect it automatically.")
			.addText((text) =>
				text
					.setPlaceholder("opencode")
					.setValue(this.plugin.settings.opencodePath)
					.onChange(async (value) => {
						this.plugin.settings.opencodePath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Detect OpenCode")
			.setDesc("Look for the executable on the system path and in the usual install locations.")
			.addButton((button) =>
				button.setButtonText("Detect").onClick(async () => {
					const result = await this.plugin.runtime.detect();
					if (result.path) {
						this.plugin.settings.opencodePath = result.path;
						await this.plugin.saveSettings();
						new Notice(`Found OpenCode ${result.version ?? ""} at ${result.path}`);
					} else {
						new Notice("OpenCode was not found. Set the path manually.");
					}
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName("Working directory")
			.setDesc("Directory OpenCode runs in. Leave empty to use the vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Vault root")
					.setValue(this.plugin.settings.workingDirectory)
					.onChange(async (value) => {
						this.plugin.settings.workingDirectory = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Restart the runtime")
			.setDesc("Stop the OpenCode server and start it again, for example after changing providers.")
			.addButton((button) =>
				button.setButtonText("Restart").onClick(async () => {
					await this.plugin.restartRuntime();
					new Notice("The OpenCode runtime was restarted");
					this.display();
				}),
			);
	}

	private renderModelSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Model").setHeading();

		const models = this.plugin.settings.discoveredModels;
		const modelSetting = new Setting(containerEl)
			.setName("Default model")
			.setDesc("Model used for rewriting, in provider/model form. Leave empty to use the OpenCode default.");

		if (models.length > 0) {
			modelSetting.addDropdown((dropdown) => {
				dropdown.addOption("", "OpenCode default");
				for (const model of models) {
					dropdown.addOption(model, model);
				}
				dropdown.setValue(this.plugin.settings.defaultModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultModel = value;
					await this.plugin.saveSettings();
				});
			});
		} else {
			modelSetting.addText((text) =>
				text
					.setPlaceholder("anthropic/claude-sonnet-4-5")
					.setValue(this.plugin.settings.defaultModel)
					.onChange(async (value) => {
						this.plugin.settings.defaultModel = value.trim();
						await this.plugin.saveSettings();
					}),
			);
		}

		new Setting(containerEl)
			.setName("Load the model list")
			.setDesc("Ask OpenCode which models it exposes. OpenCode keeps the catalogue, so this is where it comes from.")
			.addButton((button) =>
				button.setButtonText("Load").onClick(async () => {
					try {
						const discovered = await this.plugin.runtime.listModels();
						this.plugin.settings.discoveredModels = discovered;
						await this.plugin.saveSettings();
						new Notice(`Loaded ${discovered.length} model${discovered.length === 1 ? "" : "s"} from OpenCode`);
					} catch (error) {
						new Notice(error instanceof Error ? error.message : String(error));
					}
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName("Agent")
			.setDesc("OpenCode agent used for the rewrite. The build agent can read files, the plan agent cannot.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("build", "Build")
					.addOption("plan", "Plan")
					.setValue(this.plugin.settings.defaultAgent)
					.onChange(async (value) => {
						this.plugin.settings.defaultAgent = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Extra system prompt")
			.setDesc("Appended to every rewrite request. Use it to set a house style or a target audience.")
			.addTextArea((text) =>
				text
					.setPlaceholder("For example: always keep the tone calm and factual.")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Allow web access")
			.setDesc("Let the model fetch web pages while rewriting. Off by default.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.permissionMode === "auto").onChange(async (value) => {
					this.plugin.settings.permissionMode = value ? "auto" : "ask";
					await this.plugin.saveSettings();
				}),
			);
	}

	private renderProviderSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Providers").setHeading();

		new Setting(containerEl)
			.setName("How providers work")
			.setDesc(
				"freeWrite writes these profiles into the OpenCode configuration it starts, and stores the API keys in OpenCode's own credential store. The plugin never calls a model provider itself.",
			);

		for (const [index, profile] of this.plugin.settings.providers.entries()) {
			this.renderProviderCard(containerEl, profile, index);
		}

		new Setting(containerEl).addButton((button) =>
			button
				.setButtonText("Add a provider")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.providers.push({
						id: "",
						name: "",
						models: [],
					});
					await this.plugin.saveSettings();
					this.display();
				}),
		);

		new Setting(containerEl)
			.setName("Sync credentials to OpenCode")
			.setDesc("Push the API keys of the providers above into OpenCode's credential store.")
			.addButton((button) =>
				button.setButtonText("Sync now").onClick(async () => {
					try {
						const count = await this.plugin.runtime.syncCredentials();
						new Notice(`Synced ${count} provider credential${count === 1 ? "" : "s"}`);
					} catch (error) {
						new Notice(error instanceof Error ? error.message : String(error));
					}
				}),
			);
	}

	private renderProviderCard(containerEl: HTMLElement, profile: ProviderProfile, index: number): void {
		const card = containerEl.createDiv({ cls: "freewrite-provider-card" });

		new Setting(card)
			.setName(`Provider ${index + 1}`)
			.setDesc("The provider id must match the id OpenCode uses, for example anthropic or openai.")
			.addText((text) =>
				text
					.setPlaceholder("anthropic")
					.setValue(profile.id)
					.onChange(async (value) => {
						profile.id = value.trim();
						await this.plugin.saveSettings();
					}),
			)
			.addText((text) =>
				text
					.setPlaceholder("Display name")
					.setValue(profile.name)
					.onChange(async (value) => {
						profile.name = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(card)
			.setName("Base URL")
			.setDesc("Endpoint of an OpenAI-compatible or proxy service. Leave empty for the default.")
			.addText((text) =>
				text
					.setPlaceholder("https://api.example.com/v1")
					.setValue(profile.baseUrl ?? "")
					.onChange(async (value) => {
						profile.baseUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(card)
			.setName("AI SDK package")
			.setDesc("Used for custom endpoints. For example @ai-sdk/openai-compatible.")
			.addText((text) =>
				text
					.setPlaceholder("@ai-sdk/openai-compatible")
					.setValue(profile.npm ?? "")
					.onChange(async (value) => {
						profile.npm = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(card)
			.setName("API key")
			.setDesc("Stored in OpenCode's credential store when you sync. Never sent anywhere else.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sk-…")
					.setValue(profile.apiKey ?? "")
					.onChange(async (value) => {
						profile.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(card)
			.setName("Models")
			.setDesc("Comma separated list of model ids, for example gpt-4o, gpt-4o-mini.")
			.addText((text) =>
				text
					.setPlaceholder("gpt-4o, gpt-4o-mini")
					.setValue(profile.models.join(", "))
					.onChange(async (value) => {
						profile.models = value
							.split(",")
							.map((item) => item.trim())
							.filter(Boolean);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(card)
			.setName("Remove")
			.addButton((button) =>
				button
					.setButtonText("Remove")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.providers.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}),
			);
	}

	private renderPlatformSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Platforms").setHeading();

		new Setting(containerEl)
			.setName("Target platforms")
			.setDesc("The platforms the rewrite pipeline produces drafts for.");

		for (const platform of PLATFORMS) {
			const enabled = this.plugin.settings.enabledPlatforms.includes(platform.id);
			new Setting(containerEl)
				.setName(platform.name)
				.setDesc(
					platform.titleLimit > 0
						? `Title up to ${platform.titleLimit} characters, body ${platform.bodyRange[0]}-${platform.bodyRange[1]} characters.`
						: `No title, body ${platform.bodyRange[0]}-${platform.bodyRange[1]} characters.`,
				)
				.addToggle((toggle) =>
					toggle.setValue(enabled).onChange(async (value) => {
						const current = new Set(this.plugin.settings.enabledPlatforms);
						if (value) current.add(platform.id);
						else current.delete(platform.id);
						this.plugin.settings.enabledPlatforms = Array.from(current);
						await this.plugin.saveSettings();
					}),
				);
		}
	}

	private renderOutputSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Output").setHeading();

		new Setting(containerEl)
			.setName("Draft folder")
			.setDesc("Folder inside the vault where the generated drafts are written.")
			.addText((text) =>
				text
					.setPlaceholder("freewrite")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value.trim() || "freewrite";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Publish to the clipboard")
			.setDesc("Put the finished draft on the clipboard and open the platform's own compose page.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.publishChannel !== "bridge").onChange(async (value) => {
					this.plugin.settings.publishChannel = value ? "clipboard" : "bridge";
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName("Open the compose page")
			.setDesc("Open the platform's editor in your browser after copying the draft.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.openPublishPage).onChange(async (value) => {
					this.plugin.settings.openPublishPage = value;
					await this.plugin.saveSettings();
				}),
			);
	}

	private renderBridgeSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Publishing service").setHeading();

		new Setting(containerEl)
			.setName("Use a publishing service")
			.setDesc(
				"Post the packaged drafts to your own endpoint. The plugin sends nothing when this is off. The endpoint is the only external service the plugin contacts.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.bridge.enabled).onChange(async (value) => {
					this.plugin.settings.bridge.enabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Endpoint")
			.setDesc("Full URL of the endpoint that receives the drafts.")
			.addText((text) =>
				text
					.setPlaceholder("https://your-app.example.com/api/publish")
					.setValue(this.plugin.settings.bridge.endpoint)
					.onChange(async (value) => {
						this.plugin.settings.bridge.endpoint = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Method")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("POST", "POST")
					.addOption("PUT", "PUT")
					.setValue(this.plugin.settings.bridge.method)
					.onChange(async (value) => {
						this.plugin.settings.bridge.method = value as "POST" | "PUT";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auth header")
			.setDesc("Header name and value sent with every request. Leave the value empty to send no header.")
			.addText((text) =>
				text
					.setPlaceholder("Authorization")
					.setValue(this.plugin.settings.bridge.authHeader)
					.onChange(async (value) => {
						this.plugin.settings.bridge.authHeader = value.trim() || "Authorization";
						await this.plugin.saveSettings();
					}),
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Token")
					.setValue(this.plugin.settings.bridge.authToken)
					.onChange(async (value) => {
						this.plugin.settings.bridge.authToken = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Timeout")
			.setDesc("How long to wait for a response, in milliseconds.")
			.addText((text) =>
				text
					.setPlaceholder("30000")
					.setValue(String(this.plugin.settings.bridge.timeoutMs))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value, 10);
						if (Number.isFinite(parsed) && parsed > 0) {
							this.plugin.settings.bridge.timeoutMs = parsed;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Send automatically")
			.setDesc("Post the drafts as soon as the rewrite finishes, instead of waiting for the publish button.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.bridge.trigger === "auto").onChange(async (value) => {
					this.plugin.settings.bridge.trigger = value ? "auto" : "manual";
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Include the source note")
			.setDesc("Send the original note body along with the drafts.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.bridge.includeSource).onChange(async (value) => {
					this.plugin.settings.bridge.includeSource = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Test the endpoint")
			.setDesc("Send a minimal payload to check that the endpoint accepts the request.")
			.addButton((button) =>
				button.setButtonText("Send test").onClick(async () => {
					try {
						const result = await this.plugin.testBridge();
						if (result.ok) {
							new Notice(`The endpoint responded with ${result.status}`);
						} else {
							new Notice(`The endpoint responded with ${result.status}: ${result.body.slice(0, 120)}`);
						}
					} catch (error) {
						new Notice(error instanceof Error ? error.message : String(error));
					}
				}),
			);
	}

	private renderPrivacySection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Privacy").setHeading();

		const note = containerEl.createDiv({ cls: "freewrite-privacy-note" });
		note.createEl("p", {
			text: "freeWrite makes no network requests on its own. It talks to the OpenCode server it starts on 127.0.0.1, and to the publishing endpoint you configure. Model requests are made by OpenCode, using the credentials stored in your own OpenCode profile.",
		});
	}
}
