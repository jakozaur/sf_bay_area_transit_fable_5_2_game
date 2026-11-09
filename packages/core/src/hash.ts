/**
 * Stable, engine-independent hashes (FNV-1a). Not cryptographic.
 * Used for sim state hashes, deterministic noise, and test fingerprints.
 */

export const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;
/** Second, independent starting basis used to widen stableHash to 64 bits. */
const FNV32_OFFSET_B = 0x9747b28c;

type Bytes = Uint8Array | Uint8ClampedArray;

/** FNV-1a 32-bit over bytes. Pass a previous result as `h` to chain. Returns a u32. */
export function fnv1a32(data: Bytes, h: number = FNV32_OFFSET): number {
  let x = h | 0;
  for (let i = 0; i < data.length; i++) {
    x ^= data[i] as number;
    x = Math.imul(x, FNV32_PRIME);
  }
  return x >>> 0;
}

/** Views any typed array or ArrayBuffer as bytes (platform byte order; all supported targets are little-endian). */
export function asBytes(data: ArrayBufferView | ArrayBuffer): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** FNV-1a 32-bit over the UTF-16 code units of a string (two bytes per unit, low byte first). */
export function fnv1a32String(s: string, h: number = FNV32_OFFSET): number {
  let x = h | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    x ^= c & 0xff;
    x = Math.imul(x, FNV32_PRIME);
    x ^= c >>> 8;
    x = Math.imul(x, FNV32_PRIME);
  }
  return x >>> 0;
}

/** Lower-case hex of a u32, zero padded to 8 characters. */
export function hex32(x: number): string {
  return (x >>> 0).toString(16).padStart(8, '0');
}

/** 64-bit stable hash of bytes as 16 hex characters (two FNV-1a passes with different bases). */
export function stableHash(data: ArrayBufferView | ArrayBuffer): string {
  const bytes = asBytes(data);
  return hex32(fnv1a32(bytes, FNV32_OFFSET)) + hex32(fnv1a32(bytes, FNV32_OFFSET_B));
}

/** 64-bit stable hash of a string as 16 hex characters. */
export function stableHashString(s: string): string {
  return hex32(fnv1a32String(s, FNV32_OFFSET)) + hex32(fnv1a32String(s, FNV32_OFFSET_B));
}

/**
 * Integer lattice hash: mixes up to three int32 coordinates and a seed into a u32.
 * Deterministic on every engine (integer ops only). Use for procedural noise.
 */
export function hashCoords(x: number, y: number, z: number, seed: number): number {
  let h = (seed | 0) ^ 0x27d4eb2f;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (z | 0), 0x165667b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
