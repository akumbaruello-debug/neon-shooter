"use client";

import type { AttackPatternId, HudSkill, Role, WeaponCard, WeaponId } from "@/game/types";
import { PATTERN_LIST } from "@/game/data/patterns";
import Card from "./Card";
import { WEAPON_GLYPH, hex } from "./uiUtil";
import { skillIconUrl } from "./skillIcon";

export interface ArmoryScreenProps {
  offers: WeaponCard[];
  rerolls: number;
  /** The player's active skills, straight from the engine (same source as the HUD). */
  skills: HudSkill[];
  /** The currently equipped attack pattern. */
  patternId: AttackPatternId;
  onChoose: (id: WeaponId) => void;
  onKeep: () => void;
  onReroll: () => void;
  onChoosePattern: (id: AttackPatternId) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  single: "Single target",
  crowd: "Crowd control",
  utility: "Utility",
};

export default function ArmoryScreen({
  offers,
  rerolls,
  skills = [],
  patternId,
  onChoose,
  onKeep,
  onReroll,
  onChoosePattern,
}: ArmoryScreenProps) {
  return (
    <div className="overlay overlay-armory scanlines" role="dialog" aria-label="Armory — choose a weapon">
      <div className="cards-inner">
        <div className="cards-head">
          <h2 className="cards-header">Armory</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onReroll}
            disabled={rerolls <= 0}
            aria-label={`Reroll, ${rerolls} left`}
          >
            Reroll · {rerolls}
          </button>
        </div>

        <div className="cards-row">
          {offers.map((offer) => (
            <Card
              key={offer.id}
              color={offer.color}
              icon={WEAPON_GLYPH[offer.id]}
              name={offer.name}
              tag={offer.equipped ? "EQUIPPED" : "SWAP"}
              meta={ROLE_LABEL[offer.role]}
              strength={offer.strength}
              weakness={offer.weakness}
              previewRole={offer.role}
              disabled={offer.equipped}
              onClick={() => {
                if (!offer.equipped) onChoose(offer.id);
              }}
            />
          ))}
        </div>

        <div
          className="armory-patterns"
          aria-label="Attack pattern"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0.5rem",
            width: "100%",
          }}
        >
          {PATTERN_LIST.map((pattern) => {
            const equipped = pattern.id === patternId;
            const color = hex(pattern.color);
            return (
              <button
                key={pattern.id}
                type="button"
                className="armory-pattern"
                title={pattern.desc}
                aria-pressed={equipped}
                onClick={() => {
                  if (!equipped) onChoosePattern(pattern.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.35rem 0.65rem",
                  border: `1px solid ${equipped ? color : "var(--text-dim)"}`,
                  background: equipped ? "rgba(6, 10, 22, 0.85)" : "rgba(6, 10, 22, 0.4)",
                  color: equipped ? color : "var(--text)",
                  cursor: equipped ? "default" : "pointer",
                  fontWeight: equipped ? 700 : 400,
                }}
              >
                <span className="pattern-name" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                  {pattern.name}
                </span>
                {equipped ? (
                  <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>EQUIPPED</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {skills.length > 0 ? (
          <div
            className="armory-skills"
            role="list"
            aria-label="Your skills"
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.75rem",
              width: "100%",
            }}
          >
            {skills.map((skill) => {
              const color = hex(skill.color);
              return (
                <div
                  key={skill.id}
                  role="listitem"
                  className="armory-skill"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.35rem 0.65rem",
                    border: `1px solid ${color}`,
                    background: "rgba(6, 10, 22, 0.6)",
                    color,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 96px canvas data URL, no network fetch */}
                  <img
                    className="skill-icon"
                    src={skillIconUrl(skill.id, skill.color)}
                    alt={skill.name}
                    draggable={false}
                    style={{ width: "1.5rem", height: "1.5rem" }}
                  />
                  <span className="skill-name" style={{ color: "var(--text)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    {skill.name}
                  </span>
                  {skill.keyLabel ? (
                    <span
                      className="skill-key"
                      style={{
                        position: "static",
                        color: "var(--text-dim)",
                        fontSize: "0.7rem",
                        border: "1px solid currentColor",
                        borderRadius: "0.2rem",
                        padding: "0 0.25rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {skill.keyLabel}
                    </span>
                  ) : null}
                  <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>LV {skill.level}</span>
                  <span style={{ color: "var(--text-dim)", fontSize: "0.7rem" }}>
                    {skill.cooldown > 0 ? `${skill.cooldown.toFixed(1)}s` : "Ready"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="cards-foot">
          <button type="button" className="btn" onClick={onKeep}>
            Keep Current Weapon
          </button>
        </div>
      </div>
    </div>
  );
}
