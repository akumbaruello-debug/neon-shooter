/**
 * Stage / wave director. Turns a StageDef's wave plan into timed spawns on the
 * arena edges, scales the QUANTITY by tier, caps concurrent shooters (queueing
 * the overflow) and decides when a stage is cleared.
 *
 * HP / damage / speed scaling is the enemy system's job — this file only says
 * "put a rock_ice_small here at t=12.4".
 */
import {
  ARENA_H,
  ARENA_W,
  MIN_SPAWN_DIST_FROM_PLAYER,
  SHOOTER_BASE_CAP,
  SHOOTER_CAP_EVERY,
  SHOOTER_HARD_CAP,
} from "../data/constants";
import { getStage } from "../data/stages";
import type { GameCtx } from "../ctx";
import type { Size3 } from "../entities";
import type { RockVariant, StageDef } from "../types";
import type { EnemySystem } from "./enemies";
import { clamp } from "../core/math";

type SpawnKind = "rock" | "shooter" | "smasher";

interface SpawnEvent {
  t: number;
  kind: SpawnKind;
  variant: RockVariant;
  size: Size3;
  x: number;
  y: number;
}

/** Gap between queued shooters being released once a slot frees up. */
const SHOOTER_RELEASE_DELAY = 0.4;
/** Seconds of overtime before stragglers are cracked. */
const OVERTIME_LIMIT = 20;
/** Top-edge spawn line and edge margin. */
const SPAWN_Y = -60;
const EDGE_MARGIN = 150;
/** Half-width of the smasher "safe corridor" (no lines spawned inside it). */
const CORRIDOR_HALF = 170;

function resolveId(id: string): { kind: SpawnKind; variant: RockVariant; size: Size3 } {
  if (id === "raider") return { kind: "shooter", variant: "normal", size: "small" };
  const parts = id.split("_");
  const size = (parts[parts.length - 1] ?? "small") as Size3;
  if (parts[0] === "breaker") return { kind: "smasher", variant: "normal", size };
  return { kind: "rock", variant: (parts[1] ?? "normal") as RockVariant, size };
}

export class StageDirector {
  private stageNum = 0;
  private isBoss = false;
  private events: SpawnEvent[] = [];
  private cursor = 0;
  private pending: SpawnEvent[] = [];
  private pendingHead = 0;
  private releaseTimer = 0;
  private elapsed = 0;
  private overtimeSec = 0;
  private expectedDuration = 1;
  private spawnedCount = 0;
  private totalPlanned = 0;
  private overtimeCracked = false;
  private doneFlag = false;
  private corridorX = ARENA_W / 2;

  constructor(
    private readonly ctx: GameCtx,
    private readonly enemies: EnemySystem,
  ) {}

  /** Begin a stage; boss stages just wait for the boss director. */
  start(stage: number): void {
    this.reset();
    this.stageNum = stage;
    const def = getStage(stage);
    if (def.isBoss) {
      this.isBoss = true;
      this.doneFlag = true; // boss system owns the stage now
      return;
    }
    this.build(def);
  }

  update(dt: number): void {
    if (this.isBoss || this.doneFlag) return;

    this.elapsed += dt;

    // Dispatch every scheduled wave event whose time has arrived.
    while (this.cursor < this.events.length && this.events[this.cursor]!.t <= this.elapsed) {
      const e = this.events[this.cursor]!;
      this.cursor++;
      this.dispatch(e);
    }

    // Trickle queued shooters out as live slots free up.
    if (this.releaseTimer > 0) this.releaseTimer -= dt;
    const cap = this.shooterCap();
    while (
      this.pendingHead < this.pending.length &&
      this.enemies.shooterCount() < cap &&
      this.releaseTimer <= 0
    ) {
      const e = this.pending[this.pendingHead]!;
      this.pendingHead++;
      this.spawnEvent(e);
      this.releaseTimer = SHOOTER_RELEASE_DELAY;
    }

    const planDone = this.cursor >= this.events.length && this.pendingHead >= this.pending.length;
    if (planDone) {
      if (this.enemies.hostileCount() === 0) {
        this.doneFlag = true;
      } else {
        this.overtimeSec += dt;
        if (this.overtimeSec >= OVERTIME_LIMIT && !this.overtimeCracked) {
          this.overtimeCracked = true;
          this.enemies.crackStragglers();
          this.doneFlag = true;
        }
      }
    }
  }

  get stage(): number {
    return this.stageNum;
  }

  /** Budget spent AND no live hostiles (or overtime cracked them). */
  get done(): boolean {
    return this.doneFlag;
  }

  /** 0..1 HUD bar: blend of time-through-stage and cleared budget. */
  get progress(): number {
    if (this.totalPlanned === 0) return this.doneFlag ? 1 : 0;
    const timeFrac = clamp(this.elapsed / this.expectedDuration, 0, 1);
    const budgetSpent = clamp(this.spawnedCount / this.totalPlanned, 0, 1);
    const cleared = clamp((this.spawnedCount - this.enemies.hostileCount()) / this.totalPlanned, 0, 1);
    return clamp((timeFrac + (budgetSpent + cleared) / 2) / 2, 0, 1);
  }

