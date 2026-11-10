/**
 * The synth engine behind core's AudioPort. Browsers refuse audio before a user gesture, so nothing is created
 * until `init` has seen one: cues before that are dropped (by design, see AudioPort.cue), loop levels are
 * remembered and start with the context. The engine talks to a structural subset of the Web Audio API
 * (AudioContextLike), which is what lets the graph logic run under a fake context in unit tests.
 */
import { AUDIO_CUES, AUDIO_LOOPS, type AudioCue, type AudioLoop, type AudioPort, type Readable } from '@bayvox/core';
import { CUES, cueDuration, LOOPS, type Voice } from './sounds.ts';

// ---- the part of Web Audio the engine uses

export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(value: number, time: number, timeConstant: number): unknown;
}
export interface NodeLike {
  connect(destination: NodeLike | ParamLike): unknown;
  disconnect(): void;
}
export interface SourceLike extends NodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}
export interface OscillatorLike extends SourceLike {
  type: string;
  frequency: ParamLike;
}
export interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface FilterLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  Q: ParamLike;
}
export interface BufferLike {
  getChannelData(channel: number): Float32Array;
}
export interface BufferSourceLike extends SourceLike {
  buffer: BufferLike | null;
  loop: boolean;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: NodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  createBiquadFilter(): FilterLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource(): BufferSourceLike;
}

// ---- public interface

export interface LoopState {
  /** Level and pitch last asked for. */
  level: number;
  pitch: number;
  /** True while the loop's nodes exist and sound. */
  running: boolean;
}

/** Everything a test (or a debug overlay) needs to know about the engine. Plain data. */
export interface AudioState {
  /** True once a user gesture has created the audio context. */
  unlocked: boolean;
  /** AudioContext.state, or 'none' before the first gesture. */
  context: string;
  muted: boolean;
  volume: number;
  loops: Record<AudioLoop, LoopState>;
  /** Cues scheduled, per id. */
  cuesPlayed: Record<AudioCue, number>;
  /** Cues not played: before the first gesture, while muted, repeated too fast, or over the voice limit. */
  cuesDropped: number;
  /** Cue voices still sounding. */
  activeVoices: number;
}

export interface AudioEngine extends AudioPort {
  /**
   * Arms the engine: the first pointer or key event on `target` (default: the window) creates the audio
   * context. Call it once at boot. Calling it again, or after the unlock, does nothing.
   */
  init(target?: EventTarget): void;
  /** Creates the context now. Only valid inside a user gesture; `init` calls it for you. */
  unlock(): void;
  /** Master volume 0..1, applied on top of mute. */
  readonly volume: Readable<number>;
  setVolume(volume: number): void;
  state(): AudioState;
  /** Stops everything, closes the context and removes the gesture listeners. */
  dispose(): void;
}

export interface AudioEngineOptions {
  /** Creates the context at the first gesture. Default: `new AudioContext()`. */
  createContext?: () => AudioContextLike;
  /** Start values. Defaults: volume 0.8, not muted. */
  volume?: number;
  muted?: boolean;
  /** Cue voices allowed at once; a cue that would exceed it is dropped. Default 32. */
  maxVoices?: number;
}

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;
/** Scheduling lead so a voice never starts in the past, seconds. */
const LEAD_S = 0.005;
const NOISE_SECONDS = 2;
const SILENT = 0.0001;

