/**
 * A recording stand-in for AudioContext: every node, connection and scheduled parameter change is kept as
 * data, and `currentTime` is set by the test. For unit tests of the engine's graph logic; it makes no sound.
 */
import type {
  AudioContextLike,
  BufferLike,
  BufferSourceLike,
  FilterLike,
  GainLike,
  NodeLike,
  OscillatorLike,
  ParamLike,
} from './engine.ts';

export interface ParamEvent {
  kind: 'set' | 'linear' | 'exp' | 'target';
  value: number;
  time: number;
}

export class FakeParam implements ParamLike {
  value: number;
  readonly events: ParamEvent[] = [];
  constructor(value: number) {
    this.value = value;
  }
  private push(kind: ParamEvent['kind'], value: number, time: number): void {
    if (!Number.isFinite(value) || !Number.isFinite(time) || time < 0)
      throw new RangeError(`FakeParam: bad ${kind} event value ${value} at ${time}`);
    // The real API throws for an exponential ramp to zero.
    if (kind === 'exp' && value <= 0) throw new RangeError('FakeParam: exponential ramp target must be positive');
    this.events.push({ kind, value, time });
  }
  setValueAtTime(value: number, time: number): void {
    this.push('set', value, time);
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.push('linear', value, time);
  }
  exponentialRampToValueAtTime(value: number, time: number): void {
    this.push('exp', value, time);
  }
  setTargetAtTime(value: number, time: number, _timeConstant: number): void {
    this.push('target', value, time);
  }
  /** The value the last scheduled event heads for (or the plain value if nothing was scheduled). */
  get target(): number {
    const last = this.events[this.events.length - 1];
    return last === undefined ? this.value : last.value;
  }
}

export class FakeNode implements NodeLike {
  readonly kind: string;
  readonly outputs: (FakeNode | FakeParam)[] = [];
  disconnected = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor(kind: string) {
    this.kind = kind;
  }
  connect(destination: NodeLike | ParamLike): void {
    if (!(destination instanceof FakeNode) && !(destination instanceof FakeParam))
      throw new TypeError('FakeNode.connect: destination is not a fake node or param');
    this.outputs.push(destination);
  }
  disconnect(): void {
    this.outputs.length = 0;
    this.disconnected = true;
  }
  start(when = 0): void {
    if (this.startedAt !== null) throw new Error(`FakeNode: ${this.kind} started twice`);
    this.startedAt = when;
  }
  stop(when = 0): void {
    if (this.startedAt === null) throw new Error(`FakeNode: ${this.kind} stopped before it was started`);
    this.stoppedAt = when;
  }
}

class FakeOscillator extends FakeNode implements OscillatorLike {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  constructor() {
    super('oscillator');
  }
}
class FakeGain extends FakeNode implements GainLike {
  readonly gain = new FakeParam(1);
  constructor() {
    super('gain');
  }
}
class FakeFilter extends FakeNode implements FilterLike {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  constructor() {
    super('filter');
  }
}
class FakeBufferSource extends FakeNode implements BufferSourceLike {
  buffer: BufferLike | null = null;
  loop = false;
  constructor() {
    super('noise');
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 8000;
  state = 'suspended';
  readonly destination = new FakeNode('destination');
  readonly nodes: FakeNode[] = [];
  readonly buffers: Float32Array[] = [];
  closed = false;

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    this.closed = true;
    return Promise.resolve();
  }
  private add<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
  createOscillator(): FakeOscillator {
    return this.add(new FakeOscillator());
  }
  createGain(): FakeGain {
    return this.add(new FakeGain());
  }
  createBiquadFilter(): FakeFilter {
    return this.add(new FakeFilter());
  }
  createBuffer(_channels: number, length: number, _sampleRate: number): BufferLike {
    const data = new Float32Array(length);
    this.buffers.push(data);
    return { getChannelData: () => data };
  }
  createBufferSource(): FakeBufferSource {
    return this.add(new FakeBufferSource());
  }

  of(kind: string): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }
  oscillators(): FakeOscillator[] {
    return this.nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
  }
  gains(): FakeGain[] {
    return this.nodes.filter((n): n is FakeGain => n instanceof FakeGain);
  }
  /** True if a signal path leads from `node` to the destination (through nodes, or into a param of a node that does). */
  reachesDestination(node: FakeNode, seen = new Set<FakeNode>()): boolean {
    if (node === this.destination) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    for (const out of node.outputs) {
      if (out instanceof FakeNode) {
        if (this.reachesDestination(out, seen)) return true;
      } else {
        const owner = this.gains().find((g) => g.gain === out);
        if (owner !== undefined && this.reachesDestination(owner, seen)) return true;
      }
    }
    return false;
  }
}
