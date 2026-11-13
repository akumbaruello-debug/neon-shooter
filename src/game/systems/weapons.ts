/**
 * Player weapon system — firing cadence, projectile spawning and the per-weapon
 * special behaviours (rail charge, prism heat/ramp, bounce, boomerang, ...).
 *
 * All 12 weapons are driven straight from the WEAPONS table. Only presentation
 * constants (muzzle offset, beam sweep speed, dash damage) live here.
 *
 * Bullets are owned by `pools.bullets`; `pools.enemyBullets` holds enemy fire.
 */
import type { SfxName } from "../audio";
import { clamp } from "../core/math";
import type { GameCtx } from "../ctx";
import { ARENA_W } from "../data/constants";
import { BASIC_WEAPON, WEAPONS } from "../data/weapons";
import type { Bullet, BulletShape } from "../entities";
import { pools } from "../entities";
import type { WeaponDef, WeaponId } from "../types";

/** Spawn distance from the ship centre to the shot origin. */
const MUZZLE = 22;
/** Prism beam sweep speed: the hitbox lives `range / speed` seconds. */
const BEAM_SPEED = 8000;
/** Extra damage a dash-through deals (collisions reads this). */
const DASH_DAMAGE = 35;
/** Crossfire barrel angles relative to aim: forward, rear, two diagonals. */
const CROSSFIRE_OFFSETS = [0, Math.PI, 0.55, -0.55] as const;

const PROJECTILE_SHAPE: Record<WeaponId, BulletShape> = {
  focus_lance: "lance",
  gatling_vulcan: "bolt",
  rail_charge: "beam",
  prism_beam: "beam",
  scatter_shot: "diamond",
  crescent_slash: "arc",
  arc_chain: "bolt",
  plasma_orb: "orb",
  seeker_swarm: "missile",
  ricochet_disc: "disc",
  boomerang_blade: "blade",
  crossfire: "bolt",
};

/** Weapon sfx name is the def id for all 12 (every WeaponId is an SfxName). */
function weaponSfxName(id: WeaponId): SfxName {
  return id;
}

export class WeaponSystem {
  weaponId: WeaponId;
  /** Mastery ranks picked for the current weapon during this run (0..3). */
  masteryRank = 0;

  private readonly ctx: GameCtx;
  private def: WeaponDef;

  private cooldown = 0;
  private bloomHeat = 0;
  private charging = false;
  private chargeAccum = 0;
  private chargeReady = false;
  private heatValue = 0;
  private overheatTimer = 0;
  private rampUid = -1;
  private rampHits = 0;

  constructor(ctx: GameCtx) {
    this.ctx = ctx;
    this.weaponId = BASIC_WEAPON;
    this.def = WEAPONS[this.weaponId];
  }

  setWeapon(id: WeaponId): void {
    this.weaponId = id;
    this.def = WEAPONS[id];
    this.masteryRank = 0;
    this.resetTimers();
  }

  /** Heat 0..1 (prism beam). Used by the HUD. */
  get heat(): number {
    return this.heatValue;
  }

  /** Charge 0..1 (rail). Used by the HUD and to slow the player while charging. */
  get charge(): number {
    if (this.def.behavior !== "rail") return 0;
    const ct = this.def.chargeTime ?? 1.2;
    return clamp(this.chargeAccum / ct, 0, 1);
  }

  get overheated(): boolean {
    return this.overheatTimer > 0;
  }

  /** Prism beam ramp multiplier, 1..rampMax, driven by repeated hits on one uid. */
  get rampBonus(): number {
    const per = this.def.rampPerHit ?? 0;
    const max = this.def.rampMax ?? 1;
    return Math.min(max, 1 + per * this.rampHits);
  }

