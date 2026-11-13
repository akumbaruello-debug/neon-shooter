/**
 * XP curve and stage pacing helpers.
 *
 * Level 0 -> 1 costs only 10 XP, so the first fight levies instantly.
 * The curve is tuned so the player levels roughly once per stage and
 * finishes around level 40-45 after stage 50.
 */

/** XP required to go from level L to L+1. */
export function xpToNext(level: number): number {
  const l = Math.max(0, Math.floor(level));
  return Math.round(10 + 6 * l + 0.9 * Math.pow(l, 1.6));
}

/** Total XP required to reach a level from 0 (level 0 = 0 XP). */
export function totalXpToLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < Math.max(0, Math.floor(level)); l++) total += xpToNext(l);
  return total;
}

// Stage payout: rises from ~62 XP at stage 1 to ~380 at stage 50,
// summing to ~ level 41 worth of XP by the final stage.
const STAGE_XP_BASE = 55;
const STAGE_XP_GROWTH = 6.5;

/** Approximate XP a single stage awards (grows with depth). */
export function xpForStage(stage: number): number {
  const s = Math.max(1, Math.floor(stage));
  return Math.round(STAGE_XP_BASE + STAGE_XP_GROWTH * s);
}

/** Expected player level after clearing `stage` (0..45 curve, ~tracks 1 level/stage). */
export function expectedLevelAtStage(stage: number): number {
  let cum = 0;
  for (let i = 1; i <= Math.max(0, Math.floor(stage)); i++) cum += xpForStage(i);
  let level = 0;
  let need = xpToNext(0);
  while (cum >= need) {
    cum -= need;
    level++;
    need = xpToNext(level);
  }
  return level;
}
