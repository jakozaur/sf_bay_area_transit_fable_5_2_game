import { describe, expect, test } from 'vitest';
import { crossingOf } from './far.ts';
import { lineLength, mortonKey, simplifyLine, snapPart, utmToWorldFlat } from './geom.ts';
import { lonLatEnvelope } from './overture.ts';
import { chainWays, maxspeedKph, railSystems, routeSystem } from './rail.ts';
import { buildingHeight, parseWidthM, roadWidth } from './site-tiles.ts';
import { parseWkb } from './wkb.ts';

/** Little-endian WKB writer for the test fixtures. */
function wkb(...items: (number | number[])[]): Uint8Array {
  const bytes: number[] = [];
  const view = new DataView(new ArrayBuffer(8));
  for (const item of items) {
    if (Array.isArray(item)) {
      for (const v of item) {
        view.setFloat64(0, v, true);
        for (let i = 0; i < 8; i++) bytes.push(view.getUint8(i));
      }
    } else if (item < 0) {
      bytes.push(1); // byte order marker
    } else {
      view.setUint32(0, item, true);
      for (let i = 0; i < 4; i++) bytes.push(view.getUint8(i));
    }
  }
  return Uint8Array.from(bytes);
}
const LE = -1;

describe('wkb', () => {
  test('reads points, lines, polygons with holes, and nested collections', () => {
    const polygon = [LE, 3, 2, 4, [0, 0, 4, 0, 4, 4, 0, 0], 4, [1, 1, 2, 1, 2, 2, 1, 1]];
    const shapes = parseWkb(wkb(LE, 7, 3, LE, 1, [5, 6], LE, 5, 1, LE, 2, 2, [0, 0, 1, 1], LE, 6, 1, ...polygon));
    expect(shapes.points).toEqual([5, 6]);
    expect(shapes.lines).toEqual([new Float64Array([0, 0, 1, 1])]);
    expect(shapes.polygons).toEqual([[new Float64Array([0, 0, 4, 0, 4, 4, 0, 0]), new Float64Array([1, 1, 2, 1, 2, 2, 1, 1])]]);
  });

  test('fails loudly on truncation, trailing bytes and unsupported types', () => {
    const line = wkb(LE, 2, 2, [0, 0, 1, 1]);
    expect(() => parseWkb(line.subarray(0, line.length - 1))).toThrow(/truncated/);
    expect(() => parseWkb(Uint8Array.from([...line, 0]))).toThrow(/trailing/);
    expect(() => parseWkb(wkb(LE, 1001, [0, 0, 0]))).toThrow(/unsupported geometry type 1001/);
  });
});

describe('geometry helpers', () => {
  test('utmToWorldFlat matches the core frame: x east from the origin, z south', () => {
    expect(utmToWorldFlat(new Float64Array([553304.855, 4181190.191]))).toEqual(
      new Float64Array([553304.855 - 532480, 4116480 - 4181190.191]),
    );
  });

  test('snapPart rounds to the lattice, drops repeats and the ring closure, rejects degenerate parts', () => {
    expect(snapPart(new Float64Array([0.1, -0.1, 0.12, 0.11, 1.3, -2.4]), 0.25, false)).toEqual(new Float64Array([0, 0, 1.25, -2.5]));
    expect(snapPart(new Float64Array([0, 0, 4, 0, 4, 4, 0, 0]), 0.25, true)).toEqual(new Float64Array([0, 0, 4, 0, 4, 4]));
    expect(snapPart(new Float64Array([0, 0, 0.1, 0.1]), 0.25, false)).toBeUndefined();
    expect(snapPart(new Float64Array([0, 0, 4, 0, 0, 0]), 0.25, true)).toBeUndefined();
  });

  test('simplifyLine keeps the ends and every point farther than the tolerance', () => {
    const line = new Float64Array([0, 0, 10, 0.4, 20, 0, 30, 5, 40, 0]);
    expect(simplifyLine(line, 1)).toEqual(new Float64Array([0, 0, 20, 0, 30, 5, 40, 0]));
    expect(simplifyLine(line, 10)).toEqual(new Float64Array([0, 0, 40, 0]));
    expect(lineLength(new Float64Array([0, 0, 3, 4, 3, 14]))).toBe(15);
  });

  test('mortonKey orders by cell and stays a non-negative safe integer at the grid corners', () => {
    expect(mortonKey(0, 0)).toBe(0);
    expect(mortonKey(8, 0)).toBe(1);
    expect(mortonKey(0, -8)).toBe(2);
    expect(mortonKey(81919, -98303)).toBeGreaterThan(mortonKey(81919, -8));
    expect(Number.isSafeInteger(mortonKey(81919, -98303))).toBe(true);
  });

  test('lonLatEnvelope contains the rectangle and rounds outward', () => {
    const box = lonLatEnvelope([18432, -67584, 24576, -61440], 0);
    expect(box.west).toBeLessThan(-122.42);
    expect(box.east).toBeGreaterThan(-122.36);
    expect(box.south).toBeLessThan(37.75);
    expect(box.north).toBeGreaterThan(37.8);
    expect(box.north - box.south).toBeLessThan(0.06);
  });
});

