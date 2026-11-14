/**
 * ponytail: procedural vector art rasterized ONCE at load into offscreen
 * canvases (static raster, no runtime redraw). Ceiling: single fixed frame per
 * asset, no animation. Upgrade path: bake N flame/flicker frames, or move to a
 * live draw / shader if a boss ever needs animated parts.
 * Plain Canvas 2D only. No external images, no copyrighted art, no emojis.
 * Deterministic given a seed (local xorshift). No imports from other files.
 */

export type Canvas = HTMLCanvasElement;

/** 2D drawing context alias. */
type Ctx = CanvasRenderingContext2D;
/** A point tuple (never indexed, so noUncheckedIndexedAccess stays happy). */
type P = readonly [number, number];

// -------------------------------------------------------------------- utils

function surface(w: number, h: number = w): { canvas: Canvas; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
}

/** Tiny deterministic xorshift32 PRNG → floats in [0, 1). */
function xorshift(seed: number): () => number {
  let s = (seed | 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function css(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);
const darken = (c: number, t: number): number => mix(c, 0x000000, t);

function lineGrad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: ReadonlyArray<readonly [number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function radialGrad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: ReadonlyArray<readonly [number, string]>): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function polyPath(ctx: Ctx, ...pts: P[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function starPath(ctx: Ctx, cx: number, cy: number, spikes: number, outer: number, inner: number, rot = 0): void {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i / (spikes * 2)) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function glowOn(ctx: Ctx, color: number, blur: number, alpha = 0.9): void {
  ctx.shadowColor = css(color, alpha);
  ctx.shadowBlur = blur;
}
function glowOff(ctx: Ctx): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0,0,0,0)";
}

// -------------------------------------------------------------- player ship

/** The "Aegis" — white/cyan swept-wing interceptor, nose up. */
function drawAegis(ctx: Ctx): void {
  // --- swept wings (behind hull) ---
  for (const dir of [-1, 1]) {
    polyPath(ctx, [dir * 4, -6], [dir * 43, 21], [dir * 35, 32], [dir * 8, 13]);
    ctx.fillStyle = lineGrad(ctx, 0, -8, 0, 34, [
      [0, "#eaf7ff"],
      [0.45, "#9fd8ff"],
      [1, "#255b86"],
    ]);
    ctx.fill();
    // leading-edge rim light
    ctx.beginPath();
    ctx.moveTo(dir * 4, -6);
    ctx.lineTo(dir * 43, 21);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    // wing panel line
    ctx.beginPath();
    ctx.moveTo(dir * 12, 2);
    ctx.lineTo(dir * 33, 24);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgba(20,70,110,0.55)";
    ctx.stroke();
  }

  // --- fuselage ---
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.quadraticCurveTo(9, -30, 11, -6);
  ctx.lineTo(9, 20);
  ctx.lineTo(6, 38);
  ctx.lineTo(-6, 38);
  ctx.lineTo(-9, 20);
  ctx.lineTo(-11, -6);
  ctx.quadraticCurveTo(-9, -30, 0, -46);
  ctx.closePath();
  ctx.fillStyle = lineGrad(ctx, -11, 0, 11, 0, [
    [0, "#ffffff"],
    [0.34, "#dff3ff"],
    [0.72, "#7fc3ef"],
    [1, "#275c8a"],
  ]);
  ctx.fill();
  glowOn(ctx, 0x8fdcff, 10, 0.5);
  ctx.strokeStyle = "rgba(140,220,255,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  glowOff(ctx);

  // inner shadow along the belly
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-9, 20);
  ctx.lineTo(-6, 38);
  ctx.lineTo(6, 38);
  ctx.lineTo(9, 20);
  ctx.closePath();
  ctx.fillStyle = "rgba(6,26,44,0.35)";
  ctx.fill();
  ctx.restore();

  // centre panel line
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(0, 34);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = "rgba(30,80,120,0.5)";
  ctx.stroke();

  // --- cockpit canopy ---
  ctx.beginPath();
  ctx.ellipse(0, -19, 6.5, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = lineGrad(ctx, 0, -30, 0, -8, [
    [0, "#0b2b3f"],
    [0.45, "#1f88b4"],
    [1, "#0a2233"],
  ]);
  ctx.fill();
  // specular highlight
  ctx.beginPath();
  ctx.ellipse(-2.2, -24, 1.5, 4, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  // --- engine nozzles (hot core) ---
  for (const x of [-5.5, 5.5]) {
    roundRect(ctx, x - 3.4, 33, 6.8, 8, 2);
    ctx.fillStyle = lineGrad(ctx, 0, 33, 0, 41, [
      [0, "#123047"],
      [1, "#05080d"],
    ]);
    ctx.fill();
    glowOn(ctx, 0x59e6ff, 9);
    circle(ctx, x, 38, 2.6);
    ctx.fillStyle = radialGrad(ctx, x, 38, 0, 3, [
      [0, "#ffffff"],
      [0.5, "#8ff0ff"],
      [1, "rgba(60,200,255,0)"],
    ]);
    ctx.fill();
    glowOff(ctx);
  }

  // left rim light on the nose
  ctx.beginPath();
  ctx.moveTo(-1, -46);
  ctx.quadraticCurveTo(-8, -30, -9.5, -8);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.stroke();
}

export function makePlayerShip(scale = 1): Canvas {
  const size = Math.max(24, Math.round(96 * scale));
  const { canvas, ctx } = surface(size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 96, size / 96);
  drawAegis(ctx);
  ctx.restore();
  return canvas;
}

// ----------------------------------------------------------- thruster flame

export function makeThrusterFlame(scale = 1): Canvas {
  const w = Math.max(12, Math.round(42 * scale));
  const h = Math.max(20, Math.round(76 * scale));
  const { canvas, ctx } = surface(w, h);
  const cx = w / 2;

  const teardrop = (xw: number, yTop: number, yBot: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx, yTop);
    ctx.bezierCurveTo(cx + xw, yTop + (yBot - yTop) * 0.22, cx + xw * 0.72, yBot * 0.72, cx, yBot);
    ctx.bezierCurveTo(cx - xw * 0.72, yBot * 0.72, cx - xw, yTop + (yBot - yTop) * 0.22, cx, yTop);
    ctx.closePath();
  };

  glowOn(ctx, 0xff6a1a, 14, 0.8);
  teardrop(w * 0.4, 0, h);
  ctx.fillStyle = lineGrad(ctx, 0, 0, 0, h, [
    [0, "rgba(255,110,20,0.95)"],
    [0.5, "rgba(255,170,50,0.8)"],
    [1, "rgba(255,50,0,0)"],
  ]);
  ctx.fill();
  glowOff(ctx);

  teardrop(w * 0.26, 0, h * 0.78);
  ctx.fillStyle = lineGrad(ctx, 0, 0, 0, h * 0.78, [
    [0, "rgba(255,220,120,0.95)"],
    [1, "rgba(255,150,40,0)"],
  ]);
  ctx.fill();

  glowOn(ctx, 0x8ff0ff, 12);
  teardrop(w * 0.12, 0, h * 0.5);
  ctx.fillStyle = lineGrad(ctx, 0, 0, 0, h * 0.5, [
    [0, "rgba(255,255,255,0.98)"],
    [1, "rgba(140,240,255,0)"],
  ]);
  ctx.fill();
  glowOff(ctx);

  return canvas;
}

// ------------------------------------------------------------------- rocks

const ROCK_TINT: Record<"normal" | "ice" | "metal" | "explosive", { dark: number; light: number; rim: number; alpha: number }> = {
  normal: { dark: 0x3d4049, light: 0x8f95a3, rim: 0xd6deea, alpha: 1 },
  ice: { dark: 0x2a5a78, light: 0xc4ecff, rim: 0xffffff, alpha: 0.88 },
  metal: { dark: 0x3f4751, light: 0xaab6c2, rim: 0xeaf1f8, alpha: 1 },
  explosive: { dark: 0x241d20, light: 0x4a3d42, rim: 0xff6a3c, alpha: 1 },
};

export function makeRock(variant: "normal" | "ice" | "metal" | "explosive", size: number, seed: number): Canvas {
  const dim = Math.max(8, Math.round(size));
  const { canvas, ctx } = surface(dim);
  const c = dim / 2;
  const R = c * 0.86;
  const rng = xorshift(seed);
  const tint = ROCK_TINT[variant];

  ctx.save();
  ctx.translate(c, c);
  ctx.globalAlpha = tint.alpha;

  // irregular silhouette
  const n = 10 + Math.floor(rng() * 5);
  const pts: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = R * (0.72 + rng() * 0.28);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const path = (): void => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  path();
  ctx.fillStyle = lineGrad(ctx, -R, -R, R, R, [
    [0, css(tint.light)],
    [0.5, css(mix(tint.light, tint.dark, 0.6))],
    [1, css(tint.dark)],
  ]);
  ctx.fill();

  // everything below stays inside the rock
  ctx.save();
  path();
  ctx.clip();

  // inner shadow (bottom-right)
  ctx.fillStyle = radialGrad(ctx, R * 0.42, R * 0.5, 0, R * 1.4, [
    [0, "rgba(0,0,0,0)"],
    [1, "rgba(0,0,0,0.5)"],
  ]);
  ctx.fillRect(-R, -R, R * 2, R * 2);

  // craters
  const craters = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < craters; i++) {
    const cx = (rng() * 2 - 1) * R * 0.55;
    const cy = (rng() * 2 - 1) * R * 0.55;
    const cr = R * (0.1 + rng() * 0.16);
    circle(ctx, cx, cy, cr);
    ctx.fillStyle = css(darken(tint.dark, 0.3), 0.85);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - cr * 0.25, cr, Math.PI * 1.15, Math.PI * 1.9);
    ctx.strokeStyle = css(lighten(tint.light, 0.3), 0.7);
    ctx.lineWidth = Math.max(1, R * 0.03);
    ctx.stroke();
  }

  if (variant === "metal") {
    // plate seams
    ctx.strokeStyle = css(darken(tint.dark, 0.5), 0.9);
    ctx.lineWidth = Math.max(1, R * 0.05);
    for (let i = 0; i < 3; i++) {
      const y = -R * 0.6 + i * R * 0.6 + rng() * R * 0.2;
      ctx.beginPath();
      ctx.moveTo(-R, y);
      ctx.lineTo(R, y + (rng() * 2 - 1) * R * 0.25);
      ctx.stroke();
      ctx.strokeStyle = css(lighten(tint.light, 0.3), 0.5);
      ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.beginPath();
      ctx.moveTo(-R, y + 2);
      ctx.lineTo(R, y + 2 + (rng() * 2 - 1) * R * 0.2);
      ctx.stroke();
      ctx.strokeStyle = css(darken(tint.dark, 0.5), 0.9);
      ctx.lineWidth = Math.max(1, R * 0.05);
    }
  }

  if (variant === "explosive") {
    // pulsing red cracks
    glowOn(ctx, 0xff2a12, R * 0.4, 0.9);
    ctx.strokeStyle = "rgba(255,70,30,0.95)";
    ctx.lineWidth = Math.max(1, R * 0.045);
    const crack = (a: number): void => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      let x = 0;
      let y = 0;
      for (let s = 0; s < 4; s++) {
        const len = R * (0.18 + rng() * 0.16);
        const aa = a + (rng() * 2 - 1) * 0.5;
        x += Math.cos(aa) * len;
        y += Math.sin(aa) * len;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    crack(rng() * Math.PI * 2);
    crack(rng() * Math.PI * 2);
    crack(rng() * Math.PI * 2);
    glowOff(ctx);
  }

  ctx.restore(); // unclip

  // rim light (upper-left)
  path();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.05, Math.PI * 1.05, Math.PI * 1.85);
  ctx.lineWidth = Math.max(1.2, R * 0.09);
  ctx.strokeStyle = css(tint.rim, 0.75);
  ctx.stroke();
  ctx.restore();

  // silhouette edge
  path();
  ctx.lineWidth = Math.max(1, R * 0.03);
  ctx.strokeStyle = css(darken(tint.dark, 0.4), 0.9);
  ctx.stroke();

  ctx.restore();
  return canvas;
}

