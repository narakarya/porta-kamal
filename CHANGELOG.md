# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); this project uses [SemVer](https://semver.org).

## [Unreleased]

## [0.1.0] — 2026-05-30
Initial release — extracted from the porta monorepo (`extensions-bundled/kamal/`) into its own repo.

- Grouped command sidebar with filter (Deploy / App / Console / Server / Debug + accessories + custom).
- Every command runs in an embedded xterm.js PTY via `bridge.terminal`: live output, scrollback, `Ctrl-C` cancel, bidirectional stdin for interactive commands.
- Accessory commands (`bash`, `logs -f`) auto-derived from the `accessories:` block of `deploy.yml`.
- Custom commands persisted per-app via `bridge.storage` (add / edit / delete).
- Config auto-detection (`config/deploy.yml` → `deploy.yml`) with a remembered override path.
- Install affordance for missing `kamal` (`gem install kamal`, `--user-install` fallback).
- Unit tests for work-dir resolution, accessory parsing, command table, custom-command store, and config detection.
