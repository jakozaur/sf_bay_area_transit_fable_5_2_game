/**
 * Entity scene contract: the non-voxel things of the game (machines, lining, track, trains, station boxes,
 * pits, alignments) as plain data in world metres. Package neutral on purpose:
 *   - packages/sim publishes snapshot views that structurally extend these types (TbmView extends TbmEntity, ...),
 *   - packages/tools returns PreviewGeometry built from them,
 *   - packages/render draws an EntityScene (EntityLayer in packages/render/src/entities.ts) and knows nothing else,
 *   - apps/game flattens the snapshot into an EntityScene once per frame.
 * Angles follow the overlay layer: yaw is rotation about the vertical axis in radians, counter-clockwise seen
 * from above, 0 pointing +z (south); the direction of travel is (sin yaw, 0, cos yaw). Pitch is radians, positive nose up.
 */
import type { WorldPos } from './frame.ts';

/** What kind of thing an EntityRef points at. */
export type EntityType = 'tbm' | 'train' | 'station' | 'pit' | 'tunnel' | 'alignment' | 'project';

/** Stable handle on an entity, used by camera follow, highlight and picking. `id` is the entity's own id. */
export interface EntityRef {
  type: EntityType;
  id: string;
}

export interface EntityPose {
  /** Reference point in world metres (see each entity for which point). */
  position: WorldPos;
  yaw: number;
  pitch: number;
}

/**
 * A tunnelling machine or other heading. `position` is the centre of the cutterhead face on the heading axis;
 * the shield and trailing gear extend backwards from it.
 */
export interface TbmEntity extends EntityPose {
  id: string;
  /** Excavated radius of one tube, metres. 0 for surface headings (track gang, viaduct crew). */
  radiusM: number;
  /** Lateral offset of each tube axis from the heading axis, metres to the left of travel. One shield is drawn per entry. */
  laterals: number[];
  /** 'running': cutterhead turns and the machine advances. 'stopped': breakdown, event or zero thrust. 'done': broke through. */
  status: 'running' | 'stopped' | 'done';
  /** 0..1 share of full advance, drives the cutterhead spin and the drone loop. */
  thrust: number;
}

/**
 * The excavation behind one heading: its axis as built, how much of it is lined and how much has track.
 * `path` is append-only while the heading advances; the renderer extends rings and rails incrementally.
 */
export interface TunnelEntity {
  id: string;
  /** Axis polyline as built, in build order, world metres. At least two points once the heading has moved. */
  path: WorldPos[];
  /** Bumps when `path` changed other than by appending points (a load, a restart). The renderer rebuilds only then. */
  rev: number;
  /** 'ring': segmental lining rings (bored). 'arch': sprayed lining (mined). 'box': cut-and-cover walls and roof. 'none': surface. */
  lining: 'ring' | 'arch' | 'box' | 'none';
  radiusM: number;
  laterals: number[];
  /** Metres of `path`, from its start, that carry lining. Rings are drawn every `ringSpacingM`. */
  linedM: number;
  ringSpacingM: number;
  /** Metres of `path`, from its start, that carry track. */
  trackM: number;
}

/** Structural type of a station, picks the model the renderer draws. */
export type StationStyle = 'compactBox' | 'mezzanineBox' | 'minedCavern' | 'terminal' | 'inBore' | 'surface' | 'elevated';

/** A station. `position` is the centre of the platform level on the track axis; the box is centred on it and aligned to `yaw`. */
export interface StationEntity {
  id: string;
  name: string;
  position: WorldPos;
  yaw: number;
  style: StationStyle;
  /** Outer box in metres: along the track, across it, and from the platform floor up to the roof slab. */
  lengthM: number;
  widthM: number;
  heightM: number;
  /** 0..1 excavation and structure. */
  progress: number;
  /** 0..1 platforms, finishes and systems; starts after `progress` reaches 1. */
  fitOut: number;
  /** Trains call here. */
  open: boolean;
}

/** The launch pit of a heading. `position` is the pit floor centre on the heading axis. */
export interface LaunchPitEntity {
  id: string;
  /** The heading launched from this pit. */
  tbmId: string;
  position: WorldPos;
  yaw: number;
  lengthM: number;
  widthM: number;
  /** 'planned': outline only. 'ready': excavated, the machine sits in it. 'launched': the machine has left. */
  state: 'planned' | 'ready' | 'launched';
}

