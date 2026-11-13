/**
 * Neon Dodger 2.0 — Audio module
 * Every sound effect and the background music are synthesized with the
 * Web Audio API. No external audio assets are used.
 * Exposes ND.Audio as defined in ND.CONTRACTS.Audio.
 */
(function () {
    'use strict';

    const S = {
        ctx: null,
        master: null,
        sfx: null,
        music: null,
        noise: null,
        musicTimer: null,
        nextNoteTime: 0,
        step: 0,
        musicNodes: new Set(),
        listenersBound: false,
    };

    // ------------------------------------------------------------- setup

    function ensureContext() {
        if (S.ctx) return S.ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) {
                console.warn('Web Audio API is not supported in this browser.');
                return null;
            }
            const ctx = new AC();
            S.ctx = ctx;

            S.master = ctx.createGain();
            S.master.gain.value = api.muted ? 0 : 1;
            S.master.connect(ctx.destination);

            S.sfx = ctx.createGain();
            S.sfx.gain.value = 0.9;
            S.sfx.connect(S.master);

            S.music = ctx.createGain();
            S.music.gain.value = 0.22; // music stays well below SFX
            S.music.connect(S.master);

            // Shared white-noise buffer used by the noise-based effects.
            const len = ctx.sampleRate;
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            S.noise = buf;
        } catch (err) {
            console.warn('AudioContext creation failed:', err);
            S.ctx = null;
        }
        return S.ctx;
    }

    function resume() {
        if (S.ctx && S.ctx.state === 'suspended') {
            try {
                const p = S.ctx.resume();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (err) { /* ignore */ }
        }
    }

    function applyMute() {
        if (S.master && S.ctx) {
            S.master.gain.setTargetAtTime(api.muted ? 0 : 1, S.ctx.currentTime, 0.015);
        }
    }

    function bindListeners() {
        if (S.listenersBound) return;
        S.listenersBound = true;

        // Browsers suspend audio until the first user gesture: create/resume
        // the context on any interaction.
        const onInteract = function () {
            ensureContext();
            resume();
        };
        window.addEventListener('pointerdown', onInteract);
        window.addEventListener('touchstart', onInteract);
        window.addEventListener('keydown', onInteract);

        // M toggles mute.
        window.addEventListener('keydown', function (e) {
            if (e.repeat) return;
            if (e.key === 'm' || e.key === 'M') api.toggleMute();
        });
    }

    // ------------------------------------------------------------- helpers

    // A single enveloped oscillator voice.
    function tone(o) {
        const ctx = S.ctx;
        const t = o.t !== undefined ? o.t : ctx.currentTime;
        const dur = o.dur !== undefined ? o.dur : 0.2;
        const vol = o.vol !== undefined ? o.vol : 0.3;
        const attack = o.attack !== undefined ? o.attack : 0.005;

        const osc = ctx.createOscillator();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(Math.max(1, o.freq), t);
        if (o.slideTo) {
            osc.frequency.exponentialRampToValueAtTime(
                Math.max(1, o.slideTo), t + (o.slideT || dur)
            );
        }

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        osc.connect(g);
        g.connect(S.sfx);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    // Short filtered white-noise burst.
    function noiseBurst(dur, vol, freq, q) {
        const ctx = S.ctx;
        const t = ctx.currentTime;

        const src = ctx.createBufferSource();
        src.buffer = S.noise;

        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq;
        f.Q.value = q;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        src.connect(f);
        f.connect(g);
        g.connect(S.sfx);
        src.start(t);
        src.stop(t + dur + 0.02);
    }

    // ------------------------------------------------------------- SFX

    const SFX = {
        // Harsh impact: detuned saw/square burst with a pitch drop and a click.
        hit() {
            tone({ freq: 200, slideTo: 45, slideT: 0.12, type: 'sawtooth', dur: 0.2, vol: 0.5 });
            tone({ freq: 95, slideTo: 38, slideT: 0.1, type: 'square', dur: 0.12, vol: 0.22 });
            noiseBurst(0.09, 0.25, 900, 0.7);
        },

        // Whoosh: filtered noise sweep upwards.
        dash() {
            const ctx = S.ctx;
            const t = ctx.currentTime;

            const src = ctx.createBufferSource();
            src.buffer = S.noise;

            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 1.4;
            bp.frequency.setValueAtTime(350, t);
            bp.frequency.exponentialRampToValueAtTime(4500, t + 0.22);

            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

            src.connect(bp);
            bp.connect(g);
            g.connect(S.sfx);
            src.start(t);
            src.stop(t + 0.32);
        },

        // Ascending chime arpeggio.
        powerup() {
            const t = S.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
                tone({ freq: f, type: 'sine', t: t + i * 0.075, dur: 0.22, vol: 0.28 });
                tone({ freq: f * 2, type: 'sine', t: t + i * 0.075, dur: 0.12, vol: 0.08 });
            });
        },

        // Triumphant fanfare: rising tones resolving into a chord.
        levelup() {
            const t = S.ctx.currentTime;
            [261.63, 329.63, 392.0, 523.25].forEach(function (f, i) {
                const tt = t + i * 0.11;
                tone({ freq: f, type: 'triangle', t: tt, dur: 0.32, vol: 0.32 });
                tone({ freq: f * 2, type: 'sine', t: tt, dur: 0.24, vol: 0.1 });
            });
            [523.25, 659.25, 783.99].forEach(function (f) {
                tone({ freq: f, type: 'triangle', t: t + 0.46, dur: 0.6, vol: 0.22, attack: 0.02 });
            });
        },

        // Descending sad tones.
        gameover() {
            const t = S.ctx.currentTime;
            [392.0, 329.63, 261.63, 196.0].forEach(function (f, i) {
                const tt = t + i * 0.24;
                tone({ freq: f, type: 'triangle', t: tt, dur: 0.34, vol: 0.3, attack: 0.02 });
                tone({ freq: f / 2, type: 'sine', t: tt, dur: 0.34, vol: 0.14, attack: 0.02 });
            });
        },

        // Subtle tick/pop.
        score() {
            const t = S.ctx.currentTime;
            tone({ freq: 1400, type: 'square', t: t, dur: 0.04, vol: 0.08 });
            tone({ freq: 2800, type: 'sine', t: t + 0.02, dur: 0.03, vol: 0.04 });
        },

        // Ominous low drone with a slow filter wobble.
        boss() {
            const ctx = S.ctx;
            const t = ctx.currentTime;

            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 240;
            lp.Q.value = 5;

            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
            g.gain.setValueAtTime(0.5, t + 1.0);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 5;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 140;
            lfo.connect(lfoGain);
            lfoGain.connect(lp.frequency);

            [55, 55.8, 110.4].forEach(function (f) {
                const o = ctx.createOscillator();
                o.type = 'sawtooth';
                o.frequency.value = f;
                o.connect(lp);
                o.start(t);
                o.stop(t + 1.65);
            });

            lp.connect(g);
            g.connect(S.sfx);
            lfo.start(t);
            lfo.stop(t + 1.65);
        },

        // UI click.
        click() {
            tone({ freq: 2000, slideTo: 1200, slideT: 0.03, type: 'square', dur: 0.035, vol: 0.1 });
        },
    };

    // ------------------------------------------------------------- music

    const BPM = 100;
    const SIXTEENTH = 60 / BPM / 4;                     // seconds per 16th note
    const ROOTS = [110, 87.31, 130.81, 98.0];           // A2 F2 C3 G2 — 4-bar loop
    const PENTA = [220, 261.63, 293.66, 329.63, 392, 440]; // A minor pentatonic
    const ARP = [0, 2, 4, 5, 4, 2, 3, 1];               // PENTA indices, one bar

    function musicTone(freq, t, dur, vol, type) {
        const ctx = S.ctx;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        osc.connect(g);
        g.connect(S.music);
        osc.start(t);
        osc.stop(t + dur + 0.02);

        S.musicNodes.add(osc);
        osc.onended = function () { S.musicNodes.delete(osc); };
    }

    function scheduleStep(step, t) {
        const bar = Math.floor(step / 16) % ROOTS.length;
        const root = ROOTS[bar];

        if (step % 2 === 0) { // 8th-note groove
            const accent = step % 8 === 0;
            musicTone(root, t, 0.2, accent ? 0.45 : 0.28, 'triangle');   // bass pulse
            musicTone(root / 2, t, 0.22, accent ? 0.25 : 0.16, 'sine');  // sub bass
            const note = PENTA[ARP[(step >> 1) % ARP.length] % PENTA.length];
            musicTone(note, t, 0.24, 0.13, 'sine');                      // arpeggio
            if (step % 16 === 0) musicTone(note * 2, t, 0.32, 0.05, 'sine');
        }
    }

    // Lookahead scheduler: keeps a small buffer of notes queued ahead of the
    // audio clock so the loop does not drift or gap.
    function schedulerTick() {
        if (!S.ctx) return;
        while (S.nextNoteTime < S.ctx.currentTime + 0.2) {
            scheduleStep(S.step, S.nextNoteTime);
            S.nextNoteTime += SIXTEENTH;
            S.step = (S.step + 1) % 64;
        }
    }

    // ------------------------------------------------------------- API

    const api = {
        muted: false,

        init() {
            bindListeners();
            ensureContext();
            resume();
        },

        play(name) {
            if (api.muted) return;
            if (!ensureContext()) return;
            resume();
            const fn = SFX[name];
            if (fn) {
                try { fn(); } catch (err) { /* never let audio break the game */ }
            }
        },

        setMuted(muted) {
            api.muted = !!muted;
            applyMute();
        },

        toggleMute() {
            api.muted = !api.muted;
            applyMute();
            return api.muted;
        },

        playMusic() {
            if (!ensureContext()) return;
            resume();
            if (S.musicTimer) return;
            S.step = 0;
            S.nextNoteTime = S.ctx.currentTime + 0.08;
            schedulerTick();
            S.musicTimer = setInterval(schedulerTick, 40);
        },

        stopMusic() {
            if (S.musicTimer) {
                clearInterval(S.musicTimer);
                S.musicTimer = null;
            }
            S.musicNodes.forEach(function (osc) {
                try { osc.stop(); } catch (err) { /* already stopped */ }
            });
            S.musicNodes.clear();
        },
    };

    bindListeners();

    window.ND = window.ND || {};
    ND.Audio = api;
})();
