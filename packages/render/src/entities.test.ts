import { ENTITY_COLORS, type EntityScene, type StationEntity, type TunnelEntity, type WorldPos } from '@bayvox/core';
import type { Group, InstancedMesh, Mesh, Object3D } from 'three';
import { expect, test } from 'vitest';
import { createEntityLayer } from './entities.ts';
import { hexToLinear } from './mesh-builder.ts';
import { RAIL_DROP_M, TBM_LENGTH_M } from './models.ts';
import { OverlayLayer } from './overlay.ts';

// A drive heading east (+x): yaw 90 degrees, left of travel is north (-z).
const YAW = Math.PI / 2;
const AT = (s: number, y = -20): WorldPos => ({ x: 20_000 + s, y, z: -65_000 });

function tunnel(lengthM: number, over: Partial<TunnelEntity> = {}): TunnelEntity {
  const path: WorldPos[] = [];
  for (let s = 0; s <= lengthM; s += 10) path.push(AT(s));
  return {
    id: 'drive',
    path,
    rev: 1,
    lining: 'ring',
    radiusM: 3.3,
    laterals: [-5.5, 5.5],
    linedM: lengthM - 12,
    ringSpacingM: 1.5,
    trackM: lengthM - 60,
    ...over,
  };
}

function station(over: Partial<StationEntity> = {}): StationEntity {
  return {
    id: 'st',
    name: 'Fourth and Townsend',
    position: AT(100),
    yaw: YAW,
    style: 'compactBox',
    lengthM: 60,
    widthM: 20,
    heightM: 8,
    progress: 1,
    fitOut: 1,
    open: true,
    ...over,
  };
}

function scene(over: Partial<EntityScene> = {}): EntityScene {
  return {
    tbms: [],
    tunnels: [],
    stations: [],
    pits: [],
    trains: [],
    alignments: [],
    preview: null,
    possessedTbmId: null,
    highlight: null,
    ...over,
  };
}

function find(o: OverlayLayer, test: (c: Object3D) => boolean): Object3D[] {
  const out: Object3D[] = [];
  o.group.traverse((c) => {
    if (test(c)) out.push(c);
  });
  return out;
}

test('a tunnel draws rings and track behind the heading and only appends when the path grows', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  layer.sync(scene({ tunnels: [tunnel(120)] }));
  // 108 m lined at 1.5 m per ring in two tubes; 60 m of track in 3 m panels.
  expect(layer.stats()).toMatchObject({ tunnels: 1, rings: 72 * 2, trackM: 60 });
  const instanced = find(o, (c) => (c as InstancedMesh).isInstancedMesh === true) as InstancedMesh[];
  // One batch of rings (invert and crown) and one of track.
  expect(instanced.map((m) => m.count).sort((a, b) => a - b)).toEqual([40, 144, 144]);
  const before = o.size;
  layer.sync(scene({ tunnels: [tunnel(150)] }));
  expect(layer.stats()).toMatchObject({ rings: 92 * 2, trackM: 90 });
  // Same objects, more instances.
  expect(o.size).toBe(before);
  expect((find(o, (c) => (c as InstancedMesh).isInstancedMesh === true) as InstancedMesh[]).every((m) => instanced.includes(m))).toBe(true);
  // A new rev (load, restart) rebuilds from scratch.
  layer.sync(scene({ tunnels: [tunnel(30, { rev: 2 })] }));
  expect(layer.stats()).toMatchObject({ rings: 12 * 2, trackM: 0 });
  expect(instanced.some((m) => m.parent?.parent === o.group)).toBe(false);
  layer.sync(scene());
  expect(layer.stats().tunnels).toBe(0);
  expect(o.size).toBe(0);
  expect(() => layer.sync(scene({ tunnels: [tunnel(30, { ringSpacingM: 0 })] }))).toThrow(/ringSpacingM must be > 0/);
});

