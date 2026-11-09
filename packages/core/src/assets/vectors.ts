/**
 * Vector assets written by `pnpm data:build:vectors` (packages/pipeline/src/vectors) and their decoders.
 *
 * Files (paths relative to data/, listed with sizes, counts and sha256 in data/manifest.vectors.json):
 *
 *   net/rail.<hash>.bin                         existing rail network for the whole grid: layers
 *                                               tracks, stations, routes, routeStops
 *   net/far.<hash>.bin                          light region-wide layers: water, highways, places
 *   sites/<siteId>/<tx>_<ty>.vectors.<hash>.bin one combined file per 2,048 m site tile: layers
 *                                               buildings, buildingParts, roads, water, landuse
 *
 * Every file is a zlib stream (RFC 1950, "deflate" in CompressionStream terms) around one bundle:
 *
 *   "BVV1"                                4 bytes magic
 *   varint layerCount
 *   per layer:
 *     str   name
 *     u8    geometry kind: 0 point, 1 line, 2 polygon
 *     varint quantMicro                   quantization step in micrometres (250000 = 0.25 m)
 *     varint featureCount
 *     varint columnCount
 *     per column:
 *       str name
 *       u8  type: 0 uint, 1 int, 2 str
 *       uint: featureCount varints
 *       int:  featureCount zigzag varints
 *       str:  varint dictSize, dictSize strs (first-appearance order), featureCount varint indices
 *     geometry, in quantization units, as zigzag varint deltas (dx, dz) from the previous point of
 *     the layer (the first point of the layer is a delta from 0,0):
 *       point:        one point per feature
 *       line/polygon: varint partCount, then per part varint pointCount and the points
 *
 *   varint: unsigned LEB128, values up to 2^53 - 1. str: varint byte length, then UTF-8.
 *
 * Coordinates are world metres (frame.ts): x east, z south, both from the grid origin, so
 * world = quantized integer * quantM. Polygon parts are rings without the closing point: the first
 * ring of a feature is the outer ring, the rest are holes; multipolygons are split into one feature
 * per polygon, repeating the attributes. Features are not clipped to the grid, and buildings are not
 * clipped to their tile (a building belongs to the tile that contains its bounding box centre);
 * roads, water and land use are clipped to the tile.
 *
 * Booleans are uint columns holding 0 or 1. A missing string is ''. A missing number is 0 unless the
 * column comment says otherwise.
 */

export const VECTOR_BUNDLE_MAGIC = 'BVV1';
export const VECTOR_MANIFEST_URL = 'data/manifest.vectors.json';
export const VECTOR_FORMAT_VERSION = 1;

export type VectorGeomKind = 'point' | 'line' | 'polygon';
export type VectorColumnType = 'uint' | 'int' | 'str';

export type VectorColumn = { name: string; type: 'uint' | 'int'; data: number[] } | { name: string; type: 'str'; data: string[] };

/** One decoded layer, column-wise. */
export interface VectorLayer {
  name: string;
  geom: VectorGeomKind;
  /** Quantization step in metres. Must be a whole number of micrometres. */
  quantM: number;
  columns: VectorColumn[];
  /**
   * Per feature, its parts; each part is a flat [x0, z0, x1, z1, ...] array in world metres.
   * A point feature has exactly one part holding one point.
   */
  geometry: Float64Array[][];
}

const GEOM_KINDS: readonly VectorGeomKind[] = ['point', 'line', 'polygon'];
const COLUMN_TYPES: readonly VectorColumnType[] = ['uint', 'int', 'str'];
const MAX_VARINT = Number.MAX_SAFE_INTEGER;

interface Utf8 {
  encode(s: string): Uint8Array;
  decode(b: Uint8Array): string;
}

