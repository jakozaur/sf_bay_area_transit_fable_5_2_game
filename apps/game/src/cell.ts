/** Minimal observable value: the app's implementation of core Readable. */
import type { Readable } from '@bayvox/core';

export class Cell<T> implements Readable<T> {
  private readonly subs = new Set<(v: T) => void>();
  private value: T;

  constructor(value: T) {
    this.value = value;
  }

  get(): T {
    return this.value;
  }

  /** Stores `v` and tells every subscriber, unless it is the value already held. */
  set(v: T): void {
    if (v === this.value) return;
    this.value = v;
    for (const cb of [...this.subs]) cb(v);
  }

  subscribe(cb: (v: T) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
}
