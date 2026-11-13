/**
 * The single object every system receives. It is the ONLY way systems talk to
 * each other, which keeps them independently testable and replaceable.
 */
import type { AudioEngine, SfxName } from "./audio";
import type { Rng } from "./core/rng";
import type { Enemy, ParticleKind } from "./entities";
import type { Player } from "./player";
import type { Settings } from "./types";

export interface RunStats {
  kills: number;
  rocksKilled: number;
  damageDealt: number;
  damageTaken: number;
  xpCollected: number;
  score: number;
  shotsFired: number;
  hits: number;
}

export function newRunStats(): RunStats {
  return {
    kills: 0,
    rocksKilled: 0,
    damageDealt: 0,
    damageTaken: 0,
    xpCollected: 0,
    score: 0,
    shotsFired: 0,
    hits: 0,
  };
}

export interface ParticleOpts {
  count?: number;
  speed?: number;
  speedEnd?: number;
  size?: number;
  sizeEnd?: number;
  life?: number;
  kind?: ParticleKind;
  spread?: number;
  angle?: number;
  drag?: number;
  alpha?: number;
}

export interface CtxBulletOpts {
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  damage: number;
  color: number;
  accent?: number;
  lifetime: number;
  homing?: number;
  wave?: number; // cosmetic sine wobble seed
}

export interface GameCtx {
  readonly rng: Rng;
  settings: Settings;
  readonly player: Player;
  readonly audio: AudioEngine;
  stats: RunStats;

  stage: number;
  tier: number;
  runTime: number;
  /** Name of whatever dealt the most recent hit, shown on the Game Over screen. */
  lastHitSource: string;

  // --- feedback helpers -----------------------------------------------------
  burst(x: number, y: number, color: number, count: number, opts?: ParticleOpts): void;
  particle(x: number, y: number, vx: number, vy: number, life: number, color: number, size: number, kind?: ParticleKind): void;
  shake(amount: number): void;
  hitstop(seconds: number): void;
  sfx(name: SfxName, opts?: { pan?: number; pitch?: number; volume?: number }): void;
  /** Pitch/pan a sound from a world position. */
  sfxAt(name: SfxName, x: number, y: number, opts?: { pitch?: number; volume?: number }): void;

  // --- economy --------------------------------------------------------------
  damagePlayer(amount: number, source: string): void;
  addScore(n: number): void;
  addXp(n: number, x: number, y: number): void;
  spawnXp(x: number, y: number, value: number): void;
  damageNumber(x: number, y: number, text: string, crit: boolean): void;
  toast(text: string, color?: number): void;

  /** True while cards / armory / pause screens are open. */
  readonly isFrozen: boolean;
  /** Area-of-effect damage to every enemy inside a circle. */
  aoeDamage(x: number, y: number, radius: number, damage: number, color: number): void;
  /** Called by enemies when a boss finishes its intro. */
  spawnEnemyBullet(o: CtxBulletOpts): void;
  enemies(): readonly Enemy[];
  /** Seconds of slow-motion left to apply (level-up / boss death). */
  slowmo(seconds: number, factor: number): void;
}