class Cell<T> implements Readable<T> {
  private value: T;
  private readonly listeners = new Set<(value: T) => void>();
  constructor(value: T) {
    this.value = value;
  }
  get(): T {
    return this.value;
  }
  set(value: T): void {
    if (value === this.value) return;
    this.value = value;
    for (const cb of this.listeners) cb(value);
  }
  subscribe(cb: (value: T) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

interface LoopRuntime {
  level: GainLike;
  sources: SourceLike[];
  /** Parameters that follow the pitch factor, with their value at pitch 1. */
  pitched: { param: ParamLike; base: number }[];
}

function assertUnit(value: number, what: string): void {
  if (!(value >= 0 && value <= 1)) throw new RangeError(`audio: ${what} must be in [0, 1], got ${value}`);
}

class Engine implements AudioEngine {
  readonly muted: Cell<boolean>;
  readonly volume: Cell<number>;
  private readonly createContext: () => AudioContextLike;
  private readonly maxVoices: number;
  private ctx: AudioContextLike | null = null;
  private master: GainLike | null = null;
  private noise: BufferLike | null = null;
  private armed: EventTarget | null = null;
  private disposed = false;
  private readonly wanted: Record<AudioLoop, { level: number; pitch: number }>;
  private readonly running = new Map<AudioLoop, LoopRuntime>();
  private readonly played: Record<AudioCue, number>;
  private readonly lastAt = new Map<AudioCue, number>();
  private dropped = 0;
  /** End times of the cue voices scheduled and not yet over. */
  private voiceEnds: number[] = [];

  constructor(options: AudioEngineOptions) {
    const volume = options.volume ?? 0.8;
    assertUnit(volume, 'volume');
    const maxVoices = options.maxVoices ?? 32;
    if (!Number.isInteger(maxVoices) || maxVoices < 1)
      throw new RangeError(`audio: maxVoices must be a positive integer, got ${maxVoices}`);
    this.volume = new Cell(volume);
    this.muted = new Cell(options.muted ?? false);
    this.maxVoices = maxVoices;
    this.createContext =
      options.createContext ??
      (() => {
        if (typeof AudioContext === 'undefined') throw new Error('audio: this browser has no AudioContext');
        return new AudioContext() as unknown as AudioContextLike;
      });
    this.wanted = Object.fromEntries(AUDIO_LOOPS.map((id) => [id, { level: 0, pitch: 1 }])) as Engine['wanted'];
    this.played = Object.fromEntries(AUDIO_CUES.map((id) => [id, 0])) as Engine['played'];
  }

  init(target?: EventTarget): void {
    if (this.disposed) throw new Error('audio: init after dispose');
    if (this.ctx !== null || this.armed !== null) return;
    const t = target ?? (typeof window === 'undefined' ? undefined : window);
    if (t === undefined) throw new Error('audio: init needs an event target (no window here)');
    this.armed = t;
    for (const type of GESTURES) t.addEventListener(type, this.onGesture, { capture: true });
  }

  private readonly onGesture = (): void => {
    this.disarm();
    this.unlock();
  };

  private disarm(): void {
    if (this.armed === null) return;
    for (const type of GESTURES) this.armed.removeEventListener(type, this.onGesture, { capture: true });
    this.armed = null;
  }

  unlock(): void {
    if (this.disposed) throw new Error('audio: unlock after dispose');
    if (this.ctx !== null) return;
    this.disarm();
    const ctx = this.createContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.masterGain();
    master.connect(ctx.destination);
    this.master = master;
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err: unknown) => {
        console.error(`audio: the context did not resume: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    // Loops asked for before the gesture start now.
    for (const id of AUDIO_LOOPS) {
      const w = this.wanted[id];
      if (w.level > 0) this.applyLoop(id, w.level, w.pitch);
    }
  }

  private masterGain(): number {
    return this.muted.get() ? 0 : this.volume.get();
  }

  private applyMaster(): void {
    if (this.ctx === null || this.master === null) return;
    this.master.gain.setTargetAtTime(this.masterGain(), this.ctx.currentTime, 0.02);
  }

  setMuted(muted: boolean): void {
    this.muted.set(muted);
    this.applyMaster();
  }

  setVolume(volume: number): void {
    assertUnit(volume, 'volume');
    this.volume.set(volume);
    this.applyMaster();
  }

  /** White noise, generated once per context from a fixed seed. */
  private noiseBuffer(ctx: AudioContextLike): BufferLike {
    if (this.noise !== null) return this.noise;
    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < length; i++) {
      // xorshift32: the same noise in every session.
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      data[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  cue(id: AudioCue): void {
    const spec = CUES[id];
    if (spec === undefined) throw new RangeError(`audio: unknown cue "${String(id)}"`);
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || this.muted.get()) {
      this.dropped++;
      return;
    }
    const now = ctx.currentTime;
    const last = this.lastAt.get(id);
    if (last !== undefined && now - last < spec.minGapS) {
      this.dropped++;
      return;
    }
    this.voiceEnds = this.voiceEnds.filter((end) => end > now);
    if (this.voiceEnds.length + spec.voices.length > this.maxVoices) {
      this.dropped++;
      return;
    }
    this.lastAt.set(id, now);
    this.played[id]++;
    for (const voice of spec.voices) this.voiceEnds.push(this.playVoice(ctx, master, voice, now + LEAD_S));
  }

  /** Schedules one voice of a cue and returns the time it ends. */
  private playVoice(ctx: AudioContextLike, out: NodeLike, voice: Voice, start: number): number {
    const t0 = start + voice.at;
    const t1 = t0 + voice.dur;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(voice.gain, t0 + Math.min(voice.attack ?? 0.005, voice.dur / 2));
    env.gain.exponentialRampToValueAtTime(SILENT, t1);
    env.connect(out);
    let into: NodeLike = env;
    let filterFrequency: ParamLike | null = null;
    if (voice.wave === 'noise' || voice.filter !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filter ?? 'lowpass';
      filter.Q.value = voice.q ?? 1;
      filter.frequency.setValueAtTime(voice.wave === 'noise' ? voice.freq : (voice.filterFreq ?? voice.freq * 3), t0);
      filter.connect(env);
      into = filter;
      filterFrequency = filter.frequency;
    }
    let source: SourceLike;
    // What a pitch glide moves: the oscillator, or for noise the filter that colours it.
    let glide: ParamLike | null;
    if (voice.wave === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer(ctx);
      noise.loop = true;
      source = noise;
      glide = filterFrequency;
    } else {
      const osc = ctx.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.freq, t0);
      source = osc;
      glide = osc.frequency;
    }
    if (voice.freqEnd !== undefined && glide !== null) glide.exponentialRampToValueAtTime(Math.max(1, voice.freqEnd), t1);
    source.connect(into);
    source.start(t0);
    source.stop(t1 + 0.02);
    return t1;
  }

  loop(id: AudioLoop, level: number, pitch = 1): void {
    if (LOOPS[id] === undefined) throw new RangeError(`audio: unknown loop "${String(id)}"`);
    assertUnit(level, `loop "${id}" level`);
    if (!(pitch > 0) || !Number.isFinite(pitch)) throw new RangeError(`audio: loop "${id}" pitch must be finite and > 0, got ${pitch}`);
    this.wanted[id] = { level, pitch };
    if (this.ctx !== null) this.applyLoop(id, level, pitch);
  }

  private applyLoop(id: AudioLoop, level: number, pitch: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const now = ctx.currentTime;
    const spec = LOOPS[id];
    let rt = this.running.get(id);
    if (level === 0) {
      if (rt === undefined) return;
      // Fade out, then stop the sources; the nodes are collected once they have stopped.
      rt.level.gain.setTargetAtTime(0, now, 0.08);
      for (const s of rt.sources) s.stop(now + 0.5);
      this.running.delete(id);
      return;
    }
    if (rt === undefined) {
      rt = this.startLoop(ctx, master, id, pitch);
      this.running.set(id, rt);
    } else {
      for (const p of rt.pitched) p.param.setTargetAtTime(p.base * pitch, now, 0.12);
    }
    rt.level.gain.setTargetAtTime(level * spec.gain, now, 0.08);
  }

  private startLoop(ctx: AudioContextLike, master: NodeLike, id: AudioLoop, pitch: number): LoopRuntime {
    const spec = LOOPS[id];
    const now = ctx.currentTime;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, now);
    level.connect(master);
    // The bus carries the wobble: an LFO on its gain.
    const bus = ctx.createGain();
    bus.gain.value = 1 - spec.wobbleDepth / 2;
    bus.connect(level);
    const rt: LoopRuntime = { level, sources: [], pitched: [] };
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(spec.wobbleHz * pitch, now);
    const depth = ctx.createGain();
    depth.gain.value = spec.wobbleDepth / 2;
    lfo.connect(depth);
    depth.connect(bus.gain);
    lfo.start(now);
    rt.sources.push(lfo);
    rt.pitched.push({ param: lfo.frequency, base: spec.wobbleHz });
    for (const voice of spec.voices) {
      const gain = ctx.createGain();
      gain.gain.value = voice.gain;
      gain.connect(bus);
      let into: NodeLike = gain;
      if (voice.wave === 'noise' || voice.filter !== undefined) {
        const filter = ctx.createBiquadFilter();
        filter.type = voice.filter ?? 'lowpass';
        filter.Q.value = voice.q ?? 1;
        // Oscillator voices are filtered a few harmonics up, so a higher pitch also sounds brighter.
        const base = voice.wave === 'noise' ? voice.freq : voice.freq * 5;
        filter.frequency.setValueAtTime(base * pitch, now);
        rt.pitched.push({ param: filter.frequency, base });
        filter.connect(gain);
        into = filter;
      }
      if (voice.wave === 'noise') {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer(ctx);
        noise.loop = true;
        noise.connect(into);
        noise.start(now);
        rt.sources.push(noise);
      } else {
        const osc = ctx.createOscillator();
        osc.type = voice.wave;
        osc.frequency.setValueAtTime(voice.freq * pitch, now);
        rt.pitched.push({ param: osc.frequency, base: voice.freq });
        osc.connect(into);
        osc.start(now);
        rt.sources.push(osc);
      }
    }
    return rt;
  }

  state(): AudioState {
    const now = this.ctx?.currentTime ?? 0;
    const loops = Object.fromEntries(
      AUDIO_LOOPS.map((id) => [id, { level: this.wanted[id].level, pitch: this.wanted[id].pitch, running: this.running.has(id) }]),
    ) as Record<AudioLoop, LoopState>;
    return {
      unlocked: this.ctx !== null,
      context: this.ctx?.state ?? 'none',
      muted: this.muted.get(),
      volume: this.volume.get(),
      loops,
      cuesPlayed: { ...this.played },
      cuesDropped: this.dropped,
      activeVoices: this.voiceEnds.filter((end) => end > now).length,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disarm();
    const ctx = this.ctx;
    if (ctx === null) return;
    for (const rt of this.running.values()) for (const s of rt.sources) s.stop(ctx.currentTime);
    this.running.clear();
    this.master?.disconnect();
    ctx.close().catch((err: unknown) => {
      console.error(`audio: the context did not close: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

/** Creates the audio engine. Nothing sounds, and no AudioContext exists, until `init` has seen a user gesture. */
export function createAudio(options: AudioEngineOptions = {}): AudioEngine {
  return new Engine(options);
}

/** Longest cue, seconds: how long a test or a recorder must wait for silence after the last cue. */
export const LONGEST_CUE_S = Math.max(...AUDIO_CUES.map((id) => cueDuration(CUES[id])));
