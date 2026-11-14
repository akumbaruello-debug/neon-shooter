/**
 * Headless balance / telemetry report.
 *
 * Pure: imports the data tables directly. No DOM, no network, no React.
 * Run: npx tsx scripts/balance.ts [--json]
 *
 * Exit code: 0 when no flags, 1 when any flag is raised.
 */

import { BOSSES } from "../src/game/data/bosses";
import {
  MAX_STAGES,
  SHOOTER_BASE_CAP,
  SHOOTER_CAP_EVERY,
  SHOOTER_HARD_CAP,
  TIER_EVERY,
} from "../src/game/data/constants";
import { ENEMY_INDEX } from "../src/game/data/enemies";
import { STAGES } from "../src/game/data/stages";
import { WEAPON_LIST } from "../src/game/data/weapons";
import {
  expectedLevelAtStage,
  totalXpToLevel,
  xpForStage,
  xpToNext,
} from "../src/game/data/xp";
import type { EnemyDef, StageDef, WeaponDef } from "../src/game/types";

// ------------------------------------------------------------------ tuning

const HP_GROWTH = 1.15; // per tier
const DMG_GROWTH = 1.08; // per tier
const QTY_GROWTH = 1.1; // per tier
const CROWD_TARGETS = 5;
/** Player power also grows per tier (skills/mastery); assumption for the clear estimate. */
const REF_DPS_GROWTH_PER_TIER = 1.18;
const WEAPON_BAND = 0.25; // flag weapons >25% off the mean
const LEVEL_BAND: [number, number] = [40, 45];

// ------------------------------------------------------------------ helpers

const r2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number, digits = 1): string => n.toFixed(digits);
const pad = (v: string | number, w: number): string => String(v).padStart(w);
const padR = (v: string | number, w: number): string => String(v).padEnd(w);

