/**
 * ponytail: monochrome/duotone DOM-card glyphs rasterized ONCE at 96px into
 * offscreen canvases (static raster, no runtime redraw). Ceiling: one fixed
 * icon per id at 96px. Upgrade path: keep pure vector paths if crisp scaling to
 * other sizes is ever needed. Plain Canvas 2D only, no external images.
 */

export type Canvas = HTMLCanvasElement;

type Ctx = CanvasRenderingContext2D;
type P = readonly [number, number];
type Painter = (ctx: Ctx, color: number) => void;

// -------------------------------------------------------------------- utils

function surface(w: number, h: number = w): { canvas: Canvas; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { canvas, ctx };
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

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
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

function glowOn(ctx: Ctx, color: number, blur: number, alpha = 0.85): void {
  ctx.shadowColor = css(color, alpha);
  ctx.shadowBlur = blur;
}
function glowOff(ctx: Ctx): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0,0,0,0)";
}
function fill(ctx: Ctx, color: number, alpha = 1): void {
  ctx.fillStyle = css(color, alpha);
  ctx.fill();
}

const HI = 0xeaf6ff;

// --------------------------------------------------------------- weapons

function pLance(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 13);
  polyPath(ctx, [0, -40], [9, -6], [6, 36], [-6, 36], [-9, -6]);
  ctx.fillStyle = lineGrad(ctx, -9, 0, 9, 0, [
    [0, css(color)],
    [0.5, css(lighten(color, 0.7))],
    [1, css(color)],
  ]);
  ctx.fill();
  glowOff(ctx);
  polyPath(ctx, [0, -34], [3, -6], [0, 32], [-3, -6]);
  fill(ctx, HI, 0.9);
}

function pVulcan(ctx: Ctx, color: number): void {
  for (const x of [-15, 0, 15]) {
    glowOn(ctx, color, 9);
    roundRect(ctx, x - 5, -14, 10, 42, 4);
    ctx.fillStyle = lineGrad(ctx, x - 5, 0, x + 5, 0, [
      [0, css(darken(color, 0.3))],
      [0.5, css(lighten(color, 0.45))],
      [1, css(darken(color, 0.3))],
    ]);
    ctx.fill();
    glowOff(ctx);
    roundRect(ctx, x - 6, -22, 12, 9, 3);
    fill(ctx, HI, 0.85);
  }
  roundRect(ctx, -26, 24, 52, 16, 6);
  fill(ctx, darken(color, 0.55));
}

function pRail(ctx: Ctx, color: number): void {
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const y = -8 + i * 22;
      polyPath(ctx, [s * 14, y - 8], [s * 26, y], [s * 14, y + 8]);
      fill(ctx, color, 0.85);
    }
  }
  glowOn(ctx, color, 16);
  polyPath(ctx, [0, -44], [9, -32], [9, 28], [0, 42], [-9, 28], [-9, -32]);
  ctx.fillStyle = lineGrad(ctx, -9, 0, 9, 0, [
    [0, css(color)],
    [0.5, css(lighten(color, 0.75))],
    [1, css(color)],
  ]);
  ctx.fill();
  glowOff(ctx);
  polyPath(ctx, [0, -38], [3, -30], [3, 26], [0, 38], [-3, 26], [-3, -30]);
  fill(ctx, HI, 0.9);
}

function pPrism(ctx: Ctx, color: number): void {
  polyPath(ctx, [-44, -4], [-30, 0], [-44, 4]);
  fill(ctx, HI, 0.9);
  glowOn(ctx, color, 12);
  polyPath(ctx, [0, -34], [30, 24], [-30, 24]);
  ctx.fillStyle = lineGrad(ctx, -30, 0, 30, 24, [
    [0, css(lighten(color, 0.5))],
    [0.5, css(color)],
    [1, css(darken(color, 0.4))],
  ]);
  ctx.fill();
  glowOff(ctx);
  for (let i = 0; i < 3; i++) {
    const y = -6 + i * 11;
    ctx.globalAlpha = 0.9 - i * 0.22;
    polyPath(ctx, [22, y - 3], [46, y - 1], [46, y + 1], [22, y + 3]);
    fill(ctx, lighten(color, i * 0.3));
  }
  ctx.globalAlpha = 1;
}

