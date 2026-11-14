/**
 * PixiJS v8 renderer for the Neon Shooter arena.
 *
 * One full-window canvas. The 1920x1080 arena is scaled by a single uniform
 * factor and centred (letterboxed); the backdrop is a screen-space layer that
 * overdraws the viewport so ultrawide displays never show bars.
 *
 * Every display object is pooled and keyed by texture, so a frame never
 * allocates. Pixi's own ticker is stopped: `render()` drives `app.render()` from
 * the caller's fixed-step loop and interpolates positions with `alpha`.
 *
 * ponytail: WebGL only. `Loader`/`Assets` is skipped — sprites.ts hands us
 * canvases, so `Texture.from` is enough and there is no async asset graph.
 * Upgrade path: if a WebGL context is unavailable, `Renderer.create` rejects on
 * purpose; callers fall back to `NullRenderer` (shipped below), not a hidden
 * Canvas2D path.
 */
import { Application, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { BloomFilter, RGBSplitFilter } from "pixi-filters";
import {
  ARENA_H,
  ARENA_W,
  ENEMY_BULLET,
  PLAYER_RADIUS,
  SECTOR_PALETTES,
  setArenaWidth,
} from "../data/constants";
import type { Bullet, DamageNumber, Enemy, Particle, Pickup, Telegraph } from "../entities";
import type { Player } from "../player";
import { Background } from "./background";
import { ParticleRenderer } from "./particles";
import {
  makeBullet,
  makeBossSprite,
  makeBreaker,
  makeCrosshair,
  makeEnemyBullet,
  makeGlow,
  makePickup,
  makePlayerShip,
  makeRaider,
  makeRock,
  makeThrusterFlame,
  makeXpOrb,
} from "./sprites";

export interface RenderWorld {
  player: Player;
  bullets: readonly Bullet[];
  enemyBullets: readonly Bullet[];
  enemies: readonly Enemy[];
  pickups: readonly Pickup[];
  particles: readonly Particle[];
  telegraphs: readonly Telegraph[];
  damageNumbers: readonly DamageNumber[];
  time: number;
  moving: boolean;
}

export interface RendererOptions {
  quality: "low" | "high";
  highContrastBullets: boolean;
}

type RockVariant = NonNullable<Enemy["variant"]>;
type BakedBulletShape = "lance" | "bolt" | "disc" | "blade" | "orb" | "missile" | "diamond" | "arc";

const ROCK_VARIANTS: readonly RockVariant[] = ["normal", "ice", "metal", "explosive"];
const BULLET_SHAPES: readonly BakedBulletShape[] = ["lance", "bolt", "disc", "blade", "orb", "missile", "diamond", "arc"];

/**
 * Per-shape visual scale-up. Bullet art bakes at 64 px against `ref = 30` and
 * each shape paints only a fraction of that box (lance ±0.17r, bolt ±0.24r), so
 * a raw `radius / ref` sprite is a ~1.2-1.7 px sliver on screen. This scales the
 * SPRITE only — `b.radius` (also the collision radius) is never touched, so DPS
 * and hitboxes are unchanged. Core width on screen = 2 * f * (32 / ref) * radius
 * * mult * fitScale (texture half is 32 px, ref 30); at 1280x720 fitScale is
 * 0.667, so:
 *   lance   f .17  focus r6 -> 4.4 px, prism r5 -> 3.6 px, rail r10 -> 7.3 px
 *   bolt    f .24  gatling/arc r4 -> 3.8 px, crossfire r5 -> 4.8 px
 *   missile f .22 body, .48 fins  r6 -> 3.4 px body, 7.4 px fins, 15 px long
 *   blade   f .30  boomerang r12 -> 6.7 px wide, 21 px long
 *   disc    f .90  ricochet r9 -> 13.3 px across
 *   orb     f .92  plasma r22 -> 28.8 px across (already large)
 *   diamond f .62  scatter r5 -> 4.4 px
 *   arc     1.79 wide  crescent r60 -> ~76 px sweep
 * Quality-independent, so the same scale reads at Low (no AA/bloom) too.
 */
const SHAPE_SCALE: Record<BakedBulletShape, number> = {
  lance: 3.0,
  bolt: 2.8,
  disc: 1.15,
  blade: 1.3,
  orb: 1.0,
  missile: 1.8,
  diamond: 1.0,
  arc: 1.0,
};
const BOSS_IDS = ["warden_colossus", "razor_queen", "prism_sentinel", "void_carrier", "eclipse_sovereign"];
const ROCK_SEEDS = 3;
const CROSSHAIR_COLOR = 0x9ef2ff;

interface Reg {
  tex: Texture;
  /** Natural visual radius of the texture, in source pixels. */
  ref: number;
}

interface PooledSprite extends Sprite {
  _key: string;
  _stamp: number;
}

function surface(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return { c, ctx };
}

/**
 * Enemy bullet = baked sprite + a dark ring outline (ENEMY_BULLET.ring), so it
 * always reads against the player's additive fire. Composited once into a single
 * texture, so it still costs one pooled Sprite.
 */
function ringedEnemyBullet(size: number, highContrast: boolean): { c: HTMLCanvasElement; ref: number } {
  const src = makeEnemyBullet(size, highContrast);
  const pad = Math.round(size * 0.18);
  const dim = src.width + pad * 2;
  const { c, ctx } = surface(dim, dim);
  const cx = dim / 2;
  ctx.beginPath();
  ctx.arc(cx, cx, src.width / 2 + pad * 0.5, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, pad * 0.95);
  ctx.strokeStyle = `rgb(${(ENEMY_BULLET.ring >> 16) & 0xff},${(ENEMY_BULLET.ring >> 8) & 0xff},${ENEMY_BULLET.ring & 0xff})`;
  ctx.stroke();
  ctx.drawImage(src, pad, pad);
  return { c, ref: size / 2 };
}

function vignetteCanvas(): HTMLCanvasElement {
  const dim = 256;
  const { c, ctx } = surface(dim, dim);
  const r = dim / 2;
  const g = ctx.createRadialGradient(r, r, r * 0.35, r, r, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.6, "rgba(0,0,0,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, dim, dim);
  return c;
}

/** Free-list Sprite pool, one bucket per texture key. Never allocates in steady state. */
class SpritePool {
  private readonly free = new Map<string, PooledSprite[]>();
  private frame = 0;

  constructor(private readonly parent: Container) {}

  begin(): void {
    this.frame++;
  }

  acquire(key: string, tex: Texture): PooledSprite {
    const bucket = this.free.get(key);
    const reused = bucket && bucket.length > 0 ? bucket.pop() : undefined;
    let s: PooledSprite;
    if (reused) {
      s = reused;
      if (bucket && bucket.length === 0) this.free.delete(key);
    } else {
      s = new Sprite(tex) as PooledSprite;
      s._key = key;
      s._stamp = 0;
      s.anchor.set(0.5);
      s.eventMode = "none";
      this.parent.addChild(s);
    }
    s._stamp = this.frame;
    s.visible = true;
    return s;
  }

  /** Park anything this frame did not touch. */
  end(): void {
    for (const child of this.parent.children) {
      const s = child as PooledSprite;
      if (s._stamp === this.frame || !s.visible) continue;
      s.visible = false;
      const bucket = this.free.get(s._key);
      if (bucket) bucket.push(s);
      else this.free.set(s._key, [s]);
    }
  }
}

export class Renderer {
  private readonly host: HTMLElement;
  private readonly app: Application;
  private vw = 1;
  private vh = 1;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  private readonly background = new Background();
  private readonly particles = new ParticleRenderer();
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly telegraphLayer = new Container();
  private readonly telegraphPool: Graphics[] = [];
  private readonly dmgTexts: Text[] = [];
  private readonly dmgLayer = new Container();
  private readonly okStyle: TextStyle;
  private readonly critStyle: TextStyle;
  private readonly crosshair: Sprite;
  private readonly vignette: Sprite;
  private readonly bloom = new BloomFilter({ strength: 3, quality: 4, resolution: 1, kernelSize: 5 });
  private readonly chroma = new RGBSplitFilter();

  private readonly tex = new Map<string, Reg>();
  private readonly prev = new WeakMap<object, { x: number; y: number }>();
  private readonly pools: Record<string, SpritePool> = {};

  private quality: "low" | "high";
  private highContrast: boolean;
  private sector = 0;
  private shakeScale = 1;
  private shakeX = 0;
  private shakeY = 0;
  private chromaAmt = 0;
  private chromaOn = false;
  private time = 0;
  // Not seeded from ARENA_W/H: the arena is a live binding resized per viewport.
  private aimX = 0;
  private aimY = 0;
  private haveAim = false;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private destroyed = false;

  private constructor(host: HTMLElement, app: Application, opts: RendererOptions) {
    this.host = host;
    this.app = app;
    this.quality = opts.quality;
    this.highContrast = opts.highContrastBullets;

    // --- canvas --------------------------------------------------------
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    host.appendChild(canvas);
    app.ticker.stop();

    // --- stage graph ----------------------------------------------------
    app.stage.addChild(this.root);
    this.root.addChild(this.background.container, this.world);

    // Bottom -> top. Enemy bullets + telegraphs sit above every player effect.
    const telegraphLayer = this.telegraphLayer;
    const enemyLayer = new Container();
    const pickupLayer = new Container();
    const thrusterLayer = new Container();
    const playerLayer = new Container();
    const trailLayer = new Container();
    const playerBulletLayer = new Container();
    const enemyBulletLayer = new Container();
    const particleLayer = this.particles.container;
    const crosshairLayer = new Container();
    // Bottom -> top. Enemy bullets + telegraphs render above every player FX
    // (fairness): particle explosions and damage numbers must not wash them out.
    this.world.addChild(
      enemyLayer,
      pickupLayer,
      thrusterLayer,
      playerLayer,
      trailLayer,
      playerBulletLayer,
      particleLayer,
      this.dmgLayer,
      telegraphLayer,
      enemyBulletLayer,
      crosshairLayer,
    );
    playerBulletLayer.blendMode = "add";
    trailLayer.blendMode = "add";

    for (const layer of [enemyLayer, pickupLayer, thrusterLayer, playerLayer, trailLayer, playerBulletLayer, this.dmgLayer, telegraphLayer, enemyBulletLayer, crosshairLayer]) {
      layer.eventMode = "none";
    }

    this.buildTextures();
    this.pools.enemy = new SpritePool(enemyLayer);
    this.pools.pickup = new SpritePool(pickupLayer);
    this.pools.thruster = new SpritePool(thrusterLayer);
    this.pools.player = new SpritePool(playerLayer);
    this.pools.playerBullet = new SpritePool(playerBulletLayer);
    this.pools.trail = new SpritePool(trailLayer);
    this.pools.enemyBullet = new SpritePool(enemyBulletLayer);
    this.pools.crosshair = new SpritePool(crosshairLayer);

    const ch = this.reg("crosshair");
    this.crosshair = new Sprite(ch.tex);
    this.crosshair.anchor.set(0.5);
    this.crosshair.eventMode = "none";
    crosshairLayer.addChild(this.crosshair);

    // --- vignette (screen space, above everything) ----------------------
    this.vignette = new Sprite(Texture.from(vignetteCanvas()));
    this.vignette.anchor.set(0.5);
    this.vignette.eventMode = "none";
    app.stage.addChild(this.vignette);

    // --- damage text styles --------------------------------------------
    this.okStyle = new TextStyle({
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: 22,
      fontWeight: "700",
      fill: 0xffe9b0,
      stroke: { color: 0x140800, width: 4 },
    });
    this.critStyle = new TextStyle({
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: 34,
      fontWeight: "900",
      fill: 0xffe04a,
      stroke: { color: 0x3a1c00, width: 5 },
    });

    // --- filters + audio-free bindings ---------------------------------
    this.particles.setQuality(this.quality);
    this.applyBloom();
    this.background.setSector(this.sector);

    this.onPointerMove = (e: PointerEvent): void => {
      const p = this.toArena(e.clientX, e.clientY);
      this.aimX = p.x;
      this.aimY = p.y;
      this.haveAim = true;
    };
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });

    this.resize();
  }

  static async create(host: HTMLElement, opts: RendererOptions): Promise<Renderer> {
    const app = new Application();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    await app.init({
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
      background: SECTOR_PALETTES[0]?.bg0 ?? 0x03040c,
      backgroundAlpha: 1,
      antialias: opts.quality === "high",
      resolution: dpr,
      autoDensity: true,
      preference: "webgl",
      powerPreference: "high-performance",
    });
    return new Renderer(host, app, opts);
  }

  /** QA/debug: dump a baked texture as a PNG data URL. */
  debugTexturePng(key: string): string | null {
    const src = this.tex.get(key)?.tex.source.resource as HTMLCanvasElement | undefined;
    return src && typeof src.toDataURL === "function" ? src.toDataURL("image/png") : null;
  }

  get width(): number {
    return this.vw;
  }

  get height(): number {
    return this.vh;
  }

  /** DOM client point -> arena coordinates (accounts for letterboxing). */
  toArena(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.host.getBoundingClientRect();
    return {
      x: (clientX - r.left - this.offsetX) / this.scale,
      y: (clientY - r.top - this.offsetY) / this.scale,
    };
  }

  setQuality(q: "low" | "high"): void {
    this.quality = q;
    this.particles.setQuality(q);
    this.applyBloom();
    this.applyChroma();
  }

  setHighContrast(v: boolean): void {
    this.highContrast = v;
  }

  setSector(sector: number): void {
    // Stages carry sector 1..5; palettes are 0-indexed.
    const idx = Math.max(0, Math.min(SECTOR_PALETTES.length - 1, sector - 1));
    this.sector = idx;
    this.background.setSector(idx);
  }

  setShakeScale(v: number): void {
    this.shakeScale = v;
  }

  /** Camera shake offset in arena px. */
  shake(x: number, y: number): void {
    this.shakeX = x;
    this.shakeY = y;
  }

  /** 0..1 chromatic aberration, only applied at quality "high". */
  setChroma(v: number): void {
    this.chromaAmt = v < 0 ? 0 : v > 1 ? 1 : v;
    this.applyChroma();
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth || window.innerWidth);
    const h = Math.max(1, this.host.clientHeight || window.innerHeight);
    // Arena follows the viewport aspect (height stays ARENA_H); called before
    // the fit scale so ARENA_W * scale === w and the letterbox collapses to ~0.
    setArenaWidth(ARENA_H * (w / h));
    this.vw = w;
    this.vh = h;
    this.app.renderer.resize(w, h);

    this.scale = Math.min(w / ARENA_W, h / ARENA_H);
    this.offsetX = (w - ARENA_W * this.scale) * 0.5;
    this.offsetY = (h - ARENA_H * this.scale) * 0.5;
    this.world.position.set(this.offsetX, this.offsetY);
    this.world.scale.set(this.scale);

    this.background.layout(w, h);

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";

    this.vignette.position.set(w / 2, h / 2);
    this.vignette.width = w;
    this.vignette.height = h;
  }

  render(world: RenderWorld, alpha: number): void {
    if (this.destroyed) return;
    const dt = this.time > 0 ? Math.min(0.05, Math.max(0, world.time - this.time)) : 0;
    this.time = world.time;
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;

    this.root.position.set(this.shakeX * this.shakeScale * this.scale, this.shakeY * this.shakeScale * this.scale);

    this.background.update(dt);

    this.drawTelegraphs(world.telegraphs);
    this.drawEnemies(world.enemies, a, world.time);
    this.drawPickups(world.pickups, a);
    this.drawPlayer(world.player, world.time);
    this.drawBullets(world.bullets, a, "playerBullet");
    this.drawTrails(world.bullets, a);
    this.drawBullets(world.enemyBullets, a, "enemyBullet");
    this.drawDamage(world.damageNumbers);
    this.particles.render(world.particles, dt);
    this.drawCrosshair(world.moving, world.time);

    this.app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("pointermove", this.onPointerMove);
    this.background.destroy();
    this.particles.destroy();
    this.vignette.destroy({ texture: true, textureSource: true });
    for (const r of this.tex.values()) r.tex.destroy(true);
    this.tex.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ------------------------------------------------------------------ textures

  private reg(key: string): Reg {
    const r = this.tex.get(key);
    if (!r) throw new Error(`Missing texture: ${key}`);
    return r;
  }

  private add(key: string, canvas: HTMLCanvasElement, ref: number): void {
    this.tex.set(key, { tex: Texture.from(canvas), ref });
  }

  private buildTextures(): void {
    // rocks: variant x 3 seeds
    for (const v of ROCK_VARIANTS) {
      for (let s = 0; s < ROCK_SEEDS; s++) {
        this.add(`rock:${v}:${s}`, makeRock(v, 256, 0x1000 + s * 977), 96);
      }
    }
    this.add("raider", makeRaider(1), 42);
    this.add("breaker", makeBreaker(256), 118);
    for (const id of BOSS_IDS) this.add(`boss:${id}`, makeBossSprite(id, 512), 225);

    // player bullets are baked white and tinted per shot
    for (const shape of BULLET_SHAPES) this.add(`pb:${shape}`, makeBullet(shape, 0xffffff, 64), 30);
    const ebN = ringedEnemyBullet(64, false);
    this.add("eb:0", ebN.c, ebN.ref);
    const ebH = ringedEnemyBullet(64, true);
    this.add("eb:1", ebH.c, ebH.ref);

    this.add("xp:1", makeXpOrb(1), 7);
    this.add("xp:2", makeXpOrb(2), 9);
    this.add("xp:3", makeXpOrb(3), 12);
    this.add("pk:repair", makePickup("repair", 48), 24);
    this.add("pk:shield", makePickup("shield", 48), 24);

    this.add("ship", makePlayerShip(1), 42);
    this.add("flame", makeThrusterFlame(1), 38);
    this.add("glow", makeGlow(64, 0xffffff), 64);
    this.add("crosshair", makeCrosshair(64, CROSSHAIR_COLOR), 32);
  }

  // ------------------------------------------------------------------ layers

  private drawTelegraphs(list: readonly Telegraph[]): void {
    let i = 0;
    for (const t of list) {
      if (!t.active) continue;
      let g = this.telegraphPool[i];
      if (!g) {
        g = new Graphics();
        g.eventMode = "none";
        this.telegraphLayer.addChild(g);
        this.telegraphPool[i] = g;
      }
      g.visible = true;
      this.paintTelegraph(g, t);
      i++;
    }
    for (let j = i; j < this.telegraphPool.length; j++) {
      const g = this.telegraphPool[j];
      if (g && g.visible) g.visible = false;
    }
  }

  private paintTelegraph(g: Graphics, t: Telegraph): void {
    const prog = t.duration > 0 ? 1 - Math.max(0, Math.min(1, t.timer / t.duration)) : 0;
    const a = 0.18 + 0.6 * prog;
    const ring = ENEMY_BULLET.ring;
    const w = Math.max(2, t.width);
    g.clear();

    if (t.kind === "line") {
      g.moveTo(t.x, t.y).lineTo(t.x2, t.y2).stroke({ width: w + 6, color: ring, alpha: 0.55 * a, cap: "round" });
      g.moveTo(t.x, t.y).lineTo(t.x2, t.y2).stroke({ width: w, color: t.color, alpha: a, cap: "round" });
      return;
    }
    if (t.kind === "circle") {
      const r = Math.max(2, t.radius);
      g.circle(t.x, t.y, r).fill({ color: t.color, alpha: 0.1 * a });
      g.circle(t.x, t.y, r).stroke({ width: w + 6, color: ring, alpha: 0.55 * a });
      g.circle(t.x, t.y, r).stroke({ width: w, color: t.color, alpha: a });
      g.circle(t.x, t.y, r * prog).stroke({ width: w, color: t.color, alpha: a * 0.8 });
      return;
    }
    // fan: a wedge from the origin toward (x2, y2), widened by `width`
    const dx = t.x2 - t.x;
    const dy = t.y2 - t.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const hw = Math.max(4, w);
    g.moveTo(t.x, t.y)
      .lineTo(t.x2 + px * hw, t.y2 + py * hw)
      .lineTo(t.x2 - px * hw, t.y2 - py * hw)
      .closePath()
      .fill({ color: t.color, alpha: 0.16 * a });
    g.moveTo(t.x, t.y)
      .lineTo(t.x2 + px * hw, t.y2 + py * hw)
      .lineTo(t.x2 - px * hw, t.y2 - py * hw)
      .closePath()
      .stroke({ width: w + 4, color: ring, alpha: 0.5 * a });
    g.moveTo(t.x2 + px * hw, t.y2 + py * hw)
      .lineTo(t.x2 - px * hw, t.y2 - py * hw)
      .stroke({ width: w, color: t.color, alpha: a, cap: "round" });
  }

  private drawEnemies(list: readonly Enemy[], alpha: number, time: number): void {
    const pool = this.pools.enemy!;
    pool.begin();
    for (const e of list) {
      if (!e.active) continue;
      const r = this.enemyKey(e);
      const rdp = this.reg(r.key);
      const s = pool.acquire(r.key, rdp.tex);
      const pos = this.interp(e, e.x, e.y, alpha);

      s.position.set(pos.x, pos.y);
      s.tint = 0xffffff;
      s.rotation = this.enemyRotation(e);
      // Remembered for inspection; the pool — not this field — owns reuse.
      e.spr = s;
      let sc = e.radius / rdp.ref;
      if (e.spawnFx > 0) sc *= 1 + e.spawnFx * 0.35;
      s.scale.set(sc);
      s.blendMode = "normal";

      let a = 1 - Math.max(0, Math.min(1, e.spawnFx));
      if (e.isBoss && e.invuln) a *= 0.65 + 0.35 * Math.sin(time * 26 + e.uid);
      s.alpha = a > 0 ? a : 0.05;

      if (e.flash > 0) {
        const g = pool.acquire("glow", this.reg("glow").tex);
        g.position.set(pos.x, pos.y);
        g.tint = 0xffffff;
        g.blendMode = "add";
        g.rotation = 0;
        const gs = (e.radius * 1.5) / this.reg("glow").ref;
        g.scale.set(gs);
        g.alpha = Math.min(0.7, e.flash);
      }
    }
    pool.end();
  }

  private enemyKey(e: Enemy): { key: string } {
    if (e.isBoss) {
      const id = e.bossDef?.id ?? "prism_sentinel";
      return { key: this.tex.has(`boss:${id}`) ? `boss:${id}` : "breaker" };
    }
    if (e.kind === "shooter") return { key: "raider" };
    if (e.kind === "smasher") return { key: "breaker" };
    const variant = e.variant ?? "normal";
    const seed = e.size === "small" ? 0 : e.size === "medium" ? 1 : 2;
    return { key: `rock:${variant}:${seed}` };
  }

  private enemyRotation(e: Enemy): number {
    if (e.isBoss) return 0;
    if (e.kind === "rock") return e.age * 0.35 * ((e.uid & 1) === 0 ? 1 : -1);
    if (e.kind === "shooter") {
      if (e.vx * e.vx + e.vy * e.vy > 1) return Math.atan2(e.vy, e.vx) + Math.PI / 2;
      return Math.PI;
    }
    return e.age * 0.9;
  }

  private drawPickups(list: readonly Pickup[], alpha: number): void {
    const pool = this.pools.pickup!;
    pool.begin();
    for (const p of list) {
      if (!p.active) continue;
      const key = this.pickupKey(p);
      const rdp = this.reg(key);
      const s = pool.acquire(key, rdp.tex);
      const pos = this.interp(p, p.x, p.y, alpha);
      const sc = p.radius / rdp.ref;
      s.position.set(pos.x, pos.y);
      s.tint = 0xffffff;
      s.rotation = p.age * 1.6;
      s.scale.set(sc * (p.magnetized ? 1.25 : 1));
      const rem = p.lifetime - p.age;
      s.alpha = rem < 1 ? Math.max(0, rem) : 1;
      p.spr = s;
    }
    pool.end();
  }

  private pickupKey(p: Pickup): string {
    if (p.kind === "xp") return `xp:${p.tier}`;
    return p.kind === "repair" ? "pk:repair" : "pk:shield";
  }

  private drawPlayer(player: Player, time: number): void {
    const pool = this.pools.player!;
    const tpool = this.pools.thruster!;
    pool.begin();
    tpool.begin();

    const pos = this.interp(player, player.x, player.y, 1);
    const speed = Math.hypot(player.vx, player.vy);
    const shipScale = (PLAYER_RADIUS / this.reg("ship").ref) * (player.dashing ? 1.14 : 1);

    const ship = pool.acquire("ship", this.reg("ship").tex);
    ship.position.set(pos.x, pos.y);
    ship.rotation = player.angle;
    ship.scale.set(shipScale);
    ship.tint = 0xffffff;
    ship.alpha = player.invuln ? 0.55 + 0.45 * Math.sin(time * 44) : player.alive ? 1 : 0.25;

    const thrust = Math.min(1, speed / 420);
    const flame = tpool.acquire("flame", this.reg("flame").tex);
    const back = 22 * (shipScale / (PLAYER_RADIUS / 42));
    const bx = -Math.sin(player.angle) * back;
    const by = Math.cos(player.angle) * back;
    const flick = 0.86 + 0.14 * Math.sin(time * 52 + speed * 0.05);
    flame.position.set(pos.x + bx, pos.y + by);
    flame.rotation = player.angle;
    flame.tint = 0xffffff;
    flame.alpha = (player.alive ? 0.45 : 0) + thrust * 0.5;
    flame.scale.set(0.45, (0.45 + thrust * 0.5) * flick);

    pool.end();
    tpool.end();
  }

  private drawBullets(list: readonly Bullet[], alpha: number, poolName: string): void {
    const pool = this.pools[poolName]!;
    const enemy = poolName === "enemyBullet";
    pool.begin();
    for (const b of list) {
      if (!b.active) continue;
      const pos = this.interp(b, b.x, b.y, alpha, b.px, b.py);
      let key: string;
      let tint = 0xffffff;
      let vis = 1;
      if (enemy) {
        key = this.highContrast ? "eb:1" : "eb:0";
      } else {
        const shape = this.bulletShape(b);
        key = `pb:${shape}`;
        tint = b.color;
        vis = SHAPE_SCALE[shape];
      }
      const rdp = this.reg(key);
      const s = pool.acquire(key, rdp.tex);
      s.position.set(pos.x, pos.y);
      // Bullet art is authored nose-up (-Y); rotate it onto the travel vector.
      s.rotation = b.angle + Math.PI / 2;
      s.tint = tint;
      s.blendMode = "normal";
      const sc = (b.radius / rdp.ref) * vis * (b.crit ? 1.2 : 1);
      s.scale.set(sc);
      const rem = b.lifetime - b.age;
      s.alpha = rem < 0.25 ? Math.max(0, rem * 4) : 1;
      b.spr = s;
    }
    pool.end();
  }

  /**
   * Streaks for shots that set `b.trail` (rail charge, prism beam, seeker
   * missiles). One pooled additive glow sprite per bullet, stretched to ~5x the
   * bullet's visual size and parked behind the nose, so fast shots read as a
   * continuous beam instead of a dot. Reuses the existing `glow` texture and the
   * standard SpritePool free-list: no new texture, no per-frame allocation. Cost
   * is one extra Sprite + draw per live trail bullet (about 1-3 in practice), on
   * its own additive layer — behind the bullet core, and independent of quality.
   */
  private drawTrails(list: readonly Bullet[], alpha: number): void {
    const pool = this.pools.trail!;
    pool.begin();
    for (const b of list) {
      if (!b.active || !b.trail) continue;
      const pos = this.interp(b, b.x, b.y, alpha, b.px, b.py);
      const base = b.radius * SHAPE_SCALE[this.bulletShape(b)];
      const len = base * 5;
      const s = pool.acquire("glow", this.reg("glow").tex);
      s.tint = b.color;
      const rem = b.lifetime - b.age;
      s.alpha = 0.34 * (rem < 0.25 ? Math.max(0, rem * 4) : 1);
      s.rotation = b.angle; // long axis (local +X) runs along travel
      s.width = len;
      s.height = Math.max(2, base * 1.5);
      s.position.set(pos.x - Math.cos(b.angle) * len * 0.42, pos.y - Math.sin(b.angle) * len * 0.42);
    }
    pool.end();
  }

  private bulletShape(b: Bullet): BakedBulletShape {
    switch (b.shape) {
      case "lance":
      case "bolt":
      case "disc":
      case "blade":
      case "orb":
      case "missile":
      case "diamond":
      case "arc":
        return b.shape;
      case "beam":
        return "lance";
      case "enemy":
      default:
        return "orb";
    }
  }

  private drawDamage(list: readonly DamageNumber[]): void {
    let i = 0;
    for (const d of list) {
      if (!d.active) continue;
      let t = this.dmgTexts[i];
      if (!t) {
        t = new Text({ text: "", style: this.okStyle });
        t.anchor.set(0.5);
        t.eventMode = "none";
        this.dmgLayer.addChild(t);
        this.dmgTexts[i] = t;
      }
      const style = d.crit ? this.critStyle : this.okStyle;
      if (t.style !== style) t.style = style;
      if (t.text !== d.text) t.text = d.text;
      t.position.set(d.x, d.y);
      t.alpha = d.maxLife > 0 ? Math.max(0, d.life / d.maxLife) : 1;
      i++;
    }
    for (let j = i; j < this.dmgTexts.length; j++) {
      const t = this.dmgTexts[j];
      if (t && t.visible) t.visible = false;
    }
  }

  private drawCrosshair(moving: boolean, time: number): void {
    const show = moving && this.haveAim;
    this.crosshair.visible = show;
    if (!show) return;
    this.crosshair.position.set(this.aimX, this.aimY);
    this.crosshair.rotation = time * 1.2;
    // Constant on-screen size (~40 CSS px) regardless of the arena letterbox scale.
    this.crosshair.scale.set(40 / this.scale / 64);
    this.crosshair.alpha = 0.92;
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Lerp between the previous rendered position and the current one. Bullets
   * carry `px/py`; everything else uses a cached previous position keyed by the
   * entity object (WeakMap, so releasing an entity releases its entry).
   */
  private interp(obj: object, x: number, y: number, alpha: number, px?: number, py?: number): { x: number; y: number } {
    if (px !== undefined && py !== undefined) {
      return { x: px + (x - px) * alpha, y: py + (y - py) * alpha };
    }
    const p = this.prev.get(obj);
    if (!p) {
      this.prev.set(obj, { x, y });
      return { x, y };
    }
    const ix = p.x + (x - p.x) * alpha;
    const iy = p.y + (y - p.y) * alpha;
    p.x = x;
    p.y = y;
    return { x: ix, y: iy };
  }

  private applyBloom(): void {
    this.particles.container.filters = this.quality === "high" ? [this.bloom] : [];
  }

  private applyChroma(): void {
    const want = this.quality === "high" && this.chromaAmt > 0.01;
    if (want && !this.chromaOn) {
      this.world.filters = [this.chroma];
      this.chromaOn = true;
    } else if (!want && this.chromaOn) {
      this.world.filters = [];
      this.chromaOn = false;
    }
    if (want) {
      const o = this.chromaAmt * 7;
      this.chroma.redX = -o;
      this.chroma.blueX = o;
      this.chroma.redY = 0;
      this.chroma.blueY = 0;
    }
  }
}

/**
 * No-op stand-in used when WebGL init fails. Same public surface as `Renderer`,
 * so the shell can swap one for the other without branching at every call site.
 */
export class NullRenderer {
  get width(): number {
    return ARENA_W;
  }

  get height(): number {
    return ARENA_H;
  }

  static async create(_host: HTMLElement, _opts: RendererOptions): Promise<NullRenderer> {
    return new NullRenderer();
  }

  toArena(clientX: number, clientY: number): { x: number; y: number } {
    return { x: clientX, y: clientY };
  }

  setQuality(_q: "low" | "high"): void {
    void _q;
  }

  setHighContrast(_v: boolean): void {
    void _v;
  }

  setSector(_sector: number): void {
    void _sector;
  }

  setShakeScale(_v: number): void {
    void _v;
  }

  shake(_x: number, _y: number): void {
    void _x;
    void _y;
  }

  setChroma(_v: number): void {
    void _v;
  }

  render(_world: RenderWorld, _alpha: number): void {
    void _world;
    void _alpha;
  }

  resize(): void {}

  destroy(): void {}
}