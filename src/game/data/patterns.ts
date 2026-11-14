/**
 * Attack patterns (5). A pattern is a named multi-shot geometry: the offsets
 * (radians, relative to aim) a volley fires along.
 *
 * `forward` is special: the weapon system uses the weapon's OWN `count`/`spread`
 * so each gun keeps its identity (a shotgun stays a shotgun). Every other
 * pattern overrides the geometry with the offsets here.
 *
 * Milestone bullets (`Mods.bulletCount`) widen/densify the volley via
 * `expandAngles`, capped at `MAX_VOLLEY`.
 */
import type { AttackPatternId } from "../types";

const TAU = Math.PI * 2;

export interface AttackPatternDef {
  id: AttackPatternId;
  name: string;
  desc: string;
  color: number;
  /** Relative aim offsets fired per volley (unused for `forward`). */
  angles: number[];
}

export const ATTACK_PATTERNS: Record<AttackPatternId, AttackPatternDef> = {
  forward: {
    id: "forward",
    name: "Forward",
    desc: "The weapon's own native volley. Single stream for most guns.",
    color: 0x8fa4c0,
    angles: [0],
  },
  twin: {
    id: "twin",
    name: "Twin",
    desc: "Two shots up front, slightly splayed.",
    color: 0x5ad1ff,
    angles: [-0.06, 0.06],
  },
  fan: {
    id: "fan",
    name: "Fan",
    desc: "Wide forward fan — bullets +4.",
    color: 0xffd166,
    angles: [-0.42, -0.21, 0, 0.21, 0.42],
  },
  fore_aft: {
    id: "fore_aft",
    name: "Fore-Aft",
    desc: "One shot forward, one straight back.",
    color: 0xff7ad1,
    angles: [0, Math.PI],
  },
  radiant: {
    id: "radiant",
    name: "Radiant",
    desc: "Even 360° ring — bullets up to 7.",
    color: 0xc45aff,
    angles: Array.from({ length: 7 }, (_, i) => (i * TAU) / 7),
  },
};

export const PATTERN_LIST: AttackPatternDef[] = Object.values(ATTACK_PATTERNS);

/** Default pattern every run starts on. */
export const DEFAULT_PATTERN: AttackPatternId = "forward";

/** Hard cap on projectiles per volley so milestones + patterns cannot explode. */
export const MAX_VOLLEY = 16;

/** How far a single-shot weapon splays when milestone bullets are added. */
const SINGLE_SPAN = 0.5;

const norm = (a: number): number => {
  const x = a % TAU;
  return x < 0 ? x + TAU : x;
};

/** Angle difference a→b in [0, TAU). */
const gapBetween = (a: number, b: number): number => (((b - a) % TAU) + TAU) % TAU;

/**
 * Normalise + sort the offsets, then rotate so the widest gap becomes the cut
 * (last) gap. Fans have negative and positive offsets, so the raw wrap point is
 * arbitrary; after this the sequence is a monotone sweep of the base's real gaps.
 */
function cutAtLargestGap(base: number[]): { angles: number[]; gaps: number[] } {
  const a = base.map(norm).sort((x, y) => x - y);
  const n = a.length;
  const at = (i: number): number => a[i] ?? 0;
  let cut = 0;
  let cutSize = -1;
  for (let i = 0; i < n; i++) {
    const g = gapBetween(at(i), at((i + 1) % n));
    if (g > cutSize) {
      cutSize = g;
      cut = i;
    }
  }
  const startIdx = (cut + 1) % n;
  const angles = Array.from({ length: n }, (_, i) => at((startIdx + i) % n));
  const gaps = Array.from({ length: n }, (_, i) => gapBetween(angles[i] ?? 0, angles[(i + 1) % n] ?? 0));
  return { angles, gaps };
}

/** Offsets evenly spaced across the span (the cut gap is ignored). */
function isUniform(base: number[]): boolean {
  const { gaps } = cutAtLargestGap(base);
  const first = gaps[0] ?? 0;
  return gaps.slice(0, -1).every((g) => Math.abs(g - first) < 1e-6);
}

/**
 * Keep every original offset and split the widest gaps until `target` is met.
 * Used for non-uniform geometry (Crossfire's four fixed barrels) so a milestone
 * can only ever ADD barrels, never replace them.
 */
function fillGaps(base: number[], target: number): number[] {
  const { angles, gaps } = cutAtLargestGap(base);
  const spans = gaps.length - 1; // the cut gap is never filled
  const add = new Array<number>(spans).fill(0);
  for (let k = angles.length; k < target; k++) {
    let best = 0;
    for (let i = 1; i < spans; i++) {
      if ((gaps[i] ?? 0) / ((add[i] ?? 0) + 1) > (gaps[best] ?? 0) / ((add[best] ?? 0) + 1)) best = i;
    }
    add[best] = (add[best] ?? 0) + 1;
  }

  const out: number[] = [];
  for (let i = 0; i < spans; i++) {
    const parts = (add[i] ?? 0) + 1;
    for (let j = 0; j < parts; j++) {
      out.push(norm((angles[i] ?? 0) + ((gaps[i] ?? 0) * j) / parts));
    }
  }
  out.push(norm(angles[angles.length - 1] ?? 0)); // the far end of the cut
  return out;
}

/**
 * Expand a base direction set by `extra` more projectiles.
 * - `extra <= 0` returns the base untouched (identity — tier 0 must not
 *   reshape a weapon's native volley).
 * - Single-shot base: splay over a small arc centred on the base angle.
 * - Uniform base (fan/ring): evenly resample the span (rings wrap).
 * - Non-uniform base: keep the originals, fill the widest gaps.
 * Capped at MAX_VOLLEY.
 */
export function expandAngles(base: number[], extra: number): number[] {
  const target = Math.max(1, Math.min(MAX_VOLLEY, base.length + Math.max(0, Math.floor(extra))));
  if (target === base.length) return base.slice();
  const center = base[0] ?? 0;
  if (base.length <= 1) {
    const out: number[] = [];
    for (let i = 0; i < target; i++) out.push(center + (i / (target - 1) - 0.5) * SINGLE_SPAN);
    return out;
  }
  if (!isUniform(base)) return fillGaps(base, target);
  const min = Math.min(...base);
  const max = Math.max(...base);
  const span = max - min;
  const ring = span > Math.PI * 1.5;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    out.push(ring ? min + (i / target) * TAU : min + (i / (target - 1)) * span);
  }
  return out;
}

export function getPattern(id: AttackPatternId): AttackPatternDef {
  return ATTACK_PATTERNS[id];
}
