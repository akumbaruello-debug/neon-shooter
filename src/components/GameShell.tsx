"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { HUD_PHASES, useGame } from "@/hooks/useGame";
import Hud from "./Hud";
import TitleScreen from "./TitleScreen";
import CardScreen from "./CardScreen";
import ArmoryScreen from "./ArmoryScreen";
import BoonScreen from "./BoonScreen";
import PauseMenu from "./PauseMenu";
import SettingsMenu, { type SettingsView } from "./SettingsMenu";
import GameOverScreen from "./GameOverScreen";
import ToastStack from "./Toast";
import Banner from "./Banner";
import DebugPanel from "./DebugPanel";
import "./../styles/ui.css";

type Modal = SettingsView | null;

/** The `?debug` flag never changes at runtime, so there is nothing to subscribe to. */
const subscribeNoop = (): (() => void) => () => {};

function LoadingSplash() {
  return (
    <div className="overlay overlay-loading">
      <div className="loading-inner">
        <div className="loading-title">NEON SHOOTER</div>
        <div className="loading-bar">
          <i />
        </div>
        <div className="loading-text">Loading…</div>
      </div>
    </div>
  );
}

export default function GameShell() {
  const hostRef = useRef<HTMLDivElement>(null);
  const g = useGame(hostRef);
  const [modal, setModal] = useState<Modal>(null);
  // `?debug=1` comes from the URL (an external store) rather than an effect.
  const debugFromUrl = useSyncExternalStore(
    subscribeNoop,
    () => new URLSearchParams(window.location.search).get("debug") === "1",
    () => false,
  );
  const [debugClosed, setDebugClosed] = useState(false);
  const debugMode = debugFromUrl && !debugClosed;
  const [soundOn, setSoundOn] = useState(false);

  const toggleFullscreen = g.toggleFullscreen;
  const updateSettings = g.updateSettings;
  const resumeAudio = g.resumeAudio;
  const phase = g.phase;
  const settings = g.settings;

  // Browsers keep the AudioContext suspended until a gesture: unlock on the
  // first key or click, and hide the "press any key for sound" hint.
  useEffect(() => {
    const unlock = (): void => {
      resumeAudio();
      setSoundOn(true);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [resumeAudio]);

  useEffect(() => {
    // Capture phase: when a modal is open, consume Esc here so the engine's
    // (bubble-phase) pause listener never sees it. With no modal open we do
    // nothing, letting the engine own pause/unpause.
    const onKey = (e: KeyboardEvent): void => {
      if (document.body.dataset.capturing === "1") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;

      if (e.key === "Escape" && modal) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setModal(null);
        return;
      }

      if (e.key === "m" || e.key === "M") {
        updateSettings({ ...settings, muted: !settings.muted });
      } else if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [modal, settings, toggleFullscreen, updateSettings]);

  const openModal = useCallback((view: SettingsView) => setModal(view), []);
  const closeModal = useCallback(() => setModal(null), []);

  const build = useMemo(() => {
    return {
      weaponName: g.hud?.weaponName ?? "—",
      skills: (g.hud?.roster ?? []).map((s) => ({ name: s.name, level: s.level })),
    };
  }, [g.hud]);

  const rootStyle = { "--ui-scale": String(settings.uiScale) } as CSSProperties;
  const showHud = g.ready && g.hud !== null && HUD_PHASES.has(phase);
  const overlay = g.overlays;

  return (
    <div className="game-root" style={rootStyle} data-phase={phase}>
      <div className="game-host" ref={hostRef} />

      {!g.ready ? <LoadingSplash /> : null}

      {showHud && g.hud ? <Hud hud={g.hud} /> : null}

      <ToastStack items={overlay.toasts} />

      {g.ready && phase !== "menu" ? (
        <Banner stage={overlay.banner} boss={overlay.bossIntro} countdown={overlay.countdown} />
      ) : null}

      {g.ready && phase === "menu" ? (
        <TitleScreen
          bestStage={g.bestStage}
          highScore={g.highScore}
          checkpoint={g.checkpoint}
          onStart={g.start}
          onContinue={g.continueRun}
          onSettings={() => openModal("settings")}
          onControls={() => openModal("controls")}
        />
      ) : null}

      {g.ready && phase === "cards" && overlay.cards ? (
        <CardScreen
          header={overlay.cards.header}
          offers={overlay.cards.offers}
          rerolls={overlay.cards.rerolls}
          onChoose={g.chooseCard}
          onReroll={g.reroll}
        />
      ) : null}

      {g.ready && phase === "armory" && overlay.armory ? (
        <ArmoryScreen
          offers={overlay.armory.offers}
          rerolls={overlay.armory.rerolls}
          skills={overlay.armory.skills}
          onChoose={g.chooseWeapon}
          onKeep={g.confirmArmory}
          onReroll={g.reroll}
        />
      ) : null}

      {overlay.boons ? <BoonScreen offers={overlay.boons.offers} onChoose={g.chooseBoon} /> : null}

      {g.ready && phase === "paused" ? (
        <PauseMenu
          weaponName={build.weaponName}
          skills={build.skills}
          onResume={g.resume}
          onSettings={() => openModal("settings")}
          onControls={() => openModal("controls")}
          onQuit={g.quitToTitle}
        />
      ) : null}

      {overlay.summary && (phase === "gameover" || phase === "victory") ? (
        <GameOverScreen
          summary={overlay.summary}
          victory={phase === "victory" || overlay.summary.victory}
          onRetry={g.start}
          onTitle={g.quitToTitle}
        />
      ) : null}

      {modal ? (
        <SettingsMenu
          settings={settings}
          view={modal}
          roster={g.hud?.roster ?? []}
          onChange={g.updateSettings}
          onClose={closeModal}
        />
      ) : null}

      {debugMode ? (
        <DebugPanel api={g.debug} hud={g.hud} onClose={() => setDebugClosed(true)} />
      ) : null}

      {g.ready && overlay.resume !== null ? (
        <div className="overlay overlay-resume">
          <div className="resume-card">
            <div className="resume-title">CONTINUE?</div>
            <div className="resume-sub">
              A checkpoint was saved at Stage {overlay.resume}.
            </div>
            <div className="resume-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (overlay.resume !== null) g.continueRun(overlay.resume);
                }}
              >
                Continue Stage {overlay.resume}
              </button>
              <button type="button" className="btn" onClick={g.start}>
                New run
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {g.ready && !soundOn && !overlay.resume ? (
        <div className="sound-hint">Press any key or click for sound</div>
      ) : null}
    </div>
  );
}
