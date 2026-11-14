/**
 * Run progression: XP/levels, the skill build (max 5, 5 levels each), weapon
 * mastery, rerolls, legendary boons, and the active-skill runtime.
 *
 * Card-offer generation lives here because it is pure rules, not rendering.
 */
import { baseMods, type Mods } from "../player";
import type { GameCtx } from "../ctx";
import { pools } from "../entities";
import { LEGENDARY_BOONS, pickBoons } from "../data/boons";
import { MAX_SKILLS, SKILLS, SKILL_LIST } from "../data/skills";
import { WEAPONS, WEAPON_LIST } from "../data/weapons";
import { xpToNext } from "../data/xp";
import { MAX_STAGES } from "../data/constants";
import { DEFAULT_PATTERN, PATTERN_LIST } from "../data/patterns";
import type {
  AttackPatternId,
  BoonCard,
  CardOffer,
  MasteryCard,
  PatternCard,
  Role,
  SalvageCard,
  SkillCard,
  SkillId,
  WeaponCard,
  WeaponId,
} from "../types";

const CARD_COUNT_DEFAULT = 3;
const CARD_COUNT_L12 = 4;
const CARD_COUNT_L28 = 5;

export interface ActiveRuntime {
  id: SkillId;
  level: number;
  cooldown: number;
  cooldownMax: number;
  timer: number; // effect duration remaining
}

export class Progression {
  level = 0;
  xp = 0;
  weaponId: WeaponId = "focus_lance";
  /** Selected attack pattern (multi-shot geometry); see data/patterns.ts. */
  pattern: AttackPatternId = DEFAULT_PATTERN;
  skills = new Map<SkillId, number>();
  /** Mastery rank per weapon, scoped to this run. */
  masteryByWeapon = new Map<WeaponId, number>();
  rerolls = 2;
  boons: string[] = [];
  mods: Mods = baseMods();

  // active-skill runtime
  actives: (ActiveRuntime | null)[] = [null, null, null, null, null];
  overdriveTimer = 0;
  overdriveFireRate = 0;
  overdriveSpeed = 0;
  chronoTimer = 0;
  chronoFactor = 1;
  barrierTimer = 0;
  barrierReflect = false;
  ionTimer = 0;
  ionTick = 0;
  repairTimer = 0;
  repairPerSec = 0;
  graceQueue = 0;

  // Gravity Well: a 3s channel that drags enemies to the ship's nose.
  gravityTimer = 0;
  gravityDamage = 0;
  private gravityHit = new Set<number>();

  // Shockwave: a slow expanding ring that sweeps the arena.
  shockwaveTimer = 0;
  shockwaveRadius = 0;
  shockwaveMaxR = 0;
  shockwaveDamage = 0;
  private shockwaveHit = new Set<number>();

  private pendingLevelUps = 0;

  constructor(private ctx: GameCtx) {}

  reset(): void {
    this.level = 0;
    this.xp = 0;
    this.weaponId = "focus_lance";
    this.pattern = DEFAULT_PATTERN;
    this.skills.clear();
    this.masteryByWeapon.clear();
    this.rerolls = 2;
    this.boons = [];
    this.actives = [null, null, null, null, null];
    this.overdriveTimer = 0;
    this.chronoTimer = 0;
    this.barrierTimer = 0;
    this.barrierReflect = false;
    this.ionTimer = 0;
    this.repairTimer = 0;
    this.graceQueue = 0;
    this.gravityTimer = 0;
    this.gravityHit.clear();
    this.shockwaveTimer = 0;
    this.shockwaveRadius = 0;
    this.shockwaveHit.clear();
    this.pendingLevelUps = 0;
    this.recompute();
  }

  get xpToNext(): number {
    return xpToNext(this.level);
  }

  get skillCount(): number {
    return this.skills.size;
  }

  get ownedSkills(): { id: SkillId; level: number }[] {
    return [...this.skills.entries()].map(([id, level]) => ({ id, level }));
  }

  get masteryRank(): number {
    return this.masteryByWeapon.get(this.weaponId) ?? 0;
  }

  /** Weapon milestone tier (every 10 levels, capped at 4). */
  get weaponTier(): number {
    return Math.min(4, Math.floor(this.level / 10));
  }

