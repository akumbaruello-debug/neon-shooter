/**
 * All mutable game entities. Pure data + plain object pools — no rendering or
 * React imports, so the simulation can run headless (balance script, tests).
 *
 * `spr` is an opaque handle owned by the renderer; the simulation never reads
 * it. Typing it as `unknown` keeps this module free of a PixiJS import.
 * ponytail: one shared field instead of a sprite map — add a map only if we
 * ever need two display objects per entity.
 */
import { Pool } from "./core/pool";
import type {
  BossDef,
  EnemyKind,
  RockVariant,
  WeaponBehavior,
  WeaponId,
} from "./types";

export type Size3 = "small" | "medium" | "large";

export interface Bullet {
  active: boolean;
  owner: "player" | "enemy";
  weaponId: WeaponId | "enemy";
  behavior: WeaponBehavior;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  radius: number;
  damage: number;
  pierceLeft: number;
  knockback: number;
  lifetime: number;
  age: number;
  color: number;
  accent: number;
  shape: BulletShape;
  /** Homing steering strength (0 = straight). */
  homing: number;
  /** Target enemy index for homing, -1 if none. */
  targetIdx: number;
  /** Remaining edge bounces (ricochet). */
  bounceLeft: number;
  /** Boomerang state. */
  boomerang: boolean;
  returning: boolean;
  originX: number;
  originY: number;
  maxDist: number;
  /** Area-of-effect explosion radius on impact/death (0 = none). */
  aoe: number;
  crit: boolean;
  /** Chain lightning. */
  chainJumps: number;
  chainFalloff: number;
  /** Cuts enemy bullets (crescent slash). */
  cutsBullets: boolean;
  /** Trail hint for the renderer. */
  trail: number;
  spr?: unknown;
}

export type BulletShape =
  | "lance"
  | "bolt"
  | "disc"
  | "blade"
  | "orb"
  | "missile"
  | "diamond"
  | "beam"
  | "arc"
  | "enemy";

export type SmasherState = "idle" | "telegraph" | "charging" | "recover";

export interface Enemy {
  active: boolean;
  /** Stable id for homing/pierce bookkeeping. */
  uid: number;
  kind: EnemyKind;
  defId: string;
  name: string;
  size: Size3;
  variant: RockVariant | null;

  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Collision radius used for player damage (rocks hurt by size). */
  collisionRadius: number;

  hp: number;
  hpMax: number;
  damage: number;
  speed: number;
  score: number;
  xp: number;
  color: number;
  accent: number;

  age: number;
  graceLeft: number; // cannot hurt the player while > 0
  spawnFx: number; // 1 -> 0 spawn-in animation
  flash: number;

  // movement pattern
  pattern: "sine" | "orbit" | "v_entry" | "patrol" | "drift" | "ram";
  phase: number;
  timer: number;
  baseX: number;
  baseY: number;
  amp: number;
  freq: number;

  // shooter
  fireTimer: number;
  fireInterval: number;

  // smasher
  state: SmasherState;
  stateTimer: number;
  dirX: number;
  dirY: number;
  bounced: boolean;
  telegraphTime: number;
  queued: boolean;

  // explosive rock
  fuseExplosion: number;

  // boss
  isBoss: boolean;
  bossDef: BossDef | null;
  bossPhase: number;
  phaseTimer: number;
  patternIdx: number;
  patternTimer: number;
  patternState: number;
  invuln: boolean;
  nodes: number; // void carrier shield nodes remaining
  volley: number; // generic sub-count for patterns
  enrage: boolean;

  spr?: unknown;
}

export interface Pickup {
  active: boolean;
  kind: "xp" | "repair" | "shield";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  value: number;
  tier: 1 | 2 | 3;
  age: number;
  lifetime: number;
  magnetized: boolean;
  spr?: unknown;
}

export type ParticleKind = "spark" | "smoke" | "debris" | "ring" | "glow" | "trail";

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  color: number;
  alpha: number;
  drag: number;
  spin: number;
  angle: number;
  spr?: unknown;
}

