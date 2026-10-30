import { Notice, type App } from "obsidian";
import { OpenCodeClient } from "./client";
import { discoverOpenCode, type DiscoveryResult } from "./discovery";
import { resolveWorkingDirectory, startServer, stopServer, type ServerHandle } from "./server";
import { buildOpenCodeConfig, serializeOpenCodeConfig } from "../providers/config";
import { vaultBasePath } from "../storage/vaultPath";
import type { FreeWriteSettings } from "../settings";

/**
 * Owns the OpenCode runtime for the plugin.
 *
 * A single headless `opencode serve` process is started lazily and reused for
 * every request. The provider configuration is injected through
 * `OPENCODE_CONFIG_CONTENT`, which OpenCode applies above the user's own
 * project and global config, so freeWrite never overwrites their files.
 */

export interface RuntimeStatus {
	/** True when a server process is running and healthy. */
	running: boolean;
	/** Base URL of the running server. */
	baseUrl?: string;
	/** Version reported by the OpenCode server. */
	version?: string;
	/** Result of the executable lookup. */
	discovery: DiscoveryResult;
	/** Last error message, if any. */
	error?: string;
}

export class RuntimeManager {
	private server: ServerHandle | null = null;
	private client: OpenCodeClient | null = null;
	private status: RuntimeStatus = {
		running: false,
		discovery: { path: null, source: "none" },
	};
	private starting: Promise<OpenCodeClient> | null = null;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => FreeWriteSettings,
	) {}

	/** Current runtime status. */
	getStatus(): RuntimeStatus {
		return { ...this.status };
	}

	/**
	 * Ensures the OpenCode server is running and returns a client.
	 *
	 * @throws when the executable is missing or the server cannot start.
	 */
	async ensureClient(): Promise<OpenCodeClient> {
		if (this.client) return this.client;
		if (this.starting) return this.starting;

		this.starting = this.start();
		try {
			return await this.starting;
		} finally {
			this.starting = null;
		}
	}

	private async start(): Promise<OpenCodeClient> {
		const settings = this.getSettings();
		const discovery = await discoverOpenCode(settings.opencodePath);

		if (!discovery.path) {
			this.status = {
				running: false,
				discovery,
				error:
					settings.opencodePath.trim().length > 0
						? `No executable found at ${settings.opencodePath}.`
						: "OpenCode was not found. Install it or set the executable path in the plugin settings.",
			};
			throw new Error(this.status.error);
		}

		const vaultRoot = vaultBasePath(this.app) || process.cwd();
		const cwd = resolveWorkingDirectory(settings.workingDirectory, vaultRoot);

		const config = buildOpenCodeConfig(settings.providers, {
			defaultModel: settings.defaultModel,
			permissionMode: settings.permissionMode,
		});

		try {
			this.server = await startServer({
				executable: discovery.path,
				cwd,
				port: settings.serverPort,
				env: {
					OPENCODE_CONFIG_CONTENT: serializeOpenCodeConfig(config),
				},
			});

			const client = new OpenCodeClient({ baseUrl: this.server.baseUrl });
			const health = await client.health();

			this.client = client;
			this.status = {
				running: true,
				baseUrl: this.server.baseUrl,
				version: health.version,
				discovery,
			};

			this.app.workspace.onLayoutReady(() => {
				new Notice(`freeWrite connected to OpenCode ${health.version}`);
			});

			return client;
		} catch (error) {
			await stopServer(this.server);
			this.server = null;
			this.client = null;
			const message = error instanceof Error ? error.message : String(error);
			this.status = { running: false, discovery, error: message };
			throw new Error(message);
		}
	}

	/**
	 * Pushes the configured provider credentials into OpenCode's own auth store.
	 *
	 * @returns The number of providers that were synced.
	 */
	async syncCredentials(): Promise<number> {
		const settings = this.getSettings();
		const client = await this.ensureClient();
		let synced = 0;

		for (const profile of settings.providers) {
			const key = profile.apiKey?.trim();
			if (!key) continue;
			await client.setAuth(profile.id.trim(), key);
			synced += 1;
		}

		return synced;
	}

	/**
	 * Reads the model list OpenCode exposes.
	 *
	 * OpenCode owns the model catalogue, so freeWrite asks it rather than
	 * keeping a copy of its own.
	 *
	 * @returns The model ids in `provider/model` form.
	 */
	async listModels(): Promise<string[]> {
		const client = await this.ensureClient();
		const providers = await client.listProviders();
		const models: string[] = [];

		for (const provider of providers) {
			for (const model of provider.models) {
				models.push(`${provider.id}/${model}`);
			}
		}

		return models;
	}

	/** Stops the server process. */
	async shutdown(): Promise<void> {
		await stopServer(this.server);
		this.server = null;
		this.client = null;
		this.status = { ...this.status, running: false, baseUrl: undefined };
	}

	/**
	 * Looks for the OpenCode executable without starting the server.
	 *
	 * @returns The path and version of the executable, when it was found.
	 */
	async detect(): Promise<{ path: string | null; version?: string }> {
		const discovery = await discoverOpenCode(this.getSettings().opencodePath);
		this.status = { ...this.status, discovery };
		return { path: discovery.path, version: discovery.version };
	}
}
