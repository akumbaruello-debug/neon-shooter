/**
 * Enemy system: rocks, shooters ("raiders") and smashers ("breakers").
 * Owns spawn-in rules, per-kind movement/attack AI, damage, death, splitting,
 * explosive chain blasts, loot pity timer and the stage-timer straggler crack.
 *
 * Bosses live in the same pool but their behaviour is driven by the boss
 * system; this system only manufactures the shell.
 */
import {
  ARENA_H,
  ARENA_W,
  ENEMY_BULLET,
  HITSTOP_BIG_KILL,
  MIN_SPAWN_DIST_FROM_PLAYER,
  PITY_REPAIR_MIN_GAP,
  SPAWN_FX_TIME,
  SPAWN_GRACE,
} from "../data/constants";
import { ROCKS, SHOOTER, SMASHERS } from "../data/enemies";
import { clamp, damp, dist2, normalize, TAU } from "../core/math";
import { nextSpawnId, pools, type Enemy, type Size3 } from "../entities";
import type { GameCtx } from "../ctx";
import type { BossDef, EnemyDef, RockVariant } from "../types";

const SIZE_DAMAGE: Record<Size3, number> = { small: 8, medium: 12, large: 18 };
const TELEGRAPH_TIME: Record<Size3, number> = { small: 1.0, medium: 1.2, large: 1.4 };
const SHOOTER_PATTERNS = ["sine", "orbit", "v_entry", "patrol"] as const;
const BULLET_SPEED = 260;
const EXPLOSIVE_RADIUS = 140;
const SMASHER_CHARGE_TIMEOUT = 8;

export class EnemySystem {
  /** Pity timer: seconds since the last repair drop. */
  private sinceRepair = 0;
  private lastRepairTime = 0;

  constructor(private ctx: GameCtx) {}

  reset(): void {
    this.sinceRepair = 0;
    this.lastRepairTime = 0;
  }

  // ---------------------------------------------------------------- scaling
  private get hpScale(): number {
    return Math.pow(1.15, this.ctx.tier);
  }
  private get dmgScale(): number {
    return Math.pow(1.08, this.ctx.tier);
  }
  private get speedScale(): number {
    return Math.min(1.6, 1 + 0.03 * this.ctx.tier);
  }

