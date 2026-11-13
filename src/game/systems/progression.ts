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
import type {
  BoonCard,
  CardOffer,
  MasteryCard,
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
  ionTimer = 0;
  ionTick = 0;
  repairTimer = 0;
  repairPerSec = 0;
  graceQueue = 0;

  private pendingLevelUps = 0;

  constructor(private ctx: GameCtx) {}

  reset(): void {
    this.level = 0;
    this.xp = 0;
    this.weaponId = "focus_lance";
    this.skills.clear();
    this.masteryByWeapon.clear();
    this.rerolls = 2;
    this.boons = [];
    this.actives = [null, null, null, null, null];
    this.overdriveTimer = 0;
    this.chronoTimer = 0;
    this.barrierTimer = 0;
    this.ionTimer = 0;
    this.repairTimer = 0;
    this.graceQueue = 0;
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
      const value = def.levels[Math.min(lvl, 5) - 1]?.value ?? 0;
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
          m.xpPct += 10;
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
    const slot = this.slotsUsed();
    const keyHint = String(Math.min(slot + 1, MAX_SKILLS));
    return {
      kind: "skill",
      id,
      name: def.name,
      category: def.category,
      color: def.color,
      icon: def.icon,
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

  slotsUsed(): number {
    return this.skills.size;
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
    const header = `Skills ${this.slotsUsed()}/${MAX_SKILLS}`;

    // 1. Upgrades of owned, non-maxed skills are always eligible.
    const upgradable = this.ownedSkills.filter((s) => s.level < 5);
    // 2. New skills only while a slot is free.
    const room = this.slotsUsed() < MAX_SKILLS;
    const unowned = SKILL_LIST.filter((s) => !this.skills.has(s.id));

    const offers: CardOffer[] = [];
    const used = new Set<SkillId>();

    const take = (from: SkillId[]) => {
      const pool = from.filter((id) => !used.has(id));
      if (!pool.length) return false;
      const id = pool[this.ctx.rng.int(0, pool.length - 1)];
      if (!id) return false;
      used.add(id);
      offers.push(this.skillCard(id));
      return true;
    };

    // Prefer a mix: at least one new skill if there is room and one upgrade if possible.
    if (room) take(unowned.map((s) => s.id));
    take(upgradable.map((s) => s.id));

    while (offers.length < n) {
      const filled = take(unowned.map((s) => s.id)) || take(upgradable.map((s) => s.id));
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

  /** Applies a card. Returns false if the offer could not be consumed. */
  applyCard(card: CardOffer): boolean {
    switch (card.kind) {
      case "weapon":
        this.applyWeapon(card.id);
        return true;
      case "skill": {
        const cur = this.skills.get(card.id) ?? 0;
        if (cur >= 5) return false;
        if (cur === 0 && this.skills.size >= MAX_SKILLS) return false;
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
    if (this.graceQueue > 0) this.graceQueue -= dt;
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
        this.ctx.burst(p.x, p.y, 0x5af0ff, 40, { speed: 900, life: 0.5, size: 8 });
        this.ctx.shake(10);
        const radius = 260 + lvl * 40;
        this.ctx.aoeDamage(p.x, p.y, radius, value, 0x5af0ff);
        // Erase enemy bullets inside the ring.
        for (const b of pools.enemyBullets.all()) {
          if (!b.active) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) <= radius) pools.enemyBullets.release(b);
        }
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
        this.mods.barrierReflect = lvl >= 3;
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
          b.vx = Math.cos(ang) * 120;
          b.vy = Math.sin(ang) * 120;
          b.angle = ang;
          b.radius = 7;
          b.damage = 16 * (1 + this.mods.damagePct / 100);
          b.lifetime = 3;
          b.age = 0;
          b.color = 0xffd166;
          b.accent = 0xff9f1c;
          b.shape = "missile";
          b.homing = 5;
          b.pierceLeft = 0;
          b.aoe = 0;
        }
        break;
      }
      case "gravity_well": {
        for (const e of pools.enemies.all()) {
          if (!e.active || e.isBoss) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < 420) {
            const pull = 380 / Math.max(40, d);
            e.x += (p.x - e.x) * pull * 0.25;
            e.y += (p.y - e.y) * pull * 0.25;
          }
        }
        this.ctx.aoeDamage(p.x, p.y, 300, value, 0xa06bff);
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
