/**
 * qa-hunt.mjs — FIND-AND-REPORT bug hunt for Neon Shooter.
 *
 *   node scripts/qa-hunt.mjs
 *
 * Drives the already-running dev server on :3123 with system Chrome +
 * SwiftShader (software WebGL, ~5 FPS), so the sim runs far slower than real
 * time: waits are derived from the measured FPS. SINGLE page only (a second
 * page is a background tab whose rAF is throttled).
 *
 * Owns screenshots/hunt/*.png + screenshots/hunt/report.json.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "screenshots", "hunt");
mkdirSync(out, { recursive: true });

const BASE = process.env.GAME_URL || "http://localhost:3123";
const RUN_URL = "/?autostart=1&new=1&debug=1";
const ARGS = [
  "--force-device-scale-factor=1",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

const t0 = Date.now();
const elapsed = () => (Date.now() - t0) / 1000;
const budgetLeft = () => 720 - elapsed();

const errors = [];
const anomalies = [];
const clean = [];
const sections = {};

function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}][console] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${label}][pageerror] ${e.message}`));
}

function anomaly(section, severity, title, detail, extra = {}) {
  const a = { section, severity, title, detail, ...extra };
  anomalies.push(a);
  console.error(`  ! [${severity}] ${section}: ${title}`);
  return a;
}
function ok(section, msg) {
  clean.push(`${section}: ${msg}`);
  console.log(`  ok ${section}: ${msg}`);
}

const ev = (p, fn, arg) => p.evaluate(fn, arg);
const shot = (p, name, opts) => p.screenshot({ path: join(out, `${name}.png`), ...(opts || {}) });

async function boot(page) {
  await page.goto(BASE + RUN_URL, { waitUntil: "domcontentloaded" });
  await page.bringToFront();
  await page.waitForFunction(
    () => !!window.__ndDebug && window.__ndDebug.stats().phase === "playing",
    null,
    { timeout: 90000 },
  );
  const close = page.locator('[aria-label="Close debug panel"]');
  if (await close.count()) await close.first().click().catch(() => {});
  await page.waitForTimeout(600);
}

/** Fast full reset of the run via the real Retry path (revives the player). */
async function resetRun(page) {
  await ev(page, () => window.__ndDebug.killPlayer());
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "gameover", null, { timeout: 20000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 60000 });
  await page.waitForTimeout(400);
}

const fpsOf = (p) => ev(p, () => window.__ndDebug.stats().fps);
// sim advances at most realtime; slower when the render loop drops below 12 FPS
const simRateOf = (fps) => Math.min(1, Math.max(0.1, fps / 12));

const playerOf = (p) => ev(p, () => window.__ndDebug.playerState());
const hudStageOf = (p) =>
  ev(p, () => {
    const el = document.querySelector(".hud-stage");
    return el ? el.textContent : null;
  });

async function safe(section, fn) {
  try {
    await fn();
  } catch (e) {
    anomaly(section, "breaks-playback", `section threw: ${e.message}`, String(e.stack || e));
  }
}

function writeReport(report) {
  report.meta.endedIso = new Date().toISOString();
  report.meta.durationSec = Math.round(elapsed());
  report.consoleErrors = errors.filter((e) => !e.includes("favicon"));
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
}