test('ring instances sit on the tube axes, in order along the path; more than a batch opens a second object', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  layer.sync(scene({ tunnels: [tunnel(400, { laterals: [0] })] }));
  expect(layer.stats().rings).toBe(Math.floor(388 / 1.5));
  const rings = (find(o, (c) => (c as InstancedMesh).isInstancedMesh === true) as InstancedMesh[]).filter(
    (m) => m.count === 256 || m.count === 2,
  );
  // 258 rings: a full batch of 256 and 2 more, each with an invert and a crown mesh.
  expect(rings.length).toBe(4);
  const first = rings[0] as InstancedMesh;
  const group = first.parent as Group;
  // Instance 10 is 15 m along +x from the first ring; the frame's z axis points along the drive (+x).
  const m = first.instanceMatrix.array;
  expect((m[10 * 16 + 12] as number) + group.position.x).toBeCloseTo(20_015, 3);
  expect(m[10 * 16 + 8]).toBeCloseTo(1, 6);
  // Left of an eastbound drive is north: the frame's x axis is -z.
  expect(m[10 * 16 + 2]).toBeCloseTo(-1, 6);
});

test('rings are left out inside a station box and come back when the box goes', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  const scale = (): number[] => {
    const lower = (find(o, (c) => (c as InstancedMesh).isInstancedMesh === true) as InstancedMesh[]).find(
      (m) => m.count === 72,
    ) as InstancedMesh;
    return Array.from({ length: 72 }, (_, i) =>
      Math.hypot(lower.instanceMatrix.array[i * 16] as number, lower.instanceMatrix.array[i * 16 + 2] as number),
    );
  };
  layer.sync(scene({ tunnels: [tunnel(120, { laterals: [0] })], stations: [station()] }));
  // Box from 70 to 130 m: rings from 70.5 m on are hidden (scale 0), the ones before are drawn.
  const hidden = scale();
  expect(hidden[46]).toBeCloseTo(1, 6);
  expect(hidden[47]).toBe(0);
  expect(hidden[71]).toBe(0);
  layer.sync(scene({ tunnels: [tunnel(120, { laterals: [0] })] }));
  expect(scale().every((s) => Math.abs(s - 1) < 1e-6)).toBe(true);
});

test('a possessed machine opens the cutaway around itself, hides the crowns and lights the face', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  const tbm = {
    id: 'tbm',
    position: AT(120),
    yaw: YAW,
    pitch: 0.02,
    radiusM: 3.3,
    laterals: [-5.5, 5.5],
    status: 'running' as const,
    thrust: 1,
  };
  layer.sync(scene({ tunnels: [tunnel(120)], tbms: [tbm] }));
  expect(o.cutaway).toBeNull();
  expect(o.lights.size).toBe(1);
  const lamp = [...o.lights.values()][0];
  // Three metres behind the face, above the axis.
  expect(lamp?.position.x).toBeCloseTo(20_117, 6);
  expect(lamp?.position.y).toBeGreaterThan(-20);
  const crowns = (): boolean[] => (find(o, (c) => (c as InstancedMesh).isInstancedMesh === true) as InstancedMesh[]).map((m) => m.visible);
  expect(crowns().every(Boolean)).toBe(true);

  layer.sync(scene({ tunnels: [tunnel(120)], tbms: [tbm], possessedTbmId: 'tbm' }));
  const cut = o.cutaway;
  if (cut === null) throw new Error('no cutaway');
  expect(cut.position).toEqual(tbm.position);
  expect(cut.yaw).toBe(YAW);
  // Both tubes plus working room; the whole machine and some lined tunnel behind; floor under the invert.
  expect(cut.halfWidthM).toBeCloseTo(5.5 + 3.3 + 7, 9);
  expect(cut.behindM).toBeGreaterThan(TBM_LENGTH_M);
  expect(cut.floorY).toBe(-24);
  expect(crowns().filter((v) => !v).length).toBe(1);
  // Two shields with a cutterhead each, pitched nose up.
  const item = o.group.children.find((c) => c.rotation.y === YAW && c.children.length === 1) as Group;
  expect(item.children[0]?.children.length).toBe(4);
  expect(item.children[0]?.rotation.x).toBeCloseTo(-0.02, 9);

  // The cutterheads turn only while running, faster with thrust; neighbours counter-rotate.
  const heads = (item.children[0]?.children ?? []).filter((_, i) => i % 2 === 1) as Mesh[];
  const revision = o.revision;
  layer.update(0.5);
  expect(heads[0]?.rotation.z).toBeCloseTo(0.5 * 2.1, 9);
  expect(heads[1]?.rotation.z).toBeCloseTo(-0.5 * 2.1, 9);
  expect(o.revision).toBeGreaterThan(revision);
  layer.sync(scene({ tunnels: [tunnel(120)], tbms: [{ ...tbm, status: 'stopped', thrust: 0 }] }));
  layer.update(0.5);
  expect(heads[0]?.rotation.z).toBeCloseTo(0.5 * 2.1, 9);
  expect(o.cutaway).toBeNull();
  expect(crowns().every(Boolean)).toBe(true);
  layer.sync(scene());
  expect(o.lights.size).toBe(0);
  expect(o.size).toBe(0);
  expect(() => layer.sync(scene({ tbms: [{ ...tbm, thrust: 2 }] }))).toThrow(/thrust must be in \[0, 1\]/);
  expect(() => layer.sync(scene({ tbms: [tbm, tbm] }))).toThrow(/duplicate tbm id/);
});