// core compiles without DOM or Node typings; TextEncoder and the compression streams are platform
// globals in browsers, workers and Node, so they are reached through a narrow cast.
interface StreamLike {
  readable: unknown;
  writable: unknown;
}
interface PlatformGlobals {
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new (label: string, options: { fatal: boolean }) => { decode(b: Uint8Array): string };
  CompressionStream: new (format: string) => StreamLike;
  DecompressionStream: new (format: string) => StreamLike;
  Blob: new (parts: Uint8Array[]) => { stream(): { pipeThrough(s: StreamLike): unknown } };
  Response: new (body: unknown) => { arrayBuffer(): Promise<ArrayBuffer> };
}
const platform = globalThis as unknown as PlatformGlobals;

let utf8Cache: Utf8 | undefined;
function utf8(): Utf8 {
  if (utf8Cache === undefined) {
    const enc = new platform.TextEncoder();
    const dec = new platform.TextDecoder('utf-8', { fatal: true });
    utf8Cache = { encode: (s) => enc.encode(s), decode: (b) => dec.decode(b) };
  }
  return utf8Cache;
}

class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  private len = 0;

  private reserve(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  byte(v: number): void {
    this.reserve(1);
    this.buf[this.len++] = v;
  }

  varint(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > MAX_VARINT) {
      throw new RangeError(`vector bundle: varint needs an integer in [0, 2^53): ${v}`);
    }
    this.reserve(8);
    let rest = v;
    while (rest >= 0x80) {
      this.buf[this.len++] = (rest % 0x80) + 0x80;
      rest = Math.floor(rest / 0x80);
    }
    this.buf[this.len++] = rest;
  }

  zigzag(v: number): void {
    if (!Number.isInteger(v) || Math.abs(v) > 2 ** 52) {
      throw new RangeError(`vector bundle: signed value needs an integer within 2^52: ${v}`);
    }
    this.varint(v >= 0 ? v * 2 : -v * 2 - 1);
  }

  bytes(b: Uint8Array): void {
    this.reserve(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }

  str(s: string): void {
    const b = utf8().encode(s);
    this.varint(b.length);
    this.bytes(b);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

class ByteReader {
  private pos = 0;
  private readonly buf: Uint8Array;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) {
      throw new RangeError(`vector bundle: truncated at byte ${this.pos} of ${this.buf.length}`);
    }
  }

  byte(): number {
    this.need(1);
    return this.buf[this.pos++] as number;
  }

  varint(): number {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.byte();
      v += (b % 0x80) * mul;
      if (b < 0x80) return v;
      mul *= 0x80;
    }
    throw new RangeError(`vector bundle: varint longer than 8 bytes before byte ${this.pos}`);
  }

  zigzag(): number {
    const v = this.varint();
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  }

  str(): string {
    const n = this.varint();
    this.need(n);
    const s = utf8().decode(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }

  magic(expected: string): void {
    this.need(expected.length);
    for (let i = 0; i < expected.length; i++) {
      if (this.buf[this.pos + i] !== expected.charCodeAt(i)) {
        throw new Error(`vector bundle: bad magic, expected "${expected}"`);
      }
    }
    this.pos += expected.length;
  }

  end(): void {
    if (this.pos !== this.buf.length) {
      throw new RangeError(`vector bundle: ${this.buf.length - this.pos} trailing bytes after the last layer`);
    }
  }
}

function quantize(v: number, quantM: number): number {
  return Math.round(v / quantM);
}

function quantMicro(layer: VectorLayer): number {
  const micro = Math.round(layer.quantM * 1e6);
  if (!(micro >= 1) || Math.abs(micro - layer.quantM * 1e6) > 1e-6) {
    throw new RangeError(`vector layer "${layer.name}": quantM must be a positive whole number of micrometres: ${layer.quantM}`);
  }
  return micro;
}

