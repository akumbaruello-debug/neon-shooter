"use client";

import type { HudSkill, Role, WeaponCard, WeaponId } from "@/game/types";
import Card from "./Card";
import { WEAPON_GLYPH, hex } from "./uiUtil";
import { skillIconUrl } from "./skillIcon";

export interface ArmoryScreenProps {
  offers: WeaponCard[];
  rerolls: number;
  /** The player's active skills, straight from the engine (same source as the HUD). */
  skills: HudSkill[];
  onChoose: (id: WeaponId) => void;
  onKeep: () => void;
  onReroll: () => void;
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
  onChoose,
  onKeep,
  onReroll,
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
