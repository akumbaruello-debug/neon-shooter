/**
 * Particle layer. Owns a fixed Sprite pool (one sprite per MAX_PARTICLES slot,
 * hidden when unused) with additive blending — zero allocation at runtime.
 *
 * ponytail: single white soft-glow texture + per-sprite tint instead of one
 * texture per colour, and index-based slot reuse instead of a free list keyed by
 * texture (particle kinds are visually interchangeable frame to frame). Upgrade
 * path: bake two or three glow sizes if the additive wash ever reads too soft.
 */
import { Container, Sprite, Texture } from "pixi.js";
import { MAX_PARTICLES } from "../data/constants";
import type { Particle } from "../entities";
import { makeGlow } from "./sprites";

/** "low" renders every Nth particle instead of resizing the pool. */
const LOW_STRIDE = 3;

function surface(w: number, h = w): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { c, ctx };
}

/** Hollow ring: transparent core, bright band near the edge. */
function ringCanvas(dim = 128): HTMLCanvasElement {
  const { c, ctx } = surface(dim);
  const r = dim / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.55, "rgba(255,255,255,0)");
  g.addColorStop(0.9, "rgba(255,255,255,0.4)");
  // Bright band peaks at the texture's outer radius, so a ring sprite whose
  // half-extent is `size` (s.width = size * 2) renders its visible ring at
  // radius == size. Was 0.78 -> ~22% short for callers treating `size` as radius.
  g.addColorStop(1, "rgba(255,255,255,0.95)");
  ctx.fillStyle = g;
  // ponytail: clip to the disc — a radial stop can't exceed 1.0, so without a
  // clip the canvas clamps the outer bright stop and washes the square corners.
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/** Angular shard for debris. */
function shardCanvas(dim = 32): HTMLCanvasElement {
  const { c, ctx } = surface(dim);
  const r = dim / 2;
  ctx.save();
  ctx.translate(r, r);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.lineTo(r * 0.5, r * 0.7);
  ctx.lineTo(-r * 0.35, r * 0.95);
  ctx.closePath();
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0.35)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  return c;
}

export class ParticleRenderer {
  /** Additive container; the Renderer attaches bloom to this. */
  readonly container = new Container();

  private readonly soft: Texture;
  private readonly small: Texture;
  private readonly rings: Texture;
  private readonly shards: Texture;
  private readonly sprites: Sprite[] = [];
  private low = false;
  private limit = MAX_PARTICLES;

  constructor() {
    this.container.blendMode = "add";
    this.container.eventMode = "none";
    this.soft = Texture.from(makeGlow(64, 0xffffff));
    this.small = Texture.from(makeGlow(8, 0xffffff));
    this.rings = Texture.from(ringCanvas());
    this.shards = Texture.from(shardCanvas());

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = new Sprite(this.soft);
      s.anchor.set(0.5);
      s.visible = false;
      s.eventMode = "none";
      this.sprites.push(s);
      this.container.addChild(s);
    }
  }

  setQuality(q: "low" | "high"): void {
    this.low = q === "low";
    this.limit = this.low ? Math.floor(MAX_PARTICLES / LOW_STRIDE) : MAX_PARTICLES;
  }

  render(list: readonly Particle[], dt: number): void {
    const stride = this.low ? LOW_STRIDE : 1;
    let i = 0;
    for (let k = 0; k < list.length && i < this.limit; k += stride) {
      const p = list[k];
      if (!p || !p.active) continue;
      this.apply(this.sprites[i]!, p, dt);
      i++;
    }
    for (let j = i; j < this.sprites.length; j++) {
      const s = this.sprites[j]!;
      if (s.visible) s.visible = false;
    }
  }

  clear(): void {
    for (const s of this.sprites) s.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.soft.destroy(true);
    this.small.destroy(true);
    this.rings.destroy(true);
    this.shards.destroy(true);
  }

  private apply(s: Sprite, p: Particle, dt: number): void {
    const t = p.maxLife > 0 ? 1 - p.life / p.maxLife : 1;
    const prog = t < 0 ? 0 : t > 1 ? 1 : t;
    let size = p.size + (p.sizeEnd - p.size) * prog;
    if (!(size > 0.4)) size = 0.4;

    s.visible = true;
    s.position.set(p.x, p.y);
    s.tint = p.color;
    s.rotation = p.angle + p.spin * (p.maxLife - p.life);

    switch (p.kind) {
      case "ring":
        s.texture = this.rings;
        s.width = size * 2;
        s.height = size * 2;
        break;
      case "trail":
        s.texture = this.soft;
        s.width = size;
        s.height = size * 3;
        break;
      case "smoke":
        s.texture = this.soft;
        s.width = size * 2;
        s.height = size * 2;
        break;
      case "glow":
        s.texture = this.soft;
        s.width = size * 2;
        s.height = size * 2;
        break;
      case "debris":
        s.texture = this.shards;
        s.width = size * 2;
        s.height = size * 2;
        break;
      case "spark":
      default:
        s.texture = this.small;
        s.width = size * 2;
        s.height = size * 2;
        break;
    }

    // Smoke stays hazy; everything else fades linearly to nothing.
    const fade = p.kind === "smoke" ? (1 - prog) * 0.55 : 1 - prog;
    const a = p.alpha * fade;
    s.alpha = a > 0 ? a : 0;
    void dt;
  }
}
