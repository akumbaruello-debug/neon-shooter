/**
 * Shared type contracts for the Neon Shooter game engine.
 * The engine is plain TypeScript and must not import React.
 */

export type Vec2 = { x: number; y: number };

export type Role = "single" | "crowd" | "utility";
export type WeaponId =
  | "focus_lance"
  | "gatling_vulcan"
  | "rail_charge"
  | "prism_beam"
  | "scatter_shot"
  | "crescent_slash"
  | "arc_chain"
  | "plasma_orb"
  | "seeker_swarm"
  | "ricochet_disc"
  | "boomerang_blade"
  | "crossfire";

/** How a weapon's shot is simulated. */
export type WeaponBehavior =
  | "projectile" // straight bullets
  | "rail" // hold-charge, long piercing beam
  | "beam" // continuous short beam with ramp + heat
  | "melee_arc" // crescent slash, short range, cuts bullets
  | "chain" // lightning that jumps between targets
  | "homing" // seeking micro-missiles
  | "bounce" // edge-bouncing disc
  | "boomerang" // out-and-back blade
  | "multi" // simultaneous forward/rear/diagonals

/** Named multi-shot geometries. `forward` keeps each weapon's native volley. */
export type AttackPatternId =
  | "forward"
  | "twin"
  | "fan"
  | "fore_aft"
  | "radiant"
  | "cross"
  | "sniper"
  | "close_pellet"
  | "rear_guard"
  | "wide_fan";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  role: Role;
  behavior: WeaponBehavior;
  color: number;
  accent: number;
  strength: string;
  weakness: string;
  /** Short flavour blurb for cards. */
  blurb: string;

  // --- base combat numbers (pre skills) ---
  damage: number; // damage per projectile hit / per beam tick
  fireInterval: number; // seconds between volleys
  projectileSpeed: number;
  count: number; // projectiles per volley
  spread: number; // total cone width in radians
  size: number; // projectile radius px
  lifetime: number; // seconds before despawn
  pierce: number; // extra enemies a shot can pass through
  knockback: number;

  // --- special behaviour parameters (optional per behaviour) ---
  chargeTime?: number; // rail: seconds to full charge
  heatPerSec?: number; // beam: heat gained while firing
  heatCoolPerSec?: number; // beam: heat lost when idle
  overheatLock?: number; // beam: seconds locked after overheat
  rampPerHit?: number; // beam: damage ramp on same target
  rampMax?: number;
  range?: number; // beam/melee effective range px
  aoe?: number; // orb: explosion radius
  homing?: number; // homing strength
  bounce?: number; // max edge bounces
  maxInFlight?: number; // disc/blade cap
  chainJumps?: number; // chain: extra targets
  chainFalloff?: number; // chain: damage multiplier per jump
  returnDistance?: number; // boomerang outbound distance
  bloom?: number; // gatling spread growth while holding
  selfSlow?: number; // rail: move slow while charging (0..1)
  mastery: MasteryDef[]; // 3 ranks
}

/** Weapon-specific mastery ranks offered when all skills are maxed. */
export interface MasteryDef {
  rank: number;
  name: string;
  desc: string;
  apply?: never; // data-only; effects decoded in weapons system by id+rank
}

export type SkillId =
  | "reinforced_hull"
  | "overcharged_rounds"
  | "rapid_loader"
  | "crit_core"
  | "tungsten_tips"
  | "thrusters"
  | "magnet_coil"
  | "shield_matrix"
  | "thorn_plating"
  | "orbital_drones"
  | "shockwave"
  | "nano_repair"
  | "phase_barrier"
  | "missile_barrage"
  | "gravity_well"
  | "overdrive"
  | "chrono_slip"
  | "ion_storm";

export type SkillCategory = "offense" | "defense" | "utility" | "active";

export interface SkillLevelDef {
  /** Human-readable summary of the effect at this level, e.g. "Damage +12%". */
  desc: string;
  /** Machine-readable magnitude; meaning depends on the skill. */
  value: number;
}

