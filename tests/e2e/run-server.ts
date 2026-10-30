/**
 * End-to-end check of the runtime chain.
 *
 * The plugin's own discovery, config building and process management are used
 * to find the executable, write the provider configuration into OpenCode and
 * start and stop the headless server.
 *
 * Usage:
 *   npx vite-node tests/e2e/run-server.ts [pathToOpenCode]
 */

import { discoverOpenCode, readVersion } from "../../src/runtime/discovery";
import { findFreePort, resolveWorkingDirectory, startServer, stopServer } from "../../src/runtime/server";
import { buildOpenCodeConfig, serializeOpenCodeConfig } from "../../src/providers/config";
import { OpenCodeClient } from "../../src/runtime/client";

const configured = process.argv[2] ?? "";

const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = ""): void {
	checks.push({ name, ok, detail });
	console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function main(): Promise<void> {
	// 1. The executable is found.
	const discovery = await discoverOpenCode(configured);
	check("the opencode executable was found", discovery.path !== null, `${discovery.source} ${discovery.path ?? ""}`);
	if (!discovery.path) {
		process.exitCode = 1;
		return;
	}
	const version = discovery.version ?? (await readVersion(discovery.path));
	check("the version could be read", Boolean(version), version ?? "");

	// 2. A free port is picked and the working directory is resolved.
	const port = await findFreePort();
	check("a free port was found", port > 1024, String(port));
	const cwd = resolveWorkingDirectory("", process.cwd());
	check("the working directory falls back to the vault root", cwd === process.cwd(), cwd);

	// 3. The provider configuration is written into the OpenCode config.
	const config = buildOpenCodeConfig(
		[
			{
				id: "my-proxy",
				name: "My proxy",
				baseUrl: "https://proxy.example.com/v1",
				models: ["model-a", "model-b"],
			},
		],
		{ defaultModel: "opencode/big-pickle", permissionMode: "ask" },
	);
	const serialised = serializeOpenCodeConfig(config);
	const parsed = JSON.parse(serialised);
	check("the config names the default model", parsed.model === "opencode/big-pickle");
	check("the config holds the provider", parsed.provider["my-proxy"].models["model-a"].name === "model-a");
	check(
		"the config denies the write permissions",
		parsed.permission.bash === "deny" && parsed.permission.write === "deny" && parsed.permission.edit === "deny",
	);
	check("the config asks before fetching", parsed.permission.webfetch === "ask");

	// 4. The server starts and reports itself healthy.
	const handle = await startServer({
		executable: discovery.path,
		cwd,
		port,
		env: { OPENCODE_CONFIG_CONTENT: serialised },
	});
	check("the server process was spawned", handle.process.pid !== undefined, `pid ${handle.process.pid}`);
	check("the server listens on the loopback interface", handle.baseUrl.startsWith("http://127.0.0.1:"), handle.baseUrl);

	const client = new OpenCodeClient({ baseUrl: handle.baseUrl });
	const health = await client.health();
	check("the health endpoint answers", health.healthy === true, `version ${health.version}`);

	// 5. The provider written into the config is known to the server.
	const providers = await client.listProviders();
	check("the server reports its providers", providers.length > 0, `${providers.length} providers`);
	check(
		"the configured provider is not rejected by the server",
		providers.every((provider) => typeof provider.id === "string" && provider.id.length > 0),
	);

	// 6. A session can be created on the freshly spawned server.
	const sessionId = await client.createSession("freewrite runtime e2e");
	check("a session was created", sessionId.startsWith("ses_"), sessionId);
	await client.deleteSession(sessionId);

	// 7. The server is stopped again.
	await stopServer(handle);
	check("the server process was stopped", handle.process.exitCode !== null || handle.process.signalCode !== null);

	let reachable = true;
	try {
		await fetch(`${handle.baseUrl}/global/health`, { signal: AbortSignal.timeout(1500) });
	} catch {
		reachable = false;
	}
	check("the server is no longer reachable", !reachable);

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
