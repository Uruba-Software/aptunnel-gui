# aptunnel-gui

A terminal GUI for [aptunnel](https://www.npmjs.com/package/aptunnel) — visual frontend for managing Aptible database tunnels from your terminal.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for CLI).

---

## Features

- **Dashboard** — accordion list of all environments and databases, tunnel status at a glance
- **Live status polling** — auto-refreshes tunnel states every N seconds (configurable)
- **Bulk open/close** — open or close all tunnels in an environment with one key
- **DB Detail view** — schema browser (tables, views, indexes, triggers, functions) per database
- **Port editor** — 3-step modal to reassign a tunnel port and reconnect
- **Credentials toggle** — show/hide sensitive fields (user, password, URL) on demand
- **Init wizard** — guided 7-step setup that calls `aptunnel init` under the hood
- **Background preload** — silently loads schema data for all DBs at startup (optional)
- **Hide/show** — hide environments or individual DBs from the list without deleting config
- **Logs screen** — scrollable log viewer with level/env/date filters and export
- **Settings** — polling interval, auto-open behavior, log retention, name truncation, and more
- **Config editor** — visual editor for `aptunnel`'s `config.yaml`
- **Cross-platform** — tested on macOS, Linux, and Windows (Node.js 18/20/22)

---

## Requirements

- **Node.js** ≥ 18
- [aptunnel](https://www.npmjs.com/package/aptunnel) ≥ 1.1.0 (auto-installed if missing)

---

## Install

```bash
npm install -g aptunnel-gui
```

Then run:

```bash
aptunnel-gui
```

On first launch, the setup wizard will check your `aptunnel` installation and guide you through configuration.

---

## Screenshots

> Screenshots will be added here once the 1.0.0 design pass is complete.
> Design assets are in the [`design/`](./design) folder.

---

## Keyboard Reference

### Global (all screens)

| Key | Action |
|-----|--------|
| `Ctrl+C` | Quit |

### Dashboard

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate |
| `Enter` / `→` | Expand env / open DB detail |
| `←` | Collapse env |
| `o` | Open tunnel |
| `c` | Close tunnel |
| `O` (shift) | Open all tunnels in env |
| `C` (shift) | Close all tunnels in env |
| `p` | Edit port |
| `h` | Hide env or DB |
| `r` | Refresh (poll now) |
| `s` | Settings |
| `l` | Logs |

### DB Detail

| Key | Action |
|-----|--------|
| `o` | Open tunnel |
| `c` | Close tunnel |
| `t` | Toggle credentials |
| `p` | Edit port |
| `h` | Hide this DB |
| `[` | Previous DB |
| `]` | Next DB |
| `Esc` | Back to list |

### Settings

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate |
| `Space` / `←` / `→` | Change value |
| `Ctrl+S` | Save |
| `Esc` | Discard & back |

### Logs

| Key | Action |
|-----|--------|
| `↑` / `↓` | Scroll |
| `f` | Cycle level filter |
| `e` | Export to file |
| `x` | Clear logs |
| `Esc` | Back |

---

## Storage

All app data is stored in `~/.aptunnel-gui/`:

```
~/.aptunnel-gui/
  settings.json          — user preferences
  cache/
    <env-alias>/
      <db-alias>.json    — cached schema data
  logs/
    YYYY-MM-DD.log       — daily log files (auto-rotated)
```

aptunnel's own config remains at `~/.aptunnel/config.yaml`.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Polling interval | 5s | How often to refresh tunnel status |
| Auto-open tunnel | Ask | Open tunnel automatically when loading schema (Ask / Always / Never) |
| Background preload | ON | Load all DB schemas silently at startup |
| Log retention | 30 days | How long to keep daily log files |
| Theme | Dark | Color theme |
| Name truncate at | 18ch | Max name width in dashboard (scrolls on focus) |

---

## CI / CD

- **CI:** Tests run on every push and pull request across macOS, Linux, and Windows on Node 18, 20, and 22.
- **Publish:** Pushing a `v*` tag triggers cross-platform tests; on success, the package is published to npm automatically.

---

## Donate

If this tool saves you time, consider supporting development:

- [GitHub Sponsors](https://github.com/sponsors/biyro02)
- [Ko-fi](https://ko-fi.com/biyro02)

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT
