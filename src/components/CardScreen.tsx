"use client";

import { useEffect, useState } from "react";
import type { CardOffer, Role } from "@/game/types";
import Card, { type CardProps } from "./Card";
import { WEAPON_GLYPH } from "./uiUtil";
import { skillIconUrl } from "./skillIcon";

export interface CardScreenProps {
  header: string;
  offers: CardOffer[];
  rerolls: number;
  onChoose: (index: number) => void;
  onReroll: () => void;
}

const ROLE_LABEL: Record<Role, string> = {
  single: "Single target",
  crowd: "Crowd control",
  utility: "Utility",
};

function toCardProps(offer: CardOffer, indexKey: string): CardProps {
  switch (offer.kind) {
    case "weapon":
      return {
        color: offer.color,
        icon: WEAPON_GLYPH[offer.id],
        name: offer.name,
        tag: offer.equipped ? "EQUIPPED" : "WEAPON",
        meta: ROLE_LABEL[offer.role],
        strength: offer.strength,
        weakness: offer.weakness,
        previewRole: offer.role,
        keyHint: indexKey,
      };
    case "skill":
      return {
        color: offer.color,
        iconUrl: skillIconUrl(offer.id, offer.color),
        name: offer.name,
        tag: offer.tag,
        meta: `${offer.category} · lv ${offer.level}`,
        delta: `${offer.fromDesc ?? "Locked"} → ${offer.toDesc}`,
        capstone: offer.capstone ? `Capstone: ${offer.capstone}` : undefined,
        previewRole: undefined,
        keyHint: offer.keyHint,
      };
    case "mastery":
      return {
        color: offer.color,
        icon: "\u2694",
        name: offer.name,
        tag: `MASTERY ${offer.rank}`,
        meta: "weapon mastery",
        lines: [{ label: "", value: offer.desc, tone: "up" }],
        keyHint: indexKey,
      };
    case "salvage":
      return {
        color: offer.color,
        icon: "\u2699",
        name: offer.name,
        tag: "SALVAGE",
        meta: "resource",
        lines: [{ label: "", value: offer.desc, tone: "dim" }],
        keyHint: indexKey,
      };
    case "boon":
      return {
        color: offer.color,
        icon: "\u2727",
        name: offer.name,
        tag: "LEGENDARY",
        meta: "boon",
        lines: [{ label: "", value: offer.desc, tone: "up" }],
        keyHint: indexKey,
      };
    case "pattern":
      return {
        color: offer.color,
        icon: "\u2739",
        name: offer.name,
        tag: offer.equipped ? "EQUIPPED" : "PATTERN",
        meta: "attack pattern",
        lines: [{ label: "", value: offer.desc, tone: "up" }],
        keyHint: indexKey,
      };
  }
}

export default function CardScreen({ header, offers, rerolls, onChoose, onReroll }: CardScreenProps) {
  const [sel, setSel] = useState(0);
  const [locked, setLocked] = useState(true);
  const [prevOffers, setPrevOffers] = useState(offers);

  // Reset the selection when a new offer set arrives (derive during render).
  if (prevOffers !== offers) {
    setPrevOffers(offers);
    setSel(0);
    setLocked(true);
  }

  // Re-lock the cards for a beat whenever the offers change.
  useEffect(() => {
    const t = window.setTimeout(() => setLocked(false), 400);
    return () => window.clearTimeout(t);
  }, [offers]);

  useEffect(() => {
    if (locked) return;
    const choose = (i: number): void => {
      if (i < 0 || i >= offers.length) return;
      onChoose(i);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        setSel((s) => Math.min(offers.length - 1, s + 1));
        e.preventDefault();
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        setSel((s) => Math.max(0, s - 1));
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === " ") {
        choose(sel);
        e.preventDefault();
      } else if (/^[1-9]$/.test(e.key)) {
        choose(Number(e.key) - 1);
      } else if (e.key === "r" || e.key === "R") {
        onReroll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, offers.length, sel, onChoose, onReroll]);

  return (
    <div className="overlay overlay-cards scanlines" role="dialog" aria-label={header || "Choose a card"}>
      <div className="cards-inner">
        <div className="cards-head">
          <h2 className="cards-header">{header}</h2>
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
          {offers.map((offer, i) => (
            <Card
              key={`${offer.kind}-${offer.id}-${i}`}
              {...toCardProps(offer, String(i + 1))}
              selected={i === sel}
              disabled={locked}
              onClick={() => onChoose(i)}
            />
          ))}
        </div>

        <p className="cards-hint">← / → select · Enter confirm · 1–{offers.length} pick · R reroll</p>
      </div>
    </div>
  );
}