// ------------------------------------------------------------------ raider

/** Crimson/orange raider fighter with twin forward cannons, nose up. */
export function makeRaider(scale = 1): Canvas {
  const size = Math.max(24, Math.round(84 * scale));
  const { canvas, ctx } = surface(size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 84, size / 84);

  const body = 0x8f1330;
  const hot = 0xff7a1e;

  // twin cannons
  for (const x of [-11, 11]) {
    roundRect(ctx, x - 2.6, -44, 5.2, 22, 2);
    ctx.fillStyle = lineGrad(ctx, x - 2.6, 0, x + 2.6, 0, [
      [0, "#2b2f38"],
      [0.5, "#828b98"],
      [1, "#1c2027"],
    ]);
    ctx.fill();
    glowOn(ctx, hot, 8);
    roundRect(ctx, x - 3, -46, 6, 5, 1.5);
    ctx.fillStyle = css(hot);
    ctx.fill();
    glowOff(ctx);
  }

  // rear-swept wings
  for (const dir of [-1, 1]) {
    polyPath(ctx, [dir * 6, -4], [dir * 40, 16], [dir * 26, 30], [dir * 8, 12]);
    ctx.fillStyle = lineGrad(ctx, 0, -6, 0, 30, [
      [0, css(lighten(body, 0.45))],
      [1, css(darken(body, 0.55))],
    ]);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(dir * 6, -4);
    ctx.lineTo(dir * 40, 16);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css(hot, 0.8);
    ctx.stroke();
  }

  // fuselage
  polyPath(ctx, [0, -40], [12, -12], [10, 18], [6, 34], [-6, 34], [-10, 18], [-12, -12]);
  ctx.fillStyle = lineGrad(ctx, -12, 0, 12, 0, [
    [0, css(lighten(body, 0.35))],
    [0.45, css(body)],
    [1, css(darken(body, 0.6))],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.stroke();

  // orange stripe
  ctx.beginPath();
  ctx.moveTo(-3, -22);
  ctx.lineTo(3, -22);
  ctx.lineTo(4, 24);
  ctx.lineTo(-4, 24);
  ctx.closePath();
  ctx.fillStyle = css(hot, 0.9);
  ctx.fill();

  // canopy
  ctx.beginPath();
  ctx.ellipse(0, -16, 5.4, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = lineGrad(ctx, 0, -26, 0, -8, [
    [0, "#3a0a1a"],
    [0.5, "#ff9a3c"],
    [1, "#4a0d1e"],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1.8, -20, 1.2, 3.2, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fill();

  // engines
  for (const x of [-5, 5]) {
    glowOn(ctx, hot, 9);
    circle(ctx, x, 36, 3.2);
    ctx.fillStyle = radialGrad(ctx, x, 36, 0, 3.6, [
      [0, "#ffffff"],
      [0.5, "#ffd59a"],
      [1, "rgba(255,120,20,0)"],
    ]);
    ctx.fill();
    glowOff(ctx);
  }

  ctx.restore();
  return canvas;
}

// ----------------------------------------------------------------- breaker

/** Spiked dark-metal breaker with a glowing magenta core. */
export function makeBreaker(size: number): Canvas {
  const dim = Math.max(8, Math.round(size));
  const { canvas, ctx } = surface(dim);
  const c = dim / 2;
  const R = c * 0.92;
  ctx.save();
  ctx.translate(c, c);

  const metal = 0x3b3f4a;
  const core = 0xff2ea6;

  // spiked shell
  starPath(ctx, 0, 0, 12, R, R * 0.62, Math.PI / 12);
  ctx.fillStyle = lineGrad(ctx, -R, -R, R, R, [
    [0, css(lighten(metal, 0.5))],
    [0.45, css(metal)],
    [1, css(darken(metal, 0.65))],
  ]);
  ctx.fill();
  ctx.lineWidth = Math.max(1, R * 0.04);
  ctx.strokeStyle = css(darken(metal, 0.6));
  ctx.stroke();

  // inner shadow ring
  starPath(ctx, 0, 0, 12, R * 0.9, R * 0.55, Math.PI / 12);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();

  // rim light (upper-left)
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.02, Math.PI * 1.05, Math.PI * 1.75);
  ctx.lineWidth = Math.max(1, R * 0.07);
  ctx.strokeStyle = "rgba(230,240,255,0.55)";
  ctx.stroke();

  // hot magenta core
  glowOn(ctx, core, R * 0.55);
  circle(ctx, 0, 0, R * 0.3);
  ctx.fillStyle = radialGrad(ctx, 0, 0, 0, R * 0.3, [
    [0, "#ffffff"],
    [0.35, "#ff9ede"],
    [0.7, css(core)],
    [1, "rgba(255,46,166,0.1)"],
  ]);
  ctx.fill();
  glowOff(ctx);

  ctx.restore();
  return canvas;
}

// ------------------------------------------------------------------- bosses

function drawWarden(ctx: Ctx, R: number): void {
  const rust = 0xb4571e;
  const accent = 0xffb26b;

  // double gun barrels
  for (const dx of [-R * 0.42, R * 0.42]) {
    roundRect(ctx, dx - R * 0.1, R * 0.15, R * 0.2, R * 1.0, R * 0.05);
    ctx.fillStyle = lineGrad(ctx, dx - R * 0.1, 0, dx + R * 0.1, 0, [
      [0, css(darken(rust, 0.6))],
      [0.5, css(mix(rust, 0x9aa4b0, 0.5))],
      [1, css(darken(rust, 0.65))],
    ]);
    ctx.fill();
    roundRect(ctx, dx - R * 0.13, R * 1.06, R * 0.26, R * 0.16, R * 0.05);
    ctx.fillStyle = css(darken(rust, 0.72));
    ctx.fill();
    glowOn(ctx, accent, R * 0.16);
    ctx.beginPath();
    ctx.ellipse(dx, R * 1.08, R * 0.08, R * 0.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = css(accent);
    ctx.fill();
    glowOff(ctx);
  }

  // main armored hull
  polyPath(
    ctx,
    [-R, -R * 0.32],
    [-R * 0.68, -R * 0.78],
    [R * 0.68, -R * 0.78],
    [R, -R * 0.32],
    [R * 0.82, R * 0.55],
    [R * 0.4, R * 0.74],
    [-R * 0.4, R * 0.74],
    [-R * 0.82, R * 0.55],
  );
  ctx.fillStyle = lineGrad(ctx, 0, -R, 0, R, [
    [0, css(lighten(rust, 0.4))],
    [0.45, css(rust)],
    [1, css(darken(rust, 0.55))],
  ]);
  ctx.fill();
  ctx.lineWidth = R * 0.04;
  ctx.strokeStyle = css(darken(rust, 0.6));
  ctx.stroke();

  // armour plating
  for (let i = -1; i <= 1; i++) {
    roundRect(ctx, i * R * 0.5 - R * 0.22, -R * 0.55, R * 0.44, R * 0.5, R * 0.06);
    ctx.fillStyle = css(lighten(rust, 0.18), 0.55);
    ctx.fill();
    ctx.lineWidth = R * 0.02;
    ctx.strokeStyle = css(darken(rust, 0.5), 0.8);
    ctx.stroke();
  }

  // turret dome
  ctx.beginPath();
  ctx.arc(0, -R * 0.2, R * 0.34, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = lineGrad(ctx, 0, -R * 0.55, 0, -R * 0.18, [
    [0, css(lighten(rust, 0.5))],
    [1, css(darken(rust, 0.35))],
  ]);
  ctx.fill();
  glowOn(ctx, accent, R * 0.1);
  ctx.beginPath();
  ctx.arc(0, -R * 0.32, R * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = css(accent);
  ctx.fill();
  glowOff(ctx);

  // rivets
  ctx.fillStyle = css(darken(rust, 0.5));
  for (let i = -2; i <= 2; i++) {
    circle(ctx, i * R * 0.42, R * 0.6, R * 0.03);
    ctx.fill();
  }

  // rim light upper-left
  ctx.beginPath();
  ctx.moveTo(-R * 0.68, -R * 0.78);
  ctx.lineTo(-R, -R * 0.32);
  ctx.lineTo(-R * 0.82, R * 0.55);
  ctx.lineWidth = R * 0.05;
  ctx.strokeStyle = "rgba(255,224,180,0.7)";
  ctx.stroke();
}

function drawRazorQueen(ctx: Ctx, R: number): void {
  const crimson = 0x8f1330;
  const black = 0x170a12;
  const accent = 0xff2ea6;

  // twin scythe wings
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * R * 0.2, -R * 0.9);
    ctx.quadraticCurveTo(dir * R * 1.15, -R * 0.7, dir * R * 0.95, R * 0.35);
    ctx.quadraticCurveTo(dir * R * 0.8, R * 0.05, dir * R * 0.5, R * 0.15);
    ctx.quadraticCurveTo(dir * R * 0.7, -R * 0.45, dir * R * 0.2, -R * 0.9);
    ctx.closePath();
    ctx.fillStyle = lineGrad(ctx, 0, -R, 0, R * 0.4, [
      [0, css(crimson)],
      [0.6, css(black)],
      [1, css(lighten(crimson, 0.2))],
    ]);
    ctx.fill();
    glowOn(ctx, accent, R * 0.12, 0.7);
    ctx.lineWidth = R * 0.03;
    ctx.strokeStyle = css(accent, 0.9);
    ctx.stroke();
    glowOff(ctx);
  }

  // black core body
  polyPath(ctx, [0, -R * 1.0], [R * 0.32, -R * 0.1], [R * 0.2, R * 0.85], [-R * 0.2, R * 0.85], [-R * 0.32, -R * 0.1]);
  ctx.fillStyle = lineGrad(ctx, -R * 0.32, 0, R * 0.32, 0, [
    [0, css(black)],
    [0.5, css(crimson)],
    [1, css(black)],
  ]);
  ctx.fill();

  // glowing eye
  glowOn(ctx, accent, R * 0.2);
  circle(ctx, 0, -R * 0.5, R * 0.1);
  ctx.fillStyle = css(accent);
  ctx.fill();
  glowOff(ctx);

  // crown
  ctx.fillStyle = css(crimson);
  starPath(ctx, 0, -R * 0.95, 5, R * 0.3, R * 0.12, -Math.PI / 2);
  ctx.fill();

  // rim light
  ctx.beginPath();
  ctx.moveTo(0, -R);
  ctx.lineTo(-R * 0.32, -R * 0.1);
  ctx.lineWidth = R * 0.035;
  ctx.strokeStyle = "rgba(255,180,220,0.6)";
  ctx.stroke();
}

function drawPrismSentinel(ctx: Ctx, R: number): void {
  const cyan = 0x36d6e0;
  const violet = 0x9b6bff;

  // floating shards (radial symmetry)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const rr = R * 0.82;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    polyPath(ctx, [0, -R * 0.3], [R * 0.16, 0], [0, R * 0.3], [-R * 0.16, 0]);
    ctx.fillStyle = lineGrad(ctx, 0, -R * 0.3, 0, R * 0.3, [
      [0, css(lighten(cyan, 0.4))],
      [1, css(violet)],
    ]);
    ctx.fill();
    glowOn(ctx, cyan, R * 0.1, 0.6);
    ctx.strokeStyle = css(lighten(cyan, 0.5), 0.8);
    ctx.lineWidth = R * 0.015;
    ctx.stroke();
    glowOff(ctx);
    ctx.restore();
  }

  // central faceted crystal
  polyPath(
    ctx,
    [0, -R * 0.72],
    [R * 0.55, -R * 0.3],
    [R * 0.5, R * 0.4],
    [0, R * 0.75],
    [-R * 0.5, R * 0.4],
    [-R * 0.55, -R * 0.3],
  );
  ctx.fillStyle = lineGrad(ctx, -R * 0.5, -R * 0.7, R * 0.5, R * 0.7, [
    [0, css(lighten(cyan, 0.5))],
    [0.45, css(cyan)],
    [1, css(violet)],
  ]);
  ctx.fill();
  ctx.lineWidth = R * 0.02;
  ctx.strokeStyle = css(lighten(cyan, 0.6), 0.9);
  ctx.stroke();

  // facets
  ctx.strokeStyle = "rgba(230,255,255,0.5)";
  ctx.lineWidth = R * 0.015;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.72);
  ctx.lineTo(0, R * 0.75);
  ctx.moveTo(-R * 0.55, -R * 0.3);
  ctx.lineTo(R * 0.5, R * 0.4);
  ctx.moveTo(R * 0.55, -R * 0.3);
  ctx.lineTo(-R * 0.5, R * 0.4);
  ctx.stroke();

  // core glow
  glowOn(ctx, 0xffffff, R * 0.3, 0.8);
  circle(ctx, 0, 0, R * 0.12);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  glowOff(ctx);
}

function drawVoidCarrier(ctx: Ctx, R: number): void {
  const hull = 0x1f6f4a;
  const black = 0x080d0b;
  const accent = 0x8dff9f;

  // wide carrier hull
  polyPath(
    ctx,
    [-R, -R * 0.35],
    [-R * 0.55, -R * 0.62],
    [R * 0.55, -R * 0.62],
    [R, -R * 0.35],
    [R * 0.7, R * 0.6],
    [-R * 0.7, R * 0.6],
  );
  ctx.fillStyle = lineGrad(ctx, 0, -R * 0.6, 0, R * 0.6, [
    [0, css(lighten(hull, 0.3))],
    [0.5, css(hull)],
    [1, css(black)],
  ]);
  ctx.fill();
  ctx.lineWidth = R * 0.04;
  ctx.strokeStyle = css(black);
  ctx.stroke();

  // deck stripes
  ctx.fillStyle = css(darken(hull, 0.55), 0.8);
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(-R * 0.85, i * R * 0.28 - R * 0.02, R * 1.7, R * 0.04);
  }

  // 3 shield-generator nodes
  for (let i = -1; i <= 1; i++) {
    glowOn(ctx, accent, R * 0.22, 0.9);
    circle(ctx, i * R * 0.5, -R * 0.28, R * 0.15);
    ctx.fillStyle = radialGrad(ctx, i * R * 0.5, -R * 0.28, 0, R * 0.15, [
      [0, "#ffffff"],
      [0.5, css(accent)],
      [1, "rgba(141,255,159,0.1)"],
    ]);
    ctx.fill();
    glowOff(ctx);
    ctx.beginPath();
    ctx.arc(i * R * 0.5, -R * 0.28, R * 0.22, 0, Math.PI * 2);
    ctx.lineWidth = R * 0.02;
    ctx.strokeStyle = css(accent, 0.5);
    ctx.stroke();
  }

  // hangar slots
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, -R * 0.68 + i * R * 0.35, R * 0.28, R * 0.24, R * 0.2, R * 0.03);
    ctx.fillStyle = css(black);
    ctx.fill();
    ctx.strokeStyle = css(accent, 0.4);
    ctx.lineWidth = R * 0.015;
    ctx.stroke();
  }

  // rim light
  ctx.beginPath();
  ctx.moveTo(-R * 0.55, -R * 0.62);
  ctx.lineTo(-R, -R * 0.35);
  ctx.lineTo(-R * 0.7, R * 0.6);
  ctx.lineWidth = R * 0.04;
  ctx.strokeStyle = css(lighten(accent, 0.2), 0.6);
  ctx.stroke();
}

