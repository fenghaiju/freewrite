import { DEFAULT_PLATFORM_IDS } from "./platforms/registry";
import type { PlatformSpec, ProviderProfile, PublishChannel, PublishTrigger } from "./types";

/** Configuration for the user's own publishing service. */
export interface BridgeSettings {
	/** Master switch. When off, the plugin never contacts the endpoint. */
	enabled: boolean;
	/** Absolute URL of the publishing endpoint, e.g. `https://my.app/api/publish`. */
	endpoint: string;
	/** HTTP method used for the request. */
	method: "POST" | "PUT";
	/** Optional auth header name, e.g. `Authorization`. */
	authHeader: string;
	/** Optional auth header value. */
	authToken: string;
	/** Extra headers sent with every request. */
	extraHeaders: Record<string, string>;
	/** Request timeout in milliseconds. */
	timeoutMs: number;
	/** Send drafts as soon as they are generated. */
	trigger: PublishTrigger;
	/** Include the full source note in the payload. */
	includeSource: boolean;
}

export interface FreeWriteSettings {
	/** Path to the `opencode` executable. Empty means auto-detect on PATH. */
	opencodePath: string;
	/** Working directory handed to OpenCode. Empty means the vault root. */
	workingDirectory: string;
	/** Port for the local OpenCode server. 0 lets the plugin pick a free port. */
	serverPort: number;
	/** Model used for rewriting, in `provider/model` form. */
	defaultModel: string;
	/** OpenCode agent used for rewriting. */
	defaultAgent: string;
	/** Extra system prompt appended to every rewrite request. */
	systemPrompt: string;
	/** Provider profiles managed by the user. */
	providers: ProviderProfile[];
	/** Model ids reported by OpenCode, in `provider/model` form. */
	discoveredModels: string[];
	/** Platform ids the pipeline produces drafts for. */
	enabledPlatforms: string[];
	/** Which platform specs to use. Defaults to the built-in registry. */
	platformOverrides: PlatformSpec[];
	/** Where generated drafts are written inside the vault. */
	outputFolder: string;
	/** Copy the draft to the clipboard when a platform is published. */
	publishChannel: PublishChannel;
	/** Open the platform's compose page after publishing. */
	openPublishPage: boolean;
	/** Send drafts to the user's publishing service. */
	bridge: BridgeSettings;
	/** Ask OpenCode for permission before running tools. */
	permissionMode: "ask" | "auto";
}

export const DEFAULT_SETTINGS: FreeWriteSettings = {
	opencodePath: "",
	workingDirectory: "",
	serverPort: 0,
	defaultModel: "",
	defaultAgent: "build",
	systemPrompt: "",
	providers: [],
	discoveredModels: [],
	enabledPlatforms: DEFAULT_PLATFORM_IDS,
	platformOverrides: [],
	outputFolder: "freewrite",
	publishChannel: "clipboard",
	openPublishPage: true,
	bridge: {
		enabled: false,
		endpoint: "",
		method: "POST",
		authHeader: "Authorization",
		authToken: "",
		extraHeaders: {},
		timeoutMs: 30000,
		trigger: "manual",
		includeSource: true,
	},
	permissionMode: "ask",
};

export function mergeSettings(loaded: unknown): FreeWriteSettings {
	const raw = (loaded ?? {}) as Partial<FreeWriteSettings>;
	return {
		...DEFAULT_SETTINGS,
		...raw,
		providers: Array.isArray(raw.providers) ? raw.providers : [],
		discoveredModels: Array.isArray(raw.discoveredModels) ? raw.discoveredModels : [],
		enabledPlatforms: Array.isArray(raw.enabledPlatforms) ? raw.enabledPlatforms : DEFAULT_PLATFORM_IDS,
		platformOverrides: Array.isArray(raw.platformOverrides) ? raw.platformOverrides : [],
		bridge: {
			...DEFAULT_SETTINGS.bridge,
			...(raw.bridge ?? {}),
			extraHeaders: { ...(raw.bridge?.extraHeaders ?? {}) },
		},
	};
}
