/** The UI store: BayServices Readables mirrored as signals, plus UI-local state. See ./contract.ts for the frozen shape. */
import type { GameSpeed, Readable } from '@bayvox/core';
import type { BayServices, FeedItem, GameSnapshot, Notice } from '@bayvox/sim';
import { type ReadonlySignal, type Signal, signal } from '@preact/signals';
import type { PanelId, UiExtras, UiStore } from './contract.ts';
import { type CostBenefitRow, postKey, socialPosts } from './model.ts';

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
  /** Reform the reforms panel should open on (its entry expanded), or null. */
  readonly reformFocus: Signal<string | null>;
  /** Opens the reforms panel on one reform: the links of locked design options and of receipt lines. */
  openReform(reformId: string): void;
  /** The gate the player has looked at and put aside ("project id:gate"), or null: its card stays down until the next gate. */
  readonly gateDismissed: Signal<string | null>;
  /** Mission comparison rows for the mission picker; empty when the app has none. */
  readonly costBenefit: readonly CostBenefitRow[];
  /** Backlash posts the player closed (postKey). UI-local: the sim keeps the posts. */
  readonly postsClosed: Signal<ReadonlySet<string>>;
  /** Posts of a pile-on that have not arrived yet (postKey): they come one after another, POST_STAGGER_MS apart. */
  readonly postsPending: Signal<ReadonlySet<string>>;
  /** The post that arrived last (postKey), or null: it shakes and the box flashes. */
  readonly postFresh: Signal<string | null>;
  closePost(key: string): void;
  closeAllPosts(): void;
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
/**
 * Feed kinds with no toast: the event card that opens is the notice, a second line with the same title is noise.
 * A gate that is ready has the gate card and the orange button; its toast only made the stack taller.
 */
const SILENT_KINDS: ReadonlySet<FeedItem['kind']> = new Set(['eventRaised', 'gateReady']);
/**
 * Panels where the player reads and decides: time waits while one is open, and resumes at the speed it had
 * when the panel closes. A time-lapse passes a game year in a few seconds; nobody reads a reform in that.
 */
const PAUSING_PANELS: ReadonlySet<PanelId> = new Set(['reforms', 'design']);

/** How long a toast and a banner stay, milliseconds. */
export const TOAST_MS = 6000;
export const BANNER_MS = 4500;
/** Gap between two posts of one pile-on. */
export const POST_STAGGER_MS = 400;
/** Three notices at most: the second playtest had four over a map label and over the breakthrough banner. */
const MAX_TOASTS = 3;

function noticeKey(n: Notice): string {
  return `notice:${n.tick}:${n.command}:${n.reason}`;
}

function mirror<T>(source: Readable<T>, disposers: (() => void)[]): ReadonlySignal<T> {
  const s = signal(source.get());
  disposers.push(source.subscribe((v) => (s.value = v)));
  return s;
}

