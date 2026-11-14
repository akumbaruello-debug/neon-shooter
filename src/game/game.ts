/**
 * The Game facade: owns the loop, the input, every system and the run state
 * machine. React talks to this object only — through `events` and `hud`.
 */
import { AudioEngine } from "./audio";
import { Emitter } from "./core/emitter";
import { Input } from "./core/input";
import { GameLoop } from "./core/loop";
import { Rng } from "./core/rng";
import { newRunStats, type CtxBulletOpts, type GameCtx, type ParticleOpts } from "./ctx";
import { pools, resetPools, type ParticleKind } from "./entities";
import { Player } from "./player";
import { Renderer, NullRenderer } from "./render/renderer";
import { save } from "./save";
import {
  ARENA_W,
  ENEMY_BULLET,
  LEVELUP_SLOWMO,
  LEVELUP_SLOWMO_FACTOR,
  MAX_STAGES,
  SECTOR_PALETTES,
  STAGE_CLEAR_HEAL,
  BOSS_CLEAR_HEAL,
} from "./data/constants";
import { getBoss } from "./data/bosses";
import { getStage } from "./data/stages";
import { CollisionSystem } from "./systems/collisions";
import { BossSystem } from "./systems/bosses";
import { EnemySystem } from "./systems/enemies";
import { Progression, sectorOf } from "./systems/progression";
import { StageDirector } from "./systems/spawner";
import { WeaponSystem } from "./systems/weapons";
import { WEAPONS } from "./data/weapons";
import type {
  CardOffer,
  GameOverSummary,
  GamePhase,
  HudState,
  HudSkill,
  Settings,
  WeaponCard,
  WeaponId,
} from "./types";

export interface GameEvents {
  [key: string]: unknown;
  hud: HudState;
  phase: GamePhase;
  cards: { header: string; offers: CardOffer[]; rerolls: number };
  armory: { offers: WeaponCard[]; rerolls: number };
  boons: { offers: CardOffer[] };
  stageBanner: { stage: number; sector: number; title: string };
  threatUp: { tier: number };
  bossIntro: { name: string; title: string; stage: number };
  countdown: { n: number };
  gameover: GameOverSummary;
  victory: GameOverSummary;
  toast: { text: string; color?: number };
  checkpoint: { stage: number };
  hit: { source: string };
}

export interface DebugApi {
  gotoStage(n: number): void;
  setLevel(n: number): void;
  forceLevelUp(): void;
  openArmory(): void;
  killPlayer(): void;
  grantWeapon(id: WeaponId): void;
  grantSkill(id: string): void;
  godMode(v: boolean): void;
  spawnEnemy(defId: string): void;
  spawnBoss(stage: number): void;
  setTimeScale(v: number): void;
  stats(): { fps: number; entities: number; phase: GamePhase };
  spritePng(key: string): string | null;
}

type Mode = GamePhase;

export class Game {
  readonly events = new Emitter<GameEvents>();
  readonly player = new Player();
  readonly input = new Input();
  readonly audio = new AudioEngine();
  readonly rng = new Rng((Date.now() & 0xffff) >>> 0);

  private renderer: Renderer | NullRenderer | null = null;
  private loop!: GameLoop;
  private host: HTMLElement;
  private settings: Settings;

  private enemies!: EnemySystem;
  private weapons!: WeaponSystem;
  private bosses!: BossSystem;
  private director!: StageDirector;
  private collisions!: CollisionSystem;
  private progression!: Progression;
  private ctx!: GameCtx;

  private mode: Mode = "menu";
  private stats = newRunStats();
  private shakeAmt = 0;
  private shakeX = 0;
  private shakeY = 0;
  private hitstopTimer = 0;
  private slowmoTimer = 0;
  private slowmoFactor = 1;
  private debugTimeScale = 1;
  private godMode = false;

  private stage = 1;
  private stageTimer = 0;
  private runTime = 0;
  private bossPhasePending = false;
  private bossDeathTimer = 0;
  private stageTransition = 0;
  private hudTimer = 0;
  private countdownTimer = 0;
  private pendingArmory = false;
  private pendingBoons = false;
  private supplyDone = false;
  private cardsCooldown = 0;
  private reviveAvailable = false;
  private disposed = false;
  private ready: Promise<void>;

  private hudCache: HudState;

