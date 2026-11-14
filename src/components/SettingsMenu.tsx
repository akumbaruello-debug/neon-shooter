"use client";

import { useEffect, useState } from "react";
import type { ActionName, Settings, SkillRosterEntry } from "@/game/types";
import { normalizeKey } from "./uiUtil";
import { skillIconUrl } from "./skillIcon";

export type SettingsView = "settings" | "controls";

export interface SettingsMenuProps {
  settings: Settings;
  view?: SettingsView;
  /** Every owned skill (actives + passives) for the "Your skills" list. */
  roster?: SkillRosterEntry[];
  onChange: (s: Settings) => void;
  onClose: () => void;
}

const ACTION_LABEL: Record<ActionName, string> = {
  up: "Move up",
  down: "Move down",
  left: "Move left",
  right: "Move right",
  fire: "Fire",
  dash: "Dash",
  skill1: "Skill 1",
  skill2: "Skill 2",
  skill3: "Skill 3",
  skill4: "Skill 4",
  skill5: "Skill 5",
  pause: "Pause",
  mute: "Mute",
  autoFire: "Toggle auto-fire",
};

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="set-row">
      <span className="set-label">{label}</span>
      <input
        className="set-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="set-value">{format(value)}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="set-row">
      <span className="set-label">{label}</span>
      <input
        className="set-toggle"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function SettingsMenu({ settings, view = "settings", roster = [], onChange, onClose }: SettingsMenuProps) {
  const [capturing, setCapturing] = useState<ActionName | null>(null);

  useEffect(() => {
    document.body.dataset.capturing = capturing ? "1" : "";
    return () => {
      document.body.dataset.capturing = "";
    };
  }, [capturing]);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      onChange({ ...settings, keybindings: { ...settings.keybindings, [capturing]: [normalizeKey(e)] } });
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, settings, onChange]);

  const patch = (partial: Partial<Settings>): void => onChange({ ...settings, ...partial });
  const actions = Object.keys(settings.keybindings) as ActionName[];

  return (
    <div className="overlay overlay-settings scanlines" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="panel settings-panel">
        <div className="panel-head">
          <h2 className="panel-title">{view === "controls" ? "Controls" : "Settings"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {view === "settings" ? (
          <div className="set-body">
            <Slider label="Master volume" value={settings.masterVolume} min={0} max={1} step={0.05} onChange={(v) => patch({ masterVolume: v })} format={pct} />
            <Slider label="Music volume" value={settings.musicVolume} min={0} max={1} step={0.05} onChange={(v) => patch({ musicVolume: v })} format={pct} />
            <Slider label="SFX volume" value={settings.sfxVolume} min={0} max={1} step={0.05} onChange={(v) => patch({ sfxVolume: v })} format={pct} />
            <Slider label="Screen shake" value={settings.screenShake} min={0} max={1} step={0.05} onChange={(v) => patch({ screenShake: v })} format={pct} />
            <Slider label="UI scale" value={settings.uiScale} min={0.8} max={1.4} step={0.05} onChange={(v) => patch({ uiScale: v })} format={(v) => `${v.toFixed(2)}×`} />

            <div className="set-row">
              <span className="set-label">Quality</span>
              <div className="seg">
                <button
                  type="button"
                  className={`seg-btn${settings.quality === "low" ? " is-on" : ""}`}
                  aria-pressed={settings.quality === "low"}
                  onClick={() => patch({ quality: "low" })}
                >
                  Low
                </button>
                <button
                  type="button"
                  className={`seg-btn${settings.quality === "high" ? " is-on" : ""}`}
                  aria-pressed={settings.quality === "high"}
                  onClick={() => patch({ quality: "high" })}
                >
                  High
                </button>
              </div>
            </div>

            <Toggle label="Damage numbers" checked={settings.damageNumbers} onChange={(v) => patch({ damageNumbers: v })} />
            <Toggle label="Auto-fire" checked={settings.autoFire} onChange={(v) => patch({ autoFire: v })} />
            <Toggle label="High-contrast bullets" checked={settings.highContrastBullets} onChange={(v) => patch({ highContrastBullets: v })} />
            <Toggle label="Muted" checked={settings.muted} onChange={(v) => patch({ muted: v })} />
            <Toggle label="Fullscreen" checked={settings.fullscreen} onChange={(v) => patch({ fullscreen: v })} />
            <Toggle label="Mouse aim" checked={settings.mouseAim} onChange={(v) => patch({ mouseAim: v })} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
              <span className="set-label">Your skills</span>
              {roster.length === 0 ? (
                <p className="build-empty">No skills yet.</p>
              ) : (
                [...roster]
                  .sort((a, b) =>
                    a.passive === b.passive
                      ? a.keyLabel.localeCompare(b.keyLabel, undefined, { numeric: true })
                      : a.passive
                        ? 1
                        : -1,
                  )
                  .map((e) => (
                    <div className="build-skill" key={e.id}>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 96px canvas data URL, no network fetch */}
                        <img src={skillIconUrl(e.id, e.color)} alt={e.name} style={{ width: "1.25rem", height: "1.25rem" }} />
                        <span className="build-skill-name">{e.name}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className="set-value">Lv {e.level}/5</span>
                        <span className="build-pips" aria-label={`level ${e.level} of 5`}>
                          {Array.from({ length: 5 }, (_, i) => (
                            <i key={i} className={i < e.level ? "on" : ""} />
                          ))}
                        </span>
                        {!e.passive && e.keyLabel ? (
                          <span
                            style={{
                              minWidth: "1.1rem",
                              padding: "0 0.25rem",
                              border: "1px solid var(--edge)",
                              borderRadius: "2px",
                              fontSize: "0.7rem",
                              textAlign: "center",
                              color: "var(--text-dim)",
                            }}
                          >
                            {e.keyLabel}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : (
          <div className="set-body">
            <p className="set-note">Click a row, then press a key to rebind it.</p>
            <div className="bind-list">
              {actions.map((action) => (
                <button
                  type="button"
                  className={`bind-row${capturing === action ? " is-capturing" : ""}`}
                  key={action}
                  onClick={() => setCapturing(action)}
                >
                  <span className="bind-label">{ACTION_LABEL[action]}</span>
                  <span className="bind-key">
                    {capturing === action ? "Press a key…" : (settings.keybindings[action] ?? []).join(" / ")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="panel-buttons">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
