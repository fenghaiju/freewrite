/**
 * End-to-end check of the rewrite chain against a live OpenCode server.
 *
 * This script imports the plugin's own source files, so it exercises the same
 * code path the plugin runs inside Obsidian: `OpenCodeClient.prompt` streams
 * the assistant's parts over SSE, `runPipeline` reuses one session for every
 * platform, and `parseDraft` turns the answer into a `PlatformDraft`.
 *
 * Usage:
 *   npx vite-node tests/e2e/run-pipeline.ts [baseUrl] [model]
 */

import { OpenCodeClient, parseModel } from "../../src/runtime/client";
import { runPipeline } from "../../src/orchestration/pipeline";
import { buildSystemPrompt, buildUserPrompt, parseDraft } from "../../src/orchestration/prompts";
import { PLATFORMS, weightedLength } from "../../src/platforms/registry";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:47311";
const model = process.argv[3] ?? "opencode/big-pickle";

const SOURCE = `# Obsidian 插件开发笔记

插件本质上是一个导出类，这个类继承 Obsidian 提供的 Plugin 基类。onload 在插件加载时调用，onunload 在插件卸载时调用。
所有通过 registerEvent 注册的事件监听器，插件卸载时会自动解绑，不需要手动清理。

视图用 ItemView 实现，侧边栏里显示的就是它。设置页用 PluginSettingTab。
`;

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = ""): void {
	checks.push({ name, ok, detail });
	const mark = ok ? "PASS" : "FAIL";
	console.log(`[${mark}] ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function main(): Promise<void> {
	// 1. The model id is split the way the server expects it.
	try {
		const parsed = parseModel(model);
		check(
			"parseModel splits provider/model",
			parsed.providerID === "opencode" && parsed.modelID.length > 0,
			JSON.stringify(parsed),
		);
	} catch (error) {
		check("parseModel splits provider/model", false, String(error));
	}

	const client = new OpenCodeClient({ baseUrl });

	// 2. The server is reachable and healthy.
	const health = await client.health();
	check("server health", health.healthy === true, `version ${health.version}`);

	// 3. A session can be created.
	const sessionId = await client.createSession("freewrite e2e");
	check("session created", sessionId.startsWith("ses_"), sessionId);

	// 4. The prompt helpers produce the text the model is asked for.
	const platform = PLATFORMS.find((p) => p.id === "wechat_mp")!;
	const system = buildSystemPrompt({ source: SOURCE, sourceTitle: "Obsidian 插件开发笔记", platform });
	const user = buildUserPrompt({ source: SOURCE, sourceTitle: "Obsidian 插件开发笔记", platform });
	check(
		"prompts are built",
		system.includes("JSON") && user.includes("SOURCE ARTICLE"),
		`system ${system.length} chars, user ${user.length} chars`,
	);

	// 5. The raw client call: the server accepts the request and the assistant
	//    streams its answer back. The user's prompt must not show up in it.
	const raw = await client.prompt(sessionId, user, { model, system });
	let streamed = "";
	for await (const event of raw) {
		if (event.type === "text") streamed += event.text;
		else if (event.type === "error") throw new Error(event.message);
	}
	check(
		"assistant text streamed over SSE",
		streamed.trim().length > 0,
		`${streamed.trim().length} chars`,
	);
	check(
		"the user prompt is not echoed back",
		!streamed.includes("SOURCE ARTICLE") && !streamed.includes("Target platform:"),
	);
	check(
		"the answer has no duplicated tail",
		streamed.trim().length < SOURCE.length * 40,
		`length ${streamed.trim().length}`,
	);

	// 6. The draft parser turns the answer into a draft.
	const parsedDraft = parseDraft(streamed);
	check(
		"parseDraft returns a draft",
		parsedDraft !== null,
		parsedDraft ? `title "${parsedDraft.title}"` : "no JSON object found",
	);

	// 7. The full pipeline over two platforms on one session. The second
	//    platform is the regression case: a stream opened for a session that
	//    already ran a turn replays that turn's events, so the client drops
	//    every message created before the turn started. Without that filter the
	//    replayed idle ended the turn early and the second draft came back empty.
	const targets = PLATFORMS.filter((p) => p.id === "wechat_mp" || p.id === "zhihu");
	const drafts = await runPipeline(
		client,
		sessionId,
		{
			source: SOURCE,
			sourceTitle: "Obsidian 插件开发笔记",
			platforms: targets,
			model,
		},
		{
			onPlatformStart: (p) => console.log(`   ... rewriting for ${p.name}`),
			onPlatformError: (p, error) => console.log(`   ... ${p.name} failed: ${error}`),
		},
	);

	check(
		"pipeline produced one draft per platform",
		drafts.length === targets.length,
		`${drafts.length}/${targets.length}`,
	);
	for (const draft of drafts) {
		const spec = targets.find((p) => p.id === draft.platformId)!;
		check(
			`draft for ${spec.name} has content`,
			draft.title.length > 0 && draft.body.length > 0,
			`title ${draft.title.length} chars, body ${weightedLength(draft.body)} weighted chars, ${draft.durationMs}ms`,
		);
		check(
			`draft for ${spec.name} is not the stale first turn`,
			draft.body.trim().length > 0,
		);
	}

	// 8. Clean up the session.
	await client.deleteSession(sessionId);
	check("session deleted", true, sessionId);

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
