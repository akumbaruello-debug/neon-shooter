/**
 * Boss director (#10). Owns the single boss entity's intro, phase transitions,
 * attack-pattern scheduling and death sequence.
 *
 * The enemy system manufactures the shell (`spawnBossShell`) and lets the
 * player's bullets lower its hp; this system reacts to that hp to drive phases
 * and death, and is fully self-sufficient if `onDamaged` is never wired.
 */
import { ENEMY_BULLET, SPAWN_FX_TIME } from "../data/constants";
import { ARENA_H, ARENA_W } from "../data/constants";
import { getBoss } from "../data/bosses";
import { angleDelta, clamp, TAU } from "../core/math";
import { pools, type Enemy, type Telegraph } from "../entities";
import type { GameCtx } from "../ctx";
import type { BossDef } from "../types";
import type { EnemySystem } from "./enemies";

const INTRO_TIME = 4;
const TRANSITION_TIME = 1.5;
const DEATH_TIME = 1.2;
const BOSS_Y = 220;
const FAN_STEP = 0.3; // rad -> >= 156 px gap between neighbours at ~600 px
const HEAVY_GAP = 1.6;
const EXPOSE_TIME = 6;
const HOSTILE_CAP = 14;

/** `bossPhase` is what the HUD reads; keep it in sync with `phase`. */
type BossEnemy = Enemy & { bossPhase?: number };

const DURATION: Record<string, number> = {
  aimed_volley: 3.6,
  fan_sweep: 3.0,
  rock_drop: 2.4,
  double_fan: 3.6,
  spiral: 3.0,
  multilane_charge: 3.2,
  summon_breakers: 2.0,
  wall_slam: 2.6,
  rotating_lasers: 4.0,
  bullet_curtain: 3.6,
  teleport: 1.6,
  mirror_shield: 2.4,
  shield_nodes: 6.0,
  launch_squads: 2.0,
  gravity_pull: 3.0,
  turret_array: 3.6,
};

const HEAVY = new Set([
  "multilane_charge",
  "wall_slam",
  "rotating_lasers",
  "bullet_curtain",
  "gravity_pull",
]);

export class BossSystem {
  private current: Enemy | null = null;

  private introTimer = 0;
  private transitionTimer = 0;
  private transitioning = false;
  private deathTimer = 0;
  private deathIdx = 0;
  private heavyCooldown = 0;
  private exposedTimer = 0;
  /** Seconds spent flying the `movement` path; reset per spawn. */
  private moveTime = 0;

  /** hp snapshot while invulnerable; damage is reverted here. */
  private guardHp = 0;
  private bulletDmg = 10;

  private patternId = "";
  private patternTimer = 0;
  private patternDur = 3;
  private patternCd = 0;
  private patternState = 0;
  private patternIdx = -1;
  private auxInit = false;
  private auxAng = 0;
  private auxTimer = 0;
  private auxSpeed = 0;
  private beamCount = 2;

  private readonly laneXs: number[] = [];
  private readonly nodeRefs: Enemy[] = [];
  private readonly laserRefs: Telegraph[] = [];

  constructor(
    private ctx: GameCtx,
    private enemies: EnemySystem,
  ) {}

  // ------------------------------------------------------------------ public

  reset(): void {
    this.releaseCurrent();
    this.introTimer = 0;
    this.transitionTimer = 0;
    this.transitioning = false;
    this.deathTimer = 0;
    this.deathIdx = 0;
    this.heavyCooldown = 0;
    this.exposedTimer = 0;
    this.moveTime = 0;
    this.patternId = "";
    this.patternTimer = 0;
    this.patternIdx = -1;
    this.nodeRefs.length = 0;
    this.laserRefs.length = 0;
    this.laneXs.length = 0;
  }