  constructor(host: HTMLElement, settings: Settings, private autostart = false) {
    this.host = host;
    this.settings = settings;
    this.hudCache = this.blankHud();
    this.ready = this.init(host).then(() => {
      if (this.autostart) this.start({ autostart: true });
    });
  }

  // ------------------------------------------------------------------ init

  private async init(host: HTMLElement): Promise<void> {
    try {
      this.renderer = await Renderer.create(host, {
        quality: this.settings.quality,
        highContrastBullets: this.settings.highContrastBullets,
      });
    } catch (err) {
      console.warn("[game] WebGL unavailable, falling back to a null renderer", err);
      this.renderer = new NullRenderer();
    }

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    this.ctx = this.makeCtx();
    this.enemies = new EnemySystem(this.ctx);
    this.weapons = new WeaponSystem(this.ctx);
    this.bosses = new BossSystem(this.ctx, this.enemies);
    this.director = new StageDirector(this.ctx, this.enemies);
    this.progression = new Progression(this.ctx);
    this.collisions = new CollisionSystem(
      this.ctx,
      this.enemies,
      this.weapons,
      this.bosses,
      this.progression,
    );

    this.audio.init();
    this.audio.setMaster(this.settings.masterVolume);
    this.audio.setMusic(this.settings.musicVolume);
    this.audio.setSfx(this.settings.sfxVolume);
    this.audio.setMuted(this.settings.muted);
    this.player.mods = this.progression.mods;
    this.player.reset();

    this.input.applyBindings(this.settings);
    this.input.bind((cx, cy) => this.renderer?.toArena(cx, cy) ?? { x: cx, y: cy });

    const onResize = () => this.renderer?.resize();
    window.addEventListener("resize", onResize);
    this.loop.start();
    this.emitPhase();
  }

