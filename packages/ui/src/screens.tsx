/** Screens driven by the session state: title with mission select, briefing card, loading, scorecard. */
import type { MissionCard } from '@bayvox/core';
import { playerSource, type ScoreColumn } from '@bayvox/sim';
import { Fragment, type JSX } from 'preact';
import { Bar, Btn, Bullet, cx, Dim, Stars, type StoreProps } from './bits.tsx';
import { count, dateLong, dateMonth, money, moneyPerKm, ratio, years } from './format.ts';
import { BacklashRecord } from './hud.tsx';
import { act, missionProject, POLAND_TARGET_LIMIT, polandTarget, safeRatio, scorecardHousing } from './model.ts';
import { ReceiptTable } from './panels.tsx';

export const GAME_TITLE = 'Polish the Public Transport';
export const TAGLINE = 'Can you build a train to the HQ of the authors of Fable 5.2?';
const TARGET_LINE = `The target: no more than ${POLAND_TARGET_LIMIT}x Poland's cost and ${POLAND_TARGET_LIMIT}x Poland's timeline.`;

/** The mission "Play" starts: the first campaign mission not yet opened, else the first one. Every mission can be picked. */
export function nextMissionToPlay(missions: readonly MissionCard[]): MissionCard | null {
  return missions.find((m) => !m.freeBuild && !m.completed) ?? missions[0] ?? null;
}

/**
 * The quick cost-benefit comparison of the missions, beside the mission list. Costs are Poland-priced and
 * official-style for the reference route; the benefit-cost ratio is the scenarios package's simple one.
 */
