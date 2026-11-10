/** The UI store: BayServices Readables mirrored as signals, plus UI-local state. See ./contract.ts for the frozen shape. */
import type { Readable } from '@bayvox/core';
import type { BayServices, FeedItem, GameSnapshot, Notice } from '@bayvox/sim';
import { type ReadonlySignal, type Signal, signal } from '@preact/signals';
import type { PanelId, UiStore } from './contract.ts';

/** A line shown in the toast stack. `tone` picks the stripe colour; `banner` items take the big breakthrough treatment. */
export interface Toast {
  key: string;
  text: string;
  tone: 'info' | 'good' | 'bad';
  banner: boolean;
  /** Feed kind the toast came from, null for notices and UI messages. */
  kind: FeedItem['kind'] | null;
}

/** Store plus the pieces only this package uses. */
export interface UiStoreInternal extends UiStore {
  /** Toasts on screen, oldest first. */
  readonly toasts: Signal<Toast[]>;
  /** The banner on screen (breakthrough, line opened), or null. */
  readonly banner: Signal<Toast | null>;
  /** Shows a toast from the UI itself (a refused key press, a finished save). */
  notify(text: string, tone?: Toast['tone']): void;
  dismiss(key: string): void;
  openPanel(panel: PanelId | null): void;
  /** Reform the reforms panel should open on (its branch selected, its entry expanded), or null. */
  readonly reformFocus: Signal<string | null>;
  /** Opens the reforms panel on one reform: the links of locked design options and of receipt lines. */
  openReform(reformId: string): void;
  dispose(): void;
}

const GOOD_KINDS: ReadonlySet<FeedItem['kind']> = new Set([
  'projectApproved',
  'phaseDone',
  'fundingReleased',
  'reformEnacted',
  'tbmLaunched',
  'tbmResumed',
  'breakthrough',
  'stationDone',
  'lineOpened',
  'objectiveDone',
  'missionComplete',
]);
const BAD_KINDS: ReadonlySet<FeedItem['kind']> = new Set(['tbmStopped', 'tbmOffPlan', 'objectiveFailed', 'cashShort']);
const BANNER_KINDS: ReadonlySet<FeedItem['kind']> = new Set(['breakthrough', 'lineOpened']);

/** How long a toast and a banner stay, milliseconds. */
export const TOAST_MS = 6000;
export const BANNER_MS = 4500;
const MAX_TOASTS = 4;

function noticeKey(n: Notice): string {
  return `notice:${n.tick}:${n.command}:${n.reason}`;
}

function mirror<T>(source: Readable<T>, disposers: (() => void)[]): ReadonlySignal<T> {
  const s = signal(source.get());
  disposers.push(source.subscribe((v) => (s.value = v)));
  return s;
}

export function createStore(services: BayServices): UiStoreInternal {
  const disposers: (() => void)[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const snapshot = mirror(services.sim.snapshot, disposers);
  const panel = signal<PanelId | null>(null);
  const toasts = signal<Toast[]>([]);
  const banner = signal<Toast | null>(null);
  const reformFocus = signal<string | null>(null);
  const first = snapshot.value;
  // Items already in the feed when the UI mounts (a loaded save) are history, not news.
  const feedSeen = signal(first.feed.length > 0 ? first.feed[first.feed.length - 1].seq : 0);
  const noticesSeen = new Set(first.notices.map(noticeKey));
  let localSeq = 0;

  const later = (ms: number, fn: () => void): void => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const dismiss = (key: string): void => {
    toasts.value = toasts.value.filter((t) => t.key !== key);
    if (banner.value?.key === key) banner.value = null;
  };
  const push = (t: Toast): void => {
    if (t.banner) {
      banner.value = t;
      later(BANNER_MS, () => dismiss(t.key));
      return;
    }
    toasts.value = [...toasts.value, t].slice(-MAX_TOASTS);
    later(TOAST_MS, () => dismiss(t.key));
  };

  const onSnapshot = (s: GameSnapshot): void => {
    const last = s.feed.length > 0 ? s.feed[s.feed.length - 1].seq : 0;
    // A snapshot that arrives while a mission or a save loads is the state being restored: its feed and notices are history.
    if (services.session.state.get().screen === 'loading') {
      feedSeen.value = last;
      for (const n of s.notices) noticesSeen.add(noticeKey(n));
      return;
    }
    // A restart or a load of an older save rewinds the feed: forget what the previous run showed.
    if (last < feedSeen.value) feedSeen.value = last;
    for (const item of s.feed) {
      if (item.seq <= feedSeen.value) continue;
      feedSeen.value = item.seq;
      const tone = GOOD_KINDS.has(item.kind) ? 'good' : BAD_KINDS.has(item.kind) ? 'bad' : 'info';
      push({ key: `feed:${item.seq}`, text: item.text, tone, banner: BANNER_KINDS.has(item.kind), kind: item.kind });
    }
    for (const n of s.notices) {
      const key = noticeKey(n);
      if (noticesSeen.has(key)) continue;
      noticesSeen.add(key);
      push({ key, text: n.reason, tone: 'bad', banner: false, kind: null });
    }
  };
  disposers.push(services.sim.snapshot.subscribe(onSnapshot));

  return {
    services,
    snapshot,
    session: mirror(services.session.state, disposers),
    speed: mirror(services.time.speed, disposers),
    view: mirror(services.view.state, disposers),
    tool: mirror(services.tools.status, disposers),
    toolAvailability: mirror(services.tools.availability, disposers),
    camera: mirror(services.camera.status, disposers),
    muted: mirror(services.audio.muted, disposers),
    panel,
    feedSeen,
    toasts,
    banner,
    notify(text, tone = 'info') {
      localSeq++;
      push({ key: `ui:${localSeq}`, text, tone, banner: false, kind: null });
    },
    dismiss,
    openPanel(next) {
      if (panel.value === next) return;
      services.audio.cue(next === null ? 'ui.close' : 'ui.open');
      if (next !== 'reforms') reformFocus.value = null;
      panel.value = next;
    },
    reformFocus,
    openReform(reformId) {
      reformFocus.value = reformId;
      if (panel.value !== 'reforms') services.audio.cue('ui.open');
      panel.value = 'reforms';
    },
    dispose() {
      for (const d of disposers) d();
      disposers.length = 0;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