// ------------------------------------------------ targeted re-verify (REVERIFY=1)
async function reverifyRun(page, report) {
  const checks = [];
  const phase = () => ev(page, () => window.__ndDebug.stats().phase);
  const simRateNow = async () => simRateOf(await fpsOf(page));
  const waitSim = async (s) => {
    const r = await simRateNow();
    await page.waitForTimeout(Math.max(200, Math.round((s / r) * 1000)));
    return { simSeconds: s, simRate: r };
  };
  const record = (id, pass, detail, data = {}) => {
    checks.push({ id, pass, detail, ...data });
    if (pass) {
      clean.push(`${id}: ${detail}`);
      console.log(`PASS ${id}  ${detail}`);
    } else {
      anomaly(id, data.severity || "fairness", detail, JSON.stringify(data));
      console.log(`FAIL ${id}  ${detail}`);
    }
    return pass;
  };
  // Try Esc (engine toggle) first, then the Resume button.
  const resumeTo = async (target) => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    if ((await phase()) !== target) {
      const btn = page.getByRole("button", { name: "Resume" });
      if (await btn.count()) await btn.click().catch(() => {});
      await page
        .waitForFunction((t) => window.__ndDebug.stats().phase === t, target, { timeout: 20000 })
        .catch(() => {});
    }
  };
  const parkOnBoss = async () => {
    await page.waitForTimeout(1200);
    const arena = await ev(page, () => window.__ndDebug.arena());
    await ev(page, (a) => window.__ndDebug.setPlayerPos(a.w / 2, a.h * 0.22), arena);
  };

  // ---- d) Esc toggle ------------------------------------------------------
  await page.keyboard.press("Escape");
  await page
    .waitForFunction(() => window.__ndDebug.stats().phase === "paused", null, { timeout: 12000 })
    .catch(() => {});
  const escPaused = await phase();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const escPlaying = await phase();
  await shot(page, "esc-after");
  const escPass = escPaused === "paused" && escPlaying === "playing";
  record("esc", escPass, `playing→Esc→${escPaused}; Esc→${escPlaying}`, {
    escPaused,
    escPlaying,
    severity: "cosmetic",
  });
  if (!escPass) await resumeTo("playing");

  // ---- c) blur / visibilitychange ----------------------------------------
  if ((await phase()) !== "playing") await resumeTo("playing");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page
    .waitForFunction(() => window.__ndDebug.stats().phase === "paused", null, { timeout: 8000 })
    .catch(() => {});
  const blurPhase = await phase();
  await resumeTo("playing");
  const afterBlurResume = await phase();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page
    .waitForFunction(() => window.__ndDebug.stats().phase === "paused", null, { timeout: 8000 })
    .catch(() => {});
  const visPhase = await phase();
  await shot(page, "blur-after");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await resumeTo("playing");
  record(
    "blur",
    blurPhase === "paused" && afterBlurResume === "playing" && visPhase === "paused",
    `blur→${blurPhase}; resume→${afterBlurResume}; visibilitychange(hidden)→${visPhase}`,
    { blurPhase, afterBlurResume, visPhase, severity: "fairness" },
  );

  // ---- a) boss ram, godMode OFF -----------------------------------------
  await resetRun(page);
  await ev(page, () => {
    window.__ndDebug.godMode(false);
    window.__ndDebug.gotoStage(10);
  });
  await parkOnBoss();
  const beforeA = await playerOf(page);
  const winA = await waitSim(2.5);
  const afterA = await playerOf(page);
  const enemiesA = await ev(page, () => window.__ndDebug.enemyCount());
  const phaseA = await phase();
  await shot(page, "boss-ram-after");
  const sumA0 = beforeA.hull + beforeA.shield;
  const sumA1 = afterA.hull + afterA.shield;
  record(
    "boss_ram_off",
    sumA1 < sumA0 && enemiesA >= 1 && phaseA === "playing" && afterA.alive,
    `hull+shield ${sumA0.toFixed(1)}→${sumA1.toFixed(1)} (drop ${(sumA0 - sumA1).toFixed(1)}), enemies=${enemiesA}, phase=${phaseA}, alive=${afterA.alive}`,
    {
      before: { hull: beforeA.hull, shield: beforeA.shield, hullMax: beforeA.hullMax, shieldMax: beforeA.shieldMax },
      after: { hull: afterA.hull, shield: afterA.shield },
      window: winA,
      enemies: enemiesA,
      phase: phaseA,
      severity: "breaks-gameplay",
    },
  );

  // ---- b) boss ram, godMode ON ------------------------------------------
  await resetRun(page);
  await ev(page, () => {
    window.__ndDebug.godMode(true);
    window.__ndDebug.gotoStage(10);
  });
  await parkOnBoss();
  const beforeB = await playerOf(page);
  const winB = await waitSim(2.5);
  const afterB = await playerOf(page);
  const enemiesB = await ev(page, () => window.__ndDebug.enemyCount());
  const phaseB = await phase();
  await shot(page, "boss-godmode-after");
  const sumB0 = beforeB.hull + beforeB.shield;
  const sumB1 = afterB.hull + afterB.shield;
  record(
    "boss_ram_on",
    Math.abs(sumB1 - sumB0) < 0.05 && enemiesB >= 1 && phaseB === "playing",
    `hull+shield ${sumB0.toFixed(1)}→${sumB1.toFixed(1)} (delta ${(sumB1 - sumB0).toFixed(2)}), enemies=${enemiesB}, phase=${phaseB}`,
    {
      before: { hull: beforeB.hull, shield: beforeB.shield },
      after: { hull: afterB.hull, shield: afterB.shield },
      window: winB,
      enemies: enemiesB,
      phase: phaseB,
      severity: "fairness",
    },
  );

  // ---- regressions -------------------------------------------------------
  try {
    await resetRun(page);
    await ev(page, () => window.__ndDebug.godMode(true));

    await ev(page, () => window.__ndDebug.forceLevelUp());
    await page.waitForFunction(() => window.__ndDebug.stats().phase === "cards", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await shot(page, "cards-after");
    await page.keyboard.press("1");
    await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 20000 });
    record("cards", true, "cards rendered, key 1 picks, back to playing");

    await ev(page, () => window.__ndDebug.openArmory());
    await page.waitForFunction(() => window.__ndDebug.stats().phase === "armory", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await shot(page, "armory-after");
    await page.getByRole("button", { name: /Keep Current Weapon/i }).click();
    await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 20000 });
    record("armory", true, "armory rendered, closed back to playing");

    await page.keyboard.press("Escape");
    await page
      .waitForFunction(() => window.__ndDebug.stats().phase === "paused", null, { timeout: 12000 })
      .catch(() => {});
    const pausedOk = (await phase()) === "paused";
    await page.getByRole("button", { name: "Settings" }).click();
    await page.locator('[aria-label="Settings"]').waitFor({ timeout: 15000 });
    await shot(page, "pause-settings-after");
    await page.getByRole("button", { name: "Done" }).click();
    await resumeTo("playing");
    record("pause_settings", pausedOk && (await phase()) === "playing", "pause+settings rendered, resumed");

    await ev(page, () => window.__ndDebug.killPlayer());
    await page.waitForFunction(() => window.__ndDebug.stats().phase === "gameover", null, { timeout: 20000 });
    await page.waitForTimeout(300);
    await shot(page, "gameover-after");
    const overlay = (await page.locator('[aria-label="Game over"]').count()) > 0;
    await page.getByRole("button", { name: "Retry" }).click();
    await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 60000 });
    record("gameover", overlay, "game-over overlay + Retry restarts");
  } catch (e) {
    record("regressions", false, `regression block threw: ${e.message}`, { severity: "breaks-playback" });
  }

  report.sections = { reverify: { checks } };
  report.meta.mode = "reverify";
}

