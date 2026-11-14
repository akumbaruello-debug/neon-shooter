# Skills

The 18 skills defined in `src/game/data/skills.ts`, with the effect each one
actually applies in `src/game/systems/progression.ts`, the icon painted for it
in `src/game/render/icons.ts`, and the slot/key it occupies.

Skills are either **passive** (folds a value into `Mods` in `recompute()`) or
**active** (a triggered ability with a cooldown, run by `activate()` ->
`runEffect()`). `SKILLS` holds 10 passives and 8 actives.

## Skills

| Skill | Type | Icon (painter) | Key | Effect (from `progression.ts`) | Cooldown |
|---|---|---|---|---|---|
| Reinforced Hull | Passive (defense) | `pHull` (three stacked armour bars) | — (no key) | `m.maxHullFlat += value`; at level 5 also `m.damageReduction += 0.15` | — |
| Overcharged Rounds | Passive (offense) | `pBullet` (casing with tapered nose) | — (no key) | `m.damagePct += value` | — |
| Rapid Loader | Passive (offense) | `pStopwatch` (stopwatch) | — (no key) | `m.fireRatePct += value` | — |
| Crit Core | Passive (offense) | `pCrit` (four-point star, tick marks) | — (no key) | `m.critChance += value / 100`; at level 5 also `m.critDamage += 0.4` | — |
| Tungsten Tips | Passive (offense) | `pArrow` (arrow) | — (no key) | `m.pierceFlat += value` | — |
| Thrusters | Passive (utility) | `pChevrons` (double chevron) | - (no key) | `m.moveSpeedPct += value`; the dash benefit is a consequence of that speed (see Open questions) | - |
| Magnet Coil | Passive (utility) | `pMagnet` (horseshoe magnet) | — (no key) | `m.pickupRadiusPct += value` and `m.xpPct += 10 * level` | — |
| Shield Matrix | Passive (defense) | `pHexShield` (honeycomb hex plate) | — (no key) | `m.shieldFlat += value` | — |
| Thorn Plating | Passive (defense) | `pSpikes` (10-point spiked star) | — (no key) | `m.thornsDamage += value` | — |
| Orbital Drones | Passive (offense) | `pDrone` (drone body, orbit ellipse) | — (no key) | `m.drones += value`; `Game.tickDrones()` fires each drone via `WeaponSystem.spawnDroneShot()` | — |
| Shockwave | Active | `pRingPulse` (concentric rings + 8 spokes) | 1 (slot 1; default; rebindable) | Slow expanding yellow ring: radius grows at 420 px/s up to `260 + level*40`, one ring particle grows from 24 px to that max over ~1.1 s; enemies are damaged as the ring passes them (`updateShockwave`, `aoeDamage(10, value)`), enemy bullets are released as it passes; `shake(8)` | 9 s |
| Nano Repair | Active | `pCross` (plus/cross) | 2 (slot 2; default; rebindable) | Sets `repairTimer = 3` and `repairPerSec = value / 3`; heals that total over 3 s | 16 s |
| Phase Barrier | Active | `pShield` (pointed shield) | 3 (slot 3; default; rebindable) | `barrierTimer = 1.2`, player invulnerable 1.2 s; at level >= 3 sets `barrierReflect` (enemy bullets inside 90 px are fired back) | 18 s |
| Missile Barrage | Active | `pMissiles` (three missiles) | 4 (slot 4; default; rebindable) | Spawns `value` homing missiles (`damage = 16 * (1 + damagePct/100)` each, speed 420, lifetime 5 s, homing 6) | 12 s |
| Gravity Well | Active | `pVortex` (three-blade vortex) | 5 (slot 5; default; rebindable) | 3 s channel that drags non-boss enemies within 420 px toward a point ~46 px in front of the ship's nose; enemies that reach ~34 px are crushed via `aoeDamage(8, value)` (`updateGravity`) | 15 s |
| Overdrive | Active | `pLightning` (lightning bolt) | slot default; rebindable | Sets `overdriveTimer = 4`, `overdriveFireRate = value`, `overdriveSpeed = 10`, then `recompute()` folds fire-rate and move-speed into `Mods` for 4 s | 22 s |
| Chrono Slip | Active | `pHourglass` (hourglass) | slot default; rebindable | Sets `chronoTimer = 3` and `chronoFactor = value / 100`; `enemyTimeScale` scales enemies, bosses and enemy bullets | 20 s |
| Ion Storm | Active | `pBubble` (cluster of bubbles) | slot default; rebindable | Sets `ionTimer = 5`; every 0.28 s `strikeRandom()` draws a visible lightning bolt/flash on the target and hits a random enemy with `aoeDamage(60, ionDamage)` | 25 s |

