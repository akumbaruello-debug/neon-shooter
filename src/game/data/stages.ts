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