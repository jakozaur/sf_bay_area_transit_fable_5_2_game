/**
 * The sounds as data: every cue is a handful of voices (an oscillator or a noise burst with a pitch glide,
 * an envelope and an optional filter), every loop a few sustained voices. The engine only schedules them,
 * so the tables can be checked without any audio hardware.
 */
import type { AudioCue, AudioLoop } from '@bayvox/core';

export interface Voice {
  /** Oscillator waveform, or 'noise' for filtered white noise. */
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';
  /** Start frequency in Hz (for noise: the filter frequency). */
  freq: number;
  /** Frequency at the end of the voice; omit for a steady pitch. */
  freqEnd?: number;
  /** Start offset from the cue's start, seconds. */
  at: number;
  /** Length in seconds, release included. */
  dur: number;
  /** Peak gain, 0..1. */
  gain: number;
  /** Attack time in seconds. Default 0.005. */
  attack?: number;
  /** Filter on the voice: type and Q. Noise voices default to a low-pass. */
  filter?: 'lowpass' | 'bandpass' | 'highpass';
  q?: number;
  /** Filter frequency for oscillator voices, Hz. */
  filterFreq?: number;
}

export interface CueSpec {
  voices: readonly Voice[];
  /** The same cue is not replayed within this many seconds (a burst of ledger entries is one tick, not fifty). */
  minGapS: number;
}

const v = (wave: Voice['wave'], freq: number, at: number, dur: number, gain: number, extra: Partial<Voice> = {}): Voice => ({
  wave,
  freq,
  at,
  dur,
  gain,
  ...extra,
});

// Note frequencies, Hz.
const C4 = 261.63;
const G4 = 392.0;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;
const G6 = 1567.98;
const C7 = 2093.0;

/** Brass-like note: a sawtooth under a closing low-pass. */
const brass = (freq: number, at: number, dur: number, gain: number): Voice =>
  v('sawtooth', freq, at, dur, gain, { attack: 0.02, filter: 'lowpass', filterFreq: freq * 4, q: 0.7 });
const bell = (freq: number, at: number, dur: number, gain: number): Voice[] => [
  v('sine', freq, at, dur, gain),
  v('sine', freq * 2.76, at, dur * 0.4, gain * 0.25),
];

