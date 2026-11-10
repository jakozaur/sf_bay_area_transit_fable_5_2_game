/**
 * Overlay layer: vector things that are not voxels (rail lines, planned alignments, stations, TBMs, trains).
 * Callers speak world metres in doubles; every object is stored relative to its own anchor point and placed
 * relative to the floating origin, so nothing in a GPU buffer is ever a large coordinate.
 * The API is free of three types except `addObject`, the escape hatch for custom meshes.
 */
import { CHUNK_SIZE, type WorldPos } from '@bayvox/core';
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  OctahedronGeometry,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LAYER_OVERLAY } from './chunk-scene.ts';
import { type Cutaway, validateCutaway } from './slice.ts';

/** A local light (TBM work lamp, breakthrough flash). The renderer lights terrain, cut faces and overlay meshes with the nearest few. */
export interface WorkLight {
  position: WorldPos;
  /** Reach in metres: the light fades to nothing at this distance. */
  radiusM: number;
  /** 0xRRGGBB. */
  color: number;
  /** 1 is a work lamp; the flash goes higher. */
  intensity: number;
}

/** Called once per drawn frame with the camera position (world metres) and viewport height / vertical fov in radians. */
export type FrameListener = (camera: WorldPos, pxPerRadian: number) => void;

export interface PolylineStyle {
  /** 0xRRGGBB. */
  color: number;
  /** Line width in CSS pixels, constant on screen so lines stay readable at regional zoom. Default 3. */
  widthPx?: number;
  /** Draw through terrain (planned alignments, tunnels seen from the surface). Default false. */
  xray?: boolean;
  /** Dashed, for planned or unbuilt segments. Dash length in metres. */
  dashM?: number;
}

/** Style of a batch of line segments: solid, constant pixel width. */
export interface LineStyle {
  /** 0xRRGGBB. */
  color: number;
  /** Default 2. */
  widthPx?: number;
  /** Draw through terrain. Default false. */
  xray?: boolean;
  /** 0..1, default 1. */
  opacity?: number;
}

export interface MarkerStyle {
  color: number;
  /** Height of the pin in metres when the camera is close. Default 12. */
  sizeM?: number;
  /** The pin never appears smaller than this many pixels tall. Default 28. */
  minPx?: number;
  xray?: boolean;
}

/** Simple solids, sized in metres. A cylinder's axis is its local z (the direction of travel for a TBM). */
export type OverlayShape =
  | { kind: 'box'; size: [number, number, number]; color: number }
  | { kind: 'cylinder'; radius: number; length: number; color: number };

export interface Pose {
  position: WorldPos;
  /** Rotation about the vertical axis, radians, counter-clockwise seen from above. 0 points local z south (+z). */
  yaw?: number;
}

interface Item {
  object: Object3D;
  /** World metres. */
  anchor: WorldPos;
  /** Marker only: metres at scale 1 and the minimum on-screen size. */
  marker?: { sizeM: number; minPx: number };
  dispose(): void;
}

function assertFinite(p: WorldPos, what: string): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
    throw new RangeError(`OverlayLayer: ${what} is not finite: (${p.x}, ${p.y}, ${p.z})`);
  }
}

function setLayer(o: Object3D): void {
  o.traverse((c) => {
    c.layers.set(LAYER_OVERLAY);
  });
}

function disposeMesh(geometry: BufferGeometry, material: Material): () => void {
  return () => {
    geometry.dispose();
    material.dispose();
  };
}

export class OverlayLayer {
  readonly group = new Group();
  private readonly items = new Map<string, Item>();
  private originX = 0;
  private originY = 0;
  private originZ = 0;
  private changes = 0;
  private readonly lightMap = new Map<string, WorkLight>();
  private readonly frameListeners = new Set<FrameListener>();
  private cut: Cutaway | null = null;

  /** Local lights by id. Read by the renderer every frame. */
  get lights(): ReadonlyMap<string, WorkLight> {
    return this.lightMap;
  }

  /** Adds, replaces or (with null) removes a local light. */
  setLight(id: string, light: WorkLight | null): void {
    if (light === null) {
      if (this.lightMap.delete(id)) this.changes++;
      return;
    }
    assertFinite(light.position, `light "${id}"`);
    if (!(light.radiusM > 0) || !(light.intensity >= 0)) {
      throw new RangeError(
        `OverlayLayer.setLight: "${id}" needs radiusM > 0 and intensity >= 0, got ${light.radiusM} and ${light.intensity}`,
      );
    }
    this.lightMap.set(id, { ...light, position: { ...light.position } });
    this.changes++;
  }

  /** The follow cutaway (slice.ts): a trench the renderer opens around a machine. Null for none. */
  get cutaway(): Cutaway | null {
    return this.cut;
  }