export function createStore(services: BayServices, extras: UiExtras = {}): UiStoreInternal {
  const disposers: (() => void)[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const snapshot = mirror(services.sim.snapshot, disposers);
  const panel = signal<PanelId | null>(null);
  const toasts = signal<Toast[]>([]);
  const banner = signal<Toast | null>(null);
  const reformFocus = signal<string | null>(null);
  const gateDismissed = signal<string | null>(null);
  const first = snapshot.value;
  // Posts already in the snapshot when the UI mounts (a loaded save) are history, not news.
  const postsClosed = signal<ReadonlySet<string>>(new Set(socialPosts(first).map(postKey)));
  let lastPostId = socialPosts(first).at(-1)?.id ?? 0;
  const postsPending = signal<ReadonlySet<string>>(new Set());
  const postFresh = signal<string | null>(null);
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

  /** A post comes on screen. A staggered one that is no longer waiting (close all, a restart) stays away. */
  const arrive = (key: string, staggered: boolean): void => {
    if (staggered) {
      if (!postsPending.value.has(key)) return;
      const pending = new Set(postsPending.value);
      pending.delete(key);
      postsPending.value = pending;
    }
    if (postsClosed.value.has(key)) return;
    postFresh.value = key;
    services.audio.cue('event.raised');
  };

  const onSnapshot = (s: GameSnapshot): void => {
    const last = s.feed.length > 0 ? s.feed[s.feed.length - 1].seq : 0;
    // A snapshot that arrives while a mission or a save loads is the state being restored: its feed and notices are history.
    if (services.session.state.get().screen === 'loading') {
      feedSeen.value = last;
      for (const n of s.notices) noticesSeen.add(noticeKey(n));
      postsClosed.value = new Set(socialPosts(s).map(postKey));
      lastPostId = socialPosts(s).at(-1)?.id ?? 0;
      postsPending.value = new Set();
      postFresh.value = null;
      return;
    }
    // A restart rewinds the post ids: what was closed in the previous run says nothing about this one.
    const newestPost = socialPosts(s).at(-1)?.id ?? 0;
    if (newestPost < lastPostId) {
      postsClosed.value = new Set();
      postsPending.value = new Set();
      postFresh.value = null;
      lastPostId = 0;
    }
    // A pile-on arrives one post after another: the first now, each next one a beat later.
    const arrivals = socialPosts(s).filter((p) => p.id > lastPostId);
    lastPostId = newestPost;
    if (arrivals.length > 0) {
      postsPending.value = new Set([...postsPending.value, ...arrivals.slice(1).map(postKey)]);
      arrivals.forEach((p, i) => {
        const key = postKey(p);
        if (i === 0) arrive(key, false);
        else later(i * POST_STAGGER_MS, () => arrive(key, true));
      });
    }
    // A restart or a load of an older save rewinds the feed: forget what the previous run showed.
    if (last < feedSeen.value) feedSeen.value = last;
    for (const item of s.feed) {
      if (item.seq <= feedSeen.value) continue;
      feedSeen.value = item.seq;
      if (SILENT_KINDS.has(item.kind)) continue;
      const tone = GOOD_KINDS.has(item.kind) ? 'good' : BAD_KINDS.has(item.kind) ? 'bad' : 'info';
      push({ key: `feed:${item.seq}`, text: item.text, tone, banner: BANNER_KINDS.has(item.kind), kind: item.kind });
    }
    for (const n of s.notices) {
      const key = noticeKey(n);
      if (noticesSeen.has(key)) continue;
      noticesSeen.add(key);
      push({ key, text: n.reason, tone: 'bad', banner: false, kind: null });
    }
    // A gate card put aside stays aside for that gate only: once the project is through it (or the mission is
    // restarted) the next gate shows its card again.
    if (gateDismissed.value !== null) {
      const id = s.mission.projectId ?? s.mission.planProjectId;
      const project = s.projects.find((p) => p.id === id);
      if (project === undefined || project.awaiting === null || gateDismissed.value !== `${project.id}:${project.awaiting}`)
        gateDismissed.value = null;
    }
  };
  disposers.push(services.sim.snapshot.subscribe(onSnapshot));

  /** Speed to return to when a pausing panel closes, or null when this store did not pause the game. */
  let resumeSpeed: GameSpeed | null = null;
  const setPanel = (next: PanelId | null): void => {
    const was = panel.value;
    panel.value = next;
    const wasPausing = was !== null && PAUSING_PANELS.has(was);
    const nowPausing = next !== null && PAUSING_PANELS.has(next);
    if (!wasPausing && nowPausing) {
      const speed = services.time.speed.get();
      if (speed !== 0 && services.session.state.get().screen === 'playing') {
        resumeSpeed = speed;
        services.time.setSpeed(0);
      }
    } else if (wasPausing && !nowPausing && resumeSpeed !== null) {
      // The player may have set a speed by hand while the panel was open: then it is theirs, not ours to change.
      if (services.time.speed.get() === 0) services.time.setSpeed(resumeSpeed);
      resumeSpeed = null;
    }
  };

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
      setPanel(next);
    },
    reformFocus,
    gateDismissed,
    costBenefit: extras.costBenefit ?? [],
    postsClosed,
    postsPending,
    postFresh,
    closePost(key) {
      postsClosed.value = new Set([...postsClosed.value, key]);
    },
    closeAllPosts() {
      postsPending.value = new Set();
      postsClosed.value = new Set(socialPosts(snapshot.value).map(postKey));
    },
    openReform(reformId) {
      reformFocus.value = reformId;
      if (panel.value !== 'reforms') services.audio.cue('ui.open');
      setPanel('reforms');
    },
    dispose() {
      for (const d of disposers) d();
      disposers.length = 0;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
