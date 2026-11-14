/**
 * Bullet simulation + every collision in the game.
 *
 * Kept in one place because the interactions are mutually entangled: a single
 * bullet can pierce, bounce, explode, chain, crit and cut enemy bullets.
 */
import { SpatialHash } from "../core/spatial";
import type { GameCtx } from "../ctx";
import { pools, type Bullet, type Enemy } from "../entities";
import { ARENA_H, ARENA_W, MAGNET_RADIUS, PICKUP_RADIUS } from "../data/constants";
import type { Player } from "../player";
import type { EnemySystem } from "./enemies";
import type { BossSystem } from "./bosses";
import type { Progression } from "./progression";
import type { WeaponSystem } from "./weapons";

/** Shortest distance from point (px,py) to the segment (ax,ay)-(bx,by). */
function segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export class CollisionSystem {
  // ponytail: fixed 4096 bound, not ARENA_W/H (a field initializer would snapshot
  // the arena at construction and go stale on resize). SpatialHash clamps out-of-
  // range coords to edge buckets, and enemies/bullets are clamped to the arena.
  private grid = new SpatialHash<Enemy>(140, 4096, 4096);
  private found: Enemy[] = [];

  constructor(
    private ctx: GameCtx,
    private enemies: EnemySystem,
    private weapons: WeaponSystem,
    private bosses: BossSystem,
    private progression: Progression,
  ) {}

  update(dt: number, player: Player): void {
    if (dt <= 0) return;

    // Rebuild the broad phase once per tick.
    this.grid.clear();
    for (const e of pools.enemies.all()) {
      if (e.active) this.grid.insert(e);
    }

    this.updatePickups(dt, player);
    this.updatePlayerBullets(dt);
    this.updateEnemyBullets(dt, player);
    this.enemyContact(player, dt);
  }

  // ------------------------------------------------------------------ pickups

  private updatePickups(dt: number, player: Player): void {
    const radius = PICKUP_RADIUS * (1 + player.mods.pickupRadiusPct / 100);
    const magnet = MAGNET_RADIUS * (1 + player.mods.pickupRadiusPct / 100);
    for (const pk of pools.pickups.all()) {
      if (!pk.active) continue;
      pk.age += dt;
      if (pk.age > pk.lifetime) {
        pools.pickups.release(pk);
        continue;
      }
      const dx = player.x - pk.x;
      const dy = player.y - pk.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet && player.alive) {
        pk.magnetized = true;
        const pull = (1 - d / magnet) * 2600;
        pk.vx += (dx / (d || 1)) * pull * dt;
        pk.vy += (dy / (d || 1)) * pull * dt;
      }
      pk.vx *= Math.exp(-2.2 * dt);
      pk.vy *= Math.exp(-2.2 * dt);
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;

      if (d < radius + pk.radius && pk.magnetized) {
        this.collect(pk, player);
      }
    }
  }

  private collect(pk: { kind: string; value: number; x: number; y: number }, player: Player): void {
    switch (pk.kind) {
      case "xp": {
        const amount = pk.value * (1 + player.mods.xpPct / 100);
        this.ctx.stats.xpCollected += amount;
        const gained = this.progression.addXp(amount);
        if (gained > 0) this.progression.queueLevelUp(gained);
        this.ctx.sfx("xp", { volume: 0.5 });
        break;
      }
      case "repair":
        player.heal(player.hullMax * 0.2);
        this.ctx.sfxAt("repair", player.x, player.y);
        this.ctx.toast("Hull +20%", 0x4dffa6);
        break;
      case "shield":
        player.refillShield();
        this.ctx.sfxAt("shield_up", player.x, player.y);
        this.ctx.toast("Shield restored", 0x5af0ff);
        break;
      default:
        break;
    }
    pools.pickups.release(pk as never);
  }

  // --------------------------------------------------------------- player bullets

  private updatePlayerBullets(dt: number): void {
    const mods = this.ctx.player.mods;
    for (const b of pools.bullets.all()) {
      if (!b.active) continue;
      b.px = b.x;
      b.py = b.y;
      b.age += dt;
      if (b.age > b.lifetime) {
        if (b.aoe > 0) this.detonate(b);
        pools.bullets.release(b);
        continue;
      }

      // ---- homing
      if (b.homing > 0) {
        const t = this.nearestEnemy(b.x, b.y, 700);
        if (t) {
          const desired = Math.atan2(t.y - b.y, t.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let delta = desired - cur;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          cur += Math.sign(delta) * Math.min(Math.abs(delta), b.homing * dt);
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur) * speed;
          b.vy = Math.sin(cur) * speed;
        }
      }

      // ---- boomerang: fly out then return
      if (b.boomerang) {
        const travelled = Math.hypot(b.x - b.originX, b.y - b.originY);
        if (!b.returning && travelled >= b.maxDist) {
          b.returning = true;
          b.pierceLeft = Math.max(b.pierceLeft, 99); // hits again on the way back
        }
        if (b.returning) {
          const dx = this.ctx.player.x - b.x;
          const dy = this.ctx.player.y - b.y;
          const d = Math.hypot(dx, dy);
          const speed = Math.hypot(b.vx, b.vy) || 800;
          b.vx = (dx / (d || 1)) * speed;
          b.vy = (dy / (d || 1)) * speed;
          if (d < 40) {
            pools.bullets.release(b);
            continue;
          }
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle = Math.atan2(b.vy, b.vx);

      // ---- edge bounces (ricochet)
      if (b.bounceLeft > 0) {
        if (b.x < 8 || b.x > ARENA_W - 8) {
          b.vx = -b.vx;
          b.x = b.x < 8 ? 8 : ARENA_W - 8;
          b.bounceLeft--;
        }
        if (b.y < 8 || b.y > ARENA_H - 8) {
          b.vy = -b.vy;
          b.y = b.y < 8 ? 8 : ARENA_H - 8;
          b.bounceLeft--;
        }
      } else if (b.x < -60 || b.x > ARENA_W + 60 || b.y < -60 || b.y > ARENA_H + 60) {
        if (b.aoe > 0) this.detonate(b);
        pools.bullets.release(b);
        continue;
      }

      // ---- hit enemies
      // Swept test: a fast shot (rail/prism, or tier-4 bullet speed) can move
      // further than a hitbox per step, so test the whole segment it travelled.
      const step = Math.hypot(b.x - b.px, b.y - b.py);
      const hits = this.grid.query(b.x, b.y, b.radius + 80 + step, this.found);
      for (const e of hits) {
        if (!e.active || !b.active) continue;
        const rr = e.radius + b.radius;
        if (segmentDistance(b.px, b.py, b.x, b.y, e.x, e.y) > rr) continue;
        if (b.weaponId === "arc_chain") {
          this.chainHit(b, e);
        } else {
          this.hitEnemy(b, e, mods);
        }
        if (b.pierceLeft <= 0) break;
      }
    }
  }

  private hitEnemy(b: Bullet, e: Enemy, mods: Player["mods"]): void {
    const crit = this.ctx.rng.next() < mods.critChance;
    const dmg = b.damage * (crit ? mods.critDamage : 1);
    this.ctx.stats.damageDealt += dmg;
    this.ctx.stats.hits++;
    this.spark(b, e);
    if (mods.lifesteal > 0 && this.ctx.rng.next() < 0.02) this.ctx.player.heal(1);
    this.enemies.damage(e, dmg, crit, b.x, b.y);
    if (this.ctx.settings.damageNumbers) {
      this.ctx.damageNumber(e.x, e.y - e.radius, String(Math.round(dmg)), crit);
    }
    if (b.pierceLeft > 0) b.pierceLeft--;
    else {
      if (b.aoe > 0) this.detonate(b);
      pools.bullets.release(b);
    }
  }

  private chainHit(b: Bullet, first: Enemy): void {
    let dmg = b.damage;
    let jumps = b.chainJumps;
    let from: Enemy | null = first;
    const visited = new Set<number>();
    while (from && jumps >= 0) {
      visited.add(from.uid);
      this.ctx.stats.damageDealt += dmg;
      this.enemies.damage(from, dmg, false, b.x, b.y);
      // lightning visual between segments
      this.ctx.particle(from.x, from.y, 0, -40, 0.18, 0xa0e0ff, 5, "spark");
      if (jumps <= 0) break;
      dmg *= b.chainFalloff;
      jumps--;
      const candidates = this.grid.query(from.x, from.y, 260, this.found);
      let best: Enemy | null = null;
      let bestD = Infinity;
      for (const c of candidates) {
        if (!c.active || visited.has(c.uid)) continue;
        const d = Math.hypot(c.x - from.x, c.y - from.y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      from = best;
    }
    pools.bullets.release(b);
  }

  private spark(b: Bullet, e: Enemy): void {
    this.ctx.burst(b.x, b.y, b.color, 3, { speed: 180, life: 0.18, size: 4, angle: b.angle + Math.PI });
    if (e.kind !== "rock") this.ctx.sfxAt("hit", e.x, e.y, { volume: 0.35 });
  }

  private detonate(b: Bullet): void {
    this.ctx.burst(b.x, b.y, b.color, 22, { speed: 520, life: 0.45, size: 9 });
    this.ctx.shake(4);
    this.ctx.aoeDamage(b.x, b.y, b.aoe, b.damage * 0.8, b.color);
  }

  private nearestEnemy(x: number, y: number, maxDist: number): Enemy | null {
    const list = this.grid.query(x, y, maxDist, this.found);
    let best: Enemy | null = null;
    let bestD = maxDist * maxDist;
    for (const e of list) {
      if (!e.active) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // --------------------------------------------------------------- enemy bullets

  private updateEnemyBullets(dt: number, player: Player): void {
    const pr = player.hitRadius;
    for (const b of pools.enemyBullets.all()) {
      if (!b.active) continue;
      b.px = b.x;
      b.py = b.y;
      // Chrono Slip: slows bullet motion AND bullet age together so a slowed
      // bullet does not expire at normal speed mid-effect; scale is exactly 1
      // when inactive, so this is a no-op (x*1 is exact, no drift).
      const bdt = dt * this.progression.enemyTimeScale;
      b.age += bdt;
      b.x += b.vx * bdt;
      b.y += b.vy * bdt;
      b.angle = Math.atan2(b.vy, b.vx);
      if (
        b.age > b.lifetime ||
        b.x < -80 ||
        b.x > ARENA_W + 80 ||
        b.y < -80 ||
        b.y > ARENA_H + 80
      ) {
        pools.enemyBullets.release(b);
        continue;
      }

      // Player bullets can cut enemy bullets (crescent slash).
      for (const pb of pools.bullets.all()) {
        if (!pb.active || !pb.cutsBullets) continue;
        const rr = pb.radius + b.radius;
        if (Math.hypot(pb.x - b.x, pb.y - b.y) <= rr) {
          this.ctx.burst(b.x, b.y, 0xffd166, 4, { speed: 200, life: 0.2, size: 4 });
          pools.enemyBullets.release(b);
          break;
        }
      }
      if (!b.active) continue;

      // Reflecting barrier: destroy the bullet and fire it back as a player shot.
      if (this.progression.mods.barrierReflect && this.progression.barrierTimer > 0) {
        if (Math.hypot(player.x - b.x, player.y - b.y) < 90) {
          const pb = pools.bullets.spawn();
          pb.owner = "player";
          pb.weaponId = "focus_lance";
          pb.behavior = "projectile";
          pb.x = b.x;
          pb.y = b.y;
          pb.px = b.x;
          pb.py = b.y;
          pb.vx = -b.vx * 1.2;
          pb.vy = -b.vy * 1.2;
          pb.angle = Math.atan2(pb.vy, pb.vx);
          pb.radius = b.radius + 2;
          pb.damage = b.damage * 2;
          pb.lifetime = 1.6;
          pb.age = 0;
          pb.color = 0x5af0ff;
          pb.accent = 0xffffff;
          pb.shape = "bolt";
          pb.pierceLeft = 1;
          pools.enemyBullets.release(b);
          continue;
        }
      }

      if (!player.alive) continue;
      const rr = pr + b.radius;
      if ((player.x - b.x) ** 2 + (player.y - b.y) ** 2 <= rr * rr) {
        const died = this.applyPlayerHit(player, b.damage, "Enemy fire");
        pools.enemyBullets.release(b);
        if (died) return;
      }
    }
  }

  // --------------------------------------------------------------- contact

  private enemyContact(player: Player, _dt: number): void {
    if (!player.alive) return;
    const pr = player.hitRadius;
    const dashing = player.dashIframe > 0;
    const list = this.grid.query(player.x, player.y, pr + 120, this.found);
    for (const e of list) {
      if (!e.active) continue;
      const rr = pr + e.collisionRadius;
      if ((player.x - e.x) ** 2 + (player.y - e.y) ** 2 > rr * rr) continue;

      if (dashing) {
        // Dash-through: damage the enemy, erase it from the contact check.
        this.enemies.damage(e, this.weapons.dashDamage(), true, player.x, player.y);
        continue;
      }
      if (e.graceLeft > 0) continue;

      // Thorns: rammers hurt themselves.
      const thorns = player.mods.thornsDamage;
      if (thorns > 0) {
        this.enemies.damage(e, thorns, false, player.x, player.y);
        const nx = e.x - player.x;
        const ny = e.y - player.y;
        const m = Math.hypot(nx, ny) || 1;
        e.vx += (nx / m) * 400;
        e.vy += (ny / m) * 400;
      }

      if (player.invulnTimer > 0 || player.dashIframe > 0) continue;
      // Contact damage for bosses (the enemy system `continue`s on isBoss) and
      // any contact it left unresolved. Non-boss rams are consumed in
      // enemies.ts, which runs first and sets invuln, so this branch normally
      // only fires for a boss.
      const died = this.applyPlayerHit(player, e.damage, this.sourceName(e));
      this.ctx.burst(e.x, e.y, e.color, 14, { speed: 320, life: 0.3, size: 6 });
      if (died) return;
    }
  }

  private sourceName(e: Enemy): string {
    if (e.isBoss && e.bossDef) return e.bossDef.name;
    switch (e.kind) {
      case "smasher":
        return "Breaker ram";
      case "shooter":
        return "Raider";
      default:
        return e.variant === "explosive" ? "Explosive rock" : "Asteroid";
    }
  }

  private applyPlayerHit(player: Player, amount: number, source: string): boolean {
    // Route the hit through the ctx gate: it is the only thing the collision
    // system can reach that enforces debug godMode (game.ts `damagePlayer`).
    // Calling player.takeDamage() directly bypassed that check and let enemy
    // fire chip the hull while godMode was on.
    const before = player.hull + player.shield;
    this.ctx.damagePlayer(amount, source);
    if (player.hull + player.shield === before) return false; // swallowed (godMode)
    this.ctx.sfx("hit");
    this.ctx.shake(8);
    this.ctx.burst(player.x, player.y, 0xff4d6d, 18, { speed: 380, life: 0.35, size: 7 });
    if (player.shield > 0) this.ctx.sfx("shield_hit", { volume: 0.6 });
    else if (player.shield === 0) this.ctx.sfx("shield_break", { volume: 0.6 });
    return !player.alive;
  }

  /** Used by the debug panel / shockwave to clear the screen of bullets. */
  clearEnemyBullets(): void {
    pools.enemyBullets.clear();
  }
}