function drawEclipseSovereign(ctx: Ctx, R: number): void {
  const gold = 0xd4af37;
  const black = 0x121014;

  // crown of spikes
  starPath(ctx, 0, 0, 16, R, R * 0.74, -Math.PI / 2);
  ctx.fillStyle = css(black);
  ctx.fill();

  // layered rings
  for (let i = 0; i < 3; i++) {
    const rr = R * (0.82 - i * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.arc(0, 0, rr * 0.78, 0, Math.PI * 2, true);
    ctx.fillStyle = i % 2 === 0 ? css(gold) : css(lighten(gold, 0.4));
    ctx.fill("evenodd");
    ctx.lineWidth = R * 0.02;
    ctx.strokeStyle = css(darken(gold, 0.5));
    ctx.stroke();
  }

  // dark centre
  circle(ctx, 0, 0, R * 0.42);
  ctx.fillStyle = lineGrad(ctx, 0, -R * 0.42, 0, R * 0.42, [
    [0, css(black)],
    [1, css(darken(gold, 0.4))],
  ]);
  ctx.fill();

  // sovereign emblem
  glowOn(ctx, gold, R * 0.25, 0.9);
  starPath(ctx, 0, 0, 4, R * 0.26, R * 0.09, -Math.PI / 2);
  ctx.fillStyle = css(0xffffff);
  ctx.fill();
  glowOff(ctx);

  // rim light
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.9, Math.PI * 1.05, Math.PI * 1.8);
  ctx.lineWidth = R * 0.03;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.stroke();
}

