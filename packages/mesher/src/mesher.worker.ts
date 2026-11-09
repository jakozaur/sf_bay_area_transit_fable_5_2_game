/** Worker entry: `new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' })` (see pool.ts). */
import { serveMesher } from './protocol.ts';
import { createMesherScratch } from './scratch.ts';

serveMesher(self as unknown as DedicatedWorkerGlobalScope, createMesherScratch());
