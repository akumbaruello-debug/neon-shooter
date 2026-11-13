/**
 * Headless integration test for Neon Dodger 2.0 (browser game).
 *
 * No external deps: a minimal DOM / Canvas / Web Audio / timing stub is built
 * in-process and the game scripts are executed with node's `vm` module.
 *
 * Two phases:
 *   PHASE A "browser-faithful": each script is run as its own vm script in a
 *     single shared context. This matches how a browser loads separate
 *     <script> tags (classic scripts share one global lexical environment), so
 *     top-level `const`/`let` redeclarations across files DO collide.
 *   PHASE B "integration/lenient": each script is wrapped in an IIFE before
 *     running, which sidesteps any top-level lexical collisions, so the whole
 *     game can actually boot and be driven for ~10 simulated seconds.
 *
 * Run: node tests/integration.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'js/contracts.js',
  'js/utils.js',
  'js/engine.js',
  'js/player.js',
  'js/enemies.js',
  'js/powerups.js',
  'js/progression.js',
  'js/audio.js',
  'js/ui.js',
  'js/main.js',
];

const results = { phaseA: null, phaseB: null };
const bugs = [];

function fmtErr(e) {
  if (!e) return String(e);
  return (e.stack || (e.name + ': ' + e.message));
}

// ---------------------------------------------------------------------------
// DOM / browser stubs
// ---------------------------------------------------------------------------

function makeClassList(el) {
  const list = {
    _set() { return new Set(String(el._class || '').split(/\s+/).filter(Boolean)); },
    _write(set) { el._class = Array.from(set).join(' '); },
    add(...names) { const s = list._set(); names.forEach(n => s.add(n)); list._write(s); },
    remove(...names) { const s = list._set(); names.forEach(n => s.delete(n)); list._write(s); },
    contains(name) { return list._set().has(name); },
    toggle(name, force) {
      const s = list._set();
      const has = s.has(name);
      const want = force === undefined ? !has : !!force;
      if (want) s.add(name); else s.delete(name);
      list._write(s);
      return want;
    },
    toString() { return el._class; },
  };
  return list;
}

function makeElement(tag, doc) {
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    _class: '',
    _text: '',
    _id: '',
    _listeners: Object.create(null),
    _attrs: Object.create(null),
    children: [],
    parentNode: null,
    style: {},
    width: 0,
    height: 0,
  };
  el.classList = makeClassList(el);

  Object.defineProperty(el, 'id', {
    get() { return el._id; },
    set(v) { el._id = String(v); if (doc) doc._byId[el._id] = el; },
    enumerable: true, configurable: true,
  });
  Object.defineProperty(el, 'className', {
    get() { return el._class; },
    set(v) { el._class = String(v); },
    enumerable: true, configurable: true,
  });
  Object.defineProperty(el, 'textContent', {
    get() {
      if (el.children.length) return el.children.map(c => c.textContent).join('');
      return el._text;
    },
    set(v) { el._text = String(v == null ? '' : v); el.children.length = 0; },
    enumerable: true, configurable: true,
  });
  Object.defineProperty(el, 'firstChild', {
    get() { return el.children.length ? el.children[0] : null; },
    enumerable: true, configurable: true,
  });
  Object.defineProperty(el, 'lastChild', {
    get() { return el.children.length ? el.children[el.children.length - 1] : null; },
    enumerable: true, configurable: true,
  });

  el.appendChild = (child) => { child.parentNode = el; el.children.push(child); return child; };
  el.append = (...nodes) => { nodes.forEach(n => el.appendChild(n)); };
  el.removeChild = (child) => {
    const i = el.children.indexOf(child);
    if (i !== -1) el.children.splice(i, 1);
    return child;
  };
  el.setAttribute = (k, v) => { el._attrs[k] = String(v); };
  el.getAttribute = (k) => (k in el._attrs ? el._attrs[k] : null);
  el.removeAttribute = (k) => { delete el._attrs[k]; };
  el.addEventListener = (type, fn) => {
    (el._listeners[type] = el._listeners[type] || []).push(fn);
  };
  el.removeEventListener = (type, fn) => {
    const l = el._listeners[type];
    if (l) { const i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); }
  };
  el.dispatchEvent = (ev) => {
    const l = el._listeners[ev && ev.type];
    if (l) l.slice().forEach(fn => fn(ev || { type: ev && ev.type, preventDefault() {}, target: el }));
    return true;
  };
  el.querySelector = () => null;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
  el.focus = () => {};
  el.click = () => el.dispatchEvent({ type: 'click', preventDefault() {} });

  return el;
}

function makeCtx(canvas) {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const ctx = {
    canvas,
    // mutable drawing state
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: 'rgba(0,0,0,0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    filter: 'none',
    direction: 'inherit',
    // path + draw API
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    transform: noop, setTransform: noop, resetTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, arcTo: noop, ellipse: noop, rect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop,
    drawImage: noop,
    setLineDash: noop,
    getLineDash: () => [],
    measureText: (t) => ({ width: String(t == null ? '' : t).length * 6 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    isPointInPath: () => false,
  };
  return ctx;
}

function makeSandbox() {
  const clock = { t: 0 };
  const doc = { _byId: Object.create(null) };

  const body = makeElement('body', doc);
  doc.body = body;
  doc.documentElement = makeElement('html', doc);
  doc.head = makeElement('head', doc);
  doc.readyState = 'complete';
  doc._listeners = Object.create(null);
  doc.addEventListener = (type, fn) => { (doc._listeners[type] = doc._listeners[type] || []).push(fn); };
  doc.removeEventListener = (type, fn) => {
    const l = doc._listeners[type];
    if (l) { const i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); }
  };
  doc.dispatchEvent = (ev) => { (doc._listeners[ev.type] || []).slice().forEach(fn => fn(ev)); return true; };
  doc.createElement = (tag) => makeElement(tag, doc);
  doc.getElementById = (id) => doc._byId[id] || null;
  doc.querySelector = (sel) => (sel === '.game-container' ? (doc._byId['gameContainer'] || null) : null);
  doc.querySelectorAll = () => [];
  doc.createEvent = () => ({ initCustomEvent() {} });

  // Pre-create the elements that index.html would have parsed.
  const container = makeElement('div', doc); container.id = 'gameContainer'; container.className = 'game-container';
  body.appendChild(container);
  const canvas = makeElement('canvas', doc); canvas.id = 'gameCanvas';
  canvas.width = 800; canvas.height = 600;
  canvas.getContext = (type) => (type === '2d' ? makeCtx(canvas) : null);
  container.appendChild(canvas);

  // localStorage
  const store = Object.create(null);
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i) => Object.keys(store)[i] || null,
    get length() { return Object.keys(store).length; },
  };

  // window event target (defined directly on the sandbox, which *is* window)
  const winListeners = Object.create(null);
  const winAdd = (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); };
  const winRemove = (type, fn) => {
    const l = winListeners[type];
    if (l) { const i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); }
  };
  const winDispatch = (ev) => {
    if (typeof ev.type === 'string' && ev.type === 'error') return true;
    (winListeners[ev.type] || []).slice().forEach(fn => fn(ev));
    return true;
  };

  // controllable rAF
  let rafId = 0;
  const rafQueue = new Map();
  // fake timers
  let timerId = 0;
  const timers = new Map();

  function fireTimers() {
    const due = [];
    for (const [id, t] of timers) if (t.due <= clock.t) due.push([id, t]);
    for (const [id, t] of due) {
      if (t.interval != null) t.due += t.interval; else timers.delete(id);
      try { t.fn(); } catch (_e) { /* recorded by caller via step() */ }
    }
  }

  const sandbox = {
    console,
    Math, JSON, Date, Number, String, Boolean, Array, Object, Set, Map, WeakMap,
    isFinite, isNaN, parseInt, parseFloat, Float32Array, Uint8Array,
    NaN: NaN, Infinity: Infinity, undefined: undefined,
    encodeURIComponent, decodeURIComponent,
    document: doc,
    localStorage,
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    addEventListener: winAdd,
    removeEventListener: winRemove,
    dispatchEvent: winDispatch,
    performance: { now: () => clock.t },
    requestAnimationFrame: (cb) => { const id = ++rafId; rafQueue.set(id, cb); return id; },
    cancelAnimationFrame: (id) => { rafQueue.delete(id); },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, due: clock.t + (+ms || 0) }); return id; },
    setInterval: (fn, ms) => { const id = ++timerId; intervalSet(id, fn, ms); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    clearInterval: (id) => { timers.delete(id); },
    queueMicrotask: (fn) => { try { fn(); } catch (_e) {} },
    // Minimal Web Audio stub.
    AudioContext: makeAudioContext,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    Event: function Event(type) { this.type = type; },
    KeyboardEvent: function KeyboardEvent(type, init) { Object.assign(this, init || {}); this.type = type; },
  };

  // setInterval needs helper so it can reschedule without recursion issues
  function intervalSet(id, fn, ms) {
    const period = +ms > 0 ? +ms : 1;
    timers.set(id, {
      fn, due: clock.t + period, interval: period,
    });
  }

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.document = doc;

  vm.createContext(sandbox);

  const api = {
    sandbox, doc, canvas,
    step(dtMs) {
      clock.t += (dtMs == null ? 16.67 : dtMs);
      fireTimers();
      const cbs = Array.from(rafQueue.values());
      rafQueue.clear();
      return cbs;
    },
    runFrames(n, dtMs, onFrame) {
      const errors = [];
      for (let i = 0; i < n; i++) {
        const cbs = api.step(dtMs);
        if (onFrame) { try { onFrame(i); } catch (e) { errors.push(e); } }
        for (const cb of cbs) {
          try { cb(clock.t); } catch (e) { errors.push(e); }
        }
      }
      return errors;
    },
    now: () => clock.t,
    pendingRaf: () => rafQueue.size,
    getGameOverShown() {
      const el = doc._byId['gameOverOverlay'];
      if (!el) return false;
      return !el.classList.contains('hidden');
    },
  };
  return api;
}

