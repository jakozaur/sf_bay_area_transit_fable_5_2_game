/** Things that appear during play: the event card and the drive instruments. */
import { TOOL_COMMANDS } from '@bayvox/core';
import type { EventView, TbmView } from '@bayvox/sim';
import type { JSX } from 'preact';
import { Btn, cx, type StoreProps } from './bits.tsx';
import { capital, duration, length, money } from './format.ts';
import { act, command, GEOLOGY_COLORS, possessedTbm } from './model.ts';

function optionCosts(o: EventView['options'][number]): string[] {
  const parts: string[] = [];
  if (o.costCents !== 0) parts.push(money(o.costCents));
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
          <p class="bv-evidence">{e.evidence}</p>
        </div>
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
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v / limit));
  // Needle: 31 px of travel from the centre to the corridor limit.
  const dotX = 50 + clamp(d.lateralM) * 42;
  const dotY = 50 - clamp(d.verticalM) * 42;
  return (
    <section class="bv-drive bv-live" data-testid="drive-hud" aria-label={`Driving ${t.name}`}>
      <div class="cell">
        <span class="k">{t.name}</span>
        <span class="v" data-testid="drive-autopilot">
          {t.autopilot ? 'Autopilot' : 'Manual'}
        </span>
        <span class={cx('s', t.stopReason !== null && 'bv-bad')} data-testid="drive-state">
          {t.stopReason !== null ? STOP_TEXT[t.stopReason] : `${length(t.chainageM - t.fromM)} of ${length(t.toM - t.fromM)}`}
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
          <span class={cx('s', d.offPlan && 'bv-bad')}>
            {d.offPlan
              ? 'Costs extra here'
              : `${Math.abs(d.lateralM).toFixed(1)} ${d.lateralM >= 0 ? 'right' : 'left'}, ${Math.abs(d.verticalM).toFixed(1)} ${d.verticalM >= 0 ? 'high' : 'low'}`}
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
