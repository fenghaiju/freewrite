import type { ProviderProfile } from "../types";

/**
 * Translates freeWrite's provider profiles into OpenCode's own configuration
 * format.
 *
 * freeWrite does not talk to model providers directly. It writes the provider
 * definitions into the OpenCode config that the plugin passes to the server
 * through `OPENCODE_CONFIG_CONTENT`, and pushes credentials into OpenCode's own
 * auth store. Model requests therefore always originate from OpenCode.
 */

export interface OpenCodeProviderConfig {
	npm?: string;
	name: string;
	options?: Record<string, unknown>;
	models: Record<string, { name: string }>;
}

export interface OpenCodeConfig {
	$schema?: string;
	model?: string;
	provider?: Record<string, OpenCodeProviderConfig>;
	permission?: Record<string, unknown>;
}

/** Builds the OpenCode config object for the given provider profiles. */
export function buildOpenCodeConfig(
	profiles: ProviderProfile[],
	options: { defaultModel?: string; permissionMode?: "ask" | "auto" } = {},
): OpenCodeConfig {
	const provider: Record<string, OpenCodeProviderConfig> = {};

	for (const profile of profiles) {
		const id = profile.id.trim();
		if (!id) continue;

		const models: Record<string, { name: string }> = {};
		for (const model of profile.models) {
			const modelId = model.trim();
			if (!modelId) continue;
			models[modelId] = { name: modelId };
		}

		const providerOptions: Record<string, unknown> = { ...(profile.options ?? {}) };
		if (profile.baseUrl?.trim()) providerOptions.baseURL = profile.baseUrl.trim();

		const entry: OpenCodeProviderConfig = {
			name: profile.name.trim() || id,
			models,
		};
		if (profile.npm?.trim()) entry.npm = profile.npm.trim();
		if (Object.keys(providerOptions).length > 0) entry.options = providerOptions;

		provider[id] = entry;
	}

	const config: OpenCodeConfig = {};
	if (options.defaultModel?.trim()) config.model = options.defaultModel.trim();
	if (Object.keys(provider).length > 0) config.provider = provider;

	// Rewriting never needs to run shell commands or write files.
	config.permission = {
		bash: "deny",
		edit: "deny",
		write: "deny",
		patch: "deny",
		webfetch: options.permissionMode === "auto" ? "allow" : "ask",
	};

	return config;
}

/** Serialises the config for the `OPENCODE_CONFIG_CONTENT` environment variable. */
export function serializeOpenCodeConfig(config: OpenCodeConfig): string {
	return JSON.stringify(config);
}
