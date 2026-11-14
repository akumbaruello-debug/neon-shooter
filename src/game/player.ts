/**
 * The player ship "Aegis". Owns hull/shield, movement, dash and the derived
 * modifier block that skills/boons write into.
 */
import {
  ARENA_H,
  ARENA_W,
  DASH_COOLDOWN,
  DASH_IFRAMES,
  DASH_SPEED,
  DASH_TIME,
  HITBOX_SCALE,
  INVULN_TIME,
  MAX_ENEMY_HIT_FRACTION,
  PLAYER_ACCEL,
  PLAYER_FRICTION,
  PLAYER_HULL,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  PLAYER_SHIELD,
  PLAYER_TURN_RATE,
  SHIELD_RECHARGE_DELAY,
  SHIELD_RECHARGE_RATE,
} from "./data/constants";
import { angleToward, clamp, damp } from "./core/math";

/** Everything skills and boons contribute. Recomputed when the build changes. */
export interface Mods {
  maxHullFlat: number;
  damagePct: number;
  fireRatePct: number;
  critChance: number;
  critDamage: number;
  pierceFlat: number;
  moveSpeedPct: number;
  pickupRadiusPct: number;
  xpPct: number;
  shieldFlat: number;
  shieldRechargePct: number;
  thornsDamage: number;
  drones: number;
  damageReduction: number;
  lifesteal: number;
  novaOnLevelup: boolean;
  revive: boolean;
  barrierReflect: boolean;
  /** Weapon milestone (every 10 levels): extra projectiles per volley. */
  bulletCount: number;
  /** Weapon milestone: projectile radius, percent. */
  bulletSizePct: number;
  /** Weapon milestone: projectile speed, percent (large). */
  bulletSpeedPct: number;
}

export function baseMods(): Mods {
  return {
    maxHullFlat: 0,
    damagePct: 0,
    fireRatePct: 0,
    critChance: 0.02,
    critDamage: 1.5,
    pierceFlat: 0,
    moveSpeedPct: 0,
    pickupRadiusPct: 0,
    xpPct: 0,
    shieldFlat: 0,
    shieldRechargePct: 0,
    thornsDamage: 0,
    drones: 0,
    damageReduction: 0,
    lifesteal: 0,
    novaOnLevelup: false,
    revive: false,
    barrierReflect: false,
    bulletCount: 0,
    bulletSizePct: 0,
    bulletSpeedPct: 0,
  };
}

/**
 * Player-ship visual half-extents in sprite source pixels, read off the
 * "Aegis" art in render/sprites.ts (drawAegis): the nose vertex is at y = -46,
 * the engine nozzles reach y = +41, and the swept wingtips reach x = ±43 (so
 * the wingtip, not the ±11 fuselage, is the widest point).
 * renderer.ts registers the ship texture with ref = 42 and scales it by
 * shipScale = PLAYER_RADIUS / 42, so 1 source px = PLAYER_RADIUS / 42 arena px:
 *   half width  = 43 * PLAYER_RADIUS / 42  (~26.6 arena px at PLAYER_RADIUS 26)
 *   half length = 46 * PLAYER_RADIUS / 42  (~28.5) — nose dominates tail (41).
 */
const SHIP_SRC_HALF_W = 43;
const SHIP_SRC_HALF_FWD = 46;
const SHIP_SRC_REF = 42;