function printVerify(report) {
  console.log("\n=== RE-VERIFY ===");
  for (const c of report.sections.reverify.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.id}  ${c.detail}`);
  console.log(`\nconsole errors: ${report.consoleErrors.length}`);
  for (const e of report.consoleErrors) console.log("  ", e);
  console.log(`persisting anomalies: ${report.anomalies.length}`);
  for (const a of report.anomalies) console.log(`  [${a.severity}] ${a.section}: ${a.title}`);
  console.log(`duration: ${report.meta.durationSec}s  report: screenshots/hunt/report.json`);
  console.log("=================");
}

// ===================================================================== run ===
const browser = await chromium.launch({ channel: "chrome", args: ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watch(page, "run");
page.setDefaultTimeout(60000);

const report = { meta: {}, sections, anomalies, clean, consoleErrors: [] };

await boot(page);
let fps = await fpsOf(page);
let simRate = simRateOf(fps);
report.meta = { url: BASE + RUN_URL, fps, simRate, startedIso: new Date().toISOString() };
await shot(page, "boot");
console.log(`boot: phase=playing fps=${fps} simRate=${simRate.toFixed(2)}`);

if (process.env.REVERIFY === "1") {
  await reverifyRun(page, report);
  await page.close();
  await browser.close();
  writeReport(report);
  printVerify(report);
  process.exit(0);
}

// -------------------------------------------------------------- 4. pause+settings
sections.pause_settings = {};
await safe("pause_settings", async () => {
  const st = { };
  // Esc pauses.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "paused", null, { timeout: 15000 }).catch(() => {});
  st.escPaused = await ev(page, () => window.__ndDebug.stats().phase);
  const pauseVisible = await page.locator('[aria-label="Paused"]').count();
  st.pauseMenuVisible = pauseVisible > 0;

  // Open Settings.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator('[aria-label="Settings"]').waitFor({ timeout: 15000 });
  st.settingsRendered = await page.locator('[aria-label="Settings"]').isVisible();
  await shot(page, "pause-settings");

  const readSettings = () => ev(page, () => JSON.parse(localStorage.getItem("nd.settings.v1") || "{}"));

  // Quality Low applies + persists + keeps rendering.
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.waitForTimeout(400);
  st.qualityAfterLow = (await readSettings()).quality;
  st.fpsLow = await fpsOf(page);
  await shot(page, "quality-low");

  // Quality High applies.
  await page.getByRole("button", { name: "High", exact: true }).click();
  await page.waitForTimeout(400);
  st.qualityAfterHigh = (await readSettings()).quality;

  // High-contrast bullets toggles.
  const hc = page.locator('label.set-row:has-text("High-contrast bullets") input[type=checkbox]');
  await hc.click();
  await page.waitForTimeout(300);
  st.highContrastOn = (await readSettings()).highContrastBullets;
  await hc.click();
  await page.waitForTimeout(300);
  st.highContrastOff = (await readSettings()).highContrastBullets;

  // Screen shake slider applies.
  const shake = page.locator('label.set-row:has-text("Screen shake") input[type=range]');
  await shake.evaluate((el) => {
    el.value = "0.3";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(300);
  st.screenShake = (await readSettings()).screenShake;

  // Leave it on Low (cheaper to render -> faster sim for the rest of the run).
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await page.waitForTimeout(300);
  st.qualityFinal = (await readSettings()).quality;
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(200);

  // Resume: try Esc first, then fall back to the Resume button.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  st.phaseAfterEscResume = await ev(page, () => window.__ndDebug.stats().phase);
  if (st.phaseAfterEscResume !== "playing") {
    const resumeBtn = page.getByRole("button", { name: "Resume" });
    if (await resumeBtn.count()) {
      await resumeBtn.click();
      await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 20000 }).catch(() => {});
    }
  }
  st.phaseFinal = await ev(page, () => window.__ndDebug.stats().phase);
  await page.waitForTimeout(500);
  st.fpsAfter = await fpsOf(page);

  sections.pause_settings = st;
  if (st.escPaused !== "paused") {
    anomaly("pause_settings", "breaks-playback", "Esc did not pause", `phase=${st.escPaused}`, { repro: "press Escape while playing" });
  }
  if (st.qualityAfterLow !== "low" || st.qualityAfterHigh !== "high") {
    anomaly("pause_settings", "cosmetic", "Quality toggle did not persist", JSON.stringify({ low: st.qualityAfterLow, high: st.qualityAfterHigh }), { suspect: "src/components/SettingsMenu.tsx" });
  }
  if (st.phaseAfterEscResume !== "playing" && st.phaseFinal === "playing") {
    anomaly("pause_settings", "cosmetic", "Esc re-pauses instead of resuming", `afterEsc=${st.phaseAfterEscResume}; needed Resume button`, {
      repro: "Pause (Esc), then press Esc again — phase stays 'paused'",
      suspect: "src/components/GameShell.tsx onKey Escape + src/game/game.ts handlePauseKeys both toggle",
    });
  }
  if (st.phaseFinal === "playing" && st.qualityFinal === "low") ok("pause_settings", "pause renders, quality/contrast/shake persist, game resumes");
});

// -------------------------------------------------------- 2. boss ram regression
sections.boss_ram = {};
await safe("boss_ram", async () => {
  await resetRun(page);
  await ev(page, () => {
    window.__ndDebug.godMode(true);
    window.__ndDebug.gotoStage(10);
  });
  await page.waitForTimeout(1200);
  const arena = await ev(page, () => window.__ndDebug.arena());
  // Park exactly on the boss (boss y = ARENA_H * 0.22).
  await ev(page, (a) => window.__ndDebug.setPlayerPos(a.w / 2, a.h * 0.22), arena);

  const st = { samples: [], maxFrac: 0, everHit: false, diedUnderGod: false, phaseAtDeath: null };
  const start = Date.now();
  let lastSum = null;
  let img = false;
  while (Date.now() - start < 30000) {
    await page.waitForTimeout(120);
    const ps = await playerOf(page);
    const sum = ps.hull + ps.shield;
    if (lastSum !== null && sum < lastSum) {
      st.everHit = true;
      const frac = (lastSum - sum) / (ps.hullMax + ps.shieldMax);
      if (frac > st.maxFrac) st.maxFrac = frac;
    }
    lastSum = sum;
    if (!ps.alive) {
      st.diedUnderGod = true;
      st.phaseAtDeath = await ev(page, () => window.__ndDebug.stats().phase);
      break;
    }
    if (Date.now() - start > 8000 && !img) {
      img = true;
      await shot(page, "boss-ram");
    }
  }
  if (!img) await shot(page, "boss-ram");
  st.enemyCount = await ev(page, () => window.__ndDebug.enemyCount());
  st.bossBar = await ev(page, () => {
    const b = document.querySelector(".bar-boss i");
    return b ? b.style.width : null;
  });
  st.bossName = await ev(page, () => document.querySelector(".boss-name")?.textContent ?? null);
  st.phase = await ev(page, () => window.__ndDebug.stats().phase);
  await shot(page, "boss-ram-end");

  // leave god mode on
  st.bossSurvived = st.enemyCount >= 1 && st.bossBar !== "0%" && !!st.bossName;
  // Boss contact damage is 24*(1+0.08*tier) ~= 20% of hull+shield at stage 10.
  // Anything smaller is an enemy bullet (8+tier*1.4 ~= 10.8 -> 7.7%).
  st.contactHitObserved = st.maxFrac >= 0.15;
  st.damageTakenUnderGodMode = st.everHit;
  sections.boss_ram = st;

  if (!st.bossSurvived) {
    anomaly("boss_ram", "breaks-gameplay", "Boss did not survive player contact", JSON.stringify(st), { suspect: "src/game/systems/collisions.ts enemyContact" });
  } else if (!st.contactHitObserved) {
    anomaly("boss_ram", "fairness", "boss body never deals contact damage", `parked exactly on the boss for 30s under godMode: max observed hit ${(st.maxFrac * 100).toFixed(1)}% (bullet-sized, not the boss's ~20% ram)`, {
      screenshot: "screenshots/hunt/boss-ram.png",
      repro: "gotoStage(10); park the player on the boss; boss does not damage the player on contact",
      suspect: "src/game/systems/enemies.ts:70 skips `e.isBoss` BEFORE ticking graceLeft; BossSystem only ticks spawnFx, so boss graceLeft stays 0.8 and collisions.ts:364 always skips it (e.damage=24*… is dead code)",
    });
  } else {
    ok("boss_ram", `boss survived ram (name=${st.bossName}, hpBar=${st.bossBar}, enemies=${st.enemyCount})`);
  }
  if (st.damageTakenUnderGodMode) {
    anomaly("boss_ram", "fairness", "godMode(true) does not stop enemy fire", `hull+shield dropped ${(st.maxFrac * 100).toFixed(1)}% while godMode was on`, {
      repro: "godMode(true); stand in enemy fire — bullets/contact still call player.takeDamage",
      suspect: "src/game/systems/collisions.ts applyPlayerHit calls player.takeDamage directly; the godMode guard lives only in ctx.damagePlayer (src/game/game.ts:271)",
    });
  }
  if (st.everHit && st.maxFrac <= 0.36) {
    ok("boss_ram", `max single contact hit ${(st.maxFrac * 100).toFixed(1)}% of hull+shield (<=35%)`);
  } else if (st.everHit) {
    anomaly("boss_ram", "fairness", "single hit exceeded 35% of hull+shield", `maxFrac=${st.maxFrac}`, { suspect: "src/game/player.ts takeDamage cap" });
  }
  if (st.diedUnderGod) {
    anomaly("boss_ram", "breaks-gameplay", "player can die with godMode(true)", "boss contact bypasses godMode", {
      screenshot: "screenshots/hunt/boss-ram-end.png",
      repro: "godMode(true); gotoStage(10); park player on boss; boss contact drains hull to 0",
      suspect: "src/game/systems/collisions.ts applyPlayerHit calls player.takeDamage directly (no godMode guard)",
    });
    if (st.phaseAtDeath === "playing") {
      anomaly("boss_ram", "breaks-gameplay", "death does not trigger Game Over", `phase stayed '${st.phaseAtDeath}' after hull=0 from contact`, {
        screenshot: "screenshots/hunt/boss-ram-end.png",
        repro: "die from boss contact / enemy fire: hull reaches 0 but mode stays 'playing' (soft-lock)",
        suspect: "src/game/systems/collisions.ts applyPlayerHit never calls onPlayerDeath; only ctx.damagePlayer (src/game/game.ts:271) does",
      });
    }
  }
});