  update(dt: number, fireHeld: boolean, aimAngle: number, x: number, y: number): void {
    if (dt <= 0) return;
    const def = this.def;
    const mods = this.ctx.player.mods;
    const dmgMult = 1 + mods.damagePct / 100;
    const effInterval = def.fireInterval / (1 + mods.fireRatePct / 100);
    const pierce = def.pierce + mods.pierceFlat;

    switch (def.behavior) {
      case "rail":
        this.updateRail(dt, fireHeld, aimAngle, x, y, dmgMult);
        return;
      case "beam":
        this.updateBeam(dt, fireHeld, aimAngle, x, y, dmgMult, effInterval);
        return;
      case "projectile": {
        this.tickBloom(dt, fireHeld);
        this.cooldown -= dt;
        if (!fireHeld || this.cooldown > 0) {
          if (!fireHeld && this.cooldown < 0) this.cooldown = 0;
          return;
        }
        this.cooldown = effInterval;
        const mx = x + Math.cos(aimAngle) * MUZZLE;
        const my = y + Math.sin(aimAngle) * MUZZLE;
        if (def.id === "crossfire") {
          for (let i = 0; i < def.count; i++) {
            const off = CROSSFIRE_OFFSETS[i % CROSSFIRE_OFFSETS.length] ?? 0;
            const b = this.emit(mx, my, aimAngle + off, def.projectileSpeed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, "bolt", pierce, def.knockback);
            void b;
          }
        } else {
          const n = def.count;
          const spread = def.spread + (def.bloom !== undefined ? this.bloomHeat * def.bloom * 1.6 : 0);
          for (let i = 0; i < n; i++) {
            const t = n > 1 ? i / (n - 1) - 0.5 : 0;
            const b = this.emit(mx, my, aimAngle + t * spread, def.projectileSpeed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, PROJECTILE_SHAPE[def.id], pierce, def.knockback);
            if (def.aoe !== undefined) b.aoe = def.aoe;
          }
        }
        this.ctx.stats.shotsFired += def.id === "crossfire" ? 4 : def.count;
        this.muzzle(x, y);
        return;
      }
      case "melee_arc": {
        this.cooldown -= dt;
        if (!fireHeld || this.cooldown > 0) {
          if (!fireHeld && this.cooldown < 0) this.cooldown = 0;
          return;
        }
        this.cooldown = effInterval;
        const mx = x + Math.cos(aimAngle) * MUZZLE;
        const my = y + Math.sin(aimAngle) * MUZZLE;
        // Slow-expanding arc: travels `range` over `lifetime`, cuts enemy fire.
        const speed = (def.range ?? 190) / def.lifetime;
        const b = this.emit(mx, my, aimAngle, speed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, "arc", 99, def.knockback);
        b.cutsBullets = true;
        this.ctx.stats.shotsFired += 1;
        this.muzzle(x, y);
        return;
      }
      case "chain": {
        this.cooldown -= dt;
        if (!fireHeld || this.cooldown > 0) {
          if (!fireHeld && this.cooldown < 0) this.cooldown = 0;
          return;
        }
        this.cooldown = effInterval;
        const mx = x + Math.cos(aimAngle) * MUZZLE;
        const my = y + Math.sin(aimAngle) * MUZZLE;
        const speed = (def.range ?? 300) / def.lifetime;
        const b = this.emit(mx, my, aimAngle, speed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, "bolt", pierce, def.knockback);
        // Chain jumps are resolved by the collisions system from these fields.
        b.chainJumps = def.chainJumps ?? 0;
        b.chainFalloff = def.chainFalloff ?? 1;
        this.ctx.stats.shotsFired += 1;
        this.muzzle(x, y);
        return;
      }
      case "homing": {
        this.cooldown -= dt;
        if (!fireHeld || this.cooldown > 0) {
          if (!fireHeld && this.cooldown < 0) this.cooldown = 0;
          return;
        }
        this.cooldown = effInterval;
        const mx = x + Math.cos(aimAngle) * MUZZLE;
        const my = y + Math.sin(aimAngle) * MUZZLE;
        const n = def.count;
        for (let i = 0; i < n; i++) {
          const t = n > 1 ? i / (n - 1) - 0.5 : 0;
          const b = this.emit(mx, my, aimAngle + t * def.spread, def.projectileSpeed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, "missile", pierce, def.knockback);
          b.homing = def.homing ?? 0;
          b.trail = 1;
        }
        this.ctx.stats.shotsFired += n;
        this.muzzle(x, y);
        return;
      }
      case "bounce": {
        this.cooldown -= dt;
        if (!fireHeld || this.cooldown > 0) {
          if (!fireHeld && this.cooldown < 0) this.cooldown = 0;
          return;
        }
        if (this.activeCount() >= (def.maxInFlight ?? 1)) {
          if (this.cooldown < 0) this.cooldown = 0;
          return;
        }
        this.cooldown = effInterval;
        const mx = x + Math.cos(aimAngle) * MUZZLE;
        const my = y + Math.sin(aimAngle) * MUZZLE;
        const b = this.emit(mx, my, aimAngle, def.projectileSpeed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, "disc", pierce, def.knockback);
        b.bounceLeft = def.bounce ?? 0;
        b.spin = 14;
        this.ctx.stats.shotsFired += 1;
        this.muzzle(x, y);
        return;
      }
      case "boomerang": {
        this.cooldown -= dt;
        if (!fireHeld || this.cooldown > 0) {
          if (!fireHeld && this.cooldown < 0) this.cooldown = 0;
          return;
        }
        if (this.activeCount() >= (def.maxInFlight ?? 1)) {
          if (this.cooldown < 0) this.cooldown = 0;
          return;
        }
        this.cooldown = effInterval;
        const mx = x + Math.cos(aimAngle) * MUZZLE;
        const my = y + Math.sin(aimAngle) * MUZZLE;
        const b = this.emit(mx, my, aimAngle, def.projectileSpeed, def.size, def.damage * dmgMult, def.color, def.accent, def.lifetime, "blade", pierce, def.knockback);
        b.boomerang = true;
        b.maxDist = def.returnDistance ?? 0;
        b.originX = x;
        b.originY = y;
        b.spin = 20;
        this.ctx.stats.shotsFired += 1;
        this.muzzle(x, y);
        return;
      }
      default:
        return;
    }
  }

