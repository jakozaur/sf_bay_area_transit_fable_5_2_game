/**
 * Event cards. Each is drawn from a documented case (docs/research/07-red-tape-policy.md section 6,
 * 06-construction-costs.md section 2.2, 11-polish-road-costs.md section 5.3). Rates and magnitudes are
 * game tuning scaled down from the worst real cases, so a single card cannot sink a project: UNVERIFIED.
 * Reforms gate cards through the `event.<id>.rate` keys of the profile.
 */
import type { EventId } from './reforms.ts';
import type { Method, PhaseId } from './types.ts';

export interface EventOption {
  id: string;
  label: string;
  /** Cost as a share of the project's unescalated hard cost. */
  hardShare: number;
  delayDays: number;
  /** Political capital spent. */
  pc: number;
}

export interface EventDef {
  id: EventId;
  title: string;
  description: string;
  evidence: string;
  phases: PhaseId[];
  /** Base hazard per year while the project is in one of `phases`, before profile multipliers. */
  annualRate: number;
  maxPerProject: number;
  /** Only projects that build one of these effective methods can draw the card. */
  needsMethod?: Method[];
  /** Card stops one tunnelling machine rather than the whole project. */
  targetsFront?: boolean;
  options: EventOption[];
  /** Applied when the deadline passes without a decision. */
  defaultOption: string;
  deadlineDays: number;
}

export const EVENTS: readonly EventDef[] = [
  {
    id: 'lawsuit',
    title: 'One Man and His Parking Spot',
    description: 'A neighbour sues under the environmental review statute. The claim concerns a driveway.',
    evidence: 'doc 07 section 6 (SF bike plan: 4-year injunction) and section 4 (litigation +1 to +4 years)',
    phases: ['planning', 'permitting', 'procurement'],
    annualRate: 0.15,
    maxPerProject: 1,
    options: [
      { id: 'litigate', label: 'Litigate. The project waits for the court.', hardShare: 0, delayDays: 365, pc: 0 },
      { id: 'settle', label: 'Settle and redesign the driveway.', hardShare: 0.003, delayDays: 60, pc: 10 },
    ],
    defaultOption: 'litigate',
    deadlineDays: 30,
  },
  {
    id: 'utilitySurprise',
    title: 'What Lies Beneath',
    description: 'The trench meets a gas main that is on no drawing. Its owner will look into it.',
    evidence: 'doc 07 section 6 (Van Ness BRT: +3 years, +12 percent; scaled down here)',
    phases: ['utilities', 'construction'],
    annualRate: 0.12,
    maxPerProject: 1,
    needsMethod: ['cutAndCover'],
    options: [
      { id: 'redesign', label: 'Redesign around it.', hardShare: 0.01, delayDays: 180, pc: 0 },
      { id: 'expedite', label: 'Pay the utility to move it this year.', hardShare: 0.03, delayDays: 30, pc: 0 },
    ],
    defaultOption: 'redesign',
    deadlineDays: 30,
  },
  {
    id: 'tbmStuck',
    title: 'The Machine Has Stopped',
    description: 'Settlement above the drive. The TBM stands still while everyone studies the building over it.',
    evidence: 'doc 06 section 2.2 (Lodz: TBM Katarzyna idle since Nov 2024); doc 11 section 4.1 (SR 99: 2-year stoppage)',
    phases: ['construction'],
    annualRate: 0.1,
    maxPerProject: 1,
    needsMethod: ['boredTwin', 'boredSingleLarge'],
    targetsFront: true,
    options: [
      { id: 'grout', label: 'Grout, monitor and wait.', hardShare: 0.005, delayDays: 240, pc: 0 },
      { id: 'rescueShaft', label: 'Sink a rescue shaft.', hardShare: 0.02, delayDays: 90, pc: 0 },
    ],
    defaultOption: 'grout',
    deadlineDays: 30,
  },
  {
    id: 'changeOrder',
    title: 'Change Order No. 47',
    description: 'The contractor has found a difference between the drawings and the planet.',
    evidence: 'doc 06 section 3.3 (Second Avenue design contract +142 percent); doc 07 section 6 (The Twice-Priced Tunnel)',
    phases: ['construction', 'fitOut'],
    annualRate: 0.5,
    maxPerProject: 3,
    options: [
      { id: 'pay', label: 'Pay it.', hardShare: 0.015, delayDays: 0, pc: 0 },
      { id: 'dispute', label: 'Dispute it.', hardShare: 0.005, delayDays: 90, pc: 0 },
    ],
    defaultOption: 'pay',
    deadlineDays: 30,
  },
  {
    id: 'fundingGap',
    title: 'Cap-and-Invest Renegotiation',
    description: 'A committed slice of state funding is now "under review".',
    evidence: 'doc 07 section 6 (The Portal, 2026: $750M state share in doubt, opening slips 1 to 3 years)',
    phases: ['permitting', 'procurement', 'utilities', 'construction'],
    annualRate: 0.06,
    maxPerProject: 1,
    options: [
      { id: 'wait', label: 'Wait for the next budget cycle.', hardShare: 0, delayDays: 270, pc: 0 },
      { id: 'backfill', label: 'Backfill with local money and favours.', hardShare: 0, delayDays: 0, pc: 15 },
    ],
    defaultOption: 'wait',
    deadlineDays: 30,
  },
  {
    id: 'contractorBankruptcy',
    title: 'Lowest Bidder, Highest Price',
    description: 'The firm that won on price has filed for protection from the price.',
    evidence:
      'doc 06 section 2.2 (Lodz: Energopol bankrupt 2019, contract terminated 2026); doc 11 section 5.3 (re-tender +36 to +71 percent, 2 to 3 years; scaled down here)',
    phases: ['construction'],
    annualRate: 0.02,
    maxPerProject: 1,
    options: [
      { id: 'retender', label: 'Terminate and re-tender.', hardShare: 0.03, delayDays: 365, pc: 0 },
      { id: 'stepIn', label: 'Step in and pay the subcontractors directly.', hardShare: 0.08, delayDays: 60, pc: 0 },
    ],
    defaultOption: 'retender',
    deadlineDays: 30,
  },
];

const EVENT_BY_ID = new Map<string, EventDef>(EVENTS.map((e) => [e.id, e]));

export function eventById(id: string): EventDef | undefined {
  return EVENT_BY_ID.get(id);
}
