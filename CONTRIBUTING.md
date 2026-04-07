# Contributing to aptunnel-gui

## Local dev setup

```bash
git clone https://github.com/Uruba-Software/aptunnel-gui.git
cd aptunnel-gui
npm install
npm run dev       # tsup --watch (rebuilds to dist/ on change)
```

In a second terminal:

```bash
npm start         # runs dist/index.js
```

Run tests:

```bash
npm test          # unit tests (no live aptunnel required)
npm run lint      # ESLint
npm run build     # production build to dist/
```

---

## Project layout

```
src/
  index.js                  Entry point — render(<App />, { exitOnCtrlC: false })
  App.js                    Root component — startup flow, screen router, global Ctrl+C
  constants.js              Status labels, Screen names, DbType, DEFAULT_SETTINGS, regex
  state/
    AppContext.js            React context + useAppContext hook
    appReducer.js           Full app reducer (navigation, tunnel status, hide/show, port editor, logs)
  services/
    aptunnel.js             All aptunnel CLI calls via execa — never re-implements Aptible logic
    storage.js              ~/.aptunnel-gui/ reads/writes (atomic: write to .tmp, rename)
    logger.js               Writes log entries to disk + in-memory state simultaneously
    versionCheck.js         Startup aptunnel version check using semver
    backgroundPreload.js    Sequential low-priority schema loader (cancellable)
  hooks/
    usePolling.js           Polls aptunnel status on configurable interval; updates only changed state
    useNavigation.js        push/pop/replace/quit helpers for the screen stack
    useTerminalSize.js      Terminal resize listener (stdout resize event)
  components/
    AppLayout.js            Header + footer wrapper present on every screen
    StatusBadge.js          Colored inverse pill (UP/DOWN/CONN) and status dot (●)
    MarqueeText.js          Fixed-width text cell that scrolls on focus — no layout shift
    ProgressBar.js          Text-based progress bar (████░░░░ 3/7)
    PortEditor.js           3-step port change modal (check → reconnect → persist)
  screens/
    Dashboard.js            Env/DB accordion, column layout, hide/show, keyboard nav
    InitWizard.js           7-step setup wizard — calls aptunnel init/login via subprocess
    DbDetail.js             Per-DB schema browser, credentials toggle, per-section refresh
    Settings.js             App preferences, version info, hidden items, danger zone
    Logs.js                 Scrollable log viewer with level/env/date filters and export
    ConfigEditor.js         Visual editor for ~/.aptunnel/config.yaml
__tests__/
  appReducer.test.js        All reducer actions and state transitions
  aptunnel.test.js          parseTunnelOutput, parseStatusOutput
  constants.test.js         Status labels, Screen names, regex, defaults integrity
  storage.test.js           parseEnvsFromConfig (config YAML → app state)
  versionCheck.test.js      semver version comparison helpers
```

---

## Key technical decisions

- **ESM only** — `"type": "module"` throughout. No `require()`. `execa` v9 is ESM-only.
- **tsup with `loader: { '.js': 'jsx' }`** — `.js` files contain JSX; esbuild needs the explicit loader override because the files don't use the `.jsx` extension.
- **`exitOnCtrlC: false` in `render()`** — Ink's default Ctrl+C exit is bypassed so the global `useInput` handler can log the exit event and clean up subprocesses before quitting.
- **`node_modules/jest/bin/jest.js` in test script** — `node_modules/.bin/jest` is a bash shebang script and fails on Windows PowerShell; using the `.js` path directly is cross-platform.
- **Atomic cache writes** — all cache files are written to `<path>.tmp` then renamed, preventing partial reads if the process is killed mid-write.
- **DB key format** — all per-DB state is keyed as `"envAlias/dbAlias"` (e.g. `"dev/dev-db"`), not by Aptible handle. Env resolution matches `environments[key].alias`, not the top-level YAML key.
- **Only changed state dispatched on poll** — `usePolling` compares previous tunnel states before dispatching; unchanged DBs never trigger a re-render.
- **`Set` for expandedEnvs in reducer** — uses a `Set<string>` for O(1) lookup. The reducer creates a new `Set` on every toggle (immutable pattern for React reconciliation).

---

## Making changes

1. Fork the repo and create a feature branch.
2. Make your changes. Add or update tests under `__tests__/`.
3. Run `npm run build && npm test && npm run lint` — all must pass.
4. Open a pull request against `main`.

CI runs on every PR: 3 OS (Linux, macOS, Windows) × 3 Node versions (18, 20, 22) = 9 combinations.

---

## Release process (maintainers)

See [CLAUDE.md](CLAUDE.md) for the full release checklist.

Short version:
1. Bump version in `package.json`.
2. Commit and push to `main`.
3. `git tag v<version> && git push origin v<version>`
4. `gh release create v<version> --title "v<version>" --generate-notes`

CI publishes to npm automatically when a `v*` tag is pushed and all cross-platform tests pass.
