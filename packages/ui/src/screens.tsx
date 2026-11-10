/** Screens driven by the session state: title with mission select, briefing card, loading, scorecard. */
import type { MissionCard } from '@bayvox/core';
import type { ScoreColumn } from '@bayvox/sim';
import type { JSX } from 'preact';
import { Bar, Btn, Bullet, cx, Dim, Stars, type StoreProps } from './bits.tsx';
import { count, dateLong, dateMonth, money, moneyPerKm, ratio, years } from './format.ts';
import { act, missionProject, safeRatio } from './model.ts';
import { ReceiptTable } from './panels.tsx';

const PITCH = 'Dig the tunnels the Bay Area keeps planning. Then find out why Poland builds the same thing for a fraction.';

/** The mission "Play" starts: the first unlocked campaign mission not yet opened, else the first unlocked one. */
export function nextMissionToPlay(missions: readonly MissionCard[]): MissionCard | null {
  const open = missions.filter((m) => !m.locked);
  return open.find((m) => !m.freeBuild && !m.completed) ?? open[0] ?? null;
}

export function TitleScreen({ store }: StoreProps): JSX.Element {
  const session = store.session.value;
  const play = nextMissionToPlay(session.missions);
  const save = session.saves[0];
  const brief = (id: string): void => act(store, () => store.services.session.brief(id));
  let campaignNo = 0;
  return (
    <main class="bv-title bv-live" data-testid="screen-title">
      <div class="bv-sign">
        <div class="bv-section-mark" title="The Polish baseline: twin bore, 6.6 m">
          <span class="bv-bore" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>Twin bore, 6.6 m. Real map. Real prices.</span>
        </div>
        <h1>
          Bay Area
          <br />
          Boring
        </h1>
        <p class="pitch">{PITCH}</p>
      </div>
      <div class="bv-title-acts">
        <Btn
          kind="primary"
          big
          testId="title-play"
          disabledReason={play === null ? 'No mission is available' : null}
          onClick={() => play !== null && brief(play.id)}
        >
          Play
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
              <button
                type="button"
                class="bv-mission"
                data-testid={`mission-${m.id}`}
                disabled={m.locked}
                title={m.lockReason ?? undefined}
                onClick={() => brief(m.id)}
              >
                <Bullet tone={m.locked ? 'off' : m.id === play?.id ? 'hi' : undefined}>{m.freeBuild ? '∞' : campaignNo}</Bullet>
                <span class="name">{m.title}</span>
                {m.bestStars !== null ? <Stars n={m.bestStars} /> : <span />}
                {m.locked && m.lockReason !== null ? <span class="lock">{m.lockReason}</span> : <span class="pitch">{m.pitch}</span>}
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
          <p class="bv-note">The official cost and date are the ghost you race. Poland is the par.</p>
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
          <p class="bv-evidence">{b.source}</p>
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
      <span class="date">
        {c.openDate === '' ? 'no date' : `Opens ${dateMonth(c.openDate)}`}
        <span class="bv-soft"> ({years(c.yearsToOpen)})</span>
      </span>
      <span class="src">{c.source}</span>
    </div>
  );
}

const AXIS_LABEL = { cost: 'Cost', date: 'Date', riders: 'Riders' } as const;

export function ScorecardScreen({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const project = missionProject(s);
  if (project === null) throw new Error('ui scorecard: the snapshot has no mission project');
  const sc = project.scorecard;
  const cols = [sc.yours, sc.ghost, sc.poland];
  const max = Math.max(...cols.map((c) => c.costPerKmCents), 1);
  const yoursToPoland = safeRatio(sc.yours.costPerKmCents, sc.poland.costPerKmCents);
  const ghostToPoland = safeRatio(sc.ghost.costPerKmCents, sc.poland.costPerKmCents);
  const session = store.services.session;
  const missions = store.session.value.missions;
  const at = missions.findIndex((m) => m.id === store.session.value.missionId);
  const hasNext = at >= 0 && missions.slice(at + 1).some((m) => !m.freeBuild);
  return (
    <div class="bv-scrim bv-live" data-testid="screen-scorecard">
      <section class="bv-sheet bv-score" aria-label="Scorecard">
        <header class="bv-sheet-head">
          <h2>{s.mission.title}: scorecard</h2>
          <span class="sub">{sc.final ? 'line open, figures final' : 'forecast, the line is not open yet'}</span>
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
            </div>
            <div class="bv-score-side">
              <div class="bv-sec">
                <h3>The receipt: where the gap comes from</h3>
                <ReceiptTable store={store} receipt={project.receipt} />
              </div>
              <p class="bv-note">Nominal USD at 3.71 PLN/USD, all-in. Ratios are computed by the model from these columns.</p>
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
