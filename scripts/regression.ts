/**
 * Regression checks for the weapon-growth integration pass. Imports the REAL
 * modules (no replicas) and exercises the four fixes that are easy to regress:
 *
 *   1. spawnId is fresh on every spawn / reinit (progression hit-sets).
 *   2. Shockwave ring radius/time tracks the damage radius 0 -> maxR at 420px/s.
 *   3. Shockwave / gravity hit-sets key on spawn identity, not pooled uid/age.
 *   4. StageDirector queue takes the first dispatchable event (no HOL block).
 *
 * Run: npx tsx scripts/regression.ts   (exit 1 on any failure)
 */
import { FIXED_DT, ARENA_H, ARENA_W, MAGNET_RADIUS } from "../src/game/data/constants";
import { ATTACK_PATTERNS, MAX_VOLLEY, expandAngles, volleyShots } from "../src/game/data/patterns";
import { BOSSES } from "../src/game/data/bosses";
import { SKILLS } from "../src/game/data/skills";
import { Rng } from "../src/game/core/rng";
import { Player } from "../src/game/player";
import { pools, resetPools } from "../src/game/entities";
import type { GameCtx } from "../src/game/ctx";
import type { SkillId } from "../src/game/types";
import { Progression } from "../src/game/systems/progression";
import { EnemySystem } from "../src/game/systems/enemies";
import { StageDirector } from "../src/game/systems/spawner";
import { pickupMagnetRadius } from "../src/game/systems/collisions";

