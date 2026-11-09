/**
 * Message protocol between the mesher pool and its workers, and the worker-side handler.
 * Hand-written typed postMessage (doc 10 section 3.3 allows this instead of Comlink): every typed array
 * crosses the boundary by transfer, never by copy.
 */
import { CHUNK_SIZE, type MesherScratch, type MeshOutput, PADDED_VOLUME } from '@bayvox/core';
import { meshChunk, meshChunkFlat } from './mesh-chunk.ts';
import { type ColumnSlabMesh, meshColumnPatch } from './mesh-columns.ts';

export type MesherRequest =
  | { id: number; t: 'chunk'; key: number; padded: Uint16Array; ao: boolean }
  | { id: number; t: 'columns'; key: number; heights: Int16Array | Int32Array; classes: Uint16Array };

export type MesherResponse =
  /** `padded` is the request's buffer coming home for reuse. */
  | { id: number; ok: true; t: 'chunk'; mesh: MeshOutput; padded: Uint16Array }
  | { id: number; ok: true; t: 'columns'; slabs: ColumnSlabMesh[] }
  | { id: number; ok: false; error: string };

export interface MesherReply {
  response: MesherResponse;
  transfer: ArrayBuffer[];
}

function transferable(view: Uint16Array | Uint32Array): ArrayBuffer {
  const buffer = view.buffer;
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('mesher protocol: typed array is not backed by an ArrayBuffer');
  return buffer;
}

/** Runs one request. Never throws: failures become an `ok: false` response naming the job. */
export function runMesherRequest(request: MesherRequest, scratch: MesherScratch): MesherReply {
  try {
    if (request.t === 'chunk') {
      if (request.padded.length !== PADDED_VOLUME) {
        throw new RangeError(`padded must have ${PADDED_VOLUME} entries, got ${request.padded.length}`);
      }
      const input = { key: request.key, size: CHUNK_SIZE, padded: request.padded };
      const mesh = request.ao ? meshChunk(input, scratch) : meshChunkFlat(input, scratch);
      return {
        response: { id: request.id, ok: true, t: 'chunk', mesh, padded: request.padded },
        transfer: [transferable(mesh.quads), transferable(mesh.faceOffsets), transferable(request.padded)],
      };
    }
    const slabs = meshColumnPatch({ key: request.key, size: CHUNK_SIZE, heights: request.heights, classes: request.classes }, scratch);
    const transfer: ArrayBuffer[] = [];
    for (const s of slabs) transfer.push(transferable(s.mesh.quads), transferable(s.mesh.faceOffsets));
    return { response: { id: request.id, ok: true, t: 'columns', slabs }, transfer };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { response: { id: request.id, ok: false, error: `mesher job ${request.t} key ${request.key}: ${reason}` }, transfer: [] };
  }
}

/** The part of a dedicated worker scope or MessagePort the server side needs. */
export interface MesherServerPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

/** Serves mesher requests arriving on `port` with one scratch. Called by the worker entry. */
export function serveMesher(port: MesherServerPort, scratch: MesherScratch): void {
  port.onmessage = (event) => {
    const reply = runMesherRequest(event.data as MesherRequest, scratch);
    port.postMessage(reply.response, reply.transfer);
  };
}
