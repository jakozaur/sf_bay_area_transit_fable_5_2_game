import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { TerrainManifestFragment, VectorManifest, WorldManifest } from '@bayvox/core';
import { describe, expect, test } from 'vitest';
import { manifestFiles, mergeManifest } from './merge.ts';

const DATA_DIR = path.resolve(import.meta.dirname, '../../../../apps/game/public/data');
const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');
const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
// The fragments are build products of the terrain and vector stages; without them there is nothing to merge.
const haveFragments = existsSync(path.join(DATA_DIR, 'manifest.terrain.json')) && existsSync(path.join(DATA_DIR, 'manifest.vectors.json'));

describe.skipIf(!haveFragments)('manifest merge on the built fragments', () => {
  const terrain = (): TerrainManifestFragment => read('manifest.terrain.json');
  const vectors = (): VectorManifest => read('manifest.vectors.json');

  test('merges into one manifest that equals the shipped manifest.json', () => {
    const merged = mergeManifest(terrain(), vectors(), sha256Hex);
    expect(merged.format).toBe('bayvox-world');
    expect(merged.sites.map((s) => s.id)).toEqual(['portal', 'googleplex', 'meta', 'oracle']);
    const portal = merged.sites[0];
    expect(portal?.tiles.length).toBe(9);
    expect(portal?.dem.length).toBe(9);
    // Tiles are ordered south to north, west to east, the same for both kinds.
    expect(portal?.tiles.map((t) => `${t.tx}_${t.ty}`)).toEqual(portal?.dem.map((t) => `${t.tx}_${t.ty}`));
    expect(portal?.tiles[0]).toMatchObject({ tx: 9, ty: 30 });
    expect(merged.sources.length).toBe(4);
    expect(merged.worldVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(manifestFiles(merged).length).toBe(3 + 2 * (9 + 4 + 4 + 4));
    expect(merged).toEqual(read<WorldManifest>('manifest.json'));
  });

  test('the world version changes with any file hash and nothing else', () => {
    const a = mergeManifest(terrain(), vectors(), sha256Hex);
    const t = terrain();
    t.checks.extra = 1;
    expect(mergeManifest(t, vectors(), sha256Hex).worldVersion).toBe(a.worldVersion);
    t.far.sha256 = t.far.sha256.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    expect(mergeManifest(t, vectors(), sha256Hex).worldVersion).not.toBe(a.worldVersion);
  });

  test('fragments that disagree are refused, naming the disagreement', () => {
    const v = vectors();
    v.sites.pop();
    expect(() => mergeManifest(terrain(), v, sha256Hex)).toThrow(
      /terrain has sites \[portal, googleplex, meta, oracle\], vectors have \[portal, googleplex, meta\]/,
    );
    const t = terrain();
    t.sites[0]?.dem.tiles.pop();
    expect(() => mergeManifest(t, vectors(), sha256Hex)).toThrow(/site portal DEM tiles .* do not cover its tile box/);
    const moved = terrain();
    moved.frame.originEasting += 4096;
    expect(() => mergeManifest(moved, vectors(), sha256Hex)).toThrow(/terrain fragment frame/);
    const renamed = vectors();
    renamed.net.rail.file = 'rail/network.json';
    expect(() => mergeManifest(terrain(), renamed, sha256Hex)).toThrow(/rail network has an unexpected path: rail\/network.json/);
    expect(() => mergeManifest({ ...terrain(), formatVersion: 99 }, vectors(), sha256Hex)).toThrow(/bayvox-terrain v99/);
  });
});