function pScatter(ctx: Ctx, color: number): void {
  polyPath(ctx, [0, 30], [28, -26], [-28, -26]);
  fill(ctx, color, 0.16);
  const pellets: P[] = [[0, -34], [-15, -25], [15, -25], [-24, -12], [24, -12], [-30, 2], [30, 2]];
  glowOn(ctx, color, 8);
  for (const [x, y] of pellets) {
    circle(ctx, x, y, 5);
    fill(ctx, lighten(color, 0.3));
  }
  glowOff(ctx);
}

function pCrescent(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 13);
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.arc(10, 0, 32, 0, Math.PI * 2, true);
  ctx.fillStyle = lineGrad(ctx, -36, 0, 36, 0, [
    [0, css(color)],
    [1, css(lighten(color, 0.5))],
  ]);
  ctx.fill("evenodd");
  glowOff(ctx);
}

function boltPath(ctx: Ctx, cx: number, cy: number, s: number): void {
  polyPath(
    ctx,
    [cx - 0.05 * s, cy - s],
    [cx + 0.4 * s, cy - 0.15 * s],
    [cx + 0.12 * s, cy - 0.15 * s],
    [cx + 0.45 * s, cy + 0.5 * s],
    [cx - 0.02 * s, cy + 0.05 * s],
    [cx + 0.26 * s, cy + 0.05 * s],
    [cx - 0.3 * s, cy + s],
    [cx - 0.12 * s, cy + 0.18 * s],
    [cx - 0.36 * s, cy + 0.18 * s],
  );
}

function pChain(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 12);
  boltPath(ctx, -10, 0, 34);
  fill(ctx, color);
  boltPath(ctx, 17, 2, 26);
  fill(ctx, lighten(color, 0.35));
  glowOff(ctx);
}

function pOrb(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 12);
  circle(ctx, 0, 0, 34);
  ctx.fillStyle = radialGrad(ctx, -12, -14, 4, 36, [
    [0, css(lighten(color, 0.8))],
    [0.45, css(color)],
    [1, css(darken(color, 0.7))],
  ]);
  ctx.fill();
  glowOff(ctx);
  circle(ctx, -12, -14, 6);
  fill(ctx, 0xffffff, 0.85);
}

function pSeeker(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 8);
  for (const a of [-0.42, 0, 0.42]) {
    ctx.save();
    ctx.translate(0, 6);
    ctx.rotate(a);
    roundRect(ctx, -6, -20, 12, 34, 6);
    fill(ctx, color);
    polyPath(ctx, [0, -32], [7, -18], [-7, -18]);
    fill(ctx, lighten(color, 0.5));
    polyPath(ctx, [0, 14], [4, 26], [-4, 26]);
    fill(ctx, 0xffd08a, 0.95);
    ctx.restore();
  }
  glowOff(ctx);
}

function pRicochet(ctx: Ctx, color: number): void {
  const trail: P[] = [[-30, 20], [-20, -6], [-6, -24], [10, -30]];
  for (let i = 0; i < trail.length; i++) {
    const [x, y] = trail[i] ?? [0, 0];
    circle(ctx, x, y, 5 - i * 0.8);
    fill(ctx, color, 0.55 - i * 0.1);
  }
  glowOn(ctx, color, 10);
  circle(ctx, 10, 4, 20);
  ctx.fillStyle = lineGrad(ctx, -10, -16, 30, 24, [
    [0, css(lighten(color, 0.55))],
    [1, css(darken(color, 0.5))],
  ]);
  ctx.fill();
  glowOff(ctx);
  circle(ctx, 10, 4, 9);
  fill(ctx, color, 0.95);
}

function pBoomerang(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  ctx.beginPath();
  ctx.moveTo(-34, -16);
  ctx.quadraticCurveTo(0, 36, 34, -16);
  ctx.quadraticCurveTo(0, 10, -34, -16);
  ctx.closePath();
  ctx.fillStyle = lineGrad(ctx, -34, -16, 34, -16, [
    [0, css(color)],
    [0.5, css(lighten(color, 0.5))],
    [1, css(color)],
  ]);
  ctx.fill();
  glowOff(ctx);
}

