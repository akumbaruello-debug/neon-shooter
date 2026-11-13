/**
 * Neon Dodger 2.0 — PowerUps module
 *
 * Contract (window.ND.PowerUps):
 *   init()               — initialize the power-up list
 *   update(dt)           — move power-ups, sparkles, collection, despawn
 *   draw(ctx)            — render glowing power-ups + sparkles
 *   clear()              — remove every power-up
 *   spawn(x, y, type)    — spawn a power-up at a position
 *   list                 — array of active power-ups
 *
 * Pickup effects are delegated to window.ND.Player.addPowerUp(type).
 * Durations/level values come from window.ND.CONST where available.
 */
(function () {
    'use strict';

    const ND = (window.ND = window.ND || {});
    const TAU = Math.PI * 2;

    // --- Tunables (fall speed is deliberately slower than enemy movement) ---
    const FALL_SPEED_MIN = 34;   // px/sec
    const FALL_SPEED_MAX = 56;   // px/sec
    const POWERUP_SIZE = 28;     // px (diameter)
    const BOB_AMPLITUDE = 4;     // px of vertical float
    const DESPAWN_MARGIN = 60;   // px below the canvas before removal
    const MAX_SPARKLES = 180;

    const TYPES = {
        shield: {
            color: '#22d3ee',                       // cyan
            glow: 'rgba(34, 211, 238, 0.55)',
            icon: 'hexagon',
            durationKey: 'SHIELD_DURATION',
            fallbackDuration: 5,
        },
        slowmo: {
            color: '#60a5fa',                       // blue
            glow: 'rgba(96, 165, 250, 0.55)',
            icon: 'clock',
            durationKey: 'SLOWMO_DURATION',
            fallbackDuration: 4,
        },
        magnet: {
            color: '#c084fc',                       // purple
            glow: 'rgba(192, 132, 252, 0.55)',
            icon: 'magnet',
            durationKey: 'MAGNET_DURATION',
            fallbackDuration: 8,
        },
        multiplier: {
            color: '#fbbf24',                       // gold
            glow: 'rgba(251, 191, 36, 0.55)',
            icon: 'text',
            text: 'x2',
            durationKey: 'MULTIPLIER_DURATION',
            fallbackDuration: 10,
        },
        health: {
            color: '#34d399',                       // green
            glow: 'rgba(52, 211, 153, 0.55)',
            icon: 'plus',
            durationKey: null,
            fallbackDuration: 0,
        },
    };

    // Mutable state. `list` is created once and mutated in place so external
    // references to ND.PowerUps.list stay valid across init()/clear().
    const list = [];
    const sparkles = [];

    const PowerUps = {
        list,
        TYPES,

        init() {
            list.length = 0;
            sparkles.length = 0;
        },

        update(dt) {
            dt = typeof dt === 'number' && isFinite(dt) ? Math.max(0, dt) : 0;
            const bounds = getPlayerBounds();
            const floor = ((ND.CONST && ND.CONST.HEIGHT) || 600) + DESPAWN_MARGIN;

            for (let i = list.length - 1; i >= 0; i--) {
                const p = list[i];
                p.age += dt;
                p.y += p.vy * dt;
                p.bobPhase += p.bobSpeed * dt;

                // Ambient sparkle emission.
                p.sparkleTimer -= dt;
                if (p.sparkleTimer <= 0) {
                    p.sparkleTimer = 0.08 + Math.random() * 0.12;
                    emitSparkle(p);
                }

                if (bounds && hitPlayer(p, bounds)) {
                    collect(p);
                    list.splice(i, 1);
                    continue;
                }

                // Despawn once fully below the screen.
                if (p.y - p.size > floor) {
                    list.splice(i, 1);
                }
            }

            updateSparkles(dt);
        },

        draw(ctx) {
            if (!ctx) return;
            for (let i = 0; i < list.length; i++) {
                drawPowerUp(ctx, list[i]);
            }
            drawSparkles(ctx);
        },

        clear() {
            list.length = 0;
            sparkles.length = 0;
        },

        spawn(x, y, type) {
            const key = pickType(type);
            const def = TYPES[key];
            list.push({
                x: Number(x) || 0,
                y: Number(y) || 0,
                size: POWERUP_SIZE,
                type: key,
                color: def.color,
                glow: def.glow,
                bobPhase: Math.random() * TAU,
                bobSpeed: 1.6 + Math.random() * 1.2,
                bobAmp: BOB_AMPLITUDE * (0.8 + Math.random() * 0.4),
                vy: FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN),
                duration: durationOf(def.durationKey, def.fallbackDuration),
                age: 0,
                sparkleTimer: Math.random() * 0.15,
                collected: false,
            });
        },
    };

    ND.PowerUps = PowerUps;

    // ---------------------------------------------------------------------
    // Spawning / collection
    // ---------------------------------------------------------------------

    function pickType(type) {
        if (typeof type === 'string' && Object.prototype.hasOwnProperty.call(TYPES, type)) {
            return type;
        }
        const keys = Object.keys(TYPES);
        return keys[(Math.random() * keys.length) | 0];
    }

    function durationOf(key, fallback) {
        if (!key) return fallback;
        const C = ND.CONST || {};
        return typeof C[key] === 'number' ? C[key] : fallback;
    }

    function collect(p) {
        p.collected = true;
        burst(p.x, p.y + Math.sin(p.bobPhase) * p.bobAmp, p.color);

        const P = ND.Player;
        if (P && typeof P.addPowerUp === 'function') {
            try {
                P.addPowerUp(p.type);
            } catch (e) {
                /* Player module not ready yet — pickup is still consumed. */
            }
        }

        // Best-effort integration with the engine's particle system.
        const eng = ND.Engine;
        if (eng && eng.particles && typeof eng.particles.burst === 'function') {
            try {
                eng.particles.burst(p.x, p.y, p.color, 16);
            } catch (e) {
                /* Optional visual flourish only. */
            }
        }
    }

    // ---------------------------------------------------------------------
    // Collision
    // ---------------------------------------------------------------------

    function getPlayerBounds() {
        const P = ND.Player;
        if (!P) return null;
        if (typeof P.x !== 'number' || typeof P.y !== 'number' ||
            !isFinite(P.x) || !isFinite(P.y)) {
            return null;
        }

        const read = (r) =>
            r && isFinite(r.x) && isFinite(r.y) && r.width > 0 && r.height > 0
                ? [{ x: r.x, y: r.y, w: r.width, h: r.height }]
                : null;

        if (typeof P.getRect === 'function') {
            try {
                const r = read(P.getRect());
                if (r) return r;
            } catch (e) { /* fall through */ }
        }
        if (typeof P.getBounds === 'function') {
            try {
                const r = read(P.getBounds());
                if (r) return r;
            } catch (e) { /* fall through */ }
        }
        if (P.bounds) {
            const r = read(P.bounds);
            if (r) return r;
        }

        const size = (ND.CONST && ND.CONST.PLAYER_SIZE) || 32;
        const w = typeof P.width === 'number' && P.width > 0 ? P.width : size;
        const h = typeof P.height === 'number' && P.height > 0 ? P.height : size;

        // The contract exposes x/y/width/height (top-left origin). Also accept
        // center-anchored player implementations so pickups never miss.
        return [
            { x: P.x, y: P.y, w, h },
            { x: P.x - w / 2, y: P.y - h / 2, w, h },
        ];
    }

    function hitPlayer(p, bounds) {
        const cy = p.y + Math.sin(p.bobPhase) * p.bobAmp;
        const r = p.size * 0.5;
        for (let i = 0; i < bounds.length; i++) {
            const b = bounds[i];
            if (circleRect(p.x, cy, r, b.x, b.y, b.w, b.h)) return true;
        }
        return false;
    }

    function circleRect(cx, cy, cr, rx, ry, rw, rh) {
        const U = ND.Utils;
        if (U && typeof U.circleRectCollision === 'function') {
            try {
                return !!U.circleRectCollision(cx, cy, cr, rx, ry, rw, rh);
            } catch (e) { /* fall through to local implementation */ }
        }
        const nx = Math.max(rx, Math.min(cx, rx + rw));
        const ny = Math.max(ry, Math.min(cy, ry + rh));
        const dx = cx - nx;
        const dy = cy - ny;
        return dx * dx + dy * dy <= cr * cr;
    }

    // ---------------------------------------------------------------------
    // Sparkles
    // ---------------------------------------------------------------------

    function emitSparkle(p) {
        if (sparkles.length >= MAX_SPARKLES) return;
        const ang = Math.random() * TAU;
        const rad = p.size * (0.55 + Math.random() * 0.45);
        const life = 0.45 + Math.random() * 0.4;
        sparkles.push({
            x: p.x + Math.cos(ang) * rad,
            y: p.y + Math.sin(p.bobPhase) * p.bobAmp + Math.sin(ang) * rad,
            vx: (Math.random() - 0.5) * 14,
            vy: -12 - Math.random() * 18,
            life,
            maxLife: life,
            size: 1 + Math.random() * 1.6,
            color: p.color,
        });
    }

    function burst(x, y, color) {
        for (let i = 0; i < 16; i++) {
            if (sparkles.length >= MAX_SPARKLES) break;
            const ang = (i / 16) * TAU + Math.random() * 0.4;
            const speed = 60 + Math.random() * 120;
            const life = 0.5 + Math.random() * 0.35;
            sparkles.push({
                x,
                y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                life,
                maxLife: life,
                size: 1.2 + Math.random() * 2,
                color,
            });
        }
    }

    function updateSparkles(dt) {
        for (let i = sparkles.length - 1; i >= 0; i--) {
            const s = sparkles[i];
            s.life -= dt;
            if (s.life <= 0) {
                sparkles.splice(i, 1);
                continue;
            }
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= 0.98;
            s.vy = s.vy * 0.98 - 8 * dt;
        }
    }

    function drawSparkles(ctx) {
        if (!sparkles.length) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < sparkles.length; i++) {
            const s = sparkles[i];
            const t = Math.max(s.life / s.maxLife, 0);
            ctx.globalAlpha = t * 0.75;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * (0.5 + t * 0.5), 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------

    function drawPowerUp(ctx, p) {
        const def = TYPES[p.type] || TYPES.health;
        const bobY = p.y + Math.sin(p.bobPhase) * p.bobAmp;
        const pulse = 1 + Math.sin(p.bobPhase * 1.6) * 0.05;
        const r = (p.size * 0.5) * pulse;

        ctx.save();
        ctx.translate(p.x, bobY);

        // Soft neon halo.
        const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.1);
        halo.addColorStop(0, def.glow);
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.1, 0, TAU);
        ctx.fill();

        // Glowing badge.
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        if (def.icon === 'hexagon') {
            hexPath(ctx, 0, 0, r, -Math.PI / 2);
        } else {
            ctx.arc(0, 0, r, 0, TAU);
        }
        ctx.fillStyle = 'rgba(8, 12, 24, 0.85)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = def.color;
        ctx.stroke();

        // Rotating dashed orbit ring.
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.setLineDash([3, 6]);
        ctx.lineDashOffset = -p.age * 22;
        ctx.arc(0, 0, r * 1.28, 0, TAU);
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexA(def.color, 0.4);
        ctx.stroke();
        ctx.setLineDash([]);

        // Inner ring.
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.8, 0, TAU);
        ctx.lineWidth = 1;
        ctx.strokeStyle = hexA(def.color, 0.25);
        ctx.stroke();

        // Type icon.
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = def.color;
        ctx.fillStyle = def.color;
        drawIcon(ctx, def, r);

        ctx.restore();
    }

    function drawIcon(ctx, def, r) {
        switch (def.icon) {
            case 'hexagon': {
                // Shield: nested hexagon with a bright core.
                hexPath(ctx, 0, 0, r * 0.52, -Math.PI / 2);
                ctx.lineWidth = 2.2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.15, 0, TAU);
                ctx.fill();
                break;
            }

            case 'clock': {
                // Slow-mo: clock face with two hands.
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.52, 0, TAU);
                ctx.stroke();
                ctx.lineWidth = 2.2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -r * 0.34);
                ctx.moveTo(0, 0);
                ctx.lineTo(r * 0.26, r * 0.12);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.07, 0, TAU);
                ctx.fill();
                break;
            }

            case 'magnet': {
                // Horseshoe magnet, opening upward, with pale tips.
                const mr = r * 0.42;
                const my = r * 0.08;
                const lw = r * 0.24;
                const ex = Math.SQRT1_2 * mr;
                const ey = my - Math.SQRT1_2 * mr;

                ctx.lineWidth = lw;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(0, my, mr, Math.PI * 1.25, Math.PI * 1.75, true);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-ex, ey);
                ctx.lineTo(-ex, -r * 0.46);
                ctx.moveTo(ex, ey);
                ctx.lineTo(ex, -r * 0.46);
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(-ex - lw / 2, -r * 0.46, lw, r * 0.16);
                ctx.fillRect(ex - lw / 2, -r * 0.46, lw, r * 0.16);
                break;
            }

            case 'text': {
                ctx.font = '700 ' + Math.round(r * 0.72) + "px 'Segoe UI', system-ui, sans-serif";
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(def.text || 'x2', 0, r * 0.04);
                break;
            }

            case 'plus': {
                // Health cross.
                const l = r * 0.5;
                ctx.lineWidth = r * 0.22;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-l, 0);
                ctx.lineTo(l, 0);
                ctx.moveTo(0, -l);
                ctx.lineTo(0, l);
                ctx.stroke();
                break;
            }

            default:
                break;
        }
    }

    function hexPath(ctx, cx, cy, r, rotation) {
        const rot = rotation || 0;
        ctx.moveTo(cx + r * Math.cos(rot), cy + r * Math.sin(rot));
        for (let i = 1; i <= 6; i++) {
            const a = rot + (i * TAU) / 6;
            ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        ctx.closePath();
    }

    function hexA(hex, alpha) {
        let h = String(hex).replace('#', '');
        if (h.length === 3) {
            h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        }
        const n = parseInt(h, 16);
        if (!isFinite(n)) return 'rgba(255, 255, 255, ' + alpha + ')';
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    }
})();