function encodeLayer(w: ByteWriter, layer: VectorLayer): void {
  const count = layer.geometry.length;
  const geomId = GEOM_KINDS.indexOf(layer.geom);
  if (geomId < 0) throw new Error(`vector layer "${layer.name}": unknown geometry kind "${layer.geom}"`);
  const micro = quantMicro(layer);
  const q = micro / 1e6;
  w.str(layer.name);
  w.byte(geomId);
  w.varint(micro);
  w.varint(count);
  w.varint(layer.columns.length);
  for (const col of layer.columns) {
    if (col.data.length !== count) {
      throw new Error(`vector layer "${layer.name}": column "${col.name}" has ${col.data.length} values for ${count} features`);
    }
    w.str(col.name);
    w.byte(COLUMN_TYPES.indexOf(col.type));
    if (col.type === 'str') {
      const dict = new Map<string, number>();
      const indices: number[] = [];
      for (const s of col.data) {
        let i = dict.get(s);
        if (i === undefined) {
          i = dict.size;
          dict.set(s, i);
        }
        indices.push(i);
      }
      w.varint(dict.size);
      for (const s of dict.keys()) w.str(s);
      for (const i of indices) w.varint(i);
    } else if (col.type === 'uint') {
      for (const v of col.data) w.varint(v);
    } else {
      for (const v of col.data) w.zigzag(v);
    }
  }
  let px = 0;
  let pz = 0;
  for (let f = 0; f < count; f++) {
    const parts = layer.geometry[f] as Float64Array[];
    if (layer.geom === 'point') {
      if (parts.length !== 1 || (parts[0] as Float64Array).length !== 2) {
        throw new Error(`vector layer "${layer.name}": point feature ${f} must have one part with one point`);
      }
    } else {
      w.varint(parts.length);
    }
    for (const part of parts) {
      if (part.length % 2 !== 0) throw new Error(`vector layer "${layer.name}": feature ${f} has an odd coordinate count`);
      if (layer.geom !== 'point') w.varint(part.length / 2);
      for (let i = 0; i < part.length; i += 2) {
        const x = quantize(part[i] as number, q);
        const z = quantize(part[i + 1] as number, q);
        w.zigzag(x - px);
        w.zigzag(z - pz);
        px = x;
        pz = z;
      }
    }
  }
}

/** Serialize layers into one uncompressed bundle. Coordinates are rounded to each layer's quantM. */
export function encodeVectorBundle(layers: readonly VectorLayer[]): Uint8Array {
  const w = new ByteWriter();
  w.bytes(utf8().encode(VECTOR_BUNDLE_MAGIC));
  w.varint(layers.length);
  for (const layer of layers) encodeLayer(w, layer);
  return w.finish();
}

function decodeLayer(r: ByteReader): VectorLayer {
  const name = r.str();
  const geomId = r.byte();
  const geom = GEOM_KINDS[geomId];
  if (geom === undefined) throw new Error(`vector layer "${name}": unknown geometry kind id ${geomId}`);
  const quantM = r.varint() / 1e6;
  const count = r.varint();
  const columnCount = r.varint();
  const columns: VectorColumn[] = [];
  for (let c = 0; c < columnCount; c++) {
    const colName = r.str();
    const typeId = r.byte();
    const type = COLUMN_TYPES[typeId];
    if (type === undefined) throw new Error(`vector layer "${name}": column "${colName}" has unknown type id ${typeId}`);
    if (type === 'str') {
      const dictSize = r.varint();
      const dict: string[] = [];
      for (let i = 0; i < dictSize; i++) dict.push(r.str());
      const data: string[] = [];
      for (let i = 0; i < count; i++) {
        const idx = r.varint();
        const s = dict[idx];
        if (s === undefined)
          throw new RangeError(`vector layer "${name}": column "${colName}" index ${idx} outside dictionary of ${dictSize}`);
        data.push(s);
      }
      columns.push({ name: colName, type, data });
    } else {
      const data: number[] = [];
      for (let i = 0; i < count; i++) data.push(type === 'uint' ? r.varint() : r.zigzag());
      columns.push({ name: colName, type, data });
    }
  }
  const geometry: Float64Array[][] = [];
  let px = 0;
  let pz = 0;
  for (let f = 0; f < count; f++) {
    const partCount = geom === 'point' ? 1 : r.varint();
    const parts: Float64Array[] = [];
    for (let p = 0; p < partCount; p++) {
      const n = geom === 'point' ? 1 : r.varint();
      const part = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        px += r.zigzag();
        pz += r.zigzag();
        part[i * 2] = px * quantM;
        part[i * 2 + 1] = pz * quantM;
      }
      parts.push(part);
    }
    geometry.push(parts);
  }
  return { name, geom, quantM, columns, geometry };
}