export const CUES: Record<AudioCue, CueSpec> = {
  'ui.click': { minGapS: 0.03, voices: [v('square', 1200, 0, 0.04, 0.12, { freqEnd: 900, filter: 'lowpass', filterFreq: 3000 })] },
  'ui.open': { minGapS: 0.05, voices: [v('sine', 520, 0, 0.07, 0.16), v('sine', 780, 0.06, 0.1, 0.16)] },
  'ui.close': { minGapS: 0.05, voices: [v('sine', 780, 0, 0.07, 0.14), v('sine', 520, 0.06, 0.1, 0.14)] },
  'ui.error': { minGapS: 0.1, voices: [v('sawtooth', 140, 0, 0.2, 0.2, { freqEnd: 110, filter: 'lowpass', filterFreq: 900 })] },
  'tool.place': {
    minGapS: 0.04,
    voices: [v('sine', 220, 0, 0.11, 0.3, { freqEnd: 110 }), v('noise', 2500, 0, 0.03, 0.12, { filter: 'highpass' })],
  },
  'tool.remove': { minGapS: 0.04, voices: [v('triangle', 320, 0, 0.14, 0.22, { freqEnd: 120 })] },
  'tool.invalid': {
    minGapS: 0.15,
    voices: [
      v('square', 150, 0, 0.07, 0.14, { filter: 'lowpass', filterFreq: 800 }),
      v('square', 150, 0.1, 0.09, 0.14, { filter: 'lowpass', filterFreq: 800 }),
    ],
  },
  dig: { minGapS: 0.06, voices: [v('noise', 700, 0, 0.14, 0.3, { q: 0.8 }), v('sine', 95, 0, 0.12, 0.3, { freqEnd: 50 })] },
  // Cash register: a tiny key click and two bright pings a fourth apart.
  money: {
    minGapS: 0.09,
    voices: [
      v('noise', 5000, 0, 0.015, 0.08, { filter: 'highpass' }),
      v('triangle', 1975.5, 0.005, 0.09, 0.14),
      v('triangle', 2637, 0.045, 0.16, 0.16),
    ],
  },
  'phase.done': { minGapS: 0.2, voices: [...bell(C5, 0, 0.25, 0.18), ...bell(E5, 0.09, 0.25, 0.18), ...bell(G5, 0.18, 0.45, 0.2)] },
  'gate.ready': { minGapS: 0.3, voices: [...bell(G5, 0, 0.35, 0.2), ...bell(C6, 0.16, 0.7, 0.22)] },
  // Event-card sting: a low tritone stab with a noise swell under it.
  'event.raised': {
    minGapS: 0.3,
    voices: [
      brass(146.83, 0, 0.7, 0.24),
      brass(207.65, 0, 0.7, 0.2),
      brass(311.13, 0.02, 0.65, 0.14),
      v('noise', 900, 0, 0.5, 0.12, { attack: 0.2, q: 0.6 }),
    ],
  },
  'event.resolved': { minGapS: 0.3, voices: [...bell(G4, 0, 0.3, 0.16), ...bell(C5, 0.14, 0.6, 0.18)] },
  // A rubber stamp, then a major chord.
  'reform.enacted': {
    minGapS: 0.3,
    voices: [
      v('sine', 90, 0, 0.16, 0.4, { freqEnd: 45 }),
      v('noise', 500, 0, 0.08, 0.25),
      brass(C5, 0.16, 0.7, 0.14),
      brass(E5, 0.16, 0.7, 0.12),
      brass(G5, 0.16, 0.7, 0.12),
    ],
  },
  'tbm.launch': {
    minGapS: 1,
    voices: [
      v('sawtooth', 45, 0, 1.4, 0.3, { freqEnd: 110, attack: 0.3, filter: 'lowpass', filterFreq: 500 }),
      v('noise', 300, 0, 1.4, 0.2, { attack: 0.5, q: 0.7 }),
    ],
  },
  // Ring-build clunk: a segment dropping into place. Low thump, a short metallic pair, a click.
  'tbm.ring': {
    minGapS: 0.12,
    voices: [
      v('sine', 82, 0, 0.14, 0.34, { freqEnd: 55 }),
      v('square', 187, 0, 0.09, 0.07, { filter: 'bandpass', filterFreq: 900, q: 4 }),
      v('square', 281, 0, 0.07, 0.05, { filter: 'bandpass', filterFreq: 1400, q: 4 }),
      v('noise', 1800, 0, 0.03, 0.16, { filter: 'bandpass', q: 1.5 }),
    ],
  },
  'tbm.stop': { minGapS: 0.5, voices: [v('sawtooth', 150, 0, 0.9, 0.22, { freqEnd: 38, filter: 'lowpass', filterFreq: 600 })] },
  'tbm.offPlan': {
    minGapS: 0.6,
    voices: [
      v('square', 880, 0, 0.09, 0.1, { filter: 'lowpass', filterFreq: 2500 }),
      v('square', 880, 0.16, 0.09, 0.1, { filter: 'lowpass', filterFreq: 2500 }),
    ],
  },
  // Breakthrough fanfare: the face falls in (crash and thump), then a rising call and a held major chord.
  'tbm.breakthrough': {
    minGapS: 2,
    voices: [
      v('noise', 1200, 0, 0.9, 0.34, { freqEnd: 200, q: 0.5 }),
      v('sine', 70, 0, 0.5, 0.4, { freqEnd: 35 }),
      brass(G4, 0.35, 0.16, 0.18),
      brass(C5, 0.5, 0.16, 0.18),
      brass(E5, 0.65, 0.16, 0.18),
      brass(G5, 0.8, 0.3, 0.2),
      brass(C5, 1.1, 1.3, 0.13),
      brass(E5, 1.1, 1.3, 0.12),
      brass(G5, 1.1, 1.3, 0.12),
      brass(C6, 1.1, 1.3, 0.14),
      ...bell(C7, 1.1, 0.9, 0.06),
    ],
  },
  'station.done': { minGapS: 0.4, voices: [...bell(E5, 0, 0.5, 0.2), ...bell(C5, 0.28, 0.8, 0.2)] },
  // A two-tone horn, then the call.
  'line.open': {
    minGapS: 2,
    voices: [
      brass(311.13, 0, 0.7, 0.18),
      brass(369.99, 0, 0.7, 0.18),
      brass(C5, 0.8, 0.14, 0.16),
      brass(E5, 0.94, 0.14, 0.16),
      brass(G5, 1.08, 0.14, 0.16),
      brass(C6, 1.22, 0.9, 0.18),
    ],
  },
  'scorecard.star': {
    minGapS: 0.1,
    voices: [v('sine', G6, 0, 0.12, 0.14), v('sine', C7, 0.07, 0.3, 0.16), v('triangle', E6, 0.07, 0.3, 0.06)],
  },
  'mission.complete': {
    minGapS: 2,
    voices: [
      brass(C4, 0, 0.2, 0.16),
      brass(G4, 0, 0.2, 0.14),
      brass(C5, 0.22, 0.2, 0.16),
      brass(D5, 0.44, 0.2, 0.16),
      brass(E5, 0.66, 0.2, 0.16),
      brass(G5, 0.88, 0.3, 0.18),
      brass(C5, 1.25, 1.6, 0.12),
      brass(E5, 1.25, 1.6, 0.12),
      brass(G5, 1.25, 1.6, 0.12),
      brass(C6, 1.25, 1.6, 0.14),
      ...bell(E6, 1.25, 1.2, 0.06),
    ],
  },
};

