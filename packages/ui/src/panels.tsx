/** Tool panel (left) and the side sheets (right): design chooser, project, reforms, receipt. */
import { TOOL_COMMANDS, type ToolId, type ToolOptionSpec } from '@bayvox/core';
import {
  BRANCHES,
  type DesignOptionView,
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
  duration,
  durationDelta,
  length,
  money,
  moneyDelta,
  moneyPerKm,
  percent,
  ratio,
  years,
} from './format.ts';
import { act, actionButton, command, missionProject, selectTool, visibleLines } from './model.ts';

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
              Dug by hand so far: {count(s.handDig.volumeM3)} m3 for {money(s.handDig.cents)}
              {s.handDig.centsPerM3 > 0 && ` at ${money(s.handDig.centsPerM3)} per m3`}. A machine is cheaper.
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
      {picked.length === 0 ? (
        <p class="bv-note">No design chosen yet.</p>
      ) : (
        <ul class="bv-rows">
          {picked.map((o) => (
            <li key={o.id}>
              <span>{o.label}</span>
              <span class="v">{money(o.costCents)}</span>
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

function DesignOption({ store, project, o }: StoreProps & { project: ProjectView; o: DesignOptionView }): JSX.Element {
  const frozen = project.design.frozen;
  const locked = o.lockedBy.length > 0;
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
        <div>{moneyPerKm(o.costPerKmCents)}</div>
        <div>opens in {duration(o.daysToOpen)}</div>
        {!o.selected && (
          <div class={cx(o.deltaCents > 0 && 'bv-bad', o.deltaCents < 0 && 'bv-good')}>
            <b>{moneyDelta(o.deltaCents)}</b>
            {o.deltaDays !== 0 && `, ${durationDelta(o.deltaDays)}`}
          </div>
        )}
      </span>
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
      {o.evidence !== '' && <p class="bv-evidence">{o.evidence}</p>}
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
      <div class="bv-sec">
        <h3>Tunnel</h3>
        {project.design.tunnel === 'mixed' && (
          <p class="bv-note">The line mixes methods segment by segment. Picking one applies it to every underground segment.</p>
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
      <p class="bv-note">Each price is the whole project, all-in, with that one choice changed.</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- project

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
      <div class="bv-sec" data-testid="project-design">
        <h3>Design</h3>
        <ul class="bv-rows">
          {project.design.options
            .filter((o) => o.selected)
            .map((o) => (
              <li key={o.id}>
                <span>{o.label}</span>
                <span class="v">{o.practice === 'polish' ? 'Polish practice' : 'California practice'}</span>
              </li>
            ))}
        </ul>
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
                    ? duration(ph.plannedDays)
                    : ph.gate?.ready === true
                      ? 'ready'
                      : `${duration(ph.daysLeft)} left`}
              </span>
              {(ph.state === 'current' || ph.gate !== null) && (
                <div class="more">
                  {ph.state === 'current' && <Bar value={ph.progress} hi />}
                  {ph.gate?.ready === true && !topIsGate && <GateButton store={store} projectId={project.id} gate={ph.gate} />}
                  {ph.gate?.ready === true && topIsGate && <span class="bv-gate">At the gate. Time waits for you.</span>}
                  {ph.gate?.ready === false && ph.state !== 'done' && <span class="bv-gate">Ends at a gate: {ph.gate.label}.</span>}
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

function reformCost(r: ReformView): string {
  const parts: string[] = [];
  if (r.cost.pc > 0) parts.push(capital(r.cost.pc));
  if (r.cost.cents > 0) parts.push(money(r.cost.cents));
  return parts.length > 0 ? parts.join(' + ') : 'Free';
}

function ReformStop({ store, r, open, onToggle }: StoreProps & { r: ReformView; open: boolean; onToggle: () => void }): JSX.Element {
  const s = store.snapshot.value;
  const project = missionProject(s);
  const title = (id: string): string => s.reforms.find((x) => x.id === id)?.title ?? id;
  const lineLabel = (id: string): string => project?.receipt.lines.find((l) => l.id === id)?.label ?? id;
  const optionLabel = (id: string): string => project?.design.options.find((o) => o.id === id)?.label ?? id;
  const p = r.preview;
  return (
    <li class={cx('bv-reform', `is-${r.status}`)} data-testid={`reform-${r.id}`}>
      <span class="stop" />
      <button type="button" class="bv-reform-head" aria-expanded={open} data-testid={`reform-head-${r.id}`} onClick={onToggle}>
        <span class="title">{r.title}</span>
        <span class="cost">{r.status === 'enacted' ? <span class="bv-tag is-good">Enacted</span> : reformCost(r)}</span>
        {!open && p !== null && (
          <span class="fx">
            {moneyDelta(p.costDeltaCents)}, {durationDelta(p.daysDelta)}
          </span>
        )}
        {!open && r.status === 'locked' && r.blockedReason !== null && <span class="fx">{r.blockedReason}</span>}
      </button>
      {open && (
        <div class="bv-reform-body" data-testid={`reform-body-${r.id}`}>
          <p>{r.description}</p>
          {p !== null && (
            <div class="bv-effect" data-testid={`reform-preview-${r.id}`}>
              <div>
                <div class="k">Cost of the project</div>
                <div class={cx('v', p.costDeltaCents < 0 && 'bv-good', p.costDeltaCents > 0 && 'bv-bad')}>
                  {moneyDelta(p.costDeltaCents)}
                </div>
              </div>
              <div>
                <div class="k">Opening date</div>
                <div class={cx('v', p.daysDelta < 0 && 'bv-good', p.daysDelta > 0 && 'bv-bad')}>{durationDelta(p.daysDelta)}</div>
              </div>
              <div>
                <div class="k">Your cost per km after</div>
                <div class="v">{moneyPerKm(p.costPerKmAfterCents)}</div>
              </div>
              <div>
                <div class="k">Against Poland after</div>
                <div class="v">{ratio(p.ratioToPolandAfter)}</div>
              </div>
            </div>
          )}
          {p === null && r.status !== 'enacted' && <p class="bv-note">No project to measure the effect against yet.</p>}
          {r.receiptLines.length > 0 && <p class="bv-small">Shrinks on the receipt: {r.receiptLines.map(lineLabel).join(', ')}.</p>}
          {r.unlocks.length > 0 && <p class="bv-small">Unlocks in the design chooser: {r.unlocks.map(optionLabel).join(', ')}.</p>}
          {r.prereqs.length > 0 && <p class="bv-small">Needs first: {r.prereqs.map(title).join(', ')}.</p>}
          {r.beyondPoland && <p class="bv-small bv-soft">Goes past documented Polish practice.</p>}
          <p class="bv-evidence">{r.evidence}</p>
          {r.status !== 'enacted' && (
            <>
              <Btn
                kind="primary"
                testId={`enact-${r.id}`}
                disabledReason={r.affordable ? null : (r.blockedReason ?? 'Not available now')}
                onClick={() => command(store, { t: 'enactReform', id: r.id })}
              >
                Enact for {reformCost(r)}
              </Btn>
              {!r.affordable && r.blockedReason !== null && (
                <p class="bv-small bv-bad" data-testid={`reform-blocked-${r.id}`}>
                  {r.blockedReason}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ReformsPanel({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  // Opened from a link that names a reform (a locked design option, a receipt line): start on it.
  const focus = s.reforms.find((r) => r.id === store.reformFocus.peek());
  const [branch, setBranch] = useState<string>(focus?.branch ?? BRANCHES[0].id);
  const [open, setOpen] = useState<string | null>(focus?.id ?? null);
  const inBranch = s.reforms.filter((r) => r.branch === branch);
  return (
    <Sheet store={store} id="reforms" title="Reforms" sub={`${capital(s.politicalCapital)} to spend`}>
      <div class="bv-branches" role="tablist" aria-label="Reform branches">
        {BRANCHES.map((b) => {
          const all = s.reforms.filter((r) => r.branch === b.id);
          const done = all.filter((r) => r.status === 'enacted').length;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              class="bv-branch"
              aria-selected={branch === b.id}
              data-testid={`branch-${b.id}`}
              onClick={() => {
                setBranch(b.id);
                setOpen(null);
              }}
            >
              <span>{b.title}</span>
              <span class="n">
                {done} of {all.length}
              </span>
            </button>
          );
        })}
      </div>
      <ol class="bv-reforms" data-testid="reform-list">
        {inBranch.map((r) => (
          <ReformStop key={r.id} store={store} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
        ))}
      </ol>
      {inBranch.length === 0 && <p class="bv-note">No reforms in this branch.</p>}
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
            <span class="lab">Polish design at Polish prices, no delay</span>
          </td>
          {RECEIPT_COLUMNS.map((id) => (
            <td key={id} class={cx('n', id === 'yours' && 'is-you')}>
              {money(c[id].baseCents)}
            </td>
          ))}
        </tr>
        {receipt.groups.map((g) => {
          const mine = lines.filter((l) => l.group === g.id);
          if (mine.length === 0) return null;
          return (
            <Fragment key={g.id}>
              <tr class="grp" data-testid={`receipt-group-${g.id}`}>
                <td>{g.label}</td>
                {RECEIPT_COLUMNS.map((id) => (
                  <td key={id} class={cx(id === 'yours' && 'is-you')}>
                    {g.cents[id] === 0 ? '' : moneyDelta(g.cents[id])}
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
                      {l.cents[id] === 0 ? <span class="bv-soft">0</span> : moneyDelta(l.cents[id])}
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
      <p class="bv-note">Per route-km, nominal USD at 3.71 PLN/USD, all-in. Every ratio is computed by the model.</p>
      <div class="bv-ratios" data-testid="receipt-ratios">
        <div>
          <div class="v bv-hi" data-testid="ratio-yours">
            {ratio(r.ratios.yoursToPoland)}
          </div>
          <div class="k">you against Poland</div>
        </div>
        <div>
          <div class="v">{ratio(r.ratios.statusQuoToPoland)}</div>
          <div class="k">status quo against Poland</div>
        </div>
        <div>
          <div class="v">{r.ratios.ghostToPoland === null ? 'none' : ratio(r.ratios.ghostToPoland)}</div>
          <div class="k">official figure against Poland</div>
        </div>
      </div>
      <PerKmDims receipt={r} />
      <ReceiptTable store={store} receipt={r} />
      {r.ghost !== null && (
        <p class="bv-evidence" data-testid="receipt-ghost">
          {r.ghost.label}: {money(r.ghost.costCents)}, opening {dateMonth(r.ghost.openDate)}. The model's status quo explains{' '}
          {percent(1 - r.ghost.unexplainedShare)} of it; {percent(Math.abs(r.ghost.unexplainedShare))} is{' '}
          {r.ghost.unexplainedShare >= 0 ? 'unexplained' : 'overshoot'}. {r.ghost.source}
        </p>
      )}
      <p class="bv-note">
        {r.columns.yours.label}: {r.columns.yours.basis} Opens in {years(r.columns.yours.yearsToOpen)}.
      </p>
    </Sheet>
  );
}