/** Parse an uncompressed bundle (see inflateVectorAsset). Throws on bad magic, truncation or trailing bytes. */
export function decodeVectorBundle(bytes: Uint8Array): VectorLayer[] {
  const r = new ByteReader(bytes);
  r.magic(VECTOR_BUNDLE_MAGIC);
  const layerCount = r.varint();
  const layers: VectorLayer[] = [];
  for (let i = 0; i < layerCount; i++) layers.push(decodeLayer(r));
  r.end();
  return layers;
}

async function pipeBytes(bytes: Uint8Array, stream: StreamLike): Promise<Uint8Array> {
  const piped = new platform.Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new platform.Response(piped).arrayBuffer());
}

/** Inflate a served vector asset (zlib stream) to bundle bytes. Rejects on a corrupt stream. */
export function inflateVectorAsset(file: Uint8Array): Promise<Uint8Array> {
  return pipeBytes(file, new platform.DecompressionStream('deflate'));
}

/** Zlib-compress bundle bytes with the platform codec. The pipeline uses node:zlib level 9 instead. */
export function deflateVectorAsset(bundle: Uint8Array): Promise<Uint8Array> {
  return pipeBytes(bundle, new platform.CompressionStream('deflate'));
}

// Typed layers ---------------------------------------------------------------------------------

/** Column name to column type, in file order. */
export type VectorSchema = Readonly<Record<string, VectorColumnType>>;
export type VectorAttrs<S extends VectorSchema> = { -readonly [K in keyof S]: S[K] extends 'str' ? string : number };
/** One feature: its attributes plus geometry parts (flat x, z pairs in world metres). */
export type VectorFeature<S extends VectorSchema> = VectorAttrs<S> & { parts: Float64Array[] };

/** Build a layer from row objects. Fails on a missing or mistyped attribute. */
export function featuresToLayer<S extends VectorSchema>(
  name: string,
  geom: VectorGeomKind,
  quantM: number,
  schema: S,
  features: readonly VectorFeature<S>[],
): VectorLayer {
  const columns: VectorColumn[] = [];
  for (const [col, type] of Object.entries(schema)) {
    const values = features.map((f, i) => {
      const v = (f as Record<string, unknown>)[col];
      if (typeof v !== (type === 'str' ? 'string' : 'number')) {
        throw new TypeError(`vector layer "${name}": feature ${i} attribute "${col}" is ${JSON.stringify(v)}, expected ${type}`);
      }
      return v;
    });
    columns.push(type === 'str' ? { name: col, type, data: values as string[] } : { name: col, type, data: values as number[] });
  }
  return { name, geom, quantM, columns, geometry: features.map((f) => f.parts) };
}

/** Turn a decoded layer into row objects. Fails unless the layer's columns equal the schema exactly. */
export function layerToFeatures<S extends VectorSchema>(layer: VectorLayer, schema: S): VectorFeature<S>[] {
  const want = Object.entries(schema)
    .map(([n, t]) => `${n}:${t}`)
    .join(',');
  const got = layer.columns.map((c) => `${c.name}:${c.type}`).join(',');
  if (want !== got) throw new Error(`vector layer "${layer.name}": columns [${got}] do not match the schema [${want}]`);
  const out: VectorFeature<S>[] = [];
  for (let i = 0; i < layer.geometry.length; i++) {
    const row: Record<string, unknown> = { parts: layer.geometry[i] };
    for (const col of layer.columns) row[col.name] = col.data[i];
    out.push(row as VectorFeature<S>);
  }
  return out;
}

function findLayer(layers: readonly VectorLayer[], name: string, geom: VectorGeomKind): VectorLayer {
  const layer = layers.find((l) => l.name === name);
  if (layer === undefined) throw new Error(`vector bundle: missing layer "${name}" (has: ${layers.map((l) => l.name).join(', ')})`);
  if (layer.geom !== geom) throw new Error(`vector bundle: layer "${name}" is ${layer.geom}, expected ${geom}`);
  return layer;
}

// net/rail ----------------------------------------------------------------------------------------

/** Quantization of track and station coordinates. */
export const RAIL_TRACK_QUANT_M = 0.25;
/** Quantization of route polylines, which are simplified copies of the track geometry. */
export const RAIL_ROUTE_QUANT_M = 1;

/** OSM ways with railway = rail | subway | light_rail | tram that have a vertex inside the grid. Line, one part. */
export const RAIL_TRACK_SCHEMA = {
  /** OSM way id: the stable id for scenarios. */
  osmId: 'uint',
  /** rail | subway | light_rail | tram */
  cls: 'str',
  /** Way name, usually the line or subdivision ("Peninsula Subdivision", "BART M-Line"). */
  name: 'str',
  operator: 'str',
  /** Systems of the route relations that run over this way, sorted, joined by ";" (see RailSystem). */
  systems: 'str',
  /** OSM service tag: '' for running lines, else siding | yard | spur | crossover. */
  service: 'str',
  /** OSM usage tag: main | branch | industrial | tourism | ... or ''. */
  usage: 'str',
  tunnel: 'uint',
  bridge: 'uint',
  /** OSM layer tag: stacking order only, not depth. */
  layer: 'int',
  /** OSM electrified tag: contact_line | rail | no | yes | ... or '' when untagged. */
  electrified: 'str',
  voltage: 'uint',
  /** Track gauge in millimetres; 0 when untagged. */
  gaugeMm: 'uint',
  /** Speed limit in km/h, rounded; 0 when untagged. */
  maxspeedKph: 'uint',
} as const satisfies VectorSchema;

/** OSM nodes and ways with railway = station | halt | tram_stop inside the grid. Point. */
export const RAIL_STATION_SCHEMA = {
  osmId: 'uint',
  /** node | way (ways are placed at the centre of their bounding box). */
  osmType: 'str',
  /** station | halt | tram_stop */
  kind: 'str',
  name: 'str',
  network: 'str',
  operator: 'str',
  /** Systems derived from network and operator, sorted, joined by ";". */
  systems: 'str',
} as const satisfies VectorSchema;

/**
 * OSM route relations (route = train | subway | light_rail | tram | monorail) with at least one member
 * way among the tracks. Line; parts are the member ways chained in relation order, simplified. A
 * well-ordered route inside the grid has one part; more parts mean gaps or unordered members.
 */
export const RAIL_ROUTE_SCHEMA = {
  osmId: 'uint',
  /** See RailSystem. */
  system: 'str',
  /** OSM route value. */
  mode: 'str',
  network: 'str',
  operator: 'str',
  ref: 'str',
  name: 'str',
  from: 'str',
  to: 'str',
  /** OSM colour tag, for example "#E31837", or ''. */
  colour: 'str',
  /** OSM id of the route_master relation that groups this route, or 0. */
  masterId: 'uint',
  /** Member ways of the relation. */
  memberWays: 'uint',
  /** Member ways present among the tracks (the rest lie outside the grid or are not one of the four classes). */
  usedWays: 'uint',
  /** Index of this route's first row in routeStops. */
  stopStart: 'uint',
  stopCount: 'uint',
} as const satisfies VectorSchema;

/** Stops of all routes in route order (stop member nodes of the relation that lie inside the grid). Point. */
export const RAIL_ROUTE_STOP_SCHEMA = {
  /** Index into routes. */
  route: 'uint',
  /** Stop node name, else the name of the nearest station within 300 m, else ''. */
  name: 'str',
  /** Index into stations of the nearest station within 300 m, plus 1; 0 when there is none. */
  stationPlus1: 'uint',
} as const satisfies VectorSchema;

export type RailSystem = 'Caltrain' | 'BART' | 'Muni' | 'VTA' | 'SMART' | 'ACE' | 'Capitol Corridor' | 'Amtrak' | 'other';