function makeAudioContext() {
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
    setValueCurveAtTime() { return this; },
  });
  const node = () => {
    const n = {
      type: 'sine', buffer: null, onended: null,
      gain: param(), frequency: param(), detune: param(),
      Q: param(), playbackRate: param(),
      connect() { return n; }, disconnect() {}, start() {}, stop() {},
    };
    return n;
  };
  const ctx = {
    state: 'running',
    sampleRate: 44100,
    currentTime: 0,
    destination: node(),
    createGain: () => node(),
    createOscillator: () => node(),
    createBiquadFilter: () => node(),
    createBufferSource: () => node(),
    createBuffer: (ch, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return ctx;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function readSources() {
  return FILES.map(f => ({ file: f, src: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
}

function loadFaithful(api) {
  const errors = [];
  for (const { file, src } of readSources()) {
    try {
      new vm.Script(src, { filename: file }).runInContext(api.sandbox);
    } catch (e) {
      errors.push({ file, error: e });
    }
  }
  return errors;
}

function loadLenient(api) {
  const errors = [];
  for (const { file, src } of readSources()) {
    const wrapped = '(function () {\n' + src + '\n})();';
    try {
      new vm.Script(wrapped, { filename: file + ' (wrapped)' }).runInContext(api.sandbox);
    } catch (e) {
      errors.push({ file, error: e });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// PHASE A - browser-faithful load
// ---------------------------------------------------------------------------

function phaseA() {
  const api = makeSandbox();
  const errors = loadFaithful(api);
  const ND = api.sandbox.ND || {};
  const defined = {
    CONST: typeof ND.CONST, Utils: typeof ND.Utils, Engine: typeof ND.Engine,
    Player: typeof ND.Player, Enemies: typeof ND.Enemies, PowerUps: typeof ND.PowerUps,
    Progression: typeof ND.Progression, Audio: typeof ND.Audio, UI: typeof ND.UI,
    startGame: typeof ND.startGame,
  };
  results.phaseA = { errors, defined };
  for (const e of errors) {
    bugs.push({
      phase: 'A', file: e.file, name: e.error.name,
      message: e.error.message, stack: e.error.stack,
    });
  }
  return results.phaseA;
}

// ---------------------------------------------------------------------------
// PHASE B - lenient load + drive the loop
// ---------------------------------------------------------------------------

function phaseB() {
  const api = makeSandbox();
  const ND = api.sandbox.ND = api.sandbox.ND || {};
  const loadErrors = loadLenient(api);

  const out = {
    loadErrors,
    bootError: null,
    frameErrors: [],
    maxParticles: 0,
    framesPlayed: 0,
    scoreAfterRun: null,
    levelAfterRun: null,
    particlesAfterRun: null,
    deadAfterRun: false,
    forceDeath: null,
    gameOverPath: null,
  };
  results.phaseB = out;

  if (loadErrors.length) {
    out.bootError = loadErrors[0].error;
    for (const e of loadErrors) {
      bugs.push({ phase: 'B', file: e.file, name: e.error.name, message: e.error.message, stack: e.error.stack });
    }
  }

  const ctx = api.sandbox.ND;
  if (!ctx || !ctx.Engine || !ctx.Player || !ctx.Progression) {
    out.bootError = out.bootError || new Error('modules not present after lenient load');
    return out;
  }

  // Exercise the real event path once (keydown listener -> input snapshot).
  try {
    api.sandbox.window.dispatchEvent({ type: 'keydown', code: 'ArrowLeft', key: 'ArrowLeft', repeat: false, preventDefault() {} });
    api.sandbox.window.dispatchEvent({ type: 'keyup', code: 'ArrowLeft', key: 'ArrowLeft', preventDefault() {} });
  } catch (e) { out.frameErrors.push(e); }

  // Start a game.
  try {
    if (typeof ctx.startGame === 'function') ctx.startGame();
    else throw new Error('ND.startGame is not a function');
  } catch (e) {
    out.bootError = e;
    bugs.push({ phase: 'B', file: 'js/main.js', name: e.name, message: 'startGame() threw: ' + e.message, stack: e.stack });
    return out;
  }

  const engine = ctx.Engine;
  const player = ctx.Player;

  const playerXY = () => {
    try { return { x: player.x, y: player.y, score: player.score, dead: player.dead }; }
    catch (e) { return { err: e }; }
  };

  // ~600 frames @16.67ms  => ~10 simulated seconds.
  const errors = api.runFrames(600, 16.67, (i) => {
    // Feed varied input directly on the engine's public input snapshot.
    engine.input.left = i < 120;
    engine.input.right = i >= 120 && i < 260;
    engine.input.left = i >= 260 && i < 300;
    engine.input.right = i >= 300 && i < 420;
    // Tap dash on a few edges.
    engine.input.dash = (i % 90 === 45);
    // Track particle high-water mark (exercises the particle getter).
    const c = engine.particles && engine.particles.count;
    if (typeof c === 'number' && c > out.maxParticles) out.maxParticles = c;
  });
  for (const e of errors) out.frameErrors.push(e);

  out.framesPlayed = 600;
  out.scoreAfterRun = player.score;
  out.levelAfterRun = ctx.Progression.getLevel();
  out.particlesAfterRun = engine.particles ? engine.particles.count : null;
  out.deadAfterRun = !!player.dead;

  for (const e of out.frameErrors) {
    bugs.push({ phase: 'B', file: 'js/*.js', name: e.name, message: 'frame error: ' + e.message, stack: e.stack });
  }

  // --- force death with takeDamage() (clearing i-frames between hits) -------
  const death = { calls: 0, died: false, errors: [], notes: [] };
  try {
    let safety = 0;
    while (!player.dead && safety < 50) {
      player.invincible = false;      // public setter clears invTimer
      death.calls++;
      player.takeDamage();
      const fe = api.runFrames(1, 16.67, null);
      for (const e of fe) death.errors.push(e);
      safety++;
    }
    death.died = !!player.dead;
    if (!death.died) death.notes.push('still alive after ' + death.calls + ' forced hits');
  } catch (e) {
    death.errors.push(e);
  }
  // Keep stepping a few frames while dead to exercise the dead-player paths.
  const postDeathErrors = api.runFrames(30, 16.67, null);
  for (const e of postDeathErrors) death.errors.push(e);
  out.forceDeath = {
    calls: death.calls,
    died: death.died,
    notes: death.notes,
    errorCount: death.errors.length,
    errors: death.errors.map(fmtErr),
  };
  for (const e of death.errors) {
    bugs.push({ phase: 'B', file: 'js/*.js', name: e.name, message: 'post-death error: ' + e.message, stack: e.stack });
  }

  // --- exercise the real game-over path (endGame -> UI.showGameOver) -------
  const go = { shown: false, frames: 0, errors: [] };
  try {
    ctx.startGame(); // revive into 'playing'
    const enemies = ctx.Enemies;
    // Let an enemy spawn.
    let guard = 0;
    while ((!enemies.list || enemies.list.length === 0) && guard < 180) {
      const fe = api.runFrames(1, 16.67, null); for (const e of fe) go.errors.push(e);
      guard++;
    }
    const target = (enemies.list || []).find(e => e && e.active);
    if (target && typeof player.x === 'number') {
      player.invincible = false;
      player.hp = 1;
      player.x = target.x;
      player.y = target.y;
      for (let i = 0; i < 120 && !api.getGameOverShown(); i++) {
        const fe = api.runFrames(1, 16.67, null); for (const e of fe) go.errors.push(e);
        go.frames++;
        if (player.dead && !api.getGameOverShown()) {
          // nudge onto another enemy if the first one got consumed
          const t2 = (enemies.list || []).find(e => e && e.active);
          if (t2) { player.invincible = false; player.x = t2.x; player.y = t2.y; }
        }
      }
      go.shown = api.getGameOverShown();
    } else {
      go.errors.push(new Error('no active enemy to collide with'));
    }
  } catch (e) {
    go.errors.push(e);
  }
  out.gameOverPath = { shown: go.shown, frames: go.frames, errorCount: go.errors.length, errors: go.errors.map(fmtErr) };
  for (const e of go.errors) {
    bugs.push({ phase: 'B', file: 'js/main.js', name: e.name, message: 'game-over path error: ' + e.message, stack: e.stack });
  }

  return out;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function report() {
  const L = [];
  L.push('=== Neon Dodger 2.0 - headless integration test ===');
  L.push('');

  const A = results.phaseA;
  L.push('--- PHASE A: browser-faithful load (one vm script per file) ---');
  L.push('files that failed to load: ' + A.errors.length + ' / ' + FILES.length);
  for (const e of A.errors) {
    L.push('  FAIL ' + e.file + '  ->  ' + e.error.name + ': ' + e.error.message);
  }
  L.push('module surface after load: ' + JSON.stringify(A.defined));
  const aOk = A.errors.length === 0;
  L.push('PHASE A: ' + (aOk ? 'PASS' : 'FAIL'));
  L.push('');

  const B = results.phaseB || {};
  L.push('--- PHASE B: lenient load (IIFE-wrapped) + 600 frames simulated ---');
  L.push('load errors: ' + (B.loadErrors ? B.loadErrors.length : 'n/a'));
  if (B.loadErrors) for (const e of B.loadErrors) L.push('  FAIL ' + e.file + ' -> ' + e.error.name + ': ' + e.error.message);
  L.push('boot error: ' + (B.bootError ? fmtErr(B.bootError) : 'none'));
  L.push('frame errors: ' + (B.frameErrors ? B.frameErrors.length : 'n/a'));
  L.push('frames driven: ' + B.framesPlayed);
  L.push('max particles observed: ' + B.maxParticles);
  L.push('score after run: ' + B.scoreAfterRun + '   (expected > 0)');
  L.push('progression level after run: ' + B.levelAfterRun + '   (expected >= 1)');
  L.push('particles live after run: ' + B.particlesAfterRun);
  L.push('player dead after run: ' + B.deadAfterRun);
  if (B.forceDeath) {
    L.push('force-death: takeDamage calls=' + B.forceDeath.calls +
      ' died=' + B.forceDeath.died + ' errors=' + B.forceDeath.errorCount +
      (B.forceDeath.notes.length ? ' notes=' + B.forceDeath.notes.join('; ') : ''));
    for (const s of B.forceDeath.errors) L.push('    ' + s);
  }
  if (B.gameOverPath) {
    L.push('game-over path: overlayShown=' + B.gameOverPath.shown +
      ' frames=' + B.gameOverPath.frames + ' errors=' + B.gameOverPath.errorCount);
    for (const s of B.gameOverPath.errors) L.push('    ' + s);
  }

  const bChecks = {
    'no load errors': (B.loadErrors || []).length === 0,
    'no boot error': !B.bootError,
    'no frame errors': (B.frameErrors || []).length === 0,
    'score increased': typeof B.scoreAfterRun === 'number' && B.scoreAfterRun > 0,
    'level >= 1': typeof B.levelAfterRun === 'number' && B.levelAfterRun >= 1,
    'particles ran': typeof B.particlesAfterRun === 'number' && B.maxParticles >= 0,
    'forced death ok': !!(B.forceDeath && B.forceDeath.died && B.forceDeath.errorCount === 0),
    'game-over path ok': !!(B.gameOverPath && B.gameOverPath.shown && B.gameOverPath.errorCount === 0),
  };
  for (const k of Object.keys(bChecks)) L.push((bChecks[k] ? '  ok   ' : '  FAIL ') + k);
  const bOk = Object.values(bChecks).every(Boolean);
  L.push('PHASE B: ' + (bOk ? 'PASS' : 'FAIL'));
  L.push('');

  L.push('--- BUGS FOUND (' + bugs.length + ') ---');
  bugs.forEach((b, i) => {
    L.push((i + 1) + '. [' + b.phase + '] ' + b.file + ' -> ' + b.name + ': ' + b.message);
  });
  L.push('');

  const overallOk = aOk && bOk;
  L.push('=== OVERALL: ' + (overallOk ? 'PASS' : 'FAIL') + ' ===');

  return { text: L.join('\n'), overallOk, aOk, bOk };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

(function main() {
  phaseA();
  phaseB();
  const r = report();
  console.log(r.text);
  if (bugs.length) {
    console.log('\n--- FULL STACK TRACES ---');
    bugs.forEach((b, i) => {
      console.log('\n#' + (i + 1) + ' [' + b.phase + '] ' + b.file + ' -> ' + b.name + ': ' + b.message);
      if (b.stack) console.log(b.stack);
    });
  }
  process.exitCode = r.overallOk ? 0 : 1;
})();
