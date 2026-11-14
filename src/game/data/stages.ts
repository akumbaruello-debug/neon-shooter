/**
 * Stage table. 50 stages, 5 sectors, tier = floor(stage / 4).
 * Numbers are deliberately literal so they are easy to tweak in place.
 */

import type { StageDef, StageComposition } from "../types";

const ROT: StageComposition[] = [
  "rock_field",
  "shooter_squadron",
  "smasher_rush",
  "mixed_assault",
  "elite",
  "meteor_shower",
];

/** Composition for stages 11..50: rotation, with boss stages overridden. */
function rot(n: number, boss?: StageComposition): StageComposition {
  return boss ?? (ROT[(n - 11) % 6] as StageComposition);
}

// --- hard-mode stage hardening (Phase 1) -------------------------------

/**
 * Wave timing/spacing compression applied to every non-boss stage: shifts are packed
 * to 0.62x and spawn spacing to 0.55x of the raw table (spacing scale 0.55 <= 0.6).
 */
export const STAGE_TEMPO = { time: 0.62, spacing: 0.55 } as const;

/**
 * Per-stage wave-count scale for non-rush stages. Defaults to 1.0 (never above raw)
 * for absent stages. Lower values trim absolute enemy count so a stage's estimated
 * clear fits its (compressed) target band without weakening the spacing.
 */
export const COUNT_SCALE: Record<number, number> = {
  3: 0.56, 4: 0.498, 5: 0.658, 11: 0.833, 12: 0.943, 14: 0.81, 15: 0.498, 16: 0.938,
  17: 0.523, 18: 0.873, 21: 0.583, 22: 0.803, 23: 0.498, 24: 0.498, 26: 0.748, 27: 0.373,
  28: 0.605, 29: 0.355, 32: 0.498, 33: 0.583, 34: 0.603, 35: 0.415, 36: 0.463, 38: 0.56,
  39: 0.498, 41: 0.408, 42: 0.433, 44: 0.498, 45: 0.498, 46: 0.435, 47: 0.38, 48: 0.423,
};

/**
 * `smasher_rush` keeps its raw count scale (1.0, so the rush waves themselves stay
 * intact and are never trimmed) but rewrites the size mix. Value = medium breakers out
 * of every RUSH_KIND_DEN spawned; the rest are small. Sizes are not a contract, so this
 * is a pure class-HP knob: each rush stage's mix is chosen (see RUSH_SURGE) as the
 * heaviest mix that still keeps the stage estimator-consistent.
 */
export const RUSH_MEDIUM: Record<number, number> = {
  8: 20, 13: 18, 19: 18, 25: 8, 31: 2, 37: 0, 43: 0, 49: 2,
};
export const RUSH_KIND_DEN = 20;

/**
 * Extra smasher surge appended to each `smasher_rush` stage (absolute enemies, all
 * breakers) so its total smasher count lands well above the pre-Phase-1 engine count
 * (~1.2-1.4x; s43 caps near 1.23x because its raw band is the tightest). The raw rush
 * waves are left intact; this is the added pressure. The stage's non-smasher mix wave
 * is trimmed to 1 and the target band is overridden (still shorter than and inside the
 * raw band) to hold the harder clear.
 */
export const RUSH_SURGE: Record<number, number> = {
  8: 2, 13: 4, 19: 7, 25: 10, 31: 15, 37: 23, 43: 17, 49: 24,
};
export const RUSH_SURGE_AT = 0.25;
export const RUSH_SURGE_SPACING = 0.5;

/** Small-heavy breaker mix used by the appended surge waves. */
const BREAKER_MIX = ["breaker_small", "breaker_small", "breaker_medium"];

/** One appended breaker surge per stage >= 3; absolute size grows with tier. */
export const SMASHER_EXTRA = { base: 3, perTier: 1, atFrac: 0.5, spacing: 0.45 } as const;

/** One appended wave per stage drawn from the sector pool so every new specialist kind stays in play. */
export const MIX_POOLS: Record<StageDef["sector"], string[]> = {
  1: ["mortar"],
  2: ["lancer"],
  3: ["orbiter"],
  4: ["splitter"],
  5: ["mortar", "lancer", "orbiter", "splitter"],
};
export const MIX_WAVE = { base: 2, perTier: 0, atFrac: 0.75, spacing: 0.7 } as const;

/**
 * Target-band overrides where integer count rounding makes the exact 0.75x band
 * unreachable in one jump. Every value is shorter than the raw (pre-Phase-1) band.
 * All other stages use [round(0.75*lo), round(0.75*hi)].
 */
export const STAGE_BANDS: Record<number, [number, number]> = {
  8: [39, 44], 13: [42, 55], 19: [46, 59], 25: [46, 59], 31: [48, 59], 37: [50, 59],
  39: [34, 39], 43: [52, 59], 49: [56, 59],
};

/**
 * Boss stages track the boss tempo (targetSeconds x0.8, matching data/bosses.ts)
 * so the boss band-consistency check in scripts/balance.ts stays coherent.
 */
