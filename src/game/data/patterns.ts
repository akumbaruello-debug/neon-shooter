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

/**
 * Expand a base direction set by `extra` more projectiles.
 * - Single-shot base: splay over a small arc centred on the base angle.
 * - Multi/ring base: evenly resample the span (rings wrap the full circle).
 * Capped at MAX_VOLLEY.
 */
export function expandAngles(base: number[], extra: number): number[] {
  const n = Math.max(1, Math.min(MAX_VOLLEY, base.length + Math.max(0, Math.floor(extra))));
  const center = base[0] ?? 0;
  if (base.length <= 1) {
    if (n <= 1) return [center];
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(center + (i / (n - 1) - 0.5) * SINGLE_SPAN);
    return out;
  }
  const min = Math.min(...base);
  const max = Math.max(...base);
  const span = max - min;
  const ring = span > Math.PI * 1.5;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(ring ? min + (i / n) * TAU : min + (i / (n - 1)) * span);
  }
  return out;
}

export function getPattern(id: AttackPatternId): AttackPatternDef {
  return ATTACK_PATTERNS[id];
}
