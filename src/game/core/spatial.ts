/**
 * Uniform spatial hash grid. Rebuilt every tick from the enemy list; used for
 * broad-phase collision against bullets, the player and AoE queries.
 */
export interface GridItem {
  x: number;
  y: number;
  radius: number;
}

export class SpatialHash<T extends GridItem> {
  private cells = new Map<number, T[]>();
  private cols: number;
  private rows: number;

  constructor(
    private cellSize: number,
    private width: number,
    private height: number,
  ) {
    this.cols = Math.ceil(width / cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
  }

  private key(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const cs = this.cellSize;
    const x0 = Math.max(0, Math.floor((item.x - item.radius) / cs));
    const x1 = Math.min(this.cols - 1, Math.floor((item.x + item.radius) / cs));
    const y0 = Math.max(0, Math.floor((item.y - item.radius) / cs));
    const y1 = Math.min(this.rows - 1, Math.floor((item.y + item.radius) / cs));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(item);
      }
    }
  }

  /** All items whose cell overlaps the query circle. May include duplicates. */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.max(0, Math.floor((x - r) / cs));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / cs));
    const y0 = Math.max(0, Math.floor((y - r) / cs));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / cs));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const it of list) out.push(it);
      }
    }
    return out;
  }
}
