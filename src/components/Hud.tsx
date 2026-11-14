"use client";

import type { CSSProperties } from "react";
import type { HudState } from "@/game/types";
import { WEAPON_GLYPH, clamp01, formatTime, hex } from "./uiUtil";
import { skillIconUrl } from "./skillIcon";

const HULL_SEGMENTS = 24;
const MAX_SKILL_SLOTS = 5;

export interface HudProps {
  hud: HudState;
}

function Radial({
  ratio,
  size,
  stroke,
  color,
  className,
}: {
  ratio: number;
  size: number;
  stroke: number;
  color: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(90,240,255,0.16)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamp01(ratio))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export default function Hud({ hud }: HudProps) {
  const hullRatio = hud.hullMax > 0 ? clamp01(hud.hull / hud.hullMax) : 0;
  const shieldRatio = hud.shieldMax > 0 ? clamp01(hud.shield / hud.shieldMax) : 0;
  const xpRatio = hud.xpToNext > 0 ? clamp01(hud.xp / hud.xpToNext) : 0;
  const filledSegments = Math.round(hullRatio * HULL_SEGMENTS);
  const energy = Math.max(clamp01(hud.heat), clamp01(hud.charge));
  const dashRatio = hud.dashCooldownMax > 0 ? 1 - clamp01(hud.dashCooldown / hud.dashCooldownMax) : 1;

  return (
    <div className="hud no-select" aria-hidden="true">
      {hud.lowHull ? <div className="hud-vignette" /> : null}

      {/* top-left: hull + shield */}
      <div className="hud-corner hud-hull">
        <div className="hud-label">
          Hull <span className="hud-num">{Math.ceil(hud.hull)}</span>
          <span className="hud-dim">/{hud.hullMax}</span>
        </div>
        <div className={`hull-bar${hud.lowHull ? " is-low" : ""}`}>
          {Array.from({ length: HULL_SEGMENTS }, (_, i) => (
            <i key={i} className={i < filledSegments ? "on" : ""} />
          ))}
        </div>
        <div className="hud-label hud-shield-label">
          Shield <span className="hud-num">{Math.ceil(hud.shield)}</span>
          <span className="hud-dim">/{hud.shieldMax}</span>
        </div>
        <div className="bar bar-shield">
          <i style={{ width: `${shieldRatio * 100}%` }} />
        </div>
      </div>

      {/* top-centre: stage + progress + threat */}
      <div className="hud-top-center">
        <div className="hud-stage-row">
          <span className="hud-stage">Stage {hud.stage}</span>
          <span className="hud-threat">T{hud.tier}</span>
        </div>
        <div className="bar bar-progress">
          <i style={{ width: `${clamp01(hud.stageProgress) * 100}%` }} />
        </div>
        {hud.boss ? (
          <div className="boss-bar">
            <div className="boss-head">
              <span className="boss-name">{hud.boss.name}</span>
              <span className="boss-title">{hud.boss.title}</span>
            </div>
            <div className="bar bar-boss">
              <i style={{ width: `${hud.boss.hpMax > 0 ? clamp01(hud.boss.hp / hud.boss.hpMax) * 100 : 0}%` }} />
              {Array.from({ length: Math.max(0, hud.boss.phases - 1) }, (_, i) => (
                <b key={i} style={{ left: `${((i + 1) / hud.boss!.phases) * 100}%` }} />
              ))}
            </div>
            <div className="boss-phase">
              Phase {hud.boss.phase}/{hud.boss.phases}
            </div>
          </div>
        ) : null}
      </div>

      {/* top-right: score + time */}
      <div className="hud-corner hud-score">
        <div className="hud-score-value">{hud.score.toLocaleString()}</div>
        <div className="hud-time">{formatTime(hud.time)}</div>
        {hud.combo > 1 ? <div className="hud-combo">x{hud.combo}</div> : null}
      </div>

      {/* bottom: xp bar */}
      <div className="hud-xp">
        <span className="hud-level">LV {hud.level}</span>
        <div className="bar bar-xp">
          <i style={{ width: `${xpRatio * 100}%` }} />
        </div>
      </div>

      {/* bottom-left: skills */}
      <div className="hud-skills">
        {Array.from({ length: MAX_SKILL_SLOTS }, (_, i) => {
          const skill = hud.skills.find((s) => s.slot === i) ?? hud.skills[i];
          if (!skill) {
            return <div className="skill-slot is-empty" key={i} />;
          }
          const cdRatio = skill.cooldownMax > 0 ? 1 - clamp01(skill.cooldown / skill.cooldownMax) : 1;
          return (
            <div
              className={`skill-slot${skill.ready ? " is-ready" : ""}`}
              key={i}
              style={{ "--slot": hex(skill.color) } as CSSProperties}
            >
              <Radial className="skill-ring" ratio={cdRatio} size={44} stroke={3} color={hex(skill.color)} />
              {/* eslint-disable-next-line @next/next/no-img-element -- 96px canvas data URL, no network fetch */}
              <img
                className="skill-icon"
                src={skillIconUrl(skill.id, skill.color)}
                alt={skill.name}
                draggable={false}
                style={{ width: "1.5rem", height: "1.5rem" }}
              />
              {skill.keyLabel ? <span className="skill-key">{skill.keyLabel}</span> : null}
              <span
                className="skill-name"
                style={{
                  position: "absolute",
                  bottom: "0.05rem",
                  left: 0,
                  right: 0,
                  fontSize: "0.48rem",
                  lineHeight: 1,
                  textAlign: "center",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  color: "var(--text-dim)",
                }}
              >
                {skill.name}
              </span>
              <span className="skill-pips">
                {Array.from({ length: 5 }, (_, p) => (
                  <i key={p} className={p < skill.level ? "on" : ""} />
                ))}
              </span>
              {!skill.ready && skill.cooldown > 0 ? (
                <span className="skill-cd">{skill.cooldown.toFixed(1)}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* bottom-right: weapon + dash */}
      <div className="hud-weapon" style={{ "--slot": hex(0x5af0ff) } as CSSProperties}>
        <Radial className="dash-ring" ratio={dashRatio} size={40} stroke={3} color="var(--cyan)" />
        <span className="dash-glyph">⇢</span>
        <div className="weapon-body">
          <div className="weapon-head">
            <span className="weapon-icon">{WEAPON_GLYPH[hud.weaponId]}</span>
            <span className="weapon-name">{hud.weaponName}</span>
          </div>
          <div className={`bar bar-energy${hud.heat >= 1 ? " is-hot" : ""}`}>
            <i style={{ width: `${energy * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