test('cutaway: false never opens the ground', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o, { cutaway: false });
  layer.sync(
    scene({
      tbms: [{ id: 't', position: AT(0), yaw: 0, pitch: 0, radiusM: 3.3, laterals: [0], status: 'running', thrust: 1 }],
      possessedTbmId: 't',
    }),
  );
  expect(o.cutaway).toBeNull();
});

test('train cars follow the tube they run in: right-hand track, rails below the axis, each car on the curve', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  // A drive east for 200 m, then north-east.
  const path = [AT(0), AT(200), { x: 20_400, y: -20, z: -65_200 }];
  const t = tunnel(0, { path, linedM: 0, trackM: 0 });
  const train = { id: 'emu', position: AT(190), yaw: YAW, pitch: 0, cars: 4, carLengthM: 20 };
  layer.sync(scene({ tunnels: [t], trains: [train] }));
  const group = o.group.children.find((c) => c.children.length === 4) as Group;
  const world = (i: number): WorldPos => {
    const c = group.children[i] as Mesh;
    return { x: c.position.x + group.position.x, y: c.position.y + group.position.y, z: c.position.z + group.position.z };
  };
  // Car 0 is the tail, 30 m behind the centre, on the right of an eastbound train (south, +z), rails 2 m down.
  expect(world(0).x).toBeCloseTo(20_160, 6);
  expect(world(0).z).toBeCloseTo(-65_000 + 5.5, 6);
  expect(world(0).y).toBeCloseTo(-20 - RAIL_DROP_M, 6);
  // The tail cab faces backwards; the middle cars forwards.
  expect((group.children[0] as Mesh).rotation.y).toBeCloseTo(YAW + Math.PI, 9);
  expect((group.children[1] as Mesh).rotation.y).toBeCloseTo(YAW, 9);
  // The front car is 30 m ahead along the path: 20 m past the bend, turned onto the new heading.
  const lead = world(3);
  expect(lead.x).toBeGreaterThan(20_205);
  expect(lead.z).toBeLessThan(-65_000);
  expect((group.children[3] as Mesh).rotation.y).toBeCloseTo(Math.atan2(200, -200), 9);

  // The same train running back west takes the other tube.
  layer.sync(scene({ tunnels: [t], trains: [{ ...train, position: AT(100), yaw: -YAW }] }));
  expect(world(1).z).toBeCloseTo(-65_000 - 5.5, 6);
  // Away from any tunnel the consist is rigid along its own pose, on the axis.
  layer.sync(scene({ trains: [{ ...train, position: AT(100, 5) }] }));
  expect(world(0)).toEqual({ x: 20_070, y: 5, z: -65_000 });
  // An extra track path is followed where there is no tunnel.
  layer.setTrackPaths([{ points: [AT(0, 5), AT(500, 5)], railDropM: 0 }]);
  layer.sync(scene({ trains: [{ ...train, position: { x: 20_100, y: 5, z: -64_998 } }] }));
  expect(world(0).z).toBeCloseTo(-65_000, 6);
  expect(() => layer.sync(scene({ trains: [{ ...train, cars: 0 }] }))).toThrow(/cars must be 1..16/);
});