  setCutaway(c: Cutaway | null): void {
    if (c === null) {
      if (this.cut !== null) this.changes++;
      this.cut = null;
      return;
    }
    validateCutaway(c);
    const o = this.cut;
    if (
      o !== null &&
      o.position.x === c.position.x &&
      o.position.z === c.position.z &&
      o.yaw === c.yaw &&
      o.aheadM === c.aheadM &&
      o.behindM === c.behindM &&
      o.halfWidthM === c.halfWidthM &&
      o.floorY === c.floorY
    ) {
      return;
    }
    this.cut = { ...c, position: { ...c.position } };
    this.changes++;
  }

  /** Marks the overlay as changed after a caller moved or animated something inside one of its objects. */
  touch(): void {
    this.changes++;
  }

  /** Subscribes to the per-frame camera callback (screen-sized handles). Returns an unsubscribe function. */
  onFrame(cb: FrameListener): () => void {
    this.frameListeners.add(cb);
    return () => {
      this.frameListeners.delete(cb);
    };
  }

  get size(): number {
    return this.items.size;
  }

  /** Counts mutations (items added, moved, removed). Lets a caller skip redrawing an unchanged scene. */
  get revision(): number {
    return this.changes;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** Adds or replaces a polyline through `points` (world metres, at least two). */
  setPolyline(id: string, points: readonly WorldPos[], style: PolylineStyle): void {
    if (points.length < 2) throw new RangeError(`OverlayLayer.setPolyline: "${id}" needs at least 2 points, got ${points.length}`);
    const anchor = points[0] as WorldPos;
    const rel = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const p = points[i] as WorldPos;
      assertFinite(p, `polyline "${id}" point ${i}`);
      rel[i * 3] = p.x - anchor.x;
      rel[i * 3 + 1] = p.y - anchor.y;
      rel[i * 3 + 2] = p.z - anchor.z;
    }
    const geometry = new LineGeometry();
    geometry.setPositions(rel);
    const xray = style.xray === true;
    const material = new LineMaterial({
      color: style.color,
      linewidth: style.widthPx ?? 3,
      worldUnits: false,
      dashed: style.dashM !== undefined,
      dashSize: style.dashM ?? 1,
      gapSize: style.dashM ?? 1,
      depthTest: !xray,
      depthWrite: !xray,
      transparent: xray,
    });
    const line = new Line2(geometry, material);
    if (style.dashM !== undefined) line.computeLineDistances();
    line.renderOrder = xray ? 20 : 0;
    // Bounds of a long line are large; culling a handful of lines is not worth a stale-bounds bug.
    line.frustumCulled = false;
    this.put(id, { object: line, anchor: { ...anchor }, dispose: disposeMesh(geometry, material) });
  }