function pCrossfire(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 8);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.save();
    ctx.rotate(a);
    polyPath(ctx, [0, -40], [12, -18], [5, -18], [5, 6], [-5, 6], [-5, -18], [-12, -18]);
    fill(ctx, color);
    ctx.restore();
  }
  glowOff(ctx);
}

// --------------------------------------------------------------- skills

function pShield(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 12);
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.lineTo(32, -24);
  ctx.lineTo(32, 6);
  ctx.quadraticCurveTo(32, 30, 0, 40);
  ctx.quadraticCurveTo(-32, 30, -32, 6);
  ctx.lineTo(-32, -24);
  ctx.closePath();
  ctx.fillStyle = lineGrad(ctx, 0, -38, 0, 40, [
    [0, css(lighten(color, 0.3))],
    [1, css(darken(color, 0.5))],
  ]);
  ctx.fill();
  glowOff(ctx);
  polyPath(ctx, [-4, -24], [4, -24], [4, 16], [0, 28], [-4, 16]);
  fill(ctx, HI, 0.85);
}

function pHull(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 8);
  for (let i = 0; i < 3; i++) {
    roundRect(ctx, -30, -34 + i * 22, 60, 18, 4);
    fill(ctx, i === 1 ? lighten(color, 0.28) : color);
  }
  glowOff(ctx);
  for (let i = 0; i < 3; i++) {
    circle(ctx, -22, -25 + i * 22, 2.6);
    circle(ctx, 22, -25 + i * 22, 2.6);
    fill(ctx, 0xffffff, 0.7);
  }
}

function pBullet(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  roundRect(ctx, -13, -6, 26, 44, 5);
  fill(ctx, darken(color, 0.35));
  ctx.beginPath();
  ctx.moveTo(-13, -6);
  ctx.quadraticCurveTo(0, -42, 13, -6);
  ctx.closePath();
  fill(ctx, lighten(color, 0.5));
  glowOff(ctx);
  roundRect(ctx, -7, -2, 5, 30, 3);
  fill(ctx, 0xffffff, 0.5);
}

function pStopwatch(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  roundRect(ctx, -7, -42, 14, 12, 3);
  fill(ctx, color);
  circle(ctx, 0, 4, 32);
  fill(ctx, color);
  glowOff(ctx);
  circle(ctx, 0, 4, 24);
  fill(ctx, darken(color, 0.55));
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  roundRect(ctx, -2.5, -14, 5, 22, 2);
  ctx.fill();
  roundRect(ctx, -2.5, 2, 17, 5, 2);
  ctx.fill();
}

function pCrit(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  starPath(ctx, 0, 0, 4, 34, 10, -Math.PI / 2);
  fill(ctx, color);
  glowOff(ctx);
  circle(ctx, 0, 0, 7);
  fill(ctx, 0xffffff, 0.9);
  const tick = (x: number, y: number, w: number, h: number): void => {
    roundRect(ctx, x, y, w, h, 2);
    fill(ctx, lighten(color, 0.5));
  };
  tick(-2, -46, 4, 11);
  tick(-2, 35, 4, 11);
  tick(-46, -2, 11, 4);
  tick(35, -2, 11, 4);
}

function pArrow(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  polyPath(ctx, [0, -40], [24, -8], [9, -8], [9, 36], [-9, 36], [-9, -8], [-24, -8]);
  fill(ctx, color);
  glowOff(ctx);
  polyPath(ctx, [0, -34], [9, -13], [-9, -13]);
  fill(ctx, HI, 0.8);
}

function pMagnet(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  ctx.beginPath();
  ctx.moveTo(-28, 30);
  ctx.lineTo(-28, 0);
  ctx.quadraticCurveTo(-28, -34, 0, -34);
  ctx.quadraticCurveTo(28, -34, 28, 0);
  ctx.lineTo(28, 30);
  ctx.lineTo(10, 30);
  ctx.lineTo(10, 0);
  ctx.quadraticCurveTo(10, -12, 0, -12);
  ctx.quadraticCurveTo(-10, -12, -10, 0);
  ctx.lineTo(-10, 30);
  ctx.closePath();
  fill(ctx, color);
  glowOff(ctx);
  ctx.fillStyle = css(0xffffff, 0.9);
  ctx.fillRect(-28, 20, 18, 10);
  ctx.fillRect(10, 20, 18, 10);
}

