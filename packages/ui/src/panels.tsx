/** Tool panel (left) and the side sheets (right): design chooser, project, reforms, receipt. */
import { TOOL_COMMANDS, type ToolId, type ToolOptionSpec } from '@bayvox/core';
import {
  type DesignOptionView,
  type Method,
  type PhaseView,
  type ProjectView,
  RECEIPT_COLUMNS,
  type Receipt,
  type ReceiptLine,
  type ReformView,
  STATION_BOXES,
  TUNNEL_OPTIONS,
} from '@bayvox/sim';
import { Fragment, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Bar, Btn, cx, Dim, Sheet, type StoreProps } from './bits.tsx';
import {
  capital,
  count,
  dateMonth,
  dateMonthOr,
  duration,
  durationDelta,
  effectText,
  length,
  money,
  moneyCell,
  moneyDelta,
  moneyPerKm,
  percent,
  ratio,
} from './format.ts';
import {
  act,
  actionButton,
  command,
  housingOptions,
  type MachineCard,
  machineOf,
  missionProject,
  reformIsQuiet,
  reformList,
  selectTool,
  visibleLines,
} from './model.ts';

// ---------------------------------------------------------------- tool panel

const TOOL_TITLE: Readonly<Record<ToolId, string>> = {
  plan: 'Plan the alignment',
  station: 'Add a station',
  dig: 'Dig by hand',
  drive: 'Drive',
};

