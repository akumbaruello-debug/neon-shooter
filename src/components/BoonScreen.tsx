"use client";

import type { BoonCard } from "@/game/types";
import Card from "./Card";

export interface BoonScreenProps {
  offers: BoonCard[];
  onChoose: (index: number) => void;
}

export default function BoonScreen({ offers, onChoose }: BoonScreenProps) {
  return (
    <div className="overlay overlay-boons scanlines" role="dialog" aria-label="Legendary boon">
      <div className="cards-inner">
        <h2 className="cards-header boon-header">Legendary Boon</h2>
        <div className="cards-row">
          {offers.map((boon, i) => (
            <Card
              key={boon.id}
              color={boon.color}
              icon={"\u2727"}
              name={boon.name}
              tag="BOON"
              meta="legendary"
              lines={[{ label: "", value: boon.desc, tone: "up" }]}
              keyHint={String(i + 1)}
              onClick={() => onChoose(i)}
            />
          ))}
        </div>
        <p className="cards-hint">Pick one · it lasts the whole run</p>
      </div>
    </div>
  );
}