export type RailTrack = VectorFeature<typeof RAIL_TRACK_SCHEMA>;
export type RailStation = VectorFeature<typeof RAIL_STATION_SCHEMA>;
export type RailRoute = VectorFeature<typeof RAIL_ROUTE_SCHEMA>;
export type RailRouteStop = VectorFeature<typeof RAIL_ROUTE_STOP_SCHEMA>;

export interface RailNetwork {
  tracks: RailTrack[];
  stations: RailStation[];
  routes: RailRoute[];
  routeStops: RailRouteStop[];
}

export function encodeRailNetwork(net: RailNetwork): Uint8Array {
  return encodeVectorBundle([
    featuresToLayer('tracks', 'line', RAIL_TRACK_QUANT_M, RAIL_TRACK_SCHEMA, net.tracks),
    featuresToLayer('stations', 'point', RAIL_TRACK_QUANT_M, RAIL_STATION_SCHEMA, net.stations),
    featuresToLayer('routes', 'line', RAIL_ROUTE_QUANT_M, RAIL_ROUTE_SCHEMA, net.routes),
    featuresToLayer('routeStops', 'point', RAIL_TRACK_QUANT_M, RAIL_ROUTE_STOP_SCHEMA, net.routeStops),
  ]);
}

/** Decode inflated net/rail bytes. */
export function decodeRailNetwork(bundle: Uint8Array): RailNetwork {
  const layers = decodeVectorBundle(bundle);
  return {
    tracks: layerToFeatures(findLayer(layers, 'tracks', 'line'), RAIL_TRACK_SCHEMA),
    stations: layerToFeatures(findLayer(layers, 'stations', 'point'), RAIL_STATION_SCHEMA),
    routes: layerToFeatures(findLayer(layers, 'routes', 'line'), RAIL_ROUTE_SCHEMA),
    routeStops: layerToFeatures(findLayer(layers, 'routeStops', 'point'), RAIL_ROUTE_STOP_SCHEMA),
  };
}

// sites/<siteId>/<tx>_<ty>.vectors ---------------------------------------------------------------

/** Quantization of all site tile layers (doc 04 section 9.4). */
export const SITE_VECTOR_QUANT_M = 0.25;

/** Overture buildings. Polygon. Also the schema of buildingParts (Overture building_part). */
export const SITE_BUILDING_SCHEMA = {
  /** Roof height above ground in decimetres, after the fallback chain; never 0. */
  heightDm: 'uint',
  /** Where heightDm came from: height | floors (num_floors x 3 m) | default (class default). */
  heightSrc: 'str',
  /** Height of the underside above ground in decimetres (bridging parts, podium setbacks); usually 0. */
  minHeightDm: 'uint',
  /** Overture num_floors, 0 when absent. */
  floors: 'uint',
  /** Overture subtype (residential, commercial, ...) or ''. */
  subtype: 'str',
  /** Overture class (house, office, ...) or ''. */
  cls: 'str',
  /** Primary name, kept for landmarks only: height >= 40 m, footprint >= 3,000 m2, or a civic subtype. */
  name: 'str',
  /** 1 when buildingParts carry the real massing of this building; then skip this outline. */
  hasParts: 'uint',
  /** Overture feature id hashed to 32 bits (FNV-1a): groups the polygons of one multipolygon. */
  idHash: 'uint',
} as const satisfies VectorSchema;

/** OSM highway ways, clipped to the tile. Line. */
export const SITE_ROAD_SCHEMA = {
  osmId: 'uint',
  /** OSM highway value: motorway .. service, pedestrian, and the _link variants. */
  cls: 'str',
  name: 'str',
  /** Carriageway width estimate in decimetres. */
  widthDm: 'uint',
  /** Where widthDm came from: width (OSM tag) | lanes (lanes x 3.3 m) | class (class default). */
  widthSrc: 'str',
  lanes: 'uint',
  oneway: 'uint',
  bridge: 'uint',
  tunnel: 'uint',
  layer: 'int',
} as const satisfies VectorSchema;

