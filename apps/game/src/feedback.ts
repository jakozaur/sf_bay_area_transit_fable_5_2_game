/**
 * Sound for what the sim reports (docs/CONTRACTS.md decision 13): feed items become one-shot cues, and the
 * state of the machines, the clock and the trains sets the loops. Banners are the UI's half of the same feed.
 */
import type { AudioCue, AudioPort, WorldPos } from '@bayvox/core';
import type { FeedItem, FeedKind, GameSnapshot, Geology } from '@bayvox/sim';

export const FEED_CUES: Readonly<Record<FeedKind, AudioCue>> = {
  projectApproved: 'phase.done',
  phaseDone: 'phase.done',
  gateReady: 'gate.ready',
  fundingReleased: 'money',
  eventRaised: 'event.raised',
  eventResolved: 'event.resolved',
  reformEnacted: 'reform.enacted',
  tbmLaunched: 'tbm.launch',
  tbmStopped: 'tbm.stop',
  tbmResumed: 'tbm.launch',
  tbmOffPlan: 'tbm.offPlan',
  breakthrough: 'tbm.breakthrough',
  stationDone: 'station.done',
  lineOpened: 'line.open',
  objectiveDone: 'scorecard.star',
  objectiveFailed: 'ui.error',
  missionComplete: 'mission.complete',
  cashShort: 'ui.error',
};

/** Pitch of the cutterhead drone by ground at the face: rock sings, mud growls. */
const DRONE_PITCH: Readonly<Record<Geology, number>> = { softGround: 1, bayMud: 0.85, mixedFace: 1.1, rock: 1.3, faultZone: 0.75 };
/** Beyond this distance from the camera a machine or a train is not heard, metres. */
const EARSHOT_M = 900;

function proximity(a: WorldPos, b: WorldPos): number {
  const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return Math.max(0, 1 - d / EARSHOT_M);
}

export class Feedback {
  private readonly audio: AudioPort;
  private seen = 0;
  private rings = -1;

  constructor(audio: AudioPort) {
    this.audio = audio;
  }

  /** A new sim: what its feed already holds is history. */
  reset(snapshot: GameSnapshot): void {
    this.seen = snapshot.feed.length > 0 ? (snapshot.feed[snapshot.feed.length - 1]?.seq ?? 0) : 0;
    this.rings = -1;
  }

  /** Plays the cues of feed items not handled yet and returns those items. */
  feed(snapshot: GameSnapshot): FeedItem[] {
    const fresh: FeedItem[] = [];
    for (const item of snapshot.feed) {
      if (item.seq <= this.seen) continue;
      this.seen = item.seq;
      fresh.push(item);
      this.audio.cue(FEED_CUES[item.kind]);
    }
    return fresh;
  }

  /** Sets the loops for this frame. `running` is false while time stands (paused, on hold, not playing). */
  loops(o: {
    snapshot: GameSnapshot;
    running: boolean;
    camera: WorldPos;
    possessedTbmId: string | null;
    trains: readonly { position: WorldPos }[];
    /** Lining rings drawn now (EntityLayer.stats().rings). */
    rings: number;
  }): void {
    let drone = 0;
    let pitch = 1;
    if (o.running) {
      for (const p of o.snapshot.projects) {
        for (const t of p.tbms) {
          if (t.status !== 'running' || t.rateMPerDay <= 0) continue;
          const level = t.id === o.possessedTbmId ? 0.9 : 0.6 * proximity(t.position, o.camera);
          if (level > drone) {
            drone = level;
            pitch = DRONE_PITCH[t.geology] * (0.8 + 0.2 * t.thrust);
          }
        }
      }
    }
    this.audio.loop('tbm.drone', drone, pitch);
    this.audio.loop('timelapse', o.running && o.snapshot.clock.mode === 'lapse' ? 0.35 : 0);
    let train = 0;
    for (const t of o.trains) train = Math.max(train, proximity(t.position, o.camera));
    this.audio.loop('train.run', train * 0.7);
    // A ring going in is heard only next to the machine being driven; the engine spaces the clunks itself.
    if (this.rings >= 0 && o.rings > this.rings && o.possessedTbmId !== null && o.running) this.audio.cue('tbm.ring');
    this.rings = o.rings;
  }

  silence(): void {
    this.audio.loop('tbm.drone', 0);
    this.audio.loop('timelapse', 0);
    this.audio.loop('train.run', 0);
  }
}