export function makeBossSprite(id: string, size: number): Canvas {
  const dim = Math.max(16, Math.round(size));
  const { canvas, ctx } = surface(dim);
  ctx.save();
  ctx.translate(dim / 2, dim / 2);
  const R = dim * 0.44;
  switch (id) {
    case "warden_colossus":
      drawWarden(ctx, R);
      break;
    case "razor_queen":
      drawRazorQueen(ctx, R);
      break;
    case "prism_sentinel":
      drawPrismSentinel(ctx, R);
      break;
    case "void_carrier":
      drawVoidCarrier(ctx, R);
      break;
    case "eclipse_sovereign":
      drawEclipseSovereign(ctx, R);
      break;
    default:
      drawPrismSentinel(ctx, R);
      break;
  }
  ctx.restore();
  return canvas;
}

// ----------------------------------------------------------------- bullets

export function makeBullet(shape: "lance" | "bolt" | "disc" | "blade" | "orb" | "missile" | "diamond" | "arc", color: number, size: number): Canvas {
  const S = Math.max(6, Math.round(size));
  const { canvas, ctx } = surface(S, S);
  const h = S / 2;
  const r = h;
  ctx.save();
  ctx.translate(h, h);
  glowOn(ctx, color, r * 0.55);

  switch (shape) {
    case "lance": {
      polyPath(ctx, [0, -r * 0.95], [r * 0.17, -r * 0.1], [r * 0.1, r * 0.9], [-r * 0.1, r * 0.9], [-r * 0.17, -r * 0.1]);
      ctx.fillStyle = lineGrad(ctx, -r, 0, r, 0, [
        [0, css(color)],
        [0.5, css(lighten(color, 0.65))],
        [1, css(color)],
      ]);
      ctx.fill();
      glowOff(ctx);
      polyPath(ctx, [0, -r * 0.7], [r * 0.05, -r * 0.1], [0, r * 0.7], [-r * 0.05, -r * 0.1]);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      break;
    }
    case "bolt": {
      roundRect(ctx, -r * 0.24, -r * 0.85, r * 0.48, r * 1.7, r * 0.24);
      ctx.fillStyle = lineGrad(ctx, -r * 0.24, 0, r * 0.24, 0, [
        [0, css(darken(color, 0.3))],
        [0.5, css(lighten(color, 0.4))],
        [1, css(darken(color, 0.3))],
      ]);
      ctx.fill();
      glowOff(ctx);
      roundRect(ctx, -r * 0.08, -r * 0.62, r * 0.16, r * 1.24, r * 0.08);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      break;
    }
    case "disc": {
      circle(ctx, 0, 0, r * 0.9);
      ctx.fillStyle = radialGrad(ctx, 0, 0, 0, r * 0.9, [
        [0, css(lighten(color, 0.5))],
        [0.6, css(color)],
        [1, css(darken(color, 0.5))],
      ]);
      ctx.fill();
      glowOff(ctx);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = css(darken(color, 0.35), 0.8);
      ctx.fill();
      break;
    }
    case "blade": {
      polyPath(ctx, [0, -r * 0.95], [r * 0.3, 0], [0, r * 0.95], [-r * 0.3, 0]);
      ctx.fillStyle = lineGrad(ctx, -r * 0.3, 0, r * 0.3, 0, [
        [0, css(color)],
        [0.5, css(lighten(color, 0.6))],
        [1, css(color)],
      ]);
      ctx.fill();
      glowOff(ctx);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.8);
      ctx.lineTo(0, r * 0.8);
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      break;
    }
    case "orb": {
      circle(ctx, 0, 0, r * 0.92);
      ctx.fillStyle = radialGrad(ctx, -r * 0.3, -r * 0.3, r * 0.05, r * 0.95, [
        [0, css(lighten(color, 0.8))],
        [0.45, css(color)],
        [1, css(darken(color, 0.7))],
      ]);
      ctx.fill();
      glowOff(ctx);
      circle(ctx, -r * 0.3, -r * 0.32, r * 0.16);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      break;
    }
    case "missile": {
      roundRect(ctx, -r * 0.22, -r * 0.4, r * 0.44, r * 1.1, r * 0.2);
      ctx.fillStyle = lineGrad(ctx, -r * 0.22, 0, r * 0.22, 0, [
        [0, css(lighten(color, 0.3))],
        [1, css(darken(color, 0.4))],
      ]);
      ctx.fill();
      glowOff(ctx);
      polyPath(ctx, [0, -r * 0.98], [r * 0.22, -r * 0.36], [-r * 0.22, -r * 0.36]);
      ctx.fillStyle = css(lighten(color, 0.55));
      ctx.fill();
      for (const dir of [-1, 1]) {
        polyPath(ctx, [dir * r * 0.22, r * 0.6], [dir * r * 0.48, r * 0.86], [dir * r * 0.22, r * 0.42]);
        ctx.fillStyle = css(darken(color, 0.25));
        ctx.fill();
      }
      glowOn(ctx, 0xff9a2a, r * 0.5);
      polyPath(ctx, [0, r * 0.98], [r * 0.14, r * 0.72], [-r * 0.14, r * 0.72]);
      ctx.fillStyle = "rgba(255,200,120,0.95)";
      ctx.fill();
      glowOff(ctx);
      break;
    }
    case "diamond": {
      polyPath(ctx, [0, -r * 0.95], [r * 0.62, 0], [0, r * 0.95], [-r * 0.62, 0]);
      ctx.fillStyle = lineGrad(ctx, -r * 0.62, 0, r * 0.62, 0, [
        [0, css(color)],
        [0.5, css(lighten(color, 0.6))],
        [1, css(color)],
      ]);
      ctx.fill();
      glowOff(ctx);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.95);
      ctx.lineTo(0, r * 0.95);
      ctx.moveTo(-r * 0.62, 0);
      ctx.lineTo(r * 0.62, 0);
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.stroke();
      break;
    }
    case "arc": {
      // Crescent slash: a thick band bulging toward -Y (sprite forward) so it
      // reads as a sweeping cut when rotated onto the travel vector.
      const R = r * 0.92;
      const cy = r * 0.5;
      ctx.beginPath();
      ctx.arc(0, cy, R, Math.PI * 1.06, Math.PI * 1.94);
      ctx.lineWidth = r * 0.34;
      ctx.lineCap = "round";
      ctx.strokeStyle = lineGrad(ctx, -R, 0, R, 0, [
        [0, css(color)],
        [0.5, css(lighten(color, 0.7))],
        [1, css(color)],
      ]);
      ctx.stroke();
      glowOff(ctx);
      ctx.beginPath();
      ctx.arc(0, cy, R, Math.PI * 1.14, Math.PI * 1.86);
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
  return canvas;
}

