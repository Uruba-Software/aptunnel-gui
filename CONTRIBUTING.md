# Contributing to aptunnel-gui

## Prerequisites

You'll need these installed before setting up the project:

- **[Node.js](https://nodejs.org)** 18+ — use [nvm](https://github.com/nvm-sh/nvm) (Linux/macOS) or [nvm-windows](https://github.com/coreybutler/nvm-windows) (Windows) to manage versions
- **[aptunnel](https://www.npmjs.com/package/aptunnel)** — `npm install -g aptunnel`
- **[Aptible CLI](https://www.aptible.com/docs/cli)** — required to run aptunnel-gui end-to-end during development
- **Git**

---

## Local dev setup

```bash
git clone https://github.com/Uruba-Software/aptunnel-gui.git
cd aptunnel-gui
npm install
npm run dev       # tsup --watch — rebuilds dist/ on every source change
```

In a second terminal:

```bash
npm start         # node dist/index.js
```

---

## OS-specific notes

### macOS / Linux

No special setup needed. `npm run dev` and `npm start` work out of the box.

To make the dev build available as a global `aptunnel-gui` command while working on it:

```bash
npm link
```

This symlinks `dist/index.js` to your global bin. Run `npm run build` once first so `dist/index.js` exists.

### Windows

Use **PowerShell 7** (not cmd or PowerShell 5). [Windows Terminal](https://aka.ms/terminal) is recommended for the best Ink rendering.

```powershell
# Install PowerShell 7 if not already installed
winget install Microsoft.PowerShell
```

All `npm` scripts work on Windows as-is. If you run into permission errors with `npm link`, open PowerShell as Administrator.

**Note:** Ink requires a real TTY. Running `npm start` inside VS Code's embedded terminal or certain CI runners without a proper TTY will show a "Raw mode is not supported" error — this is expected in those contexts. Use Windows Terminal or a full terminal emulator.

### WSL

Treated as Linux. Use the Linux setup above. If you're connecting to Aptible from WSL, make sure the [Aptible CLI](https://www.aptible.com/docs/cli) is installed inside WSL, not just on the Windows host.

---

## Run tests

```bash
npm test          # unit tests — no live aptunnel or Aptible account required
npm run lint      # ESLint
npm run build     # production build to dist/
```

Tests use Jest with Node.js ESM mode. All test suites run in under 2 seconds on a cold machine.

**What's covered:**
- All reducer actions and state transitions (`appReducer.test.js`)
- Tunnel output and status output parsing (`aptunnel.test.js`)
- Config YAML → app state mapping (`storage.test.js`)
- Constants integrity — Status labels, Screen names, DB types, defaults (`constants.test.js`)
- semver version comparison helpers (`versionCheck.test.js`)

**What requires a live environment (not automated):**
- `aptunnel init` / `aptunnel login` subprocess flows
- DB-specific schema queries (pg, mysql2, ioredis, @elastic/elasticsearch)
- Full screen rendering

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
    useTerminalSize.js      Terminal resize listener
  components/
    AppLayout.js            Header + footer wrapper present on every screen
    StatusBadge.js          Colored inverse pill (UP/DOWN/CONN) and status dot (●)
    MarqueeText.js          Fixed-width text cell that scrolls on focus — no layout shift
    ProgressBar.js          Text-based progress bar (████░░░░ 3/7)
    PortEditor.js           3-step port change modal
  screens/
    Dashboard.js            Env/DB accordion, column layout, hide/show, keyboard nav
    InitWizard.js           7-step setup wizard
    DbDetail.js             Per-DB schema browser, credentials toggle
    Settings.js             App preferences
    Logs.js                 Scrollable log viewer
    ConfigEditor.js         Visual editor for ~/.aptunnel/config.yaml
__tests__/
  appReducer.test.js
  aptunnel.test.js
  constants.test.js
  storage.test.js
  versionCheck.test.js
```

---

## Making changes

1. Fork the repo and create a feature branch.
2. Make your changes. Add or update tests in `__tests__/` for any new logic.
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
