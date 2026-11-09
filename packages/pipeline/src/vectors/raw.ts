/** Cached raw inputs: the Geofabrik PBF and Overture extracts. Everything fails loudly; nothing is retried silently. */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { OSM_PBF_BYTES, OSM_PBF_MD5, OSM_PBF_NAME, OSM_PBF_URL, RAW_DIR, USER_AGENT } from './config.ts';
import { type Db, sqlString } from './db.ts';
import { log } from './log.ts';

async function md5File(file: string): Promise<string> {
  const hash = createHash('md5');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/** Path of the pinned NorCal PBF, downloading it on a cache miss. Verifies size and md5 on every run. */
export async function ensureOsmPbf(): Promise<string> {
  const dir = path.join(RAW_DIR, 'osm');
  const file = path.join(dir, OSM_PBF_NAME);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(file)) {
    const t0 = performance.now();
    const res = await fetch(OSM_PBF_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok || res.body === null) throw new Error(`osm: GET ${OSM_PBF_URL} failed with HTTP ${res.status}`);
    const part = `${file}.part`;
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
    renameSync(part, file);
    log(`osm: downloaded ${OSM_PBF_NAME}`, t0);
  }
  const bytes = statSync(file).size;
  if (bytes !== OSM_PBF_BYTES) throw new Error(`osm: ${file} is ${bytes} bytes, expected ${OSM_PBF_BYTES}; delete it to download again`);
  const t0 = performance.now();
  const md5 = await md5File(file);
  if (md5 !== OSM_PBF_MD5) throw new Error(`osm: ${file} has md5 ${md5}, expected ${OSM_PBF_MD5}; delete it to download again`);
  log(`osm: verified ${OSM_PBF_NAME}`, t0);
  return file;
}

/**
 * Run `selectSql` (a remote Overture query) once and cache its result as parquet under
 * data/raw/overture/. The cache key is the SQL text, so a changed release or bbox refetches.
 */
export async function cachedExtract(db: Db, name: string, selectSql: string): Promise<string> {
  const dir = path.join(RAW_DIR, 'overture');
  mkdirSync(dir, { recursive: true });
  const key = createHash('sha256').update(selectSql).digest('hex').slice(0, 12);
  const file = path.join(dir, `${name}.${key}.parquet`);
  if (existsSync(file)) return file;
  const t0 = performance.now();
  const part = `${file}.part`;
  rmSync(part, { force: true });
  await db.run(`COPY (${selectSql}) TO ${sqlString(part)} (FORMAT parquet, COMPRESSION zstd)`);
  renameSync(part, file);
  log(`overture: fetched ${name} (${statSync(file).size} bytes)`, t0);
  return file;
}