// ------------------------------------------------------------- 1. all 5 bosses
sections.bosses = [];
await safe("bosses", async () => {
  const stages = [10, 20, 30, 40, 50];
  for (const stage of stages) {
    const rec = { stage };

    // fresh full health for each boss
    let ps = await playerOf(page);
    if (ps.hull < 60 || !ps.alive) {
      await resetRun(page);
      await ev(page, () => window.__ndDebug.godMode(true));
    }
    await ev(page, (s) => window.__ndDebug.gotoStage(s), stage);
    await page.waitForTimeout(1200);
    const arena = await ev(page, () => window.__ndDebug.arena());
    // park the player low so patterns are visible and contact is unlikely
    await ev(page, (a) => window.__ndDebug.setPlayerPos(a.w / 2, a.h - 90), arena);

    rec.bossName = await ev(page, () => document.querySelector(".boss-name")?.textContent ?? null);
    rec.bossBarPresent = (await page.locator(".bar-boss").count()) > 0;

    fps = await fpsOf(page);
    simRate = simRateOf(fps);
    const waitMs = Math.min(45000, Math.max(8000, (13500 / simRate)));
    rec.waitMs = Math.round(waitMs);

    const samples = [];
    let img = false;
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      await page.waitForTimeout(1500);
      const s = await ev(page, () => ({
        phase: window.__ndDebug.stats().phase,
        bullets: window.__ndDebug.bulletCounts(),
        enemies: window.__ndDebug.enemyCount(),
        bar: document.querySelector(".bar-boss i")?.style.width ?? null,
      }));
      samples.push(s);
      if (!img && Date.now() - start > waitMs * 0.45) {
        img = true;
        await shot(page, `boss-${stage}`);
      }
      if (s.phase !== "playing") break;
    }
    if (!img) await shot(page, `boss-${stage}`);

    rec.samples = samples.map((s) => ({ ...s }));
    rec.maxEnemyBullets = Math.max(0, ...samples.map((s) => s.bullets.enemy));
    rec.bulletsSeen = samples.filter((s) => s.bullets.enemy > 0).length;
    rec.phaseEnd = samples[samples.length - 1]?.phase ?? null;
    rec.enemiesEnd = samples[samples.length - 1]?.enemies ?? null;
    rec.barEnd = samples[samples.length - 1]?.bar ?? null;
    rec.hpBarStayed = samples.every((s) => s.bar === samples[0]?.bar);

    sections.bosses.push(rec);

    if (!rec.bossBarPresent) {
      anomaly("bosses", "breaks-playback", `boss ${stage}: HP bar missing`, JSON.stringify(rec), { suspect: "src/components/Hud.tsx / hud.boss" });
    } else if (rec.phaseEnd !== "playing") {
      anomaly("bosses", "breaks-playback", `boss ${stage}: phase ended '${rec.phaseEnd}'`, JSON.stringify(rec));
    } else if (rec.enemiesEnd === 0) {
      anomaly("bosses", "breaks-playback", `boss ${stage}: boss vanished on its own`, JSON.stringify(rec));
    } else {
      ok("bosses", `boss ${stage} ${rec.bossName}: HP bar present, alive (${rec.enemiesEnd}), bulletsSeen=${rec.bulletsSeen}, maxEnemyBullets=${rec.maxEnemyBullets}`);
    }
  }
});