export function makeEnemyBullet(size: number, highContrast = false): Canvas {
  const S = Math.max(6, Math.round(size));
  const { canvas, ctx } = surface(S, S);
  const h = S / 2;
  const core = highContrast ? 0xffd23f : 0xff2e6b;
  ctx.save();
  ctx.translate(h, h);
  const r = h;

  glowOn(ctx, core, r * 1.0, 0.95);
  circle(ctx, 0, 0, r * 0.88);
  ctx.fillStyle = radialGrad(ctx, 0, 0, 0, r * 0.88, [
    [0, "rgba(255,255,255,0.98)"],
    [0.35, css(lighten(core, 0.5))],
    [0.7, css(core)],
    [1, css(core, 0)],
  ]);
  ctx.fill();
  glowOff(ctx);

  circle(ctx, 0, 0, r * 0.46);
  ctx.fillStyle = highContrast ? "rgba(255,255,255,0.95)" : css(lighten(core, 0.6));
  ctx.fill();
  circle(ctx, 0, 0, r * 0.2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();

  ctx.restore();
  return canvas;
}

// ------------------------------------------------------------ orbs / pickups

const XP_STYLE: Record<1 | 2 | 3, { size: number; color: number }> = {
  1: { size: 14, color: 0x49e0ff },
  2: { size: 18, color: 0x69f07a },
  3: { size: 24, color: 0xffc233 },
};

export function makeXpOrb(tier: 1 | 2 | 3): Canvas {
  const { size, color } = XP_STYLE[tier];
  const { canvas, ctx } = surface(size, size);
  const c = size / 2;
  const r = size / 2;
  ctx.save();
  ctx.translate(c, c);

  glowOn(ctx, color, r * 0.9);
  circle(ctx, 0, 0, r * 0.8);
  ctx.fillStyle = radialGrad(ctx, -r * 0.24, -r * 0.24, r * 0.05, r * 0.85, [
    [0, "#ffffff"],
    [0.4, css(lighten(color, 0.55))],
    [0.8, css(color)],
    [1, css(darken(color, 0.45))],
  ]);
  ctx.fill();
  glowOff(ctx);

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.strokeStyle = css(lighten(color, 0.7), 0.8);
  ctx.stroke();

  circle(ctx, -r * 0.26, -r * 0.3, r * 0.14);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();

  ctx.restore();
  return canvas;
}

export function makePickup(kind: "repair" | "shield", size: number): Canvas {
  const S = Math.max(16, Math.round(size));
  const { canvas, ctx } = surface(S, S);
  const c = S / 2;
  const r = S / 2;
  const color = kind === "repair" ? 0x5cff9a : 0x59c8ff;
  ctx.save();
  ctx.translate(c, c);

  glowOn(ctx, color, r * 0.5, 0.8);
  roundRect(ctx, -r * 0.78, -r * 0.78, r * 1.56, r * 1.56, r * 0.28);
  ctx.fillStyle = lineGrad(ctx, 0, -r * 0.78, 0, r * 0.78, [
    [0, css(darken(color, 0.45))],
    [1, css(darken(color, 0.75))],
  ]);
  ctx.fill();
  glowOff(ctx);
  ctx.lineWidth = Math.max(1, r * 0.11);
  ctx.strokeStyle = css(color);
  ctx.stroke();

  if (kind === "repair") {
    glowOn(ctx, color, r * 0.4);
    ctx.fillStyle = css(color);
    ctx.fillRect(-r * 0.12, -r * 0.5, r * 0.24, r * 1.0);
    ctx.fillRect(-r * 0.5, -r * 0.12, r * 1.0, r * 0.24);
    glowOff(ctx);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.48, -r * 0.34);
    ctx.lineTo(r * 0.48, r * 0.16);
    ctx.quadraticCurveTo(r * 0.48, r * 0.52, 0, r * 0.62);
    ctx.quadraticCurveTo(-r * 0.48, r * 0.52, -r * 0.48, r * 0.16);
    ctx.lineTo(-r * 0.48, -r * 0.34);
    ctx.closePath();
    ctx.fillStyle = css(color);
    glowOn(ctx, color, r * 0.35);
    ctx.fill();
    glowOff(ctx);
  }

  ctx.restore();
  return canvas;
}