export const BOSS_STAGE_TEMPO = 0.8;

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Apply the hard-mode tempo + mixing to one raw stage. Pure; called at export. */
function hardenStage(raw: StageDef): StageDef {
  const [lo, hi] = raw.targetSeconds;
  if (raw.isBoss) {
    return {
      ...raw,
      targetSeconds: [Math.round(lo * BOSS_STAGE_TEMPO), Math.round(hi * BOSS_STAGE_TEMPO)],
    };
  }

  const { time, spacing: spScale } = STAGE_TEMPO;
  const isRush = raw.composition === "smasher_rush";
  const scale = isRush ? 1 : (COUNT_SCALE[raw.stage] ?? 1);

  const waves = raw.waves.map((w) => {
    const count = Math.max(1, Math.round(w.count * scale));
    const spacing = r2(w.spacing * spScale);
    let kinds = w.kinds;
    if (isRush) {
      const medium = RUSH_MEDIUM[raw.stage] ?? 0;
      kinds = [
        ...Array(RUSH_KIND_DEN - medium).fill("breaker_small"),
        ...Array(medium).fill("breaker_medium"),
      ];
    }
    return { ...w, kinds, count, at: r2(w.at * time), spacing };
  });

  const mid = (Math.round(lo * time) + Math.round(hi * time)) / 2;
  // The engine multiplies every wave's count by 1.1^tier. Normalise the appended
  // waves against that so the INTENDED absolute size (base + tier*perTier) is
  // what actually spawns; otherwise 1.1^tier inflates them ~3x by tier 12 into a
  // one-type flood that also spills past the stage's schedule band.
  const qty = Math.pow(1.1, raw.tier);
  const norm = (target: number): number => Math.max(1, Math.round(target / qty));

  // Breaker surge from stage 3 on; absolute size grows with tier (base + tier*perTier).
  if (raw.stage >= 3) {
    waves.push({
      kinds: BREAKER_MIX,
      count: Math.max(3, Math.round((SMASHER_EXTRA.base + raw.tier * SMASHER_EXTRA.perTier) / qty)),
      at: r2(mid * SMASHER_EXTRA.atFrac),
      spacing: SMASHER_EXTRA.spacing,
    });
  }

  // Extra smasher pressure on rush stages (raw rush waves stay intact).
  if (isRush) {
    waves.push({
      kinds: BREAKER_MIX,
      count: Math.max(1, Math.round((RUSH_SURGE[raw.stage] ?? 0) / qty)),
      at: r2(mid * RUSH_SURGE_AT),
      spacing: RUSH_SURGE_SPACING,
    });
  }

  // Mixed specialist wave so no stage floods a single type. Trimmed on rush stages
  // (the non-smasher wave) to offset the added smasher HP.
  waves.push({
    kinds: MIX_POOLS[raw.sector],
    count: isRush ? Math.max(1, Math.round(1 / qty)) : norm(MIX_WAVE.base + raw.tier * MIX_WAVE.perTier),
    at: r2(mid * MIX_WAVE.atFrac),
    spacing: MIX_WAVE.spacing,
  });

  const band = STAGE_BANDS[raw.stage] ?? [Math.round(lo * 0.75), Math.round(hi * 0.75)];
  return { ...raw, targetSeconds: band, waves };
}

