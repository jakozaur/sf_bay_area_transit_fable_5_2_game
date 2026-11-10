// Reads the baked world data (apps/game/public/data) and writes the anchors the scenario tests compare against:
// site boxes, the Caltrain and BART stations the missions start from, the trainbox footprint and the Dumbarton
// freight lead. Packages are typechecked without Node types, so the tests cannot read the data themselves.
//
//   node packages/scenarios/scripts/baked-anchors.mjs          rewrites src/baked-anchors.ts
//   node packages/scenarios/scripts/baked-anchors.mjs --check  exits 1 if the file is stale against the data
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeRailNetwork, decodeSiteVectorTile } from '../../core/src/index.ts';

const DATA = new URL('../../../apps/game/public/data/', import.meta.url);
const OUT = new URL('../src/baked-anchors.ts', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', DATA), 'utf8'));
const inflate = (file) => new Uint8Array(inflateSync(readFileSync(new URL(file, DATA))));
const net = decodeRailNetwork(inflate(manifest.rail.file));
const round = (v) => Math.round(v * 100) / 100;

const WANTED = [
  ['fourthAndKing', 'San Francisco 4th & King Street', 'Caltrain'],
  ['mountainView', 'Mountain View', 'Caltrain'],
  ['redwoodCity', 'Redwood City', 'Caltrain'],
  ['belmont', 'Belmont', 'Caltrain'],
  ['sanCarlos', 'San Carlos', 'Caltrain'],
  ['unionCity', 'Union City', 'BART'],
];
const stations = {};
for (const [key, name, system] of WANTED) {
  const s = net.stations.find((x) => x.name === name && x.systems.includes(system));
  if (!s) throw new Error(`baked-anchors: no ${system} station "${name}" in ${manifest.rail.file}`);
  stations[key] = { name, system, x: round(s.parts[0][0]), z: round(s.parts[0][1]) };
}

const sites = {};
for (const s of manifest.sites) sites[s.id] = { minX: s.bbox[0], minZ: s.bbox[1], maxX: s.bbox[2], maxZ: s.bbox[3] };

// Bounding box of the footprint named after the trainbox, over every tile that holds a piece of it.
const portal = manifest.sites.find((s) => s.id === 'portal');
if (!portal) throw new Error('baked-anchors: the manifest has no "portal" site');
const box = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
for (const t of portal.tiles) {
  const tile = decodeSiteVectorTile(inflate(t.file));
  for (const b of [...tile.buildings, ...tile.buildingParts]) {
    if (b.name !== 'Salesforce Transit Center') continue;
    for (const part of b.parts) {
      for (let i = 0; i < part.length; i += 2) {
        box.minX = Math.min(box.minX, part[i]);
        box.maxX = Math.max(box.maxX, part[i]);
        box.minZ = Math.min(box.minZ, part[i + 1]);
        box.maxZ = Math.max(box.maxZ, part[i + 1]);
      }
    }
  }
}
if (!Number.isFinite(box.minX)) throw new Error('baked-anchors: no building named "Salesforce Transit Center" in the portal site tiles');
const trainbox = { minX: round(box.minX), minZ: round(box.minZ), maxX: round(box.maxX), maxZ: round(box.maxZ) };

// The Dumbarton Cutoff as OSM has it: every vertex of the two named tracks, whole metres, flat x, z pairs.
const corridor = [];
for (const t of net.tracks) {
  if (!/^(Redwood Junction Industrial Lead|Dumbarton Branch)$/.test(t.name)) continue;
  for (const part of t.parts) for (let i = 0; i < part.length; i += 2) corridor.push(Math.round(part[i]), Math.round(part[i + 1]));
}
if (corridor.length < 20) throw new Error('baked-anchors: the Dumbarton corridor tracks are missing from the rail network');

const rows = [];
for (let i = 0; i < corridor.length; i += 16) rows.push(`  ${corridor.slice(i, i + 16).join(', ')},`);
const text = `/**
 * Anchors read off the baked world data, for the scenario geography tests. GENERATED: do not edit.
 * Regenerate with \`node packages/scenarios/scripts/baked-anchors.mjs\` after \`pnpm data:build\`;
 * \`--check\` fails when this file is stale. World metres, core frame (x east, z south).
 * Data: ${manifest.format ?? 'bayvox-world'} manifest, rail network ${manifest.rail.file}.
 */

/** Plan boxes of the voxel sites, half-open. */
export const BAKED_SITES: Record<string, { minX: number; minZ: number; maxX: number; maxZ: number }> = ${JSON.stringify(sites, null, 2)};

/** Stations of the rail network the missions start from (OSM positions). */
export const BAKED_STATIONS: Record<string, { name: string; system: string; x: number; z: number }> = ${JSON.stringify(stations, null, 2)};

/** Bounding box of the Overture footprint named "Salesforce Transit Center". */
export const BAKED_TRAINBOX = ${JSON.stringify(trainbox)};

/** Vertices of the OSM tracks "Redwood Junction Industrial Lead" and "Dumbarton Branch", flat x, z pairs in whole metres. */
export const BAKED_DUMBARTON_TRACK: readonly number[] = [
${rows.join('\n')}
];
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    current = '';
  }
  // The file on disk has been through the formatter: compare the numbers, not the layout.
  const digits = (s) => (s.match(/-?\d+(\.\d+)?/g) ?? []).join(' ');
  if (digits(current) !== digits(text)) {
    process.stderr.write(
      'baked-anchors: packages/scenarios/src/baked-anchors.ts is stale against apps/game/public/data; rerun without --check\n',
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUT, text);
}
