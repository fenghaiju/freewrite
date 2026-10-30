import { describe, expect, it, vi } from "vitest";
import { buildBridgePayload, guessMimeType, postToBridge } from "../src/publish/bridge";
import { formatDraftForClipboard } from "../src/publish/clipboard";
import { sanitiseFileName, draftToMarkdown, extractImageReferences } from "../src/storage/drafts";
import { DEFAULT_SETTINGS, type BridgeSettings } from "../src/settings";
import { findPlatform } from "../src/platforms/registry";
import type { PlatformDraft } from "../src/types";

const draft: PlatformDraft = {
	platformId: "zhihu",
	title: "一篇标题",
	body: "正文第一段。",
	tags: ["效率", "写作"],
	summary: "一句话摘要",
	durationMs: 1200,
	warnings: [],
	images: [
		{
			vaultPath: "assets/cover.png",
			absolutePath: "/vault/assets/cover.png",
			alt: "封面",
			bytes: 2048,
		},
	],
};

describe("formatDraftForClipboard", () => {
	it("puts the title, body and tags in order", () => {
		const text = formatDraftForClipboard(draft);
		expect(text).toContain("一篇标题");
		expect(text).toContain("正文第一段。");
		expect(text).toContain("#效率 #写作");
	});

	it("omits the tag line when there are no tags", () => {
		const text = formatDraftForClipboard({ ...draft, tags: [] });
		expect(text).not.toContain("#");
	});
});

describe("buildBridgePayload", () => {
	const platforms = [findPlatform("zhihu")!];

	it("builds a versioned payload", () => {
		const payload = buildBridgePayload({
			source: { vaultName: "V", vaultPath: "/v", notePath: "n.md", noteTitle: "n", raw: "body" },
			drafts: [draft],
			platforms,
			includeSource: true,
			publish: true,
			scheduleAt: null,
		});

		expect(payload.schema).toBe("freewrite/bridge@1");
		expect(payload.targets).toHaveLength(1);
		expect(payload.targets[0].platformId).toBe("zhihu");
		expect(payload.targets[0].title).toBe("一篇标题");
		expect(payload.targets[0].publishUrl).toContain("zhihu.com");
		expect(payload.targets[0].images[0].mimeType).toBe("image/png");
		expect(payload.options.publish).toBe(true);
	});

	it("drops the source body when it is not requested", () => {
		const payload = buildBridgePayload({
			source: { vaultName: "V", vaultPath: "/v", notePath: "n.md", noteTitle: "n", raw: "body" },
			drafts: [draft],
			platforms,
			includeSource: false,
			publish: false,
			scheduleAt: null,
		});
		expect(payload.source.raw).toBe("");
	});

	it("gives every task a unique id", () => {
		const source = { vaultName: "V", vaultPath: "", notePath: "", noteTitle: "", raw: "" };
		const first = buildBridgePayload({ source, drafts: [], platforms: [], includeSource: false, publish: false, scheduleAt: null });
		const second = buildBridgePayload({ source, drafts: [], platforms: [], includeSource: false, publish: false, scheduleAt: null });
		expect(first.taskId).not.toBe(second.taskId);
	});
});

describe("guessMimeType", () => {
	it("maps the common image extensions", () => {
		expect(guessMimeType("a.png")).toBe("image/png");
		expect(guessMimeType("a.jpg")).toBe("image/jpeg");
		expect(guessMimeType("a.jpeg")).toBe("image/jpeg");
		expect(guessMimeType("a.gif")).toBe("image/gif");
		expect(guessMimeType("a.webp")).toBe("image/webp");
		expect(guessMimeType("a.svg")).toBe("image/svg+xml");
	});

	it("falls back to a generic type", () => {
		expect(guessMimeType("a.bin")).toBe("application/octet-stream");
	});
});

describe("postToBridge", () => {
	const bridge: BridgeSettings = {
		...DEFAULT_SETTINGS.bridge,
		enabled: true,
		endpoint: "https://publisher.example.com/api/drafts",
		authHeader: "Authorization",
		authToken: "secret-token",
		timeoutMs: 5000,
	};

	const payload = buildBridgePayload({
		source: { vaultName: "V", vaultPath: "", notePath: "", noteTitle: "", raw: "" },
		drafts: [],
		platforms: [],
		includeSource: false,
		publish: false,
		scheduleAt: null,
	});

	it("posts the payload as JSON with a bearer token", async () => {
		const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
		const result = await postToBridge(bridge, payload, fetchImpl as unknown as typeof fetch);

		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);

		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://publisher.example.com/api/drafts");
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer secret-token");
		expect(JSON.parse(String(init.body)).schema).toBe("freewrite/bridge@1");
	});

	it("returns the response status when the endpoint rejects the request", async () => {
		const fetchImpl = vi.fn(async () => new Response("bad", { status: 422 }));
		const result = await postToBridge(bridge, payload, fetchImpl as unknown as typeof fetch);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(422);
		expect(result.body).toBe("bad");
	});

	it("sends no auth header when no token is set", async () => {
		const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
		await postToBridge({ ...bridge, authToken: "" }, payload, fetchImpl as unknown as typeof fetch);
		const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(Object.keys(init.headers as Record<string, string>)).not.toContain("Authorization");
	});

	it("throws when the endpoint is not configured", async () => {
		await expect(postToBridge({ ...bridge, endpoint: "" }, payload)).rejects.toThrow(/No publishing endpoint/);
	});

	it("throws when the endpoint is not a valid URL", async () => {
		await expect(postToBridge({ ...bridge, endpoint: "not a url" }, payload)).rejects.toThrow(/not a valid URL/);
	});
});

describe("draft notes", () => {
	it("writes the platform and the title into the frontmatter", () => {
		const markdown = draftToMarkdown(draft);
		expect(markdown).toContain("freewrite-platform: zhihu");
		expect(markdown).toContain("# 一篇标题");
		expect(markdown).toContain("#效率 #写作");
	});

	it("removes characters that are not allowed in a file name", () => {
		expect(sanitiseFileName("a/b:c*d?e")).not.toMatch(/[/:*?]/);
		expect(sanitiseFileName("   ")).toBe("draft");
	});
});

describe("extractImageReferences", () => {
	it("finds the images in a note", () => {
		const body = "文字 ![封面](assets/cover.png) 更多 ![](other.png)";
		const images = extractImageReferences(body);
		expect(images).toHaveLength(2);
		expect(images[0]).toEqual({ alt: "封面", target: "assets/cover.png" });
		expect(images[1].alt).toBe("");
	});

	it("returns nothing when there are no images", () => {
		expect(extractImageReferences("plain text")).toHaveLength(0);
	});
});
