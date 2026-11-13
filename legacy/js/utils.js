/**
 * Utility functions for Neon Dodger 2.0
 * Exposed on window.ND.Utils. All functions are pure and stateless.
 */

// Global namespace
window.ND = window.ND || {};
var ND = window.ND;

ND.Utils = (function () {
    'use strict';

    /**
     * Clamp a value between min and max.
     * @param {number} val
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    /**
     * Linear interpolation between a and b.
     * @param {number} a
     * @param {number} b
     * @param {number} t - interpolation factor (usually 0..1)
     * @returns {number}
     */
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Random float in [min, max).
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    /**
     * Random integer in [min, max] (inclusive).
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Euclidean distance between two points.
     * @returns {number}
     */
    function dist(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    }

    /**
     * Check whether a circle intersects an axis-aligned rectangle.
     * @param {number} cx - circle center x
     * @param {number} cy - circle center y
     * @param {number} cr - circle radius
     * @param {number} rx - rectangle top-left x
     * @param {number} ry - rectangle top-left y
     * @param {number} rw - rectangle width
     * @param {number} rh - rectangle height
     * @returns {boolean}
     */
    function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
        const closestX = clamp(cx, rx, rx + rw);
        const closestY = clamp(cy, ry, ry + rh);
        const dx = cx - closestX;
        const dy = cy - closestY;
        return dx * dx + dy * dy <= cr * cr;
    }

    /**
     * Cubic ease-out: fast start, gentle finish.
     * @param {number} t - 0..1
     * @returns {number}
     */
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * Quadratic ease-in-out: gentle start and finish.
     * @param {number} t - 0..1
     * @returns {number}
     */
    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /**
     * Map a value from one range to another.
     * @param {number} val
     * @param {number} inMin
     * @param {number} inMax
     * @param {number} outMin
     * @param {number} outMax
     * @returns {number}
     */
    function mapRange(val, inMin, inMax, outMin, outMax) {
        return ((val - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }

    /**
     * Return a random element from an array.
     * @param {Array} array
     * @returns {*} undefined if the array is empty
     */
    function randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Format a number with comma separators (e.g. 1234567 -> "1,234,567").
     * Preserves sign and fractional part.
     * @param {number} n
     * @returns {string}
     */
    function formatNumber(n) {
        if (!isFinite(n)) return String(n);
        const negative = n < 0;
        const parts = Math.abs(n).toString().split('.');
        const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (negative ? '-' : '') + grouped + (parts[1] ? '.' + parts[1] : '');
    }

    /**
     * Generic object pool.
     * Reuses released objects instead of allocating new ones.
     */
    class ObjectPool {
        /**
         * @param {Function} factory - creates a new object
         * @param {Function} reset - prepares an object for reuse
         */
        constructor(factory, reset) {
            if (typeof factory !== 'function') {
                throw new TypeError('ObjectPool: factory must be a function');
            }
            this._factory = factory;
            this._reset = typeof reset === 'function' ? reset : null;
            this._pool = [];
            this.created = 0; // total objects ever created (debugging)
        }

        /** Number of objects currently available in the pool. */
        get size() {
            return this._pool.length;
        }

        /**
         * Get an object from the pool, or create a new one if empty.
         * @returns {Object}
         */
        acquire() {
            if (this._pool.length > 0) {
                return this._pool.pop();
            }
            this.created++;
            return this._factory();
        }

        /**
         * Reset an object and return it to the pool.
         * @param {Object} obj
         */
        release(obj) {
            if (obj == null) return;
            if (this._reset) this._reset(obj);
            this._pool.push(obj);
        }
    }

    return {
        clamp,
        lerp,
        rand,
        randInt,
        dist,
        circleRectCollision,
        easeOutCubic,
        easeInOutQuad,
        mapRange,
        randomChoice,
        formatNumber,
        ObjectPool,
    };
})();
