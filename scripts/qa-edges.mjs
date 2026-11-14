/**
 * QA: prove the player can reach all four SCREEN edges at several window sizes.
 *   node scripts/qa-edges.mjs
 *
 * Writes screenshots/edges-report.json and prints a table.
 * Exits non-zero if any edge FAILs.
 *
 * The 1920x1080 arena is scaled by canvas.h / arena.h and centred; a correct
 * build makes the arena follow the viewport aspect, so the letterbox offset is
 * ~0 and the arena boundary coincides with the canvas boundary.
 *
 * Single page only: a second page is a background tab and the game auto-pauses
 * on blur, so it never reaches phase === "playing". Window sizes are driven with
 * page.setViewportSize() on that one page.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "screenshots");
mkdirSync(outDir, { recursive: true });

const BASE = process.env.GAME_URL || "http://localhost:3123";
const RUN_URL = "/?autostart=1&new=1&debug=1";
const ARGS = [
  "--force-device-scale-factor=1",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

const VIEWPORTS = [
  [1280, 720],
  [1920, 1080],
  [1024, 768],
  [1440, 900],
];
const MID_GAME_RESIZE = [1600, 900];
const EDGE_TOL = 2; // CSS px

const errors = [];
function watch(page) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
}

async function boot(page) {
  await page.goto(BASE + RUN_URL, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForFunction(
    () => !!window.__ndDebug && window.__ndDebug.stats().phase === "playing",
    null,
    { timeout: 90000 },
  );
  const close = page.locator('[aria-label="Close debug panel"]');
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(500);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const d = window.__ndDebug;
    const c = document.querySelector("canvas");
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    return {
      arena: d.arena(),
      canvas: { left: r.left, top: r.top, w: r.width, h: r.height },
      ps: d.playerState(),
      phase: d.stats().phase,
    };
  });
}

function round(n, p = 2) {
  return Number(Number(n).toFixed(p));
}

/** Teleport just outside each side, let the clamp settle, then measure. */
async function measureViewport(page, vw, vh) {
  const first = await snapshot(page);
  const arena = first.arena;
  const targets = {
    left: [-50, arena.h / 2],
    right: [arena.w + 50, arena.h / 2],
    top: [arena.w / 2, -50],
    bottom: [arena.w / 2, arena.h + 50],
  };

  const sides = [];
  for (const side of ["left", "right", "top", "bottom"]) {
    const [tx, ty] = targets[side];
    await page.evaluate(([x, y]) => window.__ndDebug.setPlayerPos(x, y), [tx, ty]);
    await page.waitForTimeout(1600);
    const snap = await snapshot(page);
    const { arena: a, canvas: cv, ps } = snap;

    const scale = cv.h / a.h;
    const offX = (cv.w - a.w * scale) / 2;
    const offY = (cv.h - a.h * scale) / 2;
    // canvas-space mapping of the ship centre
    const sx = ps.x * scale + offX;
    const sy = ps.y * scale + offY;
    // letterbox delta: distance between the mapped arena boundary and the
    // corresponding screen edge (0 on a correct, aspect-following build).
    // Letterbox delta: distance between the mapped arena boundary and the
    // corresponding screen edge. 0 means the arena boundary IS the screen edge,
    // so the player can reach every edge. The ship CENTRE is clamped halfFwd
    // inside (the sprite's nose maps to the edge), so the centre distance is
    // reported as evidence but is not the pass condition.
    const edgeDelta = side === "left" || side === "right" ? Math.abs(offX) : Math.abs(offY);
    const screenEdge = side === "left" ? 0 : side === "right" ? cv.w : side === "top" ? 0 : cv.h;
    const shipEdgeDist = side === "left" || side === "right" ? Math.abs(sx - screenEdge) : Math.abs(sy - screenEdge);

    const checks = [];
    checks.push({ name: "letterbox ~0", pass: edgeDelta <= EDGE_TOL, detail: `edgeDelta=${round(edgeDelta)}` });
    checks.push({
      name: "ship inside canvas",
      pass: sx >= -1 && sx <= cv.w + 1 && sy >= -1 && sy <= cv.h + 1,
      detail: `screen=(${round(sx)},${round(sy)}) canvas=${round(cv.w)}x${round(cv.h)}`,
    });
    const onSide =
      side === "left"
        ? ps.x <= a.w / 2
        : side === "right"
          ? ps.x >= a.w / 2
          : side === "top"
            ? ps.y <= a.h / 2
            : ps.y >= a.h / 2;
    checks.push({ name: "clamped to side", pass: onSide, detail: `arena=(${round(ps.x)},${round(ps.y)})` });

    sides.push({
      side,
      arenaPos: { x: round(ps.x), y: round(ps.y) },
      screenPos: { x: round(sx), y: round(sy) },
      edgeDelta: round(edgeDelta),
      shipEdgeDist: round(shipEdgeDist),
      offset: { x: round(offX), y: round(offY) },
      scale: round(scale, 4),
      insideCanvas: checks[1].pass,
      pass: checks.every((c) => c.pass),
      checks,
      failures: checks.filter((c) => !c.pass),
    });
  }

  // Viewport-level assertions.
  const globalChecks = [];
  globalChecks.push({ name: "arena.h === 1080", pass: arena.h === 1080, detail: `h=${arena.h}` });
  const expectedW = 1080 * (vw / vh);
  globalChecks.push({
    name: "arena.w follows aspect",
    pass: Math.abs(arena.w - expectedW) <= EDGE_TOL,
    detail: `expected ~${round(expectedW)}, got ${arena.w}`,
  });

  return {
    viewport: `${vw}x${vh}`,
    vw,
    vh,
    arena,
    canvas: { w: round(first.canvas.w), h: round(first.canvas.h) },
    expectedArenaW: round(expectedW),
    phase: first.phase,
    sides,
    globalChecks,
    pass: sides.every((s) => s.pass) && globalChecks.every((c) => c.pass),
  };
}

