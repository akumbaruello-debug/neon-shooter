# Bullets

How player and enemy projectiles are shaped, coloured, scaled and layered.
Player bullets are driven by `src/game/data/weapons.ts` +
`src/game/systems/weapons.ts` + `src/game/render/sprites.ts`; the render scale
and layer order live in `src/game/render/renderer.ts`.

## Player weapons

`Behaviour` is `WeaponDef.behavior`. `Bullet shape` is the `PROJECTILE_SHAPE`
mapping in `src/game/systems/weapons.ts` (a `beam` maps to the baked `lance`
shape in `Renderer.bulletShape()`). Size is the post-fix core width on screen at
1280x720, computed with
`2 * f * (32/30) * radius * SHAPE_SCALE[shape] * (2/3)`: `f` is the shape's
fraction of the 64 px sprite box (`lance` .17, `bolt` .24, `diamond` .62,
`orb` .92, `disc` .90, `blade` .30, `missile` .22 body / .48 fins), `radius` is
`WeaponDef.size`, and the 2/3 is the 1280x720 fit scale (arena 1920x1080,
uniform `min(1280/1920, 720/1080) = 0.667`). The before column uses
`SHAPE_SCALE = 1` (the old raw `radius / ref` sprite); shapes whose
`SHAPE_SCALE` is 1.0 are unchanged.

| Weapon | Behaviour | Bullet shape | Colour | Trail? | On-screen size @1280x720 | Before -> after (core px) | Notes |
|---|---|---|---|---|---|---|---|
| Focus Lance | projectile | lance | `0x5ad1ff` | no | 4.4 px wide, ~21 px long | 1.5 -> 4.4 | pierce 3, speed 1300, size 6 |
| Gatling Vulcan | projectile | bolt | `0xffd166` | no | 3.8 px wide | 1.4 -> 3.8 | bloom grows spread while held, size 4 |
| Rail Charge | rail | beam -> lance | `0xb388ff` | yes | 7.3 px wide, long beam | 2.4 -> 7.3 | charge shot, pierce 99, size 10, sets `b.trail` |
| Prism Beam | beam | beam -> lance | `0x00ffd0` | yes | 3.6 px wide | 1.2 -> 3.6 | heat/ramp beam, size 5, sets `b.trail` |
| Scatter Shot | projectile | diamond | `0xff7ad1` | no | 4.4 px wide | 4.4 -> 4.4 | 5 pellets, size 5, diamond scale is 1.0 |
| Crescent Slash | melee_arc | arc | `0x9dff5a` | no | ~76 px sweep | 76 -> 76 | cuts enemy bullets, arc scale is 1.0, size 60 |
| Arc Chain | chain | bolt | `0xfff25a` | no | 3.8 px wide | 1.4 -> 3.8 | 4 jumps, falloff 0.8, size 4 |
| Plasma Orb | projectile | orb | `0xc45aff` | no | 28.8 px across | 28.8 -> 28.8 | aoe 150, size 22, orb scale is 1.0 |
| Seeker Swarm | homing | missile | `0x8affc8` | yes | 3.4 px body, 7.4 px fins, ~15 px long | 1.9 -> 3.4 body | 3 missiles, homing 5, size 6, sets `b.trail` |
| Ricochet Disc | bounce | disc | `0x4da6ff` | no | 13.3 px across | 11.5 -> 13.3 | 4 bounces, max 3 in flight, size 9 |
| Boomerang Blade | boomerang | blade | `0xff8c42` | no | 6.7 px wide, ~21 px long | 5.1 -> 6.7 | out-and-back, max 2 in flight, size 12 |
| Crossfire | projectile | bolt | `0xff3d6e` | no | 4.8 px wide | 1.7 -> 4.8 | 4 barrels (forward, rear, two diagonals), size 5 |

The three pre-fix widths called out in the earlier measurement
(`screenshots/before/measurements.json`) match the computed raw values above:
Focus Lance 1.5 px, Gatling Vulcan 1.4 px, Prism Beam 1.2 px. The `SHAPE_SCALE`
table in `renderer.ts` is what raises them to 4.4 / 3.8 / 3.6 px.

`bulletShape()` collapses to the eight baked shapes only; `beam` renders as
`lance` and anything unknown renders as `orb`.

## Enemy bullets vs player bullets

- **Player bullets** use the eight baked shapes from `makeBullet()` (authored
  white, `ref = 30`) and are tinted per shot with `b.color`
  (`Renderer.drawBullets()` sets `s.tint = b.color`). They render on
  `playerBulletLayer`, whose `blendMode` is `"add"`, so they glow additively.
- **Enemy bullets** are not one of those shapes. `makeEnemyBullet()` paints a
  radial orb (core `0xfff2e0`, body `0xff5a2a`; high-contrast core `0xffd23f`),
  and `ringedEnemyBullet()` in `renderer.ts` composites a dark ring
  (`ENEMY_BULLET.ring = 0x3a0a00`) around it into `eb:0` (normal) or `eb:1`
  (high contrast). They are never tinted (`s.tint` stays `0xffffff`) and render
  on `enemyBulletLayer`, whose blend is normal.
