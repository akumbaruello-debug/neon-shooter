/**
 * Keyboard + mouse input with rebindable actions.
 * Edge ("just pressed") state is cleared once per simulation step via endFrame().
 * Focus loss clears every held key so nothing gets stuck.
 */
import type { ActionName, Settings } from "../types";

const CODE_ALIASES: Record<string, string> = {
  Escape: "Esc",
  Space: "Space",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

export function normalizeCode(code: string): string {
  if (CODE_ALIASES[code]) return CODE_ALIASES[code] as string;
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num${code.slice(6)}`;
  return code;
}

export interface PointerState {
  /** Arena-space cursor position. */
  x: number;
  y: number;
  /** True while a mouse button is held. */
  down: boolean;
  rightDown: boolean;
  /** True if the pointer has ever moved (so we don't aim at 0,0 on boot). */
  active: boolean;
}

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private binds: Record<ActionName, string[]> = {} as Record<ActionName, string[]>;
  private detachers: (() => void)[] = [];
  private toArena: (sx: number, sy: number) => { x: number; y: number } = (x, y) => ({ x, y });

  readonly pointer: PointerState = { x: 0, y: 0, down: false, rightDown: false, active: false };

  /** Set by the shell so RMB dash does not open the context menu. */
  onContextMenu: ((e: Event) => void) | null = null;

  constructor(private target: Window = window) {}

  applyBindings(s: Settings): void {
    this.binds = s.keybindings;
  }

  bind(setToArena: (sx: number, sy: number) => { x: number; y: number }): void {
    this.toArena = setToArena;
    const w = this.target;

    const onKeyDown = (e: KeyboardEvent) => {
      // Stop the page scrolling / browser shortcuts while playing.
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      const code = normalizeCode(e.code);
      if (!this.held.has(code)) this.pressed.add(code);
      this.held.add(code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const code = normalizeCode(e.code);
      this.held.delete(code);
      this.released.add(code);
    };
    const clearAll = () => {
      this.held.clear();
      this.pointer.down = false;
      this.pointer.rightDown = false;
    };
    const onMove = (e: MouseEvent) => {
      const p = this.toArena(e.clientX, e.clientY);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.active = true;
    };
    const onDown = (e: MouseEvent) => {
      if (e.button === 0) this.pointer.down = true;
      if (e.button === 2) this.pointer.rightDown = true;
      const p = this.toArena(e.clientX, e.clientY);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.active = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) this.pointer.down = false;
      if (e.button === 2) this.pointer.rightDown = false;
    };
    const onCtx = (e: Event) => {
      e.preventDefault();
      this.onContextMenu?.(e);
    };
    const onLeave = () => {
      // Mouse left the window: drop the fire buttons so nothing sticks.
      this.pointer.down = false;
      this.pointer.rightDown = false;
    };

    w.addEventListener("keydown", onKeyDown, { passive: false });
    w.addEventListener("keyup", onKeyUp);
    w.addEventListener("blur", clearAll);
    w.addEventListener("mousemove", onMove);
    w.addEventListener("mousedown", onDown);
    w.addEventListener("mouseup", onUp);
    w.addEventListener("contextmenu", onCtx);
    w.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", clearAll);

    this.detachers = [
      () => w.removeEventListener("keydown", onKeyDown),
      () => w.removeEventListener("keyup", onKeyUp),
      () => w.removeEventListener("blur", clearAll),
      () => w.removeEventListener("mousemove", onMove),
      () => w.removeEventListener("mousedown", onDown),
      () => w.removeEventListener("mouseup", onUp),
      () => w.removeEventListener("contextmenu", onCtx),
      () => w.removeEventListener("mouseleave", onLeave),
      () => document.removeEventListener("visibilitychange", clearAll),
    ];
  }

  dispose(): void {
    for (const d of this.detachers) d();
    this.detachers = [];
  }

  isDown(action: ActionName): boolean {
    const codes = this.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.held.has(c)) return true;
    return false;
  }

  justPressed(action: ActionName): boolean {
    const codes = this.binds[action];
    if (!codes) return false;
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  /** True if a raw physical code (already normalized) is held. */
  heldCode(code: string): boolean {
    return this.held.has(code);
  }

  /** Normalized movement axis, diagonals normalized to length <= 1. */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown("left")) x -= 1;
    if (this.isDown("right")) x += 1;
    if (this.isDown("up")) y -= 1;
    if (this.isDown("down")) y += 1;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  /** Call at the end of every simulation step. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  clearEdges(): void {
    this.pressed.clear();
  }
}
