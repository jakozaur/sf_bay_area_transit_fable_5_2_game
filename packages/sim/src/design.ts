/**
 * Design chooser (round 2, owner decision): the Polish baseline design (twin 6.6 m bores, compact cut-and-cover
 * station boxes) against California overdesign (single giant bore, three-track mined cavern, mezzanine boxes),
 * each a named option with a price tag. Options the standards in force forbid are locked behind reforms.
 */
import { CONSTANTS as K } from './constants.ts';
import { effectiveMethod, isUnderground } from './model.ts';
import { type Profile, reformById } from './reforms.ts';
import {
  type DesignFlags,
  type DesignOptionId,
  type Method,
  type ProjectState,
  STATION_BOXES,
  type StationBoxId,
  type StationTemplate,
  TUNNEL_OPTION_METHOD,
  TUNNEL_OPTIONS,
  type TunnelOptionId,
} from './types.ts';

export interface DesignOptionDef {
  group: 'tunnel' | 'station';
  id: DesignOptionId;
  label: string;
  description: string;
  practice: 'polish' | 'california';
  evidence: string;
}

export const DESIGN_OPTIONS: readonly DesignOptionDef[] = [
  {
    group: 'tunnel',
    id: 'twinBore',
    label: 'Twin bore, 6.6 m',
    description: 'Two ordinary 6.6 m tubes, one track each. What Warsaw bores.',
    practice: 'polish',
    evidence: 'doc 06 section 2.1 (Warsaw M2: twin EPB machines); doc 11 section 5.1 (34.2 m2 per tube)',
  },
  {
    group: 'tunnel',
    id: 'singleLargeBore',
    label: 'Single large bore, 16 m',
    description: 'One 16 m tube with both tracks and the platforms inside. Three times the muck of a twin bore.',
    practice: 'california',
    evidence: 'doc 11 sections 6.2 and 6.4 (BART Silicon Valley Phase II: 205 m2, a 2.2x design gap)',
  },
  {
    group: 'tunnel',
    id: 'cutAndCover',
    label: 'Cut-and-cover',
    description: 'Dig up the street, build a box, put the street back. Cheap in a field, loud in a city.',
    practice: 'polish',
    evidence: 'doc 11 section 5.3 (S2 Ursynow top-down box, 1,450 PLN per m3)',
  },
  {
    group: 'tunnel',
    id: 'minedCavern',
    label: 'Mined cavern',
    description: 'A cavern dug by hand and roadheader, wide enough for three tracks while the mandate lasts.',
    practice: 'california',
    evidence: 'doc 05 section 3.1 and doc 11 section 6.2 (The Portal: three-track mined tunnel, about 190 m2)',
  },
  {
    group: 'station',
    id: 'compactBox',
    label: 'Compact box',
    description: 'A box as long as the train with one platform level. The standard Warsaw station.',
    practice: 'polish',
    evidence: 'doc 11 section 6.3 (Warsaw M2 extensions: about 290 mln PLN per station)',
  },
  {
    group: 'station',
    id: 'mezzanineBox',
    label: 'Box with full mezzanine',
    description: 'A longer, deeper box with a concourse the size of the platform above the platform.',
    practice: 'california',
    evidence: 'doc 06 section 3.3 (TCP: boxes 2 to 2.6 platform lengths) and section 7.5 (station lever 1.6 in the Bay Area)',
  },
];

const OPTION_BY_ID = new Map<DesignOptionId, DesignOptionDef>(DESIGN_OPTIONS.map((o) => [o.id, o]));

export function designOption(id: DesignOptionId): DesignOptionDef {
  const o = OPTION_BY_ID.get(id);
  if (!o) throw new Error(`sim: unknown design option "${id}"`);
  return o;
}

/** Reforms that must be enacted before an option may be chosen under profile `p`. Empty: available now. */
export function optionLocks(id: DesignOptionId, p: Profile): string[] {
  if (id === 'twinBore') {
    const locks: string[] = [];
    // A 6.6 m tube holds one track: two of them cannot carry the three-track mandate.
    if (p['design.threeTrack'] > 0) locks.push('twoTracks');
    // And the agency's standard must allow two small tubes at all. The second playtest could pick the twin bore
    // for free once the third track was gone, which left "Twin-bore standard" a reform that bought nothing.
    if (p['design.twinBoreDefault'] <= 0) locks.push('twinBoreStandard');
    return locks;
  }
  if (id === 'compactBox' && p['design.oversizeStations'] > 0) return ['noMezzanines'];
  return [];
}

/** Design options a reform unlocks (static: the inverse of optionLocks). */
export function reformUnlocks(reformId: string): DesignOptionId[] {
  if (reformId === 'twinBoreStandard') return ['twinBore'];
  if (reformId === 'noMezzanines') return ['compactBox'];
  return [];
}

export function lockTitles(ids: readonly string[]): { reformId: string; title: string }[] {
  return ids.map((reformId) => ({ reformId, title: reformById(reformId)?.title ?? reformId }));
}

/** Method a new underground segment gets when nobody chose one: twin bore once the standard allows it, else the mined cavern. */
export function defaultMethod(p: Profile): Method {
  return p['design.threeTrack'] <= 0 && p['design.twinBoreDefault'] > 0 ? 'boredTwin' : 'mined';
}

/** The tunnel option a project is built to, or 'mixed' when its underground segments differ. Surface segments are ignored. */
export function tunnelOf(project: Pick<ProjectState, 'methods'>, flags: DesignFlags): TunnelOptionId | 'mixed' {
  let found: Method | null = null;
  for (const m of project.methods) {
    if (!isUnderground(m)) continue;
    const e = effectiveMethod(m, flags);
    if (found === null) found = e;
    else if (found !== e) return 'mixed';
  }
  if (found === null) return 'mixed';
  for (const id of TUNNEL_OPTIONS) if (TUNNEL_OPTION_METHOD[id] === found) return id;
  return 'mixed';
}

export function stationBoxOf(flags: DesignFlags): StationBoxId {
  return flags.oversizeStations ? 'mezzanineBox' : 'compactBox';
}

export function isStationBoxId(v: unknown): v is StationBoxId {
  return STATION_BOXES.includes(v as StationBoxId);
}

/** Templates that are a cut-and-cover box and so take the box choice. */
export function hasBox(template: StationTemplate): boolean {
  return template === 'undergroundStandard';
}

/** Drawn and carved size of a station by template and box, metres: along the track, across it, floor to roof. */
export function stationSize(template: StationTemplate, box: StationBoxId): { lengthM: number; widthM: number; heightM: number } {
  switch (template) {
    case 'undergroundStandard':
      return box === 'mezzanineBox'
        ? { lengthM: K.mezzanineBoxLengthM.value, widthM: K.mezzanineBoxWidthM.value, heightM: K.mezzanineBoxHeightM.value }
        : { lengthM: K.compactBoxLengthM.value, widthM: K.compactBoxWidthM.value, heightM: K.compactBoxHeightM.value };
    case 'undergroundDeepMined':
      return { lengthM: 160, widthM: 22, heightM: 14 };
    case 'terminalFitOut':
      return { lengthM: 400, widthM: 50, heightM: 12 };
    case 'inBore':
      return { lengthM: 140, widthM: 16, heightM: 12 };
    case 'elevated':
      return { lengthM: 140, widthM: 14, heightM: 8 };
    default:
      return { lengthM: 140, widthM: 12, heightM: 5 };
  }
}