  // ---------------------------------------------------------------- update
  update(dt: number): void {
    if (dt <= 0) return;
    this.sinceRepair += dt;
    void this.lastRepairTime;

    // Telegraphs are spawned here and ticked here so they cannot leak.
    for (const t of pools.telegraphs.all()) {
      if (!t.active) continue;
      t.timer -= dt;
      if (t.timer <= 0) pools.telegraphs.release(t);
    }

    const p = this.ctx.player;
    for (const e of pools.enemies.all()) {
      if (!e.active) continue;
      // The spawn grace must tick for bosses too, otherwise graceLeft stays
      // frozen at SPAWN_GRACE and the contact check in collisions.ts skips them
      // forever. Boss AI itself is driven by BossSystem, so bosses still skip
      // the per-kind movement/attack block below.
      if (e.graceLeft > 0) e.graceLeft -= dt;
      if (e.isBoss) continue;
      e.age += dt;
      if (e.spawnFx > 0) e.spawnFx = Math.max(0, e.spawnFx - dt / SPAWN_FX_TIME);
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 4);

      switch (e.kind) {
        case "rock":
          this.stepRock(e, dt);
          break;
        case "shooter":
          this.stepShooter(e, dt);
          break;
        case "smasher":
          this.stepSmasher(e, dt);
          break;
      }
      if (!e.active) continue;

      if (
        e.graceLeft <= 0 &&
        p.alive &&
        p.invulnTimer <= 0 &&
        p.dashIframe <= 0 &&
        dist2(e.x, e.y, p.x, p.y) <= (e.collisionRadius + p.hitRadius) ** 2
      ) {
        this.ctx.damagePlayer(e.damage, e.name);
        // The ram landed (player was vulnerable), so consume the rammer/rock
        // exactly once; it cannot multi-hit. Bosses never reach here (the
        // `isBoss` continue above). This runs before collisions.enemyContact,
        // which then sees the player already invulnerable and skips the contact.
        if (e.kind === "smasher" || e.kind === "rock") {
          this.damage(e, 999999, false, p.x, p.y);
        }
      }
    }
  }

  // ---------------------------------------------------------------- rocks
  private stepRock(e: Enemy, dt: number): void {
    e.phase += dt * e.freq;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.variant === "explosive") {
      e.fuseExplosion -= dt;
      if (e.fuseExplosion <= 0) {
        e.flash = 0.8;
        e.fuseExplosion = this.ctx.rng.range(1.2, 2.0);
      }
    }
    if (e.y > ARENA_H + e.radius + 100) pools.enemies.release(e);
  }

  // ---------------------------------------------------------------- shooter
  private stepShooter(e: Enemy, dt: number): void {
    const sp = e.speed;
    switch (e.pattern) {
      case "sine": {
        e.phase += e.freq * dt;
        e.x = e.baseX + Math.sin(e.phase) * e.amp;
        e.y = damp(e.y, e.baseY, 1.5, dt);
        break;
      }
      case "orbit": {
        e.phase += e.freq * dt;
        e.baseY += sp * 0.12 * dt;
        e.x = e.baseX + Math.cos(e.phase) * e.amp;
        e.y = e.baseY + Math.sin(e.phase) * e.amp * 0.6;
        break;
      }
      case "v_entry": {
        e.timer += dt;
        if (e.timer < 0.8) {
          e.x += e.dirX * sp * 0.6 * dt;
          e.y += sp * 0.9 * dt;
        } else {
          e.x += e.dirX * sp * 1.2 * dt;
          e.y += sp * 0.15 * dt;
        }
        break;
      }
      case "patrol": {
        e.x += e.dirX * sp * dt;
        e.y = damp(e.y, e.baseY, 2, dt);
        const m = e.radius + 40;
        if (e.x < m) {
          e.x = m;
          e.dirX = 1;
        } else if (e.x > ARENA_W - m) {
          e.x = ARENA_W - m;
          e.dirX = -1;
        }
        break;
      }
      default:
        break;
    }

    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      e.fireTimer += e.fireInterval;
      this.fire(e);
    }

    if (e.x < -200 || e.x > ARENA_W + 200 || e.y < -200 || e.y > ARENA_H + 200) {
      pools.enemies.release(e);
    }
  }

  private fire(e: Enemy): void {
    const p = this.ctx.player;
    const angle = Math.atan2(p.y - e.y, p.x - e.x);
    this.ctx.spawnEnemyBullet({
      x: e.x,
      y: e.y,
      angle,
      speed: BULLET_SPEED,
      radius: 9,
      damage: e.damage,
      color: ENEMY_BULLET.body,
      accent: ENEMY_BULLET.core,
      lifetime: 5,
    });
  }

  // ---------------------------------------------------------------- smasher
  private stepSmasher(e: Enemy, dt: number): void {
    const p = this.ctx.player;
    switch (e.state) {
      case "idle": {
        e.phase += dt;
        e.x = e.baseX + Math.sin(e.phase) * 6;
        e.y = e.baseY + Math.cos(e.phase * 1.3) * 6;
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          const d = normalize(p.x - e.x, p.y - e.y);
          e.dirX = d.x || 0;
          e.dirY = d.y || 1;
          e.bounced = false;
          e.queued = false;
          e.telegraphTime = TELEGRAPH_TIME[e.size];
          e.stateTimer = e.telegraphTime;
          e.state = "telegraph";
          this.spawnTelegraph(e);
          this.ctx.sfxAt("warn_beep", e.x, e.y);
        }
        break;
      }
      case "telegraph": {
        e.stateTimer -= dt;
        const progress = 1 - e.stateTimer / e.telegraphTime;
        if (!e.queued && progress >= 0.6) {
          e.queued = true;
          this.ctx.sfxAt("warn_beep", e.x, e.y);
        }
        if (e.stateTimer <= 0) {
          e.state = "charging";
          e.stateTimer = SMASHER_CHARGE_TIMEOUT;
        }
        break;
      }
      case "charging": {
        e.stateTimer -= dt;
        const sp = e.speed;
        e.x += e.dirX * sp * dt;
        e.y += e.dirY * sp * dt;
        const m = e.radius;
        if (!e.bounced) {
          if (e.x < m) {
            e.x = m;
            e.dirX = Math.abs(e.dirX);
            e.bounced = true;
          } else if (e.x > ARENA_W - m) {
            e.x = ARENA_W - m;
            e.dirX = -Math.abs(e.dirX);
            e.bounced = true;
          } else if (e.y < m) {
            e.y = m;
            e.dirY = Math.abs(e.dirY);
            e.bounced = true;
          } else if (e.y > ARENA_H - m) {
            e.y = ARENA_H - m;
            e.dirY = -Math.abs(e.dirY);
            e.bounced = true;
          }
        }
        const off =
          e.x < -m * 3 || e.x > ARENA_W + m * 3 || e.y < -m * 3 || e.y > ARENA_H + m * 3;
        if (off || e.stateTimer <= 0) {
          e.x = clamp(e.x, m, ARENA_W - m);
          e.y = clamp(e.y, m, ARENA_H - m);
          e.state = "recover";
          e.stateTimer = 1.2;
        }
        break;
      }
      case "recover": {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.baseX = e.x;
          e.baseY = e.y;
          e.phase = 0;
          e.stateTimer = this.ctx.rng.range(1.5, 2.5);
          e.state = "idle";
        }
        break;
      }
    }
  }

  /** Telegraph spans far enough to cross the arena, guaranteeing a fair warning. */
  private spawnTelegraph(e: Enemy): void {
    const t = pools.telegraphs.spawn();
    const len = ARENA_W + ARENA_H;
    t.kind = "line";
    t.x = e.x;
    t.y = e.y;
    t.x2 = e.x + e.dirX * len;
    t.y2 = e.y + e.dirY * len;
    t.radius = 0;
    t.width = Math.max(8, e.radius * 0.8);
    t.timer = e.telegraphTime;
    t.duration = e.telegraphTime;
    t.color = e.accent;
  }

  // ---------------------------------------------------------------- factories
  spawnRock(variant: RockVariant, size: Size3, x: number, y: number): Enemy | null {
    const def = ROCKS[variant][size];
    if (!def) return null;
    const e = pools.enemies.spawn();
    this.init(e, def, size, x, y);
    e.variant = variant;
    e.pattern = "drift";
    e.damage = SIZE_DAMAGE[size] * this.dmgScale;
    e.vx = this.ctx.rng.range(-24, 24);
    e.vy = e.speed;
    e.phase = this.ctx.rng.range(0, TAU);
    e.freq = this.ctx.rng.range(0.6, 1.6);
    if (variant === "explosive") e.fuseExplosion = this.ctx.rng.range(1.0, 2.4);
    return e;
  }

  spawnShooter(x: number, y: number, pattern?: Enemy["pattern"]): Enemy | null {
    const e = pools.enemies.spawn();
    this.init(e, SHOOTER, "small", x, y);
    e.pattern = pattern ?? this.ctx.rng.pick(SHOOTER_PATTERNS);
    e.baseX = e.x;
    e.baseY = e.y;
    e.amp = this.ctx.rng.range(60, 170);
    e.freq = this.ctx.rng.range(0.5, 1.1);
    e.phase = this.ctx.rng.range(0, TAU);
    e.dirX = e.x < ARENA_W / 2 ? 1 : -1;
    e.fireInterval = this.ctx.rng.range(1.8, 2.6);
    e.fireTimer = this.ctx.rng.range(0.6, e.fireInterval);
    if (e.pattern === "sine") {
      e.baseY = clamp(e.y + this.ctx.rng.range(120, 260), e.radius, ARENA_H * 0.6);
    } else if (e.pattern === "orbit") {
      e.amp = this.ctx.rng.range(90, 190);
    } else if (e.pattern === "patrol") {
      e.baseY = clamp(e.y, e.radius, ARENA_H * 0.35);
    }
    return e;
  }

  spawnSmasher(size: Size3, x: number, y: number): Enemy | null {
    const def = SMASHERS[size];
    if (!def) return null;
    const e = pools.enemies.spawn();
    this.init(e, def, size, x, y);
    e.pattern = "ram";
    e.state = "idle";
    e.stateTimer = this.ctx.rng.range(1.5, 2.5);
    e.dirX = 0;
    e.dirY = 1;
    return e;
  }

  spawnBossShell(def: BossDef): Enemy {
    const e = pools.enemies.spawn();
    e.spawnId = nextSpawnId();
    e.kind = "smasher";
    e.defId = def.id;
    e.name = def.name;
    e.size = "large";
    e.variant = null;
    e.radius = def.radius;
    e.collisionRadius = def.radius * 0.9;
    e.hpMax = def.hp;
    e.hp = e.hpMax;
    e.damage = 0;
    e.speed = 0;
    e.score = 0;
    e.xp = 0;
    e.color = def.color;
    e.accent = def.accent;
    e.x = ARENA_W / 2;
    e.y = ARENA_H * 0.22;
    e.age = 0;
    e.graceLeft = SPAWN_GRACE;
    e.spawnFx = 1;
    e.flash = 0;
    e.pattern = "ram";
    e.state = "idle";
    e.stateTimer = 0;
    e.fuseExplosion = 0;
    e.isBoss = true;
    e.bossDef = def;
    e.phase = 1;
    e.phaseTimer = 0;
    e.patternIdx = 0;
    e.patternTimer = 0;
    e.patternState = 0;
    e.invuln = false;
    e.nodes = 0;
    e.volley = 0;
    e.enrage = false;
    e.queued = false;
    e.bounced = false;
    return e;
  }

  private init(e: Enemy, def: EnemyDef, size: Size3, x: number, y: number): void {
    e.spawnId = nextSpawnId();
    e.kind = def.kind;
    e.defId = def.id;
    e.name = def.name;
    e.size = size;
    e.variant = null;
    e.radius = def.radius;
    e.collisionRadius = def.radius * 0.9;
    e.hpMax = Math.round(def.hp * this.hpScale);
    e.hp = e.hpMax;
    e.damage = def.damage * this.dmgScale;
    e.speed = def.speed * this.speedScale;
    e.score = def.score;
    e.xp = def.xp;
    e.color = def.color;
    e.accent = def.accent;
    e.age = 0;
    e.graceLeft = SPAWN_GRACE;
    e.spawnFx = 1;
    e.flash = 0;
    e.timer = 0;
    e.state = "idle";
    e.stateTimer = 0;
    e.bounced = false;
    e.queued = false;
    e.telegraphTime = 1;
    e.fireTimer = 0;
    e.fireInterval = 2;
    e.fuseExplosion = 0;
    e.phase = 0;
    e.isBoss = false;
    e.bossDef = null;
    e.invuln = false;
    this.place(e, x, y);
  }

  /** Spawn-in rule: never closer than MIN_SPAWN_DIST_FROM_PLAYER; push along x. */
  private place(e: Enemy, x: number, y: number): void {
    const p = this.ctx.player;
    let sx = x;
    let sy = y;
    const dx = sx - p.x;
    const dy = sy - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < MIN_SPAWN_DIST_FROM_PLAYER * MIN_SPAWN_DIST_FROM_PLAYER) {
      const d = Math.sqrt(d2);
      if (d > 1e-3) {
        sx = p.x + (dx / d) * MIN_SPAWN_DIST_FROM_PLAYER;
        sy = p.y + (dy / d) * MIN_SPAWN_DIST_FROM_PLAYER;
      } else {
        sy = p.y - MIN_SPAWN_DIST_FROM_PLAYER;
      }
    }
    e.x = clamp(sx, e.radius, ARENA_W - e.radius);
    e.y = sy;
  }

  // ---------------------------------------------------------------- damage
  damage(e: Enemy, amount: number, crit: boolean, srcX: number, srcY: number): void {
    if (!e.active || e.hp <= 0 || amount <= 0) return;
    void crit;
    void srcX;
    void srcY;
    e.flash = 1;
    e.hp -= amount;
    if (e.hp > 0) return;
    if (e.isBoss) {
      e.hp = Math.max(0, e.hp);
      return; // boss death sequence belongs to the boss system
    }
    this.kill(e);
  }

  private kill(e: Enemy): void {
    const ctx = this.ctx;
    ctx.addScore(e.score);
    ctx.spawnXp(e.x, e.y, e.xp);
    ctx.stats.kills++;
    if (e.kind === "rock") ctx.stats.rocksKilled++;

    if (e.kind === "rock" && e.variant === "explosive") {
      ctx.aoeDamage(e.x, e.y, EXPLOSIVE_RADIUS, 22 * this.dmgScale, e.color);
      ctx.burst(e.x, e.y, e.accent, 26, { speed: 260, life: 0.6, kind: "debris" });
      ctx.sfxAt("explosion", e.x, e.y);
    }

    const childSize = this.splitSize(e);
    if (childSize) {
      for (let i = 0; i < 2; i++) {
        const child = this.spawnRock(e.variant ?? "normal", childSize, e.x, e.y);
        if (child) {
          const dir = i === 0 ? -1 : 1;
          child.vx = dir * child.speed * 0.9;
          child.vy = child.speed * 0.5;
        }
      }
    }

    this.rollDrop(e);
    this.deathFx(e);
    pools.enemies.release(e);
  }

  private splitSize(e: Enemy): Size3 | null {
    if (e.kind !== "rock") return null;
    if (e.size === "large") return "medium";
    if (e.size === "medium") return "small";
    return null;
  }

  private deathFx(e: Enemy): void {
    const ctx = this.ctx;
    const big =
      e.kind === "shooter" ||
      (e.size === "large" && (e.kind === "rock" || e.kind === "smasher"));
    const count = e.kind === "smasher" ? 30 : e.size === "large" ? 26 : e.size === "medium" ? 16 : 10;
    ctx.burst(e.x, e.y, e.color, count, { speed: 220, life: 0.55, kind: "debris" });
    ctx.burst(e.x, e.y, e.accent, Math.round(count / 2), { speed: 320, life: 0.4, kind: "spark" });
    ctx.shake(big ? 9 : e.size === "large" ? 7 : 3);
    if (big) ctx.hitstop(HITSTOP_BIG_KILL);
    ctx.sfxAt(e.size === "large" || e.kind === "smasher" ? "explosion" : "kill", e.x, e.y);
  }

  private rollDrop(e: Enemy): void {
    const ctx = this.ctx;
    const missing = 1 - clamp(ctx.player.hull / Math.max(1, ctx.player.hullMax), 0, 1);
    if (this.sinceRepair >= PITY_REPAIR_MIN_GAP) {
      const chance = 0.04 + missing * 0.12 + clamp(this.sinceRepair / 60, 0, 1) * 0.1;
      if (ctx.rng.chance(chance)) {
        this.dropPickup("repair", e.x, e.y);
        this.sinceRepair = 0;
        this.lastRepairTime = ctx.runTime;
      }
    }
    if (ctx.rng.chance(0.05)) this.dropPickup("shield", e.x, e.y);
  }

  private dropPickup(kind: "repair" | "shield", x: number, y: number): void {
    const pk = pools.pickups.spawn();
    pk.kind = kind;
    pk.x = x;
    pk.y = y;
    pk.vx = 0;
    pk.vy = 0;
    pk.radius = 16;
    pk.value = 20;
    pk.tier = 1;
    pk.age = 0;
    pk.lifetime = 20;
    pk.magnetized = false;
  }

  // ---------------------------------------------------------------- queries
  aoe(x: number, y: number, radius: number, amount: number): number {
    let total = 0;
    for (const e of pools.enemies.all()) {
      if (!e.active || e.hp <= 0) continue;
      const rr = radius + e.collisionRadius;
      if (dist2(x, y, e.x, e.y) > rr * rr) continue;
      const before = e.hp;
      this.damage(e, amount, false, x, y);
      total += Math.min(amount, before);
    }
    return total;
  }

  shooterCount(): number {
    let n = 0;
    for (const e of pools.enemies.all()) if (e.active && e.kind === "shooter") n++;
    return n;
  }

  hostileCount(): number {
    let n = 0;
    for (const e of pools.enemies.all()) if (e.active && !e.isBoss) n++;
    return n;
  }

  crackStragglers(): void {
    const ctx = this.ctx;
    for (const e of pools.enemies.all()) {
      if (!e.active || e.isBoss) continue;
      const orbs = clamp(Math.round(e.xp / 6), 1, 8);
      for (let i = 0; i < orbs; i++) {
        const a = ctx.rng.range(0, TAU);
        const r = ctx.rng.range(6, 26);
        ctx.spawnXp(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.xp / orbs);
      }
      ctx.burst(e.x, e.y, e.color, 8, {
        speed: 160,
        life: 0.4,
        kind: "debris",
        angle: ctx.rng.range(0, TAU),
      });
      pools.enemies.release(e);
    }
  }
}
