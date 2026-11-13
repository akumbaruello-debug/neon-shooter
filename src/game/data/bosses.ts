import type { BossDef } from "../types";

/** Boss table, keyed by stage. HP is base (tier scaling applied later). */
export const BOSSES: Record<number, BossDef> = {
  10: {
    id: "warden_colossus",
    stage: 10,
    name: "Warden Colossus",
    title: "Siege Gunship",
    hp: 8000,
    radius: 120,
    color: 0xb4571e,
    accent: 0xffb26b,
    phases: 2,
    patterns: ["aimed_volley", "fan_sweep", "rock_drop", "double_fan", "spiral"],
    targetSeconds: 70,
  },
  20: {
    id: "razor_queen",
    stage: 20,
    name: "Razor Queen",
    title: "Blade Tyrant",
    hp: 13000,
    radius: 130,
    color: 0x8f1330,
    accent: 0xff2ea6,
    phases: 2,
    patterns: ["multilane_charge", "summon_breakers", "wall_slam"],
    targetSeconds: 90,
  },
  30: {
    id: "prism_sentinel",
    stage: 30,
    name: "Prism Sentinel",
    title: "Crystal Warden",
    hp: 20000,
    radius: 150,
    color: 0x36d6e0,
    accent: 0x9b6bff,
    phases: 3,
    patterns: ["rotating_lasers", "bullet_curtain", "teleport", "mirror_shield"],
    targetSeconds: 115,
  },
  40: {
    id: "void_carrier",
    stage: 40,
    name: "Void Carrier",
    title: "Node Harvester",
    hp: 32000,
    radius: 190,
    color: 0x1f6f4a,
    accent: 0x8dff9f,
    phases: 3,
    patterns: ["shield_nodes", "launch_squads", "gravity_pull", "turret_array"],
    targetSeconds: 150,
  },
  50: {
    id: "eclipse_sovereign",
    stage: 50,
    name: "Eclipse Sovereign",
    title: "Final Sovereign",
    hp: 60000,
    radius: 220,
    color: 0xd4af37,
    accent: 0xffffff,
    phases: 4,
    patterns: [
      "aimed_volley",
      "multilane_charge",
      "rotating_lasers",
      "bullet_curtain",
      "gravity_pull",
      "spiral",
      "turret_array",
    ],
    enragePatterns: ["spiral", "bullet_curtain", "multilane_charge"],
    targetSeconds: 240,
  },
};

export const BOSS_LIST: BossDef[] = Object.values(BOSSES);

/** Boss for a stage, or undefined for non-boss stages. */
export function getBoss(stage: number): BossDef | undefined {
  return BOSSES[stage];
}
