/**
 * Neon Dodger 2.0 — UI module
 * Owns DOM overlays + HUD. Builds missing structure, updates via textContent.
 */
(function () {
    'use strict';

    const ND = (window.ND = window.ND || {});

    const mk = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    };
    const id = (v) => document.getElementById(v);

    let E = {};   // id -> element
    let R = {};   // extra refs (value spans)
    let lastBest = 0;
    let bannerTimer = 0;

    function container() {
        return id('gameContainer') || document.querySelector('.game-container') || document.body;
    }

    function panel(label) {
        const p = mk('div', 'hud-panel');
        const v = mk('span', 'hud-value', '0');
        p.append(mk('span', 'hud-label', label), v);
        return { p, v };
    }

    function build() {
        const c = container();

        // ---- HUD ----
        const hud = mk('div', 'hidden');
        hud.id = 'hudOverlay';
        hud.style.cssText = 'position:absolute;inset:0;z-index:10;pointer-events:none;';

        const score = panel('Score');
        E.scoreDisplay = mk('div', 'hud-element hud-tl');
        E.scoreDisplay.id = 'scoreDisplay';
        E.scoreDisplay.append(score.p);
        R.scoreValue = score.v;

        const best = panel('Best');
        E.bestDisplay = mk('div', 'hud-element hud-tr');
        E.bestDisplay.id = 'bestDisplay';
        E.bestDisplay.append(best.p);
        R.bestValue = best.v;

        const lvl = panel('Level');
        E.levelDisplay = mk('div', 'hud-element hud-tc');
        E.levelDisplay.id = 'levelDisplay';
        E.levelDisplay.append(lvl.p);
        R.levelValue = lvl.v;

        E.hpDisplay = mk('div', 'hud-element hud-bl');
        E.hpDisplay.id = 'hpDisplay';
        E.hpDisplay.append(mk('div', 'hp-container'));

        const dash = mk('div', 'hud-element hud-br');
        dash.id = 'dashWrap';
        E.dashIndicator = mk('div', 'dash-indicator dash-ready', 'Dash');
        dash.append(E.dashIndicator);

        E.xpBar = mk('div', 'xp-bar');
        E.xpBar.id = 'xpBar';
        E.xpFill = mk('div', 'xp-fill');
        E.xpFill.id = 'xpFill';
        E.xpBar.append(E.xpFill);
        const xpWrap = mk('div', 'hud-element hud-bc');
        const xpCol = mk('div', 'xp-wrap');
        xpCol.append(E.xpBar);
        xpWrap.append(xpCol);

        E.powerUpBar = mk('div', 'hud-element');
        E.powerUpBar.id = 'powerUpBar';
        E.powerUpBar.style.cssText = 'top:8cqw;right:2cqw;';
        E.powerUpBar.append(mk('div', 'hud-powerups'));

        hud.append(E.scoreDisplay, E.bestDisplay, E.levelDisplay,
            E.hpDisplay, dash, xpWrap, E.powerUpBar);

        // ---- Menu ----
        const menu = mk('div', 'overlay hidden');
        menu.id = 'menuOverlay';
        menu.append(
            mk('h1', 'menu-title', 'NEON DODGER 2.0'),
            mk('div', 'menu-subtitle', 'Survive. Level up. Dominate.'),
            mk('div', 'menu-hint', '←/→ or A/D to move • SPACE to dash • M to mute')
        );
        const menuBestRow = mk('div', 'menu-hint');
        R.menuBest = mk('span', 'hud-value', '0');
        menuBestRow.append(mk('span', 'hud-label', 'Best  '), R.menuBest);
        const startBtn = mk('button', 'btn-primary', 'START');
        startBtn.type = 'button';
        menu.append(menuBestRow, startBtn);

        // ---- Game over ----
        const over = mk('div', 'overlay hidden');
        over.id = 'gameOverOverlay';
        const stats = mk('div', 'game-over-stats');
        stats.id = 'gameOverStats';
        const stat = (label) => {
            const d = mk('div', 'stat');
            const v = mk('span', 'stat-value', '0');
            d.append(mk('span', 'stat-label', label), v);
            return { d, v };
        };
        const sScore = stat('Score'), sLevel = stat('Level'), sBest = stat('Best');
        stats.append(sScore.d, sLevel.d, sBest.d);
        R.goScore = sScore.v; R.goLevel = sLevel.v; R.goBest = sBest.v;
        const againBtn = mk('button', 'btn-primary', 'PLAY AGAIN');
        againBtn.type = 'button';
        over.append(mk('div', 'game-over-title', 'GAME OVER'), stats, againBtn);

        // ---- Level-up banner ----
        const banner = mk('div', 'level-up-banner hidden');
        banner.id = 'levelUpBanner';
        R.bannerTitle = mk('div', 'banner-title', 'Level Up');
        R.bannerSub = mk('div', 'banner-sub', '');
        banner.append(R.bannerTitle, R.bannerSub);

        c.append(hud, menu, over, banner);
        E.hudOverlay = hud;
        E.menuOverlay = menu;
        E.gameOverOverlay = over;
        E.levelUpBanner = banner;

        const start = () => { if (typeof ND.startGame === 'function') ND.startGame(); };
        startBtn.addEventListener('click', start);
        againBtn.addEventListener('click', start);
    }

    function ensure() {
        if (!id('menuOverlay') || !id('hudOverlay') || !id('gameOverOverlay')) build();
        E.hudOverlay = E.hudOverlay || id('hudOverlay');
        E.menuOverlay = E.menuOverlay || id('menuOverlay');
        E.gameOverOverlay = E.gameOverOverlay || id('gameOverOverlay');
        E.levelUpBanner = E.levelUpBanner || id('levelUpBanner');
        E.scoreDisplay = E.scoreDisplay || id('scoreDisplay');
        E.bestDisplay = E.bestDisplay || id('bestDisplay');
        E.hpDisplay = E.hpDisplay || id('hpDisplay');
        E.levelDisplay = E.levelDisplay || id('levelDisplay');
        E.xpBar = E.xpBar || id('xpBar');
        E.xpFill = E.xpFill || id('xpFill');
        E.dashIndicator = E.dashIndicator || id('dashIndicator');
        E.powerUpBar = E.powerUpBar || id('powerUpBar');
        E.gameOverStats = E.gameOverStats || id('gameOverStats');
    }

    const show = (e) => e && e.classList.remove('hidden');
    const hide = (e) => e && e.classList.add('hidden');

    function init() {
        ensure();
        showMenu();
    }

    function showMenu() {
        ensure();
        hide(E.hudOverlay);
        hide(E.gameOverOverlay);
        hide(E.levelUpBanner);
        if (R.menuBest) {
            let b = lastBest;
            try { b = Math.max(b, parseInt(localStorage.getItem('nd2_bestScore') || '0', 10) || 0); } catch (e) {}
            R.menuBest.textContent = String(b);
        }
        show(E.menuOverlay);
    }

    function showHUD() {
        ensure();
        hide(E.menuOverlay);
        hide(E.gameOverOverlay);
        show(E.hudOverlay);
    }

    function showGameOver(score, level, xp) {
        ensure();
        score = score || 0;
        lastBest = Math.max(lastBest, score);
        R.goScore.textContent = String(score);
        R.goLevel.textContent = String(level || 1);
        R.goBest.textContent = String(lastBest);
        hide(E.menuOverlay);
        hide(E.hudOverlay);
        show(E.gameOverOverlay);
    }

    function showLevelUp(level, unlocks) {
        ensure();
        R.bannerTitle.textContent = 'Level ' + level;
        let sub = '';
        if (Array.isArray(unlocks)) sub = unlocks.join(' • ');
        else if (unlocks) sub = String(unlocks);
        R.bannerSub.textContent = sub;
        show(E.levelUpBanner);
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => hide(E.levelUpBanner), 2000);
    }

    function updateHUD(data) {
        ensure();
        data = data || {};
        const maxHp = data.maxHp || 0;
        const hp = data.hp == null ? maxHp : data.hp;

        R.scoreValue.textContent = String(data.score || 0);
        if (data.best != null) lastBest = Math.max(lastBest, data.best);
        R.bestValue.textContent = String(data.best == null ? lastBest : data.best);
        R.levelValue.textContent = String(data.level || 1);

        // HP hearts
        const box = E.hpDisplay.firstChild;
        box.textContent = '';
        for (let i = 0; i < maxHp; i++) {
            const h = mk('span', 'hp-heart' + (i >= hp ? ' lost' : ''), '♥');
            box.append(h);
        }

        // XP
        const toNext = data.xpToNext || 0;
        const pct = toNext > 0 ? Math.min(100, (data.xp || 0) / toNext * 100) : 0;
        E.xpFill.style.width = pct.toFixed(2) + '%';

        // Dash
        const cd = data.dashCooldown || 0;
        const ready = data.dashReady != null ? data.dashReady : cd <= 0;
        E.dashIndicator.classList.toggle('dash-ready', !!ready);
        E.dashIndicator.classList.toggle('dash-cooldown', !ready);
        E.dashIndicator.textContent = ready ? 'Dash' : 'Dash ' + cd.toFixed(1) + 's';

        // Power-ups
        const host = E.powerUpBar.firstChild;
        host.textContent = '';
        (data.activePowerUps || []).forEach((pu) => {
            const ind = mk('div', 'powerup-indicator');
            const name = mk('span', 'powerup-name', pu.type || '');
            if (pu.color) name.style.color = pu.color;
            const timer = mk('div', 'powerup-timer');
            const dur = pu.duration || 1;
            timer.style.width = Math.min(100, Math.max(0, (pu.timeLeft || 0) / dur * 100)).toFixed(2) + '%';
            const track = mk('div', 'powerup-timer-track');
            track.append(timer);
            ind.append(name, track);
            host.append(ind);
        });
    }

    function hideAll() {
        ensure();
        hide(E.menuOverlay);
        hide(E.hudOverlay);
        hide(E.gameOverOverlay);
        hide(E.levelUpBanner);
    }

    ND.UI = { init, showMenu, showHUD, showGameOver, showLevelUp, updateHUD, hideAll };
})();
