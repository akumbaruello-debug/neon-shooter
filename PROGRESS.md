# PROGRESS — Neon Shooter

Branch `shooter-overhaul`. Stack: Next.js App Router + TS strict + PixiJS v8 + pixi-filters.
Old vanilla game preserved in `legacy/` (snapshot commit `f2cf284` on `main`).

## Status: feature-complete, in polish/verification

### P0 Inspect and plan — DONE
- git snapshot + `legacy/` move, branch `shooter-overhaul`.
- Engine: plain TS under `src/game/`, fixed 60 Hz + interpolated render. NullRenderer fallback.

### P1 Foundation — DONE
- [x] fixed-step loop, dynamic client-only load
- [x] PixiJS renderer + bloom + vignette + sector palettes
- [x] data tables (weapons, skills, enemies, bosses, stages, xp, boons)
- [x] pools + spatial hash + Low/High quality + auto-pause on blur
- [x] full-screen canvas + UI scale + F11/button
- [x] localStorage save (new `nd.*` keys; legacy `nd2_*` untouched)
- [x] launcher `scripts/launch-game.ps1` + Desktop shortcut + `public/ship.ico`
- [x] `?autostart=1` + 3-2-1 countdown + checkpoint prompt + audio unlock hint
- [x] controls (WASD/arrows, mouse aim, LMB/Space, Shift/RMB dash, 1-5 skills, rebind)

### P2 Weapons and skills — DONE
- [x] 12 weapons (+mastery) + 18 skills (10 passive / 8 active, capstones)
- [x] card flow (weapon cards at L1, skill cards after, rerolls)
- [x] Armory after bosses 10/20/30/40 + pre-final

### P3 Enemies and stages — DONE
- [x] rocks / raider / breaker, telegraphs, spawn FX + grace
- [x] 50 stages, tiers, 5 sectors, compositions
- [x] pickups + magnet

### P4 Bosses and flow — DONE
- [x] 5 bosses (unique skins, patterns, phase notches)
- [x] Supply Drop + boons; Game Over / Victory

### P5 Polish — IN PROGRESS
- [x] boss render fix (spawnFx never decayed → near-black; ticked in BossSystem now)
- [x] countdown timeScale freeze fix
- [x] autostart + checkpoint prompt + audio unlock hint
- [x] 7 screenshots regenerated, no console errors (`node scripts/shots.mjs`)
- [x] balance: 0 flags (`npm run balance` → `BALANCE: OK`); weapons within ±25% DPS, 22 stages retuned
- [x] QA shots extended to 10 (title, stage, cards, telegraph, bosses 10/30/50, pause+settings, armory, game over)
- [ ] launcher end-to-end GUI test (logic validated; browser open/close not run)
- [ ] final playtest on real GPU

## Verification log
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (0 errors, 0 warnings)
- `npm run build` — passes (static, 4 pages)
- `node scripts/shots.mjs` — 10 PNGs in `screenshots/`, no console errors
- `npm run balance` — `BALANCE: OK` (0 flags); final level 41/40-45 PASS
- Launcher: `Test-Port`/`Test-NeedBuild` validated (reuse + skip-build paths); GUI open/close not run

## Bugfix pass 1 — branch `bugfix-pass-1`

All items below were reproduced first (`screenshots/before/`, 19 PNG + `measurements.json`
+ `before-log.txt`), then fixed, then re-measured (`screenshots/after/`, 20 PNG +
`measurements.json`, `shots-log.txt`) with machine-readable reports under `screenshots/`.

### 1. Skills did not activate (input edge) — FIXED
Cause: `loop.ts` never called `afterUpdate()`, so `justPressed` edges were never
cleared/consumed → keyboard activations dead (mouse aim still worked).
Fix: `loop.ts` calls `afterUpdate()` each fixed step; `progression.ts` `activate()`
runs the per-active effect and sets the slot cooldown.
Proof: `screenshots/skills-report.json` (18/18 PASS), `after/skill-hud.png`, after
`measurements.json` `skills.keyResults` (all 5 slots `fired: true`).

