# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); this project uses [SemVer](https://semver.org).

## [Unreleased]

## [0.2.3] — 2026-06-13

### Fixed

- Normalize Docker-based Kamal aliases more aggressively by making the
  SSH_AUTH_SOCK mount conditional and adding `/workdir` as the container
  working directory when the alias mounts the app there.
- Remove blocking confirm dialogs from command clicks and make the output panel
  more compact.

## [0.2.2] — 2026-06-13

### Fixed

- Support Docker-based `kamal` aliases by stripping TTY flags from aliases such
  as `docker run -it ... ghcr.io/basecamp/kamal:latest` before running commands
  from Porta's non-TTY shell bridge.
- Simplify the output header so it does not show long Docker command lines by
  default.

## [0.2.1] — 2026-06-13

### Fixed

- Show the extension runtime version in the status bar so stale Porta extension
  caches are visible immediately.
- Fall back to non-streaming `shell.run` when the active Porta build does not
  expose `bridge.shell.spawn`.

## [0.2.0] — 2026-06-13

### Changed

- Rewrite the extension as a regular app-style command panel using Porta's
  streaming shell bridge instead of an embedded xterm.js PTY.
- Remove interactive shell entries and use non-following log commands so menu
  actions finish predictably and display stdout/stderr in the output panel.
- Drop the `terminal` permission and vendored xterm assets.

## [0.1.5] — 2026-06-13

### Fixed

- Detect an installed Kamal executable with `command -v kamal` before reading
  its version, so a non-zero `kamal version`/`kamal --version` result does not
  incorrectly show `kamal not found` while commands are otherwise runnable.

## [0.1.4] — 2026-06-13

### Fixed

- Run Kamal detection and terminal commands through the user's login shell so
  PATH entries from Ruby managers such as mise, rbenv, asdf, or user gem bins
  are available inside Porta's extension host.
- Show terminal load errors as toasts when a command button is clicked instead
  of failing silently before the PTY opens.

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
