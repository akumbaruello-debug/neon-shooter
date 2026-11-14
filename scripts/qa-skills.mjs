/**
 * QA: prove all 18 skills activate and change observable game state.
 *   node scripts/qa-skills.mjs
 *
 * Writes screenshots/skills-report.json and prints PASS/FAIL tables.
 * Exits non-zero if any skill FAILs.
 *
 * Headless Chrome only has software WebGL (SwiftShader) at ~5 FPS, so the
 * simulation runs slower than real time — waits are deliberately long. A single
 * page is used throughout: a background tab auto-pauses (blur), so it would
 * never reach phase === "playing".
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

// ---------------------------------------------------------------- skill table
// Mirrors src/game/data/skills.ts. The expected aggregate is the CUMULATIVE sum
// of levels[0..L-1] (the spec); "only the newest level" is the bug under test.
const PASSIVES = [
  { id: "reinforced_hull", effect: "max_hull_flat", levels: [15, 15, 20, 20, 25] },
  { id: "overcharged_rounds", effect: "damage_pct", levels: [8, 8, 9, 9, 12] },
  { id: "rapid_loader", effect: "fire_rate_pct", levels: [7, 7, 8, 8, 12] },
  { id: "crit_core", effect: "crit", levels: [5, 5, 6, 6, 8] },
  { id: "tungsten_tips", effect: "pierce_flat", levels: [1, 1, 1, 1, 2] },
  { id: "thrusters", effect: "move_speed_pct", levels: [6, 6, 7, 7, 10] },
  { id: "magnet_coil", effect: "pickup_radius_pct", levels: [25, 25, 25, 25, 25] },
  { id: "shield_matrix", effect: "shield_flat", levels: [10, 10, 10, 15, 15] },
  { id: "thorn_plating", effect: "thorns", levels: [12, 14, 16, 18, 25] },
  { id: "orbital_drones", effect: "drones", levels: [1, 0, 1, 0, 1] },
];

const ALL_SKILL_IDS = [
  ...PASSIVES.map((p) => p.id),
  "shockwave",
  "nano_repair",
  "phase_barrier",
  "missile_barrage",
  "gravity_well",
  "overdrive",
  "chrono_slip",
  "ion_storm",
];

function expectedFor(p, L) {
  const sum = p.levels.slice(0, L).reduce((a, b) => a + b, 0);
  switch (p.effect) {
    case "max_hull_flat": {
      const m = { maxHullFlat: sum };
      if (L >= 5) m.damageReduction = 0.15;
      return m;
    }
    case "damage_pct":
      return { damagePct: sum };
    case "fire_rate_pct":
      return { fireRatePct: sum };
    case "crit": {
      const m = { critChance: sum / 100 };
      if (L >= 5) m.critDamage = 0.4;
      return m;
    }
    case "pierce_flat":
      return { pierceFlat: sum };
    case "move_speed_pct":
      return { moveSpeedPct: sum };
    case "pickup_radius_pct":
      return { pickupRadiusPct: sum, xpPct: 10 * L };
    case "shield_flat":
      return { shieldFlat: sum };
    case "thorns":
      return { thornsDamage: sum };
    case "drones":
      return { drones: sum };
    default:
      return {};
  }
}

// Each active batch fits the 5 skill slots (1..5). Slots are assigned in grant
// order, so index i in the batch maps to the key String(i + 1).
const ACTIVE_BATCHES = [
  ["shockwave", "nano_repair", "phase_barrier", "missile_barrage", "overdrive"],
  ["gravity_well", "chrono_slip", "ion_storm"],
];

// ---------------------------------------------------------------------- utils
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  runUrl: RUN_URL,
  missingApi: [],
  actives: [],
  passives: [],
  errors: [],
  summary: { total: 0, passed: 0, failed: 0 },
};

function hasApi(name) {
  return page.evaluate((n) => typeof window.__ndDebug[n] === "function", name);
}

const sleep = (page, ms) => page.waitForTimeout(ms);

async function readPlayer(page) {
  return page.evaluate(() => window.__ndDebug.playerState());
}
async function readStats(page) {
  return page.evaluate(() => window.__ndDebug.stats());
}
async function enemyCount(page) {
  return page.evaluate(() => window.__ndDebug.enemyCount());
}
async function readBulletCount(page) {
  return page.evaluate(() => {
    const d = window.__ndDebug;
    if (typeof d.bulletCounts === "function") {
      const b = d.bulletCounts();
      return b.player ?? b.playerBullets ?? null;
    }
    return null;
  });
}
async function skillState(page) {
  return page.evaluate(() => window.__ndDebug.skillState());
}
async function passiveMods(page) {
  return page.evaluate(() => window.__ndDebug.passiveMods());
}
async function setSkillLevel(page, id, level) {
  await page.evaluate(([i, l]) => window.__ndDebug.setSkillLevel(i, l), [id, level]);
}

/**
 * The dev server is being edited live: a Fast Refresh can reload the page and
 * drop window.__ndDebug mid-run. Re-boot and re-grant the active batch if so.
 */
