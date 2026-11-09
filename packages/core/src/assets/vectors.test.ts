import { describe, expect, test } from 'vitest';
import { createRng, nextFloat, nextInt } from '../prng.ts';
import {
  decodeFarVectors,
  decodeRailNetwork,
  decodeSiteVectorTile,
  decodeVectorBundle,
  deflateVectorAsset,
  encodeFarVectors,
  encodeRailNetwork,
  encodeSiteVectorTile,
  encodeVectorBundle,
  type FarVectors,
  featuresToLayer,
  inflateVectorAsset,
  layerToFeatures,
  type RailNetwork,
  type SiteBuilding,
  type SiteVectorTile,
  type VectorLayer,
} from './vectors.ts';

/** Coordinates on the quantization lattice, so a round trip is exact. */
function lattice(rng: Uint32Array, quantM: number, points: number): Float64Array {
  const out = new Float64Array(points * 2);
  for (let i = 0; i < points; i++) {
    out[i * 2] = nextInt(rng, 320_000) * quantM;
    out[i * 2 + 1] = -nextInt(rng, 390_000) * quantM;
  }
  return out;
}

function randomLayer(rng: Uint32Array, name: string, geom: VectorLayer['geom'], quantM: number, count: number): VectorLayer {
  const words = ['', 'rail', 'subway', 'Café Zoë', '東湾', 'x'.repeat(300)];
  const geometry: Float64Array[][] = [];
  const ids: number[] = [];
  const deltas: number[] = [];
  const names: string[] = [];
  for (let f = 0; f < count; f++) {
    const parts: Float64Array[] = [];
    const partCount = geom === 'point' ? 1 : nextInt(rng, 3) + (geom === 'polygon' ? 1 : 0);
    for (let p = 0; p < partCount; p++) parts.push(lattice(rng, quantM, geom === 'point' ? 1 : nextInt(rng, 40)));
    geometry.push(parts);
    ids.push(f % 7 === 0 ? Number.MAX_SAFE_INTEGER - f : nextInt(rng, 2 ** 31) * 8 + f);
    deltas.push(nextInt(rng, 2001) - 1000);
    names.push(words[nextInt(rng, words.length)] as string);
  }
  return {
    name,
    geom,
    quantM,
    columns: [
      { name: 'id', type: 'uint', data: ids },
      { name: 'delta', type: 'int', data: deltas },
      { name: 'name', type: 'str', data: names },
    ],
    geometry,
  };
}

describe('vector bundle', () => {
  test('round-trips points, lines and polygons with all column types exactly', () => {
    const rng = createRng(20261109);
    const layers = [
      randomLayer(rng, 'pts', 'point', 0.25, 500),
      randomLayer(rng, 'lines', 'line', 1, 300),
      randomLayer(rng, 'polys', 'polygon', 2, 200),
      randomLayer(rng, 'empty', 'line', 0.25, 0),
    ];
    const bytes = encodeVectorBundle(layers);
    expect(decodeVectorBundle(bytes)).toEqual(layers);
    expect(encodeVectorBundle(decodeVectorBundle(bytes))).toEqual(bytes);
  });

  test('quantization error is at most half a step', () => {
    const rng = createRng(7);
    const part = new Float64Array(2000);
    for (let i = 0; i < part.length; i += 2) {
      part[i] = nextFloat(rng) * 81_920;
      part[i + 1] = -nextFloat(rng) * 98_304;
    }
    for (const quantM of [0.25, 1, 2]) {
      const [layer] = decodeVectorBundle(encodeVectorBundle([{ name: 'l', geom: 'line', quantM, columns: [], geometry: [[part]] }]));
      const back = layer?.geometry[0]?.[0] as Float64Array;
      let worst = 0;
      for (let i = 0; i < part.length; i++) worst = Math.max(worst, Math.abs((back[i] as number) - (part[i] as number)));
      expect(worst).toBeLessThanOrEqual(quantM / 2);
      expect(worst).toBeGreaterThan(quantM / 4);
    }
  });

  test('inflate reverses deflate, and a corrupt stream rejects', async () => {
    const bundle = encodeVectorBundle([randomLayer(createRng(3), 'lines', 'line', 0.25, 400)]);
    const packed = await deflateVectorAsset(bundle);
    expect(packed.length).toBeLessThan(bundle.length);
    expect(packed[0]).toBe(0x78);
    expect(await inflateVectorAsset(packed)).toEqual(bundle);
    const corrupt = packed.slice();
    corrupt[10] = (corrupt[10] as number) ^ 0xff;
    corrupt[11] = (corrupt[11] as number) ^ 0xff;
    await expect(inflateVectorAsset(corrupt)).rejects.toThrow();
  });

  test('fails loudly on bad magic, truncation, trailing bytes and bad input', () => {
    const bytes = encodeVectorBundle([randomLayer(createRng(5), 'pts', 'point', 0.25, 20)]);
    const bad = bytes.slice();
    bad[0] = 0x58;
    expect(() => decodeVectorBundle(bad)).toThrow(/bad magic/);
    expect(() => decodeVectorBundle(bytes.subarray(0, bytes.length - 3))).toThrow(/truncated/);
    const longer = new Uint8Array(bytes.length + 2);
    longer.set(bytes);
    expect(() => decodeVectorBundle(longer)).toThrow(/trailing/);
    const col = { name: 'id', type: 'uint' as const, data: [1.5] };
    expect(() => encodeVectorBundle([{ name: 'l', geom: 'point', quantM: 1, columns: [col], geometry: [[new Float64Array(2)]] }])).toThrow(
      /varint/,
    );
    expect(() => encodeVectorBundle([{ name: 'l', geom: 'point', quantM: 1, columns: [], geometry: [[new Float64Array(4)]] }])).toThrow(
      /one point/,
    );
    expect(() => encodeVectorBundle([{ name: 'l', geom: 'line', quantM: 0.1234567, columns: [], geometry: [] }])).toThrow(/micrometres/);
  });

  test('typed rows reject a schema mismatch', () => {
    const schema = { id: 'uint', name: 'str' } as const;
    const layer = featuresToLayer('t', 'point', 1, schema, [{ id: 4, name: 'a', parts: [new Float64Array([1, -2])] }]);
    expect(layerToFeatures(layer, schema)).toEqual([{ id: 4, name: 'a', parts: [new Float64Array([1, -2])] }]);
    expect(() => layerToFeatures(layer, { id: 'uint', title: 'str' } as const)).toThrow(/do not match the schema/);
    const wrong = [{ id: 'x' as unknown as number, name: 'a', parts: [new Float64Array(2)] }];
    expect(() => featuresToLayer('t', 'point', 1, schema, wrong)).toThrow(/attribute "id"/);
  });
});

