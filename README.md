# Neon Dodger — Starfall Aegis

A full-screen neon space shooter. 50 stages, 12 weapons, 18 skills, 5 bosses,
procedural vector art and 100% synthesized audio (no asset files, no network).

Built on Next.js (App Router) + TypeScript strict + PixiJS v8.

---

## Launch

### One click (recommended)

Double-click **Neon Dodger** on the Desktop. It runs `scripts/launch-game.ps1`, which:

1. changes to this folder,
2. builds the app only if `.next` is missing or the source is newer (a small
   "Preparing game…" window shows during the first build),
3. starts `next start` on **port 3123** (reuses an already-running server),
4. waits until the URL answers,
5. opens Chrome (else Edge, else your default browser) in app mode + fullscreen
   with a dedicated profile (`%LOCALAPPDATA%\NeonDodgerProfile`),
6. stops the server it started when that window closes.

Reinstall / remove the shortcut:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-shortcut.ps1
```

Change the port: edit `$Port` at the top of `scripts\launch-game.ps1` (and
`-p <port>` in `package.json`). See `scripts/README-launcher.md`.

### Development

```bash
npm install
npm run dev        # http://localhost:3123
npm run build
npm start          # production server on :3123
npm run typecheck
npm run lint
npm run balance    # headless balance report (scripts/balance.ts)
```

URL flags: `?autostart=1` skips the title and starts a run (offers "Continue
Stage N" if a checkpoint exists). Add `?new=1` to force a fresh run instead.
`?debug=1` opens the developer panel (stage jump, level, grant weapon/skill,
god mode, spawn enemy/boss, time scale, FPS/entity counters).

Screenshots: `npm run shots` drives the system Chrome (no browser download) and
writes PNGs to `screenshots/`; it needs the server running on :3123 first.

---

## Controls

| Action | Keys |
|---|---|
| Move | `WASD` / arrow keys |
| Aim | mouse (ship turns toward the cursor) |
| Fire | hold Left Mouse / `Space` |
| Auto-fire | `T` (or the setting) |
| Dash (+ i-frames) | `Shift` / Right Mouse |
| Active skills | `1`–`5` |
| Pause | `Esc` or `P` |
| Mute | `M` |
| Cards | click, `1`–`5`, or arrows + `Enter` |
| Fullscreen | `F11` (and the settings toggle) |

All keys are rebindable in **Settings → Controls**.

---

## Where to tweak balance

Everything numeric lives in `src/game/data/`:

| File | What it controls |
|---|---|
| `constants.ts` | arena size, player hull/shield/speed, dash, spawn rules, sector palettes |
| `weapons.ts` | the 12 bullet types: damage, fire rate, spread, pierce, mastery ranks |
| `skills.ts` | the 18 skills, 5 levels each + capstone |
| `enemies.ts` | rocks (4 variants × 3 sizes), Raider, Breaker |
| `bosses.ts` | the 5 bosses: HP, radius, phases, pattern lists, target seconds |
| `stages.ts` | the 50-stage table: composition, budget, waves, target duration |
| `xp.ts` | the XP curve `10 + 6L + 0.9L^1.6` |
| `boons.ts` | the 8 legendary boons |

Tier scaling (per 4 stages): HP ×1.15, damage ×1.08, quantity ×1.10 — in
`systems/enemies.ts` (stats) and `systems/spawner.ts` (counts).

Run `npm run balance` after any change: it prints per-stage HP/damage/counts,
expected time-to-clear, weapon DPS spread and the threat steps, and exits
non-zero when something falls outside the target bands.

---

## Design decisions

Filled in as the build progressed — see the section at the bottom of this file.

---

## Project layout

```
app/                     Next.js App Router shell (layout, page)
src/components/          React DOM UI (title, HUD, cards, menus, settings)
src/hooks/useGame.ts     React <-> engine bridge
src/game/                the engine (plain TypeScript, no React)
  core/                  loop, input, rng, pools, spatial hash, math, emitter
  data/                  all balance tables
  render/                PixiJS renderer, procedural sprites, icons
  audio/                 synthesized SFX + adaptive music
  systems/               weapons, enemies, bosses, spawner, collisions, progression
  game.ts                facade: state machine, run flow, HUD
scripts/                 launcher, shortcut, balance report
legacy/                  the original vanilla game (kept for reference)
```

---

## Design decisions (chosen where the brief left room)

1. **Project location** — the brief said "the current game is in this project
   folder". The only game here was `stuff/subagent-demo-game` (a vanilla
   HTML/JS game, "Neon Dodger 2.0"), so that folder became the project and
   **the name was kept** (the rule was "keep the current name if it already has
   one"). The working title "Starfall Aegis" is used as the subtitle.
2. **Stack** — the old game was static HTML with no build. The brief explicitly
   requires TypeScript, PixiJS, `next start` and a `.next` build, so a Next.js
   App Router + TS strict app was created in place; the old files were moved to
   `legacy/` rather than deleted.
3. **Engine/React split** — all simulation is plain TS under `src/game`; React
   only renders DOM overlays. The engine is headless-capable (the balance script
   imports the data modules with no DOM).
4. **Rendering** — PixiJS v8 + pixi-filters, locked in P0. If WebGL is
   unavailable the shell falls back to a `NullRenderer` instead of crashing.
5. **Fixed 60 Hz + interpolation** — the loop accumulates real time and steps
   the simulation in fixed 1/60 s slices, passing an `alpha` to the renderer, so
   gameplay is identical on 60/144/240 Hz displays.
6. **Bosses and the bottom lane** — the player can move anywhere in the arena,
   so bosses are fought with normal weapons; the "survive" fallback used by the
   old game was dropped.
7. **Fairness first** — enemy bullets and telegraphs always render above player
   effects; no enemy may damage the player within 0.8 s of spawning; every heavy
   attack telegraphs ≥ 0.7 s; no single hit exceeds 35% of hull+shield.
8. **Save keys** — new keys are namespaced `nd.*` (`nd.settings.v1`,
   `nd.bestStage.v1`, `nd.highScore.v1`, `nd.checkpoint.v1`). The old game's
   `nd2_*` keys are deliberately left untouched.

---

## Screenshots

Generated with `npm run shots` into `screenshots/` (see that command in
`package.json`).