export interface SkillDef {
  id: SkillId;
  name: string;
  category: SkillCategory;
  /** Icon is painted from the skill id (render/icons.ts, typed Record<SkillId, Painter>). */
  color: number;
  /** Effect on the simulation, keyed so the systems can read exact magnitudes. */
  effect:
    | "max_hull_flat"
    | "damage_pct"
    | "fire_rate_pct"
    | "crit"
    | "pierce_flat"
    | "move_speed_pct"
    | "pickup_radius_pct"
    | "shield_flat"
    | "thorns"
    | "drones"
    | "active_shockwave"
    | "active_repair"
    | "active_barrier"
    | "active_missiles"
    | "active_gravity"
    | "active_overdrive"
    | "active_chrono"
    | "active_ion";
  /** Cooldown seconds for active skills. */
  cooldown?: number;
  /** One line per level (index 0 = level 1). Level 5 is the capstone. */
  levels: SkillLevelDef[];
  /** Capstone (level 5) name shown as a tag. */
  capstone: string;
}

export type EnemyKind =
  | "rock"
  | "shooter"
  | "smasher"
  | "lancer"
  | "mortar"
  | "orbiter"
  | "splitter";

export type RockVariant = "normal" | "ice" | "metal" | "explosive";

export interface EnemyDef {
  id: string;
  kind: EnemyKind;
  name: string;
  /** Base stats at tier 0. */
  hp: number;
  damage: number;
  radius: number;
  speed: number;
  score: number;
  xp: number;
  color: number;
  accent: number;
}

export interface BossDef {
  id: string;
  stage: number;
  name: string;
  title: string;
  hp: number;
  radius: number;
  color: number;
  accent: number;
  phases: number;
  /** Pattern ids used by the boss director. */
  patterns: string[];
  enragePatterns?: string[];
  /** Flight path while alive (post-intro, pre-death). Defaults to "static". */
  movement?: "static" | "strafe" | "figure8" | "orbit";
  targetSeconds: number;
}

export type StageComposition =
  | "rock_field"
  | "rock_intro"
  | "shooter_squadron"
  | "smasher_rush"
  | "mixed_assault"
  | "elite"
  | "meteor_shower";

export interface StageDef {
  stage: number;
  tier: number;
  sector: 1 | 2 | 3 | 4 | 5;
  composition: StageComposition;
  isBoss: boolean;
  bossId?: string;
  /** Spawn budget: how many "points" of enemies to spawn during the stage. */
  budget: number;
  targetSeconds: [number, number];
  /** Wave plan for non-boss stages. */
  waves: WaveDef[];
}

export interface WaveDef {
  /** Which enemy ids may spawn (resolved by the spawner). */
  kinds: string[];
  count: number;
  /** Seconds after the wave starts that this wave begins. */
  at: number;
  /** Seconds between individual spawns inside the wave. */
  spacing: number;
  /** Optional burst flag (meteor shower finale). */
  burst?: boolean;
}

// ---------------------------------------------------------------- settings

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  screenShake: number; // 0..1
  damageNumbers: boolean;
  autoFire: boolean;
  uiScale: number; // 0.8..1.4
  quality: "low" | "high";
  highContrastBullets: boolean;
  fullscreen: boolean;
  mouseAim: boolean;
  keybindings: Record<ActionName, string[]>;
}

export type ActionName =
  | "up"
  | "down"
  | "left"
  | "right"
  | "fire"
  | "dash"
  | "skill1"
  | "skill2"
  | "skill3"
  | "skill4"
  | "skill5"
  | "pause"
  | "mute"
  | "autoFire";

// ---------------------------------------------------------------- HUD

export interface HudSkill {
  slot: number;
  id: SkillId;
  /** Display name, straight from the skills table. */
  name: string;
  /** Tint for the painted icon, straight from the skills table. */
  color: number;
  /** Live bound key for this slot (from settings.keybindings), e.g. "1" or "Q". */
  keyLabel: string;
  level: number;
  cooldown: number;
  cooldownMax: number;
  ready: boolean;
}

