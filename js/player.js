/**
 * Neon Dodger 2.0 - Player module
 *
 * Exposes window.ND.Player conforming to ND.CONTRACTS.Player.
 *
 * Movement is horizontal only (player pinned to its initial lane in the
 * bottom third of the screen), smoothed with acceleration/deceleration.
 * Dash, i-frames, shield/slowmo/magnet/multiplier power-ups and a neon
 * ship render with engine trail are all handled here.
 */
(function () {
  'use strict';

  const ND = (window.ND = window.ND || {});
  const C = ND.CONST || {};

  // --- constants (with sane fallbacks if contracts.js loaded later) ---
  const WIDTH = C.WIDTH || 800;
  const HEIGHT = C.HEIGHT || 600;
  const PLAYER_SPEED = C.PLAYER_SPEED || 400;          // px/sec
  const PLAYER_SIZE = C.PLAYER_SIZE || 32;
  const PLAYER_MAX_HP = C.PLAYER_MAX_HP || 3;
  const INVINCIBILITY_TIME = C.INVINCIBILITY_TIME || 1.5;
  const DASH_SPEED = C.DASH_SPEED || 900;
  const DASH_DURATION = C.DASH_DURATION || 0.15;
  const DASH_COOLDOWN = C.DASH_COOLDOWN || 2.0;
  const SHIELD_DURATION = C.SHIELD_DURATION || 5.0;
  const SLOWMO_DURATION = C.SLOWMO_DURATION || 4.0;
  const MAGNET_DURATION = C.MAGNET_DURATION || 8.0;
  const MULTIPLIER_DURATION = C.MULTIPLIER_DURATION || 10.0;

  // tuning
  const ACCELERATION = 3000;   // px/sec^2 toward target speed
  const DECELERATION = 3600;   // px/sec^2 back to rest
  const TAU = Math.PI * 2;
  const TRAIL_MAX = 16;
  const TRAIL_LIFE = 0.25;

  const COLOR_CYAN = '#21e6f7';
  const COLOR_GOLD = '#ffd54a';

  function engine() {
    return ND.Engine || null;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function engineCall(fn) {
    try {
      const e = engine();
      if (e && typeof fn === 'function') fn(e);
    } catch (err) {
      /* engine module not ready - visuals are purely cosmetic */
    }
  }

  function burst(x, y, color, count) {
    engineCall(function (e) {
      if (e.particles && typeof e.particles.burst === 'function') {
        e.particles.burst(x, y, color, count);
      }
    });
  }

  function spawnParticle(x, y, opts) {
    engineCall(function (e) {
      if (e.particles && typeof e.particles.spawn === 'function') {
        e.particles.spawn(x, y, opts);
      }
    });
  }

  function shake(intensity, duration) {
    engineCall(function (e) {
      if (typeof e.shake === 'function') e.shake(intensity, duration);
    });
  }

  // --- mutable player state (closure-private) ---
  const state = {
    x: WIDTH / 2,
    y: HEIGHT * 0.8,
    initialX: WIDTH / 2,
    initialY: HEIGHT * 0.8,
    vx: 0,
    facing: 1,
    hp: PLAYER_MAX_HP,
    score: 0,

    invincible: false,
    invTimer: 0,

    shield: false,
    shieldTimer: 0,
    slowmo: false,
    slowmoTimer: 0,
    magnet: false,
    magnetTimer: 0,
    multiplier: false,
    multiplierTimer: 0,

    dashTime: 0,
    dashCooldown: 0,
    dashDir: 1,
    prevDash: false,

    dead: false,
    time: 0,

    trail: [],
    trailClock: 0,
    spawnClock: 0,
  };

  function readInput() {
    const e = engine();
    const input = e && e.input;
    if (!input) return { left: false, right: false, dash: false };
    return {
      left: !!(input.left || input.a || input.ArrowLeft),
      right: !!(input.right || input.d || input.ArrowRight),
      dash: !!(input.dash || input.shift || input.Space),
    };
  }

  function updateTrail(dt) {
    for (let i = state.trail.length - 1; i >= 0; i--) {
      const p = state.trail[i];
      p.life -= dt;
      if (p.life <= 0) state.trail.splice(i, 1);
    }
  }

  function emitEngineTrail(dir) {
    const size = PLAYER_SIZE;
    const tailX = state.x - state.facing * size * 0.45;
    const jitter = (Math.random() - 0.5) * size * 0.35;
    const dashing = state.dashTime > 0;
    spawnParticle(tailX, state.y + jitter, {
      vx: -state.facing * (30 + Math.random() * 50) + state.vx * 0.15,
      vy: (Math.random() - 0.5) * 25,
      life: dashing ? 0.4 : 0.28,
      size: dashing ? 2 + Math.random() * 3 : 1.5 + Math.random() * 2,
      color: state.multiplier ? COLOR_GOLD : COLOR_CYAN,
    });
  }

  // --- lifecycle ---

  function reset() {
    state.x = state.initialX;
    state.y = state.initialY;
    state.vx = 0;
    state.facing = 1;
    state.hp = PLAYER_MAX_HP;
    state.score = 0;
    state.invincible = false;
    state.invTimer = 0;
    state.shield = false;
    state.shieldTimer = 0;
    state.slowmo = false;
    state.slowmoTimer = 0;
    state.magnet = false;
    state.magnetTimer = 0;
    state.multiplier = false;
    state.multiplierTimer = 0;
    state.dashTime = 0;
    state.dashCooldown = 0;
    state.dashDir = 1;
    state.prevDash = false;
    state.dead = false;
    state.time = 0;
    state.trail.length = 0;
    state.trailClock = 0;
    state.spawnClock = 0;
  }

  function init(x, y) {
    state.initialX = typeof x === 'number' ? x : WIDTH / 2;
    state.initialY = typeof y === 'number' ? y : HEIGHT * 0.8;
    reset();
  }

  // --- per-frame update ---

  function update(dt) {
    if (typeof dt !== 'number' || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05); // guard against tab-switch spikes
    state.time += dt;

    // timers
    if (state.dashCooldown > 0) {
      state.dashCooldown = Math.max(0, state.dashCooldown - dt);
    }
    if (state.dashTime > 0) {
      state.dashTime = Math.max(0, state.dashTime - dt);
    }
    if (state.invTimer > 0) {
      state.invTimer = Math.max(0, state.invTimer - dt);
      if (state.invTimer === 0) state.invincible = false;
    }
    if (state.shieldTimer > 0) {
      state.shieldTimer = Math.max(0, state.shieldTimer - dt);
      if (state.shieldTimer === 0) state.shield = false;
    }
    if (state.slowmoTimer > 0) {
      state.slowmoTimer = Math.max(0, state.slowmoTimer - dt);
      if (state.slowmoTimer === 0) state.slowmo = false;
    }
    if (state.magnetTimer > 0) {
      state.magnetTimer = Math.max(0, state.magnetTimer - dt);
      if (state.magnetTimer === 0) state.magnet = false;
    }
    if (state.multiplierTimer > 0) {
      state.multiplierTimer = Math.max(0, state.multiplierTimer - dt);
      if (state.multiplierTimer === 0) state.multiplier = false;
    }

    const input = readInput();

    if (state.dead) {
      state.vx = 0;
      state.prevDash = input.dash;
      updateTrail(dt);
      return;
    }

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // dash on key-press edge
    const dashPressed = input.dash && !state.prevDash;
    if (dashPressed && state.dashCooldown <= 0 && state.dashTime <= 0) {
      state.dashDir = dir !== 0 ? dir : state.facing;
      state.dashTime = DASH_DURATION;
      state.dashCooldown = DASH_COOLDOWN;
      state.vx = state.dashDir * DASH_SPEED;
      state.facing = state.dashDir;
      burst(state.x, state.y, '#bdf6ff', 12);
      shake(4, 0.12);
    }
    state.prevDash = input.dash;

    // horizontal movement: accelerate toward target velocity
    if (state.dashTime > 0) {
      state.vx = state.dashDir * DASH_SPEED;
    } else {
      const target = dir * PLAYER_SPEED;
      const rate = dir !== 0 ? ACCELERATION : DECELERATION;
      const step = rate * dt;
      const delta = target - state.vx;
      state.vx = Math.abs(delta) <= step ? target : state.vx + Math.sign(delta) * step;
      if (dir !== 0) state.facing = dir;
    }

    state.x += state.vx * dt;
    const halfW = PLAYER_SIZE / 2;
    const minX = halfW;
    const maxX = WIDTH - halfW;
    if (state.x < minX || state.x > maxX) {
      state.x = clamp(state.x, minX, maxX);
      state.vx = 0;
    }

    // engine trail particles (throttled)
    state.spawnClock += dt;
    const interval = state.dashTime > 0 ? 0.008 : 0.02;
    while (state.spawnClock >= interval) {
      state.spawnClock -= interval;
      emitEngineTrail(dir);
    }

    // lightweight after-image history for a subtle built-in trail
    state.trailClock += dt;
    if (state.trailClock >= 0.016) {
      state.trailClock = 0;
      if (Math.abs(state.vx) > 12 || state.dashTime > 0) {
        state.trail.push({
          x: state.x,
          y: state.y,
          life: TRAIL_LIFE,
          maxLife: TRAIL_LIFE,
          facing: state.facing,
        });
        if (state.trail.length > TRAIL_MAX) state.trail.shift();
      }
    }
    updateTrail(dt);
  }

  // --- rendering helpers ---

  function shipPath(ctx, s) {
    const w = s;
    const h = s * 0.72;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(-w * 0.32, -h * 0.5);
    ctx.lineTo(-w * 0.48, -h * 0.28);
    ctx.lineTo(-w * 0.18, 0);
    ctx.lineTo(-w * 0.48, h * 0.28);
    ctx.lineTo(-w * 0.32, h * 0.5);
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawShield(ctx, size) {
    const r = size * 0.85;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(125,216,255,0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#6fd8ff';
    ctx.shadowBlur = 12;
    ctx.setLineDash([12, 7]);
    ctx.lineDashOffset = -state.time * 30;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(90,180,255,0.07)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawCooldown(ctx) {
    if (state.dead) return;
    const w = PLAYER_SIZE * 1.35;
    const h = 3.5;
    const cx = state.x;
    const cy = state.y + PLAYER_SIZE * 0.85;
    const ready = state.dashCooldown <= 0;
    const progress = ready ? 1 : 1 - state.dashCooldown / DASH_COOLDOWN;

    ctx.save();
    roundRect(ctx, cx - w / 2, cy, w, h, h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();

    if (progress > 0) {
      roundRect(ctx, cx - w / 2, cy, Math.max(h, w * progress), h, h / 2);
      if (state.dashTime > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
      } else if (ready) {
        ctx.fillStyle = 'rgba(96,255,176,0.95)';
        ctx.shadowColor = 'rgba(96,255,176,0.8)';
      } else {
        ctx.fillStyle = 'rgba(46,226,255,0.9)';
        ctx.shadowColor = 'rgba(46,226,255,0.8)';
      }
      ctx.shadowBlur = ready || state.dashTime > 0 ? 8 : 5;
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx) {
    if (!ctx) return;
    const size = PLAYER_SIZE;
    const halfW = size / 2;
    const halfH = size / 2;

    // subtle after-image trail behind the ship
    if (state.trail.length) {
      ctx.save();
      for (let i = 0; i < state.trail.length; i++) {
        const p = state.trail[i];
        const a = Math.max(0, p.life / p.maxLife) * 0.16;
        if (a <= 0.001) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.scale(p.facing, 1);
        ctx.fillStyle = state.multiplier ? COLOR_GOLD : COLOR_CYAN;
        shipPath(ctx, size * 0.92);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    if (state.dead) return;

    ctx.save();

    // i-frame flashing
    if (state.invincible) {
      ctx.globalAlpha = Math.floor(state.time / 0.09) % 2 === 0 ? 0.35 : 0.9;
    }

    const bob = Math.sin(state.time * 2.2) * 1.5;
    ctx.translate(state.x, state.y + bob);

    const baseColor = state.multiplier ? COLOR_GOLD : COLOR_CYAN;
    const glowColor = state.multiplier
      ? 'rgba(255,213,74,0.9)'
      : 'rgba(33,230,247,0.85)';
    const dashStretch = state.dashTime > 0 ? 1.35 : 1;
    const speedRatio = Math.min(1, Math.abs(state.vx) / PLAYER_SPEED);

    // engine flame (additive, flickering)
    const flameLen = (6 + speedRatio * 8 + Math.random() * 3) * dashStretch;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#35c8ff';
    ctx.shadowBlur = 14;
    const flame = ctx.createLinearGradient(-halfW * 0.45, 0, -halfW * 0.45 - flameLen, 0);
    flame.addColorStop(0, 'rgba(170,245,255,0.85)');
    flame.addColorStop(1, 'rgba(40,120,255,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-halfW * 0.42, -halfH * 0.26);
    ctx.lineTo(-halfW * 0.45 - flameLen, 0);
    ctx.lineTo(-halfW * 0.42, halfH * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ship body, oriented along facing direction and stretched while dashing
    ctx.save();
    ctx.scale(state.facing * dashStretch, 1 / Math.sqrt(dashStretch));
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = state.multiplier ? 26 : 20;
    shipPath(ctx, size);
    const body = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
    body.addColorStop(0, state.multiplier ? '#fff3c4' : '#dffbff');
    body.addColorStop(0.45, baseColor);
    body.addColorStop(1, state.multiplier ? '#b8860b' : '#0b7ea8');
    ctx.fillStyle = body;
    ctx.fill();

    // bright inner core
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    shipPath(ctx, size * 0.55);
    ctx.fill();

    // cockpit
    ctx.fillStyle = 'rgba(10,40,60,0.85)';
    ctx.beginPath();
    ctx.ellipse(size * 0.14, 0, size * 0.1, size * 0.06, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // power-up rings (unscaled by dash stretch)
    if (state.shield) drawShield(ctx, size);

    if (state.slowmo) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(110,160,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(90,140,255,0.8)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.72, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    drawCooldown(ctx);
  }

  // --- combat / power-ups ---

  function takeDamage() {
    if (state.dead) return true;
    if (state.invTimer > 0) return false;

    if (state.shield) {
      // shield absorbs the hit
      state.shield = false;
      state.shieldTimer = 0;
      state.invTimer = INVINCIBILITY_TIME;
      state.invincible = true;
      burst(state.x, state.y, '#8fdcff', 18);
      shake(5, 0.25);
      return false;
    }

    state.hp = Math.max(0, state.hp - 1);
    burst(state.x, state.y, '#ff5d7a', 22);
    shake(8, 0.35);

    if (state.hp <= 0) {
      state.dead = true;
      state.invincible = false;
      state.invTimer = 0;
      state.dashTime = 0;
      state.vx = 0;
      state.shield = false;
      state.shieldTimer = 0;
      state.slowmo = false;
      state.slowmoTimer = 0;
      state.magnet = false;
      state.magnetTimer = 0;
      state.multiplier = false;
      state.multiplierTimer = 0;
      burst(state.x, state.y, '#ffffff', 30);
      burst(state.x, state.y, COLOR_CYAN, 30);
      shake(16, 0.6);
      return true;
    }

    state.invTimer = INVINCIBILITY_TIME;
    state.invincible = true;
    return false;
  }

  function heal() {
    if (state.dead) return;
    state.hp = Math.min(PLAYER_MAX_HP, state.hp + 1);
    burst(state.x, state.y, '#6fffb0', 12);
  }

  function addPowerUp(type) {
    const t = String(type || '').toLowerCase();
    let color = COLOR_CYAN;
    switch (t) {
      case 'shield':
        state.shield = true;
        state.shieldTimer = SHIELD_DURATION;
        color = '#8fdcff';
        break;
      case 'slowmo':
        state.slowmo = true;
        state.slowmoTimer = SLOWMO_DURATION;
        color = '#6ea0ff';
        break;
      case 'magnet':
        state.magnet = true;
        state.magnetTimer = MAGNET_DURATION;
        color = '#c58fff';
        break;
      case 'multiplier':
        state.multiplier = true;
        state.multiplierTimer = MULTIPLIER_DURATION;
        color = COLOR_GOLD;
        break;
      case 'health':
        heal();
        return; // heal() already emits its own green burst
      default:
        return;
    }
    burst(state.x, state.y, color, 10);
  }

  // --- public module surface ---
  class Player {
    get x() { return state.x; }
    set x(v) { if (typeof v === 'number') state.x = v; }

    get y() { return state.y; }
    set y(v) { if (typeof v === 'number') state.y = v; }

    get width() { return PLAYER_SIZE; }
    get height() { return PLAYER_SIZE; }

    get hp() { return state.hp; }
    set hp(v) { state.hp = clamp(Math.round(v) || 0, 0, PLAYER_MAX_HP); }

    get maxHp() { return PLAYER_MAX_HP; }

    get invincible() { return state.invincible; }
    set invincible(v) {
      state.invincible = !!v;
      state.invTimer = state.invincible ? INVINCIBILITY_TIME : 0;
    }

    get shield() { return state.shield; }
    set shield(v) {
      state.shield = !!v;
      state.shieldTimer = state.shield ? SHIELD_DURATION : 0;
    }

    get slowmo() { return state.slowmo; }
    get magnet() { return state.magnet; }
    get multiplier() { return state.multiplier; }

    get dashCooldown() { return state.dashCooldown; }
    set dashCooldown(v) { state.dashCooldown = Math.max(0, Number(v) || 0); }

    get dashActive() { return state.dashTime > 0; }
    get facing() { return state.facing; }
    get dead() { return state.dead; }
    get isDead() { return state.dead; }

    get score() { return state.score; }
    set score(v) { state.score = Math.max(0, Number(v) || 0); }

    init(x, y) { init(x, y); }
    update(dt) { update(dt); }
    draw(ctx) { draw(ctx); }
    reset() { reset(); }
    takeDamage() { return takeDamage(); }
    heal() { heal(); }
    addPowerUp(type) { addPowerUp(type); }

    addScore(amount) {
      state.score = Math.max(0, state.score + (Number(amount) || 0));
    }
  }

  ND.Player = new Player();
})();