  /** Extra damage a dash-through deals (read by collisions). */
  dashDamage(): number {
    return DASH_DAMAGE * (1 + this.ctx.player.mods.damagePct / 100);
  }

  reset(): void {
    this.masteryRank = 0;
    this.resetTimers();
  }

  // -------------------------------------------------------------- internals

  private resetTimers(): void {
    this.cooldown = 0;
    this.bloomHeat = 0;
    this.charging = false;
    this.chargeAccum = 0;
    this.chargeReady = false;
    this.heatValue = 0;
    this.overheatTimer = 0;
    this.rampUid = -1;
    this.rampHits = 0;
  }

  private updateRail(dt: number, fireHeld: boolean, aimAngle: number, x: number, y: number, dmgMult: number): void {
    const def = this.def;
    const ct = def.chargeTime ?? 1.2;
    if (fireHeld) {
      this.charging = true;
      this.chargeAccum = Math.min(ct, this.chargeAccum + dt);
      if (!this.chargeReady && this.chargeAccum >= ct) {
        this.chargeReady = true;
        this.ctx.audio.play("rail_ready");
      }
      return; // charging suppresses normal shots
    }
    if (!this.charging) return;
    const minCharge = Math.min(1.0, ct);
    if (this.chargeAccum >= minCharge) {
      const ratio = clamp(this.chargeAccum / ct, 0, 1);
      const damage = def.damage * (0.4 + 0.6 * ratio) * dmgMult;
      const speed = def.projectileSpeed;
      const life = (ARENA_W * 1.5) / speed; // long enough to cross the arena
      const mx = x + Math.cos(aimAngle) * MUZZLE;
      const my = y + Math.sin(aimAngle) * MUZZLE;
      const b = this.emit(mx, my, aimAngle, speed, def.size, damage, def.color, def.accent, life, "beam", 99, def.knockback);
      b.trail = 1;
      this.ctx.stats.shotsFired += 1;
      this.muzzle(x, y);
    }
    this.charging = false;
    this.chargeAccum = 0;
    this.chargeReady = false;
  }

