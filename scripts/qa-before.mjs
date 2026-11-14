/**
 * "BEFORE" evidence capture for the bugfix pass.
 *   node scripts/qa-before.mjs
 *
 * Headless Chrome only has software WebGL (SwiftShader) at ~5 FPS, so the
 * simulation runs slower than real time — waits are deliberately long.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "screenshots", process.env.QA_OUT || "before");
mkdirSync(out, { recursive: true });

const BASE = process.env.GAME_URL || "http://localhost:3123";
const RUN_URL = "/?autostart=1&new=1&debug=1";
const ARGS = [
  "--force-device-scale-factor=1",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

const ACTIVE_SKILLS = ["shockwave", "nano_repair", "phase_barrier", "missile_barrage", "overdrive"];
const WEAPON_IDS = [
  "focus_lance",
  "gatling_vulcan",
  "rail_charge",
  "prism_beam",
  "scatter_shot",
  "crescent_slash",
  "arc_chain",
  "plasma_orb",
  "seeker_swarm",
  "ricochet_disc",
  "boomerang_blade",
  "crossfire",
];

const errors = [];

function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${label}][console] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${label}][pageerror] ${e.message}`));
}

async function boot(page) {
  await page.goto(BASE + RUN_URL, { waitUntil: "domcontentloaded" });
  // A background tab auto-pauses (blur), so the run never reaches "playing".
  await page.bringToFront();
  await page.waitForFunction(
    () => !!window.__ndDebug && window.__ndDebug.stats().phase === "playing",
    null,
    { timeout: 60000 },
  );
  // Hide the debug panel so it does not cover the screenshots.
  const close = page.locator('[aria-label="Close debug panel"]');
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(500);
}

async function measureEdges(page) {
  const arena = await page.evaluate(() => window.__ndDebug.arena());
  const canvas = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c ? c.getBoundingClientRect() : { width: 0, height: 0 };
    return { w: r.width, h: r.height };
  });
  const scale = Math.min(canvas.w / arena.w, canvas.h / arena.h);
  const pts = {
    left: [0, arena.h / 2],
    right: [arena.w, arena.h / 2],
    top: [arena.w / 2, 0],
    bottom: [arena.w / 2, arena.h],
  };
  const edges = {};
  for (const [side, [x, y]] of Object.entries(pts)) {
    await page.evaluate(([px, py]) => window.__ndDebug.setPlayerPos(px, py), [x, y]);
    await page.waitForTimeout(1600);
    edges[side] = await page.evaluate(() => {
      const s = window.__ndDebug.playerState();
      return { x: Number(s.x.toFixed(2)), y: Number(s.y.toFixed(2)), alive: s.alive };
    });
  }
  return { arena, canvas, scale, edges };
}

const browser = await chromium.launch({ channel: "chrome", args: ARGS });
const report = { viewports: {}, skills: {}, weapons: [], errors: [] };

// ---------------------------------------------------------------- 1280x720
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watch(page, "1280x720");
await boot(page);

// 1. skill HUD
await page.evaluate((ids) => {
  const d = window.__ndDebug;
  d.godMode(true);
  for (const id of ids) d.grantSkillCard(id);
}, ACTIVE_SKILLS);
await page.waitForTimeout(2500);
await page.screenshot({
  path: join(out, "skill-hud.png"),
  clip: { x: 0, y: 720 - 160, width: 640, height: 160 },
});
console.log("skill-hud.png");

// keyboard activation: press 1..5, read each slot cooldown
const before = await page.evaluate(() => window.__ndDebug.skillState());
const keyResults = [];
for (let i = 0; i < 5; i++) {
  const key = String(i + 1);
  await page.keyboard.press(key);
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => window.__ndDebug.skillState());
  keyResults.push({
    slot: i,
    key,
    id: st[i]?.id ?? "",
    cooldownAfterKey: Number((st[i]?.cooldown ?? 0).toFixed(2)),
    cooldownMax: st[i]?.cooldownMax ?? 0,
    fired: (st[i]?.cooldown ?? 0) > 0,
  });
}
// control: direct debug activation on a fresh cooldown
await page.waitForTimeout(12000); // let cooldowns tick down
const direct = await page.evaluate(() => {
  const d = window.__ndDebug;
  const ok = d.activateSkill(0);
  return { ok, cooldown: d.skillState()[0].cooldown };
});
report.skills = { granted: ACTIVE_SKILLS, before, keyResults, directActivate: direct };
console.log("skills", JSON.stringify(report.skills));

// 2. weapon cards
await page.evaluate(() => window.__ndDebug.forceLevelUp());
await page.waitForFunction(() => window.__ndDebug.stats().phase === "cards", null, {
  timeout: 30000,
});
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, "cards-skill.png") });
console.log("cards-skill.png");

// 3. armory
await page.evaluate(() => window.__ndDebug.openArmory());
await page.waitForFunction(() => window.__ndDebug.stats().phase === "armory", null, {
  timeout: 20000,
});
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, "armory.png") });
console.log("armory.png");

// 4. bullets, one shot per weapon
for (const id of WEAPON_IDS) {
  await page.evaluate(() => {
    const d = window.__ndDebug;
    d.gotoStage(1);
    d.clearEnemies();
    d.spawnEnemyAt("rock_normal_medium", 960, 260);
    d.spawnEnemyAt("rock_normal_medium", 760, 380);
    d.spawnEnemyAt("rock_normal_medium", 1160, 380);
  });
  await page.waitForTimeout(1200);
  await page.evaluate((w) => window.__ndDebug.grantWeapon(w), id);
  await page.waitForTimeout(800);
  await page.mouse.move(640, 240);
  await page.mouse.down();
  await page.waitForTimeout(3500);
  const f = join(out, `bullets-${id}.png`);
  await page.screenshot({ path: f });
  await page.mouse.up();
  await page.waitForTimeout(600);
  report.weapons.push(id);
  console.log(`bullets-${id}.png`);
}

// 5. edges at 1280x720 (screenshot each)
const perSide = {
  left: [0, 540],
  right: [1920, 540],
  top: [960, 0],
  bottom: [960, 1080],
};
for (const [side, [x, y]] of Object.entries(perSide)) {
  await page.evaluate(([px, py]) => window.__ndDebug.setPlayerPos(px, py), [x, y]);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(out, `edge-${side}.png`) });
  console.log(`edge-${side}.png`);
}
const e1280 = await measureEdges(page);
report.viewports["1280x720"] = e1280;

// 6. enemy bullets (boss stage 10)
await page.evaluate(() => window.__ndDebug.setPlayerPos(960, 842));
await page.evaluate(() => window.__ndDebug.gotoStage(10));
await page.waitForTimeout(25000);
await page.screenshot({ path: join(out, "enemy-bullets.png") });
console.log("enemy-bullets.png");

// -------------------------------------------- edges at other viewport sizes
// Resize the SAME page: a second page is a background tab, and the game
// auto-pauses on blur, so it never reaches "playing". Resizing also covers the
// "resize mid-game" requirement.
for (const [w, h] of [[1920, 1080], [1024, 768]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(1500);
  report.viewports[`${w}x${h}`] = await measureEdges(page);
}

await page.close();
await browser.close();

report.errors = errors.filter((e) => !e.includes("favicon"));
writeFileSync(join(out, "measurements.json"), JSON.stringify(report, null, 2));

console.log("\n--- measurements ---");
console.log(JSON.stringify(report, null, 2));
console.log(`\n${report.errors.length} console error(s)`);
for (const e of report.errors) console.error(" ", e);
console.log(`\nPNGs + measurements.json in ${out}`);
