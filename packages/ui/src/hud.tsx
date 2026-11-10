/** Always-visible HUD: top band, objective strip, toolbar, toasts and the breakthrough banner. */
import { type GameSpeed, TOOL_IDS, type ToolId } from '@bayvox/core';
import { MISSION_STAGES, type MissionStage, PC_PER_MONTH, PC_PHASE_DONE } from '@bayvox/sim';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Bar, Btn, Bullet, cx, type StoreProps } from './bits.tsx';
import type { PanelId } from './contract.ts';
import { capital, compact, count, dateFixed, duration, money, ratio } from './format.ts';
import {
  act,
  actionButton,
  angryCount,
  missionProject,
  POLAND_TARGET_LIMIT,
  polandTarget,
  postKey,
  postStats,
  type SocialPost,
  selectTool,
  socialPosts,
} from './model.ts';
import { nextDecisionBlocked, SPEED_FASTER, SPEED_REGULAR, SPEED_SKIP, timeMode } from './pace.ts';
import { gateCardShowing } from './play.tsx';

/** While a machine is boring. Regular is paced so the whole bore takes about 90 real seconds (pace.ts). */
const BORE_SPEEDS: readonly { speed: GameSpeed; label: string; title: string }[] = [
  { speed: SPEED_REGULAR, label: 'Regular', title: 'The whole bore in about a minute and a half' },
  { speed: SPEED_FASTER, label: 'Faster', title: 'Four times Regular' },
  { speed: SPEED_SKIP, label: 'Skip to end', title: 'Run to the breakthrough. Event cards still stop it.' },
];
const HOLD_TEXT = { event: 'Answer the card', gate: 'Your move' } as const;

export function TopBar({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const speed = store.speed.value;
  const mode = timeMode(s);
  const h = s.headline;
  const project = missionProject(s);
  const target = project === null ? null : polandTarget(project);
  const nav: { id: PanelId; label: string }[] = [
    { id: 'project', label: 'Project' },
    { id: 'reforms', label: 'Reforms' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'menu', label: 'Menu' },
  ];
  return (
    <header class="bv-top bv-live" data-testid="topbar">
      {/* Every number sits in a cell of fixed width: a date, a balance or a ratio that changes moves nothing beside it. */}
      <div class="bv-top-cell is-date">
        <span class="k">Date</span>
        <span class="v" data-testid="hud-date">
          {dateFixed(s.date)}
        </span>
      </div>
      <div class="bv-top-cell is-funds">
        <span class="k">Funds</span>
        <span class={cx('v', s.moneyCents < 0 && 'bv-bad')} data-testid="hud-funds">
          {money(s.moneyCents)}
        </span>
      </div>
      <div
        class="bv-top-cell is-pc"
        title={`Political capital pays for reforms. +${PC_PER_MONTH} a month, +${PC_PHASE_DONE} per finished phase.`}
      >
        <span class="k">Political capital</span>
        <span class="v" data-testid="hud-pc">
          {capital(s.politicalCapital)}
        </span>
      </div>
      {/* One cell of fixed width for both states of the clock: nothing right of it moves when the buttons change. */}
      <fieldset class="bv-speed" aria-label="Time" data-testid="time" data-mode={mode}>
        {mode === 'bore' ? (
          <>
            <Btn
              onInk
              pressed={speed === 0}
              testId="speed-0"
              label="Pause (Space)"
              title="Pause (Space)"
              onClick={() => act(store, () => store.services.time.togglePause())}
            >
              <PauseIcon />
            </Btn>
            {BORE_SPEEDS.map((b) => (
              <Btn
                key={b.speed}
                onInk
                pressed={speed === b.speed}
                testId={`speed-${b.speed}`}
                title={b.title}
                onClick={() => act(store, () => store.services.time.setSpeed(b.speed))}
              >
                {b.label}
              </Btn>
            ))}
          </>
        ) : (
          <Btn
            onInk
            pressed={speed !== 0}
            testId="time-next"
            title="Run time to the next gate or event card (Space)"
            disabledReason={speed !== 0 ? null : nextDecisionBlocked(s)}
            onClick={() => act(store, () => store.services.time.setSpeed(speed !== 0 ? 0 : SPEED_REGULAR))}
          >
            Next decision
          </Btn>
        )}
        {/* Beside the one button there is room to say why time stands; the slot is always there. */}
        {mode === 'decision' && (
          <span class="bv-hold-slot">
            {s.clock.hold !== null && (
              <span class="bv-hold" data-testid="hud-hold">
                {HOLD_TEXT[s.clock.hold]}
              </span>
            )}
          </span>
        )}
      </fieldset>
      <div class="bv-headline" data-testid="headline">
        {h === null || h.polandPerKmCents <= 0 ? (
          <span class="none">Cost against Poland appears once a line is drawn.</span>
        ) : (
          <>
            <span
              class={cx('gap', (target?.costRatio ?? h.ratio) <= POLAND_TARGET_LIMIT ? 'is-met' : 'is-missed')}
              data-testid="headline-ratio"
              title={`Your cost divided by Poland's: this route and these stations built the Polish way at Polish prices. The target is ${POLAND_TARGET_LIMIT}x or less.`}
            >
              {ratio(h.ratio)}
            </span>
            <div
              class="pair bv-target"
              data-testid="hud-target"
              title={`The target: finish at no more than ${POLAND_TARGET_LIMIT}x Poland's cost and ${POLAND_TARGET_LIMIT}x Poland's timeline, on this route.`}
            >
              <span class="k">
                {h.final ? 'Cost' : 'Cost, estimate'} vs Poland, target {POLAND_TARGET_LIMIT}x
              </span>
              <span class="v">
                {target !== null && (
                  <span class={target.timeRatio <= target.limit ? 'is-met' : 'is-missed'} data-testid="hud-target-time">
                    time {ratio(target.timeRatio)}
                  </span>
                )}
              </span>
            </div>
          </>
        )}
      </div>
      <nav class="bv-nav" aria-label="Panels">
        {nav.map((n) => (
          <Btn
            key={n.id}
            onInk
            pressed={store.panel.value === n.id}
            testId={`nav-${n.id}`}
            onClick={() => store.openPanel(store.panel.value === n.id ? null : n.id)}
          >
            {n.label}
          </Btn>
        ))}
      </nav>
    </header>
  );
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
      <rect x="1" y="1" width="3.5" height="12" fill="currentColor" />
      <rect x="7.5" y="1" width="3.5" height="12" fill="currentColor" />
    </svg>
  );
}