  /** Extra seconds elapsed after the wave plan finished with hostiles alive. */
  get overtime(): number {
    return this.overtimeSec;
  }

  reset(): void {
    this.stageNum = 0;
    this.isBoss = false;
    this.events = [];
    this.cursor = 0;
    this.pending = [];
    this.pendingHead = 0;
    this.releaseTimer = 0;
    this.elapsed = 0;
    this.overtimeSec = 0;
    this.expectedDuration = 1;
    this.spawnedCount = 0;
    this.totalPlanned = 0;
    this.overtimeCracked = false;
    this.doneFlag = false;
    this.corridorX = ARENA_W / 2;
  }

  // ---------------------------------------------------------------- planning

  private build(def: StageDef): void {
    const rng = this.ctx.rng;
    const mult = 1.1 ** def.tier;
    this.expectedDuration = (def.targetSeconds[0] + def.targetSeconds[1]) / 2;
    this.corridorX = rng.range(ARENA_W * 0.3, ARENA_W * 0.7);

    const events: SpawnEvent[] = [];
    for (let w = 0; w < def.waves.length; w++) {
      const wave = def.waves[w]!;
      if (wave.kinds.length === 0) continue;
      const lastWave = w === def.waves.length - 1;
      // Meteor showers must end on a burst of rocks raining from the top.
      const burst = wave.burst === true || (def.composition === "meteor_shower" && lastWave);
      const count = Math.max(1, Math.round(wave.count * mult));

      let t = wave.at;
      for (let i = 0; i < count; i++) {
        const req = resolveId(rng.pick(wave.kinds));
        const forSmasher = req.kind === "smasher";
        const p = this.edgePoint(req.kind, forSmasher);
        events.push({ t, kind: req.kind, variant: req.variant, size: req.size, x: p.x, y: p.y });
        if (burst) continue;
        // Smashers get a tight 0.15-0.3s stagger so several never telegraph as a wall.
        t += forSmasher ? rng.range(0.15, 0.3) : wave.spacing;
      }
    }

    events.sort((a, b) => a.t - b.t);
    this.events = events;
    this.totalPlanned = events.length;
  }

  /** Top edge mostly; side edges for variety. Smashers always dive from the top. */
  private edgePoint(kind: SpawnKind, forSmasher: boolean): { x: number; y: number } {
    const rng = this.ctx.rng;
    const sideChance = kind === "shooter" ? 0.4 : 0.12;
    if (!forSmasher && rng.chance(sideChance)) {
      const left = rng.chance(0.5);
      const x = left ? -60 : ARENA_W + 60;
      const y = rng.range(EDGE_MARGIN, ARENA_H - EDGE_MARGIN);
      return this.farFromPlayer(x, y);
    }
    let x = rng.range(EDGE_MARGIN, ARENA_W - EDGE_MARGIN);
    if (forSmasher) x = this.avoidCorridor(x);
    return this.farFromPlayer(x, SPAWN_Y);
  }

  /** Keep smasher lines out of a stage-wide safe corridor. */
  private avoidCorridor(x: number): number {
    const d = x - this.corridorX;
    if (Math.abs(d) < CORRIDOR_HALF) {
      const nx = x + (d >= 0 ? CORRIDOR_HALF : -CORRIDOR_HALF);
      return clamp(nx, EDGE_MARGIN, ARENA_W - EDGE_MARGIN);
    }
    return x;
  }

  /**
   * Nudge a point along its edge so it starts far enough from the player.
   * The enemy system enforces the authoritative MIN_SPAWN_DIST_FROM_PLAYER rule;
   * this just avoids handing it an obviously bad point.
   */
  private farFromPlayer(x: number, y: number): { x: number; y: number } {
    const p = this.ctx.player;
    if (Math.hypot(x - p.x, y - p.y) >= MIN_SPAWN_DIST_FROM_PLAYER) return { x, y };
    const dir = x === p.x ? (this.ctx.rng.chance(0.5) ? 1 : -1) : Math.sign(x - p.x);
    return { x: clamp(x + dir * MIN_SPAWN_DIST_FROM_PLAYER, 60, ARENA_W - 60), y };
  }

  // ---------------------------------------------------------------- spawning

  /** Never exceed the stage's concurrent shooter cap; queue the rest. */
  private shooterCap(): number {
    return Math.max(
      0,
      Math.min(
        SHOOTER_HARD_CAP,
        SHOOTER_BASE_CAP + Math.floor((this.stageNum - 6) / SHOOTER_CAP_EVERY),
      ),
    );
  }

  private dispatch(e: SpawnEvent): void {
    if (e.kind === "shooter" && this.enemies.shooterCount() >= this.shooterCap()) {
      this.pending.push(e); // released later as slots free up, never dropped
      return;
    }
    this.spawnEvent(e);
  }

  private spawnEvent(e: SpawnEvent): void {
    this.spawnedCount++;
    switch (e.kind) {
      case "rock":
        this.enemies.spawnRock(e.variant, e.size, e.x, e.y);
        break;
      case "shooter":
        this.enemies.spawnShooter(e.x, e.y);
        break;
      case "smasher":
        this.enemies.spawnSmasher(e.size, e.x, e.y);
        break;
    }
  }
}
