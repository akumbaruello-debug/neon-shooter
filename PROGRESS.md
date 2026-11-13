# PROGRESS — Starfall Aegis (Neon Dodger)

Branch `shooter-overhaul`. Stack: Next.js App Router + TS strict + PixiJS v8.
Old vanilla game preserved in `legacy/` (commit `f2cf284`, branch `main`).

## P0 Inspect and plan — DONE
- Project = `Desktop/ello/stuff/subagent-demo-game` (was a vanilla HTML game).
- git init, snapshot committed, branch `shooter-overhaul` created, old files moved to `legacy/`.
- Engine: plain TS under `src/game/` (no React), fixed 60 Hz + interpolated render.
- Renderer: PixiJS v8 + pixi-filters (decision locked). NullRenderer fallback if WebGL is missing.
- Data-driven balance in `src/game/data/`.

## P1 Foundation — IN PROGRESS
- [x] 1.1 fixed-step TS engine (`core/loop.ts`), dynamic client-only load
- [x] 1.2 PixiJS renderer + bloom (renderer.ts)
- [x] 1.3 data tables (weapons, skills, enemies, bosses, stages, xp, boons)
- [ ] 1.4 object pools (done) + spatial hash (done) + Low/High + auto-pause on blur
- [ ] 1.5 full-screen canvas + UI scale + F11/button
- [x] 1.6 localStorage save (`save.ts`, new keys, legacy keys untouched)
- [x] 2.1 launcher `scripts/launch-game.ps1` (port 3123, reuse server, app-mode browser)
- [x] 2.2 Desktop shortcut `scripts/install-shortcut.ps1` + `public/ship.ico`
- [ ] 2.3 `?autostart=1` + 3-2-1 countdown + checkpoint choice + audio unlock hint
- [ ] 2.4 launcher tested twice + README docs
- [x] 3 controls (WASD/arrows, mouse aim, LMB/Space fire, Shift/RMB dash, 1-5 skills)
- [x] 4 hull/shield/XP + level-up flow (player.ts, progression.ts)
- [x] audio engine (synth.ts/sfx.ts/music.ts)

## P2 Weapons and skills
- [x] 12 bullet types (data + `systems/weapons.ts`)
- [x] 18 skills (data + `systems/progression.ts`)
- [x] level-up card flow (weapon cards at L1, skill cards after)
- [ ] Armory after bosses
- [ ] card screens verified in-browser

## P3 Enemies and stages
- [x] shooter + smasher (systems/enemies.ts)
- [x] 50-stage table + tiers (data/stages.ts, spawner.ts)
- [ ] pickups/Armory polish

## P4 Bosses and flow
- [ ] 5 bosses (systems/bosses.ts)
- [ ] Supply Drop + boons
- [ ] Game Over / Victory screens

## P5 Polish
- [ ] art/VFX review, music/SFX audit, settings, performance, balance tuning, README

## Verification log
- `npx tsc --noEmit` — clean for engine + data (2026-11-14)
- `npx tsx scripts/balance.ts` — runs; 30 flags (weapon DPS spread + late-stage duration) — tune in P5
- Launcher/shortcut created; `Neon Dodger.lnk` on Desktop (needs end-to-end test)
