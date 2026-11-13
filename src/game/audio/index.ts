import { createHost, type SynthHost } from "./synth";
import { Sfx, type SfxName, type SfxPlayOptions } from "./sfx";
import { Music, type Sector, type StingerName } from "./music";

export * from "./synth";
export * from "./sfx";
export * from "./music";

/**
 * Single entry point for the game audio system.
 * No-ops (never throws) when Web Audio is unavailable.
 */
export class AudioEngine {
  private host: SynthHost | null = null;
  private sfx: Sfx | null = null;
  private music: Music | null = null;
  private masterVolume = 0.9;
  private muted = false;

  init(): void {
    if (this.host) return;
    try {
      this.host = createHost();
      if (this.host) {
        this.sfx = new Sfx(this.host);
        this.music = new Music(this.host);
        this.applyMaster();
      }
    } catch {
      this.host = null;
    }
  }

  unlock(): void {
    try {
      const ctx = this.host?.ctx;
      if (ctx && ctx.state === "suspended") void ctx.resume();
    } catch {
      /* ignore */
    }
  }

  ready(): boolean {
    return this.host !== null;
  }

  play(name: SfxName, opts?: SfxPlayOptions): void {
    this.sfx?.play(name, opts);
  }

  musicStart(): void {
    this.music?.start();
  }

  musicStop(): void {
    this.music?.stop();
  }

  setMaster(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  setMusic(v: number): void {
    this.music?.setVolume(v);
  }

  setSfx(v: number): void {
    this.sfx?.setVolume(v);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setSector(s: Sector): void {
    this.music?.setSector(s);
  }

  setBoss(id: string | null): void {
    this.music?.setBoss(id);
  }

  setIntensity(v: number): void {
    this.music?.setIntensity(v);
  }

  stinger(n: StingerName): void {
    this.music?.stinger(n);
  }

  private applyMaster(): void {
    const master = this.host?.master;
    if (!master) return;
    try {
      const target = this.muted ? 0 : this.masterVolume;
      master.gain.setTargetAtTime(target, this.host!.ctx.currentTime, 0.02);
    } catch {
      /* ignore */
    }
  }
}
