/** Global tuning constants. Balance that lives in tables sits in the other data files. */

export const ARENA_W = 1920;
export const ARENA_H = 1080;

/** Simulation rate. Rendering interpolates between the last two steps. */
export const FIXED_DT = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

export const MAX_STAGES = 50;
export const TIER_EVERY = 4;
export const BOSS_STAGES = [10, 20, 30, 40, 50] as const;
export const ARMORY_STAGES = [10, 20, 30, 40] as const;

// --- player ---
export const PLAYER_HULL = 100;
export const PLAYER_SHIELD = 40;
export const PLAYER_RADIUS = 26; // visual half-size
export const HITBOX_SCALE = 0.4; // hitbox is ~40% of the sprite
export const PLAYER_ACCEL = 4200; // px/s^2
export const PLAYER_MAX_SPEED = 520; // px/s
export const PLAYER_FRICTION = 8.0; // exponential damp lambda
export const PLAYER_TURN_RATE = 14; // rad/s toward cursor
export const INVULN_TIME = 0.7;
export const DASH_SPEED = 1500;
export const DASH_TIME = 0.14;
export const DASH_COOLDOWN = 2.0;
export const DASH_IFRAMES = 0.2;

export const SHIELD_RECHARGE_DELAY = 3.0;
export const SHIELD_RECHARGE_RATE = 14; // per second
export const MAX_ENEMY_HIT_FRACTION = 0.35; // no hit > 35% of hull+shield

export const LOW_HULL_FRACTION = 0.3;

export const PICKUP_RADIUS = 46; // generous
export const MAGNET_RADIUS = 210;

// --- damage feedback ---
export const HITSTOP_BIG_KILL = 0.04;
export const LEVELUP_SLOWMO = 0.3;
export const LEVELUP_SLOWMO_FACTOR = 0.25;

// --- spawning rules ---
export const SPAWN_GRACE = 0.8; // seconds an enemy cannot hurt you after spawn
export const SPAWN_FX_TIME = 1.0;
export const MIN_SPAWN_DIST_FROM_PLAYER = 350;
export const SHOOTER_BASE_CAP = 2;
export const SHOOTER_CAP_EVERY = 8;
export const SHOOTER_HARD_CAP = 5;

// --- collation limits ---
export const MAX_PARTICLES = 1400;
export const MAX_BULLETS = 900;
export const MAX_ENEMIES = 260;

// --- economy ---
export const PITY_REPAIR_MIN_GAP = 20; // seconds
export const STAGE_CLEAR_HEAL = 0.15;
export const BOSS_CLEAR_HEAL = 0.4;

export const SECTOR_PALETTES = [
  { name: "Verdant Reach", bg0: 0x03040c, bg1: 0x0a1a2a, nebula: 0x1d6b8f, star: 0xa9e8ff, planet: 0x2f6b8f },
  { name: "Ember Belt", bg0: 0x0a0406, bg1: 0x2a0d10, nebula: 0x8f3d1d, star: 0xffd6a9, planet: 0x8f4a2f },
  { name: "Frost Verge", bg0: 0x040810, bg1: 0x11202e, nebula: 0x3d7a8f, star: 0xd6f4ff, planet: 0x4a7a9f },
  { name: "Violet Expanse", bg0: 0x08040f, bg1: 0x1a1030, nebula: 0x6b3d9f, star: 0xe4c9ff, planet: 0x5a3d8f },
  { name: "Eclipse Void", bg0: 0x030306, bg1: 0x141420, nebula: 0x3a3a5a, star: 0xf0e8d0, planet: 0x2a2a3a },
] as const;

/** Enemy bullet palette (red-orange / white core / dark ring) — never player colors. */
export const ENEMY_BULLET = { core: 0xfff2e0, body: 0xff5a2a, ring: 0x3a0a00 };
