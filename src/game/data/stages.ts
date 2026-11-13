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

export const STAGES: StageDef[] = [
  // ------------------------------------------------------------ sector 1
  {
    stage: 1, tier: 0, sector: 1, composition: "rock_intro", isBoss: false,
    budget: 46, targetSeconds: [35, 45],
    waves: [
      { kinds: ["rock_normal_small"], count: 6, at: 0, spacing: 1.2 },
      { kinds: ["rock_normal_small"], count: 4, at: 12, spacing: 1.0 },
      { kinds: ["rock_normal_small"], count: 6, at: 22, spacing: 0.9 },
      { kinds: ["rock_normal_small"], count: 6, at: 32, spacing: 0.7 },
    ],
  },
  {
    stage: 2, tier: 0, sector: 1, composition: "rock_intro", isBoss: false,
    budget: 52, targetSeconds: [35, 45],
    waves: [
      { kinds: ["rock_normal_small"], count: 6, at: 0, spacing: 1.2 },
      { kinds: ["rock_normal_medium"], count: 3, at: 10, spacing: 1.6 },
      { kinds: ["rock_normal_small"], count: 6, at: 20, spacing: 0.9 },
      { kinds: ["rock_normal_medium"], count: 3, at: 30, spacing: 1.4 },
      { kinds: ["rock_normal_small"], count: 8, at: 40, spacing: 0.7 },
    ],
  },
  {
    stage: 3, tier: 0, sector: 1, composition: "rock_field", isBoss: false,
    budget: 58, targetSeconds: [38, 48],
    waves: [
      { kinds: ["rock_normal_medium"], count: 4, at: 0, spacing: 1.4 },
      { kinds: ["rock_normal_large"], count: 2, at: 12, spacing: 2.5 },
      { kinds: ["rock_normal_medium"], count: 6, at: 22, spacing: 1.0 },
      { kinds: ["rock_normal_large"], count: 3, at: 34, spacing: 2.0 },
      { kinds: ["rock_normal_medium"], count: 6, at: 44, spacing: 0.9 },
    ],
  },
  {
    stage: 4, tier: 1, sector: 1, composition: "rock_field", isBoss: false,
    budget: 64, targetSeconds: [40, 52],
    waves: [
      { kinds: ["rock_normal_small"], count: 10, at: 0, spacing: 0.8 },
      { kinds: ["rock_normal_medium"], count: 5, at: 10, spacing: 1.2 },
      { kinds: ["rock_normal_large"], count: 2, at: 20, spacing: 2.2 },
      { kinds: ["rock_normal_small"], count: 12, at: 30, spacing: 0.6 },
      { kinds: ["rock_normal_medium"], count: 6, at: 40, spacing: 1.0 },
      { kinds: ["rock_normal_large"], count: 3, at: 48, spacing: 1.8 },
    ],
  },
  {
    stage: 5, tier: 1, sector: 1, composition: "rock_field", isBoss: false,
    budget: 70, targetSeconds: [40, 55],
    waves: [
      { kinds: ["rock_ice_small"], count: 8, at: 0, spacing: 0.8 },
      { kinds: ["rock_metal_small"], count: 5, at: 10, spacing: 1.4 },
      { kinds: ["rock_explosive_medium"], count: 3, at: 20, spacing: 1.6 },
      { kinds: ["rock_ice_medium"], count: 6, at: 30, spacing: 1.0 },
      {
        kinds: ["rock_ice_small", "rock_metal_small", "rock_explosive_small"],
        count: 16, at: 42, spacing: 0.25, burst: true,
      },
    ],
  },
  {
    stage: 6, tier: 1, sector: 1, composition: "shooter_squadron", isBoss: false,
    budget: 76, targetSeconds: [42, 55],
    waves: [
      { kinds: ["rock_normal_small"], count: 8, at: 0, spacing: 0.8 },
      { kinds: ["raider"], count: 2, at: 12, spacing: 2.0 },
      { kinds: ["rock_normal_medium"], count: 5, at: 22, spacing: 1.1 },
      { kinds: ["raider"], count: 2, at: 34, spacing: 1.8 },
      { kinds: ["rock_normal_small"], count: 10, at: 44, spacing: 0.6 },
    ],
  },
  {
    stage: 7, tier: 1, sector: 1, composition: "shooter_squadron", isBoss: false,
    budget: 82, targetSeconds: [42, 58],
    waves: [
      { kinds: ["raider"], count: 3, at: 0, spacing: 1.4 },
      { kinds: ["rock_normal_medium"], count: 4, at: 12, spacing: 1.2 },
      { kinds: ["raider"], count: 3, at: 24, spacing: 1.2 },
      { kinds: ["raider"], count: 4, at: 36, spacing: 0.9 },
      { kinds: ["rock_normal_large"], count: 2, at: 46, spacing: 2.0 },
    ],
  },
  {
    stage: 8, tier: 2, sector: 1, composition: "smasher_rush", isBoss: false,
    budget: 88, targetSeconds: [40, 55],
    waves: [
      { kinds: ["breaker_small"], count: 3, at: 0, spacing: 2.0 },
      { kinds: ["breaker_small"], count: 3, at: 14, spacing: 1.8 },
      { kinds: ["breaker_small"], count: 4, at: 28, spacing: 1.5 },
      { kinds: ["breaker_small"], count: 4, at: 42, spacing: 1.3 },
    ],
  },
  {
    stage: 9, tier: 2, sector: 1, composition: "mixed_assault", isBoss: false,
    budget: 94, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_normal_medium"], count: 5, at: 0, spacing: 1.1 },
      { kinds: ["breaker_small"], count: 4, at: 10, spacing: 1.3 },
      { kinds: ["raider"], count: 2, at: 20, spacing: 1.8 },
      { kinds: ["rock_ice_small"], count: 8, at: 30, spacing: 0.7 },
      { kinds: ["breaker_medium"], count: 3, at: 40, spacing: 1.6 },
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
      { kinds: ["rock_normal_small"], count: 10, at: 0, spacing: 0.8 },
      { kinds: ["rock_normal_medium"], count: 5, at: 10, spacing: 1.2 },
      { kinds: ["rock_normal_large"], count: 2, at: 22, spacing: 2.2 },
      { kinds: ["rock_normal_small"], count: 12, at: 34, spacing: 0.6 },
      { kinds: ["rock_normal_medium"], count: 6, at: 46, spacing: 1.0 },
    ],
  },
  {
    stage: 12, tier: 3, sector: 2, composition: rot(12), isBoss: false,
    budget: 112, targetSeconds: [42, 56],
    waves: [
      { kinds: ["raider"], count: 3, at: 0, spacing: 1.4 },
      { kinds: ["rock_metal_small"], count: 6, at: 10, spacing: 1.0 },
      { kinds: ["raider"], count: 2, at: 22, spacing: 1.8 },
      { kinds: ["rock_normal_medium"], count: 6, at: 32, spacing: 1.0 },
      { kinds: ["raider"], count: 3, at: 44, spacing: 1.2 },
    ],
  },
  {
    stage: 13, tier: 3, sector: 2, composition: rot(13), isBoss: false,
    budget: 118, targetSeconds: [42, 56],
    waves: [
      { kinds: ["breaker_small"], count: 5, at: 0, spacing: 1.4 },
      { kinds: ["breaker_medium"], count: 2, at: 12, spacing: 2.0 },
      { kinds: ["breaker_small"], count: 6, at: 24, spacing: 1.1 },
      { kinds: ["breaker_medium"], count: 3, at: 36, spacing: 1.6 },
      { kinds: ["breaker_large"], count: 1, at: 48, spacing: 3.0 },
    ],
  },
  {
    stage: 14, tier: 3, sector: 2, composition: rot(14), isBoss: false,
    budget: 124, targetSeconds: [45, 58],
    waves: [
      { kinds: ["rock_ice_small"], count: 8, at: 0, spacing: 0.8 },
      { kinds: ["raider"], count: 2, at: 10, spacing: 1.8 },
      { kinds: ["breaker_small"], count: 5, at: 20, spacing: 1.2 },
      { kinds: ["rock_normal_medium"], count: 5, at: 30, spacing: 1.1 },
      { kinds: ["breaker_medium"], count: 3, at: 42, spacing: 1.6 },
      { kinds: ["raider"], count: 2, at: 52, spacing: 1.6 },
    ],
  },
  {
    stage: 15, tier: 3, sector: 2, composition: rot(15), isBoss: false,
    budget: 130, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 4, at: 0, spacing: 1.6 },
      { kinds: ["raider"], count: 3, at: 12, spacing: 1.4 },
      { kinds: ["breaker_medium"], count: 3, at: 24, spacing: 1.6 },
      { kinds: ["rock_normal_large"], count: 2, at: 34, spacing: 2.2 },
      { kinds: ["rock_metal_small"], count: 8, at: 44, spacing: 0.8 },
      { kinds: ["breaker_large"], count: 1, at: 54, spacing: 3.0 },
    ],
  },
  {
    stage: 16, tier: 4, sector: 2, composition: rot(16), isBoss: false,
    budget: 136, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_ice_small"], count: 10, at: 0, spacing: 0.7 },
      { kinds: ["rock_explosive_medium"], count: 3, at: 12, spacing: 1.6 },
      { kinds: ["rock_ice_medium"], count: 5, at: 24, spacing: 1.2 },
      { kinds: ["rock_explosive_small"], count: 8, at: 34, spacing: 0.8 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small"],
        count: 18, at: 46, spacing: 0.3, burst: true,
      },
    ],
  },
  {
    stage: 17, tier: 4, sector: 2, composition: rot(17), isBoss: false,
    budget: 142, targetSeconds: [45, 60],
    waves: [
      { kinds: ["rock_normal_small"], count: 12, at: 0, spacing: 0.7 },
      { kinds: ["rock_normal_medium"], count: 6, at: 10, spacing: 1.1 },
      { kinds: ["rock_normal_large"], count: 3, at: 22, spacing: 2.0 },
      { kinds: ["rock_normal_small"], count: 14, at: 34, spacing: 0.6 },
      { kinds: ["rock_normal_medium"], count: 7, at: 45, spacing: 0.9 },
      { kinds: ["rock_normal_large"], count: 3, at: 55, spacing: 1.8 },
    ],
  },
  {
    stage: 18, tier: 4, sector: 2, composition: rot(18), isBoss: false,
    budget: 148, targetSeconds: [46, 60],
    waves: [
      { kinds: ["raider"], count: 3, at: 0, spacing: 1.3 },
      { kinds: ["rock_metal_small"], count: 8, at: 10, spacing: 0.9 },
      { kinds: ["raider"], count: 3, at: 22, spacing: 1.3 },
      { kinds: ["rock_normal_medium"], count: 7, at: 32, spacing: 0.9 },
      { kinds: ["raider"], count: 4, at: 44, spacing: 1.0 },
    ],
  },
  {
    stage: 19, tier: 4, sector: 2, composition: rot(19), isBoss: false,
    budget: 154, targetSeconds: [46, 60],
    waves: [
      { kinds: ["breaker_small"], count: 6, at: 0, spacing: 1.2 },
      { kinds: ["breaker_medium"], count: 3, at: 12, spacing: 1.6 },
      { kinds: ["breaker_small"], count: 7, at: 24, spacing: 1.0 },
      { kinds: ["breaker_medium"], count: 4, at: 36, spacing: 1.4 },
      { kinds: ["breaker_large"], count: 2, at: 48, spacing: 2.6 },
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
      { kinds: ["rock_normal_medium"], count: 6, at: 0, spacing: 1.0 },
      { kinds: ["breaker_small"], count: 6, at: 10, spacing: 1.1 },
      { kinds: ["raider"], count: 3, at: 20, spacing: 1.3 },
      { kinds: ["rock_metal_medium"], count: 4, at: 30, spacing: 1.4 },
      { kinds: ["breaker_medium"], count: 3, at: 40, spacing: 1.5 },
      { kinds: ["raider"], count: 3, at: 50, spacing: 1.3 },
    ],
  },
  {
    stage: 22, tier: 5, sector: 3, composition: rot(22), isBoss: false,
    budget: 172, targetSeconds: [46, 60],
    waves: [
      { kinds: ["rock_ice_small"], count: 10, at: 0, spacing: 0.7 },
      { kinds: ["rock_explosive_small"], count: 8, at: 10, spacing: 0.8 },
      { kinds: ["rock_ice_medium"], count: 6, at: 22, spacing: 1.1 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 34, spacing: 1.5 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"],
        count: 20, at: 46, spacing: 0.28, burst: true,
      },
    ],
  },
  {
    stage: 23, tier: 5, sector: 3, composition: rot(23), isBoss: false,
    budget: 178, targetSeconds: [46, 60],
    waves: [
      { kinds: ["rock_normal_small"], count: 12, at: 0, spacing: 0.7 },
      { kinds: ["rock_normal_medium"], count: 7, at: 10, spacing: 1.0 },
      { kinds: ["rock_normal_large"], count: 3, at: 22, spacing: 2.0 },
      { kinds: ["rock_normal_small"], count: 14, at: 34, spacing: 0.55 },
      { kinds: ["rock_normal_medium"], count: 8, at: 45, spacing: 0.9 },
      { kinds: ["rock_normal_large"], count: 4, at: 55, spacing: 1.7 },
    ],
  },
  {
    stage: 24, tier: 6, sector: 3, composition: rot(24), isBoss: false,
    budget: 184, targetSeconds: [46, 60],
    waves: [
      { kinds: ["raider"], count: 4, at: 0, spacing: 1.2 },
      { kinds: ["rock_metal_small"], count: 8, at: 12, spacing: 0.9 },
      { kinds: ["raider"], count: 3, at: 24, spacing: 1.3 },
      { kinds: ["rock_metal_medium"], count: 5, at: 34, spacing: 1.3 },
      { kinds: ["raider"], count: 4, at: 46, spacing: 1.0 },
    ],
  },
  {
    stage: 25, tier: 6, sector: 3, composition: rot(25), isBoss: false,
    budget: 190, targetSeconds: [46, 60],
    waves: [
      { kinds: ["breaker_small"], count: 7, at: 0, spacing: 1.1 },
      { kinds: ["breaker_medium"], count: 4, at: 12, spacing: 1.4 },
      { kinds: ["breaker_small"], count: 8, at: 24, spacing: 0.9 },
      { kinds: ["breaker_medium"], count: 4, at: 36, spacing: 1.3 },
      { kinds: ["breaker_large"], count: 2, at: 48, spacing: 2.4 },
    ],
  },
  {
    stage: 26, tier: 6, sector: 3, composition: rot(26), isBoss: false,
    budget: 196, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_ice_small"], count: 10, at: 0, spacing: 0.7 },
      { kinds: ["breaker_small"], count: 6, at: 10, spacing: 1.1 },
      { kinds: ["raider"], count: 3, at: 20, spacing: 1.3 },
      { kinds: ["rock_normal_large"], count: 2, at: 30, spacing: 2.2 },
      { kinds: ["breaker_medium"], count: 4, at: 40, spacing: 1.4 },
      { kinds: ["raider"], count: 4, at: 50, spacing: 1.1 },
    ],
  },
  {
    stage: 27, tier: 6, sector: 3, composition: rot(27), isBoss: false,
    budget: 202, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 5, at: 0, spacing: 1.4 },
      { kinds: ["breaker_medium"], count: 4, at: 12, spacing: 1.4 },
      { kinds: ["raider"], count: 4, at: 24, spacing: 1.2 },
      { kinds: ["rock_normal_large"], count: 3, at: 34, spacing: 2.0 },
      { kinds: ["rock_metal_large"], count: 2, at: 44, spacing: 2.6 },
      { kinds: ["breaker_large"], count: 2, at: 54, spacing: 2.4 },
    ],
  },
  {
    stage: 28, tier: 7, sector: 3, composition: rot(28), isBoss: false,
    budget: 208, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_ice_medium"], count: 6, at: 0, spacing: 1.0 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 12, spacing: 1.4 },
      { kinds: ["rock_ice_small"], count: 12, at: 24, spacing: 0.6 },
      { kinds: ["rock_explosive_small"], count: 10, at: 34, spacing: 0.7 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"],
        count: 22, at: 46, spacing: 0.25, burst: true,
      },
    ],
  },
  {
    stage: 29, tier: 7, sector: 3, composition: rot(29), isBoss: false,
    budget: 214, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_normal_small"], count: 14, at: 0, spacing: 0.6 },
      { kinds: ["rock_normal_medium"], count: 8, at: 10, spacing: 0.9 },
      { kinds: ["rock_normal_large"], count: 4, at: 22, spacing: 1.8 },
      { kinds: ["rock_normal_small"], count: 16, at: 34, spacing: 0.5 },
      { kinds: ["rock_normal_medium"], count: 9, at: 45, spacing: 0.85 },
      { kinds: ["rock_normal_large"], count: 4, at: 55, spacing: 1.6 },
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
      { kinds: ["breaker_small"], count: 8, at: 0, spacing: 1.0 },
      { kinds: ["breaker_medium"], count: 4, at: 12, spacing: 1.3 },
      { kinds: ["breaker_small"], count: 9, at: 24, spacing: 0.85 },
      { kinds: ["breaker_medium"], count: 5, at: 36, spacing: 1.2 },
      { kinds: ["breaker_large"], count: 3, at: 48, spacing: 2.2 },
    ],
  },
  {
    stage: 32, tier: 8, sector: 4, composition: rot(32), isBoss: false,
    budget: 232, targetSeconds: [48, 60],
    waves: [
      { kinds: ["rock_metal_small"], count: 10, at: 0, spacing: 0.7 },
      { kinds: ["breaker_small"], count: 7, at: 10, spacing: 1.0 },
      { kinds: ["raider"], count: 4, at: 20, spacing: 1.2 },
      { kinds: ["rock_normal_large"], count: 3, at: 30, spacing: 1.9 },
      { kinds: ["breaker_medium"], count: 4, at: 40, spacing: 1.3 },
      { kinds: ["raider"], count: 4, at: 50, spacing: 1.1 },
    ],
  },
  {
    stage: 33, tier: 8, sector: 4, composition: rot(33), isBoss: false,
    budget: 238, targetSeconds: [50, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 6, at: 0, spacing: 1.3 },
      { kinds: ["breaker_medium"], count: 5, at: 12, spacing: 1.3 },
      { kinds: ["raider"], count: 5, at: 24, spacing: 1.1 },
      { kinds: ["rock_metal_large"], count: 3, at: 34, spacing: 2.2 },
      { kinds: ["breaker_large"], count: 2, at: 44, spacing: 2.2 },
      { kinds: ["rock_explosive_medium"], count: 4, at: 54, spacing: 1.3 },
    ],
  },
  {
    stage: 34, tier: 8, sector: 4, composition: rot(34), isBoss: false,
    budget: 244, targetSeconds: [50, 60],
    waves: [
      { kinds: ["rock_ice_small"], count: 12, at: 0, spacing: 0.6 },
      { kinds: ["rock_explosive_small"], count: 10, at: 10, spacing: 0.7 },
      { kinds: ["rock_ice_medium"], count: 7, at: 22, spacing: 1.0 },
      { kinds: ["rock_explosive_medium"], count: 5, at: 34, spacing: 1.3 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"],
        count: 24, at: 46, spacing: 0.24, burst: true,
      },
    ],
  },
  {
    stage: 35, tier: 8, sector: 4, composition: rot(35), isBoss: false,
    budget: 250, targetSeconds: [50, 60],
    waves: [
      { kinds: ["rock_normal_small"], count: 15, at: 0, spacing: 0.6 },
      { kinds: ["rock_normal_medium"], count: 9, at: 10, spacing: 0.85 },
      { kinds: ["rock_normal_large"], count: 4, at: 22, spacing: 1.7 },
      { kinds: ["rock_normal_small"], count: 17, at: 34, spacing: 0.5 },
      { kinds: ["rock_normal_medium"], count: 10, at: 45, spacing: 0.8 },
      { kinds: ["rock_normal_large"], count: 5, at: 55, spacing: 1.5 },
    ],
  },
  {
    stage: 36, tier: 9, sector: 4, composition: rot(36), isBoss: false,
    budget: 256, targetSeconds: [50, 60],
    waves: [
      { kinds: ["raider"], count: 5, at: 0, spacing: 1.1 },
      { kinds: ["rock_metal_small"], count: 10, at: 12, spacing: 0.8 },
      { kinds: ["raider"], count: 4, at: 24, spacing: 1.2 },
      { kinds: ["rock_metal_medium"], count: 6, at: 34, spacing: 1.2 },
      { kinds: ["raider"], count: 5, at: 46, spacing: 0.95 },
    ],
  },
  {
    stage: 37, tier: 9, sector: 4, composition: rot(37), isBoss: false,
    budget: 262, targetSeconds: [50, 60],
    waves: [
      { kinds: ["breaker_small"], count: 9, at: 0, spacing: 0.95 },
      { kinds: ["breaker_medium"], count: 5, at: 12, spacing: 1.2 },
      { kinds: ["breaker_small"], count: 10, at: 24, spacing: 0.8 },
      { kinds: ["breaker_medium"], count: 5, at: 36, spacing: 1.15 },
      { kinds: ["breaker_large"], count: 3, at: 48, spacing: 2.1 },
    ],
  },
  {
    stage: 38, tier: 9, sector: 4, composition: rot(38), isBoss: false,
    budget: 268, targetSeconds: [52, 60],
    waves: [
      { kinds: ["rock_ice_medium"], count: 6, at: 0, spacing: 1.1 },
      { kinds: ["breaker_medium"], count: 5, at: 10, spacing: 1.2 },
      { kinds: ["raider"], count: 5, at: 20, spacing: 1.1 },
      { kinds: ["rock_normal_large"], count: 3, at: 30, spacing: 1.9 },
      { kinds: ["breaker_large"], count: 2, at: 40, spacing: 2.2 },
      { kinds: ["raider"], count: 5, at: 50, spacing: 1.0 },
    ],
  },
  {
    stage: 39, tier: 9, sector: 4, composition: rot(39), isBoss: false,
    budget: 274, targetSeconds: [52, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 7, at: 0, spacing: 1.2 },
      { kinds: ["breaker_medium"], count: 6, at: 12, spacing: 1.2 },
      { kinds: ["raider"], count: 6, at: 24, spacing: 1.0 },
      { kinds: ["rock_metal_large"], count: 4, at: 34, spacing: 2.0 },
      { kinds: ["rock_explosive_medium"], count: 5, at: 44, spacing: 1.2 },
      { kinds: ["breaker_large"], count: 3, at: 54, spacing: 2.0 },
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
      { kinds: ["rock_normal_small"], count: 17, at: 0, spacing: 0.55 },
      { kinds: ["rock_normal_medium"], count: 10, at: 10, spacing: 0.8 },
      { kinds: ["rock_normal_large"], count: 5, at: 22, spacing: 1.6 },
      { kinds: ["rock_normal_small"], count: 19, at: 34, spacing: 0.45 },
      { kinds: ["rock_normal_medium"], count: 11, at: 45, spacing: 0.75 },
      { kinds: ["rock_normal_large"], count: 6, at: 55, spacing: 1.4 },
    ],
  },
  {
    stage: 42, tier: 10, sector: 5, composition: rot(42), isBoss: false,
    budget: 292, targetSeconds: [52, 60],
    waves: [
      { kinds: ["raider"], count: 6, at: 0, spacing: 1.0 },
      { kinds: ["rock_metal_small"], count: 12, at: 12, spacing: 0.7 },
      { kinds: ["raider"], count: 5, at: 24, spacing: 1.1 },
      { kinds: ["rock_metal_medium"], count: 7, at: 34, spacing: 1.1 },
      { kinds: ["raider"], count: 6, at: 46, spacing: 0.9 },
    ],
  },
  {
    stage: 43, tier: 10, sector: 5, composition: rot(43), isBoss: false,
    budget: 298, targetSeconds: [52, 60],
    waves: [
      { kinds: ["breaker_small"], count: 10, at: 0, spacing: 0.9 },
      { kinds: ["breaker_medium"], count: 6, at: 12, spacing: 1.15 },
      { kinds: ["breaker_small"], count: 11, at: 24, spacing: 0.75 },
      { kinds: ["breaker_medium"], count: 6, at: 36, spacing: 1.1 },
      { kinds: ["breaker_large"], count: 4, at: 48, spacing: 2.0 },
    ],
  },
  {
    stage: 44, tier: 11, sector: 5, composition: rot(44), isBoss: false,
    budget: 304, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_metal_small"], count: 12, at: 0, spacing: 0.7 },
      { kinds: ["breaker_medium"], count: 6, at: 10, spacing: 1.15 },
      { kinds: ["raider"], count: 6, at: 20, spacing: 1.0 },
      { kinds: ["rock_metal_large"], count: 4, at: 30, spacing: 1.9 },
      { kinds: ["rock_explosive_medium"], count: 5, at: 40, spacing: 1.2 },
      { kinds: ["raider"], count: 6, at: 50, spacing: 0.9 },
    ],
  },
  {
    stage: 45, tier: 11, sector: 5, composition: rot(45), isBoss: false,
    budget: 310, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_metal_medium"], count: 8, at: 0, spacing: 1.1 },
      { kinds: ["breaker_medium"], count: 7, at: 12, spacing: 1.1 },
      { kinds: ["raider"], count: 7, at: 24, spacing: 0.95 },
      { kinds: ["rock_metal_large"], count: 5, at: 34, spacing: 1.9 },
      { kinds: ["breaker_large"], count: 3, at: 44, spacing: 2.0 },
      { kinds: ["rock_explosive_medium"], count: 6, at: 54, spacing: 1.1 },
    ],
  },
  {
    stage: 46, tier: 11, sector: 5, composition: rot(46), isBoss: false,
    budget: 316, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_ice_small"], count: 14, at: 0, spacing: 0.55 },
      { kinds: ["rock_explosive_small"], count: 12, at: 10, spacing: 0.65 },
      { kinds: ["rock_ice_medium"], count: 8, at: 22, spacing: 0.95 },
      { kinds: ["rock_explosive_medium"], count: 6, at: 34, spacing: 1.2 },
      {
        kinds: ["rock_ice_small", "rock_ice_medium", "rock_explosive_small", "rock_explosive_medium"],
        count: 28, at: 46, spacing: 0.22, burst: true,
      },
    ],
  },
  {
    stage: 47, tier: 11, sector: 5, composition: rot(47), isBoss: false,
    budget: 322, targetSeconds: [54, 60],
    waves: [
      { kinds: ["rock_normal_small"], count: 19, at: 0, spacing: 0.5 },
      { kinds: ["rock_normal_medium"], count: 11, at: 10, spacing: 0.75 },
      { kinds: ["rock_normal_large"], count: 6, at: 22, spacing: 1.5 },
      { kinds: ["rock_normal_small"], count: 21, at: 34, spacing: 0.42 },
      { kinds: ["rock_normal_medium"], count: 12, at: 45, spacing: 0.7 },
      { kinds: ["rock_normal_large"], count: 6, at: 55, spacing: 1.35 },
    ],
  },
  {
    stage: 48, tier: 12, sector: 5, composition: rot(48), isBoss: false,
    budget: 328, targetSeconds: [54, 60],
    waves: [
      { kinds: ["raider"], count: 7, at: 0, spacing: 0.95 },
      { kinds: ["rock_metal_small"], count: 14, at: 12, spacing: 0.65 },
      { kinds: ["raider"], count: 6, at: 24, spacing: 1.0 },
      { kinds: ["rock_metal_medium"], count: 8, at: 34, spacing: 1.0 },
      { kinds: ["raider"], count: 7, at: 46, spacing: 0.85 },
    ],
  },
  {
    stage: 49, tier: 12, sector: 5, composition: rot(49), isBoss: false,
    budget: 334, targetSeconds: [56, 60],
    waves: [
      { kinds: ["breaker_small"], count: 12, at: 0, spacing: 0.85 },
      { kinds: ["breaker_medium"], count: 7, at: 12, spacing: 1.1 },
      { kinds: ["breaker_small"], count: 13, at: 24, spacing: 0.7 },
      { kinds: ["breaker_medium"], count: 7, at: 36, spacing: 1.05 },
      { kinds: ["breaker_large"], count: 5, at: 48, spacing: 1.9 },
    ],
  },
  {
    stage: 50, tier: 12, sector: 5, composition: "elite", isBoss: true,
    bossId: "eclipse_sovereign",
    budget: 0, targetSeconds: [180, 300],
    waves: [],
  },
];

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