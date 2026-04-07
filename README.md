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

- **[Node.js](https://nodejs.org)** 18+
- **[aptunnel](https://www.npmjs.com/package/aptunnel)** 1.1.0+ (auto-installed on first launch if missing or outdated)

---

## Install

```bash
npm install -g aptunnel-gui
```

Then run:

```bash
aptunnel-gui
```

On first launch, the setup wizard checks your `aptunnel` installation and guides you through configuration.

---

## Screens

### Dashboard

The main screen. Environments are accordion rows — expand to see their databases.

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

- `●` dot: green = UP, red = DOWN, yellow = connecting
- Long names scroll on focus — no column shift
- `[→]` or Enter opens DB Detail

### DB Detail

Full-page view for a single database. Schema browser with independently collapsible sections.

```
[← dev-redis]  DEV › dev-db (postgresql)  [dev-elastic →]  [↩ List]
──────────────────────────────────────────────────────────────────────
Status: ● UP   Port: 55554   [↑ Open] [↓ Close] [⚙ Port / p] [hide ↯] [⟳]
Credentials: ●●●●●●●●  [👁 t] Show / Hide

[▼] Schemas (2)                    loaded: 14:32  [⟳]
  [▼] public  (12 tables, 45 MB)                  [⟳]
        [▼] Tables (12)            loaded: 14:32  [⟳]
              users              rows: 84,201    size: 12.4 MB
              orders             rows: 312,440   size: 28.1 MB
        [▶] Views (3)
        [▶] Indexes (28)
        [▶] Triggers (2)
        [▶] Functions (5)
  [▶] analytics  (4 tables, 12 MB)
```

### Init Wizard

7-step guided setup. Runs `aptunnel init` internally — no Aptible API logic reimplemented.

```
✔  1. aptunnel check        v1.2.0 found
✔  2. config check          ~/.aptunnel/config.yaml not found
▶  3. aptible login         authenticating...
○  4. fetch envs + DBs
○  5. assign aliases & ports
○  6. detect DB types
○  7. install drivers

████████████░░░░░░░░  2/7
```

### Port Editor

3-step modal to change a tunnel's port and reconnect.

```
  Edit tunnel port
  DB: dev-db

  ✔ Step 1 — port 5433 is available
  ▶ Step 2 — confirm reconnect
  ⚠ Tunnel will be closed and reopened on new port.
  Reconnect dev-db on port 5433?
  [Y] Yes, reconnect  [N] Cancel
```

### Settings

```
Polling interval:     [5s ▾]
Auto-open tunnel:     [Ask ▾]     Ask / Always / Never
Background preload:   [ON ✓]
Log retention:        [30d ▾]
Theme:                [Dark ▾]
Name truncate at:     [18ch ▾]

─── Version info ──────────────────────────────────────
aptunnel-gui version:   1.0.0
aptunnel version:       1.2.0    [Check for update]
min aptunnel required:  1.1.0

─── Manage visibility ─────────────────────────────────
[Manage hidden envs & DBs →]

─── Danger zone ───────────────────────────────────────
[✕ Clear all cache]    [Redo init wizard]
```

### Logs

```
Filter: env [all ▾]  level [all ▾]  date [today ▾]
──────────────────────────────────────────────────────
14:33:12  WARN   dev / dev-elastic    conn attempt 3/5
14:33:08  INFO   dev / dev-elastic    tunnel opening
14:32:55  INFO   dev / dev-db         schema loaded (public.Tables)
14:32:30  INFO   dev / dev-redis      tunnel up :55555
14:30:10  INFO   app                  startup, polling every 5s
```

---

## Keyboard Reference

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

```
~/.aptunnel-gui/
  settings.json          — user preferences
  cache/
    <env-alias>/
      <db-alias>.json    — cached schema data per database
  logs/
    YYYY-MM-DD.log       — daily log files (auto-rotated)
```

aptunnel's own config stays at `~/.aptunnel/config.yaml` — aptunnel-gui never modifies it directly except through the Config Editor screen.

---

## Platform Support

| Platform | Status | Notes |
|---|---|---|
| **Linux** | ✅ Full | Tested on Ubuntu 22.04+ |
| **macOS** | ✅ Full | Tested on macOS 13+ |
| **Windows** | ✅ Full | Tested on Windows 11 / PowerShell 7 |
| **WSL** | ✅ Full | Treated as Linux |

CI runs 3 OS × 3 Node versions (18, 20, 22) on every push.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local dev setup, project layout, and the release process.

---

## Donate

If this tool saves you time, consider supporting development:

- [GitHub Sponsors](https://github.com/sponsors/biyro02)
- [Ko-fi](https://ko-fi.com/biyro02)

---

## License

MIT — see [LICENSE](LICENSE).
