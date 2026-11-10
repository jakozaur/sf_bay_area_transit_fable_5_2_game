import { AUDIO_CUES, AUDIO_LOOPS } from '@bayvox/core';
import { expect, test } from 'vitest';
import { createAudio, LONGEST_CUE_S } from './engine.ts';
import { FakeAudioContext } from './fake-context.ts';
import { CUES, cueDuration, LOOPS } from './sounds.ts';

function setup(options: { volume?: number; muted?: boolean; maxVoices?: number } = {}) {
  const ctx = new FakeAudioContext();
  let created = 0;
  const audio = createAudio({
    ...options,
    createContext: () => {
      created++;
      return ctx;
    },
  });
  return { ctx, audio, created: () => created };
}

test('nothing exists before the first gesture: cues are dropped, loop levels are remembered and start at the unlock', () => {
  const { ctx, audio, created } = setup();
  const target = new EventTarget();
  audio.init(target);
  audio.init(target);
  audio.cue('ui.click');
  audio.loop('tbm.drone', 0.5, 1.2);
  expect(created()).toBe(0);
  expect(audio.state()).toMatchObject({ unlocked: false, context: 'none', cuesDropped: 1, activeVoices: 0 });
  expect(audio.state().loops['tbm.drone']).toEqual({ level: 0.5, pitch: 1.2, running: false });

  // An event that is not a gesture does nothing; the first key or pointer event unlocks, once.
  target.dispatchEvent(new Event('mousemove'));
  expect(created()).toBe(0);
  target.dispatchEvent(new Event('keydown'));
  target.dispatchEvent(new Event('pointerdown'));
  expect(created()).toBe(1);
  expect(ctx.state).toBe('running');
  expect(audio.state()).toMatchObject({ unlocked: true, context: 'running' });
  expect(audio.state().loops['tbm.drone'].running).toBe(true);
  // The dropped cue stays dropped.
  expect(audio.state().cuesPlayed['ui.click']).toBe(0);
  expect(() => createAudio().init()).toThrow(/needs an event target/);
});

test('every cue of the contract has a spec that schedules cleanly and reaches the output', () => {
  expect(Object.keys(CUES).sort()).toEqual([...AUDIO_CUES].sort());
  for (const id of AUDIO_CUES) {
    const { ctx, audio } = setup();
    audio.unlock();
    ctx.currentTime = 3;
    const before = ctx.nodes.length;
    audio.cue(id);
    const spec = CUES[id];
    const added = ctx.nodes.slice(before);
    const sources = added.filter((n) => n.kind === 'oscillator' || n.kind === 'noise');
    expect(sources.length).toBe(spec.voices.length);
    const duration = cueDuration(spec);
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThanOrEqual(LONGEST_CUE_S);
    for (const s of sources) {
      // Never scheduled in the past, always stopped, and wired to the speakers.
      expect(s.startedAt).toBeGreaterThanOrEqual(3);
      expect(s.stoppedAt).toBeGreaterThan(s.startedAt as number);
      expect(s.stoppedAt).toBeLessThanOrEqual(3 + duration + 0.05);
      expect(ctx.reachesDestination(s)).toBe(true);
    }
    // Envelopes start silent, peak at the voice's gain and end silent; the sum of peaks stays civil.
    let peak = 0;
    for (const voice of spec.voices) {
      expect(voice.gain).toBeGreaterThan(0);
      expect(voice.gain).toBeLessThanOrEqual(0.5);
      expect(voice.dur).toBeGreaterThan(0);
      peak += voice.gain;
    }
    expect(peak).toBeLessThan(2.2);
    for (const g of ctx.gains().slice(1)) {
      if (!added.includes(g)) continue;
      expect(g.gain.events[0]).toMatchObject({ kind: 'set', value: 0 });
      expect(g.gain.events[g.gain.events.length - 1]?.value).toBeLessThan(0.001);
    }
    expect(audio.state().cuesPlayed[id]).toBe(1);
    expect(audio.state().activeVoices).toBe(spec.voices.length);
    ctx.currentTime = 3 + duration + 0.1;
    expect(audio.state().activeVoices).toBe(0);
  }
  const { audio } = setup();
  expect(() => audio.cue('nope' as 'ui.click')).toThrow(/unknown cue "nope"/);
});

