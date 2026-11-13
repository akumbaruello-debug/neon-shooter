/**
 * Shared DOM-side helpers for the HUD / overlay components. Pure functions only
 * so this module can be imported from any client component without a directive.
 */
import type { SkillCategory, WeaponId } from "@/game/types";

/** 0xRRGGBB -> "#rrggbb". */
export function hex(n: number): string {
  return "#" + ((n >>> 0) & 0xffffff).toString(16).padStart(6, "0");
}

/** 0xRRGGBB + alpha -> "rgba(r, g, b, a)". */
export function rgba(n: number, a: number): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Seconds -> "m:ss". */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Normalise a KeyboardEvent.key into the same spelling as DEFAULT_BINDINGS. */
export function normalizeKey(e: KeyboardEvent): string {
  const k = e.key;
  if (k === " " || k === "Spacebar") return "Space";
  if (k === "Escape") return "Esc";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

/** Glyph shown on weapon cards / the HUD (weapon cards carry no icon field). */
export const WEAPON_GLYPH: Record<WeaponId, string> = {
  focus_lance: "↦",
  gatling_vulcan: "≡",
  rail_charge: "▬",
  prism_beam: "▮",
  scatter_shot: "⁂",
  crescent_slash: "☾",
  arc_chain: "⚡",
  plasma_orb: "◉",
  seeker_swarm: "✦",
  ricochet_disc: "◐",
  boomerang_blade: "➰",
  crossfire: "✚",
};

export const CATEGORY_COLOR: Record<SkillCategory, number> = {
  offense: 0xff6b4a,
  defense: 0x33ccff,
  utility: 0x4dffa6,
  active: 0xa06bff,
};