const STAGE_LABEL: Readonly<Record<MissionStage, string>> = {
  plan: 'Plan',
  approvals: 'Approvals',
  build: 'Build',
  open: 'Open',
  done: 'Opened',
};
/** The four stops of a mission; 'done' is the state after the last one. */
const STOPS = MISSION_STAGES.filter((st) => st !== 'done');

export function ObjectiveStrip({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const a = s.nextAction;
  const stageIndex = MISSION_STAGES.indexOf(s.mission.stage);
  const button = actionButton(store, a);
  const fallback = s.objectives.find((o) => o.status === 'pending' && !o.stretch);
  const what = a.objective !== '' ? a.objective : (fallback?.title ?? s.mission.title);
  // Political capital that can buy something is said where the eye already is, with the way to spend it.
  const affordable = s.reforms.filter((r) => r.affordable && r.cost.pc > 0).length;
  const offerReforms =
    affordable > 0 && s.projects.length > 0 && s.mission.stage !== 'done' && store.panel.value !== 'reforms' && a.focus !== 'reforms';
  // While a phase runs as a time-lapse there is nothing on the map to watch it by: the strip shows how far it is.
  const project = missionProject(s);
  const phase =
    project !== null && project.status === 'active' && s.clock.hold !== 'gate'
      ? project.phases.find((ph) => ph.state === 'current')
      : undefined;
  const lapse =
    phase !== undefined && phase.id !== 'construction' && (s.clock.mode === 'lapse' || s.clock.hold === 'event') ? phase : undefined;
  return (
    <div class="bv-strip bv-live" data-testid="objective-strip">
      <ol class="bv-stops" aria-label="Mission stages">
        {STOPS.map((st, i) => (
          <li
            key={st}
            class={cx('bv-stop', i < stageIndex && 'is-done', i === stageIndex && 'is-now')}
            aria-current={i === stageIndex ? 'step' : undefined}
          >
            {i > 0 && <span class="link" />}
            <span class="dot" />
            {STAGE_LABEL[st]}
          </li>
        ))}
      </ol>
      <div class="bv-objective">
        <span class="what" data-testid="objective">
          {what}
        </span>
        <span class="hint" data-testid="objective-hint" title={a.hint}>
          {a.hint}
        </span>
        {lapse !== undefined && (
          <span class="bv-lapse" data-testid="phase-progress" title={`${lapse.label}: ${duration(lapse.daysLeft)} left`}>
            <Bar value={lapse.progress} hi />
            <span class="left">{duration(lapse.daysLeft)} left</span>
          </span>
        )}
      </div>
      {offerReforms && (
        <Btn testId="strip-reforms" title="Time waits while the reforms sheet is open" onClick={() => store.openPanel('reforms')}>
          Reforms: {affordable} you can afford
        </Btn>
      )}
      {button !== null && (
        <Btn kind="primary" testId="next-action" disabledReason={button.disabledReason} onClick={button.run}>
          {button.label}
        </Btn>
      )}
    </div>
  );
}

/** Free map area for the label plates: below the two top bars, above the toolbar, inside the side margins. CSS pixels. */
const LABEL_TOP_PX = 150;
const LABEL_BOTTOM_PX = 88;
const LABEL_SIDE_PX = 96;
/** Height of a plate with its pin: how far below an obstacle its point must be for the plate to clear it. */
const LABEL_PLATE_PX = 62;

/**
 * Names on the map for the places the mission is about: the ends of its connect objectives, each with the ring
 * a station must fall inside (the app draws the ring). The first playtest had "add a station within 400 m of
 * 4th and King" and nothing on screen that said where 4th and King is.
 */
export function MapLabels({ store }: StoreProps): JSX.Element | null {
  const targets = store.snapshot.value.mission.targets;
  const hidden = targets.length === 0 || store.tool.value.id === 'drive';
  const latest = useRef(targets);
  latest.current = targets;
  const els = useRef<(HTMLDivElement | null)[]>([]);
  const count = targets.length;
  useEffect(() => {
    if (hidden) return;
    let frame = 0;
    const place = (): void => {
      const list = latest.current;
      // The notice stack, when it holds any: measured once per frame, in the coordinates of the label layer.
      const layer = els.current.find((e) => e !== null && e !== undefined)?.parentElement ?? null;
      const stack = layer?.parentElement?.querySelector('.bv-toasts') ?? null;
      let toasts: { left: number; right: number; bottom: number } | null = null;
      if (layer !== null && stack !== null && stack.childElementCount > 0) {
        const r = stack.getBoundingClientRect();
        const o = layer.getBoundingClientRect();
        toasts = { left: r.left - o.left, right: r.right - o.left, bottom: r.bottom - o.top };
      }
      for (let i = 0; i < list.length; i++) {
        const el = els.current[i];
        const t = list[i];
        if (el === null || el === undefined || t === undefined) continue;
        let y = 0;
        try {
          y = store.services.world.groundAt(t.x, t.z);
        } catch {
          // groundAt throws off the map; the label then sits at datum level, which is where the far map draws the Bay.
        }
        const p = store.services.camera.project({ x: t.x, y, z: t.z });
        const host0 = el.parentElement;
        // A place that is not on screen has no plate: only a point under the bars or the toolbar is held at the edge.
        const off =
          p === null ||
          p.x < 0 ||
          p.y < 0 ||
          (host0 !== null && host0.clientWidth > 0 && (p.x > host0.clientWidth || p.y > host0.clientHeight));
        if (p === null || off) el.style.visibility = 'hidden';
        else {
          // The plate stands above its point. A point under the toolbar or the top bars (or off the sides) keeps
          // its plate at the edge of the free map, so the name of the place the mission is about is never covered.
          const host = el.parentElement;
          const w = host?.clientWidth ?? 0;
          const h = host?.clientHeight ?? 0;
          const x = w > 0 ? Math.min(w - LABEL_SIDE_PX, Math.max(LABEL_SIDE_PX, p.x)) : p.x;
          // Notices stack at the top centre. A plate that would stand under them stands below them while they are up.
          let top = LABEL_TOP_PX;
          if (toasts !== null && Math.abs(x - (toasts.left + toasts.right) / 2) < (toasts.right - toasts.left) / 2 + LABEL_SIDE_PX)
            top = Math.max(top, toasts.bottom + LABEL_PLATE_PX);
          const yPx = h > 0 ? Math.min(h - LABEL_BOTTOM_PX, Math.max(top, p.y)) : p.y;
          el.style.visibility = 'visible';
          el.style.transform = `translate(${Math.round(x)}px, ${Math.round(yPx)}px)`;
          el.classList.toggle('is-edge', x !== p.x || yPx !== p.y);
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
    // The loop reads the newest targets through the ref; it restarts only when their number or visibility changes.
  }, [hidden, count, store]);
  if (hidden) return null;
  return (
    <div class="bv-maplabels" data-testid="map-labels" aria-hidden="true">
      {targets.map((t, i) => (
        <div
          key={`${t.x},${t.z}`}
          class="bv-maplabel"
          ref={(el) => {
            els.current[i] = el;
          }}
          style={{ visibility: 'hidden' }}
        >
          <div class={cx('plate', t.served && 'is-served', t.stretch && 'is-stretch')} data-testid={`map-label-${i}`}>
            <b>{t.name}</b>
            <span>{t.served ? 'station in reach' : 'needs a station'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The three mouse moves of the map camera, said once where a new player looks for them. */
export function CameraHelp({ store }: StoreProps): JSX.Element | null {
  if (store.tool.value.id === 'drive' || store.panel.value !== null) return null;
  return (
    <div class="bv-camhelp" data-testid="camera-help">
      <b>Drag</b> move the map <b>Right-drag</b> turn <b>Wheel</b> zoom
    </div>
  );
}

const TOOL_LABEL: Readonly<Record<ToolId, string>> = { plan: 'Plan', station: 'Station', dig: 'Dig', drive: 'Drive' };

export function Toolbar({ store }: StoreProps): JSX.Element {
  const active = store.tool.value.id;
  const avail = store.toolAvailability.value;
  return (
    <div class="bv-toolbar bv-live" role="toolbar" aria-label="Tools" data-testid="toolbar">
      <div class="grp">
        {TOOL_IDS.map((id, i) => (
          <button
            key={id}
            type="button"
            class="bv-tool"
            data-testid={`tool-${id}`}
            aria-pressed={active === id}
            disabled={avail[id] !== null}
            title={avail[id] ?? `${TOOL_LABEL[id]} (${i + 1})`}
            onClick={() => selectTool(store, active === id ? null : id)}
          >
            <Bullet>{i + 1}</Bullet>
            {TOOL_LABEL[id]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toasts({ store }: StoreProps): JSX.Element {
  // Under a banner (breakthrough, line open) the notices stand below it: the moment is not covered by its own small print.
  return (
    <div
      class={cx('bv-toasts', store.banner.value !== null && 'is-under-banner', store.panel.value !== null && 'is-beside-sheet')}
      role="status"
      aria-live="polite"
      data-testid="toasts"
    >
      {store.toasts.value.map((t) => (
        <button
          key={t.key}
          type="button"
          class={cx('bv-toast bv-live', t.tone !== 'info' && `is-${t.tone}`)}
          title="Dismiss"
          onClick={() => store.dismiss(t.key)}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

/** Posts shown at once; the rest is a count. */
const MAX_POSTS = 4;

function PostStats({ p }: { p: SocialPost }): JSX.Element {
  const st = postStats(p);
  return (
    <span class="stats">
      <b>{compact(st.likes)}</b> likes
    </span>
  );
}

/** "14 people are angry at you". */
export function angryLine(posts: readonly SocialPost[]): string {
  const n = angryCount(posts);
  return n === 1 ? '1 person is angry at you' : `${count(n)} people are angry at you`;
}

/**
 * Social media backlash: a wide box at the bottom centre, above the toolbar, with the pile-on the sim wrote when
 * political capital was spent, newest on top. Posts of one spend arrive one after another (the store staggers
 * them); the newest shakes and the box flashes red. Closing is UI-local. Nothing here takes focus: the buttons
 * are clicked, and a click blurs them. Only the box itself takes pointer events.
 */
export function Backlash({ store }: StoreProps): JSX.Element | null {
  const closed = store.postsClosed.value;
  const pending = store.postsPending.value;
  const arrived = socialPosts(store.snapshot.value).filter((p) => !pending.has(postKey(p)));
  const open = arrived.filter((p) => !closed.has(postKey(p))).reverse();
  if (open.length === 0) return null;
  // Under a gate card or an event card, over the drive view and while a machine bores, the box folds to its
  // header: the count stays, the decision and the machine stay in sight.
  const tool = store.tool.value.id;
  const s = store.snapshot.value;
  const folded = gateCardShowing(store) || tool === 'drive' || s.events.length > 0 || timeMode(s) === 'bore';
  const shown = folded ? 0 : MAX_POSTS;
  const more = open.length - shown;
  const fresh = store.postFresh.value;
  return (
    <aside
      class={cx(
        'bv-backlash bv-live',
        store.panel.value !== null && 'is-beside-sheet',
        tool !== null && tool !== 'drive' && 'is-beside-tool',
        tool === 'drive' && 'is-over-drive',
      )}
      aria-label="Social media backlash"
      data-testid="backlash"
    >
      <div key={`flash-${fresh}`} class="flash" aria-hidden="true" />
      <div class="head">
        <span class="title">Backlash</span>
        <span class="angry" data-testid="backlash-angry">
          {angryLine(arrived)}
        </span>
        {more > 0 && (
          <span class="more" data-testid="backlash-more">
            {shown === 0 ? `${more} ${more === 1 ? 'post' : 'posts'}` : `+${more} more`}
          </span>
        )}
        <button type="button" class="bv-link on-ink" tabIndex={-1} data-testid="backlash-close-all" onClick={() => store.closeAllPosts()}>
          Close all
        </button>
      </div>
      <ul>
        {open.slice(0, shown).map((p) => (
          <li key={postKey(p)} class={cx(postKey(p) === fresh && 'is-fresh')} data-testid={`post-${p.id}`} data-cause={p.cause}>
            <span class="handle">{p.handle}</span>
            <PostStats p={p} />
            <button
              type="button"
              class="x"
              tabIndex={-1}
              aria-label="Close this post"
              data-testid={`post-close-${p.id}`}
              onClick={() => store.closePost(postKey(p))}
            >
              x
            </button>
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** The scorecard's record of the backlash: the count and the last posts of the run, closed or not. */
export function BacklashRecord({ store }: StoreProps): JSX.Element | null {
  const posts = socialPosts(store.snapshot.value);
  if (posts.length === 0) return null;
  const last = posts.slice(-MAX_POSTS).reverse();
  return (
    <div class="bv-sec bv-backlash-record" data-testid="score-backlash">
      <h3>The internet on you: {angryLine(posts)}</h3>
      <ul>
        {last.map((p) => (
          <li key={postKey(p)}>
            <span class="handle">{p.handle}</span>
            <PostStats p={p} />
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
      {posts.length > last.length && <p class="bv-small">+{posts.length - last.length} more posts over the project.</p>}
    </div>
  );
}

/** The breakthrough moment: a white flash and a plate across the upper third. The app adds the sound and the world flash. */
export function Banner({ store }: StoreProps): JSX.Element | null {
  const b = store.banner.value;
  if (b === null) return null;
  const breakthrough = b.kind === 'breakthrough';
  return (
    <>
      <div key={`flash-${b.key}`} class="bv-flash" />
      <div key={b.key} class="bv-banner" role="alert" data-testid="banner">
        <div class="plate">
          <span class="big">{breakthrough ? 'Breakthrough' : 'Line open'}</span>
          <span class="line">{b.text}</span>
        </div>
      </div>
    </>
  );
}
