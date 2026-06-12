# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); this project uses [SemVer](https://semver.org).

## [Unreleased]

## [0.1.3] — 2026-06-13

### Fixed

- Load vendored xterm through an HTML-safe bootstrap so Porta's `srcdoc`
  extension inliner cannot mangle comparison operators inside the minified
  vendor bundle.

## [0.1.2] — 2026-06-11

### Fixed

- Ship a classic-script runtime bundle so Porta's extension iframe inliner can load the extension without stripping `type="module"` from `app.js`.

## [0.1.1] — 2026-06-11

### Fixed

- Quote Kamal PTY command arguments so shell operators and spaces stay inside the intended argument, fixing commands such as `server exec`.
- Quote deploy config paths when detecting and reading `deploy.yml`, including paths with spaces or apostrophes.

## [0.1.0] — 2026-05-30
Initial release — extracted from the porta monorepo (`extensions-bundled/kamal/`) into its own repo.

- Grouped command sidebar with filter (Deploy / App / Console / Server / Debug + accessories + custom).
- Every command runs in an embedded xterm.js PTY via `bridge.terminal`: live output, scrollback, `Ctrl-C` cancel, bidirectional stdin for interactive commands.
- Accessory commands (`bash`, `logs -f`) auto-derived from the `accessories:` block of `deploy.yml`.
- Custom commands persisted per-app via `bridge.storage` (add / edit / delete).
- Config auto-detection (`config/deploy.yml` → `deploy.yml`) with a remembered override path.
- Install affordance for missing `kamal` (`gem install kamal`, `--user-install` fallback).
- Unit tests for work-dir resolution, accessory parsing, command table, custom-command store, and config detection.