/** Overture base/water polygons without swimming pools and fountains, clipped to the tile. Polygon. */
export const SITE_WATER_SCHEMA = {
  /** Overture subtype: ocean (includes San Francisco Bay) | lake | reservoir | river | ... */
  subtype: 'str',
  cls: 'str',
  name: 'str',
} as const satisfies VectorSchema;

/** Overture base/land_use polygons, clipped to the tile. Polygon. */
export const SITE_LANDUSE_SCHEMA = {
  /** Overture subtype: park | recreation | residential | developed | ... */
  subtype: 'str',
  cls: 'str',
  name: 'str',
} as const satisfies VectorSchema;

export type SiteBuilding = VectorFeature<typeof SITE_BUILDING_SCHEMA>;
export type SiteRoad = VectorFeature<typeof SITE_ROAD_SCHEMA>;
export type SiteWater = VectorFeature<typeof SITE_WATER_SCHEMA>;
export type SiteLanduse = VectorFeature<typeof SITE_LANDUSE_SCHEMA>;

export interface SiteVectorTile {
  buildings: SiteBuilding[];
  buildingParts: SiteBuilding[];
  roads: SiteRoad[];
  water: SiteWater[];
  landuse: SiteLanduse[];
}

export function encodeSiteVectorTile(tile: SiteVectorTile): Uint8Array {
  const q = SITE_VECTOR_QUANT_M;
  return encodeVectorBundle([
    featuresToLayer('buildings', 'polygon', q, SITE_BUILDING_SCHEMA, tile.buildings),
    featuresToLayer('buildingParts', 'polygon', q, SITE_BUILDING_SCHEMA, tile.buildingParts),
    featuresToLayer('roads', 'line', q, SITE_ROAD_SCHEMA, tile.roads),
    featuresToLayer('water', 'polygon', q, SITE_WATER_SCHEMA, tile.water),
    featuresToLayer('landuse', 'polygon', q, SITE_LANDUSE_SCHEMA, tile.landuse),
  ]);
}

/** Decode inflated site vector tile bytes. */
export function decodeSiteVectorTile(bundle: Uint8Array): SiteVectorTile {
  const layers = decodeVectorBundle(bundle);
  return {
    buildings: layerToFeatures(findLayer(layers, 'buildings', 'polygon'), SITE_BUILDING_SCHEMA),
    buildingParts: layerToFeatures(findLayer(layers, 'buildingParts', 'polygon'), SITE_BUILDING_SCHEMA),
    roads: layerToFeatures(findLayer(layers, 'roads', 'line'), SITE_ROAD_SCHEMA),
    water: layerToFeatures(findLayer(layers, 'water', 'polygon'), SITE_WATER_SCHEMA),
    landuse: layerToFeatures(findLayer(layers, 'landuse', 'polygon'), SITE_LANDUSE_SCHEMA),
  };
}

// net/far -----------------------------------------------------------------------------------------

/** Quantization of the far layers. */
export const FAR_VECTOR_QUANT_M = 2;

/** Overture ocean (with the Bay) and inland water of at least 0.1 km2, clipped to the grid, simplified. Polygon. */
export const FAR_WATER_SCHEMA = {
  subtype: 'str',
  name: 'str',
} as const satisfies VectorSchema;

/** OSM motorway and trunk ways (no links) clipped to the grid, simplified. Line. */
export const FAR_HIGHWAY_SCHEMA = {
  osmId: 'uint',
  /** motorway | trunk */
  cls: 'str',
  /** Route number, for example "I 80" or "US 101;CA 1". */
  ref: 'str',
  name: 'str',
  bridge: 'uint',
  tunnel: 'uint',
  /** One of the five Bay crossings (FAR_BRIDGES) when this way is a bridge span of it, else ''. */
  crossing: 'str',
} as const satisfies VectorSchema;

/** Named places: OSM city and town nodes plus the curated anchors of research doc 05 section 5. Point. */
export const FAR_PLACE_SCHEMA = {
  /** city | town | campus | airport | station | landmark */
  kind: 'str',
  name: 'str',
  /** OSM population tag for cities and towns, else 0. */
  population: 'uint',
} as const satisfies VectorSchema;

