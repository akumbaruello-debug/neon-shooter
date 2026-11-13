/**
 * Parallax space backdrop: 3 tiled star layers, drifting nebula glows, a distant
 * planet per sector and a dust-mote sheet.
 *
 * Everything is either a TilingSprite (one draw call for a whole star field) or
 * a handful of tinted glow sprites, so a sector never costs thousands of display
 * objects. Sector changes cross-fade tints/textures over ~0.9s.
 *
 * ponytail: TilingSprite over explicit RenderTextures — the GPU repeats the
 * baked 512px star sheet for free, so there is nothing to re-render. Upgrade
 * path: add a second star sheet per layer if tiling ever reads as obvious.
 */
import { Container, Sprite, Texture, TilingSprite } from "pixi.js";
import { SECTOR_PALETTES } from "../data/constants";
import { makeGlow } from "./sprites";

type Palette = (typeof SECTOR_PALETTES)[number];

const FADE_TIME = 0.9;
const STAR_SHEET = 512;

function surface(w: number, h = w): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { c, ctx };
}

function xorshift(seed: number): () => number {
  let s = (seed | 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function rgb(color: number): string {
  return `rgb(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff})`;
}

function mixColor(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

function paletteAt(i: number): Palette {
  const n = SECTOR_PALETTES.length;
  const idx = i < 0 ? 0 : i >= n ? n - 1 : i;
  return SECTOR_PALETTES[idx] ?? SECTOR_PALETTES[0];
}

/** Vertical sky gradient for one palette. */
function gradientCanvas(p: Palette): HTMLCanvasElement {
  const { c, ctx } = surface(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, rgb(p.bg0));
  g.addColorStop(0.55, rgb(mixColor(p.bg0, p.bg1, 0.7)));
  g.addColorStop(1, rgb(p.bg1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return c;
}

/** One baked, seamlessly tiling star sheet. */
function starSheet(seed: number, count: number, maxR: number, bright: number): HTMLCanvasElement {
  const { c, ctx } = surface(STAR_SHEET);
  const rng = xorshift(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * STAR_SHEET;
    const y = rng() * STAR_SHEET;
    const r = 0.4 + rng() * maxR;
    const a = bright * (0.35 + rng() * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.fill();
    // Draw wrapped copies so the tile seam does not show.
    if (x < maxR + 1 || y < maxR + 1 || x > STAR_SHEET - maxR - 1 || y > STAR_SHEET - maxR - 1) {
      for (const dx of [-STAR_SHEET, STAR_SHEET]) {
        for (const dy of [-STAR_SHEET, STAR_SHEET]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  return c;
}

/** Faint dust sheet (tiny motes, no wraps needed at this alpha). */
function dustSheet(seed: number): HTMLCanvasElement {
  const { c, ctx } = surface(STAR_SHEET);
  const rng = xorshift(seed);
  for (let i = 0; i < 140; i++) {
    const x = rng() * STAR_SHEET;
    const y = rng() * STAR_SHEET;
    const r = 0.3 + rng() * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(0.05 + rng() * 0.12).toFixed(3)})`;
    ctx.fill();
  }
  return c;
}

/** Lit sphere for the sector's distant planet. */
function planetCanvas(p: Palette, seed: number): HTMLCanvasElement {
  const dim = 256;
  const { c, ctx } = surface(dim);
  const r = dim / 2;
  const rng = xorshift(seed);
  const body = p.planet;
  const light = mixColor(body, 0xffffff, 0.55);
  const dark = mixColor(body, 0x000000, 0.85);

  const g = ctx.createRadialGradient(r * 0.66, r * 0.34, r * 0.05, r, r, r);
  g.addColorStop(0, rgb(light));
  g.addColorStop(0.55, rgb(body));
  g.addColorStop(0.9, rgb(dark));
  g.addColorStop(1, rgb(mixColor(dark, p.nebula, 0.35)));
  ctx.beginPath();
  ctx.arc(r, r, r * 0.96, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Banded clouds, clipped to the disc.
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r * 0.96, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const y = r * (0.3 + i * 0.16);
    ctx.beginPath();
    ctx.ellipse(r, y, r * 1.05, r * (0.04 + rng() * 0.05), -0.25, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? `rgba(0,0,0,0.22)` : `rgba(255,255,255,0.10)`;
    ctx.fill();
  }
  // Terminator shadow (light comes from upper-right).
  const sh = ctx.createRadialGradient(r * 0.66, r * 0.34, r * 0.35, r * 0.66, r * 0.34, r * 1.5);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, dim, dim);
  ctx.restore();

  // Soft rim.
  ctx.beginPath();
  ctx.arc(r, r, r * 0.97, Math.PI * 1.05, Math.PI * 1.75);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rgb(mixColor(light, 0xffffff, 0.4));
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  return c;
}

export class Background {
  /** Screen-space layer; the Renderer places it at (0,0) and never scales it. */
  readonly container = new Container();

  private readonly baseA = new Sprite();
  private readonly baseB = new Sprite();
  private readonly nebula = new Container();
  private readonly nebGlows: Sprite[] = [];
  private readonly nebPhase: number[] = [];
  private readonly planetA = new Sprite();
  private readonly planetB = new Sprite();
  private readonly stars: TilingSprite[] = [];
  private readonly dust: TilingSprite;

  private readonly grads: Texture[] = [];
  private readonly planets: Texture[] = [];
  private readonly glowTex: Texture;

  private idx = 0;
  private target = 0;
  private fade = 1;
  private time = 0;
  private vw = 1;
  private vh = 1;
  private spd = 1;

  constructor() {
    this.container.eventMode = "none";

    this.baseA.anchor.set(0);
    this.baseB.anchor.set(0);
    this.baseB.alpha = 0;
    this.container.addChild(this.baseA, this.baseB);

    this.nebula.eventMode = "none";
    this.container.addChild(this.nebula);
    this.glowTex = Texture.from(makeGlow(96, 0xffffff));
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.alpha = 0.2 + i * 0.03;
      this.nebGlows.push(s);
      this.nebPhase.push(i * 1.7);
      this.nebula.addChild(s);
    }

    this.planetA.anchor.set(0.5);
    this.planetB.anchor.set(0.5);
    this.planetB.alpha = 0;
    this.container.addChild(this.planetA, this.planetB);

    const sheets = [
      starSheet(0x1a2b3c, 260, 0.7, 0.5),
      starSheet(0x4d5e6f, 150, 1.1, 0.75),
      starSheet(0x708192, 60, 1.7, 0.95),
    ];
    for (const sheet of sheets) {
      const ts = new TilingSprite({ texture: Texture.from(sheet), width: 1, height: 1 });
      ts.eventMode = "none";
      this.stars.push(ts);
      this.container.addChild(ts);
    }

    this.dust = new TilingSprite({ texture: Texture.from(dustSheet(0x9911aa)), width: 1, height: 1 });
    this.dust.eventMode = "none";
    this.dust.alpha = 0.6;
    this.container.addChild(this.dust);

    for (const p of SECTOR_PALETTES) {
      this.grads.push(Texture.from(gradientCanvas(p)));
    }
    SECTOR_PALETTES.forEach((p, i) => {
      this.planets.push(Texture.from(planetCanvas(p, 0x3f00 + i * 7919)));
    });

    this.applyPalette(0);
  }

  setSector(n: number): void {
    const t = n < 0 ? 0 : n >= SECTOR_PALETTES.length ? SECTOR_PALETTES.length - 1 : n;
    if (t === this.target) return;
    this.target = t;
    this.fade = 0;
  }

  /** Fit the layer to the viewport with ~30% overdraw on every side. */
  layout(viewW: number, viewH: number): void {
    this.vw = Math.max(1, viewW);
    this.vh = Math.max(1, viewH);
    this.spd = Math.max(0.6, this.vh / 1080);

    const ow = this.vw * 1.6;
    const oh = this.vh * 1.6;
    this.container.position.set(-this.vw * 0.3, -this.vh * 0.3);

    for (const s of [this.baseA, this.baseB]) {
      s.position.set(0, 0);
      s.width = ow;
      s.height = oh;
    }

    this.stars.forEach((ts) => {
      ts.position.set(0, 0);
      ts.width = ow;
      ts.height = oh;
    });
    this.dust.position.set(0, 0);
    this.dust.width = ow;
    this.dust.height = oh;

    const big = Math.max(ow, oh) * 0.55;
    this.nebGlows.forEach((s, i) => {
      const fx = [0.2, 0.72, 0.45, 0.86][i] ?? 0.5;
      const fy = [0.24, 0.18, 0.76, 0.62][i] ?? 0.5;
      s.position.set(ow * fx, oh * fy);
      s.width = big * (0.9 + i * 0.22);
      s.height = s.width;
    });

    const pr = oh * 0.3;
    for (const s of [this.planetA, this.planetB]) {
      s.position.set(ow * 0.8, oh * 0.26);
      s.width = pr * 2;
      s.height = pr * 2;
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / FADE_TIME);
      if (this.fade >= 1 && this.idx !== this.target) this.idx = this.target;
    }
    this.applyPalette(this.fade);

    const s = this.spd;
    const speeds = [5, 11, 24];
    this.stars.forEach((ts, i) => {
      const v = (speeds[i] ?? 10) * s;
      ts.tilePosition.x += v * 0.25 * dt;
      ts.tilePosition.y += v * dt;
    });
    this.dust.tilePosition.x -= 2 * s * dt;
    this.dust.tilePosition.y += 3 * s * dt;

    this.nebGlows.forEach((g, i) => {
      const ph = this.nebPhase[i] ?? 0;
      g.x += Math.sin(this.time * 0.11 + ph) * 6 * s * dt;
      g.y += Math.cos(this.time * 0.09 + ph * 1.3) * 4 * s * dt;
    });

    const spin = this.time * 0.008;
    this.planetA.rotation = spin;
    this.planetB.rotation = spin;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.glowTex.destroy(true);
    for (const t of this.grads) t.destroy(true);
    for (const t of this.planets) t.destroy(true);
  }

  private applyPalette(fade: number): void {
    const from = paletteAt(this.idx);
    const to = paletteAt(this.target);
    const f = fade < 0 ? 0 : fade > 1 ? 1 : fade;

    this.baseA.texture = this.grads[this.idx] ?? this.grads[0] ?? Texture.WHITE;
    this.baseB.texture = this.grads[this.target] ?? this.grads[0] ?? Texture.WHITE;
    this.baseB.alpha = f;

    this.planetA.texture = this.planets[this.idx] ?? this.planets[0] ?? Texture.WHITE;
    this.planetB.texture = this.planets[this.target] ?? this.planets[0] ?? Texture.WHITE;
    this.planetB.alpha = f * 0.85;

    const star = mixColor(from.star, to.star, f);
    for (const ts of this.stars) ts.tint = star;
    this.dust.tint = mixColor(star, 0x000000, 0.45);

    const neb = mixColor(from.nebula, to.nebula, f);
    for (const g of this.nebGlows) g.tint = neb;
  }
}