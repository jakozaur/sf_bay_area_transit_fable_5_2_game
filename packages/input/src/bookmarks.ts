/** Named camera bookmarks: the list behind CameraPort.status.bookmarks and the 1 to 4 keys. */
import type { CameraBookmark, NamedBookmark } from '@bayvox/core';

function assertFinite(b: CameraBookmark, id: string): void {
  for (const v of [b.position, b.target]) {
    if (!Number.isFinite(v.x + v.y + v.z)) throw new RangeError(`CameraBookmarks: bookmark ${id} is not finite: (${v.x}, ${v.y}, ${v.z})`);
  }
}

/**
 * Ordered set of bookmarks. Scenario bookmarks are added at load; `save` stores the pose the player is looking
 * from (CameraRig.bookmark()). `list()` returns the same array until something changes, so it can back a Readable.
 */
export class CameraBookmarks {
  private items: NamedBookmark[] = [];
  private readonly listeners = new Set<(list: NamedBookmark[]) => void>();

  constructor(initial: readonly NamedBookmark[] = []) {
    for (const b of initial) this.set(b);
  }

  list(): NamedBookmark[] {
    return this.items;
  }

  /** Adds a bookmark, or replaces the one with the same id in place. A hotkey moves to the bookmark that was given it last. */
  set(b: NamedBookmark): void {
    if (b.id === '') throw new RangeError('CameraBookmarks.set: id is empty');
    assertFinite(b.bookmark, b.id);
    const copy: NamedBookmark = {
      id: b.id,
      label: b.label,
      bookmark: { position: { ...b.bookmark.position }, target: { ...b.bookmark.target }, fovYDeg: b.bookmark.fovYDeg },
    };
    if (b.hotkey !== undefined) copy.hotkey = b.hotkey;
    const next = this.items.map((o) => {
      if (o.id === b.id) return copy;
      if (b.hotkey !== undefined && o.hotkey === b.hotkey) return { id: o.id, label: o.label, bookmark: o.bookmark };
      return o;
    });
    if (!next.includes(copy)) next.push(copy);
    this.publish(next);
  }

  /** Stores the current pose under `id`. */
  save(id: string, label: string, pose: CameraBookmark, hotkey?: string): NamedBookmark {
    this.set(hotkey === undefined ? { id, label, bookmark: pose } : { id, label, bookmark: pose, hotkey });
    return this.get(id);
  }

  remove(id: string): void {
    this.get(id);
    this.publish(this.items.filter((o) => o.id !== id));
  }

  /** Throws for an unknown id, naming the ones that exist. */
  get(id: string): NamedBookmark {
    const b = this.items.find((o) => o.id === id);
    if (b === undefined) {
      throw new RangeError(`CameraBookmarks: unknown bookmark ${id} (have: ${this.items.map((o) => o.id).join(', ') || 'none'})`);
    }
    return b;
  }

  /** Bookmark of the `camera.bookmark` action: by position in the list. Undefined when there are fewer. */
  at(index: number): NamedBookmark | undefined {
    return this.items[index];
  }

  byHotkey(code: string): NamedBookmark | undefined {
    return this.items.find((o) => o.hotkey === code);
  }

  /** Calls `cb` after every change. Returns an unsubscribe function. */
  subscribe(cb: (list: NamedBookmark[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private publish(next: NamedBookmark[]): void {
    this.items = next;
    for (const cb of this.listeners) cb(next);
  }
}