export interface HudState {
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  level: number;
  xp: number;
  xpToNext: number;
  score: number;
  stage: number;
  tier: number;
  stageProgress: number; // 0..1
  time: number;
  combo: number;
  kills: number;
  weaponId: WeaponId;
  weaponName: string;
  /** Selected attack pattern. */
  patternId: AttackPatternId;
  /** Selected attack-pattern name (e.g. "Fan"). */
  patternName: string;
  /** Weapon milestone tier from the player level (0..4). */
  weaponTier: number;
  /** Beam/rail heat or charge, 0..1. */
  heat: number;
  dashCooldown: number;
  dashCooldownMax: number;
  charge: number; // rail charge 0..1
  skills: HudSkill[];
  /** Every owned skill (actives + passives) with its level, for the pause/settings roster. */
  roster: SkillRosterEntry[];
  lowHull: boolean;
  boss: BossHud | null;
  fps: number;
  entities: number;
}

/** One row of the player's skill roster (settings / pause summary). Passives carry no key. */
export interface SkillRosterEntry {
  id: SkillId;
  name: string;
  color: number;
  category: SkillCategory;
  level: number;
  /** Bound key for actives; "" for passives. */
  keyLabel: string;
  passive: boolean;
}

export interface BossHud {
  name: string;
  title: string;
  hp: number;
  hpMax: number;
  phases: number;
  phase: number;
}

// ---------------------------------------------------------------- cards

export interface WeaponCard {
  kind: "weapon";
  id: WeaponId;
  name: string;
  role: Role;
  color: number;
  strength: string;
  weakness: string;
  blurb: string;
  equipped: boolean;
}

export interface SkillCard {
  kind: "skill";
  id: SkillId;
  name: string;
  category: SkillCategory;
  color: number;
  level: number; // current level (0 = new)
  tag: "NEW" | "UPGRADE";
  fromDesc: string | null;
  toDesc: string;
  capstone: string;
  /** Key of the slot this skill will fill; "" for passives (they have no key). */
  keyHint: string;
  owned: boolean;
}

export interface MasteryCard {
  kind: "mastery";
  id: string; // `${weaponId}:${rank}`
  name: string;
  desc: string;
  color: number;
  rank: number;
}

export interface SalvageCard {
  kind: "salvage";
  id: "salvage";
  name: string;
  desc: string;
  color: number;
}

export interface BoonCard {
  kind: "boon";
  id: string;
  name: string;
  desc: string;
  color: number;
}

export interface PatternCard {
  kind: "pattern";
  id: AttackPatternId;
  name: string;
  desc: string;
  color: number;
  equipped: boolean;
}

export type CardOffer = WeaponCard | SkillCard | MasteryCard | SalvageCard | BoonCard | PatternCard;

// ---------------------------------------------------------------- events

export type GameEvent =
  | { type: "hud"; hud: HudState }
  | { type: "levelup"; level: number }
  | { type: "cards"; header: string; offers: CardOffer[]; rerolls: number }
  | { type: "armory"; offers: WeaponCard[]; rerolls: number }
  | { type: "boons"; offers: BoonCard[] }
  | { type: "stageBanner"; stage: number; sector: number; title: string }
  | { type: "threatUp"; tier: number }
  | { type: "bossIntro"; name: string; title: string; stage: number }
  | { type: "countdown"; n: number }
  | { type: "gameover"; summary: GameOverSummary }
  | { type: "victory"; summary: GameOverSummary }
  | { type: "toast"; text: string; color?: number }
  | { type: "checkpoint"; stage: number };

export interface GameOverSummary {
  stage: number;
  level: number;
  kills: number;
  time: number;
  score: number;
  weaponName: string;
  skills: { name: string; level: number }[];
  bestStage: number;
  highScore: number;
  lastHit: string;
  victory: boolean;
}

export interface RunOptions {
  autostart: boolean;
  startStage?: number;
  continueFrom?: number;
}

export type GamePhase =
  | "boot"
  | "menu"
  | "countdown"
  | "playing"
  | "cards"
  | "armory"
  | "boons"
  | "paused"
  | "gameover"
  | "victory";
