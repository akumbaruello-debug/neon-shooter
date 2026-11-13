/**
 * Neon Dodger 2.0 — bootstrap / integration
 *
 * Wires the independent modules (Engine, Player, Enemies, PowerUps,
 * Progression, UI, Audio) into one game. Owns the game state machine,
 * collision resolution, scoring and XP flow.
 */
(function () {
    'use strict';

    const ND = (window.ND = window.ND || {});
    const C = ND.CONST || {};

    let state = 'menu'; // menu | playing | gameover
    let bestScore = 0;
    let dropTimer = 0;
    let prevDash = false;
    let bossTimer = null; // countdown while a boss is on screen
    const powerTimers = {}; // tracked power-up countdowns for the HUD
    const DASH_DAMAGE = 6;  // damage dealt to enemies dashing through them
    const BOSS_SURVIVE = 15; // seconds of dodging before the boss is destroyed

    // --- background starfield -------------------------------------------------
    const stars = [];
    function initStars() {
        stars.length = 0;
        for (let i = 0; i < 90; i++) {
            stars.push({
                x: Math.random() * C.WIDTH,
                y: Math.random() * C.HEIGHT,
                z: 0.3 + Math.random() * 0.9,
                r: 0.5 + Math.random() * 1.6,
            });
        }
    }
    function updateStars(dt) {
        for (const s of stars) {
            s.y += (12 + s.z * 46) * dt;
            if (s.y > C.HEIGHT + 2) { s.y = -2; s.x = Math.random() * C.WIDTH; }
        }
    }
    function drawStars(ctx) {
        // Deep gradient backdrop
        const g = ctx.createLinearGradient(0, 0, 0, C.HEIGHT);
        g.addColorStop(0, '#0a0a1a');
        g.addColorStop(1, '#15153a');
        ctx.fillStyle = g;
        ctx.fillRect(-24, -24, C.WIDTH + 48, C.HEIGHT + 48); // overscan: hides shake gap

        // Grid floor hint
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= C.WIDTH; x += 50) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, C.HEIGHT); ctx.stroke();
        }
        for (let y = 0; y <= C.HEIGHT; y += 50) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.WIDTH, y); ctx.stroke();
        }

        // Stars
        for (const s of stars) {
            ctx.globalAlpha = 0.25 + s.z * 0.6;
            ctx.fillStyle = s.z > 0.85 ? '#9fe8ff' : '#ffffff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // --- power-up HUD tracking -----------------------------------------------
    function trackPowerups(dt) {
        const p = ND.Player;
        const defs = [
            ['shield', p.shield, C.SHIELD_DURATION || 5],
            ['slowmo', p.slowmo, C.SLOWMO_DURATION || 4],
            ['magnet', p.magnet, C.MAGNET_DURATION || 8],
            ['multiplier', p.multiplier, C.MULTIPLIER_DURATION || 10],
        ];
        for (const [name, active, dur] of defs) {
            if (active && !powerTimers[name]) {
                powerTimers[name] = { timeLeft: dur, duration: dur };
                ND.Audio.play('powerup');
            } else if (active) {
                powerTimers[name].timeLeft = Math.max(0, powerTimers[name].timeLeft - dt);
            } else if (powerTimers[name]) {
                delete powerTimers[name];
            }
        }
    }
    function activePowersForHUD() {
        const map = {
            shield: '#22d3ee', slowmo: '#60a5fa',
            magnet: '#c084fc', multiplier: '#fbbf24',
        };
        const out = [];
        for (const name in powerTimers) {
            const t = powerTimers[name];
            out.push({ type: name, color: map[name], timeLeft: t.timeLeft, duration: t.duration });
        }
        return out;
    }

    // --- collisions -----------------------------------------------------------
    function handleCollisions() {
        const p = ND.Player;
        if (p.dead) return;

        const pr = p.width * 0.5;
        const mult = p.multiplier ? C.MULTIPLIER_VALUE : 1;
        const dashing = p.dashActive; // dash grants i-frames and deals damage

        // Enemy bodies (circle vs circle)
        const list = ND.Enemies.list;
        for (let i = list.length - 1; i >= 0; i--) {
            const e = list[i];
            if (!e.active) continue;
            const d = Math.hypot(p.x - e.x, p.y - e.y);
            if (d >= pr + e.size * 0.82) continue;

            if (dashing) {
                // Dash-through: damage the enemy, collect score on a kill.
                const res = ND.Enemies.hit(e, DASH_DAMAGE);
                if (res.destroyed) {
                    p.addScore(res.score * mult);
                    ND.Audio.play('score');
                    burstAt(res.x, res.y, res.color);
                    if (res.boss) { ND.Engine.shake(16, 0.6); ND.Audio.play('boss'); }
                }
            } else if (!p.invincible) {
                const died = p.takeDamage();
                ND.Audio.play('hit');
                ND.Engine.shake(11, 0.4);
                burstAt(e.x, e.y, e.color);
                if (e.type !== 'boss') {
                    if (e.type === 'splitter') e.type = 'drifter'; // no mini spam on a crash
                    ND.Enemies.hit(e, 9999); // remove silently, no score
                }
                if (died) { endGame(); return; }
            }
        }

        // Boss projectiles
        const proj = ND.Enemies.projectiles;
        for (let i = proj.length - 1; i >= 0; i--) {
            const q = proj[i];
            if (!q.active || dashing) continue;
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d < pr + q.size && !p.invincible) {
                const died = p.takeDamage();
                ND.Audio.play('hit');
                ND.Engine.shake(9, 0.32);
                q.y = C.HEIGHT + 100; // push off-screen; enemies.js releases it next tick
                if (died) { endGame(); return; }
            }
        }
    }

    function burstAt(x, y, color) {
        const P = ND.Engine.particles;
        if (P && typeof P.burst === 'function') P.burst(x, y, color || '#ff5d7a', 16);
    }

    // --- scoring / xp ---------------------------------------------------------
    function updateScoring(dt) {
        const p = ND.Player;
        const mult = p.multiplier ? C.MULTIPLIER_VALUE : 1;
        const gained = dt * 20 * mult;
        p.addScore(gained);
        ND.Progression.addXP(gained * (C.XP_PER_POINT || 1));
    }

    // --- power-up drops -------------------------------------------------------
    function maybeDrop(dt) {
        dropTimer -= dt;
        if (dropTimer <= 0) {
            dropTimer = 8 + Math.random() * 7;
            const x = 70 + Math.random() * (C.WIDTH - 140);
            ND.PowerUps.spawn(x, -30);
        }
    }

    // --- HUD ------------------------------------------------------------------
    function syncHUD() {
        const p = ND.Player;
        ND.UI.updateHUD({
            score: Math.floor(p.score),
            best: bestScore,
            hp: p.hp,
            maxHp: p.maxHp,
            level: ND.Progression.getLevel(),
            xp: ND.Progression.getXP(),
            xpToNext: ND.Progression.getXPToNext(),
            dashCooldown: p.dashCooldown,
            dashReady: p.dashCooldown <= 0,
            activePowerUps: activePowersForHUD(),
        });
    }

    // --- state transitions ----------------------------------------------------
    function startGame() {
        ND.Player.reset();
        ND.Enemies.init();
        ND.PowerUps.init();
        ND.Progression.reset();
        if (ND.Engine.particles) ND.Engine.particles.clear();

        for (const k in powerTimers) delete powerTimers[k];
        dropTimer = 8;
        prevDash = false;
        bossTimer = null;
        state = 'playing';

        ND.UI.showHUD();
        syncHUD();
        ND.Audio.playMusic();
        ND.Audio.play('click');
    }

    function endGame() {
        if (state === 'gameover') return;
        state = 'gameover';

        const score = Math.floor(ND.Player.score);
        if (score > bestScore) {
            bestScore = score;
            try { localStorage.setItem('nd2_bestScore', String(bestScore)); } catch (e) {}
        }
        ND.Audio.stopMusic();
        ND.Audio.play('gameover');
        ND.UI.showGameOver(score, ND.Progression.getLevel(), ND.Progression.getXP());
    }

    function onLevelUp(level, unlocks) {
        ND.Audio.play('levelup');
        ND.UI.showLevelUp(level, unlocks || []);
        if (level % 5 === 0) {
            ND.Player.heal();
            ND.Audio.play('boss');
        }
    }

    // --- boss encounter: survive the barrage to destroy the boss ------------
    function updateBoss(dt) {
        const list = ND.Enemies.list;
        let boss = null;
        for (let i = 0; i < list.length; i++) {
            if (list[i].active && list[i].type === 'boss') { boss = list[i]; break; }
        }
        if (!boss) { bossTimer = null; return; }

        if (bossTimer === null) {
            bossTimer = BOSS_SURVIVE;
            ND.Audio.play('boss');
        }
        bossTimer -= dt;
        if (bossTimer <= 0) {
            const p = ND.Player;
            const mult = p.multiplier ? C.MULTIPLIER_VALUE : 1;
            const res = ND.Enemies.hit(boss, 1e9); // destroy the boss
            if (res.destroyed) {
                p.addScore(res.score * mult);
                burstAt(res.x, res.y, res.color);
                ND.Engine.shake(18, 0.7);
                ND.Audio.play('levelup');
            }
            bossTimer = null;
        }
    }

    // --- per-frame update -----------------------------------------------------
    function update(dt) {
        updateStars(dt);
        if (state !== 'playing') return;
        if (!(dt > 0)) return;

        const p = ND.Player;
        const lvl = ND.Progression.getLevel();
        const slow = p.slowmo ? (C.SLOWMO_FACTOR || 0.4) : 1;

        p.update(dt);                 // player stays at normal speed
        if (p.dashActive && !prevDash) ND.Audio.play('dash'); // dash-start whoosh
        prevDash = p.dashActive;
        updateScoring(dt);
        ND.Enemies.update(dt * slow, lvl);
        updateBoss(dt);
        ND.PowerUps.update(dt);
        trackPowerups(dt);
        maybeDrop(dt);
        handleCollisions();
        if (state === 'playing') syncHUD();
    }

    // --- per-frame render -----------------------------------------------------
    function renderWorld(ctx) {
        if (state === 'playing' || state === 'gameover') {
            ND.Enemies.draw(ctx);
            ND.PowerUps.draw(ctx);
            ND.Player.draw(ctx);
        }
    }

    // --- boot -----------------------------------------------------------------
    function boot() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) { console.error('Neon Dodger: canvas#gameCanvas not found'); return; }

        ND.Engine.init(canvas);
        ND.Player.init(C.WIDTH / 2, C.HEIGHT * 0.82);
        ND.Enemies.init();
        ND.PowerUps.init();
        ND.Progression.init();
        ND.UI.init();
        ND.Audio.init();
        initStars();

        try {
            const stored = parseInt(localStorage.getItem('nd2_bestScore') || '0', 10);
            bestScore = isFinite(stored) ? stored : 0;
        } catch (e) { bestScore = 0; }

        ND.Progression.onLevelUp(onLevelUp);

        ND.Engine.onRender(drawStars);
        ND.Engine.onRender(renderWorld);
        ND.Engine.onUpdate(update);

        // Expose for UI buttons and canvas clicks.
        ND.startGame = startGame;

        canvas.addEventListener('click', () => {
            if (state === 'menu' || state === 'gameover') startGame();
        });

        ND.UI.showMenu();
        ND.Engine.start();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();