Notes on the Key column:

- Default bindings are `skill1..skill5` = `"1".."5"` in
  `src/game/save.ts` (`DEFAULT_BINDINGS`).
- An active occupies the **first free slot** at pick time, so its key is the
  default key of that slot (1..5). The Key cells above show the slot used by the
  QA run; a real run assigns slots in pick order. Neither the skill data nor the
  card chooses a key directly.
- Every binding is rebindable in Settings -> Controls, and the HUD shows the live
  bound key (`Game.hudSkills()` reads `settings.keybindings[skillN][0]`), so the
  displayed key follows a rebind.
- Passives occupy no slot: their Key cell is "— (no key)", and the card / HUD /
  Armory roster leave `keyLabel` empty.

## Level 5 / capstone

`Level-5 total` is the cumulative sum of `levels[0..4].value` (`Σ levels`). That
is how `recompute()` now scales passives: it adds `levels[0]` through
`levels[capped-1]` instead of applying only the newest level. Actives read a
single per-level value in `activate()` (see Open questions), so for actives this
column is the data total, not the number used at runtime.

| Skill | Level-5 total (Σ levels[0..4]) | Capstone effect actually implemented |
|---|---|---|
| Reinforced Hull | 95 (max hull) | At level 5 `recompute()` adds `damageReduction += 0.15` on top of the 95 hull |
| Overcharged Rounds | 46 (% damage) | No separate branch; the level-5 value (12) is just part of the 46 |
| Rapid Loader | 62 (% fire rate) | No separate branch; level-5 value (18) is part of the 62 |
| Crit Core | 30 (% crit chance) | At level 5 `recompute()` adds `critDamage += 0.4` |
| Tungsten Tips | 6 (pierce) | No separate branch; level-5 value (2) is part of the 6 |
| Thrusters | 36 (% move speed) | No separate branch; dash recharge shortens because `dashCooldown` scales with `moveSpeedPct` |
| Magnet Coil | 125 (% pickup radius) | No separate branch; `xpPct` reaches 50 (10 x 5) |
| Shield Matrix | 60 (shield) | No separate branch; level-5 value (15) is part of the 60 |
| Thorn Plating | 85 (thorns damage) | No separate branch; level-5 value (25) is part of the 85 |
| Orbital Drones | 3 (drones) | Drones fire 50% faster: `Game.tickDrones()` divides the 0.5 s interval by 1.5 at level 5 (0.333 s) |
| Shockwave | 680 (damage) | No separate branch; raw radius grows to 260 + 5*40 = 460 px |
| Nano Repair | 141 (heal over 3 s) | No separate branch |
| Phase Barrier | 6.0 (sum of 1.2 s level values) | Reflect turns on at **level >= 3**, not only at level 5 |
| Missile Barrage | 52 (missiles) | No separate branch |
| Gravity Well | 360 (damage) | No separate branch |
| Overdrive | 210 (sum of fire-rate %) | No separate branch; level-5 value (60) sets the 4 s fire-rate buff |
| Chrono Slip | 172 (sum of slow %) | No separate branch; level-5 value (22) sets `chronoFactor = 0.22` |
| Ion Storm | 330 (sum of strike damage) | No separate branch; level-5 value (110) is the per-strike damage |

## Where these come from

- **Name, colour, levels, description, cooldown:** all read from
  `SKILLS` in `src/game/data/skills.ts` (the single skill table). Cards, HUD and
  Armory pull from the same defs.
