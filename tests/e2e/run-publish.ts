/**
 * End-to-end check of the two publishing channels.
 *
 * The clipboard path is exercised against a stub of the browser APIs that
 * Obsidian provides, so the plugin's own code decides what ends up on the
 * clipboard and which compose page is opened.
 *
 * The bridge path is exercised against a real HTTP server, so the request the
 * plugin sends is inspected the way the user's publishing service would see it.
 *
 * Usage:
 *   npx vite-node tests/e2e/run-publish.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { AddressInfo } from "net";
import { formatDraftForClipboard, publishViaClipboard } from "../../src/publish/clipboard";
import { buildBridgePayload, postToBridge } from "../../src/publish/bridge";
import { DEFAULT_SETTINGS, type BridgeSettings } from "../../src/settings";
import { resolvePlatforms } from "../../src/platforms/registry";
import type { PlatformDraft } from "../../src/types";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = ""): void {
	checks.push({ name, ok, detail });
	console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` :: ${detail}` : ""}`);
}

const draft: PlatformDraft = {
	platformId: "zhihu",
	title: "一稿多平台的写作流程",
	body: "第一段。\n\n第二段。",
	tags: ["效率", "写作"],
	summary: "一句话摘要",
	durationMs: 4200,
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

async function checkClipboard(): Promise<void> {
	const copied: string[] = [];
	const opened: string[] = [];

	// The browser APIs the plugin uses inside the Obsidian window.
	(globalThis as unknown as { navigator: unknown }).navigator = {
		clipboard: {
			writeText: async (text: string) => {
				copied.push(text);
			},
		},
	};
	(globalThis as unknown as { window: unknown }).window = {
		open: (url: string) => {
			opened.push(url);
			return null;
		},
	};

	const text = formatDraftForClipboard(draft);
	check(
		"the clipboard text holds the title, the body and the tags",
		text.startsWith(draft.title) && text.includes(draft.body) && text.includes("#效率 #写作"),
		JSON.stringify(text),
	);

	const platform = resolvePlatforms([draft.platformId])[0];
	const ok = await publishViaClipboard(draft, platform.publishUrl, true);
	check("publishViaClipboard reports success", ok === true);
	check("the draft reached the clipboard", copied.length === 1 && copied[0] === text);
	check(
		"the compose page of the platform was opened",
		opened.length === 1 && opened[0] === platform.publishUrl,
		opened[0],
	);

	// Without the compose page the draft is still copied.
	const second = await publishViaClipboard(draft, platform.publishUrl, false);
	check("the draft is copied without opening a page", second === true && copied.length === 2);
	check("no second page was opened", opened.length === 1);

	// A window without clipboard access is reported as a failure.
	(globalThis as unknown as { navigator: unknown }).navigator = {
		clipboard: {
			writeText: async () => {
				throw new Error("clipboard blocked");
			},
		},
	};
	const failed = await publishViaClipboard(draft, platform.publishUrl, false);
	check("a blocked clipboard is reported as a failure", failed === false);
}

interface Received {
	method: string;
	url: string;
	headers: IncomingMessage["headers"];
	body: string;
}

async function checkBridge(): Promise<void> {
	const received: Received[] = [];

	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			received.push({
				method: req.method ?? "",
				url: req.url ?? "",
				headers: req.headers,
				body: Buffer.concat(chunks).toString("utf8"),
			});
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ accepted: true }));
		});
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as AddressInfo).port;
	const endpoint = `http://127.0.0.1:${port}/api/publish`;

	const bridge: BridgeSettings = {
		...DEFAULT_SETTINGS.bridge,
		enabled: true,
		endpoint,
		method: "POST",
		authHeader: "Authorization",
		authToken: "secret-token",
		extraHeaders: { "x-freewrite": "e2e" },
		timeoutMs: 5000,
	};

	const platforms = resolvePlatforms([draft.platformId]);
	const payload = buildBridgePayload({
		source: {
			vaultName: "Vault",
			vaultPath: "/vault",
			notePath: "notes/source.md",
			noteTitle: "source",
			raw: "原文内容",
		},
		drafts: [draft],
		platforms,
		includeSource: true,
		publish: true,
		scheduleAt: null,
	});

	const result = await postToBridge(bridge, payload);
	check("the publishing service accepted the request", result.ok === true, `status ${result.status}`);

	const request = received[0];
	check("exactly one request was sent", received.length === 1);
	check("the request used the configured method and path", request.method === "POST" && request.url === "/api/publish", `${request.method} ${request.url}`);
	check(
		"the auth header carries a bearer token",
		request.headers.authorization === "Bearer secret-token",
		String(request.headers.authorization),
	);
	check("the extra headers are sent", request.headers["x-freewrite"] === "e2e");
	check("the body is JSON", request.headers["content-type"]?.includes("application/json") === true);

	const body = JSON.parse(request.body);
	check("the payload carries the versioned schema", body.schema === "freewrite/bridge@1", body.schema);
	check("the payload names the task", typeof body.taskId === "string" && body.taskId.startsWith("fw_"), body.taskId);
	check("the payload holds the source", body.source.notePath === "notes/source.md" && body.source.raw === "原文内容");
	check("the payload holds one target", body.targets.length === 1 && body.targets[0].platformId === "zhihu");
	check("the target carries the draft", body.targets[0].title === draft.title && body.targets[0].body === draft.body);
	check("the target carries the tags", body.targets[0].tags.join(",") === "效率,写作");
	check("the target carries the image metadata", body.targets[0].images[0].mimeType === "image/png" && body.targets[0].images[0].bytes === 2048);
	check("the payload asks for an immediate publish", body.options.publish === true && body.options.scheduleAt === null);

	// A service that rejects the request reports the status.
	const rejecting = createServer((_req: IncomingMessage, res: ServerResponse) => {
		res.writeHead(422, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: "unsupported platform" }));
	});
	await new Promise<void>((resolve) => rejecting.listen(0, "127.0.0.1", resolve));
	const rejectPort = (rejecting.address() as AddressInfo).port;
	const rejected = await postToBridge({ ...bridge, endpoint: `http://127.0.0.1:${rejectPort}/api/publish` }, payload);
	check(
		"a rejected request reports the status of the service",
		rejected.ok === false && rejected.status === 422,
		`status ${rejected.status}`,
	);
	rejecting.close();

	// A service that never answers hits the timeout.
	const hanging = createServer(() => {
		/* never responds */
	});
	await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
	const hangPort = (hanging.address() as AddressInfo).port;
	let timedOut = "";
	try {
		await postToBridge({ ...bridge, endpoint: `http://127.0.0.1:${hangPort}/api/publish`, timeoutMs: 800 }, payload);
	} catch (error) {
		timedOut = error instanceof Error ? error.message : String(error);
	}
	check("a silent service hits the timeout", timedOut.includes("did not respond within 800ms"), timedOut);
	hanging.close();

	// The endpoint is optional, so an empty one is reported instead of sent.
	let missing = "";
	try {
		await postToBridge({ ...bridge, endpoint: "  " }, payload);
	} catch (error) {
		missing = error instanceof Error ? error.message : String(error);
	}
	check("an unconfigured endpoint is reported", missing.includes("No publishing endpoint"), missing);

	server.close();
}

async function main(): Promise<void> {
	await checkClipboard();
	await checkBridge();

	const failed = checks.filter((c) => !c.ok);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
	if (failed.length > 0) {
		console.log("failed checks:");
		for (const item of failed) console.log(` - ${item.name} :: ${item.detail}`);
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error("e2e run failed:", error);
	process.exitCode = 1;
});
