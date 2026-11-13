/** Legendary boons: strong single-pick run modifiers offered from supply drops. */

import type { BoonCard } from "../types";

export const LEGENDARY_BOONS: BoonCard[] = [
  { kind: "boon", id: "damage_30", name: "Overclock", desc: "+30% damage", color: 0xff4d4d },
  { kind: "boon", id: "firerate_40", name: "Hot Barrel", desc: "+40% fire rate", color: 0xffa833 },
  { kind: "boon", id: "shield_100", name: "Aegis Core", desc: "+100 shield capacity", color: 0x33ccff },
  { kind: "boon", id: "nova_levelup", name: "Ascendant Pulse", desc: "Every level-up emits a damaging nova", color: 0x9b6bff },
  { kind: "boon", id: "lifesteal", name: "Siphon", desc: "Heal 1 hull per 40 kills", color: 0x4dff88 },
  { kind: "boon", id: "pierce_all", name: "Railspike", desc: "+1 pierce on every weapon", color: 0xffe066 },
  { kind: "boon", id: "crit_master", name: "Kill Sight", desc: "+25% crit chance, +75% crit damage", color: 0xff6bd6 },
  { kind: "boon", id: "second_wind", name: "Second Wind", desc: "+1 revive at 50% hull", color: 0x66e0ff },
];

/** Pick `n` distinct boons without mutating the source table. */
export function pickBoons(rng: () => number, n = 3): BoonCard[] {
  const pool = LEGENDARY_BOONS.slice();
  const count = Math.min(Math.max(1, Math.floor(n)), pool.length);
  const out: BoonCard[] = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const card = pool[j];
    if (card === undefined) break;
    pool.splice(j, 1);
    out.push(card);
  }
  return out;
}