  spawn(stage: number): Enemy | null {
    const def = getBoss(stage);
    if (!def) return null;
    this.releaseCurrent();

    const e = this.enemies.spawnBossShell(def);
    const scale = Math.pow(1.15, this.ctx.tier);
    e.hpMax = Math.round(def.hp * scale);
    e.hp = e.hpMax;
    e.x = ARENA_W / 2;
    e.y = BOSS_Y;
    e.isBoss = true;
    e.bossDef = def;
    e.phase = 1;
    (e as BossEnemy).bossPhase = 1;
    e.nodes = 0;
    e.enrage = false;
    e.invuln = true;
    e.damage = 24 * (1 + 0.08 * this.ctx.tier);

    this.current = e;
    this.bulletDmg = 8 + this.ctx.tier * 1.4;
    this.introTimer = INTRO_TIME;
    this.transitioning = false;
    this.transitionTimer = 0;
    this.deathTimer = 0;
    this.deathIdx = 0;
    this.heavyCooldown = 0;
    this.exposedTimer = 0;
    this.moveTime = 0;
    this.patternId = "";
    this.patternTimer = 0;
    this.patternIdx = this.phaseStartIdx(1, def.phases, def.patterns.length) - 1;
    this.guardHp = e.hp;
    this.nodeRefs.length = 0;
    this.laserRefs.length = 0;

    this.ctx.sfxAt("boss_warn", e.x, e.y);
    this.ctx.burst(e.x, e.y, def.accent, 50, { speed: 320, life: 0.9, kind: "ring" });
    this.ctx.shake(8);
    return e;
  }

  get boss(): Enemy | null {
    return this.current;
  }

  get active(): boolean {
    return this.current !== null && this.current.active;
  }

  get introTime(): number {
    return Math.max(0, this.introTimer);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const b = this.current;
    if (!b || !b.active) {
      this.current = null;
      return;
    }
    // Bosses are skipped by EnemySystem.update, so their render-only timers
    // must tick here or the sprite stays stuck at spawn-in alpha (near-black).
    if (b.spawnFx > 0) b.spawnFx = Math.max(0, b.spawnFx - dt / SPAWN_FX_TIME);
    if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4);
    if (this.deathTimer > 0) {
      this.stepDeath(dt);
      return;
    }

    // Enforce invulnerability even if the caller bypassed it.
    if (b.invuln && b.hp < this.guardHp) b.hp = this.guardHp;

    if (this.introTimer > 0) {
      this.introTimer -= dt;
      if (this.introTimer <= 0) {
        this.clearInvuln();
        this.selectPattern();
      }
      return;
    }