export const FAR_BRIDGES = [
  'Bay Bridge',
  'Golden Gate Bridge',
  'San Mateo Bridge',
  'Dumbarton Bridge',
  'Richmond-San Rafael Bridge',
] as const;

export type FarWater = VectorFeature<typeof FAR_WATER_SCHEMA>;
export type FarHighway = VectorFeature<typeof FAR_HIGHWAY_SCHEMA>;
export type FarPlace = VectorFeature<typeof FAR_PLACE_SCHEMA>;

export interface FarVectors {
  water: FarWater[];
  highways: FarHighway[];
  places: FarPlace[];
}

export function encodeFarVectors(far: FarVectors): Uint8Array {
  const q = FAR_VECTOR_QUANT_M;
  return encodeVectorBundle([
    featuresToLayer('water', 'polygon', q, FAR_WATER_SCHEMA, far.water),
    featuresToLayer('highways', 'line', q, FAR_HIGHWAY_SCHEMA, far.highways),
    featuresToLayer('places', 'point', q, FAR_PLACE_SCHEMA, far.places),
  ]);
}

/** Decode inflated net/far bytes. */
export function decodeFarVectors(bundle: Uint8Array): FarVectors {
  const layers = decodeVectorBundle(bundle);
  return {
    water: layerToFeatures(findLayer(layers, 'water', 'polygon'), FAR_WATER_SCHEMA),
    highways: layerToFeatures(findLayer(layers, 'highways', 'line'), FAR_HIGHWAY_SCHEMA),
    places: layerToFeatures(findLayer(layers, 'places', 'point'), FAR_PLACE_SCHEMA),
  };
}

// data/manifest.vectors.json ----------------------------------------------------------------------

export interface VectorAssetRef {
  /** Path relative to data/. */
  file: string;
  /** Size as served (compressed). */
  bytes: number;
  /** Size of the inflated bundle. */
  rawBytes: number;
  /** Lower-case hex sha256 of the file as served. */
  sha256: string;
  /** Feature count per layer. */
  counts: Record<string, number>;
}

export interface VectorSiteTile extends VectorAssetRef {
  /** Site tile index on the 2,048 m grid: tx = floor(x / 2048), ty = floor(-z / 2048). */
  tx: number;
  ty: number;
}

export interface VectorSite {
  id: string;
  title: string;
  /** Site centre in WGS84 degrees, from packages/pipeline/sites.json. */
  center: { lat: number; lon: number };
  /** Edge of the requested square in metres. */
  sizeM: number;
  /** World metres covered by the tiles: [minX, minZ, maxX, maxZ]. */
  bbox: [number, number, number, number];
  tiles: VectorSiteTile[];
  /** Feature count per layer over all tiles. */
  counts: Record<string, number>;
}

export interface VectorRailStats {
  /** Total track length in kilometres (grid metres), all classes, sidings and yards included. */
  trackKm: number;
  /** Per class, plus "<class>:running" for tracks without a service tag. */
  trackKmByClass: Record<string, number>;
  /** Tracks whose OSM way reached beyond the node selection box and was cut short there. */
  truncatedTracks: number;
  routesBySystem: Record<string, number>;
  /** Routes whose member ways chained into one polyline. */
  singlePartRoutes: number;
  stationsBySystem: Record<string, number>;
}

export interface VectorManifest {
  format: 'bayvox-vectors';
  formatVersion: number;
  frame: { crs: string; originEasting: number; originNorthing: number; siteTileSizeM: number };
  sources: {
    osm: { provider: string; url: string; snapshot: string; snapshotDate: string; bytes: number; md5: string; license: string };
    overture: { release: string; types: string[]; license: string };
    curated: { file: string; note: string };
  };
  net: {
    rail: VectorAssetRef & VectorRailStats;
    far: VectorAssetRef & { crossingKm: Record<string, number> };
  };
  sites: VectorSite[];
}
