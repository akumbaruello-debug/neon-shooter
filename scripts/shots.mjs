/**
 * Screenshot + smoke test. Uses the system Chrome (no browser download).
 *   npm run shots
 * Writes PNGs into ./screenshots and fails on real console errors.
 *
 * Note: headless Chrome only has software WebGL (SwiftShader), so the sim runs
 * far slower than on real hardware — waits are generous on purpose.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "screenshots");
mkdirSync(out, { recursive: true });

const BASE = process.env.GAME_URL || "http://localhost:3123";

/** Each shot: navigate, optional debug action, then capture. */
const shots = [
  { name: "01-title", url: "/", wait: 3000 },
  // Proves the real ?autostart=1 path: countdown -> playing -> rocks + HUD.
  { name: "02-stage1", url: "/?autostart=1", wait: 24000 },
  {
    name: "03-weapon-cards",
    url: "/?autostart=1&debug=1&new=1",
    wait: 4000,
    act: () => window.__ndDebug?.gotoStage?.(1),
    after: 3000,
    act2: () => window.__ndDebug?.forceLevelUp?.(),
    after2: 3000,
  },
  {
    name: "04-smasher-telegraph",
    url: "/?autostart=1&debug=1&new=1",
    wait: 3000,
    act: () => window.__ndDebug?.gotoStage?.(8),
    after: 12000,
  },
  {
    name: "05-boss10",
    url: "/?autostart=1&debug=1&new=1",
    wait: 3000,
    act: () => window.__ndDebug?.gotoStage?.(10),
    after: 14000,
  },
  {
    name: "06-boss30",
    url: "/?autostart=1&debug=1&new=1",
    wait: 3000,
    act: () => window.__ndDebug?.gotoStage?.(30),
    after: 14000,
  },
  {
    name: "07-boss50",
    url: "/?autostart=1&debug=1&new=1",
    wait: 3000,
    act: () => window.__ndDebug?.gotoStage?.(50),
    after: 14000,
  },
  {
    name: "08-pause-settings",
    url: "/?autostart=1&debug=1&new=1",
    wait: 13000,
    keys: ["Escape"],
    after: 1500,
    clickText: "Settings",
    after2: 1500,
  },
  {
    name: "09-armory",
    url: "/?autostart=1&debug=1&new=1",
    wait: 5000,
    act: () => window.__ndDebug?.openArmory?.(),
    after: 2500,
  },
  {
    name: "10-gameover",
    url: "/?autostart=1&debug=1&new=1",
    wait: 5000,
    act: () => window.__ndDebug?.killPlayer?.(),
    after: 2500,
  },
  {
    name: "11-fire-aim",
    url: "/?autostart=1&debug=1&new=1",
    wait: 12000,
    fire: true,
    aim: [1080, 360],
    after: 3000,
  },
];

const errors = [];

const only = process.env.SHOTS_ONLY;
const active = only ? shots.filter((s) => s.name.includes(only)) : shots;

const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--force-device-scale-factor=1",
    // Software WebGL so PixiJS initialises in headless Chrome.
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`[console] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

for (const s of active) {
  await page.goto(BASE + s.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(s.wait);
  await page.mouse.move(640, 380);
  if (s.keys) {
    for (const k of s.keys) await page.keyboard.press(k);
    await page.waitForTimeout(s.after ?? 800);
  }
  if (s.clickText) {
    try {
      await page.getByText(s.clickText, { exact: true }).first().click();
    } catch {
      console.log("  (clickText miss:", s.clickText, ")");
    }
    await page.waitForTimeout(s.after2 ?? 800);
  }
  if (s.act) {
    await page.evaluate(s.act);
    await page.waitForTimeout(s.after ?? 1500);
    if (s.act2) {
      await page.evaluate(s.act2);
      await page.waitForTimeout(s.after2 ?? 1500);
    }
    await page.mouse.move(640, 380);
  }
  if (s.fire) {
    const [ax, ay] = s.aim ?? [900, 360];
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.waitForTimeout(s.after ?? 3000);
    await page.screenshot({ path: join(out, `${s.name}.png`) });
    await page.mouse.up();
    console.log("shot", s.name);
    continue;
  }
  await page.screenshot({ path: join(out, `${s.name}.png`) });
  console.log("shot", s.name);
}

await browser.close();

const relevant = errors.filter((e) => !e.includes("favicon"));
if (relevant.length) {
  console.error(`\n${relevant.length} console error(s):`);
  for (const e of relevant.slice(0, 20)) console.error(" ", e);
  process.exit(1);
}
console.log(`\nOK - ${active.length} screenshots in ${out}`);
