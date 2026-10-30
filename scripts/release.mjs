import { readFile, writeFile, mkdir, rm, cp } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import process from "process";

/**
 * Packages the plugin for a release.
 *
 * Creates a zip with the three files Obsidian expects and prints the version.
 */

const run = promisify(execFile);

async function main() {
	const manifest = JSON.parse(await readFile("manifest.json", "utf8"));

	if (!existsSync("main.js")) {
		console.error("main.js is missing. Run `npm run build` first.");
		process.exit(1);
	}

	const outputDir = "dist";
	await mkdir(outputDir, { recursive: true });

	const zipName = `freewrite-${manifest.version}.zip`;
	const zipPath = `${outputDir}/${zipName}`;

	// Remove a previous archive so the zip does not contain itself.
	await rm(zipPath, { force: true });

	const staging = `${outputDir}/staging`;
	await rm(staging, { recursive: true, force: true });
	await mkdir(staging, { recursive: true });

	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		await cp(file, `${staging}/${file}`);
	}

	await compress(staging, zipPath);
	await rm(staging, { recursive: true, force: true });

	const versions = JSON.parse(await readFile("versions.json", "utf8"));
	versions[manifest.version] = manifest.minAppVersion;
	await writeFile("versions.json", `${JSON.stringify(versions, null, 2)}\n`);

	console.log(`Packaged ${zipPath}`);
}

/** Zips a directory into an archive. */
async function compress(source, target) {
	if (process.platform === "win32") {
		await run("powershell", [
			"-NoProfile",
			"-Command",
			`Compress-Archive -Path '${source}/*' -DestinationPath '${target}' -Force`,
		]);
		return;
	}

	await run("zip", ["-r", target, ".", "-x", ".*"], { cwd: source });
}

await main();
