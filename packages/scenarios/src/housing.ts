/**
 * Housing and upzoning options of the campus missions (M2): land beside the line the player may open to homes,
 * so the line has riders. FICTIONAL as game options. The places are real; every area, density and position
 * below is typed from memory and UNVERIFIED, and is marked as an assumption in the card the player reads.
 * The riders follow in the sim (housing.ts): homes x trips per home x share on the line, all assumptions.
 */
import type { HousingOptionDef } from '@bayvox/sim';
import { xz } from './helpers.ts';

/**
 * The Redwood City salt works: industrial salt ponds on the bay side of US-101, north of the Dumbarton tracks
 * at Marsh Road. `at` is the south end of the ponds, about 1.7 km from the Marsh Road station of the
 * reference plans (position from memory, UNVERIFIED against the baked map).
 */
export const HOUSING_SALT_WORKS: HousingOptionDef = {
  id: 'saltWorks',
  title: 'Build on the Redwood City salt works',
  blurb: 'A new district on the industrial salt ponds, a bus ride from Marsh Road station. A developer tried once and withdrew.',
  hectares: 160,
  homesPerHectare: 75,
  capitalCost: 30,
  at: xz(37.493, -122.188),
  source:
    'ASSUMPTION: 160 ha of a site of about 570 ha at 75 homes per hectare, 12,000 homes. The order of the withdrawn 2009 proposal for the site, quoted from memory, UNVERIFIED',
};

/** Bay-front land beside Meta at Willow Road, next to the Willow Road station. */
export const HOUSING_META_BAYFRONT: HousingOptionDef = {
  id: 'metaBayfront',
  title: 'Upzone the bay front at Willow Road',
  blurb: 'Six to eight storeys on the warehouse land beside the campus, at the door of the Willow Road station.',
  hectares: 24,
  homesPerHectare: 150,
  capitalCost: 15,
  at: xz(37.479, -122.152),
  source:
    'ASSUMPTION: 24 ha at 150 homes per hectare, 3,600 homes: about twice what was approved on a site of that size there, from memory, UNVERIFIED',
};

/** North Bayshore: the office district around the Googleplex, at the Googleplex station. */
export const HOUSING_NORTH_BAYSHORE: HousingOptionDef = {
  id: 'northBayshore',
  title: 'Homes in North Bayshore',
  blurb: 'Mid-rise blocks on the office parking lots around the Googleplex station. The city plan already allows them.',
  hectares: 65,
  homesPerHectare: 150,
  capitalCost: 20,
  at: xz(37.421, -122.078),
  source:
    'ASSUMPTION: 65 ha at 150 homes per hectare, 9,750 homes: the order of the city precise plan for the district, from memory, UNVERIFIED',
};

/** The blocks around San Antonio Caltrain. */
export const HOUSING_SAN_ANTONIO: HousingOptionDef = {
  id: 'sanAntonioCenter',
  title: 'Upzone around San Antonio station',
  blurb: 'Mid-rise homes over the shopping-centre parking beside San Antonio Caltrain, where the spur starts.',
  hectares: 20,
  homesPerHectare: 150,
  capitalCost: 10,
  at: xz(37.4025, -122.11),
  source: 'ASSUMPTION: 20 ha at 150 homes per hectare, 3,000 homes. Area and density are round numbers, UNVERIFIED',
};
