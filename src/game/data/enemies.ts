/**
 * Enemy definitions (tier-0 baseline). Systems apply tier scaling later.
 * Rock family: normal = baseline; ice = fragile+fast; metal = plated, big XP;
 * explosive = detonates on death. Large splits into 2 medium, medium into 2 small.
 */

import type { EnemyDef, RockVariant } from "../types";

type Size = "small" | "medium" | "large";

const SIZES: Size[] = ["small", "medium", "large"];

// --- rocks -------------------------------------------------------------

const ROCK_BASE: Record<Size, Omit<EnemyDef, "id" | "kind" | "name" | "color" | "accent">> = {
  small: { hp: 14, damage: 8, radius: 26, speed: 40, score: 10, xp: 6 },
  medium: { hp: 34, damage: 12, radius: 44, speed: 32, score: 22, xp: 14 },
  large: { hp: 80, damage: 18, radius: 70, speed: 24, score: 45, xp: 30 },
};

const ROCK_MOD: Record<RockVariant, { hp: number; speed: number; score: number; xp: number }> = {
  normal: { hp: 1.0, speed: 1.0, score: 1.0, xp: 1.0 },
  ice: { hp: 0.6, speed: 1.7, score: 1.0, xp: 1.0 },
  metal: { hp: 3.0, speed: 0.7, score: 2.2, xp: 2.2 },
  explosive: { hp: 0.9, speed: 1.0, score: 1.0, xp: 1.0 },
};

const ROCK_LABEL: Record<RockVariant, string> = {
  normal: "Rock",
  ice: "Ice Rock",
  metal: "Metal Rock",
  explosive: "Explosive Rock",
};

const ROCK_COLORS: Record<RockVariant, [number, number]> = {
  normal: [0x8a8f98, 0x5a5f68],
  ice: [0xbfefff, 0x7fd0ff],
  metal: [0x9fb2c4, 0x6f8296],
  explosive: [0xff5a3c, 0xffd166], // explodes on death: radius 140, damage 22
};

const ROCK_SPLIT: Record<Size, string> = {
  small: "",
  medium: " (splits into 2 small)",
  large: " (splits into 2 medium)",
};

function rock(variant: RockVariant, size: Size): EnemyDef {
  const b = ROCK_BASE[size];
  const m = ROCK_MOD[variant];
  const [color, accent] = ROCK_COLORS[variant];
  const cap = size.charAt(0).toUpperCase() + size.slice(1);
  return {
    id: `rock_${variant}_${size}`,
    kind: "rock",
    name: `${cap} ${ROCK_LABEL[variant]}${ROCK_SPLIT[size]}`,
    hp: Math.round(b.hp * m.hp),
    // explosive rocks carry their blast damage; others chip on contact
    damage: variant === "explosive" ? 22 : b.damage,
    radius: b.radius,
    speed: Math.round(b.speed * m.speed),
    score: Math.round(b.score * m.score),
    xp: Math.round(b.xp * m.xp),
    color,
    accent,
  };
}

export const ROCKS: Record<RockVariant, Record<Size, EnemyDef>> = {
  normal: { small: rock("normal", "small"), medium: rock("normal", "medium"), large: rock("normal", "large") },
  ice: { small: rock("ice", "small"), medium: rock("ice", "medium"), large: rock("ice", "large") },
  metal: { small: rock("metal", "small"), medium: rock("metal", "medium"), large: rock("metal", "large") },
  explosive: {
    small: rock("explosive", "small"),
    medium: rock("explosive", "medium"),
    large: rock("explosive", "large"),
  },
};

// --- raider ------------------------------------------------------------

export const SHOOTER: EnemyDef = {
  id: "raider",
  kind: "shooter",
  name: "Raider",
  hp: 40,
  damage: 12,
  radius: 26,
  speed: 190,
  score: 60,
  xp: 26,
  color: 0xff4433,
  accent: 0xff9f5a,
};

// --- smashers ----------------------------------------------------------

export const SMASHERS: Record<Size, EnemyDef> = {
  small: {
    id: "breaker_small",
    kind: "smasher",
    name: "Small Breaker",
    hp: 22,
    damage: 14,
    radius: 20,
    speed: 520,
    score: 40,
    xp: 18,
    color: 0x4a4256,
    accent: 0xff2ea6,
  },
  medium: {
    id: "breaker_medium",
    kind: "smasher",
    name: "Medium Breaker",
    hp: 55,
    damage: 22,
    radius: 32,
    speed: 430,
    score: 70,
    xp: 30,
    color: 0x4a4256,
    accent: 0xff2ea6,
  },
  large: {
    id: "breaker_large",
    kind: "smasher",
    name: "Large Breaker",
    hp: 120,
    damage: 32,
    radius: 48,
    speed: 330,
    score: 130,
    xp: 55,
    color: 0x4a4256,
    accent: 0xff2ea6,
  },
};

// --- indexes -----------------------------------------------------------

export const ALL_ENEMY_IDS: string[] = [
  ...(["normal", "ice", "metal", "explosive"] as RockVariant[]).flatMap((v) =>
    SIZES.map((s) => ROCKS[v][s].id),
  ),
  SHOOTER.id,
  ...SIZES.map((s) => SMASHERS[s].id),
];

export const ENEMY_INDEX: Record<string, EnemyDef> = Object.fromEntries(
  [
    ...(["normal", "ice", "metal", "explosive"] as RockVariant[]).flatMap((v) =>
      SIZES.map((s) => ROCKS[v][s]),
    ),
    SHOOTER,
    ...SIZES.map((s) => SMASHERS[s]),
  ].map((e) => [e.id, e]),
);
