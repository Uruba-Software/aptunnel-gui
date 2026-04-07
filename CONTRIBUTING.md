# Contributing to aptunnel-gui

Thank you for your interest in contributing! Here's everything you need to get started.

---

## Project overview

`aptunnel-gui` is a terminal GUI built with [Ink](https://github.com/vadimdemedes/ink) (React for CLI). It wraps the `aptunnel` CLI and never re-implements Aptible logic directly — all tunnel operations shell out to `aptunnel`.

Key constraint: **the UI must never block**. Every operation is async.

---

## Development setup

### Requirements

- Node.js ≥ 18
- npm ≥ 9
- `aptunnel` installed globally (`npm i -g aptunnel`)

### Clone and install

```bash
git clone https://github.com/Uruba-Software/aptunnel-gui.git
cd aptunnel-gui
npm install
```

### Run in dev mode (watch + rebuild)

```bash
npm run dev
```

This runs `tsup --watch`. In a second terminal:

```bash
npm start   # runs dist/index.js
```

### Build

```bash
npm run build
```

Output goes to `dist/index.js` (bundled ESM, ~90 KB).

---

## Project structure

```
src/
  index.js              — entry point
  App.js                — root component, screen router, startup logic
  constants.js          — Status, Screen, DbType, defaults
  state/
    AppContext.js        — React context
    appReducer.js        — full app reducer
  services/
    aptunnel.js         — all aptunnel CLI calls via execa
    storage.js          — ~/.aptunnel-gui/ reads/writes (atomic)
    logger.js           — writes to disk + in-memory state
    versionCheck.js     — startup aptunnel version check
    backgroundPreload.js — sequential low-priority schema loader
  hooks/
    usePolling.js       — polls aptunnel status on interval
    useNavigation.js    — push/pop/replace screen stack
    useTerminalSize.js  — terminal resize listener
  components/
    AppLayout.js        — header + footer wrapper
    StatusBadge.js      — colored status pill and dot
    MarqueeText.js      — fixed-width scrolling text
    ProgressBar.js      — text-based progress bar
    PortEditor.js       — 3-step port change modal
  screens/
    Dashboard.js        — main env/DB accordion list
    InitWizard.js       — 7-step setup wizard
    DbDetail.js         — per-DB schema browser
    Settings.js         — app preferences
    Logs.js             — scrollable log viewer
    ConfigEditor.js     — aptunnel config.yaml editor
__tests__/
  appReducer.test.js
  aptunnel.test.js
  constants.test.js
  storage.test.js
  versionCheck.test.js
```

---

## Running tests

```bash
npm test
```

Tests use Jest with Node.js ESM mode (`--experimental-vm-modules`). All 5 test suites run without a live `aptunnel` instance.

### What's tested

- All reducer actions and state transitions
- `parseTunnelOutput()` — parsing tunnel open stdout
- `parseStatusOutput()` — parsing status output
- `parseEnvsFromConfig()` — mapping config YAML to app state
- Constants integrity (Status labels, Screen names, DB types, defaults)
- semver version comparisons

### What's not tested (yet / needs live aptunnel)

- DB-specific schema queries (pg, mysql2, ioredis, @elastic/elasticsearch)
- `aptunnel init` / `aptunnel login` subprocess flows
- Full screen rendering (Ink component integration tests)

---

## Code style

- **ESM only** — no `require()`, no CommonJS
- **Async-first** — never block the UI thread
- **No hardcoded names** — all env/DB names come from config
- **No credential leaks** — passwords and URLs never shown without explicit user toggle
- **Lint:** `npm run lint` (ESLint, warnings allowed, errors are not)

---

## Adding a new screen

1. Create `src/screens/YourScreen.js` — export a default React component
2. Add the screen name to `Screen` in `src/constants.js`
3. Import and add it to `SCREEN_MAP` in `src/App.js`
4. Use `useNavigation().push(Screen.YOUR_SCREEN, params)` to navigate to it
5. Wrap content in `<AppLayout footer="...">` for consistent header/footer

---

## Adding a new reducer action

1. Add a `case 'ACTION_NAME':` to `appReducer.js`
2. Add a test in `__tests__/appReducer.test.js`
3. Dispatch it with `dispatch({ type: 'ACTION_NAME', ...payload })`

---

## Pull request guidelines

- Keep PRs focused — one logical change per PR
- Tests required for new logic (especially reducer actions and service functions)
- Run `npm run build && npm test && npm run lint` before opening a PR
- Describe what changed and why in the PR description
- Design changes should include screenshots or ASCII mockups

---

## Reporting issues

Open an issue at [github.com/Uruba-Software/aptunnel-gui/issues](https://github.com/Uruba-Software/aptunnel-gui/issues).

Please include:
- Your OS and Node.js version
- `aptunnel --version` output
- Steps to reproduce
- What you expected vs. what happened
