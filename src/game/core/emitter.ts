export type EventMap = Record<string, unknown>;

type Handler<T> = (payload: T) => void;

/** Tiny typed event bus (game -> React bridge). */
export class Emitter<M extends EventMap> {
  private map = new Map<keyof M, Set<Handler<unknown>>>();

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn as Handler<unknown>);
    return () => this.off(type, fn);
  }

  off<K extends keyof M>(type: K, fn: Handler<M[K]>): void {
    this.map.get(type)?.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Handler<M[K]>)(payload);
      } catch (err) {
        // A broken listener must never take the render loop down.
        console.error("[emitter]", type, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