### 2. Skill icons + key mapping — FIXED
Cause: cards/HUD showed emoji `icon` and a hardcoded key, unrelated to the real binding.
Fix: icons painted from the skill id (`SKILL_PAINTERS: Record<SkillId, Painter>`,
`src/game/render/icons.ts` → `src/components/skillIcon.ts`); HUD/pause/cards/Armory
read the live keybinding of the slot; passives show no key.
Proof: `after/skill-hud.png`, `after/cards-skill.png`, `after/armory.png`; tables in
`docs/SKILLS.md`.

### 3. Invisible edge wall — FIXED
Cause: `player.ts` clamped with `radius * 0.8`, ignoring the sprite and the letterboxed
arena; the ship stopped short of the real screen edge.
Fix: arena follows the viewport aspect (`ARENA_H` fixed 1080, `ARENA_W` via
`setArenaWidth()` in `renderer.resize()`; no dead bands); clamp uses the rotated sprite
AABB (±43 wings, ±46 nose).
Proof: `screenshots/edges-report.json` (20/20 PASS at 1280x720/1920x1080/1024x768/1440x900
+ mid-game resize), `after/edge-{left,right,top,bottom}.png`.

### 4. Bullets too small / wrong shape — FIXED
Cause: sprites ~1.2–1.5 px wide; no crescent shape; 90° orientation bug; trails unwired.
Fix: per-shape visual scale (`SHAPE_SCALE` in `renderer.ts`, never in `data/weapons.ts`
so DPS/hitboxes are unchanged); real crescent; orientation corrected; pooled trails;
layer order puts enemy bullets above player FX.
Proof: `after/bullets-*.png` (12), `after/enemy-bullets.png`; table in `docs/BULLETS.md`.

### 5. Additional bugs found by live QA — FIXED
- Boss never dealt contact damage: `enemies.ts` skipped `isBoss` before ticking
  `graceLeft` → it stayed at 0.8 → `collisions.ts` always skipped boss contact (and the
  ram instakill guard was unreachable). Fix: tick grace for bosses, still skip boss AI.
  Verified: hull+shield 140.0 → 112.2 (Δ 27.8) with the boss surviving (`enemies = 1`).
- `godMode(true)` did not block enemy fire: `applyPlayerHit` called `player.takeDamage`
  directly. Fix: route through `ctx.damagePlayer`. Verified Δ 0.00.
- No auto-pause on blur (README/PROGRESS claimed it). Fix: `game.ts` pauses on `window`
  blur + `visibilitychange` while `mode === "playing"` (no-op during countdown).
- Esc did not resume: shell + engine both toggled; and while paused `timeScale = 0` meant
  `update()` never polled the key. Fix: shell handles modal-only Esc in the capture phase;
  engine owns the toggle; paused steps the loop but returns before simulating.
- Skill-slot gating: `slotsUsed()` counted passives too, so after 5 skills of any kind all
  new skills were blocked. Fix: `activeSlotsUsed()` / `hasFreeActiveSlot()`; new actives
  need a free slot, new passives always eligible.
- Settings roster: pause/settings now list every owned skill with icon, level and key.
Proof: `screenshots/hunt/report.json` (0 persisting anomalies, 0 console errors) + 8
`hunt/*-after.png`; `after/measurements.json`.

### Gates (final, `screenshots/verification.txt`)
- `npx tsc --noEmit` → `TSC_EXIT=0`
- `npm run lint` → `LINT_EXIT=0` (0 errors, 0 warnings)
- `npm run balance` → `BALANCE: OK`, `BALANCE_EXIT=0`
- `npm run build` → `BUILD_EXIT=0`
- `node scripts/shots.mjs` → 10 PNG, 0 console errors
- `node scripts/qa-before.mjs` (QA_OUT=after) → 0 console errors

### Still open
- [ ] launcher end-to-end GUI test (browser open/close not run)
- [ ] final playtest on real GPU (headless SwiftShader runs ~5 FPS)

### Docs
- `docs/SKILLS.md` — 18 skills: type, painted icon, default key (rebindable), effect,
  cooldown, level-5 totals + capstones, and the "broken before this pass" list.
- `docs/BULLETS.md` — the 12 bullet shapes, before→after on-screen widths, trail
  implementation, enemy-vs-player bullet distinction and layer order.