/** Seconds from the start of a cue to the end of its last voice. */
export function cueDuration(spec: CueSpec): number {
  let end = 0;
  for (const voice of spec.voices) end = Math.max(end, voice.at + voice.dur);
  return end;
}

export interface LoopVoice {
  wave: Voice['wave'];
  /** Frequency at pitch 1 (for noise: the filter frequency). Multiplied by the loop's pitch factor. */
  freq: number;
  gain: number;
  filter?: 'lowpass' | 'bandpass' | 'highpass';
  q?: number;
}

export interface LoopSpec {
  voices: readonly LoopVoice[];
  /** Amplitude wobble: rate in Hz at pitch 1 (scaled by the pitch factor) and depth 0..1. */
  wobbleHz: number;
  wobbleDepth: number;
  /** Gain of the whole loop at level 1. */
  gain: number;
}

export const LOOPS: Record<AudioLoop, LoopSpec> = {
  // Cutterhead rumble: two low saws a fifth apart under ground-up noise, grinding at a few hertz.
  // The app passes thrust (and the ground class) as the pitch factor, so the pitch follows the thrust.
  'tbm.drone': {
    gain: 0.3,
    wobbleHz: 6,
    wobbleDepth: 0.3,
    voices: [
      { wave: 'sawtooth', freq: 38, gain: 0.5, filter: 'lowpass', q: 1 },
      { wave: 'sawtooth', freq: 57, gain: 0.3, filter: 'lowpass', q: 1 },
      { wave: 'noise', freq: 180, gain: 0.9, filter: 'lowpass', q: 0.8 },
    ],
  },
  // Train pass-by: wheel roar and motor hum with a rail-joint rhythm; the app raises the level as the train nears.
  'train.run': {
    gain: 0.26,
    wobbleHz: 3.2,
    wobbleDepth: 0.45,
    voices: [
      { wave: 'noise', freq: 520, gain: 0.9, filter: 'bandpass', q: 0.7 },
      { wave: 'triangle', freq: 92, gain: 0.35 },
      { wave: 'sawtooth', freq: 184, gain: 0.08, filter: 'lowpass', q: 0.7 },
    ],
  },
  // Time-lapse: a light airy rush with a fast tick, like calendar pages.
  timelapse: {
    gain: 0.1,
    wobbleHz: 11,
    wobbleDepth: 0.6,
    voices: [{ wave: 'noise', freq: 3200, gain: 0.8, filter: 'highpass', q: 0.5 }],
  },
};
