import type { BridgePayload, BridgeResult, BridgeSource, BridgeTarget, PlatformDraft } from "../types";
import type { BridgeSettings } from "../settings";
import type { PlatformSpec } from "../types";

/**
 * Delivery to the user's own publishing service.
 *
 * freeWrite packages every generated draft into a single JSON document and
 * posts it to an endpoint the user configures. The endpoint is the user's own
 * infrastructure: the plugin has no opinion about what runs behind it, and the
 * request is the only network call the plugin makes to anything other than the
 * local OpenCode server.
 *
 * The payload schema is versioned (`freewrite/bridge@1`) so the user's service
 * can detect and adapt to changes.
 */

export interface BridgeBuildInput {
	source: BridgeSource;
	drafts: PlatformDraft[];
	platforms: PlatformSpec[];
	includeSource: boolean;
	publish: boolean;
	scheduleAt: string | null;
}

/** Builds the payload sent to the publishing service. */
export function buildBridgePayload(input: BridgeBuildInput): BridgePayload {
	const platformMap = new Map(input.platforms.map((platform) => [platform.id, platform]));

	const targets: BridgeTarget[] = input.drafts.map((draft) => {
		const platform = platformMap.get(draft.platformId);
		return {
			platformId: draft.platformId,
			platformName: platform?.name ?? draft.platformId,
			title: draft.title,
			body: draft.body,
			tags: draft.tags,
			summary: draft.summary,
			publishUrl: platform?.publishUrl ?? "",
			images: draft.images.map((image) => ({
				name: image.vaultPath.split("/").pop() ?? image.vaultPath,
				vaultPath: image.vaultPath,
				absolutePath: image.absolutePath,
				mimeType: guessMimeType(image.vaultPath),
				bytes: image.bytes,
			})),
		};
	});

	return {
		schema: "freewrite/bridge@1",
		taskId: createTaskId(),
		createdAt: new Date().toISOString(),
		source: input.includeSource
			? input.source
			: { ...input.source, raw: "" },
		targets,
		options: {
			publish: input.publish,
			scheduleAt: input.scheduleAt,
		},
	};
}

/** Creates a unique identifier for a publishing task. */
export function createTaskId(): string {
	const random = Math.random().toString(36).slice(2, 10);
	return `fw_${Date.now().toString(36)}_${random}`;
}

/** Guesses a MIME type from a file extension. */
export function guessMimeType(filePath: string): string {
	const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
	switch (extension) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "svg":
			return "image/svg+xml";
		case "avif":
			return "image/avif";
		case "bmp":
			return "image/bmp";
		default:
			return "application/octet-stream";
	}
}

/**
 * Posts a payload to the user's publishing endpoint.
 *
 * @throws when the endpoint is not configured or the request fails.
 */
export async function postToBridge(
	settings: BridgeSettings,
	payload: BridgePayload,
	fetchImpl: typeof fetch = fetch,
): Promise<BridgeResult> {
	const endpoint = settings.endpoint.trim();
	if (!endpoint) {
		throw new Error("No publishing endpoint is configured.");
	}

	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new Error(`The publishing endpoint is not a valid URL: ${endpoint}`);
	}

	const headers: Record<string, string> = {
		"content-type": "application/json",
		...settings.extraHeaders,
	};

	const token = settings.authToken.trim();
	if (token) {
		const headerName = settings.authHeader.trim() || "Authorization";
		headers[headerName] = headerName.toLowerCase() === "authorization" && !token.toLowerCase().startsWith("bearer ") && !token.toLowerCase().startsWith("basic ")
			? `Bearer ${token}`
			: token;
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), settings.timeoutMs);

	try {
		const response = await fetchImpl(url.toString(), {
			method: settings.method,
			headers,
			body: JSON.stringify(payload),
			signal: controller.signal,
		});
		const body = await response.text().catch(() => "");
		return { ok: response.ok, status: response.status, body };
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(`The publishing endpoint did not respond within ${settings.timeoutMs}ms.`);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