let CURRENT_BATCH = [];
async function ensureGame(page) {
  let ok = false;
  try {
    ok = await page.evaluate(() => !!window.__ndDebug && !!window.__ndDebug.arena);
  } catch {
    ok = false; // navigation destroyed the context
  }
  if (ok) return false;
  await boot(page);
  if (CURRENT_BATCH.length) {
    await page.evaluate((ids) => {
      for (const id of ids) window.__ndDebug.grantSkillCard(id);
    }, CURRENT_BATCH);
    await sleep(page, 800);
  }
  return true;
}

/** Reset pools/enemies and buffer the level so kill-XP cannot open card screens. */
async function resetScene(page) {
  await ensureGame(page);
  await page.evaluate(() => window.__ndDebug.gotoStage(1));
  await sleep(page, 700);
  await page.evaluate(() => {
    const d = window.__ndDebug;
    d.godMode(true);
    d.setLevel(300); // xpToNext is huge here, so pickups never queue a level-up
    d.clearEnemies();
    d.setPlayerPos(960, 540);
  });
  await sleep(page, 900);
}

/**
 * Spawn a ring of enemies at arena centre, then teleport the player onto them.
 * `spawnEnemyAt` enforces MIN_SPAWN_DIST_FROM_PLAYER (350), so the player is
 * parked far away while spawning (else the ring is pushed out of reach) and
 * moved onto the cluster afterwards.
 */
async function clusterAndCenter(page, defId, count, radius) {
  await page.evaluate(
    ([id, n, r]) => {
      const d = window.__ndDebug;
      const a = d.arena();
      const cx = a.w / 2;
      const cy = a.h / 2;
      d.setPlayerPos(cx, a.h - 60); // >= 350 from every cluster point
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        d.spawnEnemyAt(id, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      }
      d.setPlayerPos(cx, cy); // now sit on the cluster
      return { cx, cy };
    },
    [defId, count, radius],
  );
}

/** Damages the player with 4 ram rocks, then re-enables god mode. Returns hulls. */
async function damagePlayer(page) {
  await page.evaluate(() => window.__ndDebug.godMode(false));
  await clusterAndCenter(page, "rock_normal_large", 4, 24);
  const hull0 = (await readPlayer(page)).hull;
  let hull = hull0;
  for (let t = 0; t < 18; t++) {
    await sleep(page, 900);
    const p = await readPlayer(page);
    hull = p.hull;
    if (!p.alive) break;
    if (p.hull < p.hullMax) break;
  }
  // Stop further contact damage; repair must still heal.
  await page.evaluate(() => window.__ndDebug.godMode(true));
  return { hullBefore: hull, damaged: hull < 100 };
}

// ------------------------------------------------------------------ actives
async function clickKey(page, key) {
  await page.keyboard.press(key);
}

