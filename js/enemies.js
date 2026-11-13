/**
 * Neon Dodger 2.0 — Enemies module
 *
 * Spawns, updates and draws enemies, milestone bosses and enemy projectiles.
 * Enemy objects are recycled through an internal pool so destroyed or
 * off-screen enemies do not trigger garbage collection hitches.
 *
 * Public API (window.ND.Enemies):
 *   init()                      — reset lists and spawner state
 *   update(dt, level?)          — advance enemies/projectiles, spawn by level
 *   draw(ctx)                   — render enemies, HP bars and projectiles
 *   clear()                     — remove every enemy/projectile
 *   spawnWave(level)            — spawn a level-appropriate wave
 *   spawnBoss()                 — spawn the milestone boss
 *   hit(enemy, dmg?)            — damage an enemy; returns {destroyed, score, boss}
 *   damage(enemy, dmg?)         — alias for hit()
 *   list                        — active enemy array
 *   projectiles                 — active projectile array
 *   bossActive                  — true while a boss is alive
 */
(function () {
  'use strict';

  const ND = (window.ND = window.ND || {});
  const CONST = ND.CONST || {};
  const W = CONST.WIDTH || 800;
  const H = CONST.HEIGHT || 600;

  // --- Tuning --------------------------------------------------------------
  const BASE_SPAWN_FRAMES = 60; // base cadence: one spawn per second at 60fps
  const BASE_SPAWN_INTERVAL = BASE_SPAWN_FRAMES / 60;
  const SPAWN_INTERVAL_MIN = 0.28;
  const SPAWN_INTERVAL_PER_LEVEL = 0.07;
  const SPEED_SCALE_PER_LEVEL = 0.07;
  const BOSS_EVERY_LEVELS = 5;
  const BOSS_BASE_HP = 20;
  const MAX_ACTIVE = 26;
  const PROJECTILE_COLOR = '#00f5d4';

  // --- Math helpers (prefer ND.Utils, fall back to local implementations) --
  function clamp(v, a, b) {
    const U = ND.Utils;
    if (U && typeof U.clamp === 'function') return U.clamp(v, a, b);
    return v < a ? a : v > b ? b : v;
  }

  function rand(a, b) {
    const U = ND.Utils;
    if (U && typeof U.rand === 'function') return U.rand(a, b);
    return a + Math.random() * (b - a);
  }

  function randInt(a, b) {
    const U = ND.Utils;
    if (U && typeof U.randInt === 'function') return U.randInt(a, b);
    return Math.floor(a + Math.random() * (b - a + 1));
  }

  // --- Archetypes ----------------------------------------------------------
  // `size` is the collision radius in pixels.
  const TYPE_DEFS = {
    drifter:  { size: 14, speed: 150, color: '#ff3b5c', hp: 1, score: 10 },
    dasher:   { size: 10, speed: 300, color: '#ff9f1c', hp: 1, score: 15 },
    tank:     { size: 26, speed: 70,  color: '#9b5de5', hp: 3, score: 30 },
    zigzag:   { size: 13, speed: 130, color: '#06d6a0', hp: 1, score: 20 },
    splitter: { size: 18, speed: 115, color: '#ff70a6', hp: 2, score: 25 },
    mini:     { size: 8,  speed: 320, color: '#ff97b7', hp: 1, score: 5 },
    boss:     { size: 44, speed: 0,   color: '#ef476f', hp: BOSS_BASE_HP, score: 500 },
  };

  // --- Drawing helpers -----------------------------------------------------
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function poly(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  function hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawEnemyShape(ctx, e) {
    switch (e.type) {
      case 'dasher':
        poly(ctx, [
          [e.x, e.y + e.size],
          [e.x - e.size, e.y - e.size * 0.8],
          [e.x + e.size, e.y - e.size * 0.8],
        ]);
        break;

      case 'zigzag':
        poly(ctx, [
          [e.x, e.y - e.size],
          [e.x + e.size, e.y],
          [e.x, e.y + e.size],
          [e.x - e.size, e.y],
        ]);
        break;

      case 'tank':
        hexPath(ctx, e.x, e.y, e.size);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        hexPath(ctx, e.x, e.y, e.size * 0.62);
        ctx.stroke();
        break;

      case 'splitter':
        circle(ctx, e.x, e.y, e.size);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        circle(ctx, e.x, e.y, e.size * 0.5);
        ctx.stroke();
        break;

      case 'boss':
        hexPath(ctx, e.x, e.y, e.size);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        hexPath(ctx, e.x, e.y, e.size);
        ctx.stroke();
        ctx.fillStyle = '#1a0b2e';
        circle(ctx, e.x, e.y, e.size * 0.45);
        ctx.fillStyle = e.color;
        circle(ctx, e.x, e.y, e.size * 0.2);
        break;

      case 'mini':
        circle(ctx, e.x, e.y, e.size);
        break;

      case 'drifter':
      default:
        circle(ctx, e.x, e.y, e.size);
        break;
    }
  }

  function drawHpBar(ctx, e) {
    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    const w = e.size * (e.type === 'boss' ? 2.4 : 2.2);
    const h = e.type === 'boss' ? 7 : 5;
    const x = e.x - w / 2;
    const y = e.y - e.size - h - 6;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ratio > 0.5 ? '#06d6a0' : ratio > 0.25 ? '#ffd166' : '#ef476f';
    ctx.fillRect(x, y, w * ratio, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  // --- Module --------------------------------------------------------------
  const Enemies = {
    list: [],
    projectiles: [],
    bossActive: false,
    level: 1,
    spawnTimer: BASE_SPAWN_INTERVAL,
    bossSpawnedForLevel: 0,
    maxActive: MAX_ACTIVE,
    pool: [],
    projectilePool: [],

    init() {
      this.list.length = 0;
      this.projectiles.length = 0;
      this.pool.length = 0;
      this.projectilePool.length = 0;
      this.bossActive = false;
      this.level = 1;
      this.spawnTimer = BASE_SPAWN_INTERVAL;
      this.bossSpawnedForLevel = 0;
      this.maxActive = MAX_ACTIVE;
    },

    update(dt, level) {
      if (typeof level === 'number' && level > 0) this.level = level;
      if (!(dt > 0)) return;
      if (dt > 0.05) dt = 0.05; // clamp huge frame gaps (tab switches)

      this._maybeSpawnBoss();

      // Trickle spawning: faster as the level rises. Paused during boss fights.
      if (!this.bossActive) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          if (this.list.length < this.maxActive) {
            this._spawn(this._pickType(), rand(50, W - 50), -40, this.level);
          }
          const interval = Math.max(
            SPAWN_INTERVAL_MIN,
            BASE_SPAWN_INTERVAL - (this.level - 1) * SPAWN_INTERVAL_PER_LEVEL
          );
          this.spawnTimer = interval * rand(0.7, 1.3);
        }
      }

      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (!e.active) continue;
        e.age += dt;
        if (e.hitFlash > 0) e.hitFlash -= dt;

        switch (e.type) {
          case 'zigzag':
            e.y += e.speed * dt;
            e.x = clamp(
              e.baseX + Math.sin(e.age * e.freq + e.phase) * e.amp,
              e.size,
              W - e.size
            );
            break;

          case 'mini':
            e.y += e.speed * dt;
            e.x += e.vx * dt;
            if (e.x < e.size) {
              e.x = e.size;
              e.vx = Math.abs(e.vx);
            } else if (e.x > W - e.size) {
              e.x = W - e.size;
              e.vx = -Math.abs(e.vx);
            }
            break;

          case 'boss':
            if (e.y < e.baseY) {
              e.y = Math.min(e.baseY, e.y + 90 * dt);
            } else {
              e.y = e.baseY + Math.sin(e.age * 1.6) * 6;
            }
            e.x = W / 2 + Math.sin(e.age * e.freq) * e.amp;
            e.fireTimer -= dt;
            if (e.fireTimer <= 0 && e.y > 0) {
              this._fireBoss(e);
              const interval = Math.max(0.55, 1.4 - this.level * 0.04);
              e.fireTimer = interval * rand(0.85, 1.15);
            }
            break;

          default: // drifter, dasher, tank, splitter
            e.y += e.speed * dt;
            break;
        }

        if (e.y - e.size > H + 40) this._release(e);
      }

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.y += p.speed * dt;
        p.x += p.vx * dt;
        if (p.y - p.size > H + 20 || p.x < -20 || p.x > W + 20) {
          this._releaseProjectile(p);
        }
      }
    },

    draw(ctx) {
      for (let i = 0; i < this.list.length; i++) {
        const e = this.list[i];
        if (!e.active) continue;

        ctx.save();
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = e.type === 'boss' ? 24 : 12;
        drawEnemyShape(ctx, e);
        ctx.restore();

        if (e.hitFlash > 0) {
          ctx.save();
          ctx.globalAlpha = clamp(e.hitFlash * 6, 0, 0.75);
          ctx.fillStyle = '#ffffff';
          circle(ctx, e.x, e.y, e.size);
          ctx.restore();
        }

        if (e.type === 'tank' || e.type === 'boss') {
          drawHpBar(ctx, e);
        }
      }

      for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        if (!p.active) continue;
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        circle(ctx, p.x, p.y, p.size);
        ctx.restore();
      }
    },

    clear() {
      for (let i = 0; i < this.list.length; i++) {
        const e = this.list[i];
        e.active = false;
        this.pool.push(e);
      }
      this.list.length = 0;

      for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        p.active = false;
        this.projectilePool.push(p);
      }
      this.projectiles.length = 0;

      this.bossActive = false;
      this.bossSpawnedForLevel = 0;
      this.spawnTimer = BASE_SPAWN_INTERVAL;
    },

    spawnWave(level) {
      if (typeof level === 'number' && level > 0) this.level = level;
      const count = Math.min(16, 3 + Math.floor(this.level * 1.5));
      for (let i = 0; i < count; i++) {
        const type = this._pickType();
        const x = rand(50, W - 50);
        const y = -40 - i * rand(24, 54);
        this._spawn(type, x, y, this.level);
      }
      this._maybeSpawnBoss();
    },

    spawnBoss() {
      if (this.bossActive) return null;
      const e = this._spawn('boss', W / 2, -80, this.level);
      e.hp = e.maxHp = BOSS_BASE_HP + this.level * 2;
      e.scoreValue = 400 + this.level * 50;
      e.baseY = 90;
      e.amp = W / 2 - e.size - 20;
      e.freq = 0.9;
      e.fireTimer = 1.2;
      this.bossActive = true;
      this.bossSpawnedForLevel = this.level;
      return e;
    },

    hit(enemy, dmg) {
      if (!enemy || !enemy.active) return { destroyed: false, score: 0, boss: false };
      enemy.hp -= dmg == null ? 1 : dmg;
      enemy.hitFlash = 0.12;

      if (enemy.hp > 0) return { destroyed: false, score: 0, boss: false };

      const result = {
        destroyed: true,
        score: enemy.scoreValue,
        boss: enemy.type === 'boss',
        x: enemy.x,
        y: enemy.y,
        type: enemy.type,
        color: enemy.color,
      };

      if (enemy.type === 'splitter') this._spawnMinis(enemy);
      if (result.boss) this.bossActive = false;
      this._release(enemy);
      return result;
    },

    damage(enemy, dmg) {
      return this.hit(enemy, dmg);
    },

    // --- Internal helpers ---------------------------------------------------
    _spawn(type, x, y, level) {
      const def = TYPE_DEFS[type] || TYPE_DEFS.drifter;
      const e = this.pool.pop() || {};
      const speedScale = 1 + (level - 1) * SPEED_SCALE_PER_LEVEL;

      e.type = type;
      e.active = true;
      e.size = def.size;
      e.speed = def.speed * speedScale;
      e.color = def.color;
      e.hp = def.hp;
      e.maxHp = def.hp;
      e.scoreValue = def.score;
      e.x = x;
      e.y = y;
      e.vx = 0;
      e.baseX = x;
      e.baseY = 90;
      e.amp = rand(30, Math.min(120, W * 0.2));
      e.freq = rand(1.5, 3);
      e.phase = rand(0, Math.PI * 2);
      e.age = 0;
      e.hitFlash = 0;
      e.fireTimer = rand(0.8, 1.6);

      this.list.push(e);
      return e;
    },

    _spawnMinis(e) {
      for (let i = 0; i < 2; i++) {
        const m = this._spawn('mini', e.x + (i === 0 ? -14 : 14), e.y, this.level);
        m.vx = i === 0 ? -130 : 130;
        m.speed = TYPE_DEFS.mini.speed + this.level * 8;
      }
    },

    _spawnProjectile(x, y, speed, vx) {
      const p = this.projectilePool.pop() || {};
      p.x = x;
      p.y = y;
      p.size = 8;
      p.speed = speed;
      p.vx = vx || 0;
      p.color = PROJECTILE_COLOR;
      p.active = true;
      this.projectiles.push(p);
      return p;
    },

    _fireBoss(e) {
      const count = this.level >= 10 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 16;
        this._spawnProjectile(e.x + offset, e.y + e.size * 0.6, 260 + this.level * 8, offset * 4);
      }
    },

    _release(e) {
      if (!e || !e.active) return;
      e.active = false;
      const i = this.list.indexOf(e);
      if (i !== -1) {
        const last = this.list.pop();
        if (i < this.list.length) this.list[i] = last;
      }
      this.pool.push(e);
    },

    _releaseProjectile(p) {
      if (!p || !p.active) return;
      p.active = false;
      const i = this.projectiles.indexOf(p);
      if (i !== -1) {
        const last = this.projectiles.pop();
        if (i < this.projectiles.length) this.projectiles[i] = last;
      }
      this.projectilePool.push(p);
    },

    _pickType() {
      const lvl = this.level;
      const bag = ['drifter', 'drifter', 'drifter'];
      if (lvl >= 2) bag.push('dasher', 'dasher');
      if (lvl >= 3) bag.push('zigzag', 'zigzag');
      if (lvl >= 4) bag.push('splitter', 'splitter');
      if (lvl >= 5) bag.push('tank');
      if (lvl >= 7) bag.push('tank', 'splitter');
      return bag[randInt(0, bag.length - 1)];
    },

    _maybeSpawnBoss() {
      if (
        this.level >= BOSS_EVERY_LEVELS &&
        this.level % BOSS_EVERY_LEVELS === 0 &&
        !this.bossActive &&
        this.bossSpawnedForLevel !== this.level
      ) {
        this.spawnBoss();
      }
    },
  };

  ND.Enemies = Enemies;
})();