describe('rail helpers', () => {
  const way = (nids: number[]): { nids: number[]; points: Float64Array } => ({
    nids,
    points: Float64Array.from(nids.flatMap((n) => [n * 10, -n])),
  });
  const ids = (part: Float64Array): number[] =>
    Array.from(
      part.filter((_, i) => i % 2 === 0),
      (x) => x / 10,
    );

  test('chainWays orients ways, including a first way laid backwards', () => {
    expect(chainWays([way([3, 2, 1]), way([3, 4]), way([6, 5, 4])]).map(ids)).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  test('chainWays repairs a run of members listed in reverse', () => {
    expect(chainWays([way([1, 2]), way([4, 5]), way([3, 4]), way([2, 3]), way([5, 6])]).map(ids)).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  test('chainWays starts a new part at a real gap', () => {
    expect(chainWays([way([1, 2]), way([2, 3]), way([7, 8]), way([9, 8])]).map(ids)).toEqual([
      [1, 2, 3],
      [7, 8, 9],
    ]);
    expect(chainWays([])).toEqual([]);
  });

  test('systems come from network and operator before names', () => {
    expect(routeSystem('Caltrain', 'TransitAmerica Services', '1XX', 'Local')).toBe('Caltrain');
    expect(routeSystem('Amtrak', 'Amtrak California', 'Capitol Corridor', 'Amtrak Capitol Corridor: Auburn => San José')).toBe(
      'Capitol Corridor',
    );
    expect(routeSystem('Muni', 'San Francisco Municipal Transportation Agency', 'N', 'Muni Metro N inbound: Ocean Beach => Caltrain')).toBe(
      'Muni',
    );
    expect(routeSystem('ACE', 'San Joaquin Regional Rail Commission', 'ACE', '')).toBe('ACE');
    expect(routeSystem('', 'Pacific Locomotive Association', 'NCR', 'Niles Canyon Railway')).toBe('other');
    expect(railSystems('Amtrak;Caltrain;ACE').sort()).toEqual(['ACE', 'Amtrak', 'Caltrain']);
    expect(railSystems('Spacecraft terrace')).toEqual([]);
  });

  test('maxspeedKph converts mph and rejects junk', () => {
    expect(maxspeedKph('79 mph')).toBe(127);
    expect(maxspeedKph('80')).toBe(80);
    expect(maxspeedKph('signals')).toBe(0);
    expect(maxspeedKph('')).toBe(0);
  });
});

describe('site helpers', () => {
  test('building height falls back from height to floors to class to subtype to the default', () => {
    expect(buildingHeight(326, 61, 'office', 'commercial')).toEqual({ heightDm: 3260, heightSrc: 'height' });
    expect(buildingHeight(undefined, 5, 'office', 'commercial')).toEqual({ heightDm: 150, heightSrc: 'floors' });
    expect(buildingHeight(0, undefined, 'garage', 'residential')).toEqual({ heightDm: 30, heightSrc: 'default' });
    expect(buildingHeight(undefined, undefined, 'unheard_of', 'medical')).toEqual({ heightDm: 100, heightSrc: 'default' });
    expect(buildingHeight(undefined, 0, '', '')).toEqual({ heightDm: 60, heightSrc: 'default' });
  });

  test('road width falls back from the width tag to lanes to the class default', () => {
    expect(parseWidthM('5.75')).toBe(5.75);
    expect(parseWidthM('12 m')).toBe(12);
    expect(parseWidthM('21\'4"')).toBeCloseTo(6.502, 3);
    expect(parseWidthM('wide')).toBeUndefined();
    expect(roadWidth('8', 4, 'primary')).toEqual({ widthDm: 80, widthSrc: 'width' });
    expect(roadWidth('wide', 4, 'primary')).toEqual({ widthDm: 132, widthSrc: 'lanes' });
    expect(roadWidth('', 0, 'residential')).toEqual({ widthDm: 80, widthSrc: 'class' });
    expect(roadWidth('0.5', 0, 'service')).toEqual({ widthDm: 20, widthSrc: 'width' });
    expect(() => roadWidth('', 0, 'footway')).toThrow(/no default width/);
  });

  test('crossingOf recognises the five Bay crossings from OSM names', () => {
    expect(crossingOf('Dwight D. Eisenhower Highway', 'San Francisco–Oakland Bay Bridge')).toBe('Bay Bridge');
    expect(crossingOf('Golden Gate Bridge', 'Golden Gate Bridge')).toBe('Golden Gate Bridge');
    expect(crossingOf('San Mateo - Hayward Bridge', '')).toBe('San Mateo Bridge');
    expect(crossingOf('Dumbarton Bridge', '')).toBe('Dumbarton Bridge');
    expect(crossingOf('Richmond-San Rafael Bridge', '')).toBe('Richmond-San Rafael Bridge');
    expect(crossingOf('Carquinez Bridge', '')).toBe('');
  });
});