- **Palette:** `ENEMY_BULLET = { core: 0xfff2e0, body: 0xff5a2a, ring: 0x3a0a00 }`
  in `src/game/data/constants.ts`. There is no `ENEMY_BULLET` colour lookup in
  the renderer beyond that ring; the fill colours are literals in `sprites.ts`.
- So the reliable read is: player shots are small, shaped, additive and
  weapon-coloured; enemy shots are round, warm red/orange, carry a dark outline
  ring, and are drawn last-but-one over the whole arena.

Final layer order, bottom to top, quoted from `renderer.ts`:

```ts
this.world.addChild(
  enemyLayer,
  pickupLayer,
  thrusterLayer,
  playerLayer,
  trailLayer,
  playerBulletLayer,
  particleLayer,
  this.dmgLayer,
  telegraphLayer,
  enemyBulletLayer,
  crosshairLayer,
);
```

`playerBulletLayer.blendMode = "add"` and `trailLayer.blendMode = "add"` are set
immediately after. `enemyBulletLayer` sits above `trailLayer`,
`playerBulletLayer`, `particleLayer`, `this.dmgLayer` and `telegraphLayer`, so
enemy fire is never washed out by player effects. (The `render()` call order is
independent of final visibility: layers decide draw order, and `drawTrails()`
runs after `drawBullets()` yet still renders behind the bullet cores because
`trailLayer` is below `playerBulletLayer`.)

## Collision radius vs visual scale

`Bullet.radius` (`b.radius`) is the gameplay/collision radius. The renderer
never mutates it: `drawBullets()` sets
`s.scale = (b.radius / ref) * SHAPE_SCALE[shape] * (b.crit ? 1.2 : 1)`, i.e. the
scale-up is a sprite property only. Collision tests in
`src/game/systems/collisions.ts` use `b.radius`, so DPS and hitboxes are exactly
what they were before the visual change. The balance gate
(`npm run balance`, `scripts/balance.ts`) prints `BALANCE: OK` when no telemetry
flag is raised; it reads the same gameplay numbers, not the sprite scale.

## Trails

- **Who sets `trail`:** `rail_charge` (`updateRail()`), `prism_beam`
  (`updateBeam()`) and `seeker_swarm` (the `homing` case) all set `b.trail = 1`
  in `src/game/systems/weapons.ts`. Orbital-drone shots
  (`spawnDroneShot()`) also set `b.trail = 1`. `missile_barrage` (the active
  skill) spawns missiles directly in `progression.ts` and does **not** set a
  trail.
- **How it is drawn:** `Renderer.drawTrails()` iterates active bullets with
  `b.trail`. For each it acquires one pooled additive `glow` sprite, tints it
  `b.color`, sets `rotation = b.angle`, `width = radius * SHAPE_SCALE[shape] * 5`,
  `height = max(2, base * 1.5)`, alpha `0.34` (fading out over the last 0.25 s),
  and parks it behind the nose at `(pos - cos(angle) * len * 0.42,
  pos - sin(angle) * len * 0.42)`. That stretched glow reads as a continuous
  streak instead of a dot.
- **Cost:** reuses the existing `glow` texture and the standard `SpritePool`
  free-list. One extra `Sprite` plus one draw per live trail bullet (about 1-3 in
  practice), on its own additive `trailLayer`. There is no new texture and no
  per-frame allocation; cost is independent of quality (Low still gets trails,
  just without bloom/AA).

## Evidence

- Measured before numbers: `screenshots/before/measurements.json` (viewport
  1280x720, arena 1920x1080, fit scale 0.667).
- Before images: `screenshots/before/bullets-*.png` (one per weapon).
- After: `screenshots/after/...` (capture in progress).

## Open questions

- **Rail Charge reports `beam` but is a projectile.** `PROJECTILE_SHAPE` maps
  `rail_charge` to `"beam"`, and `bulletShape()` renders `beam` as `lance`. That
  is intentional (a thick lance), but it means the `lance` scale (3.0) applies to
  the rail shot, not a distinct rail sprite.
- **Trail on `missile_barrage` is absent.** The active skill's missiles use the
  `missile` shape but never set `b.trail`, unlike `seeker_swarm` missiles. Not a
  bug, just an inconsistency in the missile look between the weapon and the
  active.
- **`Fins` figure is approximate.** The 7.4 px fin width comes from the
  `renderer.ts` comment's `.48` fin fraction; `makeBullet("missile")` also paints
  the body separately, so the fin measurement is the widest silhouette point, not
  the body.
- **`ENEMY_BULLET.body` is not referenced by the renderer.** Only `ring` is used
  by `ringedEnemyBullet()`; the core/body colours are literals inside
  `makeEnemyBullet()`. The constant's `core`/`body` fields are effectively
  documentation.