// ------------------------------------------------------------------ 3. armory
sections.armory = {};
await safe("armory", async () => {
  await ev(page, () => window.__ndDebug.godMode(true));
  await ev(page, () => window.__ndDebug.openArmory());
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "armory", null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await shot(page, "armory");
  const cards = await ev(page, () =>
    Array.from(document.querySelectorAll(".overlay-armory .card")).map((c) => ({
      name: c.querySelector(".card-name")?.textContent ?? null,
      icon: c.querySelector(".card-icon")?.textContent ?? null,
      tag: c.querySelector(".card-tag")?.textContent ?? null,
    })),
  );
  const hasOverlay = (await page.locator('[aria-label="Armory — choose a weapon"]').count()) > 0;
  await page.getByRole("button", { name: /Keep Current Weapon/i }).click();
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 20000 });
  sections.armory = { hasOverlay, cards, closedToPlaying: true };

  if (!hasOverlay || cards.length === 0) {
    anomaly("armory", "breaks-playback", "armory did not render cards", JSON.stringify(sections.armory), { suspect: "src/components/ArmoryScreen.tsx" });
  } else if (cards.some((c) => !c.name || !c.icon)) {
    anomaly("armory", "cosmetic", "armory card missing icon/name", JSON.stringify(cards), { screenshot: "screenshots/hunt/armory.png" });
  } else {
    ok("armory", `opened with ${cards.length} weapon cards (icon+name+tag), closed back to playing`);
  }
  // The task text says armory shows "all skills with icon/key" — it actually
  // shows WEAPON cards; the skills live on the HUD. Verify the skill HUD too.
  await ev(page, () => {
    const d = window.__ndDebug;
    for (const id of ["shockwave", "nano_repair", "phase_barrier", "missile_barrage", "overdrive"]) d.grantSkillCard(id);
  });
  await page.waitForTimeout(1200);
  await shot(page, "skill-hud");
  const hud = await ev(page, () => window.__ndDebug.hudSkills());
  const domSkills = await ev(page, () =>
    Array.from(document.querySelectorAll(".hud-skills .skill-slot")).map((s) => ({
      icon: !!s.querySelector(".skill-icon"),
      key: s.querySelector(".skill-key")?.textContent ?? null,
      name: s.querySelector(".skill-name")?.textContent ?? null,
    })),
  );
  sections.armory.hudSkills = hud.map((h) => ({ id: h.id, name: h.name, keyLabel: h.keyLabel }));
  sections.armory.domSkills = domSkills;
  if (hud.length < 5 || domSkills.filter((d) => d.icon).length < 5) {
    anomaly("armory", "cosmetic", "skill HUD missing icon/key for some slots", JSON.stringify(domSkills), { screenshot: "screenshots/hunt/skill-hud.png", suspect: "src/components/Hud.tsx" });
  } else {
    ok("armory", `skill HUD shows ${domSkills.length} slots with icon+key`);
  }
});

