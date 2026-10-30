import { describe, expect, it } from "vitest";
import { buildOpenCodeConfig } from "../src/providers/config";
import { mergeSettings, DEFAULT_SETTINGS } from "../src/settings";
import type { ProviderProfile } from "../src/types";

const profiles: ProviderProfile[] = [
	{
		id: "my-proxy",
		name: "My Proxy",
		npm: "@ai-sdk/openai-compatible",
		baseUrl: "https://proxy.example.com/v1",
		models: ["model-a", "model-b"],
		options: { timeout: 60000 },
	},
	{
		id: "anthropic",
		name: "Anthropic",
		models: ["claude-sonnet-4-5"],
	},
];

describe("buildOpenCodeConfig", () => {
	it("writes the provider definitions OpenCode expects", () => {
		const config = buildOpenCodeConfig(profiles);
		const provider = config.provider!["my-proxy"];
		expect(provider.npm).toBe("@ai-sdk/openai-compatible");
		expect(provider.name).toBe("My Proxy");
		expect(provider.options?.baseURL).toBe("https://proxy.example.com/v1");
		expect(provider.options?.timeout).toBe(60000);
		expect(Object.keys(provider.models)).toEqual(["model-a", "model-b"]);
	});

	it("sets the default model when one is given", () => {
		const config = buildOpenCodeConfig(profiles, { defaultModel: "my-proxy/model-a" });
		expect(config.model).toBe("my-proxy/model-a");
	});

	it("omits the model when none is configured", () => {
		const config = buildOpenCodeConfig(profiles);
		expect(config.model).toBeUndefined();
	});

	it("denies the tools a rewrite must not use", () => {
		const config = buildOpenCodeConfig(profiles);
		expect(config.permission).toMatchObject({
			bash: "deny",
			edit: "deny",
			write: "deny",
			patch: "deny",
		});
	});

	it("asks before fetching web pages by default and allows it on request", () => {
		expect(buildOpenCodeConfig(profiles).permission?.webfetch).toBe("ask");
		expect(buildOpenCodeConfig(profiles, { permissionMode: "auto" }).permission?.webfetch).toBe("allow");
	});

	it("skips profiles without an id", () => {
		const config = buildOpenCodeConfig([{ id: "  ", name: "Broken", models: ["x"] }]);
		expect(config.provider).toBeUndefined();
	});

	it("ignores empty model ids", () => {
		const config = buildOpenCodeConfig([{ id: "p", name: "P", models: ["a", "  ", "b"] }]);
		expect(Object.keys(config.provider!["p"].models)).toEqual(["a", "b"]);
	});
});

describe("mergeSettings", () => {
	it("returns the defaults when nothing is stored", () => {
		expect(mergeSettings(null).defaultAgent).toBe(DEFAULT_SETTINGS.defaultAgent);
	});

	it("keeps stored values", () => {
		const settings = mergeSettings({ defaultModel: "openai/gpt-4o", outputFolder: "out" });
		expect(settings.defaultModel).toBe("openai/gpt-4o");
		expect(settings.outputFolder).toBe("out");
	});

	it("repairs malformed collections", () => {
		const settings = mergeSettings({ providers: "nope", enabledPlatforms: 42 });
		expect(settings.providers).toEqual([]);
		expect(settings.enabledPlatforms).toEqual(DEFAULT_SETTINGS.enabledPlatforms);
	});

	it("repairs the discovered model list", () => {
		expect(mergeSettings({ discoveredModels: "nope" }).discoveredModels).toEqual([]);
		expect(mergeSettings({ discoveredModels: ["a/b"] }).discoveredModels).toEqual(["a/b"]);
	});

	it("merges the bridge settings with the defaults", () => {
		const settings = mergeSettings({ bridge: { enabled: true } });
		expect(settings.bridge.enabled).toBe(true);
		expect(settings.bridge.method).toBe("POST");
		expect(settings.bridge.timeoutMs).toBe(30000);
	});

	it("keeps the bridge headers", () => {
		const settings = mergeSettings({ bridge: { extraHeaders: { "X-Token": "abc" } } });
		expect(settings.bridge.extraHeaders["X-Token"]).toBe("abc");
	});
});