function pHexShield(ctx: Ctx, color: number): void {
  const hex: P[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    hex.push([Math.cos(a) * 36, Math.sin(a) * 36]);
  }
  glowOn(ctx, color, 10);
  polyPath(ctx, ...hex);
  fill(ctx, color);
  glowOff(ctx);
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(12, -10);
  ctx.lineTo(12, 4);
  ctx.quadraticCurveTo(12, 14, 0, 20);
  ctx.quadraticCurveTo(-12, 14, -12, 4);
  ctx.lineTo(-12, -10);
  ctx.closePath();
  fill(ctx, darken(color, 0.55));
}

function pSpikes(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  starPath(ctx, 0, 0, 10, 36, 20);
  fill(ctx, color);
  glowOff(ctx);
  circle(ctx, 0, 0, 12);
  fill(ctx, darken(color, 0.5));
}

function pDrone(ctx: Ctx, color: number): void {
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, 14, -0.5, 0, Math.PI * 2);
  ctx.ellipse(0, 0, 33, 9, -0.5, 0, Math.PI * 2);
  fill(ctx, lighten(color, 0.3), 0.75);
  glowOn(ctx, color, 10);
  roundRect(ctx, -14, -8, 28, 20, 6);
  fill(ctx, color);
  polyPath(ctx, [-14, -6], [0, -20], [14, -6]);
  fill(ctx, lighten(color, 0.4));
  glowOff(ctx);
  circle(ctx, 0, 4, 5);
  fill(ctx, 0xffffff, 0.95);
  circle(ctx, 30, -14, 5);
  fill(ctx, lighten(color, 0.5));
}

function pRingPulse(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  for (let i = 0; i < 3; i++) {
    const r = 14 + i * 12;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.arc(0, 0, r - 5, 0, Math.PI * 2, true);
    fill(ctx, color, 0.9 - i * 0.22);
    ctx.fill("evenodd");
  }
  glowOff(ctx);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    roundRect(ctx, -2.5, -46, 5, 12, 2);
    fill(ctx, lighten(color, 0.4));
    ctx.restore();
  }
}

function pCross(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  polyPath(ctx, [-7, -34], [7, -34], [7, -7], [34, -7], [34, 7], [7, 7], [7, 34], [-7, 34], [-7, 7], [-34, 7], [-34, -7], [-7, -7]);
  fill(ctx, color);
  glowOff(ctx);
}

function pBubble(ctx: Ctx, color: number): void {
  const bubbles: Array<[number, number, number]> = [[-16, -8, 16], [14, 6, 20], [-4, 24, 9]];
  glowOn(ctx, color, 9);
  for (const [x, y, r] of bubbles) {
    circle(ctx, x, y, r);
    ctx.fillStyle = radialGrad(ctx, x - r * 0.3, y - r * 0.3, 0, r * 1.2, [
      [0, css(lighten(color, 0.75))],
      [0.6, css(color)],
      [1, css(color, 0)],
    ]);
    ctx.fill();
  }
  glowOff(ctx);
}

function pMissiles(ctx: Ctx, color: number): void {
  const missiles: Array<[number, number]> = [[-18, 6], [0, -6], [18, 6]];
  glowOn(ctx, color, 8);
  for (const [x, y] of missiles) {
    ctx.save();
    ctx.translate(x, y);
    roundRect(ctx, -6, -18, 12, 32, 6);
    fill(ctx, color);
    polyPath(ctx, [0, -30], [7, -16], [-7, -16]);
    fill(ctx, lighten(color, 0.5));
    polyPath(ctx, [0, 14], [4, 26], [-4, 26]);
    fill(ctx, 0xffd08a, 0.95);
    ctx.restore();
  }
  glowOff(ctx);
}

function pVortex(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i / 3) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.quadraticCurveTo(30, -10, 34, -30);
    ctx.quadraticCurveTo(20, -16, 2, -14);
    ctx.closePath();
    fill(ctx, color);
    ctx.restore();
  }
  glowOff(ctx);
  circle(ctx, 0, 0, 9);
  fill(ctx, 0xffffff, 0.95);
}

function pChevrons(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  const chev = (y: number): void => {
    polyPath(ctx, [-28, y - 8], [0, y - 26], [28, y - 8], [28, y + 6], [0, y - 12], [-28, y + 6]);
    fill(ctx, color);
  };
  chev(0);
  chev(26);
  glowOff(ctx);
}