const RAW_STAGES: StageDef[] = [
  // ------------------------------------------------------------ sector 1
  {
    stage: 1, tier: 0, sector: 1, composition: "rock_intro", isBoss: false,
    budget: 46, targetSeconds: [35, 45],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 9, at: 0, spacing: 1.06 },
      { kinds: ["rock_normal_small"], count: 6, at: 11.28, spacing: 0.88 },
      { kinds: ["rock_normal_small"], count: 8, at: 20.68, spacing: 0.79 },
      { kinds: ["rock_normal_small"], count: 11, at: 30.08, spacing: 0.62 },
    ],
  },
  {
    stage: 2, tier: 0, sector: 1, composition: "rock_intro", isBoss: false,
    budget: 52, targetSeconds: [35, 45],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 9, at: 0, spacing: 1.06 },
      { kinds: ["rock_normal_medium"], count: 4, at: 9.02, spacing: 1.41 },
      { kinds: ["rock_normal_small"], count: 8, at: 18.05, spacing: 0.79 },
      { kinds: ["rock_normal_medium"], count: 4, at: 27.07, spacing: 1.23 },
      { kinds: ["rock_normal_small"], count: 11, at: 36.1, spacing: 0.62 },
    ],
  },
  {
    stage: 3, tier: 0, sector: 1, composition: "rock_field", isBoss: false,
    budget: 58, targetSeconds: [38, 48],
    waves: [
      { kinds: ["rock_normal_medium", "breaker_small"], count: 6, at: 0, spacing: 1.23 },
      { kinds: ["rock_normal_large"], count: 3, at: 10.62, spacing: 2.2 },
      { kinds: ["rock_normal_medium"], count: 8, at: 19.46, spacing: 0.88 },
      { kinds: ["rock_normal_large"], count: 4, at: 30.08, spacing: 1.76 },
      { kinds: ["rock_normal_medium"], count: 8, at: 38.92, spacing: 0.79 },
    ],
  },
  {
    stage: 4, tier: 1, sector: 1, composition: "rock_field", isBoss: false,
    budget: 64, targetSeconds: [40, 52],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 15, at: 0, spacing: 0.7 },
      { kinds: ["rock_normal_medium"], count: 7, at: 8.84, spacing: 1.06 },
      { kinds: ["rock_normal_large"], count: 3, at: 17.67, spacing: 1.94 },
      { kinds: ["rock_normal_small"], count: 17, at: 26.51, spacing: 0.53 },
      { kinds: ["rock_normal_medium"], count: 8, at: 35.34, spacing: 0.88 },
      { kinds: ["rock_normal_large"], count: 4, at: 42.39, spacing: 1.58 },
    ],
  },
  {
    stage: 5, tier: 1, sector: 1, composition: "rock_field", isBoss: false,
    budget: 70, targetSeconds: [40, 55],
    waves: [
      { kinds: ["rock_ice_small", "breaker_small"], count: 12, at: 0, spacing: 0.7 },
      { kinds: ["rock_metal_small"], count: 7, at: 9.4, spacing: 1.23 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 18.8, spacing: 1.41 },
      { kinds: ["rock_ice_medium"], count: 8, at: 28.2, spacing: 0.88 },
      {
        kinds: ["rock_ice_small", "rock_metal_small", "rock_explosive_small"], count: 22, at: 39.48, spacing: 0.22, burst: true,
      },
    ],
  },
  {
    stage: 6, tier: 1, sector: 1, composition: "shooter_squadron", isBoss: false,
    budget: 76, targetSeconds: [42, 55],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 12, at: 0, spacing: 0.7 },
      { kinds: ["raider"], count: 2, at: 12, spacing: 2.0 },
      { kinds: ["rock_normal_medium"], count: 7, at: 20.68, spacing: 0.97 },
      { kinds: ["raider"], count: 2, at: 34, spacing: 1.8 },
      { kinds: ["rock_normal_small"], count: 14, at: 41.36, spacing: 0.53 },
    ],
  },
  {
    stage: 7, tier: 1, sector: 1, composition: "shooter_squadron", isBoss: false,
    budget: 82, targetSeconds: [42, 58],
    waves: [
      { kinds: ["raider"], count: 3, at: 0, spacing: 1.4 },
      { kinds: ["rock_normal_medium", "breaker_small"], count: 6, at: 11.28, spacing: 1.06 },
      { kinds: ["raider"], count: 3, at: 24, spacing: 1.2 },
      { kinds: ["raider"], count: 4, at: 36, spacing: 0.9 },
      { kinds: ["rock_normal_large"], count: 3, at: 43.24, spacing: 1.76 },
    ],
  },
  {
    stage: 8, tier: 2, sector: 1, composition: "smasher_rush", isBoss: false,
    budget: 88, targetSeconds: [40, 55],
    waves: [
      { kinds: ["breaker_small"], count: 5, at: 0, spacing: 1.76 },
      { kinds: ["breaker_small"], count: 5, at: 13.16, spacing: 1.58 },
      { kinds: ["breaker_small"], count: 6, at: 26.32, spacing: 1.32 },
      { kinds: ["breaker_small"], count: 6, at: 39.48, spacing: 1.14 },
    ],
  },
  {
    stage: 9, tier: 2, sector: 1, composition: "mixed_assault", isBoss: false,
    budget: 94, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_normal_medium"], count: 7, at: 0, spacing: 0.97 },
      { kinds: ["breaker_small"], count: 6, at: 9.4, spacing: 1.14 },
      { kinds: ["raider"], count: 2, at: 20, spacing: 1.8 },
      { kinds: ["rock_ice_small"], count: 11, at: 28.2, spacing: 0.62 },
      { kinds: ["breaker_medium"], count: 5, at: 37.6, spacing: 1.41 },
      { kinds: ["raider"], count: 2, at: 50, spacing: 1.6 },
    ],
  },
  {
    stage: 10, tier: 2, sector: 1, composition: "elite", isBoss: true,
    bossId: "warden_colossus",
    budget: 0, targetSeconds: [60, 80],
    waves: [],
  },

  // ------------------------------------------------------------ sector 2
  {
    stage: 11, tier: 2, sector: 2, composition: rot(11), isBoss: false,
    budget: 106, targetSeconds: [40, 55],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 15, at: 0, spacing: 0.7 },
      { kinds: ["rock_normal_medium"], count: 7, at: 9.4, spacing: 1.06 },
      { kinds: ["rock_normal_large"], count: 3, at: 20.68, spacing: 1.94 },
      { kinds: ["rock_normal_small"], count: 17, at: 31.96, spacing: 0.53 },
      { kinds: ["rock_normal_medium"], count: 8, at: 43.24, spacing: 0.88 },
    ],
  },
  {
    stage: 12, tier: 3, sector: 2, composition: rot(12), isBoss: false,
    budget: 112, targetSeconds: [42, 56],
    waves: [
      { kinds: ["raider"], count: 3, at: 0, spacing: 1.4 },
      { kinds: ["rock_metal_small", "breaker_small"], count: 9, at: 9.4, spacing: 0.88 },
      { kinds: ["raider"], count: 2, at: 22, spacing: 1.8 },
      { kinds: ["rock_normal_medium"], count: 8, at: 30.08, spacing: 0.88 },
      { kinds: ["raider"], count: 3, at: 44, spacing: 1.2 },
    ],
  },
  {
    stage: 13, tier: 3, sector: 2, composition: rot(13), isBoss: false,
    budget: 118, targetSeconds: [42, 56],
    waves: [
      { kinds: ["breaker_small"], count: 8, at: 0, spacing: 1.23 },
      { kinds: ["breaker_medium"], count: 3, at: 11.28, spacing: 1.76 },
      { kinds: ["breaker_small"], count: 9, at: 22.56, spacing: 0.97 },
      { kinds: ["breaker_medium"], count: 5, at: 33.84, spacing: 1.41 },
      { kinds: ["breaker_large"], count: 2, at: 45.12, spacing: 2.64 },
    ],
  },
  {
    stage: 14, tier: 3, sector: 2, composition: rot(14), isBoss: false,
    budget: 124, targetSeconds: [45, 58],
    waves: [
      { kinds: ["rock_ice_small"], count: 11, at: 0, spacing: 0.7 },
      { kinds: ["raider"], count: 2, at: 10, spacing: 1.8 },
      { kinds: ["breaker_small"], count: 8, at: 18.8, spacing: 1.06 },
      { kinds: ["rock_normal_medium"], count: 7, at: 28.2, spacing: 0.97 },
      { kinds: ["breaker_medium"], count: 5, at: 39.48, spacing: 1.41 },
      { kinds: ["raider"], count: 2, at: 52, spacing: 1.6 },
    ],
  },
  {
    stage: 15, tier: 3, sector: 2, composition: rot(15), isBoss: false,
    budget: 130, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 6, at: 0, spacing: 1.41 },
      { kinds: ["raider"], count: 3, at: 12, spacing: 1.4 },
      { kinds: ["breaker_medium"], count: 5, at: 22.56, spacing: 1.41 },
      { kinds: ["rock_normal_large"], count: 3, at: 31.96, spacing: 1.94 },
      { kinds: ["rock_metal_small"], count: 11, at: 41.36, spacing: 0.7 },
      { kinds: ["breaker_large"], count: 2, at: 50.76, spacing: 2.64 },
    ],
  },
  {
    stage: 16, tier: 4, sector: 2, composition: rot(16), isBoss: false,
    budget: 136, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_ice_small", "breaker_small"], count: 15, at: 0, spacing: 0.62 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 11.28, spacing: 1.41 },
      { kinds: ["rock_ice_medium"], count: 7, at: 22.56, spacing: 1.06 },
      { kinds: ["rock_explosive_small"], count: 11, at: 31.96, spacing: 0.7 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small"], count: 25, at: 43.24, spacing: 0.26, burst: true,
      },
    ],
  },
  {
    stage: 17, tier: 4, sector: 2, composition: rot(17), isBoss: false,
    budget: 142, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 18, at: 0, spacing: 0.62 },
      { kinds: ["rock_normal_medium"], count: 8, at: 9.02, spacing: 0.97 },
      { kinds: ["rock_normal_large"], count: 4, at: 19.83, spacing: 1.76 },
      { kinds: ["rock_normal_small"], count: 20, at: 30.64, spacing: 0.53 },
      { kinds: ["rock_normal_medium"], count: 10, at: 40.61, spacing: 0.79 },
      { kinds: ["rock_normal_large"], count: 4, at: 49.63, spacing: 1.58 },
    ],
  },
  {
    stage: 18, tier: 4, sector: 2, composition: rot(18), isBoss: false,
    budget: 148, targetSeconds: [46, 60],
    waves: [
      { kinds: ["raider"], count: 3, at: 0, spacing: 1.3 },
      { kinds: ["rock_metal_small", "breaker_small"], count: 12, at: 9.4, spacing: 0.79 },
      { kinds: ["raider"], count: 3, at: 22, spacing: 1.3 },
      { kinds: ["rock_normal_medium"], count: 10, at: 30.08, spacing: 0.79 },
      { kinds: ["raider"], count: 4, at: 44, spacing: 1.0 },
    ],
  },
  {
    stage: 19, tier: 4, sector: 2, composition: rot(19), isBoss: false,
    budget: 154, targetSeconds: [46, 60],
    waves: [
      { kinds: ["breaker_small"], count: 9, at: 0, spacing: 1.06 },
      { kinds: ["breaker_medium"], count: 5, at: 11.28, spacing: 1.41 },
      { kinds: ["breaker_small"], count: 11, at: 22.56, spacing: 0.88 },
      { kinds: ["breaker_medium"], count: 6, at: 33.84, spacing: 1.23 },
      { kinds: ["breaker_large"], count: 3, at: 45.12, spacing: 2.29 },
    ],
  },
  {
    stage: 20, tier: 5, sector: 2, composition: "elite", isBoss: true,
    bossId: "razor_queen",
    budget: 0, targetSeconds: [80, 100],
    waves: [],
  },

  // ------------------------------------------------------------ sector 3
  {
    stage: 21, tier: 5, sector: 3, composition: rot(21), isBoss: false,
    budget: 166, targetSeconds: [46, 60],
    waves: [
      { kinds: ["rock_normal_medium"], count: 8, at: 0, spacing: 0.88 },
      { kinds: ["breaker_small"], count: 9, at: 9.4, spacing: 0.97 },
      { kinds: ["raider"], count: 3, at: 20, spacing: 1.3 },
      { kinds: ["rock_metal_medium"], count: 6, at: 28.2, spacing: 1.23 },
      { kinds: ["breaker_medium"], count: 5, at: 37.6, spacing: 1.32 },
      { kinds: ["raider"], count: 3, at: 50, spacing: 1.3 },
    ],
  },
  {
    stage: 22, tier: 5, sector: 3, composition: rot(22), isBoss: false,
    budget: 172, targetSeconds: [46, 60],
    waves: [
      { kinds: ["rock_ice_small", "breaker_small"], count: 15, at: 0, spacing: 0.62 },
      { kinds: ["rock_explosive_small"], count: 11, at: 9.4, spacing: 0.7 },
      { kinds: ["rock_ice_medium"], count: 8, at: 20.68, spacing: 0.97 },
      { kinds: ["rock_explosive_medium"], count: 6, at: 31.96, spacing: 1.32 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"], count: 28, at: 43.24, spacing: 0.25, burst: true,
      },
    ],
  },
  {
    stage: 23, tier: 5, sector: 3, composition: rot(23), isBoss: false,
    budget: 178, targetSeconds: [46, 60],
    waves: [
      { kinds: ["rock_normal_small", "breaker_small"], count: 18, at: 0, spacing: 0.62 },
      { kinds: ["rock_normal_medium"], count: 10, at: 8.46, spacing: 0.88 },
      { kinds: ["rock_normal_large"], count: 4, at: 18.61, spacing: 1.76 },
      { kinds: ["rock_normal_small"], count: 20, at: 28.76, spacing: 0.48 },
      { kinds: ["rock_normal_medium"], count: 11, at: 38.07, spacing: 0.79 },
      { kinds: ["rock_normal_large"], count: 6, at: 46.53, spacing: 1.5 },
    ],
  },
  {
    stage: 24, tier: 6, sector: 3, composition: rot(24), isBoss: false,
    budget: 184, targetSeconds: [46, 60],
    waves: [
      { kinds: ["raider"], count: 4, at: 0, spacing: 1.2 },
      { kinds: ["rock_metal_small", "breaker_medium"], count: 12, at: 11.28, spacing: 0.79 },
      { kinds: ["raider"], count: 3, at: 24, spacing: 1.3 },
      { kinds: ["rock_metal_medium"], count: 7, at: 31.96, spacing: 1.14 },
      { kinds: ["raider"], count: 4, at: 46, spacing: 1.0 },
    ],
  },
  {
    stage: 25, tier: 6, sector: 3, composition: rot(25), isBoss: false,
    budget: 190, targetSeconds: [46, 60],
    waves: [
      { kinds: ["breaker_small"], count: 11, at: 0, spacing: 0.97 },
      { kinds: ["breaker_medium"], count: 6, at: 11.28, spacing: 1.23 },
      { kinds: ["breaker_small"], count: 12, at: 22.56, spacing: 0.79 },
      { kinds: ["breaker_medium"], count: 6, at: 33.84, spacing: 1.14 },
      { kinds: ["breaker_large"], count: 3, at: 45.12, spacing: 2.11 },
    ],
  },
  {
    stage: 26, tier: 6, sector: 3, composition: rot(26), isBoss: false,
    budget: 196, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_ice_small"], count: 14, at: 0, spacing: 0.62 },
      { kinds: ["breaker_small"], count: 9, at: 9.4, spacing: 0.97 },
      { kinds: ["raider"], count: 3, at: 20, spacing: 1.3 },
      { kinds: ["rock_normal_large"], count: 3, at: 28.2, spacing: 1.94 },
      { kinds: ["breaker_medium"], count: 6, at: 37.6, spacing: 1.23 },
      { kinds: ["raider"], count: 4, at: 50, spacing: 1.1 },
    ],
  },
  {
    stage: 27, tier: 6, sector: 3, composition: rot(27), isBoss: false,
    budget: 202, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 7, at: 0, spacing: 1.23 },
      { kinds: ["breaker_medium"], count: 6, at: 9.49, spacing: 1.23 },
      { kinds: ["raider"], count: 4, at: 20.2, spacing: 1.2 },
      { kinds: ["rock_normal_large"], count: 4, at: 26.88, spacing: 1.76 },
      { kinds: ["rock_metal_large"], count: 3, at: 34.78, spacing: 2.29 },
      { kinds: ["breaker_large"], count: 3, at: 42.68, spacing: 2.11 },
    ],
  },
  {
    stage: 28, tier: 7, sector: 3, composition: rot(28), isBoss: false,
    budget: 208, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_ice_medium", "breaker_medium"], count: 9, at: 0, spacing: 0.88 },
      { kinds: ["rock_explosive_medium"], count: 6, at: 11.28, spacing: 1.23 },
      { kinds: ["rock_ice_small"], count: 17, at: 22.56, spacing: 0.53 },
      { kinds: ["rock_explosive_small"], count: 14, at: 31.96, spacing: 0.62 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"], count: 31, at: 43.24, spacing: 0.22, burst: true,
      },
    ],
  },
  {
    stage: 29, tier: 7, sector: 3, composition: rot(29), isBoss: false,
    budget: 214, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_normal_small", "breaker_medium"], count: 19, at: 0, spacing: 0.53 },
      { kinds: ["rock_normal_medium"], count: 11, at: 7.9, spacing: 0.79 },
      { kinds: ["rock_normal_large"], count: 5, at: 17.39, spacing: 1.58 },
      { kinds: ["rock_normal_small"], count: 21, at: 26.88, spacing: 0.44 },
      { kinds: ["rock_normal_medium"], count: 11, at: 35.53, spacing: 0.75 },
      { kinds: ["rock_normal_large"], count: 5, at: 43.43, spacing: 1.41 },
    ],
  },
  {
    stage: 30, tier: 7, sector: 3, composition: "elite", isBoss: true,
    bossId: "prism_sentinel",
    budget: 0, targetSeconds: [100, 130],
    waves: [],
  },

  // ------------------------------------------------------------ sector 4
  {
    stage: 31, tier: 7, sector: 4, composition: rot(31), isBoss: false,
    budget: 226, targetSeconds: [48, 60],
    waves: [
      { kinds: ["breaker_small"], count: 12, at: 0, spacing: 0.88 },
      { kinds: ["breaker_medium"], count: 6, at: 11.28, spacing: 1.14 },
      { kinds: ["breaker_small"], count: 14, at: 22.56, spacing: 0.75 },
      { kinds: ["breaker_medium"], count: 8, at: 33.84, spacing: 1.06 },
      { kinds: ["breaker_large"], count: 5, at: 45.12, spacing: 1.94 },
    ],
  },
  {
    stage: 32, tier: 8, sector: 4, composition: rot(32), isBoss: false,
    budget: 232, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_metal_small"], count: 14, at: 0, spacing: 0.62 },
      { kinds: ["breaker_small"], count: 11, at: 9.4, spacing: 0.88 },
      { kinds: ["raider"], count: 4, at: 20, spacing: 1.2 },
      { kinds: ["rock_normal_large"], count: 4, at: 28.2, spacing: 1.67 },
      { kinds: ["breaker_medium"], count: 6, at: 37.6, spacing: 1.14 },
      { kinds: ["raider"], count: 4, at: 50, spacing: 1.1 },
    ],
  },
  {
    stage: 33, tier: 8, sector: 4, composition: rot(33), isBoss: false,
    budget: 238, targetSeconds: [50, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 6, at: 0, spacing: 1.14 },
      { kinds: ["breaker_medium"], count: 6, at: 11.28, spacing: 1.14 },
      { kinds: ["raider"], count: 4, at: 24, spacing: 1.1 },
      { kinds: ["rock_metal_large"], count: 3, at: 31.96, spacing: 1.94 },
      { kinds: ["breaker_large"], count: 2, at: 41.36, spacing: 1.94 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 50.76, spacing: 1.14 },
    ],
  },
  {
    stage: 34, tier: 8, sector: 4, composition: rot(34), isBoss: false,
    budget: 244, targetSeconds: [50, 60],
    waves: [
      { kinds: ["rock_ice_small", "breaker_medium"], count: 18, at: 0, spacing: 0.53 },
      { kinds: ["rock_explosive_small"], count: 14, at: 8.84, spacing: 0.62 },
      { kinds: ["rock_ice_medium"], count: 10, at: 19.46, spacing: 0.88 },
      { kinds: ["rock_explosive_medium"], count: 7, at: 30.08, spacing: 1.14 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"], count: 34, at: 40.61, spacing: 0.21, burst: true,
      },
    ],
  },
  {
    stage: 35, tier: 8, sector: 4, composition: rot(35), isBoss: false,
    budget: 250, targetSeconds: [50, 60],
    waves: [
      { kinds: ["rock_normal_small", "breaker_medium"], count: 20, at: 0, spacing: 0.53 },
      { kinds: ["rock_normal_medium"], count: 11, at: 7.71, spacing: 0.75 },
      { kinds: ["rock_normal_large"], count: 6, at: 16.92, spacing: 1.5 },
      { kinds: ["rock_normal_small"], count: 21, at: 26.23, spacing: 0.44 },
      { kinds: ["rock_normal_medium"], count: 13, at: 34.69, spacing: 0.7 },
      { kinds: ["rock_normal_large"], count: 6, at: 42.39, spacing: 1.32 },
    ],
  },
  {
    stage: 36, tier: 9, sector: 4, composition: rot(36), isBoss: false,
    budget: 256, targetSeconds: [50, 60],
    waves: [
      { kinds: ["raider"], count: 5, at: 0, spacing: 1.1 },
      { kinds: ["rock_metal_small", "breaker_medium"], count: 14, at: 7.43, spacing: 0.7 },
      { kinds: ["raider"], count: 4, at: 15.8, spacing: 1.2 },
      { kinds: ["rock_metal_medium"], count: 8, at: 21.06, spacing: 1.06 },
      { kinds: ["raider"], count: 5, at: 30.4, spacing: 0.95 },
    ],
  },
  {
    stage: 37, tier: 9, sector: 4, composition: rot(37), isBoss: false,
    budget: 262, targetSeconds: [50, 60],
    waves: [
      { kinds: ["breaker_small"], count: 14, at: 0, spacing: 0.84 },
      { kinds: ["breaker_medium"], count: 8, at: 10.62, spacing: 1.06 },
      { kinds: ["breaker_small"], count: 15, at: 21.24, spacing: 0.7 },
      { kinds: ["breaker_medium"], count: 8, at: 31.77, spacing: 1.01 },
      { kinds: ["breaker_large"], count: 5, at: 42.39, spacing: 1.85 },
    ],
  },
  {
    stage: 38, tier: 9, sector: 4, composition: rot(38), isBoss: false,
    budget: 268, targetSeconds: [52, 60],
    waves: [
      { kinds: ["rock_ice_medium"], count: 8, at: 0, spacing: 0.97 },
      { kinds: ["breaker_medium"], count: 8, at: 9.4, spacing: 1.06 },
      { kinds: ["raider"], count: 5, at: 20, spacing: 1.1 },
      { kinds: ["rock_normal_large"], count: 4, at: 28.2, spacing: 1.67 },
      { kinds: ["breaker_large"], count: 3, at: 37.6, spacing: 1.94 },
      { kinds: ["raider"], count: 5, at: 47, spacing: 1.0 },
    ],
  },
  {
    stage: 39, tier: 9, sector: 4, composition: rot(39), isBoss: false,
    budget: 274, targetSeconds: [52, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 6, at: 0, spacing: 1.06 },
      { kinds: ["breaker_medium"], count: 5, at: 9.21, spacing: 1.06 },
      { kinds: ["raider"], count: 3, at: 19.7, spacing: 1.0 },
      { kinds: ["rock_metal_large"], count: 3, at: 26.23, spacing: 1.76 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 33.93, spacing: 1.06 },
      { kinds: ["breaker_large"], count: 3, at: 41.64, spacing: 1.76 },
    ],
  },
  {
    stage: 40, tier: 10, sector: 4, composition: "shooter_squadron", isBoss: true,
    bossId: "void_carrier",
    budget: 0, targetSeconds: [130, 170],
    waves: [],
  },

  // ------------------------------------------------------------ sector 5
  {
    stage: 41, tier: 10, sector: 5, composition: rot(41), isBoss: false,
    budget: 286, targetSeconds: [52, 60],
    waves: [
      { kinds: ["rock_normal_small", "breaker_medium"], count: 18, at: 0, spacing: 0.48 },
      { kinds: ["rock_normal_medium"], count: 10, at: 7.33, spacing: 0.7 },
      { kinds: ["rock_normal_large"], count: 4, at: 16.17, spacing: 1.41 },
      { kinds: ["rock_normal_small"], count: 18, at: 24.91, spacing: 0.4 },
      { kinds: ["rock_normal_medium"], count: 11, at: 32.99, spacing: 0.66 },
      { kinds: ["rock_normal_large"], count: 6, at: 40.33, spacing: 1.23 },
    ],
  },
  {
    stage: 42, tier: 10, sector: 5, composition: rot(42), isBoss: false,
    budget: 292, targetSeconds: [52, 60],
    waves: [
      { kinds: ["raider"], count: 5, at: 0, spacing: 1.0 },
      { kinds: ["rock_metal_small", "breaker_medium"], count: 15, at: 7.9, spacing: 0.62 },
      { kinds: ["raider"], count: 4, at: 16.8, spacing: 1.1 },
      { kinds: ["rock_metal_medium"], count: 8, at: 22.37, spacing: 0.97 },
      { kinds: ["raider"], count: 5, at: 32.2, spacing: 0.9 },
    ],
  },
  {
    stage: 43, tier: 10, sector: 5, composition: rot(43), isBoss: false,
    budget: 298, targetSeconds: [52, 60],
    waves: [
      { kinds: ["breaker_small"], count: 14, at: 0, spacing: 0.79 },
      { kinds: ["breaker_medium"], count: 8, at: 7.9, spacing: 1.01 },
      { kinds: ["breaker_small"], count: 15, at: 15.79, spacing: 0.66 },
      { kinds: ["breaker_medium"], count: 8, at: 23.69, spacing: 0.97 },
      { kinds: ["breaker_large"], count: 6, at: 31.58, spacing: 1.76 },
    ],
  },
  {
    stage: 44, tier: 11, sector: 5, composition: rot(44), isBoss: false,
    budget: 304, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_metal_small"], count: 10, at: 0, spacing: 0.62 },
      { kinds: ["breaker_medium"], count: 5, at: 9.02, spacing: 1.01 },
      { kinds: ["raider"], count: 3, at: 19.2, spacing: 1.0 },
      { kinds: ["rock_metal_large"], count: 3, at: 27.07, spacing: 1.67 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 36.1, spacing: 1.06 },
      { kinds: ["raider"], count: 6, at: 44, spacing: 0.9 },
    ],
  },
  {
    stage: 45, tier: 11, sector: 5, composition: rot(45), isBoss: false,
    budget: 310, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 4, at: 0, spacing: 0.97 },
      { kinds: ["breaker_medium"], count: 5, at: 9.49, spacing: 0.97 },
      { kinds: ["raider"], count: 3, at: 20.2, spacing: 0.95 },
      { kinds: ["rock_metal_large"], count: 3, at: 26.88, spacing: 1.67 },
      { kinds: ["breaker_large"], count: 2, at: 34.78, spacing: 1.76 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 42.68, spacing: 0.97 },
    ],
  },
  {
    stage: 46, tier: 11, sector: 5, composition: rot(46), isBoss: false,
    budget: 316, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_ice_small", "breaker_medium"], count: 21, at: 0, spacing: 0.48 },
      { kinds: ["rock_explosive_small"], count: 17, at: 7.52, spacing: 0.57 },
      { kinds: ["rock_ice_medium"], count: 11, at: 16.54, spacing: 0.84 },
      { kinds: ["rock_explosive_medium"], count: 8, at: 25.57, spacing: 1.06 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"], count: 39, at: 34.59, spacing: 0.19, burst: true,
      },
    ],
  },
  {
    stage: 47, tier: 11, sector: 5, composition: rot(47), isBoss: false,
    budget: 322, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_normal_small", "breaker_medium"], count: 17, at: 0, spacing: 0.44 },
      { kinds: ["rock_normal_medium"], count: 8, at: 7.9, spacing: 0.66 },
      { kinds: ["rock_normal_large"], count: 4, at: 17.39, spacing: 1.32 },
      { kinds: ["rock_normal_small"], count: 17, at: 26.88, spacing: 0.37 },
      { kinds: ["rock_normal_medium"], count: 10, at: 35.53, spacing: 0.62 },
      { kinds: ["rock_normal_large"], count: 4, at: 43.43, spacing: 1.19 },
    ],
  },
  {
    stage: 48, tier: 12, sector: 5, composition: rot(48), isBoss: false,
    budget: 328, targetSeconds: [54, 60],
    waves: [
      { kinds: ["raider"], count: 4, at: 0, spacing: 0.95 },
      { kinds: ["rock_metal_small", "breaker_medium"], count: 13, at: 10.62, spacing: 0.57 },
      { kinds: ["raider"], count: 3, at: 22.6, spacing: 1.0 },
      { kinds: ["rock_metal_medium"], count: 9, at: 30.08, spacing: 0.88 },
      { kinds: ["raider"], count: 4, at: 43.2, spacing: 0.85 },
    ],
  },
  {
    stage: 49, tier: 12, sector: 5, composition: rot(49), isBoss: false,
    budget: 334, targetSeconds: [56, 60],
    waves: [
      { kinds: ["breaker_small"], count: 12, at: 0, spacing: 0.75 },
      { kinds: ["breaker_medium"], count: 6, at: 9.96, spacing: 0.97 },
      { kinds: ["breaker_small"], count: 12, at: 19.83, spacing: 0.62 },
      { kinds: ["breaker_medium"], count: 8, at: 29.8, spacing: 0.92 },
      { kinds: ["breaker_large"], count: 6, at: 38.0, spacing: 1.67 },
    ],
  },
  {
    stage: 50, tier: 12, sector: 5, composition: "elite", isBoss: true,
    bossId: "eclipse_sovereign",
    budget: 0, targetSeconds: [180, 300],
    waves: [],
  },
];

/** Transformed (hard-mode) stage table. All engine + balance code reads this. */
export const STAGES: StageDef[] = RAW_STAGES.map(hardenStage);

export function getStage(n: number): StageDef {
  return STAGES[Math.max(0, Math.min(49, n - 1))]!;
}

export const COMPOSITION_ROTATION: StageComposition[] = [
  "rock_field",
  "shooter_squadron",
  "smasher_rush",
  "mixed_assault",
  "elite",
  "meteor_shower",
];