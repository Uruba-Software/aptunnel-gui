/**
 * useMouse — ANSI SGR mouse tracking for Ink apps.
 *
 * Usage:
 *   useMouse((event) => { ... });  // event: { x, y, button, type }
 *
 * Also exposes a global click dispatcher and region registry for
 * components that want positional click handling.
 */
import { useEffect } from 'react';
import { useStdin } from 'ink';

// ─── Global region registry ──────────────────────────────────────────────────

/** @type {{ x1:number, y1:number, x2:number, y2:number, cb:Function }[]} */
const regions = [];

/**
 * Register a rectangular clickable region (1-indexed terminal coords).
 * Returns an unregister function.
 */
export function registerClickRegion(x1, y1, x2, y2, cb) {
  const region = { x1, y1, x2, y2, cb };
  regions.push(region);
  return () => {
    const i = regions.indexOf(region);
    if (i >= 0) regions.splice(i, 1);
  };
}

/**
 * Global raw mouse event handlers (for useMouse hook consumers).
 * @type {Set<Function>}
 */
const rawHandlers = new Set();

// ─── ANSI escape parsing ──────────────────────────────────────────────────────

// SGR format:  ESC [ < Pb ; Px ; Py M  (press)  or  m  (release)
const SGR_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
// Legacy VT200: ESC [ M bxy  (3 bytes for button, col, row; all offset by 32)
const VT200_RE = /\x1b\[M([\x20-\xff])([\x20-\xff])([\x20-\xff])/;

function parseAndDispatch(chunk) {
  const str = chunk.toString('binary');

  // SGR (preferred — works for large terminals)
  SGR_RE.lastIndex = 0;
  let m;
  while ((m = SGR_RE.exec(str)) !== null) {
    const btn = parseInt(m[1]);
    const x   = parseInt(m[2]);
    const y   = parseInt(m[3]);
    const released = m[4] === 'm';
    const event = { x, y, button: btn & 3, type: released ? 'mouseup' : 'mousedown' };
    dispatch(event);
  }

  // VT200 fallback
  const vt = str.match(VT200_RE);
  if (vt) {
    const btn = vt[1].charCodeAt(0) - 32;
    const x   = vt[2].charCodeAt(0) - 32;
    const y   = vt[3].charCodeAt(0) - 32;
    dispatch({ x, y, button: btn & 3, type: 'mousedown' });
  }
}

function dispatch(event) {
  // Notify raw handlers
  for (const h of rawHandlers) h(event);

  // Hit-test registered regions (only on mousedown)
  if (event.type === 'mousedown') {
    // Iterate in reverse so later-registered (inner) regions win
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (event.x >= r.x1 && event.x <= r.x2 && event.y >= r.y1 && event.y <= r.y2) {
        r.cb(event);
        break;
      }
    }
  }
}

// ─── Enable / disable mouse reporting ────────────────────────────────────────

let enabled = false;

function enableMouse() {
  if (enabled) return;
  enabled = true;
  process.stdout.write('\x1b[?1000h'); // basic click tracking
  process.stdout.write('\x1b[?1006h'); // SGR extended mode (large terminal support)
}

function disableMouse() {
  if (!enabled) return;
  enabled = false;
  process.stdout.write('\x1b[?1000l');
  process.stdout.write('\x1b[?1006l');
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useMouse(handler)
 * Calls handler on every mouse event: { x, y, button, type }
 * Must be called inside a component that has stdin access.
 */
export function useMouse(handler) {
  const { stdin } = useStdin();

  useEffect(() => {
    enableMouse();

    const onData = (chunk) => parseAndDispatch(chunk);
    stdin.on('data', onData);
    rawHandlers.add(handler);

    return () => {
      stdin.off('data', onData);
      rawHandlers.delete(handler);
      if (rawHandlers.size === 0) disableMouse();
    };
  }, [stdin, handler]);
}

// Clean up on process exit
process.on('exit', disableMouse);
process.on('SIGINT', () => { disableMouse(); process.exit(0); });
