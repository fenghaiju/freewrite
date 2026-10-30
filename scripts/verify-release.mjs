import { readFile } from "fs/promises";
import { existsSync } from "fs";
import process from "process";

/**
 * Validates that the release artefacts match the community plugin requirements.
 *
 * Run before publishing a release: `node scripts/verify-release.mjs`.
 */

const problems = [];

function check(condition, message) {
	if (!condition) problems.push(message);
}

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

// Manifest requirements.
check(typeof manifest.id === "string" && /^[a-z0-9-]+$/.test(manifest.id), "manifest.id must be lowercase kebab-case");
check(typeof manifest.name === "string" && manifest.name.length > 0, "manifest.name is required");
check(/^\d+\.\d+\.\d+$/.test(manifest.version), "manifest.version must use semantic versioning");
check(typeof manifest.minAppVersion === "string", "manifest.minAppVersion is required");
check(typeof manifest.description === "string", "manifest.description is required");
check(
	typeof manifest.description === "string" && manifest.description.length <= 250,
	`manifest.description must be 250 characters or fewer (currently ${manifest.description?.length ?? 0})`,
);
check(
	typeof manifest.description === "string" && manifest.description.endsWith("."),
	"manifest.description must end with a period",
);
check(
	typeof manifest.description === "string" && !/\p{Extended_Pictographic}/u.test(manifest.description),
	"manifest.description must not contain emoji",
);
check(typeof manifest.author === "string" && manifest.author.length > 0, "manifest.author is required");
check(manifest.isDesktopOnly === true, "manifest.isDesktopOnly must be true because the plugin spawns a child process");

// The version must match the package.
check(manifest.version === packageJson.version, "manifest.version must match package.json version");

// The licence must be permissive and present in the repository.
check(packageJson.license === "MIT", "package.json licence must be MIT");
if (existsSync("LICENSE")) {
	const licence = await readFile("LICENSE", "utf8");
	check(licence.includes("MIT License"), "LICENSE must contain the MIT licence text");
} else {
	problems.push("LICENSE is missing");
}

// Required files.
for (const file of ["main.js", "manifest.json", "styles.css"]) {
	check(existsSync(file), `${file} is missing from the release`);
}

// The bundle must not ship a source map or leak node builtins.
if (existsSync("main.js")) {
	const bundle = await readFile("main.js", "utf8");
	check(!bundle.includes("//# sourceMappingURL="), "main.js must not contain a source map reference");
	check(bundle.includes("freewrite-workbench"), "main.js does not look like the freeWrite bundle");
}

// The version history must know about the current version.
if (existsSync("versions.json")) {
	const versions = JSON.parse(await readFile("versions.json", "utf8"));
	check(
		typeof versions[manifest.version] === "string",
		`versions.json is missing an entry for ${manifest.version}`,
	);
}

// The community guidelines ask for a description that starts with an action.
if (typeof manifest.description === "string") {
	const startsWithAction = /^(Rewrite|Convert|Generate|Translate|Open|Send|Create|Import|Sync|Export|Organize|Extract|Summarize|Proofread|Format|Compare|Merge|Track|Search|Index|Tag|Categorize|Visualize|Review|Plan|Draft|Publish|Collect|Capture|Highlight|Bookmark)/i.test(
		manifest.description,
	);
	check(startsWithAction, "manifest.description should start with an action verb");
}

// The command ids must not repeat the plugin id.
const commands = await collectCommandIds();
for (const id of commands) {
	check(
		!id.startsWith(`${manifest.id}-`) && !id.startsWith(`${manifest.id}:`),
		`the command id "${id}" must not contain the plugin id`,
	);
}

// The README must carry the sections the directory asks for.
if (existsSync("README.md")) {
	const readme = await readFile("README.md", "utf8");
	check(/^#{1,3}\s+installation/im.test(readme), "README.md needs an installation section");
	check(/^#{1,3}\s+privacy/im.test(readme), "README.md needs a privacy section");
	check(/docs\/images\//.test(readme), "README.md needs screenshots");
	check(/PRIVACY\.md/.test(readme), "README.md should link to PRIVACY.md");
} else {
	problems.push("README.md is missing");
}

if (existsSync("PRIVACY.md")) {
	const privacy = await readFile("PRIVACY.md", "utf8");
	check(privacy.length > 200, "PRIVACY.md looks too short to describe the data flow");
} else {
	problems.push("PRIVACY.md is missing");
}

// Every screenshot the README references must exist.
if (existsSync("README.md")) {
	const readme = await readFile("README.md", "utf8");
	for (const match of readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
		const path = match[1].trim();
		if (!path || /^(https?:)?\/\//.test(path)) continue;
		check(existsSync(path), `the screenshot ${path} referenced by README.md is missing`);
	}
}

/** Reads the command ids out of the plugin sources. */
async function collectCommandIds() {
	if (!existsSync("src/main.ts")) return [];
	const source = await readFile("src/main.ts", "utf8");
	const ids = new Set();
	for (const match of source.matchAll(/id:\s*"([a-z0-9-]+)"/g)) {
		ids.add(match[1]);
	}
	return [...ids];
}

if (problems.length > 0) {
	console.error("Release verification failed:");
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}

console.log(`Release verification passed for ${manifest.name} ${manifest.version}.`);
