import { noiseBuffer, type SynthHost } from "./synth";

export type Sector = 1 | 2 | 3 | 4 | 5;
export type StingerName = "levelup" | "boss_defeat" | "victory" | "gameover";

interface SectorTheme {
  bpm: number;
  root: number; // MIDI note of the tonic
  scale: number[]; // semitone offsets
}

/** Per-sector key + tempo + scale colour. */
const SECTORS: Record<Sector, SectorTheme> = {
  1: { bpm: 92, root: 57, scale: [0, 2, 3, 5, 7, 8, 10] }, // A natural minor
  2: { bpm: 104, root: 50, scale: [0, 2, 3, 5, 7, 9, 10] }, // D dorian
  3: { bpm: 112, root: 52, scale: [0, 1, 3, 5, 7, 8, 10] }, // E phrygian
  4: { bpm: 120, root: 53, scale: [0, 2, 4, 6, 7, 9, 11] }, // F lydian
  5: { bpm: 128, root: 48, scale: [0, 2, 3, 5, 7, 8, 10] }, // C minor
};

interface BossTheme {
  bpm: number;
  rootOffset: number;
  prog: number[]; // chord scale-degree per bar
  lead: boolean; // adds the fifth layer
}

/** Unique progression + tempo per boss. eclipse_sovereign = fastest + heaviest. */
const BOSSES: Record<string, BossTheme> = {
  warden_colossus: { bpm: 100, rootOffset: -12, prog: [0, 5, 3, 4], lead: true },
  razor_queen: { bpm: 118, rootOffset: -12, prog: [0, 6, 5, 4], lead: true },
  prism_sentinel: { bpm: 126, rootOffset: -5, prog: [0, 3, 5, 6], lead: true },
  void_carrier: { bpm: 132, rootOffset: -12, prog: [0, 1, 5, 6], lead: true },
  eclipse_sovereign: { bpm: 150, rootOffset: -12, prog: [0, 7, 6, 5], lead: true },
};

const DEFAULT_BOSS: BossTheme = {
  bpm: 120,
  rootOffset: -10,
  prog: [0, 4, 5, 3],
  lead: true,
};

const LOOKAHEAD = 0.1; // seconds scheduled ahead
const TICK_MS = 25;

function midiFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Adaptive layered chiptune-adjacent score.
 * pad + bass always; arp from intensity > 0.25; drums from intensity > 0.5.
 * A boss adds a fifth lead layer with a heavier bass.
 */
export class Music {
  private readonly host: SynthHost;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private bar = 0;

  private sector: Sector = 1;
  private bossId: string | null = null;
  private intensity = 0.4;

  private padGain: GainNode | null = null;
  private bassGain: GainNode | null = null;
  private arpGain: GainNode | null = null;
  private drumGain: GainNode | null = null;
  private leadGain: GainNode | null = null;