  // ------------------------------------------------------------- XP / levels

  /** Adds XP, returns how many levels were gained (each triggers a card screen). */
  addXp(amount: number): number {
    if (amount <= 0) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      gained++;
    }
    // Milestone mods key off the level, so refresh them on every level-up.
    if (gained > 0) this.recompute();
    return gained;
  }

  /** Skill points are granted by reaching a level; the card screen is driven by the shell. */
  onLevelReached(): void {
    this.recompute();
  }

  // ------------------------------------------------------------- mods

  recompute(): void {
    const m = baseMods();
    for (const [id, lvl] of this.skills) {
      const def = SKILLS[id];
      const capped = Math.min(lvl, 5);
      // Level values are per-level increments; accumulate up to the cap.
      let value = 0;
      for (let i = 0; i < capped; i++) value += def.levels[i]?.value ?? 0;
      switch (def.effect) {
        case "max_hull_flat":
          m.maxHullFlat += value;
          if (lvl >= 5) m.damageReduction += 0.15;
          break;
        case "damage_pct":
          m.damagePct += value;
          break;
        case "fire_rate_pct":
          m.fireRatePct += value;
          break;
        case "crit":
          m.critChance += value / 100;
          if (lvl >= 5) m.critDamage += 0.4;
          break;
        case "pierce_flat":
          m.pierceFlat += value;
          break;
        case "move_speed_pct":
          m.moveSpeedPct += value;
          break;
        case "pickup_radius_pct":
          m.pickupRadiusPct += value;
          m.xpPct += 10 * capped;
          break;
        case "shield_flat":
          m.shieldFlat += value;
          break;
        case "thorns":
          m.thornsDamage += value;
          break;
        case "drones":
          m.drones += value;
          break;
        default:
          break;
      }
    }

    // Boons
    for (const b of this.boons) {
      switch (b) {
        case "damage_30":
          m.damagePct += 30;
          break;
        case "firerate_40":
          m.fireRatePct += 40;
          break;
        case "shield_100":
          m.shieldFlat += 100;
          break;
        case "nova_levelup":
          m.novaOnLevelup = true;
          break;
        case "lifesteal":
          m.lifesteal += 1;
          break;
        case "pierce_all":
          m.pierceFlat += 1;
          break;
        case "crit_master":
          m.critChance += 0.25;
          m.critDamage += 0.75;
          break;
        case "second_wind":
          m.revive = true;
          break;
        default:
          break;
      }
    }

    // Weapon mastery contributes a small damage/fire-rate bump.
    const rank = this.masteryRank;
    if (rank > 0) m.damagePct += rank * 5;

    // Overdrive is transient; fold it in so systems just read mods.
    if (this.overdriveTimer > 0) {
      m.fireRatePct += this.overdriveFireRate;
      m.moveSpeedPct += this.overdriveSpeed;
    }

    // Phase Barrier reflect is live state; re-apply it so a recompute mid-effect
    // cannot wipe the flag (the reflect lives in active state, not the mods base).
    if (this.barrierTimer > 0 && this.barrierReflect) m.barrierReflect = true;

    // Weapon milestone: every 10 levels the gun grows in power and volume.
    const t = this.weaponTier;
    m.damagePct += 25 * t;
    m.bulletCount += t;
    m.bulletSizePct += 15 * t;
    m.bulletSpeedPct += 50 * t;

    this.mods = m;
    this.ctx.player.mods = m;
    this.ctx.player.refreshCaps();
  }

  // ------------------------------------------------------------- offers

  private cardCount(): number {
    if (this.level >= 28) return CARD_COUNT_L28;
    if (this.level >= 12) return CARD_COUNT_L12;
    return CARD_COUNT_DEFAULT;
  }

  private weaponCard(id: WeaponId): WeaponCard {
    const d = WEAPONS[id];
    return {
      kind: "weapon",
      id,
      name: d.name,
      role: d.role,
      color: d.color,
      strength: d.strength,
      weakness: d.weakness,
      blurb: d.blurb,
      equipped: id === this.weaponId,
    };
  }

  private skillCard(id: SkillId): SkillCard {
    const def = SKILLS[id];
    const cur = this.skills.get(id) ?? 0;
    const next = cur + 1;
    const from = cur > 0 ? (def.levels[cur - 1]?.desc ?? "") : null;
    const to = def.levels[Math.min(next, 5) - 1]?.desc ?? "";
    // Key hint: active skills fill the first free slot in `actives` (or their
    // existing slot on an upgrade); passives have no key.
    const activeIdx = this.actives.findIndex((a) => a?.id === id);
    const freeIdx = this.actives.findIndex((a) => a === null);
    const slot = activeIdx >= 0 ? activeIdx : freeIdx;
    const keyHint = def.category === "active" && slot >= 0 ? String(slot + 1) : "";
    return {
      kind: "skill",
      id,
      name: def.name,
      category: def.category,
      color: def.color,
      level: cur,
      tag: cur === 0 ? "NEW" : "UPGRADE",
      fromDesc: from,
      toDesc: to,
      capstone: next >= 5 ? def.capstone : "",
      keyHint,
      owned: cur > 0,
    };
  }

  private masteryCard(weaponId: WeaponId, rank: number): MasteryCard {
    const def = WEAPONS[weaponId];
    const m = def.mastery[rank - 1];
    return {
      kind: "mastery",
      id: `${weaponId}:${rank}`,
      name: m ? m.name : `${def.name} Mastery ${rank}`,
      desc: m ? m.desc : "",
      color: def.color,
      rank,
    };
  }

  private salvageCard(): SalvageCard {
    return {
      kind: "salvage",
      id: "salvage",
      name: "Salvage",
      desc: "Repair 20% hull and bank 400 score",
      color: 0x4dffa6,
    };
  }

  /** Active hotkey slots in use (0..MAX_SKILLS). Passives occupy no slot. */
  activeSlotsUsed(): number {
    return this.actives.reduce((n, a) => n + (a ? 1 : 0), 0);
  }

  /** True while at least one active-skill hotkey slot is free. */
  hasFreeActiveSlot(): boolean {
    return this.actives.some((a) => a === null);
  }

  /** Weapons offered on the level-1 screen: one per role, always distinct. */
  offerWeapons(): { header: string; offers: CardOffer[] } {
    const roles: Role[] = ["single", "crowd", "utility"];
    const chosen: WeaponId[] = [];
    for (const role of roles) {
      const pool = WEAPON_LIST.filter((w) => w.role === role && w.id !== this.weaponId);
      const pickd = pool.length ? pool[this.ctx.rng.int(0, pool.length - 1)] : undefined;
      if (pickd) chosen.push(pickd.id);
    }
    // Always offer at least 3 by topping up with random non-equipped weapons.
    while (chosen.length < 3) {
      const pool = WEAPON_LIST.filter((w) => !chosen.includes(w.id));
      const pickd = pool[this.ctx.rng.int(0, pool.length - 1)];
      if (!pickd) break;
      chosen.push(pickd.id);
    }
    return { header: "Choose your weapon", offers: chosen.map((id) => this.weaponCard(id)) };
  }

  /** Skill / mastery / salvage offers for a level-up. */
  offerSkills(): { header: string; offers: CardOffer[] } {
    const n = this.cardCount();
    const header = `Skills ${this.activeSlotsUsed()}/${MAX_SKILLS}`;

    // 1. Upgrades of owned, non-maxed skills are always eligible (an active
    //    upgrade reuses its existing slot).
    const upgradable = this.ownedSkills.filter((s) => s.level < 5).map((s) => s.id);
    // 2. New skills: passives always fit; a new active needs a free hotkey slot.
    const newPassives = SKILL_LIST.filter(
      (s) => s.category !== "active" && !this.skills.has(s.id),
    ).map((s) => s.id);
    const newActives = this.hasFreeActiveSlot()
      ? SKILL_LIST.filter((s) => s.category === "active" && !this.skills.has(s.id)).map((s) => s.id)
      : [];
    const newSkills = [...newPassives, ...newActives];

    const offers: CardOffer[] = [];
    const used = new Set<SkillId>();

    const take = (from: SkillId[]): boolean => {
      const pool = from.filter((id) => !used.has(id));
      if (!pool.length) return false;
      const id = pool[this.ctx.rng.int(0, pool.length - 1)];
      if (!id) return false;
      used.add(id);
      offers.push(this.skillCard(id));
      return true;
    };

    // Prefer a mix: at least one new skill if any is eligible, plus one upgrade.
    if (newSkills.length) take(newSkills);
    take(upgradable);

    while (offers.length < n) {
      const filled = take(newSkills) || take(upgradable);
      if (!filled) break;
    }

    if (offers.length === 0) {
      // Everything owned is maxed -> weapon mastery, then salvage.
      const rank = this.masteryRank + 1;
      if (rank <= 3) offers.push(this.masteryCard(this.weaponId, rank));
      while (offers.length < n) offers.push(this.salvageCard());
    } else {
      while (offers.length < n) offers.push(this.salvageCard());
    }

    return { header, offers };
  }

  offerArmory(): { offers: WeaponCard[] } {
    const equipped = this.weaponId;
    const others = WEAPON_LIST.filter((w) => w.id !== equipped);
    const picked: WeaponId[] = [];
    while (picked.length < 2 && others.length) {
      const i = this.ctx.rng.int(0, others.length - 1);
      const w = others.splice(i, 1)[0];
      if (w) picked.push(w.id);
    }
    return { offers: [this.weaponCard(equipped), ...picked.map((id) => this.weaponCard(id))] };
  }

  offerBoons(): { offers: BoonCard[] } {
    return { offers: pickBoons(() => this.ctx.rng.next(), 3) };
  }

  /** One card per attack pattern, marking the equipped one. */
  offerPatterns(): PatternCard[] {
    return PATTERN_LIST.map((p) => ({
      kind: "pattern",
      id: p.id,
      name: p.name,
      desc: p.desc,
      color: p.color,
      equipped: p.id === this.pattern,
    }));
  }

  hasBoon(id: string): boolean {
    return this.boons.includes(id);
  }

  addReroll(n: number): void {
    this.rerolls = Math.min(9, this.rerolls + n);
  }

  // ------------------------------------------------------------- apply

  applyWeapon(id: WeaponId): void {
    this.weaponId = id;
    this.recompute();
  }

  applyPattern(id: AttackPatternId): void {
    this.pattern = id;
  }

  /** Applies a card. Returns false if the offer could not be consumed. */
  applyCard(card: CardOffer): boolean {
    switch (card.kind) {
      case "weapon":
        this.applyWeapon(card.id);
        return true;
      case "skill": {
        const cur = this.skills.get(card.id) ?? 0;
        if (cur >= 5) return false;
        // A brand-new ACTIVE needs a free hotkey slot; new passives always fit.
        if (cur === 0 && SKILLS[card.id].category === "active" && !this.hasFreeActiveSlot()) {
          return false;
        }
        this.skills.set(card.id, cur + 1);
        this.recompute();
        if (cur === 0) this.assignActive(card.id);
        return true;
      }
      case "mastery": {
        const rank = Math.min(3, this.masteryRank + 1);
        this.masteryByWeapon.set(this.weaponId, rank);
        this.recompute();
        return true;
      }
      case "salvage": {
        this.ctx.player.healFraction(0.2);
        this.ctx.addScore(400);
        return true;
      }
      case "boon": {
        if (!this.boons.includes(card.id)) this.boons.push(card.id);
        this.recompute();
        return true;
      }
      case "pattern": {
        this.applyPattern(card.id);
        return true;
      }
      default:
        return false;
    }
  }

  private assignActive(id: SkillId): void {
    const def = SKILLS[id];
    if (!def.cooldown) return;
    const slot = this.actives.findIndex((a) => a === null);
    if (slot < 0) return;
    this.actives[slot] = { id, level: 1, cooldown: 0, cooldownMax: def.cooldown, timer: 0 };
  }

  // ------------------------------------------------------------- active skills

  update(dt: number): void {
    for (const a of this.actives) {
      if (!a) continue;
      if (a.cooldown > 0) a.cooldown = Math.max(0, a.cooldown - dt);
      if (a.timer > 0) a.timer = Math.max(0, a.timer - dt);
      a.level = this.skills.get(a.id) ?? a.level;
    }
    if (this.overdriveTimer > 0) {
      this.overdriveTimer -= dt;
      if (this.overdriveTimer <= 0) this.recompute();
    }
    if (this.chronoTimer > 0) {
      this.chronoTimer -= dt;
      if (this.chronoTimer <= 0) this.chronoFactor = 1;
    }
    if (this.barrierTimer > 0) {
      this.barrierTimer -= dt;
      this.ctx.player.invuln = true;
      this.ctx.player.invulnTimer = Math.max(this.ctx.player.invulnTimer, 0.1);
      if (this.barrierTimer <= 0) this.barrierReflect = false;
    }
    if (this.repairTimer > 0) {
      this.repairTimer -= dt;
      this.ctx.player.heal(this.repairPerSec * dt);
    }
    if (this.ionTimer > 0) {
      this.ionTimer -= dt;
      this.ionTick -= dt;
      if (this.ionTick <= 0) {
        this.ionTick = 0.28;
        this.strikeRandom();
      }
    }
    if (this.gravityTimer > 0) this.updateGravity(dt);
    if (this.shockwaveTimer > 0) this.updateShockwave(dt);
    if (this.graceQueue > 0) this.graceQueue -= dt;
  }

  /** Gravity Well channel: drag nearby enemies to the ship's nose and crush them. */
  private updateGravity(dt: number): void {
    this.gravityTimer -= dt;
    const p = this.ctx.player;
    const fx = Math.cos(p.angle - Math.PI / 2);
    const fy = Math.sin(p.angle - Math.PI / 2);
    const tx = p.x + fx * 46;
    const ty = p.y + fy * 46;
    for (const e of pools.enemies.all()) {
      if (!e.active || e.isBoss) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 420) continue;
      // Pull harder the closer the enemy already is.
      const k = 1 - Math.min(1, Math.max(0, (d - 40) / 380)) * 0.7;
      e.x += (tx - e.x) * k * dt * 6;
      e.y += (ty - e.y) * k * dt * 6;
      if (this.ctx.rng.next() < 0.06) {
        this.ctx.particle(e.x, e.y, (tx - e.x) * 2, (ty - e.y) * 2, 0.3, 0xa06bff, 4, "glow");
      }
      if (Math.hypot(e.x - tx, e.y - ty) < 34 && !this.gravityHit.has(e.uid)) {
        this.gravityHit.add(e.uid);
        this.ctx.aoeDamage(e.x, e.y, 8, this.gravityDamage, 0xa06bff);
      }
    }
    if (this.gravityTimer <= 0) this.gravityHit.clear();
  }

  /** Shockwave: a slow expanding ring that damages and clears bullets as it passes. */
  private updateShockwave(dt: number): void {
    const p = this.ctx.player;
    const prev = this.shockwaveRadius;
    this.shockwaveRadius += 420 * dt;
    const r = this.shockwaveRadius;
    for (const e of pools.enemies.all()) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d >= prev && d <= r && !this.shockwaveHit.has(e.uid)) {
        this.shockwaveHit.add(e.uid);
        this.ctx.aoeDamage(e.x, e.y, 10, this.shockwaveDamage, 0xffff33);
      }
    }
    for (const b of pools.enemyBullets.all()) {
      if (!b.active) continue;
      if (Math.hypot(b.x - p.x, b.y - p.y) <= r) pools.enemyBullets.release(b);
    }
    if (r >= this.shockwaveMaxR) {
      this.shockwaveTimer = 0;
      this.shockwaveHit.clear();
    }
  }

  /** Enemy/bullet time scale from Chrono Slip. */
  get enemyTimeScale(): number {
    return this.chronoTimer > 0 ? this.chronoFactor : 1;
  }

  activate(slot: number): boolean {
    const a = this.actives[slot];
    if (!a || a.cooldown > 0) return false;
    const def = SKILLS[a.id];
    const lvl = Math.max(1, Math.min(5, a.level));
    const value = def.levels[lvl - 1]?.value ?? 0;
    a.cooldown = a.cooldownMax;
    this.ctx.sfxAt(a.id as never, this.ctx.player.x, this.ctx.player.y);
    this.runEffect(a.id, value, lvl);
    return true;
  }

  private runEffect(id: SkillId, value: number, lvl: number): void {
    const p = this.ctx.player;
    switch (id) {
      case "shockwave": {
        this.shockwaveTimer = 1;
        this.shockwaveMaxR = 260 + lvl * 40;
        this.shockwaveDamage = value;
        this.shockwaveRadius = 0;
        this.shockwaveHit.clear();
        this.ctx.particle(p.x, p.y, 0, 0, 1.1, 0xffff33, 24, "ring", this.shockwaveMaxR);
        this.ctx.shake(8);
        break;
      }
      case "nano_repair": {
        this.repairTimer = 3;
        this.repairPerSec = value / 3;
        break;
      }
      case "phase_barrier": {
        this.barrierTimer = 1.2;
        p.invuln = true;
        p.invulnTimer = 1.2;
        this.barrierReflect = lvl >= 3;
        this.mods.barrierReflect = this.barrierReflect;
        break;
      }
      case "missile_barrage": {
        for (let i = 0; i < value; i++) {
          const b = pools.bullets.spawn();
          const ang = (i / value) * Math.PI * 2;
          b.owner = "player";
          b.weaponId = "seeker_swarm";
          b.behavior = "homing";
          b.x = p.x;
          b.y = p.y;
          b.px = p.x;
          b.py = p.y;
          b.vx = Math.cos(ang) * 420;
          b.vy = Math.sin(ang) * 420;
          b.angle = ang;
          b.radius = 7;
          b.damage = 16 * (1 + this.mods.damagePct / 100);
          b.lifetime = 5;
          b.age = 0;
          b.color = 0xffd166;
          b.accent = 0xff9f1c;
          b.shape = "missile";
          b.homing = 6;
          b.pierceLeft = 0;
          b.aoe = 0;
        }
        break;
      }
      case "gravity_well": {
        this.gravityTimer = 3;
        this.gravityDamage = value;
        this.gravityHit.clear();
        this.ctx.burst(p.x, p.y, 0xa06bff, 18, { speed: 320, life: 0.4, size: 6 });
        break;
      }
      case "overdrive": {
        this.overdriveTimer = 4;
        this.overdriveFireRate = value;
        this.overdriveSpeed = 10;
        this.recompute();
        break;
      }
      case "chrono_slip": {
        this.chronoTimer = 3;
        this.chronoFactor = value / 100;
        break;
      }
      case "ion_storm": {
        this.ionTimer = 5;
        this.ionTick = 0;
        this.ionDamage = value;
        break;
      }
      default:
        break;
    }
  }

  ionDamage = 40;

  private strikeRandom(): void {
    const list = pools.enemies.all().filter((e) => e.active);
    if (!list.length) return;
    const e = list[this.ctx.rng.int(0, list.length - 1)];
    if (!e) return;
    // Ion storm: a bright bolt from above the target down to it, then a flash.
    const L = 150;
    this.ctx.particle(e.x, e.y - L / 2, 0, 0, 0.22, 0xa0e0ff, L / 3, "trail");
    for (let i = 0; i < 8; i++) {
      this.ctx.particle(e.x, e.y - (i / 7) * L, 0, 40, 0.22, 0xa0e0ff, 14 - i, "glow");
    }
    this.ctx.particle(e.x, e.y, 0, 0, 0.3, 0xffffff, 34, "glow");
    this.ctx.burst(e.x, e.y, 0xa0e0ff, 10, { speed: 300, life: 0.3, size: 5 });
    this.ctx.aoeDamage(e.x, e.y, 60, this.ionDamage, 0xa0e0ff);
  }

  /** Called by the shell after the player picks a card, to advance the pending queue. */
  consumePendingLevelUp(): boolean {
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
      return true;
    }
    return false;
  }

  queueLevelUp(n: number): void {
    this.pendingLevelUps += n;
  }

  get pending(): number {
    return this.pendingLevelUps;
  }

  /** Everything the Game Over screen lists. */
  buildSummary(): { id: SkillId; name: string; level: number }[] {
    return this.ownedSkills.map((s) => ({ id: s.id, name: SKILLS[s.id].name, level: s.level }));
  }
}

/** Stage -> sector (1..5). */
export function sectorOf(stage: number): 1 | 2 | 3 | 4 | 5 {
  const s = Math.floor((Math.min(MAX_STAGES, Math.max(1, stage)) - 1) / 10) + 1;
  return Math.min(5, s) as 1 | 2 | 3 | 4 | 5;
}

export { LEGENDARY_BOONS };