function OptionRow({ store, spec }: StoreProps & { spec: ToolOptionSpec }): JSX.Element {
  const value = store.tool.value.values[spec.key];
  const set = (v: number | string | boolean): void => act(store, () => store.services.tools.setOption(spec.key, v));
  const id = `bv-opt-${spec.key}`;
  if (spec.kind === 'range') {
    return (
      <div class="bv-opt">
        <label for={id}>{spec.label}</label>
        <span class="val" data-testid={`opt-value-${spec.key}`}>
          {String(value)} {spec.unit}
        </span>
        <input
          id={id}
          type="range"
          data-testid={`opt-${spec.key}`}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={Number(value)}
          onInput={(e) => set(Number(e.currentTarget.value))}
        />
      </div>
    );
  }
  if (spec.kind === 'toggle') {
    return (
      <div class="bv-opt">
        <span class="lab">{spec.label}</span>
        <Btn pressed={value === true} testId={`opt-${spec.key}`} onClick={() => set(value !== true)}>
          {value === true ? 'On' : 'Off'}
        </Btn>
      </div>
    );
  }
  // Choices that carry a price or a note are a list with one row each (the station types); bare ones stay a button row.
  const priced = spec.choices.some((c) => c.detail !== undefined || c.note !== undefined);
  if (priced) {
    return (
      <div class="bv-opt">
        <span class="lab">{spec.label}</span>
        <span />
        <div class="bv-picks" data-testid={`opt-${spec.key}`}>
          {spec.choices.map((c) => (
            <button
              key={c.value}
              type="button"
              class="bv-pick"
              aria-pressed={value === c.value}
              disabled={c.disabledReason !== undefined}
              title={c.disabledReason ?? c.note}
              data-testid={`opt-${spec.key}-${c.value}`}
              onClick={() => set(c.value)}
            >
              <span class="name">{c.label}</span>
              <span class="tag" data-testid={`opt-detail-${spec.key}-${c.value}`}>
                {c.detail ?? ''}
              </span>
              {value === c.value && c.note !== undefined && <span class="note">{c.note}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div class="bv-opt">
      <span class="lab">{spec.label}</span>
      <span />
      <div class="bv-choices">
        {spec.choices.map((c) => (
          <Btn
            key={c.value}
            pressed={value === c.value}
            disabledReason={c.disabledReason ?? null}
            testId={`opt-${spec.key}-${c.value}`}
            onClick={() => set(c.value)}
          >
            {c.label}
          </Btn>
        ))}
      </div>
    </div>
  );
}

/** Left panel of the active tool. The drive tool has its own instrument strip instead. */
export function ToolPanel({ store }: StoreProps): JSX.Element | null {
  const tool = store.tool.value;
  if (tool.id === null || tool.id === 'drive') return null;
  const s = store.snapshot.value;
  const project = missionProject(s);
  return (
    <div class="bv-left">
      <section class="bv-sheet bv-live" data-testid={`toolpanel-${tool.id}`} aria-label={TOOL_TITLE[tool.id]}>
        <header class="bv-sheet-head">
          <h2>{TOOL_TITLE[tool.id]}</h2>
          <button type="button" class="bv-close" data-testid="tool-close" onClick={() => selectTool(store, null)}>
            Put away
          </button>
        </header>
        <div class="bv-sheet-body">
          {tool.hint !== '' && (
            <p class="bv-hint" data-testid="tool-hint">
              {tool.hint}
            </p>
          )}
          {tool.id === 'plan' && project !== null && project.checks.problems.length > 0 && (
            <ul class="bv-problems" data-testid="plan-problems">
              {project.checks.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {tool.commands.length > 0 && (
            <div class="bv-cmds">
              {tool.commands.map((c) => (
                <Btn
                  key={c.id}
                  kind={c.id === TOOL_COMMANDS.planUseOfficial ? 'primary' : 'plain'}
                  testId={`cmd-${c.id}`}
                  disabledReason={c.enabled ? null : (c.disabledReason ?? 'Not available now')}
                  onClick={() => act(store, () => store.services.tools.invoke(c.id))}
                >
                  {c.label}
                </Btn>
              ))}
            </div>
          )}
          {tool.readouts.length > 0 && (
            <ul class="bv-rows" data-testid="tool-readouts">
              {tool.readouts.map((r) => (
                <li key={r.id} data-testid={`readout-${r.id}`} class={cx(r.bad && 'bv-bad')}>
                  <span>{r.label}</span>
                  <span class="v">{r.value}</span>
                </li>
              ))}
            </ul>
          )}
          {tool.options.map((o) => (
            <OptionRow key={o.key} store={store} spec={o} />
          ))}
          {tool.id === 'plan' && project !== null && <PlanExtras store={store} project={project} />}
          {tool.id === 'station' && project !== null && <StationList store={store} project={project} />}
          {tool.id === 'dig' && (
            <p class="bv-note" data-testid="dig-total">
              A machine is cheaper.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PlanExtras({ store, project }: StoreProps & { project: ProjectView }): JSX.Element {
  const d = project.design;
  const picked = d.options.filter((o) => o.selected);
  return (
    <div class="bv-sec">
      <h3>Design</h3>
      {d.tunnel === 'mixed' && d.options.length > 0 && <p class="bv-note">Tunnel: {builtNow(project)}.</p>}
      {picked.length === 0 ? (
        <p class="bv-note">No design chosen yet.</p>
      ) : (
        <ul class="bv-rows">
          {picked.map((o) => (
            <li key={o.id}>
              <span>{o.label}</span>
              <span class="v">{o.practice === 'polish' ? 'Polish practice' : 'California practice'}</span>
            </li>
          ))}
        </ul>
      )}
      <Btn testId="open-design" onClick={() => store.openPanel('design')}>
        {d.frozen ? 'See the design' : 'Choose the design'}
      </Btn>
    </div>
  );
}

const METHOD_NAME: Readonly<Record<Method, string>> = {
  boredTwin: 'twin bore',
  boredSingleLarge: 'single large bore',
  cutAndCover: 'cut-and-cover',
  mined: 'mined cavern',
  atGrade: 'surface track',
  viaduct: 'viaduct',
};

/** What the line is built as now, by method and length: "mined cavern 1.03 km, cut-and-cover 1.06 km". */
export function builtNow(project: ProjectView): string {
  const byMethod = new Map<Method, number>();
  for (const g of project.segments) byMethod.set(g.effectiveMethod, (byMethod.get(g.effectiveMethod) ?? 0) + (g.toM - g.fromM));
  return [...byMethod]
    .sort((a, b) => b[1] - a[1])
    .map(([m, len]) => `${METHOD_NAME[m]} ${length(len)}`)
    .join(', ');
}

function StationList({ store, project }: StoreProps & { project: ProjectView }): JSX.Element {
  return (
    <div class="bv-sec">
      <h3>Stations on the line</h3>
      {project.stations.length === 0 && <p class="bv-note">None yet. Click the alignment to place one.</p>}
      {project.stations.map((st) => (
        <div class="bv-item" key={st.id}>
          <span>
            <span class="name">{st.name}</span> <span class="bv-soft bv-small">{Math.round(st.depthM)} m deep</span>
          </span>
          {project.status === 'draft' && (
            <Btn
              testId={`remove-station-${st.id}`}
              onClick={() => command(store, { t: 'removeStation', projectId: project.id, stationId: st.id })}
            >
              Remove
            </Btn>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- design chooser

/** A side view of each machine, 44 x 20: shields as drums with a cutterhead, the roadheader a boom, the excavator an arm. */
function MachineShape({ kind }: { kind: MachineCard['kind'] }): JSX.Element {
  const shield = (y: number, h: number, w: number): JSX.Element => (
    <>
      <rect x={40 - w} y={y} width={w - 4} height={h} rx="1" fill="currentColor" />
      <rect x="37" y={y - 1} width="3" height={h + 2} fill="var(--hi)" />
    </>
  );
  return (
    <svg class="shape" width="44" height="20" viewBox="0 0 44 20" aria-hidden="true">
      {kind === 'twinBore' && (
        <>
          {shield(1, 7, 30)}
          {shield(12, 7, 30)}
        </>
      )}
      {kind === 'singleBore' && shield(2, 16, 36)}
      {kind === 'smallBore' && shield(7, 6, 26)}
      {kind === 'roadheader' && (
        <>
          <rect x="4" y="11" width="20" height="6" rx="1" fill="currentColor" />
          <path d="M22 13 L34 6" stroke="currentColor" stroke-width="3" fill="none" />
          <circle cx="36" cy="5" r="4" fill="var(--hi)" />
        </>
      )}
      {kind === 'excavator' && (
        <>
          <rect x="4" y="9" width="16" height="7" rx="1" fill="currentColor" />
          <rect x="2" y="16" width="20" height="3" rx="1.5" fill="currentColor" />
          <path d="M18 10 L28 3 L36 11" stroke="currentColor" stroke-width="2.5" fill="none" />
          <path d="M33 10 L40 12 L35 17 Z" fill="var(--hi)" />
        </>
      )}
    </svg>
  );
}

/** The machine a tunnel choice brings: what it is, how many, how wide, how fast, what it costs. Spans only: it sits inside a button. */
function MachineLine({ m, id }: { m: MachineCard; id: string }): JSX.Element {
  return (
    <span class="bv-machine" data-testid={`machine-${id}`} data-kind={m.kind}>
      <MachineShape kind={m.kind} />
      <span class="name">{m.name}</span>
      <span class="facts">
        <span>
          <b>{m.count}</b> x <b>{m.diameterM.toFixed(1)} m</b>
        </span>
        <span>
          <b>{m.metresPerDay.toFixed(1)}</b> m/day
        </span>
        <span>
          <b>{money(m.priceCents)}</b>
        </span>
      </span>
      {m.note !== '' && <span class="note">{m.note}</span>}
    </span>
  );
}

function DesignOption({ store, project, o }: StoreProps & { project: ProjectView; o: DesignOptionView }): JSX.Element {
  const frozen = project.design.frozen;
  const locked = o.lockedBy.length > 0;
  const machine = machineOf(o);
  const pick = (): void => {
    const tunnel = TUNNEL_OPTIONS.find((t) => t === o.id);
    const stationBox = STATION_BOXES.find((b) => b === o.id);
    if (tunnel !== undefined) command(store, { t: 'setDesign', projectId: project.id, tunnel });
    else if (stationBox !== undefined) command(store, { t: 'setDesign', projectId: project.id, stationBox });
    else throw new Error(`ui design chooser: unknown option id "${o.id}"`);
  };
  const body = (
    <>
      <span class="name">{o.label}</span>
      <span class="price" data-testid={`design-price-${o.id}`}>
        {money(o.costCents)}
      </span>
      <span class="desc">{o.description}</span>
      <span class="side">
        <div>opens in {duration(o.daysToOpen)}</div>
        {!o.selected && (
          <div class={cx(o.deltaCents > 0 && 'bv-bad', o.deltaCents < 0 && 'bv-good')}>
            <b>{moneyDelta(o.deltaCents)}</b>
            {o.deltaDays !== 0 && `, ${durationDelta(o.deltaDays)}`}
          </div>
        )}
      </span>
      {o.headingDays !== undefined && o.stationDays !== undefined && (
        <span class="time" data-testid={`design-time-${o.id}`}>
          {/* The longer of the two is the construction phase: this says which, so four options with one date make sense. */}
          Tunnel: {duration(o.headingDays)}.{' '}
          {o.stationDays > 0
            ? o.stationDays >= o.headingDays
              ? `Stations: ${duration(o.stationDays)}, they set the date.`
              : `Stations: ${duration(o.stationDays)}; the tunnel sets the date.`
            : 'No stations yet.'}
        </span>
      )}
      {machine !== null && <MachineLine m={machine} id={o.id} />}
      {o.applies === false && (
        <span class="time" data-testid={`design-applies-${o.id}`}>
          No underground station on the line yet, so no price.
        </span>
      )}
      <span class="meta">
        <span class={cx('bv-tag', o.practice === 'polish' ? 'is-ink' : 'is-hi')}>
          {o.practice === 'polish' ? 'Polish baseline' : 'California option'}
        </span>
        {o.selected && <span class="bv-tag is-good">Chosen</span>}
      </span>
    </>
  );
  const cls = cx('bv-option', o.selected && 'is-selected', locked && 'is-locked');
  return (
    <div class="bv-option-wrap">
      {locked || frozen || o.selected ? (
        <div class={cls} data-testid={`design-${o.id}`}>
          {body}
          {locked && (
            <span class="bv-lock" data-testid={`design-lock-${o.id}`}>
              Locked by the status quo. Unlock with:{' '}
              {o.lockedBy.map((l, i) => (
                <Fragment key={l.reformId}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    class="bv-link"
                    data-testid={`design-unlock-${l.reformId}`}
                    onClick={() => store.openReform(l.reformId)}
                  >
                    {l.title}
                  </button>
                </Fragment>
              ))}
            </span>
          )}
        </div>
      ) : (
        <button type="button" class={cls} data-testid={`design-${o.id}`} onClick={pick}>
          {body}
        </button>
      )}
    </div>
  );
}

export function DesignPanel({ store }: StoreProps): JSX.Element {
  const project = missionProject(store.snapshot.value);
  if (project === null || project.design.options.length === 0) {
    return (
      <Sheet store={store} id="design" title="Design">
        <p class="bv-note" data-testid="design-empty">
          Nothing to design yet. Draw an alignment first, or use the official one.
        </p>
        <Btn
          kind="primary"
          testId="design-plan"
          disabledReason={store.toolAvailability.value.plan}
          onClick={() => selectTool(store, 'plan')}
        >
          Draw the alignment
        </Btn>
      </Sheet>
    );
  }
  const tunnel = project.design.options.filter((o) => o.group === 'tunnel');
  const station = project.design.options.filter((o) => o.group === 'station');
  return (
    <Sheet store={store} id="design" title="Design" sub={project.name} wide>
      {project.design.frozen && (
        <p class="bv-hint" data-testid="design-frozen">
          The design went to tender. It can no longer change.
        </p>
      )}
      <p class="bv-note">Each price is the whole project, all-in, with that one choice changed.</p>
      <div class="bv-sec">
        <h3>Tunnel</h3>
        {project.design.tunnel === 'mixed' && (
          <p class="bv-hint" data-testid="design-now">
            Now: {builtNow(project)}, {money(project.receipt.columns.yours.costCents)}.
          </p>
        )}
        {tunnel.map((o) => (
          <DesignOption key={o.id} store={store} project={project} o={o} />
        ))}
      </div>
      <div class="bv-sec">
        <h3>Station box</h3>
        {station.map((o) => (
          <DesignOption key={o.id} store={store} project={project} o={o} />
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- project

/**
 * Housing and upzoning beside the line: each option costs political capital (so it draws backlash), adds homes
 * and so riders. Nothing when the mission has no options.
 */
export function HousingSection({ store }: StoreProps): JSX.Element | null {
  const s = store.snapshot.value;
  const options = housingOptions(s);
  if (options.length === 0) return null;
  return (
    <div class="bv-sec" data-testid="housing">
      <h3>Housing</h3>
      <p class="bv-note">Homes near a station become riders.</p>
      <ul class="bv-housing">
        {options.map((o) => (
          <li key={o.id} class={cx(o.enacted && 'is-enacted')} data-testid={`housing-${o.id}`}>
            <b>{o.title}</b>
            <span class="bv-small">{o.blurb}</span>
            <span class="nums">
              +{count(o.homes)} homes, +{count(o.ridersPerDayAdded)} riders a day
            </span>
            {o.enacted ? (
              <span class="bv-tag is-good">Enacted</span>
            ) : (
              <Btn
                kind="primary"
                testId={`housing-enact-${o.id}`}
                disabledReason={
                  s.politicalCapital >= o.capitalCost ? null : `Costs ${capital(o.capitalCost)}, you have ${capital(s.politicalCapital)}`
                }
                onClick={() => command(store, { t: 'enactHousing', optionId: o.id })}
              >
                Enact for {capital(o.capitalCost)}
              </Btn>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectPanel({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const project = missionProject(s);
  if (project === null) {
    const a = actionButton(store, s.nextAction);
    return (
      <Sheet store={store} id="project" title="Project">
        <p class="bv-note" data-testid="project-empty">
          No project yet. {s.nextAction.hint}
        </p>
        {a !== null && (
          <Btn kind="primary" testId="project-action" disabledReason={a.disabledReason} onClick={a.run}>
            {a.label}
          </Btn>
        )}
        <HousingSection store={store} />
        <Objectives store={store} />
      </Sheet>
    );
  }
  const a = actionButton(store, project.nextAction);
  // The gate button sits at the top of the sheet; the phase row repeats it only when the sim has not named it as the next action.
  const next = project.nextAction.command;
  const topIsGate = next !== null && (next.t === 'advancePhase' || next.t === 'launchTBM' || next.t === 'openLine');
  return (
    <Sheet store={store} id="project" title="Project" sub={`${project.name}, ${length(project.lengthM)}`}>
      <div class="bv-sec" data-testid="project-next">
        <p class="bv-hint">{project.nextAction.hint !== '' ? project.nextAction.hint : 'Nothing to do on this project right now.'}</p>
        {a !== null && (
          <Btn kind="primary" testId="project-action" disabledReason={a.disabledReason} onClick={a.run}>
            {a.label}
          </Btn>
        )}
      </div>
      <HousingSection store={store} />
      <div class="bv-sec" data-testid="project-design">
        <h3>Design</h3>
        <Btn testId="project-open-design" onClick={() => store.openPanel('design')}>
          {project.design.frozen ? 'See the design' : 'Choose the design'}
        </Btn>
      </div>
      <div class="bv-sec">
        <h3>Phases</h3>
        <ol class="bv-phases" data-testid="phases">
          {project.phases.map((ph) => (
            <li key={ph.id} class={cx('bv-phase', `is-${ph.state}`)} data-testid={`phase-${ph.id}`}>
              <span class="dot" />
              <span class="name">{ph.label}</span>
              <span class="when">
                {ph.state === 'done'
                  ? 'done'
                  : ph.state !== 'current'
                    ? ph.daysLeft < ph.plannedDays
                      ? `${duration(ph.daysLeft)} left of ${duration(ph.plannedDays)}`
                      : duration(ph.plannedDays)
                    : ph.gate?.ready === true
                      ? 'ready'
                      : `${duration(ph.daysLeft)} left`}
              </span>
              {(ph.state === 'current' || ph.gate !== null) && (
                <div class="more">
                  {ph.state === 'current' && <Bar value={ph.progress} hi />}
                  {ph.gate?.ready === true && !topIsGate && <GateButton store={store} projectId={project.id} gate={ph.gate} />}
                </div>
              )}
            </li>
          ))}
        </ol>
        {project.delayDays > 0 && (
          <p class="bv-bad bv-small" data-testid="project-delay">
            <b>Stopped for {duration(project.delayDays)}.</b> Overhead keeps burning.
          </p>
        )}
      </div>
      {project.tbms.length > 0 && (
        <div class="bv-sec">
          <h3>Headings</h3>
          {project.tbms.map((t) => (
            <div class="bv-item" key={t.id} data-testid={`tbm-${t.id}`}>
              <span>
                <span class="name">{t.name}</span>{' '}
                <span class={cx('bv-small', t.status === 'stopped' ? 'bv-bad' : 'bv-soft')}>
                  {t.status === 'done' ? 'broke through' : t.status === 'stopped' ? 'stopped' : `${Math.round(t.rateMPerDay)} m/day`}
                </span>
              </span>
              <span class="acts">
                <Btn
                  testId={`watch-${t.id}`}
                  onClick={() => act(store, () => store.services.camera.follow({ entity: { type: 'tbm', id: t.id }, mode: 'cutaway' }))}
                >
                  Watch
                </Btn>
                <Btn
                  testId={`drive-${t.id}`}
                  disabledReason={t.status === 'done' ? 'This drive is finished' : store.toolAvailability.value.drive}
                  onClick={() => selectTool(store, 'drive', t.id)}
                >
                  Drive
                </Btn>
              </span>
              <Bar value={t.progress} />
            </div>
          ))}
        </div>
      )}
      {project.stations.length > 0 && (
        <div class="bv-sec">
          <h3>Stations</h3>
          {project.stations.map((st) => (
            <div class="bv-item" key={st.id} data-testid={`station-${st.id}`}>
              <span class="name">{st.name}</span>
              <span class="bv-small bv-soft">
                {st.open ? 'open' : st.progress >= 1 ? `fit-out ${percent(st.fitOut)}` : `structure ${percent(st.progress)}`}
              </span>
              <Bar value={st.progress >= 1 ? st.fitOut : st.progress} />
            </div>
          ))}
        </div>
      )}
      <div class="bv-sec">
        <h3>Money</h3>
        <ul class="bv-rows">
          <li>
            <span>Spent so far</span>
            <span class="v" data-testid="project-spent">
              {money(project.spentCents)}
            </span>
          </li>
          {project.escalationCents > 0 && (
            <li>
              <span>of which escalation</span>
              <span class="v">{money(project.escalationCents)}</span>
            </li>
          )}
          {s.ledger.funding.map((f) => (
            <li key={f.id}>
              <span>
                {f.name} <span class="bv-soft bv-small">{f.released ? 'released' : `released after ${f.release}`}</span>
              </span>
              <span class={cx('v', !f.released && 'bv-soft')}>{money(f.amountCents)}</span>
            </li>
          ))}
          {(s.ledger.raisedCents ?? 0) > 0 && (
            <li data-testid="project-raised">
              <span>Emergency funding</span>
              <span class="v">{money(s.ledger.raisedCents ?? 0)}</span>
            </li>
          )}
        </ul>
      </div>
      <Objectives store={store} />
    </Sheet>
  );
}

function GateButton({ store, projectId, gate }: StoreProps & { projectId: string; gate: NonNullable<PhaseView['gate']> }): JSX.Element {
  return (
    <Btn kind="primary" testId={`gate-${gate.command}`} onClick={() => command(store, { t: gate.command, projectId })}>
      {gate.label}
    </Btn>
  );
}

export function Objectives({ store }: StoreProps): JSX.Element | null {
  const list = store.snapshot.value.objectives;
  if (list.length === 0) return null;
  return (
    <div class="bv-sec">
      <h3>Objectives</h3>
      <ul class="bv-objectives" data-testid="objectives">
        {list.map((o) => (
          <li key={o.id} class={cx(`is-${o.status}`, o.stretch && 'is-stretch')}>
            <span class="box" />
            <span>{o.title}</span>
            {o.detail !== '' && <span class="detail">{o.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- reforms

/** The tunnel option the Polish baseline builds. The reform that allows it also selects it (owner decision 3). */
const TWIN_BORE = 'twinBore';

function reformCost(r: ReformView): string {
  const parts: string[] = [];
  if (r.cost.pc > 0) parts.push(capital(r.cost.pc));
  if (r.cost.cents > 0) parts.push(money(r.cost.cents));
  return parts.length > 0 ? parts.join(' + ') : 'Free';
}

/** What a reform is worth on this project, in the words of the row: "saves $1.20B, 7 months sooner". */
function reformWorth(r: ReformView): string {
  const p = r.preview;
  if (p === null) return '';
  const what = r.effects.length > 0 ? effectText(r.effects[0]) : 'No effect';
  if (reformIsQuiet(r)) return `${what}: nothing on this project`;
  const cost =
    Math.round(p.costDeltaCents / 100) === 0
      ? null
      : p.costDeltaCents < 0
        ? `saves ${money(-p.costDeltaCents)}`
        : `adds ${money(p.costDeltaCents)}`;
  const days = Math.round(p.daysDelta) === 0 ? null : durationDelta(p.daysDelta);
  // A reform that only costs money on the estimate must say what the money buys: the second playtest read
  // "+$20.0M" on five rows and had no reason to buy any of them.
  const onlyCosts = p.costDeltaCents > 0 && p.daysDelta >= 0;
  return `${[cost, days].filter((x) => x !== null).join(', ')}${onlyCosts ? `. Buys: ${what.charAt(0).toLowerCase()}${what.slice(1)}` : ''}`;
}

/** One reform: a row that says what it saves here, what it costs and enacts it; the row opens to the fine print. */
function ReformRow({ store, r, open, onToggle }: StoreProps & { r: ReformView; open: boolean; onToggle: () => void }): JSX.Element {
  const s = store.snapshot.value;
  const project = missionProject(s);
  const title = (id: string): string => s.reforms.find((x) => x.id === id)?.title ?? id;
  const option = (id: string) => project?.design.options.find((o) => o.id === id);
  const p = r.preview;
  const quiet = reformIsQuiet(r);
  const notes = p?.notes ?? [];
  // The sim says why (the design note among them); the old design-branch rule stays for snapshots without notes.
  const tooLate = notes.length === 0 && r.status !== 'enacted' && r.branch === 'design' && project?.design.frozen === true;
  // The twin bore needs no trip to the design chooser: the sim selects it with the reform while the design can change.
  const twin = r.unlocks.includes(TWIN_BORE) ? option(TWIN_BORE) : undefined;
  const picksTwin = twin !== undefined && !twin.selected && project?.design.frozen === false && r.status !== 'enacted';
  const chooser = r.unlocks.filter((id) => id !== TWIN_BORE);
  const twinMachine = machineOf(twin);
  return (
    <li class={cx('bv-reform', `is-${r.status}`)} data-testid={`reform-${r.id}`}>
      <span class="stop" />
      <div class="bv-reform-row">
        <button type="button" class="bv-reform-head" aria-expanded={open} data-testid={`reform-head-${r.id}`} onClick={onToggle}>
          <span class="title">{r.title}</span>
          {p !== null && (
            <span class={cx('fx', !quiet && p.costDeltaCents < 0 && 'is-saving')} data-testid={`reform-fx-${r.id}`}>
              {reformWorth(r)}
            </span>
          )}
          {r.status === 'locked' && r.blockedReason !== null && <span class="fx">{r.blockedReason}</span>}
        </button>
        {r.status === 'enacted' ? (
          <span class="bv-tag is-good">Enacted</span>
        ) : (
          <>
            <span class="cost" data-testid={`reform-cost-${r.id}`}>
              costs {reformCost(r)}
            </span>
            <Btn
              kind="primary"
              testId={`enact-${r.id}`}
              label={`Enact ${r.title} for ${reformCost(r)}`}
              disabledReason={r.affordable ? null : (r.blockedReason ?? 'Not available now')}
              onClick={() => command(store, { t: 'enactReform', id: r.id })}
            >
              Enact
            </Btn>
          </>
        )}
      </div>
      {open && (
        <div class="bv-reform-body" data-testid={`reform-body-${r.id}`}>
          <p>{r.description}</p>
          <ul class="bv-fxlist" data-testid={`reform-effects-${r.id}`}>
            {r.effects.map((e) => (
              <li key={`${e.key}${e.op}`}>{effectText(e)}</li>
            ))}
          </ul>
          {tooLate && (
            <p class="bv-small bv-bad" data-testid={`reform-late-${r.id}`}>
              <b>Too late for {project?.name}:</b> its design went to tender and is built as tendered.
            </p>
          )}
          {notes.length > 0 && r.status !== 'enacted' && (
            <ul class="bv-notes" data-testid={`reform-notes-${r.id}`}>
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {quiet && <p class="bv-note">No effect on this project.</p>}
          {p !== null && !quiet && (
            <div class="bv-effect" data-testid={`reform-preview-${r.id}`}>
              <div>
                <div class="k">Cost</div>
                <div class={cx('v', p.costDeltaCents < 0 && 'bv-good', p.costDeltaCents > 0 && 'bv-bad')}>
                  {moneyDelta(p.costDeltaCents)}
                </div>
              </div>
              <div>
                <div class="k">Opens</div>
                <div class={cx('v', p.daysDelta < 0 && 'bv-good', p.daysDelta > 0 && 'bv-bad')}>{durationDelta(p.daysDelta)}</div>
              </div>
            </div>
          )}
          {p === null && r.status !== 'enacted' && <p class="bv-note">No project to measure the effect against yet.</p>}
          {picksTwin && (
            <p class="bv-small" data-testid={`reform-picks-${r.id}`}>
              Enacting it switches this line to: {twin.label}.
            </p>
          )}
          {twinMachine !== null && <MachineLine m={twinMachine} id={r.id} />}
          {chooser.length > 0 && (
            <p class="bv-small">Unlocks in the design chooser: {chooser.map((id) => option(id)?.label ?? id).join(', ')}.</p>
          )}
          {r.prereqs.length > 0 && <p class="bv-small">Needs first: {r.prereqs.map(title).join(', ')}.</p>}
          {r.beyondPoland && <p class="bv-small bv-soft">Beyond Polish practice.</p>}
          {r.status !== 'enacted' && !r.affordable && r.blockedReason !== null && (
            <p class="bv-small bv-bad" data-testid={`reform-blocked-${r.id}`}>
              {r.blockedReason}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function ReformsPanel({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const { list, noEffect } = reformList(s.reforms);
  // Opened from a link that names a reform (a locked design option, a receipt line): start on it.
  const focus = s.reforms.find((r) => r.id === store.reformFocus.peek());
  const [open, setOpen] = useState<string | null>(focus?.id ?? null);
  const [folded, setFolded] = useState(focus === undefined || !noEffect.some((r) => r.id === focus.id));
  const row = (r: ReformView): JSX.Element => (
    <ReformRow key={r.id} store={store} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
  );
  return (
    <Sheet store={store} id="reforms" title="Reforms" sub={`${capital(s.politicalCapital)} to spend, time waits`}>
      {missionProject(s) !== null && <p class="bv-note">Biggest saving on this line first.</p>}
      <ol class="bv-reforms" data-testid="reform-list">
        {list.map(row)}
      </ol>
      {s.reforms.length === 0 && <p class="bv-note">No reforms in this mission.</p>}
      {noEffect.length > 0 && (
        <div class="bv-sec">
          <button type="button" class="bv-fold" aria-expanded={!folded} data-testid="reforms-noeffect" onClick={() => setFolded(!folded)}>
            No effect on this line ({noEffect.length})
          </button>
          {!folded && (
            <ol class="bv-reforms" data-testid="reform-list-noeffect">
              {noEffect.map(row)}
            </ol>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- receipt

const STATUS_TAG: Readonly<Record<ReceiptLine['status'], { text: string; cls: string }>> = {
  paid: { text: 'paid in full', cls: 'is-bad' },
  reduced: { text: 'reduced', cls: 'is-hi' },
  removed: { text: 'removed', cls: 'is-good' },
};

/** The receipt as a table: base, the four factor groups with their lines, the total and the per-km row. */
export function ReceiptTable({ store, receipt }: StoreProps & { receipt: Receipt }): JSX.Element {
  const lines = visibleLines(receipt.lines);
  const c = receipt.columns;
  // The waterfall applies the price level first (the Polish design at Bay Area prices), then design, levers and
  // delay on top of it. The table is read top to bottom, so it lists them in that order: shown last, the 1.61
  // looked like 3 percent of the gap and the rows did not multiply out (second playtest).
  const groups = [...receipt.groups].sort((a, b) => Number(b.id === 'priceLevel') - Number(a.id === 'priceLevel'));
  return (
    <table class="bv-receipt" data-testid="receipt-table">
      <thead>
        <tr>
          <th scope="col">What you pay for</th>
          {RECEIPT_COLUMNS.map((id) => (
            <th key={id} scope="col" class={cx(id === 'yours' && 'is-you')} title={c[id].basis}>
              {c[id].label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <span class="lab">Polish design, Polish prices</span>
          </td>
          {RECEIPT_COLUMNS.map((id) => (
            <td key={id} class={cx('n', id === 'yours' && 'is-you')}>
              {money(c[id].baseCents)}
            </td>
          ))}
        </tr>
        {groups.map((g) => {
          const mine = lines.filter((l) => l.group === g.id);
          if (mine.length === 0) return null;
          return (
            <Fragment key={g.id}>
              <tr class="grp" data-testid={`receipt-group-${g.id}`}>
                <td>{g.label}</td>
                {RECEIPT_COLUMNS.map((id) => (
                  <td key={id} class={cx(id === 'yours' && 'is-you')}>
                    {moneyCell(g.cents[id]) === '0' ? '' : moneyCell(g.cents[id])}
                  </td>
                ))}
              </tr>
              {mine.map((l) => (
                <tr key={l.id} data-testid={`receipt-line-${l.id}`}>
                  <td>
                    <span class="lab">{l.label}</span>{' '}
                    {l.factor.statusQuo !== 1 && <span class="bv-soft bv-small">{ratio(l.factor.statusQuo)} under the status quo</span>}
                    <div class="by">
                      {(l.cents.statusQuo !== 0 || l.cents.yours !== 0) && (
                        <span class={cx('bv-tag', STATUS_TAG[l.status].cls)}>{STATUS_TAG[l.status].text}</span>
                      )}
                      {l.reforms.length === 0 ? (
                        <span>No reform removes this.</span>
                      ) : (
                        l.reforms.map((r) =>
                          r.enacted ? (
                            <span key={r.id} class="bv-chip is-done" title="Enacted" data-testid={`receipt-reform-done-${r.id}`}>
                              {r.title}
                            </span>
                          ) : (
                            <button
                              key={r.id}
                              type="button"
                              class="bv-chip"
                              title="Not enacted. Open reforms."
                              data-testid={`receipt-reform-${r.id}`}
                              onClick={() => store.openReform(r.id)}
                            >
                              {r.title}
                            </button>
                          ),
                        )
                      )}
                    </div>
                  </td>
                  {RECEIPT_COLUMNS.map((id) => (
                    <td key={id} class={cx('n', id === 'yours' && 'is-you')}>
                      {moneyCell(l.cents[id]) === '0' ? <span class="bv-soft">0</span> : moneyCell(l.cents[id])}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          );
        })}
        <tr class="tot" data-testid="receipt-total">
          <td>{receipt.final ? 'All-in cost' : 'All-in cost, estimate'}</td>
          {RECEIPT_COLUMNS.map((id) => (
            <td key={id} class={cx(id === 'yours' && 'is-you')} data-testid={`receipt-total-${id}`}>
              {money(c[id].costCents)}
            </td>
          ))}
        </tr>
        <tr class="perkm" data-testid="receipt-length">
          <td>route length</td>
          {RECEIPT_COLUMNS.map((id) => (
            <td key={id} class={cx(id === 'yours' && 'is-you')}>
              {length(c[id].lengthKm * 1000)}
            </td>
          ))}
        </tr>
        <tr class="perkm">
          <td>per route-km</td>
          {RECEIPT_COLUMNS.map((id) => (
            <td key={id} class={cx(id === 'yours' && 'is-you')}>
              {moneyPerKm(c[id].costPerKmCents)}
            </td>
          ))}
        </tr>
        <tr class="perkm">
          <td>opens</td>
          {RECEIPT_COLUMNS.map((id) => (
            <td key={id} class={cx(id === 'yours' && 'is-you')}>
              {c[id].openDate === '' ? '' : dateMonth(c[id].openDate)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** Cost per route-km of the three model columns and the ghost, as dimension lines to one scale. */
export function PerKmDims({ receipt }: { receipt: Receipt }): JSX.Element {
  const c = receipt.columns;
  const g = receipt.ghost;
  const max = Math.max(c.yours.costPerKmCents, c.statusQuo.costPerKmCents, c.poland.costPerKmCents, g?.costPerKmCents ?? 0, 1);
  return (
    <div class="bv-dims" data-testid="perkm-dims">
      <Dim who={c.yours.label} value={moneyPerKm(c.yours.costPerKmCents)} share={c.yours.costPerKmCents / max} tone="you" />
      {g !== null && <Dim who={g.label} value={moneyPerKm(g.costPerKmCents)} share={g.costPerKmCents / max} tone="ghost" />}
      <Dim who={c.statusQuo.label} value={moneyPerKm(c.statusQuo.costPerKmCents)} share={c.statusQuo.costPerKmCents / max} tone="plain" />
      <Dim who={c.poland.label} value={moneyPerKm(c.poland.costPerKmCents)} share={c.poland.costPerKmCents / max} tone="plain" />
    </div>
  );
}

export function ReceiptPanel({ store }: StoreProps): JSX.Element {
  const project = missionProject(store.snapshot.value);
  if (project === null || project.receipt.columns.poland.costCents <= 0) {
    return (
      <Sheet store={store} id="receipt" title="Receipt">
        <p class="bv-note" data-testid="receipt-empty">
          Nothing to bill yet. The receipt appears once a line is drawn.
        </p>
      </Sheet>
    );
  }
  const r = project.receipt;
  return (
    <Sheet store={store} id="receipt" title="Receipt" sub={r.final ? 'final' : 'estimate at completion'} wide>
      <p class="bv-note">All-in cost per route-km. Poland is this route and these stations built the Polish way at Polish prices.</p>
      <div class="bv-ratios" data-testid="receipt-ratios">
        <div>
          <div class="v bv-hi" data-testid="ratio-yours">
            {ratio(r.ratios.yoursToPoland)}
          </div>
          <div class="k">you vs Poland</div>
        </div>
        <div>
          <div class="v">{ratio(r.ratios.statusQuoToPoland)}</div>
          <div class="k">status quo vs Poland</div>
        </div>
        <div title="The sponsor's figure per route-km against what Poland would pay per route-km for the sponsor's own route: the same number whatever you draw.">
          <div class="v" data-testid="ratio-ghost">
            {r.ratios.ghostToPoland === null ? 'none' : ratio(r.ratios.ghostToPoland)}
          </div>
          <div class="k">official plan vs Poland</div>
        </div>
      </div>
      <PerKmDims receipt={r} />
      <ReceiptTable store={store} receipt={r} />
      {r.ghost !== null && (
        <p class="bv-evidence" data-testid="receipt-ghost">
          {r.ghost.label}: {money(r.ghost.costCents)} for {length(r.ghost.lengthKm * 1000)},{' '}
          {dateMonthOr(r.ghost.openDate, '') === '' ? 'no opening date' : `opening ${dateMonth(r.ghost.openDate)}`}.
        </p>
      )}
    </Sheet>
  );
}