async function testActive(page, id, slot, key) {
  const entry = { id, kind: "active", slot, key, pass: false, evidence: {} };
  try {
    await resetScene(page);
    const hasBulletCounts = await hasApi("bulletCounts");
    const hasEnemyTS = await hasApi("enemyTimeScale");

    const st0 = await skillState(page);
    entry.evidence.grantedSlot = st0[slot]?.id ?? "";

    // ---- per-skill scene setup (before pressing the key)
    if (id === "shockwave" || id === "gravity_well" || id === "ion_storm") {
      await clusterAndCenter(page, "rock_normal_small", 24, 90);
    } else if (id === "phase_barrier") {
      entry.evidence.invulnBefore = (await readPlayer(page)).invuln;
    } else if (id === "overdrive") {
      entry.evidence.modsBefore = await passiveMods(page);
    } else if (id === "missile_barrage") {
      entry.evidence.bulletsBefore = hasBulletCounts ? await readBulletCount(page) : null;
      entry.evidence.entitiesBefore = (await readStats(page)).entities;
    } else if (id === "nano_repair") {
      entry.evidence.damage = await damagePlayer(page);
    } else if (id === "chrono_slip") {
      entry.evidence.enemyTSBefore = hasEnemyTS ? await page.evaluate(() => window.__ndDebug.enemyTimeScale()) : null;
    }

    const enemiesBefore = (await enemyCount(page)) || 0;

    // ---- the real key press (regression: this used to leave cooldown at 0)
    await clickKey(page, key);
    await sleep(page, 1100);
    const st1 = await skillState(page);
    const cd = st1[slot]?.cooldown ?? 0;
    entry.evidence.cooldownAfterKey = Number(cd.toFixed(2));
    entry.evidence.cooldownMax = st1[slot]?.cooldownMax ?? 0;

    const checks = [];
    checks.push({ name: "key activates slot", pass: cd > 0, detail: `cooldown=${cd.toFixed(2)}` });

    // ---- effect checks
    if (id === "shockwave" || id === "gravity_well") {
      await sleep(page, 1400);
      const after = (await enemyCount(page)) || 0;
      const drop = enemiesBefore - after;
      entry.evidence.enemiesBefore = enemiesBefore;
      entry.evidence.enemiesAfter = after;
      checks.push({ name: "enemies die (aoe)", pass: drop >= 10, detail: `drop=${drop}` });
    } else if (id === "ion_storm") {
      let after = enemiesBefore;
      for (let t = 0; t < 16; t++) {
        await sleep(page, 1000);
        after = (await enemyCount(page)) || 0;
        if (enemiesBefore - after >= 10) break;
      }
      entry.evidence.enemiesBefore = enemiesBefore;
      entry.evidence.enemiesAfter = after;
      checks.push({ name: "ion strikes kill", pass: enemiesBefore - after >= 10, detail: `drop=${enemiesBefore - after}` });
    } else if (id === "nano_repair") {
      const hull0 = entry.evidence.damage.hullBefore;
      let hull = hull0;
      for (let t = 0; t < 12; t++) {
        await sleep(page, 800);
        hull = (await readPlayer(page)).hull;
        if (hull > hull0 + 0.5) break;
      }
      entry.evidence.hullBefore = Number(hull0.toFixed(1));
      entry.evidence.hullAfter = Number(hull.toFixed(1));
      checks.push({
        name: "hull rises",
        pass: entry.evidence.damage.damaged && hull > hull0 + 0.5,
        detail: `${hull0.toFixed(1)} -> ${hull.toFixed(1)} (damaged=${entry.evidence.damage.damaged})`,
      });
    } else if (id === "phase_barrier") {
      const inv = (await readPlayer(page)).invuln;
      entry.evidence.invulnAfter = inv;
      checks.push({ name: "invuln true", pass: inv === true, detail: `invuln=${inv}` });
    } else if (id === "missile_barrage") {
      await sleep(page, 700);
      if (hasBulletCounts) {
        const b1 = await readBulletCount(page);
        entry.evidence.bulletsAfter = b1;
        checks.push({
          name: "player bullets jump",
          pass: (b1 ?? 0) - (entry.evidence.bulletsBefore ?? 0) >= 5,
          detail: `${entry.evidence.bulletsBefore} -> ${b1}`,
        });
      } else {
        const e1 = (await readStats(page)).entities;
        entry.evidence.entitiesAfter = e1;
        checks.push({
          name: "entities jump",
          pass: e1 - entry.evidence.entitiesBefore >= 5,
          detail: `${entry.evidence.entitiesBefore} -> ${e1} (no bulletCounts)`,
        });
      }
    } else if (id === "overdrive") {
      const m1 = await passiveMods(page);
      entry.evidence.modsAfter = m1;
      const dfr = (m1.fireRatePct ?? 0) - (entry.evidence.modsBefore.fireRatePct ?? 0);
      const dms = (m1.moveSpeedPct ?? 0) - (entry.evidence.modsBefore.moveSpeedPct ?? 0);
      checks.push({ name: "fireRate bump", pass: dfr >= 25, detail: `+${dfr}` });
      checks.push({ name: "moveSpeed bump", pass: dms >= 10, detail: `+${dms}` });
    } else if (id === "chrono_slip") {
      if (hasEnemyTS) {
        const ts = await page.evaluate(() => window.__ndDebug.enemyTimeScale());
        entry.evidence.enemyTSAfter = ts;
        checks.push({ name: "enemy time slowed", pass: ts < 0.99, detail: `enemyTimeScale=${ts}` });
      } else {
        checks.push({ name: "enemy time slowed", pass: false, detail: "enemyTimeScale() absent -> unobservable" });
        if (!report.missingApi.includes("enemyTimeScale")) report.missingApi.push("enemyTimeScale");
      }
    }

    entry.checks = checks;
    entry.pass = checks.every((c) => c.pass);
    entry.failures = checks.filter((c) => !c.pass);
  } catch (err) {
    entry.error = String(err);
  }
  return entry;
}