function CostBenefit({ store, onPick }: StoreProps & { onPick: (id: string) => void }): JSX.Element | null {
  const rows = store.costBenefit;
  if (rows.length === 0) return null;
  const known = new Set(store.session.value.missions.map((m) => m.id));
  return (
    <section class="bv-cb bv-sheet bv-live" aria-label="Mission comparison" data-testid="cost-benefit">
      <header class="bv-sheet-head">
        <h2>Which line is worth it?</h2>
      </header>
      <div class="bv-cb-body">
        <table>
          <thead>
            <tr>
              <th>Mission</th>
              <th>Length</th>
              <th>Polish price</th>
              <th>Official</th>
              <th>Riders a day</th>
              <th title="Benefit-cost ratio at Polish prices: above 1 the line pays for itself">Benefit / cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.scenarioId}>
                <tr class={cx(r.withHousing !== undefined && 'has-housing')} data-testid={`cb-${r.scenarioId}`}>
                  <td>
                    {known.has(r.scenarioId) ? (
                      <button type="button" class="bv-link" onClick={() => onPick(r.scenarioId)}>
                        {r.name}
                      </button>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td>{r.lengthKm.toFixed(1)} km</td>
                  <td>{money(r.polandCostCents)}</td>
                  <td>{r.officialCostCents > 0 ? money(r.officialCostCents) : 'none'}</td>
                  <td>{count(r.dailyRiders)}</td>
                  <td class={r.benefitCostRatio >= 1 ? 'bv-good' : 'bv-bad'}>
                    <b>{r.benefitCostRatio.toFixed(2)}</b>
                  </td>
                </tr>
                {r.withHousing !== undefined && (
                  <tr class="with-housing" data-testid={`cb-${r.scenarioId}-housing`}>
                    <td colSpan={4}>with housing: +{count(r.withHousing.homes)} homes</td>
                    <td>{count(r.withHousing.dailyRiders)}</td>
                    <td class={r.withHousing.benefitCostRatio >= 1 ? 'bv-good' : 'bv-bad'}>
                      <b>{r.withHousing.benefitCostRatio.toFixed(2)}</b>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TitleScreen({ store }: StoreProps): JSX.Element {
  const session = store.session.value;
  const play = nextMissionToPlay(session.missions);
  const save = session.saves[0];
  const brief = (id: string): void => act(store, () => store.services.session.brief(id));
  let campaignNo = 0;
  return (
    <>
      <main class="bv-title bv-live" data-testid="screen-title">
        <div class="bv-sign">
          <div class="bv-section-mark" title="The Polish baseline: twin bore, 6.6 m">
            <span class="bv-bore" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>Real map. Real prices.</span>
          </div>
          <h1>
            Polish the
            <br />
            Public Transport
          </h1>
          <p class="pitch" data-testid="tagline">
            {TAGLINE}
          </p>
          <p class="target" data-testid="title-target">
            {TARGET_LINE}
          </p>
        </div>
        <div class="bv-title-acts">
          <Btn
            kind="primary"
            big
            testId="title-play"
            disabledReason={play === null ? 'No mission is available' : null}
            onClick={() => play !== null && brief(play.id)}
          >
            {play === null ? 'Play' : `Play ${play.title}`}
          </Btn>
          {save !== undefined && (
            <>
              <Btn big onInk testId="title-continue" onClick={() => act(store, () => store.services.session.load(save.slot))}>
                Continue
              </Btn>
              <span class="save" data-testid="title-save">
                Saved game: {save.title}, {dateLong(save.date)}
              </span>
            </>
          )}
        </div>
        {session.error !== null && (
          <p class="bv-title-error" role="alert" data-testid="session-error">
            {session.error}
          </p>
        )}
        <ol class="bv-missions" aria-label="Missions">
          {session.missions.map((m) => {
            if (!m.freeBuild) campaignNo++;
            return (
              <li key={m.id}>
                <button type="button" class="bv-mission" data-testid={`mission-${m.id}`} onClick={() => brief(m.id)}>
                  <Bullet tone={m.id === play?.id ? 'hi' : undefined}>{m.freeBuild ? '∞' : campaignNo}</Bullet>
                  <span class="name">{m.title}</span>
                  {m.bestStars !== null ? <Stars n={m.bestStars} /> : <span />}
                  <span class="pitch" title={m.pitch}>
                    {m.pitch}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div class="bv-title-foot">
          <span>Map data: OpenStreetMap, Overture Maps, USGS, NOAA.</span>
          <button type="button" class="bv-link on-ink" data-testid="title-credits" onClick={() => store.openPanel('credits')}>
            Credits
          </button>
        </div>
      </main>
      <CostBenefit store={store} onPick={brief} />
    </>
  );
}

export function BriefingScreen({ store }: StoreProps): JSX.Element {
  const session = store.session.value;
  const m = session.missions.find((x) => x.id === session.missionId);
  if (m === undefined) throw new Error(`ui briefing: session.missionId "${session.missionId}" is not in session.missions`);
  const b = m.briefing;
  return (
    <main class="bv-brief" data-testid="screen-briefing">
      <section class="bv-sheet bv-live" aria-label={`Briefing: ${m.title}`}>
        <header class="bv-sheet-head">
          <h2>{m.title}</h2>
          <span class="sub">{m.freeBuild ? 'free build' : 'mission briefing'}</span>
        </header>
        <div class="bv-sheet-body">
          <dl class="bv-brief-facts">
            <dt>The project</dt>
            <dd data-testid="brief-what">{b.what}</dd>
            <dt>Official cost</dt>
            <dd class="ghost" data-testid="brief-cost">
              {b.officialCost}
            </dd>
            <dt>Official date</dt>
            <dd class="ghost" data-testid="brief-date">
              {b.officialDate}
            </dd>
            <dt>Why it matters</dt>
            <dd data-testid="brief-why">{b.why}</dd>
          </dl>
          <p class="bv-note" data-testid="brief-target">
            Get within {POLAND_TARGET_LIMIT}x of Poland on cost and time.
          </p>
          <div class="bv-sec">
            <h3>Objectives</h3>
            <ul class="bv-objectives" data-testid="brief-objectives">
              {m.objectives.map((o) => (
                <li key={o}>
                  <span class="box" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
          {playerSource(b.source) !== '' && <p class="bv-evidence">Source: {playerSource(b.source)}</p>}
          {session.error !== null && (
            <p class="bv-bad" role="alert" data-testid="session-error">
              <b>{session.error}</b>
            </p>
          )}
        </div>
        <footer class="bv-foot">
          <Btn testId="brief-back" onClick={() => act(store, () => store.services.session.toTitle())}>
            Back to missions
          </Btn>
          <span class="grow" />
          <Btn kind="primary" big testId="brief-start" onClick={() => act(store, () => store.services.session.start(m.id))}>
            Start
          </Btn>
        </footer>
      </section>
    </main>
  );
}

export function LoadingScreen({ store }: StoreProps): JSX.Element {
  const l = store.session.value.loading;
  return (
    <div class="bv-loading" role="status" data-testid="screen-loading">
      <div class="label">{l?.label ?? 'Loading'}</div>
      <Bar value={l?.progress ?? 0} />
    </div>
  );
}

function Column({ c, you }: { c: ScoreColumn; you: boolean }): JSX.Element {
  return (
    <div class={cx('bv-col', you && 'is-you')} data-testid={`score-col-${c.kind}`}>
      <span class="who">{c.label}</span>
      <span class="cost">{money(c.costCents)}</span>
      <span class="km">{moneyPerKm(c.costPerKmCents)}</span>
      <span class="date" data-testid={`score-date-${c.kind}`}>
        {c.openDate === '' ? (
          'No opening date'
        ) : (
          <>
            Opens {dateMonth(c.openDate)}
            <span class="bv-soft"> ({years(c.yearsToOpen)})</span>
          </>
        )}
      </span>
    </div>
  );
}

const AXIS_LABEL = { cost: 'Cost', date: 'Date', riders: 'Riders' } as const;

/** Confetti pieces for a line that opened inside the Poland target. A line that missed it gets none. */
const CONFETTI_WIN = 120;
const CONFETTI_COLORS = ['#ff5a1f', '#ffffff', '#d4222b', '#58d29a', '#ffd23f', '#6fb7ff'] as const;

/**
 * A burst of paper over the scorecard when the line opened inside the target. Presentation only: the pieces are laid out from
 * their index, nothing is read from or written to the sim. A piece is invisible until its animation runs, so
 * with reduced motion (the stylesheet turns every animation off) nothing is drawn.
 */
export function Confetti({ pieces }: { pieces: number }): JSX.Element {
  // A fixed low-discrepancy scatter: the same burst every time, no random numbers to seed.
  const frac = (n: number): number => n - Math.floor(n);
  return (
    <div class="bv-confetti" aria-hidden="true" data-testid="confetti" data-pieces={pieces}>
      {Array.from({ length: pieces }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(frac(i * 0.618034) * 100).toFixed(2)}%`,
            width: `${6 + (i % 4) * 2}px`,
            height: `${10 + (i % 3) * 4}px`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(frac(i * 0.381966) * 0.9).toFixed(2)}s`,
            animationDuration: `${(2.2 + frac(i * 0.754878) * 1.6).toFixed(2)}s`,
            '--drift': `${Math.round((frac(i * 0.56984) - 0.5) * 240)}px`,
            '--spin': `${Math.round(360 + frac(i * 0.287) * 900) * (i % 2 === 0 ? 1 : -1)}deg`,
          }}
        />
      ))}
    </div>
  );
}

export function ScorecardScreen({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const project = missionProject(s);
  if (project === null) throw new Error('ui scorecard: the snapshot has no mission project');
  const sc = project.scorecard;
  const cols = [sc.yours, sc.ghost, sc.poland];
  const max = Math.max(...cols.map((c) => c.costPerKmCents), 1);
  const yoursToPoland = safeRatio(sc.yours.costPerKmCents, sc.poland.costPerKmCents);
  // The sponsor's figure is measured against Poland on the sponsor's route (the receipt computes it); a model
  // ghost has no route of its own and is measured on this one.
  const ghostToPoland = project.receipt.ratios.ghostToPoland ?? safeRatio(sc.ghost.costPerKmCents, sc.poland.costPerKmCents);
  const target = polandTarget(project);
  const housing = scorecardHousing(project);
  const session = store.services.session;
  const missions = store.session.value.missions;
  const at = missions.findIndex((m) => m.id === store.session.value.missionId);
  const hasNext = at >= 0 && missions.slice(at + 1).some((m) => !m.freeBuild);
  return (
    <div class="bv-scrim bv-live" data-testid="screen-scorecard">
      {sc.final && target?.met === true && <Confetti pieces={CONFETTI_WIN} />}
      <section class="bv-sheet bv-score" aria-label="Scorecard">
        <header class="bv-sheet-head">
          <h2>{s.mission.title}: scorecard</h2>
          <span class="sub">{sc.final ? 'final' : 'forecast'}</span>
        </header>
        <div class="bv-sheet-body">
          <div class="bv-score-top">
            <p class="verdict" data-testid="score-verdict">
              {sc.verdict}
            </p>
            <span data-testid="score-stars">
              <Stars n={sc.stars} />
            </span>
          </div>
          {sc.starsReason !== undefined && (
            <p class="bv-note" data-testid="score-stars-reason">
              {sc.starsReason}
            </p>
          )}
          {target !== null && (
            <p class={cx('bv-target-line', target.met ? 'is-met' : 'is-missed')} data-testid="score-target">
              <b>
                {target.limit}x Poland target: {target.met ? 'passed' : 'failed'}.
              </b>{' '}
              Cost {ratio(target.costRatio)}, time {ratio(target.timeRatio)}.
            </p>
          )}
          <div class="bv-score-grid">
            <div class="bv-score-side">
              <div class="bv-cols">
                <Column c={sc.yours} you />
                <Column c={sc.ghost} you={false} />
                <Column c={sc.poland} you={false} />
              </div>
              <div class="bv-sec">
                <h3>Cost per route-km, to scale</h3>
                <div class="bv-dims" data-testid="score-dims">
                  <Dim
                    who={sc.yours.label}
                    value={moneyPerKm(sc.yours.costPerKmCents)}
                    share={sc.yours.costPerKmCents / max}
                    tone="you"
                    note={yoursToPoland === null ? undefined : `${ratio(yoursToPoland)} Poland`}
                  />
                  <Dim
                    who={sc.ghost.label}
                    value={moneyPerKm(sc.ghost.costPerKmCents)}
                    share={sc.ghost.costPerKmCents / max}
                    tone="ghost"
                    note={ghostToPoland === null ? undefined : `${ratio(ghostToPoland)} Poland`}
                  />
                  <Dim
                    who={sc.poland.label}
                    value={moneyPerKm(sc.poland.costPerKmCents)}
                    share={sc.poland.costPerKmCents / max}
                    tone="plain"
                  />
                </div>
              </div>
              <div class="bv-axes" data-testid="score-axes">
                {sc.axes.map((a) => (
                  <div key={a.id}>
                    <div class="ax">
                      {AXIS_LABEL[a.id]} <Stars n={a.stars} />
                    </div>
                    {a.reason}
                  </div>
                ))}
              </div>
              <p class="bv-small" data-testid="score-riders">
                <b>{count(sc.ridersPerDay)} riders a day.</b>
                {sc.costPerRiderCents > 0 && ` ${money(sc.costPerRiderCents)} of construction per daily rider.`}
              </p>
              {housing !== null && (
                <p class="bv-small" data-testid="score-housing">
                  <b>Housing you enacted: {count(housing.homes)} homes,</b> {count(housing.ridersPerDayAdded)} of those riders a day come
                  from them.
                </p>
              )}
              <BacklashRecord store={store} />
            </div>
            <div class="bv-score-side">
              <div class="bv-sec">
                <h3>The receipt: where the gap comes from</h3>
                <ReceiptTable store={store} receipt={project.receipt} />
              </div>
            </div>
          </div>
        </div>
        <footer class="bv-foot">
          <Btn testId="score-title" onClick={() => act(store, () => session.toTitle())}>
            Mission select
          </Btn>
          <span class="grow" />
          <Btn testId="score-keep" big onClick={() => act(store, () => session.keepPlaying())}>
            Keep playing
          </Btn>
          <Btn
            kind="primary"
            big
            testId="score-next"
            disabledReason={hasNext ? null : 'This was the last mission. Free build is open.'}
            onClick={() => act(store, () => session.nextMission())}
          >
            Next mission
          </Btn>
        </footer>
      </section>
    </div>
  );
}
