/**
 * Core engine module for Neon Dodger 2.0.
 *
 * Responsibilities:
 *  - Owns the canvas (800x600) and scales it to fit the window.
 *  - Runs the requestAnimationFrame game loop with delta-time updates
 *    (performance.now(), seconds) instead of frame counting.
 *  - Applies a global time scale so slow-motion power-ups work everywhere.
 *  - Tracks keyboard input (arrows / WASD / Space / M).
 *  - Runs the particle system (glow particles, trails, explosion bursts)
 *    using additive blending.
 *  - Applies a decaying camera-shake offset to the rendered frame.
 *
 * Exposed as window.ND.Engine.
 */

window.ND = window.ND || {};
var ND = window.ND;

ND.Engine = (function () {
    'use strict';

    const CONST = ND.CONST || {};
    const WIDTH = CONST.WIDTH || 800;
    const HEIGHT = CONST.HEIGHT || 600;

    /** Largest delta (seconds) the simulation will integrate in one step. */
    const MAX_DT = 1 / 20;

    /** Hard cap so a particle storm can never exhaust memory. */
    const MAX_PARTICLES = 2000;

    // --------------------------------------------------------------- state
    let canvas = null;
    let ctx = null;

    let running = false;
    let rafId = 0;
    let lastTime = 0;
    let elapsed = 0;      // game time in seconds (affected by timeScale)
    let timeScale = 1;    // 1 = normal speed, < 1 = slow motion

    const updateCallbacks = [];
    const renderCallbacks = [];

    // -------------------------------------------------------- camera shake
    let shakeIntensity = 0;
    let shakeDuration = 0;
    let shakeTimeLeft = 0;
    let shakeX = 0;
    let shakeY = 0;

    // -------------------------------------------------------------- input
    // Raw key codes currently held down.
    const keys = new Set();

    // Public boolean snapshot consumed by the game modules.
    const input = {
        left: false,
        right: false,
        up: false,
        down: false,
        dash: false,
        muted: false,
    };

    const HANDLED_CODES = new Set([
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'KeyA', 'KeyD', 'KeyW', 'KeyS',
        'Space', 'KeyM',
    ]);

    // KeyboardEvent.key values mapped to the logical codes above, so input
    // works whether the caller provides `code` (recommended) or `key`.
    const KEY_ALIASES = {
        ArrowLeft: 'ArrowLeft', Left: 'ArrowLeft',
        ArrowRight: 'ArrowRight', Right: 'ArrowRight',
        ArrowUp: 'ArrowUp', Up: 'ArrowUp',
        ArrowDown: 'ArrowDown', Down: 'ArrowDown',
        ' ': 'Space', Space: 'Space', Spacebar: 'Space',
        a: 'KeyA', A: 'KeyA',
        d: 'KeyD', D: 'KeyD',
        w: 'KeyW', W: 'KeyW',
        s: 'KeyS', S: 'KeyS',
        m: 'KeyM', M: 'KeyM',
    };

    // ----------------------------------------------------------- particles
    const particleList = [];

    /** Return `value` unless it is undefined, in which case `fallback`. */
    function pick(value, fallback) {
        return value === undefined ? fallback : value;
    }

    /**
     * Create a single particle.
     * @param {number} x
     * @param {number} y
     * @param {Object} [opts]
     * @param {number} [opts.vx=0]          velocity x (px/sec)
     * @param {number} [opts.vy=0]          velocity y (px/sec)
     * @param {number} [opts.life=1]         lifetime (seconds)
     * @param {string} [opts.color='#00d4ff']
     * @param {number} [opts.size=3]         radius (px)
     * @param {boolean} [opts.glow=true]     draw with additive blending
     * @param {number} [opts.drag=0]         velocity damping per second
     * @param {number} [opts.gravity=0]      downward acceleration (px/sec^2)
     * @param {boolean} [opts.shrink=true]   shrink to nothing over lifetime
     * @param {boolean} [opts.fade=true]     fade alpha over lifetime
     * @param {number} [opts.alpha=1]        starting alpha (0..1)
     * @param {boolean|Object|number} [opts.trail=null]
     *        trail emitter config: true uses defaults, a number sets the
     *        emissions-per-second rate, an object supports
     *        { rate, color, size, life }.
     * @returns {Object} the created particle
     */
    function spawnParticle(x, y, opts) {
        const o = opts || {};

        if (particleList.length >= MAX_PARTICLES) {
            particleList.shift(); // drop the oldest particle
        }

        const life = Math.max(0.0001, pick(o.life, 1));
        const p = {
            x: Number(x) || 0,
            y: Number(y) || 0,
            vx: pick(o.vx, 0),
            vy: pick(o.vy, 0),
            life,
            age: 0,
            color: pick(o.color, '#00d4ff'),
            size: pick(o.size, 3),
            glow: pick(o.glow, true),
            drag: pick(o.drag, 0),
            gravity: pick(o.gravity, 0),
            shrink: pick(o.shrink, true),
            fade: pick(o.fade, true),
            alpha: pick(o.alpha, 1),
            trail: null,
            trailTimer: 0,
        };

        if (o.trail) {
            const t = typeof o.trail === 'object' ? o.trail : {};
            p.trail = {
                rate: typeof o.trail === 'number' ? o.trail : pick(t.rate, 30),
                color: pick(t.color, p.color),
                size: pick(t.size, Math.max(1, p.size * 0.5)),
                life: pick(t.life, Math.min(0.4, p.life * 0.5)),
            };
        }

        particleList.push(p);
        return p;
    }

    /**
     * Explosion burst: spawn `count` glowing particles flying outward.
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * @param {number} [count=20]
     * @param {Object} [opts] optional overrides: speedMin, speedMax, lifeMin,
     *        lifeMax, sizeMin, sizeMax, drag, gravity, angle, spread, trail
     * @returns {Object[]} the created particles
     */
    function burst(x, y, color, count, opts) {
        const o = opts || {};
        const total = count === undefined ? 20 : count;
        const lifeMin = pick(o.lifeMin, 0.4);
        const lifeMax = pick(o.lifeMax, 1);
        const sizeMin = pick(o.sizeMin, 2);
        const sizeMax = pick(o.sizeMax, 5);
        const speedMin = pick(o.speedMin, 60);
        const speedMax = pick(o.speedMax, 280);
        const baseAngle = o.angle === undefined ? null : o.angle;
        const spread = pick(o.spread, Math.PI * 2);
        const created = [];

        for (let i = 0; i < total; i++) {
            const angle = baseAngle === null
                ? Math.random() * Math.PI * 2
                : baseAngle + (Math.random() - 0.5) * spread;
            const speed = speedMin + Math.random() * Math.max(0, speedMax - speedMin);
            const life = lifeMin + Math.random() * Math.max(0, lifeMax - lifeMin);
            const size = sizeMin + Math.random() * Math.max(0, sizeMax - sizeMin);

            created.push(spawnParticle(x, y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life,
                color,
                size,
                drag: pick(o.drag, 1.5),
                gravity: pick(o.gravity, 0),
                glow: pick(o.glow, true),
                shrink: pick(o.shrink, true),
                fade: pick(o.fade, true),
                trail: o.trail || null,
            }));
        }

        return created;
    }

    /**
     * Integrate every particle by `dt` seconds and remove dead ones.
     * @param {number} dt - scaled delta time in seconds
     */
    function updateParticles(dt) {
        for (let i = particleList.length - 1; i >= 0; i--) {
            const p = particleList[i];
            p.age += dt;

            if (p.age >= p.life) {
                // Swap-remove: particle order is irrelevant.
                particleList[i] = particleList[particleList.length - 1];
                particleList.pop();
                continue;
            }

            if (p.gravity) p.vy += p.gravity * dt;

            if (p.drag) {
                const damp = Math.max(0, 1 - p.drag * dt);
                p.vx *= damp;
                p.vy *= damp;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // Emit trail particles at a fixed rate while this particle lives.
            if (p.trail) {
                p.trailTimer -= dt;
                while (p.trailTimer <= 0) {
                    p.trailTimer += 1 / p.trail.rate;
                    spawnParticle(p.x, p.y, {
                        vx: -p.vx * 0.05,
                        vy: -p.vy * 0.05,
                        life: p.trail.life,
                        color: p.trail.color,
                        size: p.trail.size,
                        glow: true,
                        shrink: true,
                        fade: true,
                    });
                }
            }
        }
    }

    /**
     * Draw all live particles. Glow particles use additive blending
     * ('lighter') so overlapping particles bloom instead of occluding.
     * @param {CanvasRenderingContext2D} context
     */
    function drawParticles(context) {
        if (particleList.length === 0) return;

        const previousComposite = context.globalCompositeOperation;
        const previousAlpha = context.globalAlpha;

        for (let i = 0; i < particleList.length; i++) {
            const p = particleList[i];
            const remaining = 1 - p.age / p.life;
            const alpha = (p.fade ? remaining : 1) * p.alpha;
            if (alpha <= 0) continue;

            const size = p.shrink ? Math.max(0.05, p.size * remaining) : p.size;
            const radius = p.glow ? size * 3 : size;

            context.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
            context.globalAlpha = Math.max(0, Math.min(1, alpha));

            // A solid core (0..0.3) falling off to transparent gives a
            // readable centre plus a soft neon halo.
            const glow = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
            glow.addColorStop(0, p.color);
            glow.addColorStop(0.3, p.color);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            context.fillStyle = glow;
            context.beginPath();
            context.arc(p.x, p.y, radius, 0, Math.PI * 2);
            context.fill();
        }

        context.globalCompositeOperation = previousComposite;
        context.globalAlpha = previousAlpha;
    }

    const particles = {
        /** Live particle array (read-only use is recommended). */
        list: particleList,
        spawn: spawnParticle,
        burst,
        update: updateParticles,
        draw: drawParticles,
        /** Remove every particle immediately. */
        clear() {
            particleList.length = 0;
        },
        /** Number of live particles. */
        get count() {
            return particleList.length;
        },
    };

    // -------------------------------------------------------------- input
    /** Rebuild the public boolean snapshot from the held-key set. */
    function syncInput() {
        input.left = keys.has('ArrowLeft') || keys.has('KeyA');
        input.right = keys.has('ArrowRight') || keys.has('KeyD');
        input.up = keys.has('ArrowUp') || keys.has('KeyW');
        input.down = keys.has('ArrowDown') || keys.has('KeyS');
        input.dash = keys.has('Space');
    }

    /**
     * Resolve a keyboard event into one of our logical key codes.
     * Accepts both `event.code` and `event.key`.
     */
    function resolveKeyCode(e) {
        const code = e.code;
        if (code && HANDLED_CODES.has(code)) return code;

        const key = e.key;
        if (key === undefined || key === null) return '';
        if (KEY_ALIASES[key]) return KEY_ALIASES[key];
        return key.length === 1 ? 'Key' + key.toUpperCase() : key;
    }

    /** Let the Audio module know the mute state changed. */
    function emitMuteEvent() {
        if (typeof window === 'undefined' || !window.dispatchEvent) return;

        const detail = { muted: input.muted };
        if (typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('nd:mute', { detail }));
        } else if (typeof document !== 'undefined' && document.createEvent) {
            const ev = document.createEvent('CustomEvent');
            ev.initCustomEvent('nd:mute', false, false, detail);
            window.dispatchEvent(ev);
        }
    }

    function onKeyDown(e) {
        const code = resolveKeyCode(e);
        if (!HANDLED_CODES.has(code)) return;

        // Stop arrows/space from scrolling the page or activating buttons.
        if (e.preventDefault) e.preventDefault();

        // M toggles mute once per physical press (ignore auto-repeat).
        if (code === 'KeyM' && !e.repeat) {
            input.muted = !input.muted;
            emitMuteEvent();
        }

        keys.add(code);
        syncInput();
    }

    function onKeyUp(e) {
        keys.delete(resolveKeyCode(e));
        syncInput();
    }

    /** Releasing everything on blur avoids "stuck key" bugs. */
    function onWindowBlur() {
        keys.clear();
        syncInput();
    }

    // ------------------------------------------------------- canvas setup
    /** Scale the canvas with CSS so it fits the window, keeping 800:600. */
    function fitCanvas() {
        if (!canvas) return;

        const availW = window.innerWidth || WIDTH;
        const availH = window.innerHeight || HEIGHT;
        const scale = Math.min(availW / WIDTH, availH / HEIGHT);
        const scaledW = Math.max(1, Math.floor(WIDTH * scale));
        const scaledH = Math.max(1, Math.floor(HEIGHT * scale));

        canvas.style.width = scaledW + 'px';
        canvas.style.height = scaledH + 'px';
    }

    function attachListeners() {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onWindowBlur);
        window.addEventListener('resize', fitCanvas);
    }

    function detachListeners() {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onWindowBlur);
        window.removeEventListener('resize', fitCanvas);
    }

    /**
     * Set up the canvas, 2D context, input listeners and particle state.
     * @param {HTMLCanvasElement} canvasEl
     * @returns {Object} the engine API (for chaining)
     */
    function init(canvasEl) {
        if (!canvasEl) {
            throw new TypeError('Engine.init: a canvas element is required');
        }

        // Re-init on a different canvas: don't leave duplicate listeners.
        if (ctx) detachListeners();

        canvas = canvasEl;
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';

        ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Engine.init: unable to acquire a 2D rendering context');
        }

        fitCanvas();
        attachListeners();
        syncInput();

        return api;
    }

    // ----------------------------------------------------------- game loop
    /**
     * Advance the camera shake using real (unscaled) time so the effect
     * feels the same regardless of slow motion.
     */
    function updateShake(dt) {
        if (shakeTimeLeft > 0) {
            shakeTimeLeft = Math.max(0, shakeTimeLeft - dt);
            const progress = shakeDuration > 0 ? shakeTimeLeft / shakeDuration : 0;
            const strength = shakeIntensity * progress;

            shakeX = (Math.random() * 2 - 1) * strength;
            shakeY = (Math.random() * 2 - 1) * strength;
        } else {
            shakeX = 0;
            shakeY = 0;
        }
    }

    /** Clear, apply the shake transform, run render callbacks, draw particles. */
    function render() {
        if (!ctx) return;

        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Copy so a callback can safely register/unregister callbacks.
        const callbacks = renderCallbacks.slice();
        for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](ctx);
        }

        // Particles render last so explosions and trails stay on top.
        drawParticles(ctx);

        ctx.restore();

        // Leave the context in a clean state for the next caller.
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    /** requestAnimationFrame tick. Uses performance.now() for timing. */
    function tick() {
        if (!running) return;

        const now = performance.now();
        let dt = (now - lastTime) / 1000;
        lastTime = now;

        // Guard against negative/NaN deltas and huge tab-switch jumps.
        if (!(dt > 0)) dt = 0;
        if (dt > MAX_DT) dt = MAX_DT;

        const scaledDt = dt * timeScale;
        elapsed += scaledDt;

        updateShake(dt);
        updateParticles(scaledDt);

        const callbacks = updateCallbacks.slice();
        for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](scaledDt, timeScale);
        }

        render();

        rafId = requestAnimationFrame(tick);
    }

    /** Start (or restart) the game loop. Safe to call more than once. */
    function start() {
        if (running) return;
        running = true;
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
    }

    /** Stop the game loop and cancel any pending frame. */
    function stop() {
        running = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    /**
     * Register a per-frame update callback.
     * @param {Function} cb - called as cb(dt, timeScale); dt is the scaled
     *        delta time in seconds.
     * @returns {Function} unsubscribe
     */
    function onUpdate(cb) {
        if (typeof cb !== 'function') return function () {};
        updateCallbacks.push(cb);

        let active = true;
        return function unsubscribe() {
            if (!active) return;
            active = false;
            const index = updateCallbacks.indexOf(cb);
            if (index !== -1) updateCallbacks.splice(index, 1);
        };
    }

    /**
     * Register a per-frame render callback.
     * @param {Function} cb - called as cb(ctx) inside the shake transform
     * @returns {Function} unsubscribe
     */
    function onRender(cb) {
        if (typeof cb !== 'function') return function () {};
        renderCallbacks.push(cb);

        let active = true;
        return function unsubscribe() {
            if (!active) return;
            active = false;
            const index = renderCallbacks.indexOf(cb);
            if (index !== -1) renderCallbacks.splice(index, 1);
        };
    }

    /**
     * Trigger a screen shake. A weaker shake will not cut a stronger one
     * short; a stronger shake replaces the current one.
     * @param {number} intensity - peak offset in pixels
     * @param {number} duration  - seconds over which the shake decays
     */
    function shake(intensity, duration) {
        const next = Math.max(0, Number(intensity) || 0);
        const dur = Math.max(0.05, Number(duration) || 0.3);

        const current = shakeTimeLeft > 0 && shakeDuration > 0
            ? shakeIntensity * (shakeTimeLeft / shakeDuration)
            : 0;

        if (next >= current) {
            shakeIntensity = next;
            shakeDuration = dur;
            shakeTimeLeft = dur;
        }
    }

    /** Set the global time scale (slow-motion power-up). */
    function setTimeScale(scale) {
        const value = Number(scale);
        timeScale = isFinite(value) && value >= 0 ? value : 1;
    }

    function getTimeScale() {
        return timeScale;
    }

    /** Toggle mute; returns the new muted state. */
    function toggleMute() {
        input.muted = !input.muted;
        emitMuteEvent();
        return input.muted;
    }

    // ------------------------------------------------------------- API
    const api = {
        init,
        start,
        stop,
        onUpdate,
        onRender,

        /** Boolean keyboard state: { left, right, up, down, dash, muted }. */
        input,

        /** Particle system: spawn/burst/update/draw/clear. */
        particles,

        shake,

        /** Elapsed game time in seconds (affected by timeScale). */
        getTime() {
            return elapsed;
        },

        setTimeScale,
        getTimeScale,
        toggleMute,

        /** Logical canvas size. */
        width: WIDTH,
        height: HEIGHT,

        // Live getters (values change during init).
        get canvas() {
            return canvas;
        },
        get context() {
            return ctx;
        },
        get timeScale() {
            return timeScale;
        },
        set timeScale(value) {
            setTimeScale(value);
        },
        get isRunning() {
            return running;
        },
    };

    return api;
})();