/** Run an active test, retrying once after a page reload killed the context. */
async function runActive(page, batch, id, slot, key) {
  CURRENT_BATCH = batch;
  let entry = await testActive(page, id, slot, key);
  if (entry.error && /Execution context|__ndDebug|undefined|gotoStage/.test(entry.error)) {
    console.log(`  (recovering ${id} after reload)`);
    await ensureGame(page);
    entry = await testActive(page, id, slot, key);
  }
  report.actives.push(entry);
  console.log(`  active ${id}: ${entry.pass ? "PASS" : "FAIL"}`);
  return entry;
}

// ------------------------------------------------------------------ passives
async function zeroAllSkills(page) {
  await page.evaluate((ids) => {
    for (const id of ids) window.__ndDebug.setSkillLevel(id, 0);
  }, ALL_SKILL_IDS);
}

async function testPassive(page, p) {
  const entry = { id: p.id, kind: "passive", effect: p.effect, pass: false, checks: [], evidence: {} };
  try {
    await ensureGame(page);
    await zeroAllSkills(page);
    await sleep(page, 250);
    const base = await passiveMods(page);

    await setSkillLevel(page, p.id, 5);
    await sleep(page, 400);
    const lvl5 = await passiveMods(page);

    await setSkillLevel(page, p.id, 1);
    await sleep(page, 400);
    const lvl1 = await passiveMods(page);

    const exp5 = expectedFor(p, 5);
    const exp1 = expectedFor(p, 1);
    entry.evidence.expectedLevel5 = exp5;
    entry.evidence.expectedLevel1 = exp1;
    entry.evidence.actualLevel5Delta = {};
    entry.evidence.actualLevel1Delta = {};
    for (const k of Object.keys(exp5)) {
      entry.evidence.actualLevel5Delta[k] = Number(((lvl5[k] ?? 0) - (base[k] ?? 0)).toFixed(4));
    }
    for (const k of Object.keys(exp1)) {
      entry.evidence.actualLevel1Delta[k] = Number(((lvl1[k] ?? 0) - (base[k] ?? 0)).toFixed(4));
    }

    for (const k of Object.keys(exp5)) {
      const got = (lvl5[k] ?? 0) - (base[k] ?? 0);
      entry.checks.push({
        name: `L5 ${k}`,
        pass: Math.abs(got - exp5[k]) <= 0.001,
        detail: `expected ${exp5[k]}, got ${Number(got.toFixed(4))}`,
      });
    }
    for (const k of Object.keys(exp1)) {
      const got = (lvl1[k] ?? 0) - (base[k] ?? 0);
      entry.checks.push({
        name: `L1 ${k}`,
        pass: Math.abs(got - exp1[k]) <= 0.001,
        detail: `expected ${exp1[k]}, got ${Number(got.toFixed(4))}`,
      });
    }

    // orbital_drones: also prove the game state actually consumes drones.
    if (p.id === "orbital_drones") {
      await page.evaluate(() => window.__ndDebug.gotoStage(1)); // clears bullet pools
      await sleep(page, 600);
      await setSkillLevel(page, "orbital_drones", 5); // earlier L1 check left it at 1
      await page.evaluate(() => window.__ndDebug.clearEnemies());
      const dronesApi = await page.evaluate(() => {
        if (typeof window.__ndDebug.drones === "function") return window.__ndDebug.drones();
        return null;
      });
      const bulletsBefore = await readBulletCount(page);
      const enemiesBefore = await enemyCount(page);
      await sleep(page, 5000);
      const bulletsAfter = await readBulletCount(page);
      const enemiesAfter = await enemyCount(page);
      entry.evidence.dronesApi = dronesApi;
      entry.evidence.playerBullets = { before: bulletsBefore, after: bulletsAfter };
      entry.evidence.enemies = { before: enemiesBefore, after: enemiesAfter };
      // Player is not firing (autoFire off, no mouse): any player bullet proves
      // a drone fired.
      const consumed = (bulletsAfter ?? 0) > (bulletsBefore ?? 0);
      entry.checks.push({
        name: "drones fire (consumed by game)",
        pass: consumed,
        detail:
          `playerBullets ${bulletsBefore} -> ${bulletsAfter}, enemies ${enemiesBefore} -> ${enemiesAfter}` +
          (dronesApi == null ? " (drones() absent)" : `, drones()=${JSON.stringify(dronesApi)}`),
      });
      if (dronesApi == null && !report.missingApi.includes("drones")) report.missingApi.push("drones");
    }

    entry.pass = entry.checks.every((c) => c.pass);
    entry.failures = entry.checks.filter((c) => !c.pass);
  } catch (err) {
    entry.error = String(err);
  }
  return entry;
}

