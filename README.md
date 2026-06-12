# porta-kamal

A vanilla-JS [Kamal](https://kamal-deploy.org) deploy GUI that ships as a [Porta](https://github.com/narakarya/porta) extension. Deploy, rollback, logs, app lifecycle commands, accessories, and custom commands run against the active app's deploy config with streamed output in a regular app panel.

No build step and no runtime dependencies. Talks to Porta via `window.portaBridge`.

## Install

In Porta → Settings → Extensions → "Install from GitHub":

```
narakarya/porta-kamal
```

Pin a version:
```
narakarya/porta-kamal@v0.2.3
```

## Features

| Area | What |
|------|------|
| **Commands** | Grouped sidebar (Deploy / App / Server / Debug) with filter: deploy, rollback, release lock, app logs/details/start/stop/restart, server reboot/info, audit, version. |
| **Output panel** | Commands run through Porta's streaming shell bridge with stdout/stderr shown inline, status pills, exit code handling, and toast feedback. |
| **Accessories** | Auto-derived from the `accessories:` block of your `deploy.yml` — a logs entry per accessory. |
| **Custom commands** | Add / edit / delete your own kamal subcommands; persisted per-app via `bridge.storage`. |
| **Config** | Auto-detects `config/deploy.yml` then `deploy.yml` under the app root; a non-standard path can be set and is remembered. |
| **Install** | If `kamal` isn't found, offers to install it (`gem install kamal`, with `--user-install` fallback). |

## Security

- Sees only the active app's `root_dir`. Porta refuses shell `cwd` outside it (and rejects `..` traversal).
- Permissions: `shell`, `storage`. No network, no filesystem outside the app root.

## Development

Clone:
```bash
git clone https://github.com/narakarya/porta-kamal.git
cd porta-kamal
```

Run the unit tests (pure logic — work-dir resolution, accessory parsing, command table, custom-command store, config detection):
```bash
npm test          # or: node --test
```

The UI (`app.js`) is integration glue exercised inside Porta's extension WebView; it has no headless test. To try it live, install the extension in Porta and open the **Deploy** action on an app that has a `deploy.yml`.

## License

MIT © Nasrul Gunawan
