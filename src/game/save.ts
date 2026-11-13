/**
 * localStorage persistence. Every access is wrapped so a full/blocked storage
 * bucket can never break the game.
 *
 * These keys are NEW and additive; the legacy keys used by the old game
 * (`nd2_bestScore`, `nd2_progress`) are deliberately left untouched.
 */
import type { Settings } from "./types";

const K_SETTINGS = "nd.settings.v1";
const K_BEST_STAGE = "nd.bestStage.v1";
const K_HIGH_SCORE = "nd.highScore.v1";
const K_CHECKPOINT = "nd.checkpoint.v1";
const K_SEEN_INTRO = "nd.seenIntro.v1";

export const DEFAULT_BINDINGS: Settings["keybindings"] = {
  up: ["W", "ArrowUp"],
  down: ["S", "ArrowDown"],
  left: ["A", "ArrowLeft"],
  right: ["D", "ArrowRight"],
  fire: ["Space", "LMB"],
  dash: ["Shift", "RMB"],
  skill1: ["1"],
  skill2: ["2"],
  skill3: ["3"],
  skill4: ["4"],
  skill5: ["5"],
  pause: ["Esc", "P"],
  mute: ["M"],
  autoFire: ["T"],
};

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  muted: false,
  screenShake: 0.7,
  damageNumbers: true,
  autoFire: false,
  uiScale: 1,
  quality: "high",
  highContrastBullets: false,
  fullscreen: true,
  mouseAim: true,
  keybindings: DEFAULT_BINDINGS,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full — ignore */
  }
}

export const save = {
  loadSettings(): Settings {
    const s = read<Partial<Settings>>(K_SETTINGS, {});
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      keybindings: { ...DEFAULT_BINDINGS, ...(s.keybindings ?? {}) },
    };
  },
  saveSettings(s: Settings): void {
    write(K_SETTINGS, s);
  },

  bestStage(): number {
    return read<number>(K_BEST_STAGE, 0);
  },
  setBestStage(n: number): void {
    if (n > save.bestStage()) write(K_BEST_STAGE, n);
  },

  highScore(): number {
    return read<number>(K_HIGH_SCORE, 0);
  },
  setHighScore(n: number): void {
    if (n > save.highScore()) write(K_HIGH_SCORE, n);
  },

  checkpoint(): number {
    return read<number>(K_CHECKPOINT, 0);
  },
  setCheckpoint(stage: number): void {
    write(K_CHECKPOINT, stage);
  },
  clearCheckpoint(): void {
    try {
      localStorage.removeItem(K_CHECKPOINT);
    } catch {
      /* ignore */
    }
  },

  seenIntro(): boolean {
    return read<boolean>(K_SEEN_INTRO, false);
  },
  setSeenIntro(v: boolean): void {
    write(K_SEEN_INTRO, v);
  },
};