test('the ring clunk is low and short, the breakthrough is a rising call that ends on a held chord', () => {
  const ring = CUES['tbm.ring'];
  expect(cueDuration(ring)).toBeLessThan(0.25);
  expect(Math.min(...ring.voices.map((v) => v.freq))).toBeLessThan(100);
  const fanfare = CUES['tbm.breakthrough'].voices.filter((v) => v.wave === 'sawtooth');
  const call = fanfare.filter((v) => v.dur < 0.5).map((v) => v.freq);
  expect(call).toEqual([...call].sort((a, b) => a - b));
  const chord = fanfare.filter((v) => v.dur > 1);
  expect(chord.length).toBe(4);
  expect(new Set(chord.map((v) => v.at)).size).toBe(1);
  // C major: the ratios of a major triad plus the octave.
  const root = chord[0]?.freq as number;
  expect(chord.map((v) => Number((v.freq / root).toFixed(2)))).toEqual([1, 1.26, 1.5, 2]);
  // The cash register is two bright pings; the event sting contains a tritone.
  expect(CUES.money.voices.filter((v) => v.wave === 'triangle' && v.freq > 1500).length).toBe(2);
  const sting = CUES['event.raised'].voices.filter((v) => v.wave === 'sawtooth').map((v) => v.freq);
  expect((sting[1] as number) / (sting[0] as number)).toBeCloseTo(Math.SQRT2, 2);
});

test('the same cue is not repeated inside its gap, and the voice limit drops what does not fit', () => {
  const { ctx, audio } = setup({ maxVoices: 6 });
  audio.unlock();
  audio.cue('money');
  audio.cue('money');
  expect(audio.state()).toMatchObject({ cuesDropped: 1 });
  expect(audio.state().cuesPlayed.money).toBe(1);
  ctx.currentTime = CUES.money.minGapS + 0.001;
  audio.cue('money');
  expect(audio.state().cuesPlayed.money).toBe(2);
  // 6 voices are sounding; the 4-voice ring clunk does not fit, a later one does.
  audio.cue('tbm.ring');
  expect(audio.state().cuesPlayed['tbm.ring']).toBe(0);
  expect(audio.state().cuesDropped).toBe(2);
  ctx.currentTime = 1;
  audio.cue('tbm.ring');
  expect(audio.state().cuesPlayed['tbm.ring']).toBe(1);
  expect(() => createAudio({ maxVoices: 0 })).toThrow(/maxVoices/);
});

test('mute and volume drive the master gain; a muted engine schedules no cues', () => {
  const { ctx, audio } = setup({ volume: 0.5 });
  const seen: boolean[] = [];
  const off = audio.muted.subscribe((m) => seen.push(m));
  audio.unlock();
  const master = ctx.gains()[0];
  if (master === undefined) throw new Error('no master gain');
  expect(master.gain.value).toBe(0.5);
  expect(master.outputs).toEqual([ctx.destination]);
  audio.setMuted(true);
  expect(master.gain.target).toBe(0);
  const nodes = ctx.nodes.length;
  audio.cue('ui.click');
  expect(ctx.nodes.length).toBe(nodes);
  expect(audio.state()).toMatchObject({ muted: true, cuesDropped: 1 });
  audio.setVolume(1);
  expect(master.gain.target).toBe(0);
  audio.setMuted(false);
  audio.setMuted(false);
  expect(master.gain.target).toBe(1);
  expect(seen).toEqual([true, false]);
  off();
  expect(audio.volume.get()).toBe(1);
  expect(() => audio.setVolume(1.5)).toThrow(/volume must be in \[0, 1\]/);
  // A muted start: the master gain is created at zero.
  const quiet = setup({ muted: true });
  quiet.audio.unlock();
  expect(quiet.ctx.gains()[0]?.gain.value).toBe(0);
});