test('stations, pits: models rebuilt on visible change only, outlines through the ground, picking and anchors', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o, { groundAt: () => 6 });
  const pit = { id: 'pit', tbmId: 'tbm', position: AT(0, -24), yaw: YAW, lengthM: 30, widthM: 20, state: 'planned' as const };
  layer.sync(scene({ stations: [station()], pits: [pit] }));
  expect(layer.stats()).toMatchObject({ stations: 1, pits: 1 });
  // Station mesh and outline; a planned pit is an outline only.
  expect(o.size).toBe(3);
  const mesh = o.group.children.find((c) => (c as Mesh).isMesh === true) as Mesh;
  // The entrance reaches the street (6 m) from a reference point at -20 m.
  mesh.geometry.computeBoundingBox();
  expect(mesh.geometry.boundingBox?.max.y).toBeGreaterThan(26);
  // Progress within the same twentieth: nothing is rebuilt.
  const revision = o.revision;
  layer.sync(scene({ stations: [station()], pits: [pit] }));
  expect(o.revision).toBe(revision);
  layer.sync(scene({ stations: [station({ fitOut: 0.2, open: false })], pits: [{ ...pit, state: 'ready' }] }));
  expect(o.size).toBe(4);
  expect(o.group.children.includes(mesh)).toBe(false);

  // A ray straight down onto the platform hits the station; over the pit, the pit; elsewhere nothing.
  const down = { x: 0, y: -1, z: 0 };
  expect(layer.pick({ origin: AT(100, 50), dir: down }, 500)).toEqual({ type: 'station', id: 'st' });
  expect(layer.pick({ origin: AT(100, 50), dir: down }, 20)).toBeNull();
  expect(layer.pick({ origin: AT(3, 50), dir: down }, 500)).toEqual({ type: 'pit', id: 'pit' });
  expect(layer.pick({ origin: AT(50, 50), dir: down }, 500)).toBeNull();
  expect(() => layer.pick({ origin: AT(0), dir: { x: 0, y: -2, z: 0 } }, 10)).toThrow(/unit vector/);
  expect(layer.anchor({ type: 'station', id: 'st' })).toEqual({ position: AT(100), yaw: YAW, pitch: 0 });
  expect(layer.anchor({ type: 'station', id: 'nope' })).toBeNull();
  expect(layer.anchor({ type: 'project', id: 'line' })).toBeNull();
  // Highlight outlines the entity.
  layer.sync(
    scene({
      stations: [station({ fitOut: 0.2, open: false })],
      pits: [{ ...pit, state: 'ready' }],
      highlight: { type: 'station', id: 'st' },
    }),
  );
  expect(o.has('ent.hl')).toBe(true);
  expect(() => layer.sync(scene({ stations: [station({ progress: 1.5 })] }))).toThrow(/progress must be in \[0, 1\]/);
});

