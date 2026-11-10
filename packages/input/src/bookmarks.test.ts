import type { NamedBookmark } from '@bayvox/core';
import { expect, test } from 'vitest';
import { CameraBookmarks } from './bookmarks.ts';

const pose = (x: number): NamedBookmark['bookmark'] => ({ position: { x, y: 100, z: 100 }, target: { x, y: 0, z: 0 } });

test('bookmarks keep their order, replace in place, and notify on change only', () => {
  const b = new CameraBookmarks([
    { id: 'site', label: 'Site', hotkey: 'Digit1', bookmark: pose(0) },
    { id: 'bay', label: 'Whole Bay', hotkey: 'Digit2', bookmark: pose(1) },
  ]);
  const seen: number[] = [];
  b.subscribe((l) => seen.push(l.length));
  const before = b.list();
  expect(b.list()).toBe(before);
  b.save('face', 'TBM face', pose(2), 'Digit3');
  b.set({ id: 'site', label: 'Launch pit', bookmark: pose(3), hotkey: 'Digit1' });
  expect(b.list().map((o) => o.id)).toEqual(['site', 'bay', 'face']);
  expect(b.list()).not.toBe(before);
  expect(b.get('site').label).toBe('Launch pit');
  expect(b.at(2)?.id).toBe('face');
  expect(b.at(7)).toBeUndefined();
  expect(b.byHotkey('Digit2')?.id).toBe('bay');
  // A hotkey belongs to one bookmark: the last one given it.
  b.save('mine', 'My view', pose(4), 'Digit2');
  expect(b.byHotkey('Digit2')?.id).toBe('mine');
  expect(b.get('bay').hotkey).toBeUndefined();
  b.remove('bay');
  expect(seen).toEqual([3, 3, 4, 3]);
  // Stored poses are copies.
  const p = pose(9);
  b.save('copy', 'Copy', p);
  p.position.x = -1;
  expect(b.get('copy').bookmark.position.x).toBe(9);
});

test('unknown ids and broken poses fail with a diagnostic', () => {
  const b = new CameraBookmarks([{ id: 'site', label: 'Site', bookmark: pose(0) }]);
  expect(() => b.get('nope')).toThrow(/unknown bookmark nope \(have: site\)/);
  expect(() => b.remove('nope')).toThrow(/unknown bookmark/);
  expect(() => b.set({ id: 'x', label: 'X', bookmark: { position: { x: Number.NaN, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } } })).toThrow(
    /not finite/,
  );
  expect(() => b.set({ id: '', label: 'X', bookmark: pose(0) })).toThrow(/id is empty/);
});
