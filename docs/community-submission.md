# Submitting freeWrite to the community plugin directory

The Obsidian team closed pull requests against
[`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases);
submissions now go through [community.obsidian.md](https://community.obsidian.md).
This file holds everything needed to submit the plugin there, and what the
automated review will look at.

## Before you start

The plugin repository has to be public and reachable at `fenghaiju/freewrite`.
The reviewer opens the repository, reads the README and checks the release
assets, so the URL in `manifest.json` has to resolve.

You need a GitHub account and an Obsidian account, and you have to link the
GitHub account to the Obsidian one so the directory can verify that you own the
repository.

## 1. Publish a release

The directory installs plugins from the latest GitHub release. The tag has to
match the `version` in `manifest.json`, and the release has to carry the
plugin files as separate assets:

- `main.js`
- `manifest.json`
- `styles.css` (optional)

Tag a version and let the workflow do the rest:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The **Release** workflow builds `main.js`, runs the verification script and
uploads the three files as release assets.

## 2. Submit the plugin

1. Sign in at [community.obsidian.md](https://community.obsidian.md).
2. Link your GitHub account to your profile.
3. Add the plugin and point it at `fenghaiju/freewrite`.
4. Submit it for review.

The directory reads the `manifest.json` at the HEAD of the default branch, so
the manifest has to be committed before the submission.

## 3. Answer the review

The review is automated at first. When it reports a problem, fix it in the
repository, publish a new release with an incremented version, and edit the
description in the directory. The plugin stays uninstallable until the errors
are cleared.

## What the reviewer will check

- `manifest.json` has a description that starts with an action verb, ends with
  a period, stays under 250 characters and contains no emoji.
- `isDesktopOnly` is `true`, because the plugin spawns the OpenCode process.
- No command id contains the plugin id.
- The README has installation instructions, screenshots and a privacy section.
- The plugin makes no third-party requests beyond the ones it documents.
- The licence is permissive and the repository is public.

`node scripts/verify-release.mjs` checks the first four points against the
built artefacts, and it runs on every push in CI.

## End-to-end verification

The five runtime chains were exercised against a live OpenCode server with the
plugin's own source files, through the scripts in `tests/e2e/`. Each script
prints a `PASS`/`FAIL` line per check and exits non-zero on any failure.

| Chain | Script | What it proves |
| --- | --- | --- |
| Spawn the server | `npx vite-node tests/e2e/run-server.ts [pathToOpenCode]` | Discovery finds the executable, the provider config is written, a free port is bound and the headless server starts and stops. |
| Stream over SSE | `npx vite-node tests/e2e/run-server.ts` | A session is created and the assistant's parts arrive on the event stream. |
| Real rewrite | `npx vite-node tests/e2e/run-pipeline.ts [baseUrl] [model]` | One session rewrites two platforms; the reused-session replay no longer truncates the second draft. |
| Clipboard publish | `npx vite-node tests/e2e/run-publish.ts` | The plugin's own code decides the clipboard text and the compose page that opens. |
| Bridge publish | `npx vite-node tests/e2e/run-publish.ts` | A real HTTP server receives the versioned payload with the configured headers. |

The unit suite (`npm test`, 58 cases) and the quality gate (`npm run check`:
typecheck, lint, test, build) pass on every change.

## Regenerating the screenshots

The three README images are rendered from the plugin's real UI classes, not
from hand-written markup, so they cannot drift from the shipped plugin:

```bash
node docs/mockup/extract-obsidian-assets.mjs   # pull app.css/fonts from the local Obsidian install
node docs/mockup/esbuild.mockup.config.mjs      # bundle the render entry against the DOM shim
powershell -NoProfile -ExecutionPolicy Bypass -File docs/mockup/render.ps1
```

`docs/mockup/assets/` and `docs/mockup/bundle.js` are generated and gitignored;
only the harness source is committed.