let failed = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) console.log(`ok   ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

interface ParticleCall {
  life: number;
  size: number;
  sizeEnd: number;
  kind: string;
}

interface DirectorInternals {
  events: { t: number; kind: string; variant: string; size: string; x: number; y: number }[];
  cursor: number;
  pending: unknown[];
  releaseTimer: number;
  elapsed: number;
}

function makeCtx(): { ctx: GameCtx; particles: ParticleCall[]; aoe: { n: number } } {
  const player = new Player();
  player.x = 0;
  player.y = 0;
  const particles: ParticleCall[] = [];
  const aoe = { n: 0 };
  const ctx = {
    rng: new Rng(12345),
    player,
    tier: 0,
    particle: (_x: number, _y: number, _vx: number, _vy: number, life: number, _c: number, size: number, kind = "spark", sizeEnd = 0) => {
      particles.push({ life, size, sizeEnd, kind });
    },
    aoeDamage: () => {
      aoe.n++;
    },
    shake: () => {},
    toast: () => {},
    sfxAt: () => {},
    sfx: () => {},
    burst: () => {},
    damagePlayer: () => {},
    addScore: () => {},
    addXp: () => {},
    spawnXp: () => {},
    damageNumber: () => {},
    hitstop: () => {},
    spawnEnemyBullet: () => {},
    slowmo: () => {},
    enemies: () => pools.enemies.all(),
  } as unknown as GameCtx;
  return { ctx, particles, aoe };
}

// ---------------------------------------------------------------- 1. spawnId
{
  resetPools();
  const { ctx } = makeCtx();
  const es = new EnemySystem(ctx);
  const a = es.spawnRock("normal", "small", 100, 100);
  const b = es.spawnRock("normal", "small", 200, 100);
  check("spawnId differs across spawns", a !== null && b !== null && a.spawnId !== b.spawnId);
  const before = a!.spawnId;
  pools.enemies.release(a!);
  const c = es.spawnRock("normal", "small", 300, 100);
  check("respawn reuses the pooled object", c === a);
  check(
    "respawn gets a fresh, larger spawnId",
    c !== null && c.spawnId !== before && c.spawnId > before,
    `before=${before} after=${c?.spawnId}`,
  );
  const boss = es.spawnBossShell(BOSSES[10]!);
  check("boss shell gets a spawnId", boss.spawnId > 0);
}

// ------------------------------------------------- 2. shockwave visual/damage
{
  resetPools();
  const { ctx, particles } = makeCtx();
  const prog = new Progression(ctx);
  prog.skills.set("shockwave" as SkillId, 1);
  prog.ensureActiveSlot("shockwave" as SkillId);
  prog.recompute();
  const ok = prog.activate(0);
  check("shockwave activates", ok);
  const maxR = 260 + 1 * 40;
  const ring = particles.find((p) => p.kind === "ring");
  check("ring particle emitted", ring !== undefined);
  check("ring starts at radius 0", ring?.size === 0, `size=${ring?.size}`);
  check("ring ends at maxR", ring?.sizeEnd === maxR, `sizeEnd=${ring?.sizeEnd}`);
  check(
    "ring life = maxR / sweep speed",
    ring !== undefined && close(ring.life, maxR / 420),
    `life=${ring?.life} want=${maxR / 420}`,
  );

  // Walk the sweep: radius must equal 420 * elapsed every live step.
  let steps = 0;
  let aligned = true;
  while (prog.shockwaveTimer > 0 && steps < 1000) {
    prog.update(FIXED_DT);
    steps++;
    const elapsed = steps * FIXED_DT;
    if (elapsed < maxR / 420 - 1e-9 && !close(prog.shockwaveRadius, 420 * elapsed)) aligned = false;
  }
  check("damage radius grows at 420 px/s", aligned, `r=${prog.shockwaveRadius}`);
  check(
    "sweep ends at the same time as the ring life",
    close(steps * FIXED_DT, maxR / 420, FIXED_DT),
    `ended at ${steps * FIXED_DT}s, ring life ${maxR / 420}s`,
  );
  check("radius reaches maxR before clearing", prog.shockwaveRadius >= maxR - 1e-6);
}

// --------------------------------------------------- 3. hit-set spawn identity
{
  resetPools();
  const { ctx, aoe } = makeCtx();
  const es = new EnemySystem(ctx);
  const prog = new Progression(ctx);
  prog.skills.set("shockwave" as SkillId, 1);
  prog.ensureActiveSlot("shockwave" as SkillId);
  prog.recompute();
  prog.shockwaveMaxR = 300; // keep the sweep alive across the two probes
  const e = es.spawnRock("normal", "small", 200, 0);
  if (e) {
    e.x = 200;
    e.y = 0;
  }
  const sweep = (): void => {
    prog.shockwaveRadius = 0;
    prog.shockwaveTimer = 1;
    prog.update(0.5); // radius 210, enemy at d=200 -> inside the front
  };
  sweep();
  check("first sweep hits the enemy", aoe.n === 1, `aoe=${aoe.n}`);
  sweep();
  check("second sweep does not re-hit the same spawn", aoe.n === 1, `aoe=${aoe.n}`);
  pools.enemies.release(e!);
  const again = es.spawnRock("normal", "small", 200, 0); // same pooled object, new spawnId
  if (again) {
    again.x = 200;
    again.y = 0;
  }
  sweep();
  check("respawned slot is hit again", aoe.n === 2, `aoe=${aoe.n}`);
}

// ------------------------------------------------------ 4. spawner queue / cap
{
  resetPools();
  const { ctx } = makeCtx();
  const es = new EnemySystem(ctx);
  const dir = new StageDirector(ctx, es);

  // 3 live smashers (stage-0 cap = 3) and 1 live shooter (cap = 1) saturate both.
  es.spawnSmasher("small", 500, -60);
  es.spawnSmasher("small", 600, -60);
  es.spawnSmasher("small", 700, -60);
  es.spawnShooter(800, -60);

  const live = (kind: string): number =>
    pools.enemies.all().filter((x) => x.active && x.kind === kind).length;

  const internals = dir as unknown as DirectorInternals;
  internals.events = [
    { t: 0, kind: "smasher", variant: "normal", size: "large", x: 500, y: -60 },
    { t: 0, kind: "shooter", variant: "normal", size: "small", x: 900, y: -60 },
  ];
  internals.cursor = 0;
  internals.pending = [];
  internals.releaseTimer = 0;
  internals.elapsed = 0;

  dir.update(0.01);
  check("both capped events queue", internals.pending.length === 2, `pending=${internals.pending.length}`);
  check("no extra spawn while both kinds are capped", live("smasher") === 3 && live("shooter") === 1);

  // Free one shooter slot: the shooter queued BEHIND a still-capped smasher
  // must dispatch (old head-of-line scan broke on the blocked head).
  const anyShooter = pools.enemies.all().find((x) => x.active && x.kind === "shooter");
  pools.enemies.release(anyShooter!);
  dir.update(0.01);
  check("shooter dispatches past the blocked smasher head", live("shooter") === 1, `live=${live("shooter")}`);
  check("blocked smasher stays queued", internals.pending.length === 1, `pending=${internals.pending.length}`);
}

// ------------------------------------------- 5. volley damage conservation
{
  const EPS = 1e-9;
  const NATIVE = [1, 3, 4, 5];
  const DEF_DAMAGE = 7; // arbitrary; cancels in the conservation identity
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

  // (a) extra = 0: pattern-bullet damage sums to exactly one native volley.
  let aOk = true;
  let aDetail = "";
  for (const p of Object.values(ATTACK_PATTERNS)) {
    for (const n of NATIVE) {
      const shots = volleyShots(p.angles, n, 0);
      const total = sum(shots.map((s) => s.mul)) * DEF_DAMAGE;
      if (!close(total, n * DEF_DAMAGE, EPS)) {
        aOk = false;
        aDetail = `${p.id} n=${n}: ${total} != ${n * DEF_DAMAGE}`;
      }
    }
  }
  check("(a) pattern volley damage == one native volley (extra 0)", aOk, aDetail);

  // (b) extra = 3: milestones keep full damage, total = (native + effectiveExtra).
  let bMilestoneOk = true;
  let bTotalOk = true;
  let bDetail = "";
  for (const p of Object.values(ATTACK_PATTERNS)) {
    for (const n of NATIVE) {
      const shots = volleyShots(p.angles, n, 3);
      const effectiveExtra = shots.length - expandAngles(p.angles, 0).length;
      const total = sum(shots.map((s) => s.mul)) * DEF_DAMAGE;
      const want = (n + effectiveExtra) * DEF_DAMAGE;
      if (!close(total, want, EPS)) {
        bTotalOk = false;
        bDetail = `${p.id} n=${n}: ${total} != ${want}`;
      }
      for (const s of shots) {
        if (s.milestone && s.mul !== 1) {
          bMilestoneOk = false;
          bDetail = `${p.id} milestone mul ${s.mul}`;
        }
      }
    }
  }
  check("(b) milestone bullets carry full damage (mul 1)", bMilestoneOk, bDetail);
  check("(b) total damage = (native + effectiveExtra) * dmg", bTotalOk, bDetail);

  // (b) cap case: radiant (7) + 100 extra saturates MAX_VOLLEY; total still conserved.
  const capped = volleyShots(ATTACK_PATTERNS.radiant.angles, 3, 100);
  const cappedExtra = capped.length - ATTACK_PATTERNS.radiant.angles.length;
  const cappedTotal = sum(capped.map((s) => s.mul)) * DEF_DAMAGE;
  check(
    "(b) MAX_VOLLEY cap keeps the volley conserved",
    capped.length === MAX_VOLLEY &&
      cappedExtra === MAX_VOLLEY - ATTACK_PATTERNS.radiant.angles.length &&
      close(cappedTotal, (3 + cappedExtra) * DEF_DAMAGE, EPS),
    `len=${capped.length} extra=${cappedExtra} total=${cappedTotal}`,
  );

  // (b) forward at extra 0 stays all full damage.
  const fwd0 = volleyShots([0], 1, 0);
  check("(b) forward extra 0 -> all mul 1", fwd0.every((s) => s.mul === 1));

  // (c) forward equality: the first n shots stay full damage for k = 0..3.
  const forwardBases: number[][] = [
    [0],
    [-0.5, 0, 0.5],
    [-0.6, -0.2, 0.2, 0.6],
    [-0.8, -0.4, 0, 0.4, 0.8],
  ];
  let cOk = true;
  let cDetail = "";
  for (const native of forwardBases) {
    const n = native.length;
    for (let k = 0; k <= 3; k++) {
      const shots = volleyShots(native, n, k);
      for (let i = 0; i < n; i++) {
        if (shots[i]?.mul !== 1) {
          cOk = false;
          cDetail = `n=${n} k=${k} shot ${i} mul ${shots[i]?.mul}`;
        }
      }
    }
  }
  check("(c) forward stays mul 1 across k = 0..3", cOk, cDetail);
}

// ----------------------------------- (c) Phase 3: magnet + new skills
{
  const diag = Math.hypot(ARENA_W, ARENA_H);
  // While Magnet is active the pull radius covers the whole map, so a pickup at
  // ANY arena distance is inside the magnet (and thus pulled / collected).
  check("magnet radius covers the whole map", pickupMagnetRadius(true, 0) >= diag, `r=${pickupMagnetRadius(true, 0)} diag=${diag}`);
  check(
    "magnet map-wide at any pickup radius",
    pickupMagnetRadius(true, 0) >= diag && pickupMagnetRadius(true, 500) >= diag,
  );
  check("normal magnet radius === MAGNET_RADIUS", pickupMagnetRadius(false, 0) === MAGNET_RADIUS);
  check(
    "normal magnet radius scales with pickup pct",
    close(pickupMagnetRadius(false, 100), MAGNET_RADIUS * 2),
    `r=${pickupMagnetRadius(false, 100)}`,
  );

  const newActives = ["magnet", "blink", "nova", "emp"] as const;
  const newPassives = ["ablative_plating", "vampiric_core", "capacitor_bank", "salvage_scanner"] as const;
  const effects = new Set<string>([
    "active_magnet",
    "active_blink",
    "active_nova",
    "active_emp",
    "damage_reduction",
    "lifesteal",
    "shield_recharge_pct",
    "xp_pct",
  ]);
  for (const id of newActives) {
    const d = SKILLS[id];
    check(
      `active ${id}: category active + finite cooldown`,
      !!d && d.category === "active" && Number.isFinite(d.cooldown ?? NaN),
    );
    check(`active ${id}: effect present in the union`, !!d && effects.has(d.effect));
  }
  for (const id of newPassives) {
    const d = SKILLS[id];
    check(`passive ${id}: category non-active`, !!d && d.category !== "active");
    check(`passive ${id}: effect present in the union`, !!d && effects.has(d.effect));
  }
  check(
    "all 8 new skill ids resolve",
    [...newActives, ...newPassives].every((id) => id in SKILLS),
  );
}

console.log("");
if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("all regression checks passed");