// --------------------------------------------------------------- fx helpers

export function makeGlow(radius: number, color: number): Canvas {
  const R = Math.max(2, radius);
  const { canvas, ctx } = surface(R * 2, R * 2);
  circle(ctx, R, R, R);
  ctx.fillStyle = radialGrad(ctx, R, R, 0, R, [
    [0, css(color, 0.95)],
    [0.35, css(color, 0.45)],
    [1, css(color, 0)],
  ]);
  ctx.fill();
  return canvas;
}

export function makeCrosshair(size: number, color: number): Canvas {
  const S = Math.max(10, Math.round(size));
  const { canvas, ctx } = surface(S, S);
  const c = S / 2;
  const r = c * 0.92;
  ctx.save();
  ctx.translate(c, c);

  glowOn(ctx, color, r * 0.4, 0.8);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2, true);
  ctx.fillStyle = css(color);
  ctx.fill("evenodd");

  const tick = (x: number, y: number, w: number, h: number): void => {
    roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.4);
    ctx.fillStyle = css(color);
    ctx.fill();
  };
  const t = r * 0.1;
  tick(-t / 2, -r * 0.92, t, r * 0.34);
  tick(-t / 2, r * 0.58, t, r * 0.34);
  tick(-r * 0.92, -t / 2, r * 0.34, t);
  tick(r * 0.58, -t / 2, r * 0.34, t);
  glowOff(ctx);

  circle(ctx, 0, 0, r * 0.12);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();

  ctx.restore();
  return canvas;
}