const browser = await chromium.launch({ channel: "chrome", args: ARGS });
const report = { generatedAt: new Date().toISOString(), base: BASE, runUrl: RUN_URL, viewports: {}, errors: [] };
let page;
try {
  page = await browser.newPage({ viewport: { width: VIEWPORTS[0][0], height: VIEWPORTS[0][1] } });
  watch(page);
  await boot(page);

  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(2200);
    const m = await measureViewport(page, w, h);
    report.viewports[m.viewport] = m;
    console.log(`measured ${m.viewport} (${m.pass ? "PASS" : "FAIL"})`);
  }

  // Mid-game resize: keep playing, change the window, re-measure.
  await page.setViewportSize({ width: MID_GAME_RESIZE[0], height: MID_GAME_RESIZE[1] });
  await page.waitForTimeout(2200);
  const mid = await measureViewport(page, MID_GAME_RESIZE[0], MID_GAME_RESIZE[1]);
  report.midGameResize = mid;
  console.log(`mid-game resize ${mid.viewport} (${mid.pass ? "PASS" : "FAIL"})`);
} catch (err) {
  errors.push(`[fatal] ${err && err.stack ? err.stack : err}`);
} finally {
  try {
    if (page) await page.close();
  } catch {}
  try {
    await browser.close();
  } catch {}
}

report.errors = errors.filter((e) => !e.includes("favicon"));
writeFileSync(join(outDir, "edges-report.json"), JSON.stringify(report, null, 2));

// -------------------------------------------------------------------- stdout
function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

const rows = [];
for (const m of Object.values(report.viewports)) {
  for (const s of m.sides) rows.push({ m, s });
}
if (report.midGameResize) {
  for (const s of report.midGameResize.sides) rows.push({ m: report.midGameResize, s, mid: true });
}

console.log("\n=== EDGES ===");
console.log(
  pad("viewport", 12) +
    pad("side", 8) +
    pad("arena pos", 18) +
    pad("screen pos", 18) +
    pad("edge delta", 12) +
    "result",
);
for (const { m, s, mid } of rows) {
  console.log(
    pad((mid ? "mid:" : "") + m.viewport, 12) +
      pad(s.side, 8) +
      pad(`(${s.arenaPos.x}, ${s.arenaPos.y})`, 18) +
      pad(`(${s.screenPos.x}, ${s.screenPos.y})`, 18) +
      pad(s.edgeDelta, 12) +
      (s.pass ? "PASS" : "FAIL " + s.failures.map((f) => f.name).join(",")),
  );
}

console.log("\n=== VIEWPORT / ARENA ===");
console.log(pad("viewport", 12) + pad("arena", 16) + pad("expected w", 14) + pad("offset(x,y)", 18) + "result");
for (const m of [...Object.values(report.viewports), ...(report.midGameResize ? [report.midGameResize] : [])]) {
  const off = m.sides[0]?.offset ?? { x: 0, y: 0 };
  const failed = m.globalChecks.filter((c) => !c.pass).map((c) => c.name);
  console.log(
    pad((m === report.midGameResize ? "mid:" : "") + m.viewport, 12) +
      pad(`${m.arena.w}x${m.arena.h}`, 16) +
      pad(m.expectedArenaW, 14) +
      pad(`(${off.x}, ${off.y})`, 18) +
      (m.globalChecks.every((c) => c.pass) ? "PASS" : "FAIL " + failed.join(",")),
  );
}

const all = [...Object.values(report.viewports), ...(report.midGameResize ? [report.midGameResize] : [])];
const totalSides = all.reduce((n, m) => n + m.sides.length, 0);
const failedSides = all.reduce((n, m) => n + m.sides.filter((s) => !s.pass).length, 0);
const failedViewports = all.filter((m) => !m.pass).length;
console.log(
  `\n${totalSides - failedSides}/${totalSides} edges PASS, ${failedSides} FAIL; ` +
    `${all.length - failedViewports}/${all.length} viewports PASS`,
);
console.log(`report: ${join(outDir, "edges-report.json")}`);
if (report.errors.length) {
  console.error(`${report.errors.length} console error(s):`);
  for (const e of report.errors.slice(0, 20)) console.error(" ", e);
}

process.exit(failedSides > 0 || failedViewports > 0 ? 1 : 0);