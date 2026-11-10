/** Root component and mountUi: picks the screen from the session state and wires the keyboard policy. */
import type { BayServices } from '@bayvox/sim';
import { type JSX, render } from 'preact';
import { useErrorBoundary } from 'preact/hooks';
import type { UiHandle } from './contract.ts';
import { Banner, CameraHelp, MapLabels, ObjectiveStrip, Toasts, Toolbar, TopBar } from './hud.tsx';
import { type KeyInput, resolveKey } from './keys.ts';
import { CreditsPanel, HelpPanel, MenuPanel } from './menu.tsx';
import { act, selectTool } from './model.ts';
import { DesignPanel, ProjectPanel, ReceiptPanel, ReformsPanel, ToolPanel } from './panels.tsx';
import { DriveHud, EventCard } from './play.tsx';
import { BriefingScreen, LoadingScreen, ScorecardScreen, TitleScreen } from './screens.tsx';
import { createStore, type UiStoreInternal } from './store.ts';
import { CSS, STYLE_ID } from './styles.ts';

function SidePanel({ store }: { store: UiStoreInternal }): JSX.Element | null {
  switch (store.panel.value) {
    case null:
      return null;
    case 'project':
      return <ProjectPanel store={store} />;
    case 'design':
      return <DesignPanel store={store} />;
    case 'reforms':
      return <ReformsPanel store={store} />;
    case 'receipt':
      return <ReceiptPanel store={store} />;
    case 'menu':
      return <MenuPanel store={store} />;
    case 'help':
      return <HelpPanel store={store} />;
    case 'credits':
      return <CreditsPanel store={store} />;
  }
}

/** A render error must not leave a blank overlay: it is shown as one red line (and logged), with a way to retry. */
export function Root({ store }: { store: UiStoreInternal }): JSX.Element {
  const [error, reset] = useErrorBoundary((err) => console.error('ui render failed:', err));
  if (error !== undefined && error !== null) {
    return (
      <div class="bv-fatal bv-live" role="alert" data-testid="ui-fatal">
        <b>The interface failed to draw: {error instanceof Error ? error.message : String(error)}</b>
        <button type="button" class="bv-btn" onClick={reset}>
          Try again
        </button>
      </div>
    );
  }
  return <Screens store={store} />;
}

function Screens({ store }: { store: UiStoreInternal }): JSX.Element {
  const screen = store.session.value.screen;
  const panel = store.panel.value;
  if (screen === 'title') {
    return (
      <>
        <TitleScreen store={store} />
        {panel === 'credits' && <CreditsPanel store={store} />}
        <Toasts store={store} />
      </>
    );
  }
  if (screen === 'briefing') {
    return (
      <>
        <BriefingScreen store={store} />
        <Toasts store={store} />
      </>
    );
  }
  if (screen === 'loading') return <LoadingScreen store={store} />;
  if (screen === 'scorecard') {
    return (
      <>
        <ScorecardScreen store={store} />
        {panel === 'reforms' && <ReformsPanel store={store} />}
        <Toasts store={store} />
      </>
    );
  }
  // A card waits for the banner: the breakthrough is a moment, and the first playtest had it covered by a
  // change order that came up 0.7 s later. Time holds for the card either way.
  const eventOpen = store.snapshot.value.events.length > 0 && store.banner.value === null;
  return (
    <>
      <MapLabels store={store} />
      <TopBar store={store} />
      <ObjectiveStrip store={store} />
      <ToolPanel store={store} />
      <SidePanel store={store} />
      <DriveHud store={store} />
      <CameraHelp store={store} />
      <Toolbar store={store} />
      <Banner store={store} />
      <Toasts store={store} />
      {eventOpen && <EventCard store={store} />}
    </>
  );
}

function targetKind(target: EventTarget | null): KeyInput['target'] {
  if (!(target instanceof Element)) return 'other';
  const tag = target.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return 'button';
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return 'control';
  return 'other';
}

export function mount(root: HTMLElement, services: BayServices): UiHandle {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (win === null) throw new Error('mountUi: root is not attached to a window');
  const store = createStore(services);
  const ac = new AbortController();

  let style = doc.getElementById(STYLE_ID);
  const ownsStyle = style === null;
  if (style === null) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const host = doc.createElement('div');
  host.className = 'bv';
  root.appendChild(host);

  // Keys: capture phase on the window, so the input mapper (bubble phase, same window) never sees what the UI handled.
  win.addEventListener(
    'keydown',
    (e) => {
      const intent = resolveKey(
        { code: e.code, repeat: e.repeat, modified: e.ctrlKey || e.metaKey || e.altKey, target: targetKind(e.target) },
        {
          screen: store.session.value.screen,
          panel: store.panel.value,
          eventOpen: store.snapshot.value.events.length > 0,
          tool: store.tool.value.id,
        },
      );
      if (intent === null) return;
      e.stopPropagation();
      if (intent.type === 'swallow') return;
      e.preventDefault();
      if (intent.type === 'closePanel') store.openPanel(null);
      else if (intent.type === 'togglePause') act(store, () => services.time.togglePause());
      else selectTool(store, intent.tool);
    },
    { capture: true, signal: ac.signal },
  );
  // Pointer and wheel events on the UI stay in the UI, wherever the app puts the root.
  for (const type of ['pointerdown', 'mousedown', 'wheel', 'click', 'dblclick', 'contextmenu'] as const) {
    host.addEventListener(type, (e) => e.stopPropagation(), { signal: ac.signal });
  }
  host.addEventListener(
    'click',
    (e) => {
      const el = e.target instanceof Element ? e.target.closest('button') : null;
      if (el === null) return;
      services.audio.cue('ui.click');
      // A mouse click must not leave focus on the button: Space would press it again instead of pausing.
      if (e.detail > 0 && el instanceof HTMLElement) el.blur();
    },
    { signal: ac.signal },
  );

  render(<Root store={store} />, host);
  return {
    store,
    dispose() {
      ac.abort();
      render(null, host);
      host.remove();
      if (ownsStyle) style.remove();
      store.dispose();
    },
  };
}