  /**
   * Adds or replaces many independent line segments as ONE draw (a rail network, a road layer).
   * `segments` holds x, y, z per end point, two points per segment, in world metres.
   */
  setLineSegments(id: string, segments: ArrayLike<number>, style: LineStyle): void {
    if (segments.length < 6 || segments.length % 6 !== 0) {
      throw new RangeError(
        `OverlayLayer.setLineSegments: "${id}" needs x, y, z for two points per segment, got ${segments.length} numbers`,
      );
    }
    const anchor = { x: segments[0] as number, y: segments[1] as number, z: segments[2] as number };
    const rel = new Float32Array(segments.length);
    for (let i = 0; i < segments.length; i += 3) {
      const x = segments[i] as number;
      const y = segments[i + 1] as number;
      const z = segments[i + 2] as number;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new RangeError(`OverlayLayer.setLineSegments: "${id}" point ${i / 3} is not finite: (${x}, ${y}, ${z})`);
      }
      rel[i] = x - anchor.x;
      rel[i + 1] = y - anchor.y;
      rel[i + 2] = z - anchor.z;
    }
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(rel);
    const xray = style.xray === true;
    const opacity = style.opacity ?? 1;
    const material = new LineMaterial({
      color: style.color,
      linewidth: style.widthPx ?? 2,
      worldUnits: false,
      depthTest: !xray,
      depthWrite: !xray,
      transparent: xray || opacity < 1,
      opacity,
    });
    const lines = new LineSegments2(geometry, material);
    lines.renderOrder = xray ? 19 : 0;
    lines.frustumCulled = false;
    this.put(id, { object: lines, anchor, dispose: disposeMesh(geometry, material) });
  }

  /** Adds or replaces a pin marker (station, campus) whose tip sits at `position`. */
  setMarker(id: string, position: WorldPos, style: MarkerStyle): void {
    assertFinite(position, `marker "${id}"`);
    const xray = style.xray === true;
    const material = new MeshLambertMaterial({ color: style.color, depthTest: !xray, transparent: xray });
    // Unit pin: a thin pole of height 1 with an octahedral head on top; scaled to sizeM per frame.
    const pole = new CylinderGeometry(0.035, 0.035, 0.7, 6);
    pole.translate(0, 0.35, 0);
    const head = new OctahedronGeometry(0.22);
    head.translate(0, 0.8, 0);
    const g = new Group();
    g.add(new Mesh(pole, material), new Mesh(head, material));
    for (const c of g.children) c.renderOrder = xray ? 21 : 0;
    const sizeM = style.sizeM ?? 12;
    g.scale.setScalar(sizeM);
    this.put(id, {
      object: g,
      anchor: { ...position },
      marker: { sizeM, minPx: style.minPx ?? 28 },
      dispose() {
        pole.dispose();
        head.dispose();
        material.dispose();
      },
    });
  }

  /** Adds or replaces a simple solid (TBM, train car). */
  setShape(id: string, shape: OverlayShape, pose: Pose): void {
    let geometry: BufferGeometry;
    if (shape.kind === 'box') {
      geometry = new BoxGeometry(shape.size[0], shape.size[1], shape.size[2]);
    } else {
      geometry = new CylinderGeometry(shape.radius, shape.radius, shape.length, 16);
      geometry.rotateX(Math.PI / 2);
    }
    const material = new MeshLambertMaterial({ color: shape.color });
    this.put(id, { object: new Mesh(geometry, material), anchor: { ...pose.position }, dispose: disposeMesh(geometry, material) });
    this.setPose(id, pose);
  }

  /** Adds or replaces a caller-built three object. Its vertices must be local (small) coordinates; the caller disposes it. */
  setObject(id: string, object: Object3D, pose: Pose): void {
    this.put(id, { object, anchor: { ...pose.position }, dispose() {} });
    this.setPose(id, pose);
  }

  /** Moves a shape, object or marker. Cheap: call it every frame for moving trains. */
  setPose(id: string, pose: Pose): void {
    const item = this.items.get(id);
    if (item === undefined) throw new RangeError(`OverlayLayer.setPose: no overlay item "${id}"`);
    assertFinite(pose.position, `pose of "${id}"`);
    item.anchor = { ...pose.position };
    if (pose.yaw !== undefined) item.object.rotation.y = pose.yaw;
    this.changes++;
    this.place(item);
  }

  /** Shows or hides an item without freeing it. */
  setVisible(id: string, visible: boolean): void {
    const item = this.items.get(id);
    if (item === undefined) throw new RangeError(`OverlayLayer.setVisible: no overlay item "${id}"`);
    if (item.object.visible === visible) return;
    item.object.visible = visible;
    this.changes++;
  }

  /** Returns true if the item existed. */
  remove(id: string): boolean {
    const item = this.items.get(id);
    if (item === undefined) return false;
    item.object.removeFromParent();
    item.dispose();
    this.items.delete(id);
    this.changes++;
    return true;
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
    if (this.lightMap.size > 0 || this.cut !== null) this.changes++;
    this.lightMap.clear();
    this.cut = null;
  }

  /** Floating origin in world metres, for callers that place things inside an item themselves. */
  get originM(): WorldPos {
    return { x: this.originX, y: this.originY, z: this.originZ };
  }

  /** Floating origin as a chunk coordinate; same value the chunk renderer uses. */
  setOrigin(cx: number, cy: number, cz: number): void {
    this.originX = cx * CHUNK_SIZE;
    this.originY = cy * CHUNK_SIZE;
    this.originZ = cz * CHUNK_SIZE;
    for (const item of this.items.values()) this.place(item);
  }

  /**
   * Keeps markers readable from far away: each is scaled so it is at least `minPx` tall.
   * `camera` is the camera position in world metres, `pxPerRadian` is viewport height / vertical fov in radians.
   */
  updateMarkers(camera: WorldPos, pxPerRadian: number): void {
    for (const item of this.items.values()) {
      if (item.marker === undefined) continue;
      const dist = Math.hypot(item.anchor.x - camera.x, item.anchor.y - camera.y, item.anchor.z - camera.z);
      item.object.scale.setScalar(Math.max(item.marker.sizeM, (item.marker.minPx * dist) / pxPerRadian));
    }
    for (const cb of this.frameListeners) cb(camera, pxPerRadian);
  }

  private put(id: string, item: Item): void {
    if (id === '') throw new RangeError('OverlayLayer: item id must not be empty');
    this.remove(id);
    setLayer(item.object);
    this.items.set(id, item);
    this.group.add(item.object);
    this.changes++;
    this.place(item);
  }

  private place(item: Item): void {
    item.object.position.set(item.anchor.x - this.originX, item.anchor.y - this.originY, item.anchor.z - this.originZ);
  }
}
