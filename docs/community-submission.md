# Submitting freeWrite to the community plugin directory

This file holds everything needed to open a pull request against
[`obsidianmd/obsidian-releases`](https://github.com/obsidianmd/obsidian-releases).

## Before you start

The plugin repository has to be public and reachable at `fenghaiju/freewrite`.
The reviewer opens the repository, reads the README and checks the release
assets, so the URL in `manifest.json` has to resolve.

## 1. Publish a release

The directory installs plugins from the latest GitHub release. Tag a version
and let the workflow build the archive:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The **Release** workflow builds `main.js`, runs the verification script and
uploads `main.js`, `manifest.json` and `styles.css` as release assets.

## 2. Open the pull request

Create a branch against `obsidianmd/obsidian-releases` and make two changes.

### `community-plugins.json`

Add the plugin to the list, keeping the alphabetical order the file uses:

```json
{
	"id": "freewrite",
	"name": "FreeWrite",
	"description": "Rewrite one note into ready-to-publish drafts for multiple platforms using a local OpenCode runtime.",
	"author": "freeWrite",
	"repo": "fenghaiju/freewrite"
}
```

The `description` must match `manifest.json` character for character.

### `versions.json`

Add the version and the minimum Obsidian version it needs:

```json
"1.0.0": "1.5.0"
```

## 3. The pull request description

```
Adds FreeWrite, a multi-platform writing assistant for Obsidian.

freeWrite rewrites one note into a separate draft for each target platform:
a title that fits the platform's character limit, a body written in that
platform's register, and the right topic tags. Twelve platforms are supported.

It runs on a local OpenCode runtime that the plugin starts on 127.0.0.1. The
plugin does not call any model provider itself: it writes the provider
configuration into OpenCode and lets OpenCode handle authentication and
requests. The only other network destination is the publishing endpoint the
user configures, which is off by default.

The README documents the installation, the supported platforms and the privacy
behaviour.
```

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
