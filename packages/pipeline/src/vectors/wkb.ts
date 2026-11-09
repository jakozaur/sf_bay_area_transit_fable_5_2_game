/** Minimal ISO WKB reader for the 2D geometries DuckDB's ST_AsWKB emits. Coordinates are returned as flat x, y pairs. */

export interface WkbShapes {
  /** One entry per polygon: its rings, outer ring first. Rings keep the closing point. */
  polygons: Float64Array[][];
  lines: Float64Array[];
  /** Flat x, y pairs. */
  points: number[];
}

export function parseWkb(wkb: Uint8Array): WkbShapes {
  const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  const out: WkbShapes = { polygons: [], lines: [], points: [] };
  let pos = 0;
  const need = (n: number): void => {
    if (pos + n > wkb.byteLength) throw new RangeError(`wkb: truncated at byte ${pos} of ${wkb.byteLength}`);
  };
  const coords = (little: boolean, n: number): Float64Array => {
    need(n * 16);
    const a = new Float64Array(n * 2);
    for (let i = 0; i < n * 2; i++) {
      a[i] = view.getFloat64(pos, little);
      pos += 8;
    }
    return a;
  };
  const geometry = (): void => {
    need(5);
    const little = view.getUint8(pos) === 1;
    const type = view.getUint32(pos + 1, little);
    pos += 5;
    const count = (): number => {
      need(4);
      const n = view.getUint32(pos, little);
      pos += 4;
      return n;
    };
    switch (type) {
      case 1: {
        const p = coords(little, 1);
        out.points.push(p[0] as number, p[1] as number);
        break;
      }
      case 2:
        out.lines.push(coords(little, count()));
        break;
      case 3: {
        const rings: Float64Array[] = [];
        const n = count();
        for (let i = 0; i < n; i++) rings.push(coords(little, count()));
        if (rings.length > 0) out.polygons.push(rings);
        break;
      }
      case 4:
      case 5:
      case 6:
      case 7: {
        const n = count();
        for (let i = 0; i < n; i++) geometry();
        break;
      }
      default:
        throw new Error(`wkb: unsupported geometry type ${type} at byte ${pos - 4} (only 2D types 1 to 7 are handled)`);
    }
  };
  geometry();
  if (pos !== wkb.byteLength) throw new RangeError(`wkb: ${wkb.byteLength - pos} trailing bytes`);
  return out;
}
