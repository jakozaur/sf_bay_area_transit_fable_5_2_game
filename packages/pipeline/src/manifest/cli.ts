/**
 * Manifest stage: `pnpm data:build:manifest` (node src/manifest/cli.ts). Reads the two fragments under
 * apps/game/public/data/, verifies every listed file on disk against its recorded size and sha256, and
 * writes manifest.json. Fails with a one-line diagnostic and writes nothing if anything is off.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TerrainManifestFragment, VectorManifest } from '@bayvox/core';
import { manifestFiles, mergeManifest } from './merge.ts';

const OUT_DIR = path.resolve(import.meta.dirname, '../../../../apps/game/public/data');

async function readJson<T>(name: string, stage: string): Promise<T> {
  const file = path.join(OUT_DIR, name);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(`manifest: ${file} is missing; run pnpm data:build:${stage} first`);
  }
  return JSON.parse(text) as T;
}

export async function buildManifest(): Promise<void> {
  const t0 = performance.now();
  const terrain = await readJson<TerrainManifestFragment>('manifest.terrain.json', 'terrain');
  const vectors = await readJson<VectorManifest>('manifest.vectors.json', 'vectors');
  const sha256Hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
  const manifest = mergeManifest(terrain, vectors, sha256Hex);
  const files = manifestFiles(manifest);
  let total = 0;
  for (const f of files) {
    const file = path.join(OUT_DIR, f.file);
    let bytes: Uint8Array;
    try {
      bytes = await readFile(file);
    } catch {
      throw new Error(`manifest: ${file} is listed in a fragment but missing on disk`);
    }
    if (bytes.length !== f.bytes) throw new Error(`manifest: ${f.file} is ${bytes.length} bytes on disk, its fragment says ${f.bytes}`);
    const sha = sha256Hex(bytes);
    if (sha !== f.sha256) throw new Error(`manifest: ${f.file} has sha256 ${sha} on disk, its fragment says ${f.sha256}`);
    total += bytes.length;
  }
  await writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `manifest: ${files.length} files, ${total} bytes, ${manifest.sites.length} sites, world version ${manifest.worldVersion} in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
}

if (import.meta.main) {
  buildManifest().catch((err: unknown) => {
    console.error(err instanceof Error && err.constructor === Error ? err.message : err);
    process.exit(1);
  });
}
