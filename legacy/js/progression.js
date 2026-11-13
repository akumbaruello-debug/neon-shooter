/**
 * Progression system for Neon Dodger 2.0.
 * Exposed on window.ND.Progression. Owns XP, levels, unlocks, difficulty.
 */

// ponytail: node-only stub so the built-in self-check can run outside the browser
if (typeof window === 'undefined') {
    global.window = global;
    global.localStorage = {
        _d: {},
        getItem(k) { return k in this._d ? this._d[k] : null; },
        setItem(k, v) { this._d[k] = String(v); },
    };
}

// Global namespace
window.ND = window.ND || {};
var ND = window.ND;

ND.Progression = (function () {
    'use strict';

    const STORAGE_KEY = 'nd2_progress';
    const REPEAT_EVERY = 5;
    const REPEAT_UNLOCKS = ['Boss fight', '+1 Max HP'];

    // Unlocks granted at an exact level. Levels every REPEAT_EVERY past 12 repeat REPEAT_UNLOCKS.
    const UNLOCKS = {
        2: ['Dash'],
        3: ['Shield drops'],
        5: ['Boss fight', '+1 Max HP'],
        7: ['Magnet drops'],
        10: ['Multiplier drops'],
        12: ['Second dash charge'],
    };

    let level = 1;
    let xp = 0;
    let levelUpCallback = null;
    let stats = { bestLevel: 1, totalXP: 0, gamesPlayed: 0 };

    /**
     * XP required to advance from level n to n + 1.
     * @param {number} n
     * @returns {number}
     */
    function xpForLevel(n) {
        return Math.round(100 * Math.pow(n, 1.5));
    }

    /**
     * Ability names newly unlocked upon reaching level n.
     * @param {number} n
     * @returns {string[]}
     */
    function unlocksFor(n) {
        if (UNLOCKS[n]) return UNLOCKS[n];
        if (n > 12 && n % REPEAT_EVERY === 0) return REPEAT_UNLOCKS;
        return [];
    }

    /** Load persisted lifetime stats. */
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) stats = Object.assign(stats, JSON.parse(raw));
        } catch (e) { /* ponytail: corrupt/absent storage -> defaults */ }
    }

    /** Persist lifetime stats. */
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
        } catch (e) { /* storage unavailable (private mode) -> skip */ }
    }

    /** Initialize progression state for a fresh run and load lifetime stats. */
    function init() {
        level = 1;
        xp = 0;
        load();
    }

    /**
     * Grant XP, carrying overflow across as many level-ups as it earns.
     * @param {number} amount
     */
    function addXP(amount) {
        if (!(amount > 0)) return;
        xp += amount;
        stats.totalXP += amount;
        while (xp >= xpForLevel(level)) {
            xp -= xpForLevel(level);
            level++;
            if (level > stats.bestLevel) stats.bestLevel = level;
            if (typeof levelUpCallback === 'function') levelUpCallback(level, unlocksFor(level));
        }
        save();
    }

    /**
     * Register the level-up callback.
     * @param {Function} cb - cb(level, unlocksArray)
     */
    function onLevelUp(cb) {
        levelUpCallback = typeof cb === 'function' ? cb : null;
    }

    /** @returns {number} current level */
    function getLevel() {
        return level;
    }

    /** @returns {number} XP accumulated within the current level */
    function getXP() {
        return xp;
    }

    /** @returns {number} XP required to complete the current level */
    function getXPToNext() {
        return xpForLevel(level);
    }

    /** @returns {number} enemy difficulty multiplier */
    function getDifficulty() {
        return 1 + level * 0.15;
    }

    /** @returns {string[]} every ability unlocked at or below the current level */
    function getUnlockedAbilities() {
        const out = [];
        for (let n = 2; n <= level; n++) out.push.apply(out, unlocksFor(n));
        return Array.from(new Set(out));
    }

    /** Reset the current run; records a played game and keeps lifetime stats. */
    function reset() {
        level = 1;
        xp = 0;
        stats.gamesPlayed++;
        save();
    }

    return {
        init,
        addXP,
        onLevelUp,
        getLevel,
        getXP,
        getXPToNext,
        getDifficulty,
        getUnlockedAbilities,
        reset,
        get level() { return level; },
        get xp() { return xp; },
    };
})();

if (typeof module !== 'undefined' && require.main === module) {
    const P = ND.Progression;
    const check = (c, m) => { if (!c) throw new Error('self-check: ' + m); };
    let seen = null;
    P.init();
    P.onLevelUp((l, u) => { seen = [l, u]; });
    check(P.getLevel() === 1 && P.getXP() === 0 && P.getXPToNext() === 100, 'fresh state');
    P.addXP(100);
    check(P.getLevel() === 2 && P.getXP() === 0, 'level 1->2');
    check(seen && seen[0] === 2 && seen[1].join() === 'Dash', 'level-up callback');
    P.addXP(500); // level 3 needs 283 -> 217 carried
    check(P.getLevel() === 3 && P.getXP() === 217, 'carry + curve 2->3');
    check(P.getUnlockedAbilities().join() === 'Dash,Shield drops', 'unlocks');
    check(Math.abs(P.getDifficulty() - 1.45) < 1e-9, 'difficulty');
    P.addXP(100000);
    check(P.getLevel() >= 15 && P.getUnlockedAbilities().indexOf('Second dash charge') >= 0, 'multi level-up');
    console.log('progression self-check OK, level', P.getLevel());
}
