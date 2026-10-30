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
