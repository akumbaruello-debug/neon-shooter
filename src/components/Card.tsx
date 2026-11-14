"use client";

import type { CSSProperties } from "react";
import type { Role } from "@/game/types";
import { hex, rgba } from "./uiUtil";

export interface CardLine {
  label: string;
  value: string;
  tone?: "up" | "down" | "dim";
}

export interface CardProps {
  color: number;
  icon?: string;
  /** Rasterized icon (data URL) from skillIconUrl; takes precedence over `icon`. */
  iconUrl?: string;
  name: string;
  /** Corner tag, e.g. NEW / UPGRADE / EQUIPPED. */
  tag?: string;
  /** Small label under the name, e.g. role or category. */
  meta?: string;
  lines?: CardLine[];
  /** Monospace before>after line. */
  delta?: string;
  strength?: string;
  weakness?: string;
  capstone?: string;
  /** Renders a looping CSS preview swatch. */
  previewRole?: Role;
  keyHint?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export default function Card({
  color,
  icon,
  iconUrl,
  name,
  tag,
  meta,
  lines,
  delta,
  strength,
  weakness,
  capstone,
  previewRole,
  keyHint,
  selected,
  disabled,
  onClick,
}: CardProps) {
  const style = {
    "--card": hex(color),
    "--card-soft": rgba(color, 0.16),
    "--card-glow": rgba(color, 0.55),
  } as CSSProperties;

  return (
    <button
      type="button"
      className={`card${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
      style={style}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="card-bar" aria-hidden="true" />
      {tag ? <span className="card-tag">{tag}</span> : null}
      <span className="card-icon" aria-hidden="true">
        {iconUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element -- 96px canvas data URL, no network fetch */
          <img src={iconUrl} alt="" draggable={false} style={{ width: "2.4rem", height: "2.4rem", display: "block" }} />
        ) : (
          icon ?? "◆"
        )}
      </span>
      <span className="card-name">{name}</span>
      {meta ? <span className="card-meta">{meta}</span> : null}
      {previewRole ? (
        <span className={`card-preview role-${previewRole}`} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {delta ? <code className="card-delta">{delta}</code> : null}
      {lines && lines.length > 0 ? (
        <span className="card-lines">
          {lines.map((l, i) => (
            <span className="card-line" key={`${l.label}-${i}`}>
              <span className="card-line-label">{l.label}</span>
              <span className={`card-line-value tone-${l.tone ?? "dim"}`}>{l.value}</span>
            </span>
          ))}
        </span>
      ) : null}
      {strength ? (
        <span className="card-strong">
          <b aria-hidden="true">+</b> {strength}
        </span>
      ) : null}
      {weakness ? (
        <span className="card-weak">
          <b aria-hidden="true">−</b> {weakness}
        </span>
      ) : null}
      {capstone ? <span className="card-capstone">{capstone}</span> : null}
      {keyHint ? (
        <span className="card-key" aria-hidden="true">
          {keyHint}
        </span>
      ) : null}
    </button>
  );
}