    if (this.transitioning) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this.transitioning = false;
        this.clearInvuln();
        this.selectPattern();
      }
      return;
    }

    this.checkPhase();
    if (this.transitioning || this.deathTimer > 0) return;

    if (this.heavyCooldown > 0) this.heavyCooldown -= dt;
    if (this.exposedTimer > 0) this.exposedTimer -= dt;
    this.trackNodes();
    this.stepMovement(dt);

    this.patternTimer -= dt;
    this.stepPattern(dt);
    if (this.patternTimer <= 0) this.selectPattern();
  }

  /** Notification from collisions that damage landed (hp is already reduced). */
  onDamaged(e: Enemy, damage: number): void {
    const b = this.current;
    if (!b || e !== b || !b.active || damage <= 0 || this.deathTimer > 0) return;
    if (b.invuln) {
      if (b.hp < this.guardHp) b.hp = this.guardHp;
      b.flash = 1;
      return;
    }
    this.checkPhase();
  }

  /**
   * Continuous flight path for bosses with a `movement` mode (only the final
   * boss uses one; everyone else defaults to "static" and never moves). Called
   * only in the active pattern phase — intro/transition/death all return before
   * this — so it writes nothing but x/y. Smooth, deterministic sin/cos so it
   * never teleports, and clamped to a safe band clear of the arena edges.
   *
   * ponytail: pattern attacks read b.x/b.y live, so they track the boss for
   * free; add a speed knob here only if the path ever feels too fast.
   */
  private stepMovement(dt: number): void {
    const b = this.current;
    const mode = b?.bossDef?.movement ?? "static";
    if (!b || mode === "static") return;

    this.moveTime += dt;
    const t = this.moveTime;

    // Safe band: inside the walls by a fixed margin, and in the upper playfield.
    const minX = b.radius + 80;
    const maxX = ARENA_W - b.radius - 80;
    const minY = Math.max(140, b.radius);
    const maxY = Math.min(ARENA_H * 0.42, ARENA_H - b.radius);
    const cx = (minX + maxX) / 2;
    const ax = Math.max(0, (maxX - minX) / 2);
    const cy = (minY + maxY) / 2;
    const ay = Math.max(0, (maxY - minY) / 2);

    let x = cx;
    let y = cy;
    switch (mode) {
      case "strafe":
        x = cx + ax * Math.sin(t * 0.9);
        break;
      case "orbit":
        x = cx + ax * Math.cos(t * 0.8);
        y = cy + ay * Math.sin(t * 0.8);
        break;
      case "figure8":
        x = cx + ax * Math.sin(t * 0.8);
        y = cy + ay * Math.sin(t * 1.6);
        break;
      default:
        return;
    }
    b.x = clamp(x, minX, maxX);
    b.y = clamp(y, minY, maxY);
  }

  // ------------------------------------------------------------- lifecycle

  private checkPhase(): void {
    const b = this.current;
    if (!b) return;
    if (b.hp <= 0) {
      this.beginDeath();
      return;
    }
    if (this.introTimer > 0 || this.transitioning) return;
    const def = b.bossDef;
    if (!def) return;

    const frac = b.hp / Math.max(1, b.hpMax);
    if (!b.enrage && def.enragePatterns && def.enragePatterns.length > 0 && frac < 0.25) {
      b.enrage = true;
      this.ctx.toast("ENRAGE", 0xff2a2a);
      this.ctx.shake(10);
      this.ctx.burst(b.x, b.y, 0xff2a2a, 40, { speed: 420, life: 0.7, kind: "ring" });
    }

    const next = this.phaseFor(frac, def.phases);
    if (next > b.phase) this.beginTransition(next);
  }

  private beginTransition(nextPhase: number): void {
    const b = this.current;
    if (!b) return;
    const def = b.bossDef;
    this.endPattern();
    b.phase = nextPhase;
    (b as BossEnemy).bossPhase = nextPhase;
    this.transitioning = true;
    this.transitionTimer = TRANSITION_TIME;
    this.setInvuln();
    this.patternId = "";
    this.patternTimer = 0;
    if (def) this.patternIdx = this.phaseStartIdx(nextPhase, def.phases, def.patterns.length) - 1;

    this.clearBullets();
    this.ctx.burst(b.x, b.y, b.accent, 60, { speed: 460, life: 0.9, kind: "ring" });
    this.ctx.shake(14);
    this.ctx.sfxAt("boss_warn", b.x, b.y);
  }

  private beginDeath(): void {
    const b = this.current;
    if (!b || this.deathTimer > 0) return;
    this.deathTimer = DEATH_TIME;
    this.deathIdx = 0;
    this.setInvuln();
    this.releaseNodes();
    this.patternId = "";
    this.ctx.slowmo(1.2, 0.25);
    this.ctx.hitstop(0.12);
    this.ctx.shake(20);
    this.ctx.sfxAt("explosion", b.x, b.y);
  }

  private stepDeath(dt: number): void {
    const b = this.current;
    if (!b) {
      this.deathTimer = 0;
      return;
    }
    this.deathTimer -= dt;
    const per = DEATH_TIME / 8;
    const target = Math.min(8, Math.floor((DEATH_TIME - this.deathTimer) / per) + 1);
    while (this.deathIdx < target) {
      this.deathIdx++;
      const a = this.ctx.rng.range(0, TAU);
      const r = this.ctx.rng.range(0, b.radius * 0.9);
      this.ctx.burst(
        b.x + Math.cos(a) * r,
        b.y + Math.sin(a) * r,
        this.deathIdx % 2 === 0 ? b.accent : b.color,
        22,
        { speed: 360, life: 0.6, kind: "debris" },
      );
      this.ctx.shake(6);
    }
    if (this.deathTimer <= 0) this.finishDeath(b);
  }

  private finishDeath(b: Enemy): void {
    for (let i = 0; i < 12; i++) {
      const a = this.ctx.rng.range(0, TAU);
      const r = this.ctx.rng.range(0, b.radius);
      this.ctx.spawnXp(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 22);
    }
    this.ctx.burst(b.x, b.y, b.accent, 80, { speed: 620, life: 1.0, kind: "glow" });
    if (b.bossDef) this.ctx.addScore(Math.round(b.bossDef.hp * 0.5));
    pools.enemies.release(b);
    this.current = null;
    this.deathTimer = 0;
    this.patternId = "";
    this.nodeRefs.length = 0;
  }

  // -------------------------------------------------------------- invuln

  private setInvuln(): void {
    const b = this.current;
    if (!b) return;
    b.invuln = true;
    this.guardHp = b.hp;
  }

  private clearInvuln(): void {
    const b = this.current;
    if (b && b.nodes <= 0) b.invuln = false;
  }

  // ------------------------------------------------------------ scheduling

  /** Phase p+1 begins once hp/hpMax < (phases - p) / phases. */
  private phaseFor(frac: number, phases: number): number {
    let p = 1;
    while (p < phases && frac < (phases - p) / phases) p++;
    return p;
  }

  private phaseStartIdx(phase: number, phases: number, len: number): number {
    if (len <= 0) return 0;
    return Math.min(len - 1, Math.floor(((phase - 1) / Math.max(1, phases)) * len));
  }

  private poolFor(b: Enemy, def: BossDef): string[] {
    if (b.enrage && def.enragePatterns && def.enragePatterns.length > 0) {
      const p = def.enragePatterns.slice();
      if (!p.includes("spiral")) p.push("spiral");
      return p;
    }
    return def.patterns;
  }

  private patternAllowed(id: string, phase: number): boolean {
    if (id === "double_fan") return phase >= 2;
    return true;
  }

  private selectPattern(): void {
    const b = this.current;
    if (!b) return;
    this.endPattern();
    const def = b.bossDef;
    if (!def) return;
    const pool = this.poolFor(b, def);
    const len = pool.length;
    if (len === 0) return;

    let id = "";
    for (let i = 0; i < len; i++) {
      this.patternIdx = (((this.patternIdx + 1) % len) + len) % len;
      const cand = pool[this.patternIdx] ?? "";
      if (!cand) continue;
      if (!this.patternAllowed(cand, b.phase)) continue;
      if (HEAVY.has(cand) && this.heavyCooldown > 0) continue;
      id = cand;
      break;
    }
    if (!id) {
      this.patternIdx = (((this.patternIdx + 1) % len) + len) % len;
      id = pool[this.patternIdx] ?? "";
    }
    if (id) this.startPattern(id);
  }

  private startPattern(id: string): void {
    const b = this.current;
    if (!b) return;
    this.patternId = id;
    this.patternState = 0;
    this.patternCd = 0;
    this.auxInit = false;
    this.auxAng = 0;
    this.auxTimer = 0;
    this.auxSpeed = 0;
    this.beamCount = 2;
    this.laneXs.length = 0;
    this.laserRefs.length = 0;

    let dur = DURATION[id] ?? 3;
    if (b.enrage) dur *= 0.72;
    this.patternDur = dur;
    this.patternTimer = dur;
    if (HEAVY.has(id)) this.heavyCooldown = HEAVY_GAP;
  }

  private endPattern(): void {
    switch (this.patternId) {
      case "mirror_shield":
      case "teleport":
        this.clearInvuln();
        break;
      case "shield_nodes":
        this.releaseNodes();
        this.clearInvuln();
        break;
      default:
        break;
    }
    this.laserRefs.length = 0;
    this.laneXs.length = 0;
  }

  // --------------------------------------------------------------- patterns

  private stepPattern(dt: number): void {
    const b = this.current;
    if (!b) return;
    switch (this.patternId) {
      case "aimed_volley":
        this.pAimedVolley(b, dt);
        break;
      case "fan_sweep":
        this.pFanSweep(b, dt);
        break;
      case "rock_drop":
        this.pRockDrop(b, dt);
        break;
      case "double_fan":
        this.pDoubleFan(b, dt);
        break;
      case "spiral":
        this.pSpiral(b, dt);
        break;
      case "multilane_charge":
        this.pMultilane(b, dt);
        break;
      case "summon_breakers":
        this.pSummonBreakers(b, dt);
        break;
      case "wall_slam":
        this.pWallSlam(b, dt);
        break;
      case "rotating_lasers":
        this.pRotatingLasers(b, dt);
        break;
      case "bullet_curtain":
        this.pBulletCurtain(b, dt);
        break;
      case "teleport":
        this.pTeleport(b, dt);
        break;
      case "mirror_shield":
        this.pMirrorShield(b, dt);
        break;
      case "shield_nodes":
        this.pShieldNodes(b, dt);
        break;
      case "launch_squads":
        this.pLaunchSquads(b, dt);
        break;
      case "gravity_pull":
        this.pGravityPull(b, dt);
        break;
      case "turret_array":
        this.pTurretArray(b, dt);
        break;
      default:
        break;
    }
  }

  private pAimedVolley(b: Enemy, dt: number): void {
    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 1.8;
    const a = this.aimAngle(b);
    for (let i = -1; i <= 1; i++) this.shoot(b.x, b.y, a + i * 0.13, 430, 11);
    this.ctx.sfxAt("warn_beep", b.x, b.y, { volume: 0.35 });
  }

  private pFanSweep(b: Enemy, dt: number): void {
    this.patternCd -= dt;
    const prog = clamp(1 - this.patternTimer / this.patternDur, 0, 1);
    const center = 2.44 + (0.7 - 2.44) * prog;
    if (this.patternCd > 0) return;
    this.patternCd += 0.42;
    const n = b.enrage ? 11 : Math.min(11, 7 + (b.phase - 1) * 2);
    this.fireFan(b, center, n, FAN_STEP, 360, 10);
  }

  private pRockDrop(b: Enemy, dt: number): void {
    this.patternCd -= dt;
    if (this.patternCd > 0 || this.patternTimer <= 0) return;
    this.patternCd = 999;
    if (this.enemies.hostileCount() >= HOSTILE_CAP) return;
    const n = this.ctx.rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const x = clamp(b.x + (i - (n - 1) / 2) * 260 + this.ctx.rng.range(-40, 40), 80, ARENA_W - 80);
      const variant = this.ctx.rng.chance(0.25) ? "metal" : "normal";
      this.enemies.spawnRock(variant, "small", x, 80);
      this.ctx.burst(x, 80, ENEMY_BULLET.body, 8, { speed: 120, life: 0.4 });
    }
    this.ctx.sfxAt("warn_beep", b.x, b.y, { volume: 0.5 });
  }

  private pDoubleFan(b: Enemy, dt: number): void {
    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 0.7;
    const a = this.aimAngle(b);
    this.fireFan(b, a - 1.2, 7, 0.34, 340, 10);
    this.fireFan(b, a + 1.2, 7, 0.34, 340, 10);
  }

  private pSpiral(b: Enemy, dt: number): void {
    this.auxAng += 1.7 * dt;
    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 0.5;
    this.shoot(b.x, b.y, this.auxAng, 320, 9);
    this.shoot(b.x, b.y, this.auxAng + Math.PI, 320, 9);
  }

  private pMultilane(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.pickLanes(b);
      for (const lx of this.laneXs) this.addLine(lx, b.y, lx, ARENA_H, 26, 0.9, 0xff2a2a);
      this.auxTimer = 0.9;
      this.patternCd = 0;
      this.ctx.sfxAt("warn_beep", b.x, b.y);
    }
    if (this.patternState === 0) {
      this.auxTimer -= dt;
      if (this.auxTimer <= 0) {
        this.patternState = 1;
        this.auxTimer = 0.5;
        this.patternCd = 0;
        this.ctx.shake(8);
      }
      return;
    }
    this.auxTimer -= dt;
    if (this.auxTimer <= 0) return;
    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 0.1;
    for (const lx of this.laneXs) this.shoot(lx, b.y, Math.PI / 2, 780, 12, 4);
  }

  private pSummonBreakers(b: Enemy, _dt: number): void {
    if (this.auxInit) return;
    this.auxInit = true;
    if (this.enemies.hostileCount() >= HOSTILE_CAP) return;
    this.enemies.spawnSmasher("small", b.x - 140, b.y + 130);
    this.enemies.spawnSmasher("small", b.x + 140, b.y + 130);
    this.ctx.burst(b.x, b.y + 130, b.accent, 20, { speed: 220, life: 0.5, kind: "glow" });
    this.ctx.sfxAt("warn_beep", b.x, b.y);
  }

  private pWallSlam(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.addCircle(b.x, b.y, b.radius + 130, 0.8, 0xff2a2a);
      this.auxTimer = 0.8;
      this.patternState = 0;
    }
    if (this.patternState !== 0) return;
    this.auxTimer -= dt;
    if (this.auxTimer > 0) return;
    this.patternState = 1;
    this.slamRing(b);
  }

  private pRotatingLasers(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.beamCount = Math.min(4, 2 + (b.phase >= 2 ? 1 : 0) + (b.enrage ? 1 : 0));
      this.auxAng = this.ctx.rng.range(0, TAU);
      this.patternState = 0;
      this.auxTimer = 0.85;
      this.spawnBeamTelegraphs(b);
    }

    if (this.patternState === 0) {
      this.auxAng += 0.45 * dt;
      this.updateBeamTelegraphs(b, this.auxTimer);
      this.auxTimer -= dt;
      if (this.auxTimer <= 0) {
        this.patternState = 1;
        this.auxTimer = 0.3;
        this.patternCd = 0;
        this.releaseBeamTelegraphs();
      }
      return;
    }

    this.auxAng += 0.45 * dt;
    this.patternCd -= dt;
    if (this.patternCd <= 0) {
      this.patternCd += 0.06;
      for (let k = 0; k < this.beamCount; k++) {
        this.shoot(b.x, b.y, this.auxAng + (k * TAU) / this.beamCount, 820, 10, 3);
      }
    }
    this.auxTimer -= dt;
    if (this.auxTimer <= 0 && this.patternTimer > 1.4) {
      this.patternState = 0;
      this.auxTimer = 0.85;
      this.auxAng += 0.5;
      this.spawnBeamTelegraphs(b);
    }
  }

  private pBulletCurtain(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.addLine(0, b.y + 70, ARENA_W, b.y + 70, 22, 0.8, 0xff2a2a);
      this.auxTimer = 0.8;
      this.patternState = 0;
      this.auxAng = this.ctx.rng.range(400, ARENA_W - 400);
      this.auxSpeed = this.ctx.rng.chance(0.5) ? 1 : -1;
      this.patternCd = 0;
    }
    if (this.patternState === 0) {
      this.auxTimer -= dt;
      if (this.auxTimer <= 0) this.patternState = 1;
      return;
    }

    this.auxAng += this.auxSpeed * 260 * dt;
    if (this.auxAng < 220) {
      this.auxAng = 220;
      this.auxSpeed = Math.abs(this.auxSpeed);
    } else if (this.auxAng > ARENA_W - 220) {
      this.auxAng = ARENA_W - 220;
      this.auxSpeed = -Math.abs(this.auxSpeed);
    }

    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 0.45;
    const y = b.y + 90;
    const gapHalf = 120;
    for (let x = 80; x <= ARENA_W - 80; x += 230) {
      if (Math.abs(x - this.auxAng) < gapHalf) continue;
      this.shoot(x, y, Math.PI / 2, 260, 11);
    }
    this.ctx.sfxAt("warn_beep", this.auxAng, y, { volume: 0.25 });
  }

  private pTeleport(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.ctx.burst(b.x, b.y, b.accent, 30, { speed: 300, life: 0.5, kind: "glow" });
      b.x = clamp(this.ctx.rng.range(300, ARENA_W - 300), b.radius, ARENA_W - b.radius);
      b.y = clamp(this.ctx.rng.range(160, 460), b.radius, ARENA_H * 0.5);
      this.ctx.burst(b.x, b.y, b.accent, 30, { speed: 300, life: 0.5, kind: "glow" });
      this.setInvuln();
      this.auxTimer = 0.35;
      this.ctx.sfxAt("dash", b.x, b.y);
    }
    if (this.auxTimer > 0) {
      this.auxTimer -= dt;
      if (this.auxTimer <= 0) this.clearInvuln();
    }
    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 0.7;
    this.fireAimed(b, 3, 0.14, 400, 11);
  }

  private pMirrorShield(b: Enemy, _dt: number): void {
    if (this.auxInit) return;
    this.auxInit = true;
    this.setInvuln();
    this.auxTimer = 2.0;
    this.addCircle(b.x, b.y, b.radius + 70, 2.0, 0x9b6bff);
    this.ctx.burst(b.x, b.y, 0x9b6bff, 36, { speed: 260, life: 0.7, kind: "glow" });
    this.ctx.sfxAt("shield_up", b.x, b.y);
  }

  private pShieldNodes(b: Enemy, _dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.spawnNodes(b);
    }
    this.trackNodes();
    if (b.nodes <= 0) {
      this.exposedTimer = EXPOSE_TIME;
      this.clearInvuln();
      this.ctx.toast("CORE EXPOSED", 0x8dff9f);
      this.ctx.sfxAt("shield_break", b.x, b.y);
      this.patternTimer = 0.05;
    }
  }

  private pLaunchSquads(b: Enemy, _dt: number): void {
    if (this.auxInit) return;
    this.auxInit = true;
    if (this.enemies.hostileCount() >= HOSTILE_CAP) return;
    this.enemies.spawnShooter(b.x - 260, b.y + 120);
    this.enemies.spawnShooter(b.x + 260, b.y + 120);
    this.enemies.spawnSmasher("small", b.x, b.y + 180);
    this.ctx.sfxAt("warn_beep", b.x, b.y);
  }

  private pGravityPull(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.addCircle(b.x, b.y, 320, 0.8, 0x9b6bff);
      this.auxTimer = 0.8;
      this.patternState = 0;
    }
    if (this.patternState === 0) {
      this.auxTimer -= dt;
      if (this.auxTimer <= 0) {
        this.patternState = 1;
        this.auxTimer = 0.9;
      }
      return;
    }
    const p = this.ctx.player;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const m = Math.hypot(dx, dy) || 1;
    p.vx += (dx / m) * 700 * dt;
    p.vy += (dy / m) * 700 * dt;
    this.auxTimer -= dt;
  }

  private pTurretArray(b: Enemy, dt: number): void {
    if (!this.auxInit) {
      this.auxInit = true;
      this.patternCd = 0.3;
    }
    this.patternCd -= dt;
    if (this.patternCd > 0) return;
    this.patternCd += 0.9;
    const r = b.radius + 30;
    const p = this.ctx.player;
    const turret = [-2.3, -0.8, 0.8, 2.3];
    for (const t of turret) {
      const tx = b.x + Math.cos(t) * r;
      const ty = b.y + Math.sin(t) * r;
      const a = Math.atan2(p.y - ty, p.x - tx);
      this.shoot(tx, ty, a, 380, 10, 5);
    }
  }

  // ---------------------------------------------------------------- nodes

  private spawnNodes(b: Enemy): void {
    if (this.nodeRefs.length > 0) return;
    const y = b.y + 150;
    const xs = [b.x - 220, b.x, b.x + 220];
    for (const x of xs) {
      const e = this.enemies.spawnRock("metal", "small", clamp(x, 80, ARENA_W - 80), y);
      if (e) this.nodeRefs.push(e);
    }
    b.nodes = this.nodeRefs.length;
    this.setInvuln();
    this.ctx.burst(b.x, y, b.accent, 24, { speed: 220, life: 0.6, kind: "glow" });
  }

  private trackNodes(): void {
    const b = this.current;
    if (!b || this.nodeRefs.length === 0) return;
    let n = 0;
    for (const e of this.nodeRefs) if (e.active && e.hp > 0) n++;
    b.nodes = n;
    if (n <= 0) this.nodeRefs.length = 0;
  }

  private releaseNodes(): void {
    for (const e of this.nodeRefs) if (e.active) pools.enemies.release(e);
    this.nodeRefs.length = 0;
    const b = this.current;
    if (b) b.nodes = 0;
  }

  // -------------------------------------------------------------- geometry

  private pickLanes(b: Enemy): void {
    this.laneXs.length = 0;
    const offs = [-560, -280, 0, 280, 560];
    this.ctx.rng.shuffle(offs);
    for (let i = 0; i < 3; i++) {
      const o = offs[i] ?? 0;
      this.laneXs.push(clamp(b.x + o + this.ctx.rng.range(-30, 30), 120, ARENA_W - 120));
    }
    this.laneXs.sort((a, c) => a - c);
  }

  private slamRing(b: Enemy): void {
    this.ctx.burst(b.x, b.y, b.accent, 40, { speed: 420, life: 0.6, kind: "ring" });
    this.ctx.shake(10);
    const count = 20;
    const gapArc = 0.7;
    const gapCenter = this.ctx.rng.range(0, TAU);
    const step = TAU / count;
    for (let i = 0; i < count; i++) {
      const a = i * step;
      if (Math.abs(angleDelta(a, gapCenter)) < gapArc / 2) continue;
      const x = b.x + Math.cos(a) * b.radius;
      const y = b.y + Math.sin(a) * b.radius;
      this.shoot(x, y, a, 300, 11);
    }
  }

  private spawnBeamTelegraphs(b: Enemy): void {
    this.releaseBeamTelegraphs();
    const len = ARENA_W + ARENA_H;
    for (let k = 0; k < this.beamCount; k++) {
      const a = this.auxAng + (k * TAU) / this.beamCount;
      this.laserRefs.push(
        this.addLine(b.x, b.y, b.x + Math.cos(a) * len, b.y + Math.sin(a) * len, 14, 0.9, 0xff2a2a),
      );
    }
  }

  private updateBeamTelegraphs(b: Enemy, remaining: number): void {
    const len = ARENA_W + ARENA_H;
    for (let k = 0; k < this.laserRefs.length; k++) {
      const t = this.laserRefs[k];
      if (!t || !t.active) continue;
      const a = this.auxAng + (k * TAU) / this.beamCount;
      t.x = b.x;
      t.y = b.y;
      t.x2 = b.x + Math.cos(a) * len;
      t.y2 = b.y + Math.sin(a) * len;
      t.timer = Math.max(0.05, remaining + 0.05);
      t.duration = 0.9;
    }
  }

  private releaseBeamTelegraphs(): void {
    for (const t of this.laserRefs) if (t.active) pools.telegraphs.release(t);
    this.laserRefs.length = 0;
  }

  // --------------------------------------------------------------- helpers

  private aimAngle(b: Enemy): number {
    const p = this.ctx.player;
    return Math.atan2(p.y - b.y, p.x - b.x);
  }

  private shoot(x: number, y: number, angle: number, speed: number, radius: number, life = 6): void {
    this.ctx.spawnEnemyBullet({
      x,
      y,
      angle,
      speed,
      radius,
      damage: this.bulletDmg,
      color: ENEMY_BULLET.body,
      accent: ENEMY_BULLET.core,
      lifetime: life,
    });
  }

  private fireAimed(b: Enemy, n: number, spread: number, speed: number, radius: number): void {
    const a = this.aimAngle(b);
    const start = a - (spread * (n - 1)) / 2;
    for (let i = 0; i < n; i++) this.shoot(b.x, b.y, start + i * spread, speed, radius);
  }

  private fireFan(b: Enemy, center: number, n: number, step: number, speed: number, radius: number): void {
    const start = center - ((n - 1) * step) / 2;
    for (let i = 0; i < n; i++) this.shoot(b.x, b.y, start + i * step, speed, radius);
  }

  private addLine(
    x: number,
    y: number,
    x2: number,
    y2: number,
    width: number,
    duration: number,
    color: number,
  ): Telegraph {
    const t = pools.telegraphs.spawn();
    t.kind = "line";
    t.x = x;
    t.y = y;
    t.x2 = x2;
    t.y2 = y2;
    t.radius = 0;
    t.width = width;
    t.timer = duration;
    t.duration = duration;
    t.color = color;
    return t;
  }

  private addCircle(x: number, y: number, radius: number, duration: number, color: number): Telegraph {
    const t = pools.telegraphs.spawn();
    t.kind = "circle";
    t.x = x;
    t.y = y;
    t.x2 = x;
    t.y2 = y;
    t.radius = radius;
    t.width = 6;
    t.timer = duration;
    t.duration = duration;
    t.color = color;
    return t;
  }

  // ponytail: full-screen clear on transition — add a radius-limited "safe ring"
  // only if transitions start feeling too generous.
  private clearBullets(): void {
    for (const b of pools.enemyBullets.all()) if (b.active) pools.enemyBullets.release(b);
  }

  private releaseCurrent(): void {
    this.releaseNodes();
    const b = this.current;
    if (b) {
      if (b.active) pools.enemies.release(b);
      this.current = null;
    }
  }
}