  constructor(host: SynthHost) {
    this.host = host;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.buildLayers();
    this.resume();
    this.applyMix();
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.host.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.padGain) this.padGain.gain.value = 0;
    if (this.leadGain) this.leadGain.gain.value = 0;
  }

  setVolume(v: number): void {
    this.host.musicBus.gain.value = Math.max(0, Math.min(1, v));
  }

  setSector(sector: Sector): void {
    this.sector = sector;
  }

  setBoss(bossId: string | null): void {
    this.bossId = bossId;
    this.applyMix();
  }

  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
    this.applyMix();
  }

  stinger(name: StingerName): void {
    if (!this.playing && !this.host) return;
    this.resume();
    const t = this.host.ctx.currentTime + 0.01;
    const bus = this.host.musicBus;
    const chord = (freqs: number[], dur: number, vol: number, type: OscillatorType): void => {
      for (const f of freqs) this.note(t, f, dur, vol, type, bus);
    };
    switch (name) {
      case "levelup": {
        chord([523, 659, 784], 0.6, 0.24, "triangle");
        this.note(t + 0.12, 1046, 0.6, 0.2, "sine", bus);
        break;
      }
      case "boss_defeat": {
        this.note(t, 330, 1.4, 0.28, "sawtooth", bus);
        this.note(t, 262, 1.4, 0.22, "triangle", bus);
        this.note(t + 0.3, 196, 1.2, 0.22, "triangle", bus);
        this.note(t + 0.6, 131, 1.0, 0.2, "sine", bus);
        break;
      }
      case "victory": {
        chord([523, 659, 784], 1.0, 0.22, "triangle");
        this.note(t + 0.15, 1046, 1.2, 0.22, "sine", bus);
        this.note(t + 0.3, 1318, 1.2, 0.18, "sine", bus);
        break;
      }
      case "gameover": {
        this.note(t, 392, 1.6, 0.26, "sawtooth", bus);
        this.note(t, 311, 1.6, 0.22, "triangle", bus);
        this.note(t + 0.4, 262, 1.4, 0.2, "triangle", bus);
        this.note(t + 0.8, 196, 1.2, 0.18, "sine", bus);
        break;
      }
      default:
        break;
    }
  }

  // ---- internals ----

  private buildLayers(): void {
    if (this.padGain) return;
    const ctx = this.host.ctx;
    const bus = this.host.musicBus;
    const mk = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      return g;
    };
    this.padGain = mk();
    this.bassGain = mk();
    this.arpGain = mk();
    this.drumGain = mk();
    this.leadGain = mk();
  }

  private applyMix(): void {
    const now = this.host.ctx.currentTime;
    const ramp = (g: GainNode | null, v: number): void => {
      if (g) g.gain.setTargetAtTime(v, now, 0.05);
    };
    ramp(this.padGain, 0.4);
    ramp(this.bassGain, this.bossId ? 0.55 : 0.45);
    ramp(this.arpGain, this.intensity > 0.25 ? ((this.intensity - 0.25) / 0.75) * 0.35 : 0);
    ramp(this.drumGain, this.intensity > 0.5 ? ((this.intensity - 0.5) / 0.5) * 0.55 : 0);
    ramp(this.leadGain, this.bossId && this.isBossLead() ? 0.3 : 0);
  }

  private isBossLead(): boolean {
    if (!this.bossId) return false;
    return (BOSSES[this.bossId] ?? DEFAULT_BOSS).lead;
  }

  private theme(): SectorTheme & { prog: number[]; lead: boolean } {
    const base = SECTORS[this.sector];
    const boss = this.bossId ? BOSSES[this.bossId] ?? DEFAULT_BOSS : null;
    if (!boss) return { ...base, prog: [0, 5, 3, 4], lead: false };
    return {
      bpm: boss.bpm,
      root: base.root + boss.rootOffset,
      scale: base.scale,
      prog: boss.prog,
      lead: boss.lead,
    };
  }

  private tick(): void {
    if (!this.playing) return;
    const ctx = this.host.ctx;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextTime);
      const stepDur = 60 / this.theme().bpm / 4; // 16th notes
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const th = this.theme();
    const degree = th.prog[this.bar] ?? 0;
    const chordTones = [
      this.deg(th, degree, 0),
      this.deg(th, degree, 2),
      this.deg(th, degree, 4),
    ];
    const rootMidi = this.deg(th, degree, 0);

    // pad: sustained chord at bar start
    if (step === 0 && this.padGain) {
      for (const m of chordTones) {
        this.note(time, midiFreq(m), 1.8, 0.18, "triangle", this.padGain);
      }
    }

    // bass: syncopated root
    if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11 || step === 14) {
      if (this.bassGain) {
        const type: OscillatorType = this.bossId ? "sawtooth" : "square";
        this.note(time, midiFreq(rootMidi - 12), 0.22, 0.5, type, this.bassGain);
      }
    }

    // arp: chord tones above the bass, on even steps
    if (this.arpGain && step % 2 === 0 && this.intensity > 0.25) {
      const idx = (step / 2) % chordTones.length;
      const m = chordTones[idx] ?? rootMidi;
      this.note(time, midiFreq(m + 12), 0.12, 0.3, "triangle", this.arpGain);
    }

    // drums
    if (this.drumGain && this.intensity > 0.5) {
      const kickSteps = this.bossId ? [0, 6, 8, 14] : [0, 8];
      const snareSteps = [4, 12];
      if (kickSteps.includes(step)) {
        this.drum(time, 0.18, 0.9, "lowpass", 140, this.drumGain);
      }
      if (snareSteps.includes(step)) {
        this.drum(time, 0.12, 0.5, "highpass", 1200, this.drumGain);
      }
      if (step % 2 === 0) {
        this.drum(time, 0.04, 0.22, "highpass", 7000, this.drumGain);
      }
    }

    // boss fifth layer: offbeat lead stab
    if (this.leadGain && this.isBossLead() && (step === 2 || step === 5 || step === 9 || step === 13)) {
      const top = chordTones[chordTones.length - 1] ?? rootMidi;
      this.note(time, midiFreq(top + 12), 0.16, 0.3, "sawtooth", this.leadGain);
    }
  }

  /** Scale degree -> MIDI, wrapping octaves; index may be negative. */
  private deg(th: SectorTheme, degree: number, offset: number): number {
    const scale = th.scale;
    const len = scale.length;
    const i = degree + offset;
    const octave = Math.floor(i / len);
    const idx = ((i % len) + len) % len;
    return th.root + octave * 12 + (scale[idx] ?? 0);
  }

  private note(
    time: number,
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    bus: AudioNode,
  ): void {
    const ctx = this.host.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = Math.max(1, freq);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private drum(
    time: number,
    dur: number,
    vol: number,
    filter: BiquadFilterType,
    freq: number,
    bus: AudioNode,
  ): void {
    const ctx = this.host.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, Math.max(0.25, dur));
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  private resume(): void {
    if (this.host.ctx.state === "suspended") void this.host.ctx.resume();
  }
}
