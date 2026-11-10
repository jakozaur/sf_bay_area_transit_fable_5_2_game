/** Audio: a small Web Audio synth behind core's AudioPort. No asset files; every sound is oscillators and noise. */
export {
  type AudioContextLike,
  type AudioEngine,
  type AudioEngineOptions,
  type AudioState,
  createAudio,
  type LoopState,
} from './engine.ts';
export { CUES, type CueSpec, cueDuration, LOOPS, type LoopSpec, type LoopVoice, type Voice } from './sounds.ts';