  private makeCtx(): GameCtx {
    // `g` aliases `this` so the ctx methods can close over the Game without
    // rebinding `this` when React hands the callbacks around.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      rng: this.rng,
      settings: this.settings,
      player: this.player,
      audio: this.audio,
      stats: this.stats,
      stage: 1,
      tier: 0,
      runTime: 0,
      lastHitSource: "",
      get isFrozen() {
        return self.mode !== "playing";
      },

      burst(x, y, color, count, opts) {
        self.burst(x, y, color, count, opts);
      },
      particle(x, y, vx, vy, life, color, size, kind) {
        self.particle(x, y, vx, vy, life, color, size, kind);
      },
      shake(amount) {
        self.shakeAmt = Math.max(self.shakeAmt, amount * self.settings.screenShake);
      },
      hitstop(seconds) {
        self.hitstopTimer = Math.max(self.hitstopTimer, seconds);
      },
      sfx(name, opts) {
        self.audio.play(name, opts);
      },
      sfxAt(name, x, y, opts) {
        const pan = Math.max(-1, Math.min(1, (x / ARENA_W) * 2 - 1));
        self.audio.play(name, { pan, ...opts });
      },
      damagePlayer(amount, source) {
        self.ctx.lastHitSource = source;
        if (self.godMode) return;
        const died = self.player.takeDamage(amount);
        self.stats.damageTaken += amount;
        if (died) self.onPlayerDeath();
      },
      addScore(n) {
        self.stats.score += n;
      },
      addXp(n, x, y) {
        void n;
        self.spawnXp(x, y, 1);
      },
      spawnXp(x, y, value) {
        self.spawnXp(x, y, value);
      },
      damageNumber(x, y, text, crit) {
        self.damageNumber(x, y, text, crit);
      },
      toast(text, color) {
        self.events.emit("toast", { text, color });
      },
      aoeDamage(x, y, radius, damage, color) {
        self.enemies.aoe(x, y, radius, damage);
        self.burst(x, y, color, 14, { speed: radius * 2.2, life: 0.35, size: 6 });
      },
      spawnEnemyBullet(o) {
        self.spawnEnemyBullet(o);
      },
      enemies() {
        return pools.enemies.all();
      },
      slowmo(seconds, factor) {
        self.slowmoTimer = Math.max(self.slowmoTimer, seconds);
        self.slowmoFactor = factor;
      },
    };
  }

  // ------------------------------------------------------------------ helpers

  private burst(x: number, y: number, color: number, count: number, opts: ParticleOpts = {}): void {
    const speed = opts.speed ?? 200;
    const life = opts.life ?? 0.4;
    const size = opts.size ?? 4;
    const spread = opts.spread ?? Math.PI * 2;
    const base = opts.angle ?? 0;
    for (let i = 0; i < count; i++) {
      const a = base + (this.rng.next() - 0.5) * spread;
      const s = speed * (0.5 + this.rng.next() * 0.8);
      this.particle(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        life * (0.7 + this.rng.next() * 0.6),
        color,
        size,
        opts.kind ?? "spark",
      );
    }
  }

  private particle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: number,
    size: number,
    kind: ParticleKind = "spark",
  ): void {
    const p = pools.particles.spawn();
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.sizeEnd = kind === "smoke" ? size * 2.4 : 0;
    p.color = color;
    p.alpha = 1;
    p.drag = kind === "smoke" ? 1.6 : 3.2;
    p.spin = (this.rng.next() - 0.5) * 6;
    p.angle = this.rng.next() * Math.PI * 2;
  }

  private spawnXp(x: number, y: number, value: number): void {
    const pk = pools.pickups.spawn();
    pk.kind = "xp";
    pk.x = x;
    pk.y = y;
    pk.vx = (this.rng.next() - 0.5) * 90;
    pk.vy = (this.rng.next() - 0.5) * 90;
    pk.radius = 9;
    pk.value = Math.max(1, value);
    pk.tier = value > 30 ? 3 : value > 12 ? 2 : 1;
    pk.age = 0;
    pk.lifetime = 40;
    pk.magnetized = false;
  }

  private damageNumber(x: number, y: number, text: string, crit: boolean): void {
    const d = pools.damageNumbers.spawn();
    d.x = x;
    d.y = y;
    d.vy = -70;
    d.life = crit ? 0.9 : 0.65;
    d.maxLife = d.life;
    d.text = text;
    d.crit = crit;
  }

  private spawnEnemyBullet(o: CtxBulletOpts): void {
    const b = pools.enemyBullets.spawn();
    b.owner = "enemy";
    b.weaponId = "enemy";
    b.behavior = "projectile";
    b.x = o.x;
    b.y = o.y;
    b.px = o.x;
    b.py = o.y;
    b.vx = Math.cos(o.angle) * o.speed;
    b.vy = Math.sin(o.angle) * o.speed;
    b.angle = o.angle;
    b.radius = o.radius;
    b.damage = o.damage;
    b.lifetime = o.lifetime;
    b.age = 0;
    b.color = o.color ?? ENEMY_BULLET.body;
    b.accent = o.accent ?? ENEMY_BULLET.core;
    b.shape = "enemy";
    b.pierceLeft = 0;
  }

  // ------------------------------------------------------------------ run flow

  get phase(): Mode {
    return this.mode;
  }

  get hud(): HudState {
    return this.hudCache;
  }

  hasCheckpoint(): number {
    return save.checkpoint();
  }

  start(opts: { autostart: boolean; continueFrom?: number }): void {
    void this.ready.then(() => {
      const from = opts.continueFrom && opts.continueFrom > 0 ? opts.continueFrom : 1;
      this.beginRun(from, opts.autostart);
    });
  }

  private beginRun(stage: number, countdown: boolean): void {
    resetPools();
    this.stats = newRunStats();
    this.ctx.stats = this.stats;
    this.progression.reset();
    this.player.mods = this.progression.mods;
    this.player.reset();
    this.weapons.setWeapon("focus_lance");
    this.progression.applyWeapon("focus_lance");
    this.weapons.reset();
    this.enemies.reset();
    this.bosses.reset();
    this.director.reset();
    this.shakeAmt = 0;
    this.hitstopTimer = 0;
    this.slowmoTimer = 0;
    this.stageTimer = 0;
    this.runTime = 0;
    this.supplyDone = false;
    this.reviveAvailable = this.progression.mods.revive;
    this.pendingArmory = false;
    this.pendingBoons = false;
    this.bossPhasePending = false;
    this.firstWeaponChoice = true;
    this.lastOffers = null;
    this.lastBoons = [];
    this.cardsCooldown = 0;
    this.stageTransition = 0;

    this.stage = stage;
    this.mode = countdown ? "countdown" : "playing";
    this.countdownTimer = countdown ? 3 : 0;
    this.audio.unlock();
    this.audio.musicStart();
    this.applySector();
    if (!countdown) this.enterStage(stage);
    this.emitPhase();
  }

  private applySector(): void {
    const sector = sectorOf(this.stage);
    this.audio.setSector(sector);
    this.renderer?.setSector(sector);
  }

  private enterStage(stage: number): void {
    this.stage = stage;
    this.stageTimer = 0;
    this.director.start(stage);
    this.ctx.stage = stage;
    this.ctx.tier = Math.floor(stage / 4);
    this.applySector();

    const def = getStage(stage);
    const pal = SECTOR_PALETTES[sectorOf(stage) - 1];
    this.events.emit("stageBanner", {
      stage,
      sector: sectorOf(stage),
      title: def.isBoss ? "BOSS APPROACHING" : (pal?.name ?? ""),
    });

    if (def.isBoss) {
      // Checkpoint at the start of every boss stage.
      save.setCheckpoint(stage);
      this.events.emit("checkpoint", { stage });
      const boss = this.bosses.spawn(stage);
      const bd = getBoss(stage);
      if (boss && bd) this.events.emit("bossIntro", { name: bd.name, title: bd.title, stage });
      this.audio.setBoss(bd ? bd.id : null);
    } else {
      this.audio.setBoss(null);
    }

    // Threat banner at tier steps.
    if (stage % 4 === 0) {
      this.events.emit("threatUp", { tier: Math.floor(stage / 4) });
      this.audio.stinger("boss_defeat");
    }
  }

  private completeStage(): void {
    const def = getStage(this.stage);
    if (def.isBoss) {
      this.player.healFraction(BOSS_CLEAR_HEAL);
      this.player.refillShield();
      this.progression.addReroll(1);
      this.audio.stinger("boss_defeat");
    } else {
      this.player.healFraction(STAGE_CLEAR_HEAL);
      this.audio.play("stage_clear");
    }

    if (this.stage >= MAX_STAGES) {
      this.onVictory();
      return;
    }

    // Armory after every boss stage.
    if (def.isBoss) {
      this.pendingArmory = true;
    }

    const next = this.stage + 1;
    if (next === MAX_STAGES) this.supplyDrop();

    this.stageTransition = 2.5;
    this.stage = next;
    this.ctx.stage = next;
    this.ctx.tier = Math.floor(next / 4);
    this.applySector();
  }

  /** Pre-final-boss supply drop: full heal, cooldowns, second wind, boons. */
  private supplyDrop(): void {
    if (this.supplyDone) return;
    this.supplyDone = true;
    this.player.healFraction(1);
    this.player.refillShield();
    for (const a of this.progression.actives) if (a) a.cooldown = 0;
    if (!this.progression.mods.revive) {
      this.progression.boons.push("second_wind");
      this.progression.recompute();
    }
    this.reviveAvailable = true;
    this.pendingBoons = true;
    this.pendingArmory = true;
    save.setCheckpoint(MAX_STAGES);
    this.events.emit("checkpoint", { stage: MAX_STAGES });
    this.events.emit("toast", { text: "SUPPLY DROP — Second Wind armed", color: 0xffd166 });
  }

  // ------------------------------------------------------------------ cards

  private openCards(): void {
    if (this.progression.pending <= 0) {
      this.mode = "playing";
      this.emitPhase();
      return;
    }
    const isFirst = this.firstWeaponChoice && this.progression.level <= 1;
    const offer = isFirst ? this.progression.offerWeapons() : this.progression.offerSkills();
    this.mode = "cards";
    this.cardsCooldown = 0.4;
    this.lastOffers = offer.offers;
    this.events.emit("cards", { header: offer.header, offers: offer.offers, rerolls: this.progression.rerolls });
    this.emitPhase();
  }

  private firstWeaponChoice = true;

  chooseCard(index: number): void {
    if (this.mode !== "cards") return;
    const offer = this.lastOffers;
    const card = offer?.[index];
    if (!card) return;
    this.audio.play("card_select");
    this.progression.applyCard(card);
    if (card.kind === "weapon") {
      this.weapons.setWeapon(card.id);
      this.firstWeaponChoice = false;
    }
    this.progression.consumePendingLevelUp();
    this.lastOffers = null;
    this.afterCardPicked();
  }

  private lastOffers: CardOffer[] | null = null;

  reroll(): void {
    if (this.mode !== "cards" && this.mode !== "armory") return;
    if (this.progression.rerolls <= 0) return;
    this.progression.rerolls--;
    this.audio.play("ui_click");
    if (this.mode === "cards") {
      const isFirst = this.firstWeaponChoice && this.progression.skillCount === 0 && this.progression.level <= 1;
      const offer = isFirst ? this.progression.offerWeapons() : this.progression.offerSkills();
      this.lastOffers = offer.offers;
      this.events.emit("cards", { header: offer.header, offers: offer.offers, rerolls: this.progression.rerolls });
    } else {
      const offer = this.progression.offerArmory();
      this.events.emit("armory", { offers: offer.offers, rerolls: this.progression.rerolls });
    }
  }

  private afterCardPicked(): void {
    if (this.progression.pending > 0) {
      // Small pause between queued level-ups.
      this.cardsCooldown = 0.35;
      this.mode = "cards";
      this.events.emit("toast", { text: "Level up!", color: 0x5af0ff });
      this.openCards();
    } else {
      this.mode = "playing";
      this.loop.resync();
      this.emitPhase();
    }
  }

  chooseWeapon(id: WeaponId): void {
    if (this.mode !== "armory") return;
    this.progression.applyWeapon(id);
    this.weapons.setWeapon(id);
    this.audio.play("card_select");
    this.finishArmory();
  }

  confirmArmory(): void {
    if (this.mode !== "armory") return;
    this.audio.play("ui_click");
    this.finishArmory();
  }

  private finishArmory(): void {
    if (this.pendingBoons) {
      this.openBoons();
      return;
    }
    this.mode = "playing";
    this.loop.resync();
    this.emitPhase();
  }

  private openBoons(): void {
    const offer = this.progression.offerBoons();
    this.mode = "armory"; // reuse the frozen state
    this.lastBoons = offer.offers;
    this.events.emit("boons", { offers: offer.offers });
  }

  private lastBoons: CardOffer[] = [];

  chooseBoon(index: number): void {
    const card = this.lastBoons[index];
    if (!card) return;
    this.progression.applyCard(card);
    this.audio.play("card_select");
    this.pendingBoons = false;
    this.mode = "playing";
    this.loop.resync();
    this.emitPhase();
  }

  // ------------------------------------------------------------------ pause

  pause(): void {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.audio.musicStop();
    this.emitPhase();
  }

  resume(): void {
    if (this.mode !== "paused") return;
    this.mode = "playing";
    this.loop.resync();
    this.audio.musicStart();
    this.emitPhase();
  }

  togglePause(): void {
    if (this.mode === "playing") this.pause();
    else if (this.mode === "paused") this.resume();
  }

  quitToTitle(): void {
    this.mode = "menu";
    this.audio.musicStop();
    this.emitPhase();
  }

  /** Called on the first user gesture so the suspended AudioContext resumes. */
  resumeAudio(): void {
    this.audio.unlock();
  }

  // ------------------------------------------------------------------ death

  private onPlayerDeath(): void {
    if (this.reviveAvailable) {
      this.reviveAvailable = false;
      this.player.revive(0.5);
      this.slowmo(1.0, 0.3);
      this.burst(this.player.x, this.player.y, 0x5af0ff, 60, { speed: 700, life: 0.8, size: 9 });
      this.toastToPlayer("SECOND WIND");
      return;
    }
    this.audio.stinger("gameover");
    this.audio.musicStop();
    this.mode = "gameover";
    const summary = this.buildSummary(false);
    save.setBestStage(summary.stage);
    save.setHighScore(summary.score);
    this.events.emit("gameover", summary);
    this.emitPhase();
  }

  private onVictory(): void {
    this.audio.stinger("victory");
    this.mode = "victory";
    const summary = this.buildSummary(true);
    save.setBestStage(MAX_STAGES);
    save.setHighScore(summary.score);
    save.clearCheckpoint();
    this.events.emit("victory", summary);
    this.emitPhase();
  }

  private slowmo(seconds: number, factor: number): void {
    this.slowmoTimer = Math.max(this.slowmoTimer, seconds);
    this.slowmoFactor = factor;
  }

  private toastToPlayer(text: string): void {
    this.events.emit("toast", { text, color: 0xffd166 });
  }

  private buildSummary(victory: boolean): GameOverSummary {
    return {
      stage: this.stage,
      level: this.progression.level,
      kills: this.stats.kills,
      time: this.runTime,
      score: Math.round(this.stats.score),
      weaponName: WEAPONS[this.weapons.weaponId]?.name ?? "Basic Blaster",
      skills: this.progression.buildSummary().map((s) => ({ name: s.name, level: s.level })),
      bestStage: Math.max(save.bestStage(), this.stage),
      highScore: Math.max(save.highScore(), Math.round(this.stats.score)),
      lastHit: this.lastHitSourceText(),
      victory,
    };
  }

  private lastHitSourceText(): string {
    return this.ctx?.lastHitSource || "Unknown";
  }

  // ------------------------------------------------------------------ update

  private update(dt: number): void {
    if (dt <= 0) return;

    // Timers that must advance regardless of mode.
    this.input.endFrame();
    if (this.cardsCooldown > 0) this.cardsCooldown = Math.max(0, this.cardsCooldown - dt);

    if (this.mode === "menu" || this.mode === "gameover" || this.mode === "victory") {
      // Idle animation only.
      return;
    }

    if (this.mode === "paused" || this.mode === "cards" || this.mode === "armory") {
      // Frozen: pick up pause/fullscreen keys but do not simulate.
      return;
    }

    if (this.mode === "countdown") {
      this.countdownTimer -= dt;
      const n = Math.ceil(this.countdownTimer);
      this.events.emit("countdown", { n: Math.max(0, n) });
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) {
        this.hudTimer = 1 / 15;
        this.pushHud();
      }
      if (this.countdownTimer <= 0) {
        this.mode = "playing";
        this.enterStage(this.stage);
        this.emitPhase();
      }
      return;
    }

    // ---- playing
    this.runTime += dt;
    this.ctx.runTime = this.runTime;
    this.stageTimer += dt;

    this.handlePauseKeys();
    if (this.mode !== "playing") return;

    const player = this.player;
    const ptr = this.input.pointer;
    const aimX = ptr.active && this.settings.mouseAim ? ptr.x : player.x;
    const aimY = ptr.active && this.settings.mouseAim ? ptr.y : player.y - 100;

    const axis = this.input.axis();
    player.update(dt, axis.x, axis.y, aimX, aimY);

    const aimAngle = Math.atan2(aimY - player.y, aimX - player.x) + Math.PI / 2;
    const firing = this.settings.autoFire || this.input.isDown("fire") || ptr.down;
    if (!this.settings.autoFire && this.input.isDown("fire")) this.audio.unlock();
    this.weapons.update(dt, firing && player.alive, aimAngle, player.x, player.y);

    // Dash
    if ((this.input.isDown("dash") || ptr.rightDown) && player.dashCooldown <= 0) {
      if (player.startDash()) this.audio.play("dash");
    }

    // Active skills 1..5
    for (let i = 0; i < 5; i++) {
      if (this.input.justPressed(`skill${i + 1}` as never)) {
        if (this.progression.activate(i)) this.toastToPlayer("");
      }
    }

    const chrono = this.progression.enemyTimeScale;
    this.enemies.update(dt * chrono);
    this.bosses.update(dt * chrono);
    this.progression.update(dt);
    this.director.update(dt);
    this.collisions.update(dt, player);
    this.updateParticles(dt);
    this.updateDamageNumbers(dt);
    this.updateTelegraphs(dt);

    // Audio intensity from how busy the screen is.
    const busy = Math.min(1, (this.enemies.hostileCount() + pools.enemyBullets.activeCount) / 60);
    this.audio.setIntensity(busy);

    // Level-up queue -> card screen.
    if (this.progression.pending > 0 && this.cardsCooldown <= 0) {
      this.audio.stinger("levelup");
      this.slowmo(LEVELUP_SLOWMO, LEVELUP_SLOWMO_FACTOR);
      if (this.progression.mods.novaOnLevelup) {
        this.ctx.aoeDamage(player.x, player.y, 320, 120, 0xffd166);
      }
      this.openCards();
      return;
    }

    // Stage completion.
    this.handleStageFlow(dt);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 15;
      this.pushHud();
    }
  }

  private handlePauseKeys(): void {
    if (this.input.justPressed("pause")) {
      this.pause();
      return;
    }
    if (this.input.justPressed("mute")) {
      this.settings.muted = !this.settings.muted;
      this.audio.setMuted(this.settings.muted);
      this.toastToPlayer(this.settings.muted ? "Muted" : "Sound on");
    }
    if (this.input.justPressed("autoFire")) {
      this.settings.autoFire = !this.settings.autoFire;
      this.toastToPlayer(this.settings.autoFire ? "Auto-fire ON" : "Auto-fire OFF");
    }
  }

  private handleStageFlow(dt: number): void {
    if (this.stageTransition > 0) {
      this.stageTransition -= dt;
      if (this.stageTransition <= 0) this.enterStage(this.stage);
      return;
    }

    if (this.pendingArmory) {
      this.pendingArmory = false;
      const offer = this.progression.offerArmory();
      this.mode = "armory";
      this.events.emit("armory", { offers: offer.offers, rerolls: this.progression.rerolls });
      this.emitPhase();
      return;
    }

    if (this.bosses.active) return;

    if (this.director.done) {
      this.completeStage();
    }
  }

  private updateParticles(dt: number): void {
    for (const p of pools.particles.all()) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        pools.particles.release(p);
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
  }

  private updateDamageNumbers(dt: number): void {
    for (const d of pools.damageNumbers.all()) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        pools.damageNumbers.release(d);
        continue;
      }
      d.y += d.vy * dt;
      d.vy *= Math.exp(-2 * dt);
    }
  }

  private updateTelegraphs(dt: number): void {
    for (const t of pools.telegraphs.all()) {
      if (!t.active) continue;
      t.timer -= dt;
      if (t.timer <= 0) pools.telegraphs.release(t);
    }
  }

  // ------------------------------------------------------------------ render

  private render(alpha: number, frameDt: number): void {
    // Slow-mo and hit-stop are driven in real time so they always resolve.
    if (this.hitstopTimer > 0) this.hitstopTimer = Math.max(0, this.hitstopTimer - frameDt);
    if (this.slowmoTimer > 0) {
      this.slowmoTimer = Math.max(0, this.slowmoTimer - frameDt);
      if (this.slowmoTimer <= 0) this.slowmoFactor = 1;
    }

    let scale = this.debugTimeScale;
    if (this.hitstopTimer > 0) scale = 0;
    else if (this.slowmoTimer > 0) scale *= this.slowmoFactor;
    // Freeze only the screens that must not simulate. The countdown still runs
    // so the 3-2-1 actually advances.
    if (this.mode !== "playing" && this.mode !== "countdown") scale = 0;
    this.loop.setTimeScale(scale);

    // Camera shake decay
    this.shakeAmt = Math.max(0, this.shakeAmt - frameDt * 60);
    const amp = this.shakeAmt;
    this.shakeX = (this.rng.next() - 0.5) * amp;
    this.shakeY = (this.rng.next() - 0.5) * amp;
    this.renderer?.shake(this.shakeX, this.shakeY);

    if (!this.renderer) return;
    this.renderer.render(
      {
        player: this.player,
        bullets: pools.bullets.all(),
        enemyBullets: pools.enemyBullets.all(),
        enemies: pools.enemies.all(),
        pickups: pools.pickups.all(),
        particles: pools.particles.all(),
        telegraphs: pools.telegraphs.all(),
        damageNumbers: pools.damageNumbers.all(),
        time: this.runTime,
        moving: this.mode === "playing",
      },
      alpha,
    );
  }

  // ------------------------------------------------------------------ HUD

  private blankHud(): HudState {
    return {
      hull: 100,
      hullMax: 100,
      shield: 40,
      shieldMax: 40,
      level: 0,
      xp: 0,
      xpToNext: 10,
      score: 0,
      stage: 1,
      tier: 0,
      stageProgress: 0,
      time: 0,
      combo: 0,
      kills: 0,
      weaponId: "focus_lance",
      weaponName: "Basic Blaster",
      heat: 0,
      dashCooldown: 0,
      dashCooldownMax: 2,
      charge: 0,
      skills: [],
      lowHull: false,
      boss: null,
      fps: 0,
      entities: 0,
    };
  }

  private pushHud(): void {
    const p = this.player;
    const skills: HudSkill[] = [];
    if (this.progression) {
      this.progression.actives.forEach((a, i) => {
        if (!a) return;
        skills.push({
          slot: i,
          id: a.id,
          level: a.level,
          cooldown: a.cooldown,
          cooldownMax: a.cooldownMax,
          ready: a.cooldown <= 0,
        });
      });
    }
    const boss = this.bosses?.boss;
    const bd = boss?.bossDef ?? null;
    this.hudCache = {
      hull: p.hull,
      hullMax: p.hullMax,
      shield: p.shield,
      shieldMax: p.shieldMax,
      level: this.progression?.level ?? 0,
      xp: this.progression?.xp ?? 0,
      xpToNext: this.progression?.xpToNext ?? 10,
      score: Math.round(this.stats.score),
      stage: this.stage,
      tier: Math.floor(this.stage / 4),
      stageProgress: this.director?.progress ?? 0,
      time: this.runTime,
      combo: 0,
      kills: this.stats.kills,
      weaponId: this.weapons.weaponId,
      weaponName: WEAPONS[this.weapons.weaponId]?.name ?? "Basic Blaster",
      heat: this.weapons.heat,
      dashCooldown: p.dashCooldown,
      dashCooldownMax: 2,
      charge: this.weapons.charge,
      skills,
      lowHull: p.lowHull,
      boss:
        boss && bd
          ? {
              name: bd.name,
              title: bd.title,
              hp: boss.hp,
              hpMax: boss.hpMax,
              phases: bd.phases,
              phase: boss.bossPhase,
            }
          : null,
      fps: this.loop.currentFps,
      entities:
        pools.enemies.activeCount +
        pools.bullets.activeCount +
        pools.enemyBullets.activeCount +
        pools.particles.activeCount,
    };
    this.events.emit("hud", this.hudCache);
  }

  private emitPhase(): void {
    this.events.emit("phase", this.mode);
  }

  // ------------------------------------------------------------------ settings

  applySettings(s: Settings): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = s;
    this.ctx.settings = s;
    this.input.applyBindings(s);
    this.audio.setMaster(s.masterVolume);
    this.audio.setMusic(s.musicVolume);
    this.audio.setSfx(s.sfxVolume);
    this.audio.setMuted(s.muted);
    this.renderer?.setShakeScale(s.screenShake);
    this.renderer?.setHighContrast(s.highContrastBullets);
    if (qualityChanged) this.renderer?.setQuality(s.quality);
    save.saveSettings(s);
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  // ------------------------------------------------------------------ debug

  readonly debug: DebugApi = {
    gotoStage: (n) => {
      void this.ready.then(() => {
        resetPools();
        this.enterStage(Math.max(1, Math.min(MAX_STAGES, n)));
        this.mode = "playing";
        this.emitPhase();
      });
    },
    setLevel: (n) => {
      this.progression.level = Math.max(0, n);
      this.progression.recompute();
      this.pushHud();
    },
    forceLevelUp: () => {
      this.progression.addXp(this.progression.xpToNext);
      this.progression.queueLevelUp(1);
      this.cardsCooldown = 0;
    },
    openArmory: () => {
      const offer = this.progression.offerArmory();
      this.mode = "armory";
      this.events.emit("armory", { offers: offer.offers, rerolls: this.progression.rerolls });
      this.emitPhase();
    },
    killPlayer: () => {
      this.player.hull = 0;
      this.onPlayerDeath();
    },
    grantWeapon: (id) => {
      this.progression.applyWeapon(id);
      this.weapons.setWeapon(id);
      this.pushHud();
    },
    grantSkill: (id) => {
      const def = { kind: "skill", id } as CardOffer;
      this.progression.applyCard(def);
      this.pushHud();
    },
    godMode: (v) => {
      this.godMode = v;
    },
    spawnEnemy: (defId) => {
      const id = defId || "rock_normal_medium";
      if (id === "raider") this.enemies.spawnShooter(ARENA_W / 2, -60);
      else if (id.startsWith("breaker")) {
        const s = id.endsWith("large") ? "large" : id.endsWith("medium") ? "medium" : "small";
        this.enemies.spawnSmasher(s, ARENA_W / 2, -60);
      } else {
        const variant = id.includes("ice")
          ? "ice"
          : id.includes("metal")
            ? "metal"
            : id.includes("explosive")
              ? "explosive"
              : "normal";
        const size = id.endsWith("large") ? "large" : id.endsWith("medium") ? "medium" : "small";
        this.enemies.spawnRock(variant, size, ARENA_W / 2, -60);
      }
    },
    spawnBoss: (stage) => {
      this.bosses.spawn(stage);
    },
    setTimeScale: (v) => {
      this.debugTimeScale = Math.max(0, v);
    },
    stats: () => ({
      fps: this.loop?.currentFps ?? 0,
      entities:
        pools.enemies.activeCount +
        pools.bullets.activeCount +
        pools.enemyBullets.activeCount +
        pools.particles.activeCount,
      phase: this.mode,
    }),
    spritePng: (key) =>
      this.renderer instanceof Renderer ? this.renderer.debugTexturePng(key) : null,
  };

  // ------------------------------------------------------------------ teardown

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.stop();
    this.input.dispose();
    this.audio.musicStop();
    this.renderer?.destroy();
    this.events.clear();
  }
}
