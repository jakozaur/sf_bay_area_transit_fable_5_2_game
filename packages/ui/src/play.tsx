/** Things that appear during play: the event card and the drive instruments. */
import { TOOL_COMMANDS } from '@bayvox/core';
import { type EventView, playerSource, type TbmView } from '@bayvox/sim';
import type { JSX } from 'preact';
import { Btn, cx, type StoreProps } from './bits.tsx';
import { capital, dateMonth, duration, durationDelta, length, money, moneyDelta, moneyPerKm, ratio } from './format.ts';
import { act, actionButton, command, GEOLOGY_COLORS, missionProject, possessedTbm } from './model.ts';
import { builtNow } from './panels.tsx';

function optionCosts(o: EventView['options'][number]): string[] {
  const parts: string[] = [];
  // A cash call: what the option brings in comes first, what it costs after.
  if (o.gainCents !== undefined && o.gainCents > 0) parts.push(`+${money(o.gainCents)} funds`);
  if (o.costCents !== 0) parts.push(o.gainCents !== undefined && o.gainCents > 0 ? `${money(o.costCents)} fee` : money(o.costCents));
  if (o.delayDays !== 0) parts.push(`${duration(o.delayDays)} delay`);
  if (o.pc !== 0) parts.push(capital(o.pc));
  return parts.length > 0 ? parts : ['Free'];
}

