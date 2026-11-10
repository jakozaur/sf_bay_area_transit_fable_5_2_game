/** Always-visible HUD: top band, objective strip, toolbar, toasts and the breakthrough banner. */
import { GAME_SPEEDS, type GameSpeed, TOOL_IDS, type ToolId } from '@bayvox/core';
import { MISSION_STAGES, type MissionStage } from '@bayvox/sim';
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Bar, Btn, Bullet, cx, type StoreProps } from './bits.tsx';
import type { PanelId } from './contract.ts';
import { capital, dateLong, duration, money, moneyPerKm, ratio } from './format.ts';
import { act, actionButton, missionProject, selectTool } from './model.ts';

const SPEED_LABEL: Readonly<Record<GameSpeed, string>> = { 0: 'Pause', 1: '1x', 10: '10x', 100: '100x' };
const HOLD_TEXT = { event: 'Time waits: answer the card', gate: 'Time waits: your move' } as const;

export function TopBar({ store }: StoreProps): JSX.Element {
  const s = store.snapshot.value;
  const speed = store.speed.value;
  const h = s.headline;
  const nav: { id: PanelId; label: string }[] = [
    { id: 'project', label: 'Project' },
    { id: 'reforms', label: 'Reforms' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'menu', label: 'Menu' },
  ];
  return (
    <header class="bv-top bv-live" data-testid="topbar">
      <div class="bv-top-cell">
        <span class="k">Date</span>
        <span class="v" data-testid="hud-date">
          {dateLong(s.date)}
        </span>
      </div>
      <div class="bv-top-cell">
        <span class="k">Funds</span>
        <span class={cx('v', s.moneyCents < 0 && 'bv-bad')} data-testid="hud-funds">
          {money(s.moneyCents)}
        </span>
      </div>
      <div class="bv-top-cell" title="Political capital: what reforms cost">
        <span class="k">Political capital</span>
        <span class="v" data-testid="hud-pc">
          {capital(s.politicalCapital)}
        </span>
      </div>
      <fieldset class="bv-speed" aria-label="Game speed">
        {GAME_SPEEDS.map((sp) => (
          <Btn
            key={sp}
            onInk
            pressed={speed === sp}
            testId={`speed-${sp}`}
            label={sp === 0 ? 'Pause (Space)' : `Speed ${SPEED_LABEL[sp]}`}
            title={sp === 0 ? 'Pause (Space)' : undefined}
            onClick={() => act(store, () => store.services.time.setSpeed(sp))}
          >
            {sp === 0 ? <PauseIcon /> : SPEED_LABEL[sp]}
          </Btn>
        ))}
        {s.clock.hold !== null && (
          <span class="bv-hold" data-testid="hud-hold">
            {HOLD_TEXT[s.clock.hold]}
          </span>
        )}
      </fieldset>
      <div class="bv-headline" data-testid="headline">
        {h === null || h.polandPerKmCents <= 0 ? (
          <span class="none">Cost per km appears once a line is drawn.</span>
        ) : (
          <>
            <div class="pair">
              <span class="k">{h.final ? 'You paid' : 'You, estimate'}</span>
              <span class="v is-you" data-testid="headline-yours">
                {moneyPerKm(h.yoursPerKmCents)}
              </span>
            </div>
            <span class="vs">vs</span>
            <div
              class="pair"
              title="This route and these stations built the Polish way (twin 6.6 m bores, compact boxes) at Polish prices. It changes with the route and the stations, never with your design or your reforms."
            >
              <span class="k">Poland, same route</span>
              <span class="v" data-testid="headline-poland">
                {moneyPerKm(h.polandPerKmCents)}
              </span>
            </div>
            <span class="gap" data-testid="headline-ratio" title="Your cost per route-km divided by Poland's, computed by the model">
              {ratio(h.ratio)}
            </span>
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
        <Btn testId="strip-reforms" title="Time waits while the reform tree is open" onClick={() => store.openPanel('reforms')}>
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
            <span>{t.served ? 'station in reach' : `station wanted within ${Math.round(t.radiusM)} m`}</span>
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
  const [viewsOpen, setViewsOpen] = useState(false);
  const active = store.tool.value.id;
  const viewsRef = useRef<HTMLDivElement | null>(null);
  // The Views menu is a menu: Escape closes it, so does a click anywhere else, so does picking up a tool.
  // A layout effect: the listeners are in place before the next input event, not a frame or two after the menu shows.
  useLayoutEffect(() => {
    if (!viewsOpen) return;
    const win = viewsRef.current?.ownerDocument.defaultView;
    if (win === null || win === undefined) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      setViewsOpen(false);
    };
    const onDown = (e: Event): void => {
      if (e.target instanceof Node && viewsRef.current?.contains(e.target) === true) return;
      setViewsOpen(false);
    };
    win.addEventListener('keydown', onKey, true);
    win.addEventListener('pointerdown', onDown, true);
    return () => {
      win.removeEventListener('keydown', onKey, true);
      win.removeEventListener('pointerdown', onDown, true);
    };
  }, [viewsOpen]);
  useEffect(() => {
    // `active` is read so the effect runs when the tool in hand changes.
    if (active !== null) setViewsOpen(false);
  }, [active]);
  const avail = store.toolAvailability.value;
  const view = store.view.value;
  const cam = store.camera.value;
  const setView = (v: Parameters<typeof store.services.view.set>[0]): void => act(store, () => store.services.view.set(v));
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
      <div class="grp">
        <button
          type="button"
          class="bv-tool is-toggle"
          data-testid="view-cut"
          aria-pressed={view.cut}
          title="Cut the ground away above a level (C)"
          onClick={() => setView({ cut: !view.cut })}
        >
          Cut plane
        </button>
        {view.cut && (
          <span class="bv-cut">
            <Btn onInk label="Lower the cut" testId="view-cut-down" onClick={() => setView({ cutY: view.cutY - 1 })}>
              -
            </Btn>
            <span class="lvl" data-testid="view-cut-y">
              {Math.round(view.cutY)} m
            </span>
            <Btn onInk label="Raise the cut" testId="view-cut-up" onClick={() => setView({ cutY: view.cutY + 1 })}>
              +
            </Btn>
          </span>
        )}
        <button
          type="button"
          class="bv-tool is-toggle"
          data-testid="view-xray"
          aria-pressed={view.xray}
          title="See tunnels through the ground (X)"
          onClick={() => setView({ xray: !view.xray })}
        >
          X-ray
        </button>
      </div>
      <div class="grp" ref={viewsRef}>
        <button
          type="button"
          class="bv-tool is-toggle"
          data-testid="views"
          aria-expanded={viewsOpen}
          aria-haspopup="menu"
          onClick={() => setViewsOpen(!viewsOpen)}
        >
          Views
        </button>
        {viewsOpen && (
          <div class="bv-views" role="menu" data-testid="views-menu">
            {cam.bookmarks.length === 0 && <span class="none">No saved views on this site.</span>}
            {cam.bookmarks.map((b) => (
              <button
                key={b.id}
                type="button"
                role="menuitem"
                data-testid={`view-${b.id}`}
                onClick={() => {
                  setViewsOpen(false);
                  act(store, () => store.services.camera.goTo(b.id));
                }}
              >
                {b.label}
                {b.hotkey !== undefined && <span class="key">{b.hotkey.replace(/^(Key|Digit)/, '')}</span>}
              </button>
            ))}
            {cam.following !== null && (
              <button
                type="button"
                role="menuitem"
                data-testid="view-unfollow"
                onClick={() => {
                  setViewsOpen(false);
                  act(store, () => store.services.camera.follow(null));
                }}
              >
                Stop following
              </button>
            )}
          </div>
        )}
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