/** A train. `position` is the centre of the consist on the track axis. */
export interface TrainEntity extends EntityPose {
  id: string;
  cars: number;
  carLengthM: number;
}

/** Why a piece of an alignment is not buildable. Anything non-null is drawn in the error colour. */
export type AlignmentIssue = 'radius' | 'grade' | 'depth' | 'bounds' | 'short';

/** A planned or built alignment, or the one being drawn. */
export interface AlignmentEntity {
  id: string;
  /** Vertices in world metres; `y` is the track axis elevation. */
  points: WorldPos[];
  /** Bumps whenever `points` or the issue arrays change. */
  rev: number;
  /** 'preview': being drawn by the tool, with handles. 'draft': planned. 'approved': in approvals. 'building', 'open'. */
  state: 'preview' | 'draft' | 'approved' | 'building' | 'open';
  /** One entry per segment (points.length - 1): 'grade', 'short', 'bounds' or null. */
  segmentIssues: (AlignmentIssue | null)[];
  /** One entry per vertex: 'radius', 'depth', 'bounds' or null. */
  vertexIssues: (AlignmentIssue | null)[];
  /** Preview only: vertex under the cursor and the selected vertex, or -1. */
  hoveredVertex?: number;
  selectedVertex?: number;
}

/** The line a possessed machine should follow, and how far off it is. */
export interface GuidanceEntity {
  tbmId: string;
  /** Planned axis from a little behind the cutterhead to the end of the drive. */
  path: WorldPos[];
  /** Point of the plan nearest to the cutterhead. */
  nearest: WorldPos;
  /** Metres between the cutterhead and `nearest`. Drawn in the error colour once it exceeds `limitM`. */
  deviationM: number;
  limitM: number;
  /**
   * Chainage marks across the plan near the machine, as pairs of end points (an even number of points): one
   * every ten metres at fixed chainages, so they stand still in the ground and slide past the machine as it
   * bores. Without them nothing in the cutaway says the machine is moving.
   */
  ticks?: WorldPos[];
}

/** What a tool wants drawn while it is active. Not sim state. */
export type PreviewGeometry =
  /** Draw alignment tool: the polyline with handles and error colouring, plus stations already placed on it. */
  | { kind: 'alignment'; alignment: AlignmentEntity; stations: StationEntity[] }
  /** Add station tool: ghost box snapped to the alignment. `valid` false draws it in the error colour. */
  | { kind: 'station'; station: StationEntity; valid: boolean }
  /** Dig brush: sphere outline at the cursor. */
  | { kind: 'brush'; center: WorldPos; radiusM: number; valid: boolean }
  /** Drive tool: guidance line of the possessed machine. */
  | { kind: 'guidance'; guidance: GuidanceEntity };

/** Everything the entity layer draws in one frame. Arrays may be shared between frames; ids are unique per array. */
export interface EntityScene {
  tbms: TbmEntity[];
  tunnels: TunnelEntity[];
  stations: StationEntity[];
  pits: LaunchPitEntity[];
  trains: TrainEntity[];
  alignments: AlignmentEntity[];
  /** Preview of the active tool. */
  preview: PreviewGeometry | null;
  /** Machine the player drives: drawn with its cutaway treatment. */
  possessedTbmId: string | null;
  /** Entity to outline (hover in a list, selection). */
  highlight: EntityRef | null;
}

/** Shared palette (0xRRGGBB) so the renderer and UI legends agree. `error` marks every violated rule: curve, grade, off plan, invalid placement. */
export const ENTITY_COLORS = {
  alignment: 0xff7043,
  error: 0xe53935,
  handle: 0xffffff,
  handleSelected: 0xffca28,
  guidance: 0x00e676,
  station: 0x1e88e5,
  ghost: 0x66bb6a,
  tbm: 0xffca28,
  lining: 0xb9b9b4,
  track: 0x4a4540,
  train: 0xd32f2f,
  pit: 0x8d6e63,
  brush: 0xffffff,
} as const;
