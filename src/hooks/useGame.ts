"use client";

/**
 * Owns the single `Game` instance for the shell. The engine module is pulled in
 * with a dynamic import INSIDE an effect so nothing touches PixiJS/localStorage
 * during SSR or the first paint.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type {
  BoonCard,
  CardOffer,
  GameOverSummary,
  GamePhase,
  HudState,
  Settings,
  WeaponCard,
  WeaponId,
} from "@/game/types";
import { DEFAULT_SETTINGS, save } from "@/game/save";

export interface ToastItem {
  id: number;
  text: string;
  color?: number;
}

/** Mirrors `Game.debug` in src/game/game.ts. */
export interface DebugApi {
  gotoStage(n: number): void;
  setLevel(n: number): void;
  grantWeapon(id: WeaponId): void;
  grantSkill(id: string): void;
  godMode(v: boolean): void;
  spawnEnemy(defId: string): void;
  spawnBoss(stage: number): void;
  setTimeScale(v: number): void;
  stats(): { fps: number; entities: number; phase: GamePhase };
  spritePng(key: string): string | null;
}

export interface OverlayState {
  cards: { header: string; offers: CardOffer[]; rerolls: number } | null;
  armory: { offers: WeaponCard[]; rerolls: number } | null;
  boons: { offers: BoonCard[] } | null;
  banner: { stage: number; sector: number; title: string } | null;
  bossIntro: { name: string; title: string; stage: number } | null;
  countdown: number | null;
  summary: GameOverSummary | null;
  toasts: ToastItem[];
  /** Set on autostart when a checkpoint exists: "Continue Stage N / New run". */
  resume: number | null;
}

const EMPTY_OVERLAYS: OverlayState = {
  cards: null,
  armory: null,
  boons: null,
  banner: null,
  bossIntro: null,
  countdown: null,
  summary: null,
  toasts: [],
  resume: null,
};

/** Best-effort Fullscreen API toggle; the browser needs a user gesture. */
function applyFullscreen(on: boolean): void {
  if (on) {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
  } else if (document.fullscreenElement) {
    void document.exitFullscreen();
  }
}

interface EngineEvents {
  hud: HudState;
  phase: GamePhase;
  cards: { header: string; offers: CardOffer[]; rerolls: number };
  armory: { offers: WeaponCard[]; rerolls: number };
  boons: { offers: BoonCard[] };
  stageBanner: { stage: number; sector: number; title: string };
  threatUp: { tier: number };
  bossIntro: { name: string; title: string; stage: number };
  countdown: { n: number };
  gameover: GameOverSummary;
  victory: GameOverSummary;
  toast: { text: string; color?: number };
  checkpoint: { stage: number };
}

interface GameEventsApi {
  on<K extends keyof EngineEvents>(k: K, fn: (p: EngineEvents[K]) => void): () => void;
}

interface GameHandle {
  readonly events: GameEventsApi;
  readonly hud: HudState;
  readonly phase: GamePhase;
  debug?: DebugApi;
  start(opts: { autostart: boolean; continueFrom?: number }): void;
  pause(): void;
  resume(): void;
  togglePause(): void;
  chooseCard(index: number): void;
  reroll(): void;
  chooseWeapon(id: WeaponId): void;
  confirmArmory(): void;
  chooseBoon(index: number): void;
  applySettings(s: Settings): void;
  resumeAudio?(): void;
  toggleFullscreen?(): void;
  quitToTitle(): void;
  destroy(): void;
  hasCheckpoint(): number;
}

type GameCtor = new (host: HTMLElement, settings: Settings) => GameHandle;

