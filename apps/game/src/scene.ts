/**
 * Flattens the sim snapshot into the core EntityScene the entity layer draws (docs/CONTRACTS.md decision 6:
 * the snapshot views are render-ready, so there is no mapping logic here) and smooths what the sim moves once
 * per game day: a heading of the planned regime is drawn between its pose at the last day boundary and its
 * pose now, and the lining and track behind it grow at the same rate (decision 2).
 */
import type { EntityPose, EntityRef, EntityScene, PreviewGeometry, TbmEntity, TunnelEntity } from '@bayvox/core';
import { type GameSnapshot, type TbmView, trainsAt } from '@bayvox/sim';

interface Pair<T> {
  prev: T;
  cur: T;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest way round from yaw `a` to yaw `b`. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function poseOf(t: TbmView): EntityPose {
  return { position: { ...t.position }, yaw: t.yaw, pitch: t.pitch };
}

export interface SceneInput {
  snapshot: GameSnapshot;
  /** SimDriver.dayAlpha(). */
  alpha: number;
  /** Presentation clock of the trains, seconds. */
  trainClock: number;
  preview: PreviewGeometry | null;
  possessedTbmId: string | null;
  highlight: EntityRef | null;
  /** False hides the trains (the snapshot does not describe the mission on screen). */
  live: boolean;
}

export class SceneBuilder {
  private lastSnapshot: GameSnapshot | null = null;
  private lastTick = -1;
  private readonly poses = new Map<string, Pair<EntityPose>>();
  private readonly lined = new Map<string, Pair<{ linedM: number; trackM: number }>>();
  private scene: EntityScene = {
    tbms: [],
    tunnels: [],
    stations: [],
    pits: [],
    trains: [],
    alignments: [],
    preview: null,
    possessedTbmId: null,
    highlight: null,
  };

  /** Forgets every remembered pose: the sim was replaced. */
  reset(): void {
    this.lastSnapshot = null;
    this.lastTick = -1;
    this.poses.clear();
    this.lined.clear();
  }

  /** The scene of the last build. */
  current(): EntityScene {
    return this.scene;
  }

  private track(s: GameSnapshot): void {
    if (s === this.lastSnapshot) return;
    const newDay = s.tick !== this.lastTick;
    const seenPose = new Set<string>();
    const seenTunnel = new Set<string>();
    for (const p of s.projects) {
      for (const t of p.tbms) {
        seenPose.add(t.id);
        const pose = poseOf(t);
        const pair = this.poses.get(t.id);
        if (pair === undefined) this.poses.set(t.id, { prev: pose, cur: pose });
        else {
          if (newDay) pair.prev = pair.cur;
          pair.cur = pose;
        }
      }
      for (const t of p.tunnels) {
        seenTunnel.add(t.id);
        const v = { linedM: t.linedM, trackM: t.trackM };
        const pair = this.lined.get(t.id);
        if (pair === undefined) this.lined.set(t.id, { prev: v, cur: v });
        else {
          if (newDay) pair.prev = pair.cur;
          pair.cur = v;
        }
      }
    }
    for (const id of [...this.poses.keys()]) if (!seenPose.has(id)) this.poses.delete(id);
    for (const id of [...this.lined.keys()]) if (!seenTunnel.has(id)) this.lined.delete(id);
    this.lastSnapshot = s;
    this.lastTick = s.tick;
  }

  /** Pose a machine is drawn at this frame, or null when the snapshot has no such heading. */
  tbmPose(id: string, alpha: number): EntityPose | null {
    const pair = this.poses.get(id);
    if (pair === undefined) return null;
    const { prev, cur } = pair;
    return {
      position: {
        x: lerp(prev.position.x, cur.position.x, alpha),
        y: lerp(prev.position.y, cur.position.y, alpha),
        z: lerp(prev.position.z, cur.position.z, alpha),
      },
      yaw: lerpAngle(prev.yaw, cur.yaw, alpha),
      pitch: lerp(prev.pitch, cur.pitch, alpha),
    };
  }

  build(input: SceneInput): EntityScene {
    const s = input.snapshot;
    this.track(s);
    // A clock on hold has nothing more to buy: everything is drawn where the sim has it.
    const alpha = s.clock.hold !== null ? 1 : input.alpha;
    const tbms: TbmEntity[] = [];
    const tunnels: TunnelEntity[] = [];
    const scene: EntityScene = {
      tbms,
      tunnels,
      stations: [],
      pits: [],
      trains: [],
      alignments: [],
      preview: input.preview,
      possessedTbmId: input.possessedTbmId,
      highlight: input.highlight,
    };
    const drawing = input.preview !== null && input.preview.kind === 'alignment';
    for (const p of s.projects) {
      for (const t of p.tbms) {
        // On an open line the machines are long gone from the reception box.
        if (p.status === 'open') break;
        // Driven headings move in sub-steps of a few centimetres: the sim's pose is the pose to draw.
        const smooth = !t.driven && t.status === 'running';
        const pose = smooth ? this.tbmPose(t.id, alpha) : null;
        tbms.push(pose === null ? t : { ...t, position: pose.position, yaw: pose.yaw, pitch: pose.pitch });
      }
      for (const t of p.tunnels) {
        const pair = this.lined.get(t.id);
        if (pair === undefined || pair.prev === pair.cur || alpha >= 1) tunnels.push(t);
        else
          tunnels.push({
            ...t,
            linedM: lerp(pair.prev.linedM, pair.cur.linedM, alpha),
            trackM: lerp(pair.prev.trackM, pair.cur.trackM, alpha),
          });
      }
      for (const st of p.stations) scene.stations.push(st);
      // An open line has no building site: the launch pits were backfilled when the stations went in.
      // The pit of the machine the camera rides with is left out too: its pile walls would stand between the
      // chase camera and the shields for the first metres of the drive. The voxel pit underneath still shows.
      if (p.status !== 'open') for (const pit of p.pits) if (pit.tbmId !== input.possessedTbmId) scene.pits.push(pit);
      // While the plan tool shows the line with its handles, the draft underneath would only double it.
      if (p.alignment.points.length >= 2 && !(drawing && p.alignment.state === 'draft')) scene.alignments.push(p.alignment);
    }
    if (input.live) for (const service of s.services) for (const train of trainsAt(service, input.trainClock)) scene.trains.push(train);
    this.scene = scene;
    return scene;
  }

  /** Pose of an entity of the last built scene, for the camera follow. Null when it is not there. */
  poseOf(ref: EntityRef): EntityPose | null {
    const sc = this.scene;
    if (ref.type === 'tbm') {
      const t = sc.tbms.find((x) => x.id === ref.id);
      return t === undefined ? null : { position: t.position, yaw: t.yaw, pitch: t.pitch };
    }
    if (ref.type === 'train') {
      const t = sc.trains.find((x) => x.id === ref.id);
      return t === undefined ? null : { position: t.position, yaw: t.yaw, pitch: t.pitch };
    }
    if (ref.type === 'station') {
      const t = sc.stations.find((x) => x.id === ref.id);
      return t === undefined ? null : { position: t.position, yaw: t.yaw, pitch: 0 };
    }
    if (ref.type === 'pit') {
      const t = sc.pits.find((x) => x.id === ref.id);
      return t === undefined ? null : { position: t.position, yaw: t.yaw, pitch: 0 };
    }
    return null;
  }
}
