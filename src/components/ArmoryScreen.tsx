"use client";

import type { Role, WeaponCard, WeaponId } from "@/game/types";
import Card from "./Card";
import { WEAPON_GLYPH } from "./uiUtil";

export interface ArmoryScreenProps {
  offers: WeaponCard[];
  rerolls: number;
  onChoose: (id: WeaponId) => void;
  onKeep: () => void;
  onReroll: () => void;
}

const ROLE_LABEL: Record<Role, string> = {
  single: "Single target",
  crowd: "Crowd control",
  utility: "Utility",
};

export default function ArmoryScreen({ offers, rerolls, onChoose, onKeep, onReroll }: ArmoryScreenProps) {
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

        <div className="cards-foot">
          <button type="button" className="btn" onClick={onKeep}>
            Keep Current Weapon
          </button>
        </div>
      </div>
    </div>
  );
}
