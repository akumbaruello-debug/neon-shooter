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