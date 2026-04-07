<p align="center">
  <h1 align="center">aptunnel-gui</h1>
  <p align="center">Terminal GUI for aptunnel — visual frontend for managing Aptible database tunnels from your terminal.</p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aptunnel-gui"><img src="https://img.shields.io/npm/v/aptunnel-gui?color=cb3837&label=npm&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aptunnel-gui"><img src="https://img.shields.io/npm/dm/aptunnel-gui?color=cb3837&logo=npm&label=downloads" alt="npm downloads"></a>
  <a href="https://github.com/Uruba-Software/aptunnel-gui/actions/workflows/ci.yml"><img src="https://github.com/Uruba-Software/aptunnel-gui/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/aptunnel-gui?color=339933&logo=node.js&logoColor=white" alt="Node.js version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/aptunnel-gui?color=blue" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Linux-supported-FCC624?logo=linux&logoColor=black" alt="Linux">
  <img src="https://img.shields.io/badge/macOS-supported-000000?logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/Windows-supported-0078D4?logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/WSL-supported-4EAA25?logo=gnubash&logoColor=white" alt="WSL">
</p>

---

```
aptunnel-gui          # launch the terminal GUI
```

---

## Requirements

Before installing `aptunnel-gui`, make sure you have the following:

### 1. Node.js 18+

Download from [nodejs.org](https://nodejs.org) or use a version manager:

```bash
# macOS / Linux — via nvm
nvm install 20
nvm use 20

# Windows — via nvm-windows
# https://github.com/coreybutler/nvm-windows
```

Verify:

```bash
node --version   # should print v18.x or higher
```

### 2. Aptible CLI

aptunnel-gui shells out to the [Aptible CLI](https://www.aptible.com/docs/cli) — it must be installed and available in your PATH.

```bash
# macOS
brew install aptible/aptible/aptible

# Linux / WSL
curl -s https://toolbelt.aptible.com/install.sh | bash

# Windows
# Download the installer from https://www.aptible.com/docs/cli
```

Verify:

```bash
aptible version
```

### 3. aptunnel 1.1.0+

aptunnel-gui manages your Aptible tunnels through [aptunnel](https://www.npmjs.com/package/aptunnel). If it's not installed or is outdated, aptunnel-gui will install/update it automatically on first launch.

To install manually:

```bash
npm install -g aptunnel
```

Verify:

```bash
aptunnel --version
```

---

## Install

```bash
npm install -g aptunnel-gui
```

Then launch:

```bash
aptunnel-gui
```

On first launch, the setup wizard guides you through connecting to your Aptible account and configuring your environments.

---

## First launch — setup wizard

The wizard runs automatically if no `~/.aptunnel/config.yaml` is found. It:

1. Checks your `aptunnel` version (installs/updates if needed)
2. Detects existing config (offers to skip setup if already configured)
3. Authenticates with your Aptible account via `aptunnel login`
4. Fetches your environments and databases
5. Assigns aliases and port numbers
6. Detects database types (PostgreSQL, MySQL, Redis, Elasticsearch)
7. Installs the relevant database drivers

---

## Usage

### Dashboard

The main screen. Environments are collapsible rows. Each database shows its tunnel status, port, and last-seen time.

```
 aptunnel-gui  │  env: dev  │  2/4 tunnels up          aptunnel-gui v1.0.0
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
 ▼ dev    (2/3 up)    [↑ All]  [↓ All]  [⟳]  [hide ↯]

      name               type       status    port       last seen
      ─────────────────  ─────────  ────────  ─────────  ──────────
  ●  dev-db             postgresql  UP       :55554     14:32   [→]
  ●  dev-redis          redis       DOWN     :55555     —       [→]
  ●  dev-elastic        elastic     CONN     :55556     14:33   [→]

 ▶ staging  (0/1 up)
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
 [↑↓] nav  [Enter] expand  [o] open  [c] close  [p] port  [h] hide  [Ctrl+C] quit
```

Status dot colors: `●` green = UP, red = DOWN, yellow = connecting.

### DB Detail

Opens with `Enter` or `→` on a database row. Shows tunnel controls, togglable credentials, and a schema browser (tables, views, indexes, triggers, functions).

### Port editor

Press `p` on any database to open the 3-step port change modal: enter new port → confirm reconnect → optionally save as default.

### Logs

Press `l` from the dashboard. Scrollable log of all tunnel events, schema loads, errors, and background activity. Filterable by environment, level, and date. Exportable to file.

### Settings

Press `s` from the dashboard. Configure polling interval, auto-open behavior, background preload, log retention, name truncation, and more.

---

## Keyboard reference

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
| `r` | Refresh now |
| `s` | Settings |
| `l` | Logs |
| `Ctrl+C` | Quit |

### DB Detail

| Key | Action |
|-----|--------|
| `o` / `c` | Open / close tunnel |
| `t` | Toggle credentials |
| `p` | Edit port |
| `h` | Hide this DB |
| `[` / `]` | Previous / next DB |
| `Space` | Expand / collapse section |
| `Esc` | Back to list |
| `Ctrl+C` | Quit |

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

aptunnel-gui stores its data in `~/.aptunnel-gui/`:

```
~/.aptunnel-gui/
  settings.json          — preferences
  cache/
    <env-alias>/
      <db-alias>.json    — cached schema data per database
  logs/
    YYYY-MM-DD.log       — daily log files (auto-rotated)
```

aptunnel's own config stays at `~/.aptunnel/config.yaml` — aptunnel-gui reads it but only modifies it through the built-in Config Editor screen.

---

## Platform support

| Platform | Status | Notes |
|---|---|---|
| **Linux** | ✅ Full | Tested on Ubuntu 22.04+ |
| **macOS** | ✅ Full | Tested on macOS 13+ |
| **Windows** | ✅ Full | PowerShell 7, Windows Terminal recommended |
| **WSL** | ✅ Full | Treated as Linux |

---

## Contributing

See [CONTRIBUTING.md](https://github.com/Uruba-Software/aptunnel-gui/blob/main/CONTRIBUTING.md) for how to clone, set up, and run the project locally.

---

## Donate

If this tool saves you time, consider supporting development:

- [GitHub Sponsors](https://github.com/sponsors/biyro02)
- [Ko-fi](https://ko-fi.com/biyro02)

---

## License

MIT — see [LICENSE](https://github.com/Uruba-Software/aptunnel-gui/blob/main/LICENSE).
