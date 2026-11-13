import {
  createHost,
  noiseHit,
  tone,
  type NoiseOptions,
  type SynthHost,
  type ToneOptions,
} from "./synth";

export type SfxName =
  | "focus_lance"
  | "gatling_vulcan"
  | "rail_charge"
  | "prism_beam"
  | "scatter_shot"
  | "crescent_slash"
  | "arc_chain"
  | "plasma_orb"
  | "seeker_swarm"
  | "ricochet_disc"
  | "boomerang_blade"
  | "crossfire"
  | "hit"
  | "crit"
  | "kill"
  | "explosion"
  | "xp"
  | "levelup"
  | "card_hover"
  | "card_select"
  | "dash"
  | "shield_hit"
  | "shield_break"
  | "shield_up"
  | "heartbeat"
  | "warn_beep"
  | "boss_warn"
  | "stage_clear"
  | "threat_up"
  | "rail_ready"
  | "overheat"
  | "repair"
  | "shockwave"
  | "nano_repair"
  | "phase_barrier"
  | "missile_barrage"
  | "gravity_well"
  | "overdrive"
  | "chrono_slip"
  | "ion_storm"
  | "ui_click"
  | "ui_back"
  | "victory"
  | "defeat";

export const SFX_NAMES: SfxName[] = [
  "focus_lance",
  "gatling_vulcan",
  "rail_charge",
  "prism_beam",
  "scatter_shot",
  "crescent_slash",
  "arc_chain",
  "plasma_orb",
  "seeker_swarm",
  "ricochet_disc",
  "boomerang_blade",
  "crossfire",
  "hit",
  "crit",
  "kill",
  "explosion",
  "xp",
  "levelup",
  "card_hover",
  "card_select",
  "dash",
  "shield_hit",
  "shield_break",
  "shield_up",
  "heartbeat",
  "warn_beep",
  "boss_warn",
  "stage_clear",
  "threat_up",
  "rail_ready",
  "overheat",
  "repair",
  "shockwave",
  "nano_repair",
  "phase_barrier",
  "missile_barrage",
  "gravity_well",
  "overdrive",
  "chrono_slip",
  "ion_storm",
  "ui_click",
  "ui_back",
  "victory",
  "defeat",
];

export interface SfxPlayOptions {
  pan?: number;
  pitch?: number;
  volume?: number;
}

interface PlayCtx {
  pan: number | undefined;
  pitch: number;
  volume: number;
}

/** Every SfxName has its own synthesized recipe, enforced by the Record type. */
export class Sfx {
  private readonly host: SynthHost;
  private readonly recipes: Record<SfxName, (p: PlayCtx) => void>;
  private xpStep = 0;
  private lastXp = 0;

