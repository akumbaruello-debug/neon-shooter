/** Deterministic-ish xorshift RNG so runs can be reproducible in tests. */
export class Rng {
  private s: number;

  constructor(seed = 0x2f6e2b1 >>> 0) {
    this.s = seed >>> 0 || 1;
  }

  /** float in [0,1) */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = arr[i] as T;
      const b = arr[j] as T;
      arr[i] = b;
      arr[j] = a;
    }
    return arr;
  }
}

export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
export const randInt = (lo: number, hi: number): number => Math.floor(rand(lo, hi + 1));
export const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)] as T;
export const chance = (p: number): boolean => Math.random() < p;
