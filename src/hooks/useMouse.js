/**
 * useMouse — ANSI SGR mouse tracking for Ink apps.
 *
 * Usage:
 *   useMouse((event) => { ... });  // event: { x, y, button, type }
 *
 * Also exposes a global click dispatcher and region registry for
 * components that want positional click handling.
 *
 * IMPORTANT: The raw stdin listener is attached at module load time,
 * directly on process.stdin — NOT through Ink's useStdin. This is
 * intentional: Ink wraps stdin with readline.emitKeypressEvents()
 * which can interfere with raw escape-sequence parsing if we attach
 * after Ink initializes.
 */
import { useEffect } from 'react';

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

// Carry-over buffer for escape sequences split across multiple chunks
let _buf = '';

function parseAndDispatch(chunk) {
  // Append incoming data to carry-over buffer
  const incoming = Buffer.isBuffer(chunk) ? chunk.toString('binary') : String(chunk);
  _buf += incoming;

  // SGR (preferred — works for large terminals)
  SGR_RE.lastIndex = 0;
  let m;
  while ((m = SGR_RE.exec(_buf)) !== null) {
    const btn = parseInt(m[1]);
    const x   = parseInt(m[2]);
    const y   = parseInt(m[3]);
    const released = m[4] === 'm';
    const event = { x, y, button: btn & 3, type: released ? 'mouseup' : 'mousedown' };
    dispatch(event);
  }

  // VT200 fallback
  const vt = _buf.match(VT200_RE);
  if (vt) {
    const btn = vt[1].charCodeAt(0) - 32;
    const x   = vt[2].charCodeAt(0) - 32;
    const y   = vt[3].charCodeAt(0) - 32;
    dispatch({ x, y, button: btn & 3, type: 'mousedown' });
  }

  // Keep only the last 256 bytes in the buffer (prevents unbounded growth)
  if (_buf.length > 256) _buf = _buf.slice(-256);
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

// ─── Raw stdin listener — attached at module load, before Ink initializes ────
//
// Ink calls readline.emitKeypressEvents(stdin) during its own setup.
// If we attach AFTER that, readline may transform escape sequences before
// our listener runs. Attaching here (synchronously at import time) ensures
// we always see the raw bytes.

let _stdinAttached = false;

function attachStdinListener() {
  if (_stdinAttached) return;
  _stdinAttached = true;

  const s = process.stdin;

  // If stdin is already flowing (paused or readable), attach immediately.
  // If it's not yet available (e.g. piped), wait for it to become readable.
  if (s.readable) {
    s.on('data', parseAndDispatch);
  } else {
    s.once('readable', () => s.on('data', parseAndDispatch));
  }
}

attachStdinListener();

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useMouse(handler)
 * Calls handler on every mouse event: { x, y, button, type }
 * Must be called inside a React/Ink component.
 */
export function useMouse(handler) {
  useEffect(() => {
    enableMouse();
    rawHandlers.add(handler);

    return () => {
      rawHandlers.delete(handler);
      if (rawHandlers.size === 0) disableMouse();
    };
  }, [handler]);
}

// ─── Cleanup on exit ─────────────────────────────────────────────────────────

process.on('exit', disableMouse);
process.on('SIGINT', () => { disableMouse(); process.exit(0); });