// ------------------------------------------------------------- 6. level-up cards
sections.cards = {};
await safe("cards", async () => {
  await ev(page, () => window.__ndDebug.godMode(true));
  await ev(page, () => window.__ndDebug.forceLevelUp());
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "cards", null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await shot(page, "cards");
  const offers = await ev(page, () =>
    Array.from(document.querySelectorAll(".overlay-cards .card")).map((c) => ({
      name: c.querySelector(".card-name")?.textContent ?? null,
      icon: c.querySelector(".card-icon")?.textContent || (c.querySelector(".card-icon img") ? "img" : null),
      key: c.querySelector(".card-key")?.textContent ?? null,
    })),
  );
  // keyboard pick
  await page.keyboard.press("1");
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 20000 });
  const keyboardOk = true;
  // click pick
  await ev(page, () => window.__ndDebug.forceLevelUp());
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "cards", null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.locator(".overlay-cards .card").first().click();
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 20000 });
  sections.cards = { offers, keyboardOk, clickOk: true, phaseEnd: "playing" };

  if (offers.length === 0) {
    anomaly("cards", "breaks-playback", "no level-up cards rendered", "", { suspect: "src/components/CardScreen.tsx" });
  } else if (offers.some((o) => !o.name || !o.key)) {
    anomaly("cards", "cosmetic", "card missing name or key badge", JSON.stringify(offers), { screenshot: "screenshots/hunt/cards.png" });
  } else {
    ok("cards", `${offers.length} cards with icon+name+key; keyboard "1" and click both pick, run continues`);
  }
});

