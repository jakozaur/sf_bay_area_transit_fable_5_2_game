import type { Mesh } from 'three';
import type { Line2 } from 'three/addons/lines/Line2.js';
import { expect, test } from 'vitest';
import { LAYER_OVERLAY } from './chunk-scene.ts';
import { OverlayLayer } from './overlay.ts';

// 4th and King and Salesforce Transit Center in world metres (core frame tests).
const KING = { x: 20824.855, y: 4, z: -64710.191 };
const SALESFORCE = { x: 20683.302, y: -18, z: -66173.871 };

test('polyline vertices are stored relative to the first point; the object carries the offset to the origin', () => {
  const o = new OverlayLayer();
  o.setOrigin(650, 0, -2022);
  o.setPolyline('dtx', [KING, { x: 20700, y: -20, z: -65400 }, SALESFORCE], { color: 0xff5722, xray: true });
  const line = o.group.children[0] as Line2;
  const start = line.geometry.getAttribute('instanceStart');
  // Second segment ends at SALESFORCE - KING: small numbers, float32 exact to well under a millimetre.
  const end = line.geometry.getAttribute('instanceEnd');
  expect(start.getX(0)).toBe(0);
  expect(end.getX(1)).toBeCloseTo(SALESFORCE.x - KING.x, 3);
  expect(end.getY(1)).toBeCloseTo(-22, 4);
  expect(end.getZ(1)).toBeCloseTo(SALESFORCE.z - KING.z, 3);
  expect(line.position.x).toBeCloseTo(KING.x - 650 * 32, 9);
  expect(line.position.z).toBeCloseTo(KING.z + 2022 * 32, 9);
  expect(line.layers.mask).toBe(1 << LAYER_OVERLAY);
  expect(line.material.depthTest).toBe(false);
  o.setOrigin(640, 0, -2030);
  expect(line.position.x).toBeCloseTo(KING.x - 640 * 32, 9);
  expect(() => o.setPolyline('bad', [KING], { color: 0 })).toThrow(/at least 2 points/);
  expect(() => o.setPolyline('nan', [KING, { x: Number.NaN, y: 0, z: 0 }], { color: 0 })).toThrow(/point 1 is not finite/);
});

test('markers keep a minimum on-screen size, shapes follow setPose, ids replace and remove', () => {
  const o = new OverlayLayer();
  o.setMarker('station', KING, { color: 0x1565c0, sizeM: 12, minPx: 30 });
  const marker = o.group.children[0];
  if (marker === undefined) throw new Error('marker missing');
  expect(marker.scale.x).toBe(12);
  // 1000 px per radian: at 10 km the 30 px minimum is 300 m; at 100 m the pin keeps its real 12 m.
  o.updateMarkers({ x: KING.x, y: KING.y, z: KING.z + 10_000 }, 1000);
  expect(marker.scale.x).toBeCloseTo(300, 9);
  o.updateMarkers({ x: KING.x, y: KING.y, z: KING.z + 100 }, 1000);
  expect(marker.scale.x).toBe(12);

  o.setShape('tbm', { kind: 'cylinder', radius: 4, length: 12, color: 0xffc107 }, { position: SALESFORCE, yaw: 0.5 });
  const tbm = o.group.children[1] as Mesh;
  expect(tbm.rotation.y).toBe(0.5);
  expect(tbm.position.toArray()).toEqual([SALESFORCE.x, SALESFORCE.y, SALESFORCE.z]);
  o.setPose('tbm', { position: KING });
  expect(tbm.position.toArray()).toEqual([KING.x, KING.y, KING.z]);
  expect(tbm.rotation.y).toBe(0.5);
  expect(() => o.setPose('nope', { position: KING })).toThrow(/no overlay item "nope"/);

  o.setShape('tbm', { kind: 'box', size: [3, 4, 20], color: 0xffffff }, { position: KING });
  expect(o.size).toBe(2);
  expect(o.group.children).toHaveLength(2);
  expect(o.remove('tbm')).toBe(true);
  expect(o.remove('tbm')).toBe(false);
  o.clear();
  expect(o.size).toBe(0);
  expect(o.group.children).toHaveLength(0);
});

test('line segments are one object with small relative coordinates; items can be hidden', () => {
  const o = new OverlayLayer();
  o.setOrigin(650, 0, -2022);
  // Two separate segments: 4th and King to the Transit Center, and one 100 m east of it.
  const segments = [
    KING.x,
    KING.y,
    KING.z,
    SALESFORCE.x,
    SALESFORCE.y,
    SALESFORCE.z,
    KING.x + 100,
    4,
    KING.z,
    SALESFORCE.x + 100,
    -18,
    SALESFORCE.z,
  ];
  o.setLineSegments('rail', segments, { color: 0xe53935, widthPx: 3, xray: true });
  expect(o.group.children.length).toBe(1);
  const lines = o.group.children[0] as Line2;
  expect(lines.geometry.getAttribute('instanceStart').count).toBe(2);
  expect(lines.geometry.getAttribute('instanceStart').getX(1)).toBe(100);
  expect(lines.geometry.getAttribute('instanceEnd').getZ(1)).toBeCloseTo(SALESFORCE.z - KING.z, 3);
  expect(lines.position.x).toBeCloseTo(KING.x - 650 * 32, 9);
  expect(lines.layers.mask).toBe(1 << LAYER_OVERLAY);
  expect(lines.material.depthTest).toBe(false);

  const revision = o.revision;
  o.setVisible('rail', false);
  expect(lines.visible).toBe(false);
  expect(o.revision).toBe(revision + 1);
  o.setVisible('rail', false);
  expect(o.revision).toBe(revision + 1);
  expect(() => o.setVisible('nope', true)).toThrow(/no overlay item "nope"/);
  expect(() => o.setLineSegments('odd', [0, 0, 0, 1, 1], { color: 0 })).toThrow(/two points per segment, got 5 numbers/);
  expect(() => o.setLineSegments('nan', [0, 0, 0, 1, Number.NaN, 1], { color: 0 })).toThrow(/point 1 is not finite/);
});