export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = -Math.PI / 2;
  radius = PLAYER_RADIUS;
  hull = PLAYER_HULL;
  hullMax = PLAYER_HULL;
  shield = PLAYER_SHIELD;
  shieldMax = PLAYER_SHIELD;
  alive = true;
  invuln = false;
  invulnTimer = 0;
  shieldDelay = 0;
  shieldFlicker = 0;
  dashCooldown = 0;
  dashTimer = 0;
  dashing = false;
  dashIframe = 0;
  mods: Mods = baseMods();
  /** Seconds left of the slow-mo grace after respawn/revive. */
  revivedFlash = 0;

  get hitRadius(): number {
    return this.radius * HITBOX_SCALE;
  }

  get lowHull(): boolean {
    return this.hull / Math.max(1, this.hullMax) < 0.3;
  }

  reset(): void {
    this.x = ARENA_W / 2;
    this.y = ARENA_H * 0.78;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.hullMax = PLAYER_HULL + this.mods.maxHullFlat;
    this.hull = this.hullMax;
    this.shieldMax = PLAYER_SHIELD + this.mods.shieldFlat;
    this.shield = this.shieldMax;
    this.alive = true;
    this.invuln = true;
    this.invulnTimer = 1.5;
    this.shieldDelay = 0;
    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashing = false;
  }

  /** Recompute caps after the build changes, keeping the current ratio. */
  refreshCaps(): void {
    const hullRatio = this.hullMax > 0 ? this.hull / this.hullMax : 1;
    const shieldRatio = this.shieldMax > 0 ? this.shield / this.shieldMax : 1;
    const newHullMax = PLAYER_HULL + this.mods.maxHullFlat;
    const newShieldMax = PLAYER_SHIELD + this.mods.shieldFlat;
    const dHull = newHullMax - this.hullMax;
    const dShield = newShieldMax - this.shieldMax;
    this.hullMax = newHullMax;
    this.shieldMax = newShieldMax;
    // Hull upgrades heal by their value; shield upgrades top up the shield.
    this.hull = clamp(this.hull + Math.max(0, dHull), 0, newHullMax);
    this.shield = clamp(this.shield + Math.max(0, dShield), 0, newShieldMax);
    void hullRatio;
    void shieldRatio;
  }

  get moveSpeed(): number {
    return PLAYER_MAX_SPEED * (1 + this.mods.moveSpeedPct / 100);
  }

  startDash(): boolean {
    if (this.dashCooldown > 0 || !this.alive) return false;
    this.dashing = true;
    this.dashTimer = DASH_TIME;
    this.dashIframe = DASH_IFRAMES;
    this.invuln = true;
    this.invulnTimer = Math.max(this.invulnTimer, DASH_IFRAMES);
    this.dashCooldown = DASH_COOLDOWN * (1 - Math.min(0.5, this.mods.moveSpeedPct / 100));
    return true;
  }

  /** Returns true if the hit reduced hull to 0 (death). */
  takeDamage(amount: number): boolean {
    if (!this.alive) return true;
    if (this.invulnTimer > 0 || this.dashIframe > 0) return false;

    const capped = Math.min(amount, (this.hullMax + this.shieldMax) * MAX_ENEMY_HIT_FRACTION);
    const reduced = capped * (1 - clamp(this.mods.damageReduction, 0, 0.6));

    if (this.shield > 0) {
      this.shield -= reduced;
      this.shieldFlicker = 1;
      if (this.shield < 0) {
        this.hull += this.shield; // overflow spills into hull
        this.shield = 0;
      }
    } else {
      this.hull -= reduced;
    }
    this.shieldDelay = SHIELD_RECHARGE_DELAY;
    this.invuln = true;
    this.invulnTimer = INVULN_TIME;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  heal(amount: number): void {
    this.hull = clamp(this.hull + amount, 0, this.hullMax);
  }

  healFraction(f: number): void {
    this.heal(this.hullMax * f);
  }

  refillShield(): void {
    this.shield = this.shieldMax;
  }

  revive(hullFraction = 0.5): void {
    this.alive = true;
    this.hull = this.hullMax * hullFraction;
    this.shield = this.shieldMax;
    this.invuln = true;
    this.invulnTimer = 2.5;
    this.revivedFlash = 1;
    this.vx = 0;
    this.vy = 0;
  }

  update(dt: number, ax: number, ay: number, aimX: number, aimY: number): void {
    if (!this.alive) return;

    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.dashing = false;
    }
    if (this.dashIframe > 0) this.dashIframe -= dt;
    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      if (this.invulnTimer <= 0 && this.dashIframe <= 0) this.invuln = false;
    }
    if (this.shieldFlicker > 0) this.shieldFlicker = Math.max(0, this.shieldFlicker - dt * 3);
    if (this.revivedFlash > 0) this.revivedFlash = Math.max(0, this.revivedFlash - dt);

    // Shield recharge
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else if (this.shield < this.shieldMax) {
      const rate = SHIELD_RECHARGE_RATE * (1 + this.mods.shieldRechargePct / 100);
      this.shield = Math.min(this.shieldMax, this.shield + rate * dt);
    }

    if (this.dashing) {
      const m = Math.hypot(this.vx, this.vy);
      if (m > 1) {
        this.vx = (this.vx / m) * DASH_SPEED;
        this.vy = (this.vy / m) * DASH_SPEED;
      }
    } else {
      this.vx += ax * PLAYER_ACCEL * dt;
      this.vy += ay * PLAYER_ACCEL * dt;
      const drag = Math.exp(-PLAYER_FRICTION * dt);
      this.vx *= drag;
      this.vy *= drag;
      const sp = Math.hypot(this.vx, this.vy);
      const max = this.moveSpeed;
      if (sp > max) {
        this.vx = (this.vx / sp) * max;
        this.vy = (this.vy / sp) * max;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Soft edge bounce so the ship stays inside the arena. Clamp against the
    // rotated AABB of the sprite (not a single radius) so the long axis and the
    // wingtips are both respected as the ship turns.
    // ponytail: symmetric front/back — nose (46) and tail (41) source px collapse
    // to max (46). Go asymmetric only if the tail gap ever matters visually.
    const s = PLAYER_RADIUS / SHIP_SRC_REF;
    const halfW = SHIP_SRC_HALF_W * s;
    const halfFwd = SHIP_SRC_HALF_FWD * s;
    const sa = Math.abs(Math.sin(this.angle));
    const ca = Math.abs(Math.cos(this.angle));
    const xr = halfW * ca + halfFwd * sa;
    const yr = halfW * sa + halfFwd * ca;
    const bounce = 0.45;
    if (this.x < xr) {
      this.x = xr;
      this.vx = Math.abs(this.vx) * bounce;
    } else if (this.x > ARENA_W - xr) {
      this.x = ARENA_W - xr;
      this.vx = -Math.abs(this.vx) * bounce;
    }
    if (this.y < yr) {
      this.y = yr;
      this.vy = Math.abs(this.vy) * bounce;
    } else if (this.y > ARENA_H - yr) {
      this.y = ARENA_H - yr;
      this.vy = -Math.abs(this.vy) * bounce;
    }

    const target = Math.atan2(aimY - this.y, aimX - this.x) + Math.PI / 2;
    this.angle = angleToward(this.angle, target, PLAYER_TURN_RATE * dt);
  }

  /** Nudge toward a point (used by dash-through and knockback). */
  dampVelocity(lambda: number, dt: number): void {
    this.vx = damp(this.vx, 0, lambda, dt);
    this.vy = damp(this.vy, 0, lambda, dt);
  }
}
