/**
 * expandAngles checks: tier-0 identity, no barrel ever lost, spans respected,
 * MAX_VOLLEY cap. Run: npx tsx scripts/check-patterns.ts
 */
import assert from "node:assert/strict";
import { ATTACK_PATTERNS, expandAngles } from "../src/game/data/patterns";

const crossfireNative = [0, Math.PI, 0.55, -0.55];
const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const key = (xs: number[]) => xs.map(norm).map((x) => x.toFixed(4)).sort().join(",");

// 1. identity at tier 0 (and for any non-positive extra)
for (const base of [crossfireNative, ATTACK_PATTERNS.fan.angles, ATTACK_PATTERNS.radiant.angles, [0]]) {
  assert.equal(key(expandAngles(base, 0)), key(base), "tier 0 must be identity");
  assert.equal(key(expandAngles(base, -3)), key(base), "negative extra must be identity");
}

// 2. non-uniform base keeps every original barrel and only ADDS
const CF_EPS = 1e-6;
const has = (xs: number[], target: number) => xs.some((x) => Math.abs(norm(x) - norm(target)) < CF_EPS);
const cf1 = expandAngles(crossfireNative, 1);
assert.equal(cf1.length, 5);
for (const a of crossfireNative) assert.ok(has(cf1, a), `barrel ${a} lost`);
const cf4 = expandAngles(crossfireNative, 4);
assert.equal(cf4.length, 8);
for (const a of crossfireNative) assert.ok(has(cf4, a), `barrel ${a} lost at t4`);

// 3. uniform fan densifies inside the fan (never fires backwards)
const fan1 = expandAngles(ATTACK_PATTERNS.fan.angles, 1);
assert.equal(fan1.length, 6);
assert.ok(
  fan1.every((a) => a >= -0.43 && a <= 0.43),
  `fan grew outside its forward span: ${fan1.join(",")}`,
);

// 4. radiant stays a full ring
const rad1 = expandAngles(ATTACK_PATTERNS.radiant.angles, 1);
assert.equal(rad1.length, 8);
assert.ok(rad1.every((a) => a >= 0 && a < Math.PI * 2), "ring angles out of range");

// 5. single-shot splay, and the MAX_VOLLEY cap
assert.equal(expandAngles([0], 2).length, 3);
for (const e of [0, 1, 4, 9, 100]) {
  for (const base of [crossfireNative, ATTACK_PATTERNS.fan.angles, ATTACK_PATTERNS.radiant.angles, [0], [1, 2]]) {
    assert.ok(expandAngles(base, e).length <= 16, "volley cap breached");
  }
}

console.log("patterns probe OK");