function pClock(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 10);
  circle(ctx, 0, 0, 34);
  fill(ctx, color);
  glowOff(ctx);
  circle(ctx, 0, 0, 27);
  fill(ctx, darken(color, 0.55));
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i / 4) * Math.PI * 2);
    roundRect(ctx, -1.6, -24, 3.2, 7, 1.5);
    fill(ctx, lighten(color, 0.4));
    ctx.restore();
  }
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  roundRect(ctx, -2.5, -18, 5, 22, 2);
  ctx.fill();
  roundRect(ctx, -2.5, -2, 16, 5, 2);
  ctx.fill();
}

function pLightning(ctx: Ctx, color: number): void {
  glowOn(ctx, color, 12);
  polyPath(
    ctx,
    [-4, -42],
    [22, -10],
    [6, -10],
    [18, 16],
    [-10, -2],
    [2, -2],
    [-18, 42],
    [-4, 6],
    [-22, 6],
  );
  fill(ctx, color);
  glowOff(ctx);
}

// --------------------------------------------------------------- registry

const WEAPON_PAINTERS: Record<string, Painter> = {
  focus_lance: pLance,
  gatling_vulcan: pVulcan,
  rail_charge: pRail,
  prism_beam: pPrism,
  scatter_shot: pScatter,
  crescent_slash: pCrescent,
  arc_chain: pChain,
  plasma_orb: pOrb,
  seeker_swarm: pSeeker,
  ricochet_disc: pRicochet,
  boomerang_blade: pBoomerang,
  crossfire: pCrossfire,
};

const SKILL_PAINTERS: Record<string, Painter> = {
  reinforced_hull: pHull,
  overcharged_rounds: pBullet,
  rapid_loader: pStopwatch,
  crit_core: pCrit,
  tungsten_tips: pArrow,
  thrusters: pChevrons,
  magnet_coil: pMagnet,
  shield_matrix: pHexShield,
  thorn_plating: pSpikes,
  orbital_drones: pDrone,
  shockwave: pRingPulse,
  nano_repair: pCross,
  phase_barrier: pShield,
  missile_barrage: pMissiles,
  gravity_well: pVortex,
  overdrive: pLightning,
  chrono_slip: pClock,
  ion_storm: pBubble,
};

const ALIAS: Record<string, string> = {
  lance: "focus_lance",
  vulcan: "gatling_vulcan",
  rail: "rail_charge",
  beam: "prism_beam",
  scatter: "scatter_shot",
  crescent: "crescent_slash",
  chain: "arc_chain",
  orb: "plasma_orb",
  seeker: "seeker_swarm",
  ricochet: "ricochet_disc",
  boomerang: "boomerang_blade",
  shield: "phase_barrier",
  hull: "reinforced_hull",
  bullet: "overcharged_rounds",
  stopwatch: "rapid_loader",
  star: "crit_core",
  crosshair: "crit_core",
  arrow: "tungsten_tips",
  magnet: "magnet_coil",
  hex: "shield_matrix",
  spikes: "thorn_plating",
  drone: "orbital_drones",
  ring: "shockwave",
  cross: "nano_repair",
  bubble: "ion_storm",
  missiles: "missile_barrage",
  vortex: "gravity_well",
  chevrons: "thrusters",
  clock: "chrono_slip",
  lightning: "overdrive",
};

function resolve(table: Record<string, Painter>, id: string, fallback: Painter): Painter {
  if (table[id]) return table[id] ?? fallback;
  const alias = ALIAS[id];
  if (alias && table[alias]) return table[alias] ?? fallback;
  return fallback;
}

function render(paint: Painter, color: number): Canvas {
  const { canvas, ctx } = surface(96, 96);
  ctx.save();
  ctx.translate(48, 48);
  paint(ctx, color);
  ctx.restore();
  return canvas;
}

export function makeWeaponIcon(id: string, color: number): Canvas {
  return render(resolve(WEAPON_PAINTERS, id, pOrb), color);
}

export function makeSkillIcon(id: string, color: number): Canvas {
  return render(resolve(SKILL_PAINTERS, id, pCross), color);
}