test('the cutterhead drone follows level and pitch, stops at level 0 and can start again', () => {
  const { ctx, audio } = setup();
  audio.unlock();
  expect(Object.keys(LOOPS).sort()).toEqual([...AUDIO_LOOPS].sort());
  audio.loop('tbm.drone', 0.5, 1);
  const spec = LOOPS['tbm.drone'];
  // Two saws, one noise source and the wobble LFO, all started and wired to the output.
  const oscs = ctx.oscillators();
  expect(oscs.map((o) => o.type).sort()).toEqual(['sawtooth', 'sawtooth', 'sine']);
  expect(ctx.of('noise').length).toBe(1);
  for (const s of [...oscs, ...ctx.of('noise')]) {
    expect(s.startedAt).toBe(0);
    expect(s.stoppedAt).toBeNull();
    expect(ctx.reachesDestination(s)).toBe(true);
  }
  const saws = oscs.filter((o) => o.type === 'sawtooth');
  expect(saws.map((o) => o.frequency.target)).toEqual([38, 57]);
  const level = ctx.gains()[1];
  if (level === undefined) throw new Error('no level gain');
  expect(level.gain.target).toBeCloseTo(0.5 * spec.gain, 9);
  expect(audio.state().loops['tbm.drone']).toEqual({ level: 0.5, pitch: 1, running: true });

  // More thrust: louder and higher, on the same nodes.
  ctx.currentTime = 2;
  const nodes = ctx.nodes.length;
  audio.loop('tbm.drone', 1, 1.5);
  expect(ctx.nodes.length).toBe(nodes);
  expect(saws.map((o) => o.frequency.target)).toEqual([57, 85.5]);
  expect(oscs.find((o) => o.type === 'sine')?.frequency.target).toBeCloseTo(spec.wobbleHz * 1.5, 9);
  expect(level.gain.target).toBeCloseTo(spec.gain, 9);

  // Level 0 fades and stops every source; a later level builds a fresh set.
  audio.loop('tbm.drone', 0);
  expect(level.gain.target).toBe(0);
  for (const s of [...oscs, ...ctx.of('noise')]) expect(s.stoppedAt).toBeGreaterThan(2);
  expect(audio.state().loops['tbm.drone'].running).toBe(false);
  audio.loop('tbm.drone', 0);
  audio.loop('tbm.drone', 0.3, 0.8);
  expect(ctx.nodes.length).toBeGreaterThan(nodes);
  expect(audio.state().loops['tbm.drone']).toEqual({ level: 0.3, pitch: 0.8, running: true });

  // The other loops run side by side.
  audio.loop('train.run', 1);
  audio.loop('timelapse', 0.4);
  expect(audio.state().loops['train.run'].running && audio.state().loops.timelapse.running).toBe(true);
  expect(() => audio.loop('tbm.drone', 1.2)).toThrow(/level must be in \[0, 1\]/);
  expect(() => audio.loop('tbm.drone', 1, 0)).toThrow(/pitch must be finite and > 0/);
  expect(() => audio.loop('nope' as 'timelapse', 1)).toThrow(/unknown loop "nope"/);
});

test('noise is generated once, bounded and the same every time; dispose stops loops and closes the context', () => {
  const a = setup();
  a.audio.unlock();
  a.audio.cue('dig');
  a.audio.loop('timelapse', 1);
  expect(a.ctx.buffers.length).toBe(1);
  const data = a.ctx.buffers[0] as Float32Array;
  let min = 1;
  let max = -1;
  let sum = 0;
  for (const v of data) {
    min = Math.min(min, v);
    max = Math.max(max, v);
    sum += v;
  }
  expect(min).toBeGreaterThanOrEqual(-1);
  expect(max).toBeLessThanOrEqual(1);
  expect(max - min).toBeGreaterThan(1.9);
  expect(Math.abs(sum / data.length)).toBeLessThan(0.05);
  const b = setup();
  b.audio.unlock();
  b.audio.cue('dig');
  expect([...(b.ctx.buffers[0] as Float32Array).slice(0, 8)]).toEqual([...data.slice(0, 8)]);

  const target = new EventTarget();
  const c = setup();
  c.audio.init(target);
  c.audio.dispose();
  target.dispatchEvent(new Event('pointerdown'));
  expect(c.created()).toBe(0);
  a.audio.dispose();
  a.audio.dispose();
  expect(a.ctx.closed).toBe(true);
  expect(a.ctx.of('noise').every((n) => n.stoppedAt !== null)).toBe(true);
  expect(() => a.audio.unlock()).toThrow(/after dispose/);
});