  constructor(host: SynthHost) {
    this.host = host;
    const h = host;

    // tone with pitch + volume + pan applied
    const t = (o: ToneOptions, p: PlayCtx): void =>
      tone(h, {
        ...o,
        freq: o.freq * p.pitch,
        freqEnd: o.freqEnd === undefined ? undefined : o.freqEnd * p.pitch,
        vol: (o.vol ?? 0.3) * p.volume,
        pan: o.pan ?? p.pan,
      });
    // noise hit with filter pitch + volume + pan applied
    const n = (o: NoiseOptions, p: PlayCtx): void =>
      noiseHit(h, {
        ...o,
        freq: o.freq === undefined ? undefined : o.freq * p.pitch,
        freqEnd: o.freqEnd === undefined ? undefined : o.freqEnd * p.pitch,
        vol: (o.vol ?? 0.3) * p.volume,
        pan: o.pan ?? p.pan,
      });

    this.recipes = {
      // ---- weapons (12) ----
      focus_lance: (p) => {
        t({ type: "sawtooth", freq: 1200, freqEnd: 820, dur: 0.16, vol: 0.22 }, p);
        t({ type: "sine", freq: 2400, dur: 0.05, vol: 0.1 }, p);
      },
      gatling_vulcan: (p) => {
        n({ dur: 0.04, filter: "bandpass", freq: 1900, q: 6, vol: 0.26 }, p);
        t({ type: "square", freq: 420, freqEnd: 300, dur: 0.045, vol: 0.16 }, p);
      },
      rail_charge: (p) => {
        t(
          {
            type: "sawtooth",
            freq: 120,
            freqEnd: 1650,
            dur: 0.5,
            vol: 0.16,
            attack: 0.22,
          },
          p,
        );
      },
      prism_beam: (p) => {
        t({ type: "sine", freq: 1320, dur: 0.22, vol: 0.14 }, p);
        t({ type: "sine", freq: 1310, dur: 0.22, vol: 0.12, detune: 8 }, p);
        t({ type: "triangle", freq: 1980, dur: 0.14, vol: 0.07 }, p);
      },
      scatter_shot: (p) => {
        n({ dur: 0.14, filter: "lowpass", freq: 3200, freqEnd: 600, q: 2, vol: 0.3 }, p);
        t({ type: "triangle", freq: 220, freqEnd: 160, dur: 0.1, vol: 0.16 }, p);
      },
      crescent_slash: (p) => {
        t({ type: "triangle", freq: 1800, freqEnd: 400, dur: 0.28, vol: 0.2 }, p);
        n({ dur: 0.24, filter: "bandpass", freq: 1200, freqEnd: 4200, q: 1.2, vol: 0.16 }, p);
      },
      arc_chain: (p) => {
        t({ type: "square", freq: 300, freqEnd: 900, dur: 0.12, vol: 0.16 }, p);
        t({ type: "square", freq: 920, dur: 0.08, vol: 0.12, detune: 40 }, p);
        n({ dur: 0.09, filter: "highpass", freq: 4000, vol: 0.14 }, p);
      },
      plasma_orb: (p) => {
        t({ type: "sine", freq: 200, freqEnd: 90, dur: 0.3, vol: 0.24 }, p);
        t({ type: "triangle", freq: 140, dur: 0.3, vol: 0.12, detune: -20 }, p);
      },
      seeker_swarm: (p) => {
        t({ type: "sine", freq: 600, freqEnd: 1450, dur: 0.14, vol: 0.14 }, p);
        t({ type: "sine", freq: 800, freqEnd: 1650, dur: 0.14, vol: 0.1, detune: 25 }, p);
      },
      ricochet_disc: (p) => {
        t({ type: "square", freq: 1400, freqEnd: 720, dur: 0.1, vol: 0.16 }, p);
        n({ dur: 0.14, filter: "highpass", freq: 2500, vol: 0.16 }, p);
      },
      boomerang_blade: (p) => {
        t({ type: "sine", freq: 420, freqEnd: 1500, dur: 0.26, vol: 0.16 }, p);
        t({ type: "sine", freq: 1500, freqEnd: 420, dur: 0.26, vol: 0.12, detune: 12 }, p);
      },
      crossfire: (p) => {
        t({ type: "square", freq: 700, freqEnd: 500, dur: 0.1, vol: 0.14 }, p);
        t({ type: "square", freq: 1020, freqEnd: 700, dur: 0.1, vol: 0.12, detune: 30 }, p);
        n({ dur: 0.07, filter: "bandpass", freq: 1600, q: 5, vol: 0.14 }, p);
      },

      // ---- core feedback (5) ----
      hit: (p) => {
        n({ dur: 0.06, filter: "lowpass", freq: 2000, freqEnd: 500, vol: 0.3 }, p);
        t({ type: "square", freq: 160, freqEnd: 110, dur: 0.05, vol: 0.18 }, p);
      },
      crit: (p) => {
        n({ dur: 0.1, filter: "highpass", freq: 3000, vol: 0.32 }, p);
        t({ type: "sawtooth", freq: 520, freqEnd: 200, dur: 0.13, vol: 0.32 }, p);
      },
      kill: (p) => {
        t({ type: "square", freq: 520, freqEnd: 120, dur: 0.2, vol: 0.24 }, p);
        n({ dur: 0.16, filter: "lowpass", freq: 1800, freqEnd: 400, vol: 0.24 }, p);
      },
      explosion: (p) => {
        n({ dur: 0.6, filter: "lowpass", freq: 2000, freqEnd: 80, q: 0.7, vol: 0.5 }, p);
        t({ type: "sine", freq: 80, freqEnd: 30, dur: 0.5, vol: 0.4 }, p);
      },
      xp: (p) => {
        const now = performance.now();
        this.xpStep = now - this.lastXp < 900 ? Math.min(12, this.xpStep + 1) : 0;
        this.lastXp = now;
        const freq = 700 * Math.pow(2, this.xpStep / 12);
        t({ type: "sine", freq, freqEnd: freq * 1.5, dur: 0.09, vol: 0.18 }, p);
        t({ type: "triangle", freq: freq * 2, dur: 0.05, vol: 0.08 }, p);
      },

      // ---- progression / status (12) ----
      levelup: (p) => {
        t({ type: "triangle", freq: 523, dur: 0.5, vol: 0.18 }, p);
        t({ type: "triangle", freq: 659, dur: 0.5, vol: 0.16 }, p);
        t({ type: "triangle", freq: 784, dur: 0.55, vol: 0.16 }, p);
        t({ type: "sine", freq: 1046, dur: 0.6, vol: 0.14 }, p);
      },
      card_hover: (p) => {
        t({ type: "sine", freq: 660, dur: 0.06, vol: 0.12 }, p);
      },
      card_select: (p) => {
        t({ type: "sine", freq: 880, dur: 0.08, vol: 0.16 }, p);
        t({ type: "sine", freq: 1320, dur: 0.1, vol: 0.14 }, p);
      },
      dash: (p) => {
        n({ dur: 0.18, filter: "bandpass", freq: 400, freqEnd: 3000, q: 1, vol: 0.26 }, p);
        t({ type: "sine", freq: 300, freqEnd: 1200, dur: 0.16, vol: 0.16 }, p);
      },
      shield_hit: (p) => {
        t({ type: "triangle", freq: 300, freqEnd: 280, dur: 0.15, vol: 0.24 }, p);
        n({ dur: 0.08, filter: "bandpass", freq: 2500, q: 8, vol: 0.18 }, p);
      },
      shield_break: (p) => {
        n({ dur: 0.35, filter: "highpass", freq: 4000, vol: 0.34 }, p);
        t({ type: "triangle", freq: 1200, freqEnd: 300, dur: 0.3, vol: 0.22 }, p);
      },
      shield_up: (p) => {
        t({ type: "sawtooth", freq: 220, freqEnd: 880, dur: 0.3, vol: 0.18, attack: 0.05 }, p);
        t({ type: "sine", freq: 440, freqEnd: 1320, dur: 0.28, vol: 0.1 }, p);
      },
      heartbeat: (p) => {
        n({ dur: 0.12, filter: "lowpass", freq: 120, vol: 0.42 }, p);
        t({ type: "sine", freq: 60, freqEnd: 40, dur: 0.1, vol: 0.34 }, p);
      },
      warn_beep: (p) => {
        t({ type: "square", freq: 880, dur: 0.1, vol: 0.16 }, p);
      },
      boss_warn: (p) => {
        t({ type: "sawtooth", freq: 110, freqEnd: 80, dur: 0.6, vol: 0.2 }, p);
        t({ type: "square", freq: 55, dur: 0.6, vol: 0.14 }, p);
        n({ dur: 0.4, filter: "lowpass", freq: 200, vol: 0.2 }, p);
      },
      stage_clear: (p) => {
        t({ type: "triangle", freq: 523, dur: 0.5, vol: 0.18 }, p);
        t({ type: "triangle", freq: 659, dur: 0.5, vol: 0.16 }, p);
        t({ type: "sine", freq: 784, dur: 0.5, vol: 0.16 }, p);
      },
      threat_up: (p) => {
        t({ type: "square", freq: 440, freqEnd: 880, dur: 0.3, vol: 0.18 }, p);
        t({ type: "sawtooth", freq: 442, freqEnd: 882, dur: 0.3, vol: 0.1, detune: 12 }, p);
      },
      rail_ready: (p) => {
        t({ type: "sine", freq: 1500, dur: 0.12, vol: 0.16 }, p);
        t({ type: "sine", freq: 2250, dur: 0.06, vol: 0.1 }, p);
      },
      overheat: (p) => {
        n({ dur: 0.5, filter: "highpass", freq: 6000, freqEnd: 500, vol: 0.3 }, p);
        t({ type: "sawtooth", freq: 400, freqEnd: 80, dur: 0.4, vol: 0.16 }, p);
      },
      repair: (p) => {
        t({ type: "sine", freq: 400, freqEnd: 700, dur: 0.15, vol: 0.18 }, p);
        t({ type: "triangle", freq: 500, dur: 0.12, vol: 0.1 }, p);
      },

      // ---- skills (18) ----
      shockwave: (p) => {
        n({ dur: 0.5, filter: "lowpass", freq: 1200, freqEnd: 60, q: 0.8, vol: 0.5 }, p);
        t({ type: "sine", freq: 120, freqEnd: 40, dur: 0.4, vol: 0.4 }, p);
      },
      nano_repair: (p) => {
        t({ type: "sine", freq: 1200, freqEnd: 1800, dur: 0.08, vol: 0.16 }, p);
        n({ dur: 0.05, filter: "highpass", freq: 5000, vol: 0.14 }, p);
      },
      phase_barrier: (p) => {
        t({ type: "triangle", freq: 300, freqEnd: 600, dur: 0.4, vol: 0.18 }, p);
        t({ type: "sine", freq: 450, freqEnd: 900, dur: 0.4, vol: 0.12, detune: 15 }, p);
      },
      missile_barrage: (p) => {
        t({ type: "sawtooth", freq: 200, freqEnd: 620, dur: 0.12, vol: 0.16 }, p);
        n({ dur: 0.1, filter: "bandpass", freq: 800, q: 3, vol: 0.2 }, p);
        t({ type: "square", freq: 150, freqEnd: 700, dur: 0.14, vol: 0.12 }, p);
      },
      gravity_well: (p) => {
        t({ type: "sine", freq: 180, freqEnd: 40, dur: 0.7, vol: 0.3 }, p);
        t({ type: "sawtooth", freq: 90, freqEnd: 30, dur: 0.6, vol: 0.14 }, p);
      },
      overdrive: (p) => {
        t({ type: "sawtooth", freq: 200, freqEnd: 1000, dur: 0.35, vol: 0.2 }, p);
        n({ dur: 0.3, filter: "bandpass", freq: 1000, freqEnd: 3000, q: 2, vol: 0.2 }, p);
      },
      chrono_slip: (p) => {
        t({ type: "sine", freq: 800, freqEnd: 200, dur: 0.35, vol: 0.18 }, p);
        t({ type: "sine", freq: 1000, freqEnd: 250, dur: 0.35, vol: 0.12, detune: 18 }, p);
        n({ dur: 0.3, filter: "highpass", freq: 300, freqEnd: 5000, vol: 0.14 }, p);
      },
      ion_storm: (p) => {
        n({ dur: 0.5, filter: "highpass", freq: 3000, q: 1, vol: 0.3 }, p);
        t({ type: "square", freq: 200, freqEnd: 800, dur: 0.4, vol: 0.14, detune: 35 }, p);
        t({ type: "sawtooth", freq: 65, dur: 0.5, vol: 0.12 }, p);
      },

      // ---- ui / meta (4) ----
      ui_click: (p) => {
        t({ type: "sine", freq: 1200, dur: 0.03, vol: 0.12 }, p);
      },
      ui_back: (p) => {
        t({ type: "sine", freq: 800, freqEnd: 400, dur: 0.06, vol: 0.12 }, p);
      },
      victory: (p) => {
        t({ type: "triangle", freq: 523, dur: 0.8, vol: 0.2 }, p);
        t({ type: "triangle", freq: 659, dur: 0.8, vol: 0.18 }, p);
        t({ type: "triangle", freq: 784, dur: 0.8, vol: 0.18 }, p);
        t({ type: "sine", freq: 1046, dur: 0.9, vol: 0.16 }, p);
        n({ dur: 0.6, filter: "lowpass", freq: 1200, freqEnd: 200, vol: 0.16 }, p);
      },
      defeat: (p) => {
        t({ type: "sawtooth", freq: 440, freqEnd: 110, dur: 0.8, vol: 0.24 }, p);
        t({ type: "triangle", freq: 330, freqEnd: 82, dur: 0.8, vol: 0.16 }, p);
      },
    };
  }

  play(name: SfxName, opts: SfxPlayOptions = {}): void {
    const recipe = this.recipes[name];
    if (!recipe) return;
    this.resume();
    recipe({
      pan: opts.pan,
      pitch: opts.pitch ?? 1,
      volume: opts.volume ?? 1,
    });
  }

  setVolume(v: number): void {
    const g = this.host.sfxBus.gain;
    g.value = Math.max(0, Math.min(1, v));
  }

  private resume(): void {
    if (this.host.ctx.state === "suspended") void this.host.ctx.resume();
  }
}

/** Convenience: stand up a host + Sfx in one call, or null when audio is absent. */
export function createSfx(): Sfx | null {
  const host = createHost();
  return host ? new Sfx(host) : null;
}