function enemyFor(id: string): EnemyDef {
  const e = ENEMY_INDEX[id];
  if (!e) throw new Error(`Unknown enemy id in stage data: ${id}`);
  return e;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

interface Flag {
  section: "stage" | "boss" | "weapon" | "xp" | "threat";
  detail: string;
}

// ------------------------------------------------------------------ weapons

interface WeaponRow {
  id: string;
  name: string;
  role: string;
  behavior: string;
  singleDps: number;
  crowdDps: number;
  offMean: boolean;
}

/** Seconds between damage volleys. Rail charge is amortised into the cycle. */
function volleyInterval(w: WeaponDef): number {
  if (w.behavior === "rail") return w.fireInterval + (w.chargeTime ?? 0);
  return w.fireInterval;
}

/** Damage instances landing on ONE target in a volley. */
function singleHits(w: WeaponDef): number {
  switch (w.behavior) {
    case "boomerang":
      return 2; // out + back
    case "homing":
      return w.count;
    case "multi":
      return 1; // only one barrel bears on a lone target
    case "projectile":
      return w.role === "crowd" ? 1 : w.count;
    case "beam":
    case "rail":
    case "chain":
    case "melee_arc":
    case "bounce":
      return 1;
  }
}

/** Damage instances landing on CROWD_TARGETS clustered enemies in a volley. */
function crowdHits(w: WeaponDef): number {
  switch (w.behavior) {
    case "chain": {
      const jumps = w.chainJumps ?? 0;
      const falloff = w.chainFalloff ?? 1;
      let hits = 1;
      for (let k = 1; k <= jumps; k++) hits += Math.pow(falloff, k);
      return Math.min(hits, CROWD_TARGETS);
    }
    case "boomerang":
      return 2 * Math.min(CROWD_TARGETS, 1 + w.pierce);
    case "projectile":
      return w.aoe ? CROWD_TARGETS : Math.min(CROWD_TARGETS, w.count * (1 + w.pierce));
    case "bounce":
      return Math.min(CROWD_TARGETS, 1 + (w.bounce ?? 0));
    case "homing":
    case "multi":
      return Math.min(CROWD_TARGETS, w.count);
    case "beam":
    case "rail":
    case "melee_arc":
      return CROWD_TARGETS; // pierce-all
  }
}

const weaponRows: WeaponRow[] = WEAPON_LIST.map((w) => {
  const interval = volleyInterval(w);
  return {
    id: w.id,
    name: w.name,
    role: w.role,
    behavior: w.behavior,
    singleDps: r2((w.damage * singleHits(w)) / interval),
    crowdDps: r2((w.damage * crowdHits(w)) / interval),
    offMean: false,
  };
});

const singleDpsValues = weaponRows.map((w) => w.singleDps);
const dpsMean = mean(singleDpsValues);
const dpsMin = Math.min(...singleDpsValues);
const dpsMax = Math.max(...singleDpsValues);

const flags: Flag[] = [];

for (const w of weaponRows) {
  const off = dpsMean > 0 ? Math.abs(w.singleDps - dpsMean) / dpsMean : 0;
  if (off > WEAPON_BAND) {
    w.offMean = true;
    flags.push({
      section: "weapon",
      detail: `${w.name}: single ${fmt(w.singleDps)} dps is ${(off * 100).toFixed(0)}% off mean ${fmt(dpsMean)}`,
    });
  }
}

/** Reference player DPS: mean level-0 single-target DPS, grown per tier. */
function referenceDps(stage: StageDef): number {
  return dpsMean * Math.pow(REF_DPS_GROWTH_PER_TIER, stage.tier);
}

// ------------------------------------------------------------------ stages

interface StageRow {
  stage: number;
  tier: number;
  sector: number;
  composition: string;
  isBoss: boolean;
  hpMult: number;
  dmgMult: number;
  qtyMult: number;
  rawCount: number;
  effectiveCount: number;
  shooterCap: number;
  totalHp: number;
  effectiveHp: number;
  refDps: number;
  clearSeconds: number | null;
  target: [number, number];
  flag: boolean;
}

function computeStage(s: StageDef): StageRow {
  const hpMult = Math.pow(HP_GROWTH, s.tier);
  const dmgMult = Math.pow(DMG_GROWTH, s.tier);
  const qtyMult = Math.pow(QTY_GROWTH, s.tier);
  const shooterCap = Math.min(
    SHOOTER_BASE_CAP + Math.floor(s.stage / SHOOTER_CAP_EVERY),
    SHOOTER_HARD_CAP,
  );

  let baseCount = 0;
  let baseHp = 0;
  let shooterBaseCount = 0; // fractional "expected" shooters in mixed waves
  let shooterBaseHp = 0;
  const arrivals: { t: number; hp: number }[] = [];

  for (const wave of s.waves) {
    const defs = wave.kinds.map(enemyFor);
    const hpPer = mean(defs.map((e) => e.hp));
    const shooterFrac = wave.kinds.includes("raider") ? 1 / Math.max(1, wave.kinds.length) : 0;

    baseCount += wave.count;
    baseHp += wave.count * hpPer;
    shooterBaseCount += wave.count * shooterFrac;
    shooterBaseHp += wave.count * shooterFrac * hpPer;

    for (let i = 0; i < wave.count; i++) {
      arrivals.push({ t: wave.at + i * wave.spacing, hp: hpPer * hpMult * qtyMult });
    }
  }

  const rawCount = Math.round(baseCount * qtyMult);
  const shooterRaw = Math.round(shooterBaseCount * qtyMult);
  const effectiveCount = rawCount - shooterRaw + Math.min(shooterRaw, shooterCap);

  const totalHp = baseHp * hpMult * qtyMult;
  const shooterHp = shooterBaseHp * hpMult * qtyMult;
  const effectiveHp = totalHp - shooterHp + shooterHp * Math.min(1, shooterCap / Math.max(1, shooterRaw));

  const dps = referenceDps(s);
  arrivals.sort((a, b) => a.t - b.t);
  let done = 0;
  for (const a of arrivals) done = Math.max(done, a.t) + a.hp / dps;

  const clearSeconds = s.waves.length > 0 ? r2(done) : null;
  const [lo, hi] = s.targetSeconds;
  const flag = clearSeconds !== null && (clearSeconds < lo || clearSeconds > hi);

  return {
    stage: s.stage,
    tier: s.tier,
    sector: s.sector,
    composition: s.composition,
    isBoss: s.isBoss,
    hpMult: r2(hpMult),
    dmgMult: r2(dmgMult),
    qtyMult: r2(qtyMult),
    rawCount,
    effectiveCount,
    shooterCap,
    totalHp: Math.round(totalHp),
    effectiveHp: Math.round(effectiveHp),
    refDps: r2(dps),
    clearSeconds,
    target: [lo, hi],
    flag,
  };
}

const stageRows: StageRow[] = STAGES.map(computeStage);

for (const row of stageRows) {
  if (row.flag) {
    flags.push({
      section: "stage",
      detail: `stage ${row.stage} (${row.composition}): est ${row.clearSeconds}s outside target ${row.target[0]}-${row.target[1]}s`,
    });
  }
}

// ------------------------------------------------------------------ bosses

interface BossRow {
  stage: number;
  name: string;
  baseHp: number;
  scaledHp: number;
  targetSeconds: number;
  impliedDps: number;
  flag: boolean;
}

const bossRows: BossRow[] = Object.keys(BOSSES)
  .map(Number)
  .sort((a, b) => a - b)
  .flatMap((stage) => {
    const boss = BOSSES[stage];
    const stageDef = STAGES[stage - 1];
    if (!boss || !stageDef) return [];
    const scaledHp = Math.round(boss.hp * Math.pow(HP_GROWTH, stageDef.tier));
    const impliedDps = r2(scaledHp / boss.targetSeconds);
    const [lo, hi] = stageDef.targetSeconds;
    const flag = boss.targetSeconds < lo || boss.targetSeconds > hi;
    if (flag) {
      flags.push({
        section: "boss",
        detail: `${boss.name} (stage ${stage}): target ${boss.targetSeconds}s outside band ${lo}-${hi}s`,
      });
    }
    return [
      {
        stage,
        name: boss.name,
        baseHp: boss.hp,
        scaledHp,
        targetSeconds: boss.targetSeconds,
        impliedDps,
        flag,
      },
    ];
  });

// ------------------------------------------------------------------ xp curve

const avgKillXp = r2(mean(Object.values(ENEMY_INDEX).map((e) => e.xp)));

interface XpRow {
  level: number;
  xpToNext: number;
  cumulativeXp: number;
  killsToLevel: number;
  stagePayout: number;
  killsPerStage: number;
}

const xpRows: XpRow[] = [];
for (let level = 0; level <= 45; level++) {
  const need = xpToNext(level);
  const payout = xpForStage(level + 1);
  xpRows.push({
    level,
    xpToNext: need,
    cumulativeXp: totalXpToLevel(level),
    killsToLevel: Math.ceil(need / Math.max(1, avgKillXp)),
    stagePayout: payout,
    killsPerStage: Math.ceil(payout / Math.max(1, avgKillXp)),
  });
}

const finalLevel = expectedLevelAtStage(MAX_STAGES);
const levelPass = finalLevel >= LEVEL_BAND[0] && finalLevel <= LEVEL_BAND[1];
if (!levelPass) {
  flags.push({
    section: "xp",
    detail: `final level ${finalLevel} after stage ${MAX_STAGES} outside ${LEVEL_BAND[0]}-${LEVEL_BAND[1]}`,
  });
}

// ------------------------------------------------------------------ threat steps

interface ThreatRow {
  stage: number;
  tier: number;
  hpMult: number;
  dmgMult: number;
  qtyMult: number;
}

const threatRows: ThreatRow[] = [];
let prevTier = STAGES[0]?.tier ?? 0;
for (const s of STAGES) {
  if (s.tier !== prevTier) {
    threatRows.push({
      stage: s.stage,
      tier: s.tier,
      hpMult: r2(Math.pow(HP_GROWTH, s.tier)),
      dmgMult: r2(Math.pow(DMG_GROWTH, s.tier)),
      qtyMult: r2(Math.pow(QTY_GROWTH, s.tier)),
    });
    prevTier = s.tier;
  }
  if (s.tier !== Math.floor(s.stage / TIER_EVERY)) {
    flags.push({
      section: "threat",
      detail: `stage ${s.stage} tier ${s.tier} != floor(${s.stage}/${TIER_EVERY})`,
    });
  }
}

const expectedSteps = [];
for (let stage = TIER_EVERY; stage <= MAX_STAGES; stage += TIER_EVERY) expectedSteps.push(stage);
const actualSteps = threatRows.map((r) => r.stage);
if (expectedSteps.join(",") !== actualSteps.join(",")) {
  flags.push({
    section: "threat",
    detail: `tier change stages [${actualSteps.join(",")}] != expected [${expectedSteps.join(",")}]`,
  });
}

// ------------------------------------------------------------------ report

const report = {
  summary: {
    stages: stageRows.length,
    bosses: bossRows.length,
    weapons: weaponRows.length,
    flagCount: flags.length,
    finalLevel,
    levelPass,
    avgKillXp,
    referenceDpsMean: r2(dpsMean),
  },
  stages: stageRows,
  bosses: bossRows,
  weapons: {
    rows: weaponRows,
    stats: { min: r2(dpsMin), max: r2(dpsMax), mean: r2(dpsMean) },
  },
  xp: { rows: xpRows, finalLevel, pass: levelPass },
  threatSteps: threatRows,
  flags,
};

const jsonMode = process.argv.includes("--json");

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const out: string[] = [];

  out.push("NEON SHOOTER — BALANCE / TELEMETRY");
  out.push(
    `hp x${HP_GROWTH}/tier · dmg x${DMG_GROWTH}/tier · qty x${QTY_GROWTH}/tier · ref DPS = ${fmt(dpsMean)} x${REF_DPS_GROWTH_PER_TIER}^tier`,
  );
  out.push("");

  out.push("== STAGES 1..50 ==");
  out.push(
    [
      pad("st", 3),
      pad("tier", 4),
      pad("sec", 3),
      padR("composition", 17),
      pad("boss", 4),
      pad("hpX", 6),
      pad("dmgX", 6),
      pad("qtyX", 6),
      pad("raw", 5),
      pad("eff", 5),
      pad("hp", 9),
      pad("effHp", 9),
      pad("refDps", 7),
      pad("est", 6),
      padR("target", 9),
      "flag",
    ].join(" "),
  );
  for (const row of stageRows) {
    out.push(
      [
        pad(row.stage, 3),
        pad(row.tier, 4),
        pad(row.sector, 3),
        padR(row.composition, 17),
        pad(row.isBoss ? "yes" : "-", 4),
        pad(row.hpMult.toFixed(2), 6),
        pad(row.dmgMult.toFixed(2), 6),
        pad(row.qtyMult.toFixed(2), 6),
        pad(row.rawCount, 5),
        pad(row.effectiveCount, 5),
        pad(row.totalHp, 9),
        pad(row.effectiveHp, 9),
        pad(row.refDps.toFixed(1), 7),
        pad(row.clearSeconds === null ? "boss" : row.clearSeconds.toFixed(1), 6),
        padR(`${row.target[0]}-${row.target[1]}`, 9),
        row.flag ? "FLAG" : row.isBoss ? "boss" : "ok",
      ].join(" "),
    );
  }
  out.push("");

  out.push("== BOSSES ==");
  out.push(
    [
      pad("st", 3),
      padR("name", 19),
      pad("baseHp", 8),
      pad("scaledHp", 10),
      pad("target", 7),
      pad("impliedDps", 11),
      "flag",
    ].join(" "),
  );
  for (const row of bossRows) {
    out.push(
      [
        pad(row.stage, 3),
        padR(row.name, 19),
        pad(row.baseHp, 8),
        pad(row.scaledHp, 10),
        pad(`${row.targetSeconds}s`, 7),
        pad(row.impliedDps.toFixed(1), 11),
        row.flag ? "FLAG" : "ok",
      ].join(" "),
    );
  }
  out.push("");

  out.push("== WEAPONS (level 0, theoretical) ==");
  out.push(
    [padR("weapon", 17), padR("role", 8), padR("behavior", 11), pad("single", 8), pad("crowd", 8), "flag"].join(" "),
  );
  for (const w of weaponRows) {
    out.push(
      [
        padR(w.name, 17),
        padR(w.role, 8),
        padR(w.behavior, 11),
        pad(w.singleDps.toFixed(1), 8),
        pad(w.crowdDps.toFixed(1), 8),
        w.offMean ? "FLAG" : "ok",
      ].join(" "),
    );
  }
  out.push(
    `single-target dps: min ${fmt(dpsMin)} · max ${fmt(dpsMax)} · mean ${fmt(dpsMean)} · band ±${(WEAPON_BAND * 100).toFixed(0)}%`,
  );
  out.push("");

  out.push("== PLAYER CURVE (levels 0..45) ==");
  out.push(
    [
      pad("lvl", 3),
      pad("xpToNext", 9),
      pad("cumXp", 7),
      pad("killsToLvl", 11),
      pad("stageXp", 8),
      pad("kills/stage", 11),
    ].join(" "),
  );
  for (const row of xpRows) {
    out.push(
      [
        pad(row.level, 3),
        pad(row.xpToNext, 9),
        pad(row.cumulativeXp, 7),
        pad(row.killsToLevel, 11),
        pad(row.stagePayout, 8),
        pad(row.killsPerStage, 11),
      ].join(" "),
    );
  }
  out.push(
    `avg kill xp ${fmt(avgKillXp)} · level after stage ${MAX_STAGES} = ${finalLevel} (want ${LEVEL_BAND[0]}-${LEVEL_BAND[1]}) → ${levelPass ? "PASS" : "FAIL"}`,
  );
  out.push("");

  out.push("== THREAT STEPS (tier changes) ==");
  out.push([pad("stage", 5), pad("tier", 4), pad("hpX", 7), pad("dmgX", 7), pad("qtyX", 7)].join(" "));
  for (const row of threatRows) {
    out.push(
      [pad(row.stage, 5), pad(row.tier, 4), pad(row.hpMult.toFixed(2), 7), pad(row.dmgMult.toFixed(2), 7), pad(row.qtyMult.toFixed(2), 7)].join(
        " ",
      ),
    );
  }
  out.push("");

  if (flags.length > 0) {
    out.push(`== FLAGS (${flags.length}) ==`);
    for (const f of flags) out.push(`- [${f.section}] ${f.detail}`);
    out.push("");
  }
  out.push(flags.length === 0 ? "BALANCE: OK" : `BALANCE: ${flags.length} flags`);

  console.log(out.join("\n"));
}

process.exitCode = flags.length > 0 ? 1 : 0;