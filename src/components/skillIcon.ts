/**
 * DOM-only bridge from the skill id to a rasterized PNG data URL. Shared by the
 * HUD, cards and armory so the painted icon can never drift between them.
 */
import type { SkillId } from "@/game/types";
import { makeSkillIcon } from "@/game/render/icons";

const cache = new Map<string, string>();

/**
 * Cached 96px PNG data URL for a skill icon (crisp when scaled to ~28-32px).
 * Returns "" during SSR / when no canvas is available; the game UI is
 * client-only, but this keeps a server render from throwing.
 */
export function skillIconUrl(id: SkillId, color: number): string {
  if (typeof document === "undefined") return "";
  const key = `${id}:${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const url = makeSkillIcon(id, color).toDataURL("image/png");
  cache.set(key, url);
  return url;
}