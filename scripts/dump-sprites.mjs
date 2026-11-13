/** Dump baked boss/enemy textures to PNG for inspection. */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.GAME_URL || "http://localhost:3123";
const keys = (process.argv[2] || "boss:warden_colossus,boss:prism_sentinel,boss:eclipse_sovereign").split(",");

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(BASE + "/?autostart=1&debug=1&new=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
for (const k of keys) {
  const data = await page.evaluate((key) => window.__ndDebug?.spritePng?.(key) ?? null, k);
  if (!data) { console.log("MISS", k); continue; }
  const b64 = data.split(",")[1];
  const file = join(root, "screenshots", k.replace(/[:\\/]/g, "_") + ".png");
  writeFileSync(file, Buffer.from(b64, "base64"));
  console.log("dumped", k, "->", file);
}
await browser.close();