export interface GameApi {
  game: GameHandle | null;
  hud: HudState | null;
  phase: GamePhase;
  ready: boolean;
  settings: Settings;
  overlays: OverlayState;
  checkpoint: number;
  bestStage: number;
  highScore: number;
  debug: DebugApi | null;
  start(): void;
  continueRun(stage: number): void;
  pause(): void;
  resume(): void;
  togglePause(): void;
  chooseCard(index: number): void;
  reroll(): void;
  chooseWeapon(id: WeaponId): void;
  confirmArmory(): void;
  chooseBoon(index: number): void;
  updateSettings(s: Settings): void;
  resumeAudio(): void;
  toggleFullscreen(): void;
  quitToTitle(): void;
}

const HUD_PHASES: ReadonlySet<GamePhase> = new Set<GamePhase>([
  "playing",
  "countdown",
  "paused",
  "cards",
  "armory",
]);

export function useGame(hostRef: RefObject<HTMLDivElement | null>): GameApi {
  const gameRef = useRef<GameHandle | null>(null);
  const toastSeq = useRef(0);
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);

  const [game, setGame] = useState<GameHandle | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [phase, setPhase] = useState<GamePhase>("boot");
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [overlays, setOverlays] = useState<OverlayState>(EMPTY_OVERLAYS);
  const [checkpoint, setCheckpoint] = useState(0);
  const [bestStage, setBestStage] = useState(0);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    let disposed = false;
    const timeouts = new Set<number>();
    const later = (fn: () => void, ms: number): void => {
      const id = window.setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
    };
    const unsubs: Array<() => void> = [];

    void (async () => {
      const loaded = save.loadSettings();
      if (disposed) return;
      settingsRef.current = loaded;
      setSettings(loaded);
      setBestStage(save.bestStage());
      setHighScore(save.highScore());
      setCheckpoint(save.checkpoint());

      let mod: { Game: GameCtor };
      try {
        mod = (await import("@/game/game")) as unknown as { Game: GameCtor };
      } catch {
        return; // engine not present yet — stay on the splash screen
      }
      if (disposed) return;
      const host = hostRef.current;
      if (!host) return;

      const inst = new mod.Game(host, loaded);
      gameRef.current = inst;

      const pushToast = (text: string, color?: number): void => {
        const id = ++toastSeq.current;
        setOverlays((o) => ({ ...o, toasts: [...o.toasts.slice(-4), { id, text, color }] }));
        later(() => setOverlays((o) => ({ ...o, toasts: o.toasts.filter((t) => t.id !== id) })), 2800);
      };

      unsubs.push(
        inst.events.on("hud", (h) => setHud(h)),
        inst.events.on("phase", (p) => {
          setPhase(p);
          // Card / armory overlays live only while their phase does.
          if (p !== "cards" && p !== "armory") {
            setOverlays((o) => (o.cards || o.armory ? { ...o, cards: null, armory: null } : o));
          }
          // The 3-2-1 overlay must disappear once the countdown ends.
          if (p !== "countdown") {
            setOverlays((o) => (o.countdown !== null ? { ...o, countdown: null } : o));
          }
        }),
        inst.events.on("cards", (c) => setOverlays((o) => ({ ...o, cards: c }))),
        inst.events.on("armory", (a) => setOverlays((o) => ({ ...o, armory: a }))),
        inst.events.on("boons", (b) => setOverlays((o) => ({ ...o, boons: b }))),
        inst.events.on("stageBanner", (b) => {
          setOverlays((o) => ({ ...o, banner: b }));
          later(() => setOverlays((o) => (o.banner === b ? { ...o, banner: null } : o)), 3200);
        }),
        inst.events.on("bossIntro", (b) => {
          setOverlays((o) => ({ ...o, bossIntro: b }));
          later(() => setOverlays((o) => (o.bossIntro === b ? { ...o, bossIntro: null } : o)), 3200);
        }),
        inst.events.on("countdown", (c) => setOverlays((o) => ({ ...o, countdown: c.n > 0 ? c.n : null }))),
        inst.events.on("gameover", (s) => {
          setOverlays((o) => ({ ...o, summary: s }));
          setBestStage((b) => Math.max(b, s.bestStage));
          setHighScore((h) => Math.max(h, s.highScore));
        }),
        inst.events.on("victory", (s) => {
          setOverlays((o) => ({ ...o, summary: s }));
          setBestStage((b) => Math.max(b, s.bestStage));
          setHighScore((h) => Math.max(h, s.highScore));
        }),
        inst.events.on("toast", (t) => pushToast(t.text, t.color)),
        inst.events.on("checkpoint", (c) => setCheckpoint(c.stage)),
      );

      // Exposed for scripts/shots.mjs and manual QA from the console.
      (window as unknown as { __ndDebug?: unknown }).__ndDebug = inst.debug;

      setReady(true);
      setGame(inst);

      // ?autostart=1 skips the title. If a checkpoint exists, offer
      // "Continue Stage N / New run" first (unless ?new=1 forces a fresh run).
      const params = new URLSearchParams(window.location.search);
      if (params.get("autostart") === "1") {
        const cp = save.checkpoint();
        if (cp > 0 && params.get("new") !== "1") {
          setOverlays((o) => ({ ...o, resume: cp }));
        } else {
          inst.start({ autostart: true });
        }
      }
    })();

    return () => {
      disposed = true;
      for (const u of unsubs) u();
      for (const id of timeouts) window.clearTimeout(id);
      timeouts.clear();
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [hostRef]);

  // Card / armory overlays live only while their phase does — cleared from the
  // engine's `phase` event handler above.

  const start = useCallback(() => {
    setOverlays((o) => (o.resume ? { ...o, resume: null } : o));
    gameRef.current?.start({ autostart: true });
  }, []);
  const continueRun = useCallback((stage: number) => {
    setOverlays((o) => (o.resume ? { ...o, resume: null } : o));
    gameRef.current?.start({ autostart: true, continueFrom: stage });
  }, []);
  const pause = useCallback(() => gameRef.current?.pause(), []);
  const resume = useCallback(() => gameRef.current?.resume(), []);
  const togglePause = useCallback(() => gameRef.current?.togglePause(), []);
  const chooseCard = useCallback((index: number) => {
    gameRef.current?.chooseCard(index);
    setOverlays((o) => ({ ...o, cards: null }));
  }, []);
  const reroll = useCallback(() => gameRef.current?.reroll(), []);
  const chooseWeapon = useCallback((id: WeaponId) => {
    gameRef.current?.chooseWeapon(id);
    setOverlays((o) => ({ ...o, armory: null }));
  }, []);
  const confirmArmory = useCallback(() => {
    gameRef.current?.confirmArmory();
    setOverlays((o) => ({ ...o, armory: null }));
  }, []);
  const chooseBoon = useCallback((index: number) => {
    gameRef.current?.chooseBoon(index);
    setOverlays((o) => ({ ...o, boons: null }));
  }, []);
  const updateSettings = useCallback((s: Settings) => {
    if (s.fullscreen !== settingsRef.current.fullscreen) applyFullscreen(s.fullscreen);
    settingsRef.current = s;
    setSettings(s);
    gameRef.current?.applySettings(s);
    save.saveSettings(s);
  }, []);
  const resumeAudio = useCallback(() => gameRef.current?.resumeAudio?.(), []);
  const toggleFullscreen = useCallback(() => {
    updateSettings({ ...settingsRef.current, fullscreen: !document.fullscreenElement });
  }, [updateSettings]);
  const quitToTitle = useCallback(() => {
    setOverlays(EMPTY_OVERLAYS);
    setPhase("menu");
    gameRef.current?.quitToTitle();
  }, []);

  return {
    game,
    hud,
    phase,
    ready,
    settings,
    overlays,
    checkpoint,
    bestStage,
    highScore,
    debug: game?.debug ?? null,
    start,
    continueRun,
    pause,
    resume,
    togglePause,
    chooseCard,
    reroll,
    chooseWeapon,
    confirmArmory,
    chooseBoon,
    updateSettings,
    resumeAudio,
    toggleFullscreen,
    quitToTitle,
  };
}

export { HUD_PHASES };