/** Run a passive test, retrying once after a page reload killed the context. */
async function runPassive(page, p) {
  let entry = await testPassive(page, p);
  if (entry.error && /Execution context|__ndDebug|undefined|setSkillLevel/.test(entry.error)) {
    console.log(`  (recovering ${p.id} after reload)`);
    await ensureGame(page);
    entry = await testPassive(page, p);
  }
  report.passives.push(entry);
  console.log(`  passive ${p.id}: ${entry.pass ? "PASS" : "FAIL"}`);
  return entry;
}

// -------------------------------------------------------------------- main
const browser = await chromium.launch({ channel: "chrome", args: ARGS });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watch(page);

  // Batch 1 of actives
  await boot(page);
  CURRENT_BATCH = ACTIVE_BATCHES[0];
  await page.evaluate((ids) => {
    for (const id of ids) window.__ndDebug.grantSkillCard(id);
  }, ACTIVE_BATCHES[0]);
  await sleep(page, 800);
  for (let i = 0; i < ACTIVE_BATCHES[0].length; i++) {
    await runActive(page, ACTIVE_BATCHES[0], ACTIVE_BATCHES[0][i], i, String(i + 1));
  }

  // Reload so the skill map is cleared, then batch 2.
  await boot(page);
  CURRENT_BATCH = ACTIVE_BATCHES[1];
  await page.evaluate((ids) => {
    for (const id of ids) window.__ndDebug.grantSkillCard(id);
  }, ACTIVE_BATCHES[1]);
  await sleep(page, 800);
  for (let i = 0; i < ACTIVE_BATCHES[1].length; i++) {
    await runActive(page, ACTIVE_BATCHES[1], ACTIVE_BATCHES[1][i], i, String(i + 1));
  }

  // Passives (setSkillLevel bypasses the 5-slot cap; zeroing isolates each one).
  for (const p of PASSIVES) await runPassive(page, p);
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

report.summary.total = report.actives.length + report.passives.length;
report.summary.passed =
  report.actives.filter((e) => e.pass).length + report.passives.filter((e) => e.pass).length;
report.summary.failed = report.summary.total - report.summary.passed;
report.errors = errors.filter((e) => !e.includes("favicon"));

writeFileSync(join(outDir, "skills-report.json"), JSON.stringify(report, null, 2));

// ------------------------------------------------------------------- stdout
function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

console.log("\n=== ACTIVE SKILLS ===");
console.log(pad("skill", 18) + pad("key", 4) + pad("cd", 8) + pad("result", 8) + "detail");
for (const e of report.actives) {
  const cd = e.evidence?.cooldownAfterKey ?? "-";
  const detail = (e.checks ?? [])
    .map((c) => `${c.name}:${c.pass ? "ok" : "NO"}(${c.detail})`)
    .join("  ");
  console.log(pad(e.id, 18) + pad(e.key, 4) + pad(cd, 8) + pad(e.pass ? "PASS" : "FAIL", 8) + (e.error || detail));
}

console.log("\n=== PASSIVE SKILLS (cumulative levels[0..L-1]) ===");
console.log(pad("skill", 20) + pad("L5 exp/act", 26) + pad("L1 exp/act", 20) + "result");
for (const e of report.passives) {
  const e5 = JSON.stringify(e.evidence?.expectedLevel5 ?? {});
  const a5 = JSON.stringify(e.evidence?.actualLevel5Delta ?? {});
  const e1 = JSON.stringify(e.evidence?.expectedLevel1 ?? {});
  const a1 = JSON.stringify(e.evidence?.actualLevel1Delta ?? {});
  console.log(
    pad(e.id, 20) + pad(`${e5} / ${a5}`, 26) + pad(`${e1} / ${a1}`, 20) + (e.pass ? "PASS" : "FAIL"),
  );
  if (!e.pass) {
    for (const f of e.failures ?? []) console.log(`    FAIL ${f.name}: ${f.detail}`);
    if (e.error) console.log(`    ERROR ${e.error}`);
  }
}

if (report.missingApi.length) console.log(`\nmissing debug API: ${report.missingApi.join(", ")}`);
console.log(`\n${report.summary.passed}/${report.summary.total} skills PASS, ${report.summary.failed} FAIL`);
console.log(`report: ${join(outDir, "skills-report.json")}`);
if (report.errors.length) {
  console.error(`${report.errors.length} console error(s):`);
  for (const e of report.errors.slice(0, 20)) console.error(" ", e);
}

process.exit(report.summary.failed > 0 ? 1 : 0);