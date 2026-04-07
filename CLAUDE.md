# aptunnel-gui — Claude Rules

## Project Overview
Terminal GUI for the `aptunnel` npm CLI package. Built with Node.js + Ink (React for CLI).
Published as `aptunnel-gui` on npm. GitHub: `github.com/Uruba-Software/aptunnel-gui`.

---

## Hard Rules (Never Violate)

### DO NOT re-implement aptunnel logic
Always shell out to the `aptunnel` CLI via `execa`. Never replicate what aptunnel does internally.

### DO NOT block the UI thread
Every operation must be async. No synchronous heavy work. The UI must always remain responsive.

### DO NOT show credentials without explicit toggle
Passwords, connection URLs, and usernames must be hidden by default. Only reveal when user explicitly toggles visibility (`👁 Show / Hide`).

### DO NOT re-render the entire screen on status poll
Only update state atoms that have changed. Use Ink's partial re-render capabilities.

### DO NOT hardcode env/db names
All env and DB names come from `aptunnel status` output. Zero hardcoded values.

### Design decisions (from implementation prompt — locked in)
These are canonical design decisions. Do not change them without explicit instruction:
- Header: `aptunnel-gui │ env: X │ N/M tunnels up` + version right-aligned dimmed
- Status colors: UP=green inverse, DOWN=red inverse, CONN=yellow inverse
- Dashboard column order: dot | name | type | status | port | last seen
- Name truncation: fixed-width box, marquee scroll on focus (no layout shift)
- Port editor: 3-step modal (check → confirm → persist)
- Log level colors: INFO=blue, WARN=yellow, ERROR=red

---

## Tech Stack

- **Runtime:** Node.js (ESM modules — `"type": "module"` in package.json)
- **UI:** Ink v4+ (React for CLI)
- **Subprocess:** `execa` for all aptunnel CLI calls
- **DB Drivers** (lazy-installed at init time only):
  - PostgreSQL → `pg`
  - MySQL → `mysql2`
  - Redis → `ioredis`
  - Elasticsearch → `@elastic/elasticsearch`
- **Storage:** `~/.aptunnel-gui/` — settings.json, cache/, logs/

---

## aptunnel CLI Commands (exact signatures)

```
aptunnel status                              # list tunnel states
aptunnel <db_alias>                          # open single tunnel
aptunnel <db_alias> --close                  # close single tunnel
aptunnel all                                 # open all tunnels
aptunnel all --close                         # close all
aptunnel all --env=<env_alias>               # open all in env
aptunnel all --env=<env_alias> --close       # close all in env
aptunnel init                                # initial setup
aptunnel login                               # authenticate
aptunnel config --path                       # print config file path
aptunnel config --raw                        # print config with sensitive fields
```

## aptunnel config YAML location
`~/.aptunnel/config.yaml` (or `$APTUNNEL_CONFIG_HOME/config.yaml`)
NOT `~/.aptunnel-gui/config.yaml`

## aptunnel tunnel open stdout format (parse line by line)
```
✔ dev-db tunnel opened
  Port:      55554
  Host:      localhost.aptible.in
  User:      aptible
  Password:  xxxxxxxxxx
  URL:       postgresql://aptible:...@localhost.aptible.in:55554/db
  PID:       12345
```

## aptunnel config YAML schema (exact)
```yaml
version: 1
credentials:
  email: you@company.com
defaults:
  environment: my-env-development
  lifetime: 7d
environments:
  my-env-development:
    alias: dev
    databases:
      mydb-dev:
        alias: dev-db
        port: 55554
        type: postgresql
tunnel_defaults:
  start_port: 55550
  port_increment: 1
```
Env resolution: match `environments[key].alias`, not the top-level key.

---

## Status Labels
Every async operation uses exactly these states:
`idle` | `connecting` | `connected` | `disconnecting` | `failed` | `loading` | `loaded` | `error`

---

## File Structure: ~/.aptunnel-gui/
```
~/.aptunnel-gui/
  settings.json
  cache/
    <env-name>/
      <db-alias>.json    ← { schemas: [...], loadedAt: ISO, ... }
  logs/
    YYYY-MM-DD.log       ← auto-rotated, retention per settings
```
Cache files are written atomically: write to temp file, then rename. Never partial writes.

---

## Concurrency Rules
- Each DB has its own independent status object: `{ tunnel: Status, schemaLoad: Status, ... }`
- Multiple concurrent operations allowed (e.g. schema loading + tunnel open simultaneously)
- Background preload runs at lowest priority; user-triggered actions for same DB take precedence
- Use per-operation Promise tracking, not a global lock

---

## Error Handling
- All errors shown inline — never crash the app
- Every error gets an ERROR log entry in `~/.aptunnel-gui/logs/`
- Failed driver installs must show clear instructions for manual install
- aptunnel subprocess errors captured via stderr, surfaced as inline error state

---

## Version Management (startup check)
1. Check installed `aptunnel` version against bundled minimum version constant
2. If missing → auto-install
3. If outdated → auto-update
4. If `~/.aptunnel-gui/config.yaml` exists and non-empty → offer to skip init

---

## Settings Defaults
```json
{
  "pollingInterval": 5,
  "autoOpenTunnel": "ask",
  "backgroundPreload": true,
  "logRetention": 30,
  "theme": "dark"
}
```
`autoOpenTunnel` values: `"ask"` | `"always"` | `"never"`

---

## Refresh Granularity
- **Env-level refresh:** tunnel states only (aptunnel status for that env)
- **DB-level refresh:** all schema sections for that DB
- **Schema-level refresh:** tables + views + indexes + triggers + functions
- **Section-level refresh:** only that section (tables OR indexes OR etc.)

---

## Navigation: Screen Stack
Screens (never open simultaneously, stack-based navigation):
1. `InitWizard` — first run or manual trigger
2. `Dashboard` — main screen, env/db accordion list
3. `DbDetail` — full-page per-db view
4. `ConfigEditor` — aptunnel config.yaml visual editor
5. `Settings` — app preferences
6. `Logs` — scrollable log viewer

---

## npm Package Rules
- `bin`: `{ "aptunnel-gui": "./src/index.js" }`
- `engines`: `{ "node": ">=18" }`
- `postinstall`: check aptunnel version
- DB drivers in `peerDependencies` (all optional)

---

## CI / Publishing
- GitHub Actions: lint + test on PR, publish to npm on tag push
- README: full docs, features, install, usage, screenshots, donation links (GitHub Sponsors + Ko-fi)
- `design/` folder in repo: PNG mockups + SVG design templates (populated separately)
