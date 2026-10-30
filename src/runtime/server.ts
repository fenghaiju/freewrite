import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";
import * as path from "path";

/**
 * Lifecycle management for the local `opencode serve` process.
 *
 * freeWrite starts one headless OpenCode server per vault and talks to it over
 * HTTP on the loopback interface. The server binds to 127.0.0.1 only and never
 * listens on a public interface.
 */

export interface ServerHandle {
	/** Base URL of the running server, e.g. `http://127.0.0.1:53124`. */
	baseUrl: string;
	/** Port the server listens on. */
	port: number;
	/** The underlying child process. */
	process: ChildProcess;
}

/** Finds a free TCP port on the loopback interface. */
export function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const { port } = address;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("Unable to determine a free port")));
			}
		});
	});
}

export interface StartServerOptions {
	/** Absolute path to the opencode executable. */
	executable: string;
	/** Working directory for the server, usually the vault root. */
	cwd: string;
	/** Preferred port. 0 picks a free one automatically. */
	port: number;
	/** Extra environment variables. */
	env: Record<string, string>;
	/** Milliseconds to wait for the health endpoint to answer. */
	timeoutMs?: number;
}

/** Waits until `GET /global/health` answers successfully. */
async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/global/health`);
			if (response.ok) return;
			lastError = new Error(`Health check returned ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(
		`OpenCode server did not become ready within ${timeoutMs}ms. ${lastError instanceof Error ? lastError.message : ""}`.trim(),
	);
}

/**
 * Starts `opencode serve` and waits until it is healthy.
 *
 * @throws when the process exits early or the health check times out.
 */
export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
	const port = options.port > 0 ? options.port : await findFreePort();
	const baseUrl = `http://127.0.0.1:${port}`;

	const child = spawn(options.executable, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		windowsHide: true,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let exited = false;
	let exitReason = "";
	child.on("exit", (code) => {
		exited = true;
		exitReason = `opencode serve exited with code ${code ?? "unknown"}`;
	});

	try {
		await waitForHealth(baseUrl, options.timeoutMs ?? 20000);
	} catch (error) {
		if (!exited) child.kill();
		if (exited) throw new Error(exitReason);
		throw error;
	}

	return { baseUrl, port, process: child };
}

/** Stops a running server process. */
export async function stopServer(handle: ServerHandle | null): Promise<void> {
	if (!handle) return;
	const child = handle.process;
	if (child.exitCode !== null || child.signalCode !== null) return;

	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolve();
		}, 3000);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill();
	});
}

/** Resolves the working directory OpenCode should run in. */
export function resolveWorkingDirectory(configured: string, vaultRoot: string): string {
	const trimmed = configured.trim();
	if (!trimmed) return vaultRoot;
	return path.isAbsolute(trimmed) ? trimmed : path.resolve(vaultRoot, trimmed);
}