/** The oldest unresolved event, as a card that holds time until the player picks. */
export function EventCard({ store }: StoreProps): JSX.Element | null {
  const s = store.snapshot.value;
  const e = s.events[0];
  if (e === undefined) return null;
  const project = s.projects.find((p) => p.id === e.projectId);
  const fallback = e.options.find((o) => o.id === e.defaultOption);
  return (
    <div class="bv-scrim bv-live" data-testid="event-card">
      <section class="bv-sheet bv-event" role="alertdialog" aria-modal="true" aria-label={e.title}>
        <header class="bv-sheet-head">
          <h2>Event</h2>
          <span class="sub">
            {project?.name ?? e.projectId}
            {s.events.length > 1 && `, ${s.events.length - 1} more waiting`}
          </span>
        </header>
        <div class="bv-sheet-body">
          <h3 class="title" data-testid="event-title">
            {e.title}
          </h3>
          <p class="desc">{e.description}</p>
          <div class="bv-sec">
            {e.options.map((o) => (
              <button
                key={o.id}
                type="button"
                class="bv-choice"
                data-testid={`event-option-${o.id}`}
                disabled={!o.affordable}
                onClick={() => command(store, { t: 'resolveEvent', eventId: e.uid, optionId: o.id })}
              >
                <span class="lab">{o.label}</span>
                <span class="costs">
                  {optionCosts(o).map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </span>
                {!o.affordable && <span class="why">You cannot afford this.</span>}
              </button>
            ))}
          </div>
          <p class="bv-note" data-testid="event-deadline">
            Time stands still until you choose.
            {fallback !== undefined && ` The usual answer: ${fallback.label.replace(/\.$/, '')}.`}
          </p>
          {playerSource(e.evidence) !== '' && <p class="bv-evidence">{playerSource(e.evidence)}</p>}
        </div>
      </section>
    </div>
  );
}

const GATE_COPY = {
  advancePhase: {
    title: 'Go to tender?',
    what: 'Tender fixes two things for the rest of this project: the design (route, tunnel method, stations) and the contract prices (procurement, staffing, utilities). A reform bought after today does not reach them.',
  },
  launchTBM: {
    title: 'Ready to start?',
    what: 'The contracts are let and the site is ready. Reforms still reach what is not under contract: consultants, contingency, the schedule and the machines. You can drive a boring machine yourself or leave it on autopilot.',
  },
  openLine: {
    title: 'Open the line?',
    what: 'Testing is done. Opening closes the books: the receipt then shows what you paid, against the official figure and against Poland.',
  },
} as const;

/** How many reforms the gate card lists: the ones that save this project the most, of those the player can pay for now. */
const GATE_OFFERS = 3;
/** A reform is worth a line on the card when it saves at least this much, or a month. */
const OFFER_MIN_CENTS = 100_000_000;
const OFFER_MIN_DAYS = 30;

/** Whether the gate card is on screen. The backlash box folds to its header then: it never covers the decision. */
export function gateCardShowing(store: StoreProps['store']): boolean {
  const s = store.snapshot.value;
  const project = missionProject(s);
  if (project === null || project.awaiting === null || s.clock.hold !== 'gate') return false;
  if (store.panel.value !== null || store.tool.value.id !== null || store.banner.value !== null) return false;
  if (store.gateDismissed.value === `${project.id}:${project.awaiting}`) return false;
  return actionButton(store, project.nextAction) !== null && project.nextAction.command !== null;
}

/**
 * The gate as a decision, not a button in the corner: what going through it fixes for good, where the project
 * stands, and what the political capital in hand would still buy first. The second playtest clicked through
 * every gate in 29 seconds without being shown one decision, and found by accident that banking capital was best.
 */
export function GateCard({ store }: StoreProps): JSX.Element | null {
  const s = store.snapshot.value;
  const project = missionProject(s);
  if (project === null || project.awaiting === null || !gateCardShowing(store)) return null;
  const key = `${project.id}:${project.awaiting}`;
  const go = actionButton(store, project.nextAction);
  if (go === null) return null;
  const copy = GATE_COPY[project.awaiting];
  const r = project.receipt;
  const offers = s.reforms
    .filter(
      (x) => x.affordable && x.preview !== null && (x.preview.costDeltaCents <= -OFFER_MIN_CENTS || x.preview.daysDelta <= -OFFER_MIN_DAYS),
    )
    .sort((a, b) => (a.preview?.costDeltaCents ?? 0) - (b.preview?.costDeltaCents ?? 0))
    .slice(0, GATE_OFFERS);
  const affordable = s.reforms.filter((x) => x.affordable && x.cost.pc > 0).length;
  const tender = project.awaiting === 'advancePhase';
  return (
    <div class="bv-gatecard bv-live" data-testid="gate-card">
      <section class="bv-sheet" role="dialog" aria-label={copy.title}>
        <header class="bv-sheet-head">
          <h2>{copy.title}</h2>
          <span class="sub">{project.name}: time waits for you</span>
        </header>
        <div class="bv-sheet-body">
          <p class="what" data-testid="gate-what">
            {copy.what}
          </p>
          <ul class="bv-rows">
            <li>
              <span>{r.final ? 'Paid' : 'Estimate at completion'}</span>
              <span class="v" data-testid="gate-estimate">
                {money(r.columns.yours.costCents)}, {moneyPerKm(r.columns.yours.costPerKmCents)}
              </span>
            </li>
            <li>
              <span>Against Poland on this route</span>
              <span class="v">{ratio(r.ratios.yoursToPoland)}</span>
            </li>
            {r.columns.yours.openDate !== '' && (
              <li>
                <span>Opens</span>
                <span class="v">{dateMonth(r.columns.yours.openDate)}</span>
              </li>
            )}
            {tender && (
              <li>
                <span>Design</span>
                <span class="v" data-testid="gate-design-now">
                  {[
                    ...(project.design.tunnel === 'mixed' ? [builtNow(project)] : []),
                    ...project.design.options.filter((o) => o.selected).map((o) => o.label),
                  ].join(', ') || 'as drawn'}
                </span>
              </li>
            )}
          </ul>
          {project.awaiting !== 'openLine' && (
            <div class="bv-sec" data-testid="gate-offers">
              <h3>{capital(s.politicalCapital)} in hand</h3>
              {offers.length === 0 ? (
                <p class="bv-note">
                  {affordable > 0
                    ? 'Nothing you can afford right now saves this project a month or a million.'
                    : 'Not enough for a reform right now. A finished phase pays 15, each month 1.'}
                </p>
              ) : (
                offers.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    class="bv-offer"
                    data-testid={`gate-reform-${x.id}`}
                    onClick={() => store.openReform(x.id)}
                  >
                    <span class="name">{x.title}</span>
                    <span class="cost">{x.cost.pc > 0 ? capital(x.cost.pc) : money(x.cost.cents)}</span>
                    <span class="fx">
                      {[
                        moneyDelta(x.preview?.costDeltaCents ?? 0) === 'no change' ? null : moneyDelta(x.preview?.costDeltaCents ?? 0),
                        durationDelta(x.preview?.daysDelta ?? 0) === 'no change'
                          ? null
                          : `opens ${durationDelta(x.preview?.daysDelta ?? 0)}`,
                      ]
                        .filter((t) => t !== null)
                        .join(', ')}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <footer class="bv-foot">
          <Btn
            testId="gate-later"
            title="Put the card away and look at the map. The gate stays open."
            onClick={() => (store.gateDismissed.value = key)}
          >
            Look around first
          </Btn>
          {tender && (
            <Btn testId="gate-design" onClick={() => store.openPanel('design')}>
              Design
            </Btn>
          )}
          {project.awaiting !== 'openLine' && (
            <Btn testId="gate-reforms" onClick={() => store.openPanel('reforms')}>
              Reforms
            </Btn>
          )}
          <span class="grow" />
          <Btn kind="primary" big testId="gate-go" disabledReason={go.disabledReason} onClick={go.run}>
            {go.label}
          </Btn>
        </footer>
      </section>
    </div>
  );
}

const STOP_TEXT: Readonly<Record<NonNullable<TbmView['stopReason']>, string>> = {
  breakdown: 'Breakdown',
  event: 'Stopped by an event',
  projectDelay: 'Project stopped',
  zeroThrust: 'No thrust',
  corridor: 'At the corridor limit: steer back',
};

function depthText(store: StoreProps['store'], t: TbmView): string {
  try {
    return `${Math.round(store.services.world.groundAt(t.position.x, t.position.z) - t.position.y)} m`;
  } catch {
    // groundAt throws outside the loaded site; the readout says so instead of guessing.
    return 'off site';
  }
}

/** Instrument strip of the possessed machine, bottom centre above the toolbar. */
export function DriveHud({ store }: StoreProps): JSX.Element | null {
  const t = possessedTbm(store);
  if (store.tool.value.id !== 'drive') return null;
  if (t === null) {
    return (
      <div class="bv-drive bv-live" data-testid="drive-hud">
        <div class="cell">
          <span class="s">{store.tool.value.hint !== '' ? store.tool.value.hint : 'No machine possessed.'}</span>
        </div>
      </div>
    );
  }
  const d = t.deviation;
  const control = (c: { thrust?: number; autopilot?: boolean }): void => command(store, { t: 'tbmControl', headingId: t.id, ...c });
  const quarters = Math.round(t.thrust * 4);
  const limit = d.limitM > 0 ? d.limitM : 1;
  // Square-root scale: the first metres off the plan move the dot the most. On a linear scale to the 30 m
  // corridor a machine 2 m off sat on the centre mark and the dial said nothing until it was too late.
  const scale = (v: number): number => Math.sign(v) * Math.sqrt(Math.min(1, Math.abs(v) / limit));
  const dotX = 50 + scale(d.lateralM) * 42;
  const dotY = 50 - scale(d.verticalM) * 42;
  const boredM = t.chainageM - t.fromM;
  const where = `${Math.abs(d.lateralM).toFixed(1)} ${d.lateralM >= 0 ? 'right' : 'left'}, ${Math.abs(d.verticalM).toFixed(1)} ${d.verticalM >= 0 ? 'high' : 'low'}`;
  // What being here costs, or how far the free tolerance reaches (it widens through a bend).
  const price = d.offPlan
    ? d.surchargePct !== undefined && d.surchargePct > 0
      ? `: +${d.surchargePct}% per metre`
      : ': costs extra'
    : d.freeM !== undefined
      ? `, free to ${d.freeM.toFixed(1)} m`
      : '';
  return (
    <section class="bv-drive bv-live" data-testid="drive-hud" aria-label={`Driving ${t.name}`}>
      <div class="cell">
        <span class="k">{t.name}</span>
        <span class="v" data-testid="drive-autopilot">
          {t.autopilot ? 'Autopilot' : 'Manual'}
        </span>
        <span class={cx('s', t.stopReason !== null && 'bv-bad')} data-testid="drive-state">
          {t.stopReason !== null
            ? STOP_TEXT[t.stopReason]
            : `${boredM < 1000 ? `${boredM.toFixed(1)} m` : length(boredM)} of ${length(t.toM - t.fromM)}`}
          {t.downDays > 0 && `, ${duration(t.downDays)}`}
        </span>
      </div>
      <div class="cell">
        <span class="k">Thrust</span>
        <div class="bv-thrust" data-testid="drive-thrust" role="img" aria-label={`Thrust ${quarters} of 4`}>
          {[1, 2, 3, 4].map((q) => (
            <i key={q} class={cx(q <= quarters && 'on')} style={{ height: `${8 + q * 4.5}px` }} />
          ))}
        </div>
        <span class="s">{Math.round(t.thrust * 100)}%</span>
      </div>
      <div class="cell">
        <span class="k">Advance</span>
        <span class="v" data-testid="drive-speed">
          {t.rateMPerDay.toFixed(1)} <small>m/day</small>
        </span>
        <span class="s">of {t.maxRateMPerDay.toFixed(1)} in this ground</span>
      </div>
      <div class="cell">
        <span class="k">Depth</span>
        <span class="v" data-testid="drive-depth">
          {depthText(store, t)}
        </span>
        <span
          class={cx('s', Math.abs(t.gradePct) > t.limits.maxGradePct && t.limits.maxGradePct > 0 && 'bv-bad')}
          data-testid="drive-grade"
        >
          grade {t.gradePct > 0 ? '+' : ''}
          {t.gradePct.toFixed(1)}%{t.limits.maxGradePct > 0 && ` (max ${t.limits.maxGradePct}%)`}
        </span>
      </div>
      <div class="cell">
        <span class="k">Ground at the face</span>
        <span class="s" style={{ color: '#fff', fontSize: '14px' }} data-testid="drive-geology">
          <span class="bv-geo" style={{ background: GEOLOGY_COLORS[t.geology] }} />
          {t.geologyLabel}
        </span>
      </div>
      <div class="cell bv-dev">
        <div class={cx('bv-needle', d.offPlan && 'is-off')} data-testid="drive-needle" role="img" aria-label="Deviation from the plan">
          <span class="dot" style={{ left: `${dotX}%`, top: `${dotY}%` }} />
        </div>
        <div>
          <span class="k">Off the plan</span>
          <div class={cx('v', d.offPlan && 'bv-bad')} data-testid="drive-deviation">
            {d.totalM.toFixed(1)} <small>m</small>
          </div>
          <span class={cx('s', d.offPlan && 'bv-bad')} data-testid="drive-where">
            {where}
          </span>
          <span class={cx('s', d.offPlan && 'bv-bad')} data-testid="drive-price">
            {price.replace(/^[:,] /, '')}
          </span>
        </div>
      </div>
      <div class="cell">
        <div class="bv-keys" data-testid="drive-keys">
          <span>
            <kbd>W</kbd> <kbd>S</kbd>
          </span>
          <span>thrust</span>
          <span>
            <kbd>A</kbd> <kbd>D</kbd>
          </span>
          <span>steer</span>
          <span>
            <kbd>R</kbd> <kbd>F</kbd>
          </span>
          <span>pitch</span>
          <span>
            <kbd>Space</kbd>
          </span>
          <span>autopilot</span>
        </div>
      </div>
      <div class="cell acts">
        <Btn onInk pressed={t.autopilot} testId="drive-toggle-autopilot" onClick={() => control({ autopilot: !t.autopilot })}>
          Autopilot
        </Btn>
        <Btn onInk testId="drive-release" onClick={() => act(store, () => store.services.tools.invoke(TOOL_COMMANDS.driveRelease))}>
          Leave <span class="bv-kbd">Esc</span>
        </Btn>
      </div>
    </section>
  );
}