export interface Telegraph {
  active: boolean;
  kind: "line" | "circle" | "fan";
  x: number;
  y: number;
  x2: number;
  y2: number;
  radius: number;
  width: number;
  timer: number;
  duration: number;
  color: number;
}

export interface DamageNumber {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  crit: boolean;
}

// ------------------------------------------------------------------ factories

let uidCounter = 1;

export const makeBullet = (): Bullet => ({
  active: false,
  owner: "player",
  weaponId: "focus_lance",
  behavior: "projectile",
  x: 0,
  y: 0,
  px: 0,
  py: 0,
  vx: 0,
  vy: 0,
  angle: 0,
  spin: 0,
  radius: 6,
  damage: 0,
  pierceLeft: 0,
  knockback: 0,
  lifetime: 1,
  age: 0,
  color: 0xffffff,
  accent: 0xffffff,
  shape: "bolt",
  homing: 0,
  targetIdx: -1,
  bounceLeft: 0,
  boomerang: false,
  returning: false,
  originX: 0,
  originY: 0,
  maxDist: 0,
  aoe: 0,
  crit: false,
  chainJumps: 0,
  chainFalloff: 1,
  cutsBullets: false,
  trail: 0,
});

export const makeEnemy = (): Enemy => ({
  active: false,
  uid: uidCounter++,
  kind: "rock",
  defId: "",
  name: "",
  size: "small",
  variant: null,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 20,
  collisionRadius: 20,
  hp: 1,
  hpMax: 1,
  damage: 8,
  speed: 40,
  score: 10,
  xp: 5,
  color: 0xffffff,
  accent: 0xffffff,
  age: 0,
  graceLeft: 0,
  spawnFx: 0,
  flash: 0,
  pattern: "drift",
  phase: 0,
  timer: 0,
  baseX: 0,
  baseY: 0,
  amp: 0,
  freq: 1,
  fireTimer: 0,
  fireInterval: 2,
  state: "idle",
  stateTimer: 0,
  dirX: 0,
  dirY: 1,
  bounced: false,
  telegraphTime: 1,
  queued: false,
  fuseExplosion: 0,
  isBoss: false,
  bossDef: null,
  bossPhase: 1,
  phaseTimer: 0,
  patternIdx: 0,
  patternTimer: 0,
  patternState: 0,
  invuln: false,
  nodes: 0,
  volley: 0,
  enrage: false,
});

export const makePickup = (): Pickup => ({
  active: false,
  kind: "xp",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 10,
  value: 1,
  tier: 1,
  age: 0,
  lifetime: 30,
  magnetized: false,
});

export const makeParticle = (): Particle => ({
  active: false,
  kind: "spark",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 1,
  size: 3,
  sizeEnd: 0,
  color: 0xffffff,
  alpha: 1,
  drag: 0,
  spin: 0,
  angle: 0,
});

export const makeTelegraph = (): Telegraph => ({
  active: false,
  kind: "line",
  x: 0,
  y: 0,
  x2: 0,
  y2: 0,
  radius: 0,
  width: 8,
  timer: 0,
  duration: 1,
  color: 0xff2a2a,
});

export const makeDamageNumber = (): DamageNumber => ({
  active: false,
  x: 0,
  y: 0,
  vy: -60,
  life: 0,
  maxLife: 0.9,
  text: "",
  crit: false,
});

export const pools = {
  bullets: new Pool<Bullet>(makeBullet, 512),
  enemyBullets: new Pool<Bullet>(makeBullet, 256),
  enemies: new Pool<Enemy>(makeEnemy, 200),
  pickups: new Pool<Pickup>(makePickup, 200),
  particles: new Pool<Particle>(makeParticle, 800),
  telegraphs: new Pool<Telegraph>(makeTelegraph, 32),
  damageNumbers: new Pool<DamageNumber>(makeDamageNumber, 64),
};

export function resetPools(): void {
  pools.bullets.clear();
  pools.enemyBullets.clear();
  pools.enemies.clear();
  pools.pickups.clear();
  pools.particles.clear();
  pools.telegraphs.clear();
  pools.damageNumbers.clear();
}
