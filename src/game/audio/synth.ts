/**
 * Low-level Web Audio toolkit: host graph, noise source, tone + noise voices.
 * Everything routes through a master limiter. Safe when AudioContext is absent.
 */

export interface SynthHost {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
}

const MAX_VOICES = 48;

/** Active voice count, keyed by host instance so multiple contexts stay isolated. */
const voiceCounts = new WeakMap<SynthHost, number>();

function voices(h: SynthHost): number {
  return voiceCounts.get(h) ?? 0;
}

function addVoice(h: SynthHost, source: AudioScheduledSourceNode): void {
  voiceCounts.set(h, voices(h) + 1);
  source.onended = () => {
    voiceCounts.set(h, Math.max(0, voices(h) - 1));
  };
}

/** Build the master graph. Returns null when Web Audio is unavailable. */
export function createHost(): SynthHost | null {
  const Ctor: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);
    const host: SynthHost = { ctx, master, sfxBus, musicBus };
    voiceCounts.set(host, 0);
    return host;
  } catch {
    return null;
  }
}

let cachedNoise: { ctx: AudioContext; buf: AudioBuffer; seconds: number } | null =
  null;

/** Cached white-noise buffer. Rebuilt only if the context or length changes. */
export function noiseBuffer(ctx: AudioContext, seconds = 1): AudioBuffer {
  if (cachedNoise && cachedNoise.ctx === ctx && cachedNoise.seconds >= seconds) {
    return cachedNoise.buf;
  }
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  cachedNoise = { ctx, buf, seconds };
  return buf;
}

function panner(h: SynthHost, pan: number | undefined): StereoPannerNode | null {
  if (pan === undefined) return null;
  const p = h.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  return p;
}

function connectOut(
  h: SynthHost,
  node: AudioNode,
  pan: number | undefined,
  bus: GainNode | undefined,
): void {
  const dest = bus ?? h.sfxBus;
  const p = panner(h, pan);
  if (p) {
    node.connect(p);
    p.connect(dest);
  } else {
    node.connect(dest);
  }
}

export interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  vol?: number;
  attack?: number;
  release?: number;
  pan?: number;
  detune?: number;
  bus?: GainNode;
}

/** Pitch-swept oscillator voice. No-ops past the voice cap. */
export function tone(h: SynthHost, o: ToneOptions): void {
  if (voices(h) >= MAX_VOICES) return;
  const t = h.ctx.currentTime;
  const dur = Math.max(0.01, o.dur);
  const attack = Math.min(o.attack ?? 0.005, dur * 0.5);
  const release = o.release ?? dur - attack;
  const vol = o.vol ?? 0.3;

  const osc = h.ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(1, o.freq), t);
  if (o.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, o.freqEnd),
      t + dur,
    );
  }
  if (o.detune !== undefined) osc.detune.value = o.detune;

  const g = h.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(attack + 0.001, attack + release));

  osc.connect(g);
  connectOut(h, g, o.pan, o.bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  addVoice(h, osc);
}

export interface NoiseOptions {
  dur: number;
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  pan?: number;
  bus?: GainNode;
}

/** Filtered noise burst (impacts, explosions, hats). No-ops past the voice cap. */
export function noiseHit(h: SynthHost, o: NoiseOptions): void {
  if (voices(h) >= MAX_VOICES) return;
  const t = h.ctx.currentTime;
  const dur = Math.max(0.01, o.dur);
  const vol = o.vol ?? 0.3;

  const src = h.ctx.createBufferSource();
  src.buffer = noiseBuffer(h.ctx, Math.max(0.25, dur));

  const f = h.ctx.createBiquadFilter();
  f.type = o.filter ?? "lowpass";
  f.frequency.setValueAtTime(Math.max(20, o.freq ?? 12000), t);
  if (o.freqEnd !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + dur);
  }
  f.Q.value = o.q ?? 1;

  const g = h.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

  src.connect(f);
  f.connect(g);
  connectOut(h, g, o.pan, o.bus);
  src.start(t);
  src.stop(t + dur + 0.02);
  addVoice(h, src);
}