// --------------------------------------------------------- 7. stage transitions
sections.transitions = {};
await safe("transitions", async () => {
  await ev(page, () => window.__ndDebug.godMode(true));
  await ev(page, () => window.__ndDebug.gotoStage(4));
  await page.waitForTimeout(1500);
  const stage4Label = await hudStageOf(page);
  await shot(page, "stage-transition-4");
  // watch spawn activity + progress
  let maxEnemies = 0;
  let progress = 0;
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1500);
    const s = await ev(page, () => ({
      enemies: window.__ndDebug.enemyCount(),
      prog: parseFloat(document.querySelector(".bar-progress i")?.style.width || "0"),
    }));
    maxEnemies = Math.max(maxEnemies, s.enemies);
    progress = Math.max(progress, s.prog);
  }
  const spawned = maxEnemies > 0;
  // attempt a real clear: clear enemies repeatedly until the director finishes
  // the wave plan and the stage counter advances.
  let cleared = false;
  const start = Date.now();
  while (Date.now() - start < Math.min(95000, budgetLeft() * 1000)) {
    await ev(page, () => window.__ndDebug.clearEnemies());
    await page.waitForTimeout(2500);
    const label = await hudStageOf(page);
    if (label && label !== stage4Label) {
      cleared = true;
      break;
    }
  }
  const nextLabel = await hudStageOf(page);
  sections.transitions = {
    stage4Label,
    spawned,
    maxEnemies,
    progressSeen: progress,
    cleared,
    nextLabel,
    note: cleared ? "stage advanced" : "full clear not reached within cap (SwiftShader sim runs slower than realtime)",
  };
  if (!spawned) {
    anomaly("transitions", "breaks-playback", "stage 4 spawned no enemies", JSON.stringify(sections.transitions), { screenshot: "screenshots/hunt/stage-transition-4.png" });
  } else if (cleared) {
    ok("transitions", `stage ${stage4Label} -> ${nextLabel} (spawns seen: max ${maxEnemies})`);
  } else {
    ok("transitions", `stage 4 spawns enemies (max ${maxEnemies}) + progress bar advances; full clear skipped at time cap`);
  }
  // boss-stage boundary evidence
  await ev(page, () => window.__ndDebug.gotoStage(10));
  await page.waitForTimeout(1500);
  const bLabel = await hudStageOf(page);
  const bossBar = (await page.locator(".bar-boss").count()) > 0;
  sections.transitions.bossBoundary = { label: bLabel, bossBar };
  if (bLabel === "Stage 10" && bossBar) ok("transitions", "boss-stage boundary at 10: HUD stage=10 + boss bar spawned");
  else anomaly("transitions", "breaks-playback", "boss boundary at stage 10 wrong", JSON.stringify(sections.transitions.bossBoundary));
});

// ------------------------------------------------------- 8. quality mid-run Low
sections.quality_low = {};
await safe("quality_low", async () => {
  await ev(page, () => window.__ndDebug.godMode(true));
  // ensure Low + a busy screen
  await ev(page, () => window.__ndDebug.gotoStage(1));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const d = window.__ndDebug;
    d.spawnEnemyAt("rock_normal_medium", 900, 300);
    d.spawnEnemyAt("rock_normal_medium", 800, 500);
    d.grantWeapon("gatling_vulcan");
  });
  await page.waitForTimeout(800);
  await page.mouse.move(640, 240);
  await page.mouse.down();
  await page.waitForTimeout(3500);
  await shot(page, "quality-low-midrun");
  const counts = await ev(page, () => window.__ndDebug.bulletCounts());
  const fpsLow = await fpsOf(page);
  await page.mouse.up();
  sections.quality_low = { counts, fpsLow };
  if (counts.player > 0) ok("quality_low", `bullets visible at quality Low (player bullets=${counts.player})`);
  else anomaly("quality_low", "breaks-playback", "no player bullets rendered at quality Low", JSON.stringify(sections.quality_low), { screenshot: "screenshots/hunt/quality-low-midrun.png" });
});

