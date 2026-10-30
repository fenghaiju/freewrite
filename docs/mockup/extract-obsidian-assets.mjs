/**
 * Extracts the Obsidian theme assets the screenshots need.
 *
 * The README images are rendered with the real Obsidian stylesheet and fonts so
 * the plugin is shown exactly as a user sees it. Those files live inside the
 * installed Obsidian application, so they are unpacked from the `.asar` archive
 * into `docs/mockup/assets/` before the pages are rendered.
 *
 * Usage: node docs/mockup/extract-obsidian-assets.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "assets");

/** Finds the installed Obsidian archive. */
function findArchive() {
	const roots = [
		process.env.APPDATA,
		process.env.LOCALAPPDATA,
		path.join(process.env.HOME ?? "", ".config"),
	].filter(Boolean);

	for (const root of roots) {
		const obsidianDir = path.join(root, "obsidian");
		if (!fs.existsSync(obsidianDir)) continue;

		const candidates = fs
			.readdirSync(obsidianDir)
			.filter((name) => name.startsWith("obsidian-") && name.endsWith(".asar"))
			.sort()
			.reverse();

		if (candidates.length > 0) return path.join(obsidianDir, candidates[0]);
	}

	return null;
}

/** Reads the file table of an asar archive. */
function readArchive(buffer) {
	const headerSize = buffer.readUInt32LE(4);
	const jsonSize = buffer.readUInt32LE(12);
	const header = JSON.parse(buffer.toString("utf8", 16, 16 + jsonSize));
	return { header, dataStart: 8 + headerSize };
}

/** Collects the entries of the archive that the screenshots need. */
function collect(header, prefix, wanted) {
	const found = new Map();

	const walk = (node, current) => {
		for (const name of Object.keys(node.files ?? {})) {
			const entry = node.files[name];
			const entryPath = current ? `${current}/${name}` : name;
			if (entry.files) {
				walk(entry, entryPath);
				continue;
			}
			if (wanted(entryPath)) found.set(entryPath, entry);
		}
	};

	walk(header, prefix);
	return found;
}

function main() {
	const archive = findArchive();
	if (!archive) {
		console.error("Could not find an installed Obsidian application.");
		console.error("Install Obsidian and run this script again.");
		process.exit(1);
	}

	const buffer = fs.readFileSync(archive);
	const { header, dataStart } = readArchive(buffer);

	const wanted = (entryPath) =>
		entryPath === "app.css" || entryPath === "enhance.js" || entryPath.startsWith("public/fonts/");

	const files = collect(header, "", wanted);
	if (!files.has("app.css")) {
		console.error(`Could not find app.css inside ${archive}.`);
		process.exit(1);
	}

	fs.rmSync(assets, { recursive: true, force: true });

	for (const [entryPath, entry] of files) {
		const offset = Number(entry.offset);
		const target = path.join(assets, entryPath);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, buffer.subarray(dataStart + offset, dataStart + offset + entry.size));
	}

	console.log(`Extracted ${files.size} assets from ${archive} into ${assets}`);
}

main();
