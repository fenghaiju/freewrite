import { spawn } from "child_process";
import { existsSync } from "fs";
import * as path from "path";

/**
 * Locates the `opencode` executable.
 *
 * freeWrite never installs or updates OpenCode. It only looks for an existing
 * binary: an explicit path from settings, then well known install locations,
 * then the system PATH.
 */

const EXECUTABLE = process.platform === "win32" ? "opencode.exe" : "opencode";

/** Candidate install locations per platform, relative to the user's home directory. */
function candidatePaths(): string[] {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
	const paths: string[] = [];
	if (!home) return paths;

	if (process.platform === "win32") {
		const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
		const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
		paths.push(
			path.join(appData, "npm", "opencode.cmd"),
			path.join(appData, "npm", "opencode"),
			path.join(localAppData, "Programs", "opencode", EXECUTABLE),
			path.join(localAppData, "opencode", EXECUTABLE),
			path.join(home, ".opencode", "bin", EXECUTABLE),
			path.join(home, ".bun", "bin", "opencode.exe"),
		);
	} else {
		paths.push(
			path.join(home, ".opencode", "bin", "opencode"),
			path.join(home, ".local", "bin", "opencode"),
			path.join(home, ".bun", "bin", "opencode"),
			"/usr/local/bin/opencode",
			"/opt/homebrew/bin/opencode",
		);
	}
	return paths;
}

export interface DiscoveryResult {
	/** Absolute path to the executable, or null when nothing was found. */
	path: string | null;
	/** How the executable was located, for display in settings. */
	source: "settings" | "wellknown" | "path" | "none";
	/** Version string reported by `opencode --version`, when it could be read. */
	version?: string;
}

/** Checks that the given path points at a runnable opencode executable. */
export function isExecutable(candidate: string): boolean {
	if (!candidate) return false;
	try {
		if (!existsSync(candidate)) return false;
	} catch {
		return false;
	}
	return true;
}

/** Runs `opencode --version` and returns the trimmed output. */
export async function readVersion(executable: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value: string | undefined) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		let child;
		try {
			child = spawn(executable, ["--version"], { windowsHide: true });
		} catch {
			finish(undefined);
			return;
		}

		let out = "";
		const timer = setTimeout(() => {
			child.kill();
			finish(out.trim() || undefined);
		}, 5000);

		child.stdout?.on("data", (chunk) => {
			out += String(chunk);
		});
		child.stderr?.on("data", () => {
			/* version may go to stderr on some builds */
		});
		child.on("error", () => {
			clearTimeout(timer);
			finish(undefined);
		});
		child.on("close", () => {
			clearTimeout(timer);
			finish(out.trim() || undefined);
		});
	});
}

/**
 * Finds the opencode executable.
 *
 * @param configuredPath - Path typed by the user in settings. Takes priority.
 */
export async function discoverOpenCode(configuredPath: string): Promise<DiscoveryResult> {
	const configured = configuredPath.trim();
	if (configured) {
		if (isExecutable(configured)) {
			return { path: configured, source: "settings", version: await readVersion(configured) };
		}
		return { path: null, source: "none" };
	}

	for (const candidate of candidatePaths()) {
		if (isExecutable(candidate)) {
			return { path: candidate, source: "wellknown", version: await readVersion(candidate) };
		}
	}

	const fromPath = await which("opencode");
	if (fromPath) {
		return { path: fromPath, source: "path", version: await readVersion(fromPath) };
	}

	return { path: null, source: "none" };
}

/** Resolves a command name against PATH. */
export async function which(command: string): Promise<string | null> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (value: string | null) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		let child;
		try {
			child = spawn(process.platform === "win32" ? "where" : "which", [command], {
				windowsHide: true,
			});
		} catch {
			finish(null);
			return;
		}

		let out = "";
		const timer = setTimeout(() => {
			child.kill();
			finish(out.split(/\r?\n/).filter(Boolean)[0] ?? null);
		}, 5000);

		child.stdout?.on("data", (chunk) => {
			out += String(chunk);
		});
		child.on("error", () => {
			clearTimeout(timer);
			finish(null);
		});
		child.on("close", () => {
			clearTimeout(timer);
			const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
			finish(first ?? null);
		});
	});
}