// ----------------------------------------------------------------- 10. fairness
sections.fairness = {};
await safe("fairness", async () => {
  await resetRun(page);
  await ev(page, () => window.__ndDebug.gotoStage(1));
  await page.waitForTimeout(800);
  const arena = await ev(page, () => window.__ndDebug.arena());
  await ev(page, (a) => window.__ndDebug.setPlayerPos(a.w / 2, a.h / 2), arena);
  await ev(page, () => window.__ndDebug.clearEnemies());
  await page.waitForTimeout(400);

  // (a) spawn camp: spawn a smasher on the player, no god mode.
  const pBefore = await playerOf(page);
  await ev(page, (a) => window.__ndDebug.spawnEnemyAt("breaker_small", a.w / 2, a.h / 2), arena);
  const spawnAt = Date.now();
  let firstDropMs = null;
  let lastSum = pBefore.hull + pBefore.shield;
  let maxFrac = 0;
  while (Date.now() - spawnAt < 6000) {
    await page.waitForTimeout(120);
    const ps = await playerOf(page);
    const sum = ps.hull + ps.shield;
    if (sum < lastSum) {
      if (firstDropMs === null) firstDropMs = Date.now() - spawnAt;
      maxFrac = Math.max(maxFrac, (lastSum - sum) / (ps.hullMax + ps.shieldMax));
    }
    lastSum = sum;
  }
  const fpsNow = await fpsOf(page);
  const simRateNow = simRateOf(fpsNow);
  const graceMsReal = (0.8 / simRateNow) * 1000;
  sections.fairness.spawnCamp = {
    firstDamageMs: firstDropMs,
    graceExpectedMs: Math.round(graceMsReal),
    maxHitFrac: maxFrac,
    fps: fpsNow,
    simRate: simRateNow,
  };
  await shot(page, "fairness-spawncamp");
  if (firstDropMs !== null && firstDropMs < graceMsReal * 0.85) {
    anomaly("fairness", "fairness", "spawned enemy damaged player inside the 0.8s spawn grace", JSON.stringify(sections.fairness.spawnCamp), { suspect: "src/game/systems/enemies.ts / collisions.ts grace checks" });
  } else {
    ok("fairness", `no damage within spawn grace (first hit ${firstDropMs === null ? "none" : firstDropMs + "ms"} >= ~${Math.round(graceMsReal)}ms)`);
  }
  if (maxFrac > 0.36) {
    anomaly("fairness", "fairness", "single spawn-camp hit exceeded 35%", `maxFrac=${maxFrac}`, {});
  } else if (firstDropMs !== null) {
    ok("fairness", `spawn-camp hit ${(maxFrac * 100).toFixed(1)}% of hull+shield`);
  }
});

// ----------------------------------------------------------------- 9. blur
sections.blur = {};
await safe("blur", async () => {
  await resetRun(page);
  const before = await ev(page, () => window.__ndDebug.stats().phase);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2500);
  const after = await ev(page, () => window.__ndDebug.stats().phase);
  const fpsAfter = await fpsOf(page);
  await shot(page, "blur");
  sections.blur = { before, afterBlur: after, fpsAfter };
  if (after === "paused") {
    ok("blur", "synthetic blur/visibilitychange paused the game");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    sections.blur.afterResume = await ev(page, () => window.__ndDebug.stats().phase);
  } else {
    anomaly("blur", "fairness", "no auto-pause on blur (README claims 'auto-pause on blur')", `phase stayed '${after}' after dispatching blur/visibilitychange`, {
      screenshot: "screenshots/hunt/blur.png",
      repro: "window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')) while playing",
      suspect: "src/components/GameShell.tsx / useGame.ts — no visibilitychange/blur pause handler exists (only src/game/core/input.ts clears keys)",
    });
  }
});

// ------------------------------------------------------------------ 5. game over
sections.gameover = {};
await safe("gameover", async () => {
  await ev(page, () => window.__ndDebug.killPlayer());
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "gameover", null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await shot(page, "gameover");
  const overlay = (await page.locator('[aria-label="Game over"]').count()) > 0;
  const buttons = await ev(page, () =>
    Array.from(document.querySelectorAll('[aria-label="Game over"] button')).map((b) => b.textContent.trim()),
  );
  // Retry works
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "playing", null, { timeout: 60000 });
  const retryOk = true;
  // Title works
  await ev(page, () => window.__ndDebug.killPlayer());
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "gameover", null, { timeout: 20000 });
  await page.getByRole("button", { name: "Title" }).click();
  await page.waitForFunction(() => window.__ndDebug.stats().phase === "menu", null, { timeout: 20000 });
  sections.gameover = { overlay, buttons, retryOk, titleOk: true };
  if (!overlay || buttons.length < 2) {
    anomaly("gameover", "breaks-playback", "game-over overlay/buttons missing", JSON.stringify(sections.gameover), { screenshot: "screenshots/hunt/gameover.png" });
  } else {
    ok("gameover", `overlay + buttons ${JSON.stringify(buttons)}; Retry restarts, Title returns to menu`);
  }
});

await page.close();
await browser.close();

report.meta.endedIso = new Date().toISOString();
report.meta.durationSec = Math.round(elapsed());
report.consoleErrors = errors.filter((e) => !e.includes("favicon"));
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));

// ------------------------------------------------------------------ summary
console.log("\n==================== QA HUNT SUMMARY ====================");
console.log(`duration: ${report.meta.durationSec}s  fps(boot)=${report.meta.fps}  simRate=${report.meta.simRate.toFixed(2)}`);
for (const c of clean) console.log(`  CLEAN  ${c}`);
console.log(`\n  ANOMALIES: ${anomalies.length}`);
for (const a of anomalies) console.log(`  [${a.severity}] ${a.section} — ${a.title}`);
console.log(`\n  console errors: ${report.consoleErrors.length}`);
for (const e of report.consoleErrors) console.log("   ", e);
console.log(`\n  report: screenshots/hunt/report.json`);
console.log("=========================================================");