test('alignments: error colouring per segment and vertex, handles in preview, ghost line, previews', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  const points = [AT(0), AT(100), AT(200), AT(300)];
  const alignment = {
    id: 'line',
    points,
    rev: 1,
    state: 'draft' as const,
    segmentIssues: [null, 'grade' as const, null],
    vertexIssues: [null, 'radius' as const, null, null],
  };
  layer.sync(scene({ alignments: [alignment] }));
  expect(layer.stats()).toMatchObject({ alignments: 1, errorMarks: 2, preview: false });
  const group = o.group.children[0] as Group;
  // The line and one handle on the offending vertex.
  expect(group.children.length).toBe(2);
  const line = group.children[0] as Mesh;
  const colors = line.geometry.getAttribute('instanceColorStart');
  // Segment 1 breaks the grade rule: error red (less green than the alignment orange); its neighbours keep the line colour.
  const [, errorGreen] = hexToLinear(ENTITY_COLORS.error);
  const [, lineGreen] = hexToLinear(ENTITY_COLORS.alignment);
  expect(colors.getY(0)).toBeCloseTo(lineGreen, 6);
  expect(colors.getY(1)).toBeCloseTo(errorGreen, 6);
  expect(colors.getY(2)).toBeCloseTo(lineGreen, 6);
  // Handles keep their size on screen: 11 px at 1000 px per radian and 2 km is 22 m.
  o.updateMarkers({ x: 20_100, y: 1980, z: -65_000 }, 1000);
  expect(group.children[1]?.scale.x).toBeCloseTo(22, 6);

  // Preview: every vertex gets a handle, the station ghost is drawn, the error counts add up.
  layer.sync(
    scene({
      alignments: [alignment],
      preview: {
        kind: 'alignment',
        alignment: { ...alignment, id: 'draw', state: 'preview', selectedVertex: 0 },
        stations: [station({ progress: 0, fitOut: 0 })],
      },
    }),
  );
  expect(layer.stats()).toMatchObject({ alignments: 1, errorMarks: 4, preview: true });
  expect(o.has('ent.pv.al')).toBe(true);
  expect(o.has('ent.pv.st0')).toBe(true);
  layer.sync(scene({ alignments: [alignment], preview: { kind: 'brush', center: AT(50, 3), radiusM: 4, valid: false } }));
  expect(o.has('ent.pv.al')).toBe(false);
  expect(o.has('ent.pv.brush')).toBe(true);
  expect(layer.stats().errorMarks).toBe(3);
  layer.sync(scene({ alignments: [alignment], preview: { kind: 'station', station: station(), valid: true } }));
  expect(layer.stats().errorMarks).toBe(2);
  // Guidance: the plan ahead, a tie from the machine to the plan, red once outside the corridor.
  const tbm = { id: 'tbm', position: AT(50, -18), yaw: YAW, pitch: 0, radiusM: 3.3, laterals: [0], status: 'running' as const, thrust: 1 };
  const guidance = { tbmId: 'tbm', path: [AT(40), AT(300)], nearest: AT(50), deviationM: 2, limitM: 1.5 };
  layer.sync(scene({ tbms: [tbm], preview: { kind: 'guidance', guidance } }));
  expect(o.has('ent.pv.g') && o.has('ent.pv.gd') && o.has('ent.pv.gn')).toBe(true);
  expect(layer.stats().errorMarks).toBe(1);
  layer.sync(scene({ tbms: [tbm], preview: { kind: 'guidance', guidance: { ...guidance, deviationM: 1 } } }));
  expect(layer.stats().errorMarks).toBe(0);

  layer.setGhost(points);
  expect(o.has('ent.ghost')).toBe(true);
  layer.setGhost(null);
  expect(o.has('ent.ghost')).toBe(false);
  expect(() => layer.sync(scene({ alignments: [{ ...alignment, rev: 2, segmentIssues: [null] }] }))).toThrow(
    /3 segment issues|1 segment issues/,
  );
});

test('flash grows and fades, then removes itself and its light; dispose leaves the overlay empty', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  layer.sync(
    scene({
      tunnels: [tunnel(120)],
      stations: [station()],
      trains: [{ id: 'emu', position: AT(60), yaw: YAW, pitch: 0, cars: 2, carLengthM: 20 }],
    }),
  );
  const before = o.size;
  layer.flash(AT(120));
  expect(o.size).toBe(before + 1);
  expect([...o.lights.values()][0]?.intensity).toBeCloseTo(3.2, 6);
  layer.update(0.7);
  expect([...o.lights.values()][0]?.intensity).toBeCloseTo(1.6, 6);
  layer.update(0.8);
  expect(o.size).toBe(before);
  expect(o.lights.size).toBe(0);
  expect(() => layer.flash({ x: Number.NaN, y: 0, z: 0 })).toThrow(/not finite/);
  expect(() => layer.update(-1)).toThrow(/dtSeconds/);
  layer.flash(AT(0));
  layer.setGhost([AT(0), AT(10)]);
  layer.dispose();
  expect(o.size).toBe(0);
  expect(o.lights.size).toBe(0);
  expect(() => layer.sync(scene())).toThrow(/disposed/);
});

test('rings added while building pop in and settle at full size', () => {
  const o = new OverlayLayer();
  const layer = createEntityLayer(o);
  layer.sync(scene({ tunnels: [tunnel(120, { laterals: [0], linedM: 30 })] }));
  layer.sync(scene({ tunnels: [tunnel(120, { laterals: [0], linedM: 31.5 })] }));
  const lower = (find(o, (c) => (c as InstancedMesh).isInstancedMesh === true) as InstancedMesh[]).find(
    (m) => m.count === 21,
  ) as InstancedMesh;
  const size = (): number =>
    Math.hypot(
      lower.instanceMatrix.array[20 * 16 + 8] as number,
      lower.instanceMatrix.array[20 * 16 + 9] as number,
      lower.instanceMatrix.array[20 * 16 + 10] as number,
    );
  expect(size()).toBeCloseTo(0.5, 6);
  layer.update(0.1);
  expect(size()).toBeGreaterThan(0.5);
  expect(size()).toBeLessThan(1.05);
  layer.update(0.5);
  expect(size()).toBeCloseTo(1, 6);
});
