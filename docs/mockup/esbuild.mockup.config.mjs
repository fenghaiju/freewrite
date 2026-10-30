/**
 * Screenshot build.
 *
 * Bundles the real freeWrite UI classes against a browser Obsidian shim so the
 * README images are rendered from the shipped code. This is separate from the
 * release build in `esbuild.config.mjs` and never touches it.
 *
 * Usage: node docs/mockup/esbuild.mockup.config.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
	entryPoints: [path.join(here, "freewrite-shim.ts")],
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "es2020",
	logLevel: "info",
	outfile: path.join(here, "bundle.js"),
	alias: {
		obsidian: path.join(here, "obsidian-dom.ts"),
		path: path.join(here, "path-stub.ts"),
	},
});