- **Icon:** painted from the skill id in `src/game/render/icons.ts`. The registry
  is `const SKILL_PAINTERS: Record<SkillId, Painter>`, so a missing painter is a
  compile error, not a silent fallback. (The `ALIAS` table is only for legacy
  string ids in `makeSkillIcon()`; it does not cover the `Record`.)
- **Key:** read from the live keybinding of the slot
  (`settings.keybindings[skillN][0]`, sourced from `DEFAULT_BINDINGS` in
  `src/game/save.ts`) in `Game.hudSkills()` and `Game.skillRoster()`. Because the
  HUD, cards and Armory all go through those helpers, the key cannot drift from
  what the input layer (`src/game/core/input.ts`) actually listens for.

## Broken before this pass

- All 8 actives were dead on the keyboard even though `activate()` worked when
  called directly. Fixed in `src/game/core/input.ts`: edge ("just pressed")
  state is now cleared once per simulation step, after the update consumes it
  (`Game.afterUpdate()` -> `input.endFrame()`).
- `orbital_drones` had no consumer: the `drones` mod was computed and never
  read. Fixed in `src/game/game.ts` (`tickDrones()`) and
  `src/game/systems/weapons.ts` (`spawnDroneShot()`).
- Level values under-scaled, applying only the newest level. Fixed in
  `src/game/systems/progression.ts` (`recompute()` accumulates `levels[0..cap]`).
- The card key hint pointed at the wrong key. Fixed in
  `src/game/systems/progression.ts` (`skillCard()` derives `keyHint` from the
  slot the active will actually occupy).
- `phase_barrier` reflect was wiped by `recompute()`. Fixed in
  `src/game/systems/progression.ts` (`recompute()` re-applies `barrierReflect`
  while `barrierTimer > 0`).
- Chrono Slip slowed enemies but not enemy bullets. Fixed in
  `src/game/systems/collisions.ts` (`updateEnemyBullets()` scales motion and age
  by `enemyTimeScale`).
- The slot-count cap counted all skills, so 5 owned skills blocked every new
  pick. Fixed in `src/game/systems/progression.ts` (`activeSlotsUsed()` /
  `hasFreeActiveSlot()` count only `actives`; `MAX_SKILLS` in
  `src/game/data/skills.ts` is the number of active slots).

## Evidence

- Measured PASS table: `screenshots/skills-report.json` (generated
  `2026-11-14T06:35:54.755Z`, `18/18 PASS`, `0 FAIL`, `missingApi: []`).
- QA harness: `scripts/qa-skills.mjs` (`node scripts/qa-skills.mjs`).
- Before: `screenshots/before/skill-hud.png` and
  `screenshots/before/measurements.json` (all five `keyResults[].fired: false`
  while `directActivate.ok: true`, i.e. the keyboard-edge bug).
- After: `screenshots/after/skill-hud.png` (capture in progress; see
  `screenshots/after/...`).

## Open questions

- **Actives do not use the cumulative sum at runtime.** `activate()` sets
  `value = def.levels[lvl - 1].value`, i.e. only the newest level's value
  (Shockwave at level 5 uses 200, not the 680 in the table; Chrono Slip uses 22,
  not 172). `recompute()` does not accumulate active effects at all, because its
  `switch` only handles passive effects and actives fall into `default`. The
  "Level-5 total" column is therefore the data sum the passives use, and the
  active runtime numbers are the single-level values.
- **Thrusters description vs implementation.** Each level's text promises
  "dash cooldown -0.15s", but `recompute()` only adds `moveSpeedPct`; there is no
  dash-cooldown field in `Mods`. The dash text is currently cosmetic.
- **Phase Barrier capstone timing.** The level text ties reflect to level 3 and
  the capstone label says "Reflects bullets", but the level-5 row is labelled as
  a capstone. In code reflect is active from level 3, so it is not a level-5-only
  payoff.
- **Phase Barrier "Level-5 total"** sums the duration field (1.2 x 5), which has
  no gameplay meaning; the duration is a constant 1.2 s at every level.