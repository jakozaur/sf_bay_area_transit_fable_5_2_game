/** Pinned inputs and paths of the vector pipeline (`pnpm data:build:vectors`). */
import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');
/** Raw downloads and extracts: gitignored, never served. */
export const RAW_DIR = path.join(REPO_ROOT, 'data/raw');
/** Served runtime data. */
export const DATA_DIR = path.join(REPO_ROOT, 'apps/game/public/data');
export const VECTOR_MANIFEST_PATH = path.join(DATA_DIR, 'manifest.vectors.json');

export const USER_AGENT = 'voxel-map-data-pipeline/0.1';

/** Geofabrik dated snapshot (YYMMDD). Bump together with OSM_PBF_MD5. */
export const OSM_SNAPSHOT = '261108';
export const OSM_SNAPSHOT_DATE = '2026-11-08';
export const OSM_PBF_NAME = `norcal-${OSM_SNAPSHOT}.osm.pbf`;
export const OSM_PBF_URL = `https://download.geofabrik.de/north-america/us/california/${OSM_PBF_NAME}`;
export const OSM_PBF_MD5 = 'ec4668d3afeef4fe4c53cc076e47e9a5';
export const OSM_PBF_BYTES = 655_544_424;

/** Overture release id. Old releases disappear from S3, so extracts are cached under RAW_DIR. */
export const OVERTURE_RELEASE = '2026-10-21.0';
export const OVERTURE_S3 = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}`;
export const OVERTURE_REGION = 'us-west-2';

/** Degrees added around the grid when selecting OSM nodes, so ways crossing the grid edge keep their shape. */
export const NODE_BBOX_MARGIN_DEG = 0.3;