  private updateBeam(dt: number, fireHeld: boolean, aimAngle: number, x: number, y: number, dmgMult: number, effInterval: number): void {
    const def = this.def;
    if (this.overheatTimer > 0) {
      this.overheatTimer -= dt;
      if (this.overheatTimer <= 0) {
        this.overheatTimer = 0;
        this.heatValue = 0;
      }
      return; // locked out
    }
    if (!fireHeld) {
      if (this.cooldown < 0) this.cooldown = 0;
      this.heatValue = Math.max(0, this.heatValue - (def.heatCoolPerSec ?? 0) * dt);
      return;
    }
    this.heatValue = Math.min(1, this.heatValue + (def.heatPerSec ?? 0) * dt);
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = effInterval;
      this.updateRamp();
      const speed = BEAM_SPEED;
      const life = (def.range ?? 300) / speed;
      const mx = x + Math.cos(aimAngle) * MUZZLE;
      const my = y + Math.sin(aimAngle) * MUZZLE;
      const b = this.emit(mx, my, aimAngle, speed, def.size, def.damage * dmgMult * this.rampBonus, def.color, def.accent, life, "beam", 99, def.knockback);
      b.trail = 1;
      this.ctx.stats.shotsFired += 1;
      this.muzzle(x, y);
    }
    if (this.heatValue >= 1 && this.overheatTimer <= 0) {
      this.overheatTimer = def.overheatLock ?? 1.4;
      this.ctx.audio.play("overheat");
    }
  }

  /**
   * Ramp bookkeeping. Collisions writes the last-hit enemy uid into the beam
   * bullet's `targetIdx`; we read it back to count consecutive hits on one foe.
   */
  private updateRamp(): void {
    const list = pools.bullets.all();
    let uid = -1;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b && b.active && b.owner === "player" && b.weaponId === "prism_beam" && b.targetIdx >= 0) {
        uid = b.targetIdx;
        break;
      }
    }
    if (uid < 0) return;
    if (uid === this.rampUid) this.rampHits += 1;
    else {
      this.rampUid = uid;
      this.rampHits = 1;
    }
  }

  private tickBloom(dt: number, fireHeld: boolean): void {
    if (this.def.bloom === undefined) return;
    if (fireHeld) this.bloomHeat = Math.min(1, this.bloomHeat + dt / 1.2);
    else this.bloomHeat = Math.max(0, this.bloomHeat - dt / 0.6);
  }

  private activeCount(): number {
    let n = 0;
    const list = pools.bullets.all();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b && b.active && b.owner === "player" && b.weaponId === this.weaponId) n++;
    }
    return n;
  }

  private muzzle(x: number, y: number): void {
    const d = this.def;
    this.ctx.burst(x, y, d.color, 4, { speed: 120, life: 0.22, size: 5 });
    this.ctx.sfxAt(weaponSfxName(d.id), x, y);
  }

  /** Spawn a player bullet and initialise every field (pools reuse objects). */
  private emit(
    x: number,
    y: number,
    angle: number,
    speed: number,
    radius: number,
    damage: number,
    color: number,
    accent: number,
    lifetime: number,
    shape: BulletShape,
    pierce: number,
    knockback: number,
  ): Bullet {
    const b = pools.bullets.spawn();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    b.owner = "player";
    b.weaponId = this.weaponId;
    b.behavior = this.def.behavior;
    b.x = x;
    b.y = y;
    b.px = x;
    b.py = y;
    b.vx = cos * speed;
    b.vy = sin * speed;
    b.angle = angle;
    b.spin = 0;
    b.radius = radius;
    b.damage = damage;
    b.pierceLeft = pierce;
    b.knockback = knockback;
    b.lifetime = lifetime;
    b.age = 0;
    b.color = color;
    b.accent = accent;
    b.shape = shape;
    b.homing = 0;
    b.targetIdx = -1;
    b.bounceLeft = 0;
    b.boomerang = false;
    b.returning = false;
    b.originX = 0;
    b.originY = 0;
    b.maxDist = 0;
    b.aoe = 0;
    b.crit = false;
    b.chainJumps = 0;
    b.chainFalloff = 1;
    b.cutsBullets = false;
    b.trail = 0;
    return b;
  }
}
