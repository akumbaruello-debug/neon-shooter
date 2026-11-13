/**
 * Minimal object pool. Entities implement `reset()` to clear per-use state.
 * Pools never shrink, so long runs stay allocation-free in steady state.
 */
export class Pool<T extends { active: boolean }> {
  private items: T[] = [];
  private free: T[] = [];

  constructor(private factory: () => T, preallocate = 0) {
    for (let i = 0; i < preallocate; i++) {
      const it = factory();
      it.active = false;
      this.items.push(it);
      this.free.push(it);
    }
  }

  get size(): number {
    return this.items.length;
  }

  get activeCount(): number {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }

  spawn(): T {
    const it = this.free.pop() ?? this.factory();
    if (!this.items.includes(it)) this.items.push(it);
    it.active = true;
    return it;
  }

  release(it: T): void {
    if (!it.active) return;
    it.active = false;
    this.free.push(it);
  }

  clear(): void {
    for (const it of this.items) {
      if (it.active) {
        it.active = false;
        this.free.push(it);
      }
    }
  }

  /** Live array (includes inactive entries) for iteration with `active` checks. */
  all(): readonly T[] {
    return this.items;
  }
}

/** Packs `x,y` into one integer key for the spatial grid. */
export function gridKey(x: number, y: number, cell: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ cell;
}
