# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1]

### Fixed

- Rewriting several platforms in one reused OpenCode session no longer
  truncates the later drafts. A stream opened for a session that already ran a
  turn replays that turn's events; the client now drops every message created
  before the current turn started and only accepts an idle that belongs to it,
  so each platform receives its own complete answer.

### Changed

- The README screenshots are rendered from the plugin's own `WorkbenchView`,
  `FreeWriteSettingTab` and `InlineEditModal` classes inside a faithful
  Obsidian shell, so the images cannot drift away from the shipped UI.

## [1.0.0]

### Added

- Multi-platform rewriting pipeline that turns one note into a separate draft
  for each target platform.
- Support for twelve platforms: WeChat Official Accounts, Zhihu, CSDN, Juejin,
  Toutiao, Bilibili, Xiaohongshu, Weibo, X, Jianshu, DEV Community and Medium.
- Per-platform title, body and tag limits, counted the way the platforms count
  them, with advisory warnings on the draft.
- Local [OpenCode](https://opencode.ai) runtime, started by the plugin as a
  server bound to `127.0.0.1`.
- Custom provider profiles, written into the OpenCode configuration the plugin
  starts, with API keys stored in OpenCode's own credential store.
- Clipboard publishing channel that also opens the platform's compose page.
- Optional publishing service channel that posts versioned JSON payloads to an
  endpoint you configure.
- Sidebar workbench, settings tab and an inline rewrite modal.