const building = (heightDm: number, name: string, parts: Float64Array[]): SiteBuilding => ({
  heightDm,
  heightSrc: 'height',
  minHeightDm: 0,
  floors: 61,
  subtype: 'commercial',
  cls: 'office',
  name,
  hasParts: 0,
  idHash: 0xdeadbeef,
  parts,
});

describe('typed vector assets', () => {
  test('rail network round-trips', () => {
    const net: RailNetwork = {
      tracks: [
        {
          osmId: 1_234_567_890_123,
          cls: 'rail',
          name: 'Peninsula Subdivision',
          operator: 'Caltrain',
          systems: 'Caltrain',
          service: '',
          usage: 'main',
          tunnel: 1,
          bridge: 0,
          layer: -1,
          electrified: 'contact_line',
          voltage: 25000,
          gaugeMm: 1435,
          maxspeedKph: 127,
          parts: [new Float64Array([20824.75, -64710.25, 20830, -64800.5])],
        },
      ],
      stations: [
        {
          osmId: 5,
          osmType: 'node',
          kind: 'station',
          name: 'San Francisco',
          network: 'Caltrain',
          operator: '',
          systems: 'Caltrain',
          parts: [new Float64Array([20824.75, -64710.25])],
        },
      ],
      routes: [
        {
          osmId: 9,
          system: 'Caltrain',
          mode: 'train',
          network: 'Caltrain',
          operator: 'Caltrain',
          ref: '1XX',
          name: 'Local',
          from: 'San Francisco',
          to: 'San Jose Diridon',
          colour: '#E31837',
          masterId: 0,
          memberWays: 2,
          usedWays: 1,
          stopStart: 0,
          stopCount: 1,
          parts: [new Float64Array([20825, -64710, 20830, -64800])],
        },
      ],
      routeStops: [{ route: 0, name: 'San Francisco', stationPlus1: 1, parts: [new Float64Array([20824.75, -64710.25])] }],
    };
    expect(decodeRailNetwork(encodeRailNetwork(net))).toEqual(net);
  });

  test('site tile round-trips, including holes and empty layers', () => {
    const outer = new Float64Array([20683.25, -66173.75, 20740, -66173.75, 20740, -66120, 20683.25, -66120]);
    const hole = new Float64Array([20700, -66160, 20710, -66160, 20710, -66150]);
    const tile: SiteVectorTile = {
      buildings: [building(3260, 'Salesforce Tower', [outer, hole]), building(60, '', [outer])],
      buildingParts: [],
      roads: [
        {
          osmId: 77,
          cls: 'residential',
          name: 'Natoma Street',
          widthDm: 80,
          widthSrc: 'class',
          lanes: 0,
          oneway: 1,
          bridge: 0,
          tunnel: 0,
          layer: 0,
          parts: [new Float64Array([20600, -66100.5, 20650.25, -66140])],
        },
      ],
      water: [{ subtype: 'ocean', cls: 'ocean', name: '', parts: [outer] }],
      landuse: [{ subtype: 'park', cls: 'park', name: 'Salesforce Park', parts: [outer] }],
    };
    expect(decodeSiteVectorTile(encodeSiteVectorTile(tile))).toEqual(tile);
  });

  test('far layers round-trip, and a rail file is rejected as a far file', () => {
    const far: FarVectors = {
      water: [{ subtype: 'ocean', name: '', parts: [new Float64Array([0, 0, 81920, 0, 81920, -98304])] }],
      highways: [
        {
          osmId: 3,
          cls: 'motorway',
          ref: 'I 80',
          name: 'San Francisco-Oakland Bay Bridge',
          bridge: 1,
          tunnel: 0,
          crossing: 'Bay Bridge',
          parts: [new Float64Array([22000, -67000, 30000, -70000])],
        },
      ],
      places: [{ kind: 'campus', name: 'Googleplex', population: 0, parts: [new Float64Array([48000, -25000])] }],
    };
    expect(decodeFarVectors(encodeFarVectors(far))).toEqual(far);
    const rail = encodeRailNetwork({ tracks: [], stations: [], routes: [], routeStops: [] });
    expect(() => decodeFarVectors(rail)).toThrow(/missing layer "water"/);
  });
});
