/**
 * Shared constants for Neon Dodger 2.0.
 * Every module reads tuning values from window.ND.CONST.
 *
 * Module interfaces (informal, documented here for reference):
 *
 *   Engine      init(canvas), start(), stop(), onUpdate(cb), onRender(cb),
 *               input{left,right,dash,muted}, particles{spawn,burst,update,draw,clear},
 *               shake(intensity,duration), getTime(), setTimeScale(), getTimeScale()
 *   Player      init(x,y), update(dt), draw(ctx), reset(), takeDamage()->died,
 *               heal(), addPowerUp(type), addScore(n);
 *               x,y,width,height,hp,maxHp,invincible,shield,slowmo,magnet,
 *               multiplier,dashCooldown,dashActive,facing,dead,score
 *   Enemies     init(), update(dt,level), draw(ctx), clear(), spawnWave(level),
 *               spawnBoss(), hit(enemy,dmg)->{destroyed,score,boss};
 *               list, projectiles, bossActive, level
 *   PowerUps    init(), update(dt), draw(ctx), clear(), spawn(x,y,type); list
 *   Progression init(), addXP(n), onLevelUp(cb), getLevel(), getXP(),
 *               getXPToNext(), getDifficulty(), getUnlockedAbilities(), reset()
 *   UI          init(), showMenu(), showHUD(), showGameOver(s,l,xp),
 *               showLevelUp(l,unlocks), updateHUD(data), hideAll()
 *   Audio       init(), play(name), setMuted(b), toggleMute(), playMusic(),
 *               stopMusic(); muted
 *   Utils       clamp, lerp, rand, randInt, dist, circleRectCollision, ObjectPool
 */
(function () {
    'use strict';

    const ND = (window.ND = window.ND || {});

    ND.CONST = {
        WIDTH: 800,
        HEIGHT: 600,
        PLAYER_SPEED: 400,        // px/sec
        PLAYER_SIZE: 32,
        PLAYER_MAX_HP: 3,
        INVINCIBILITY_TIME: 1.5,  // seconds after hit
        DASH_SPEED: 900,
        DASH_DURATION: 0.15,
        DASH_COOLDOWN: 2.0,
        SHIELD_DURATION: 5.0,
        SLOWMO_DURATION: 4.0,
        SLOWMO_FACTOR: 0.4,
        MAGNET_DURATION: 8.0,
        MAGNET_RADIUS: 150,
        MULTIPLIER_DURATION: 10.0,
        MULTIPLIER_VALUE: 2,
        POWERUP_DROP_CHANCE: 0.08,
        XP_PER_POINT: 1,
        XP_LEVEL_BASE: 100,
        XP_LEVEL_SCALE: 1.5,
    };
})();