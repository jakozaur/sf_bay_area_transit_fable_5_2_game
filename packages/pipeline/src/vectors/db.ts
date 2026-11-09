/** Thin wrapper over @duckdb/node-api with the spatial and httpfs extensions loaded. */
import { DuckDBInstance } from '@duckdb/node-api';
import { OVERTURE_REGION } from './config.ts';

export type Row = Record<string, unknown>;

export interface Db {
  run(sql: string): Promise<void>;
  rows(sql: string): Promise<Row[]>;
  close(): void;
}

export function sqlString(s: string): string {
  return `'${s.replaceAll("'", "''")}'`;
}

export async function openDb(): Promise<Db> {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  const run = async (sql: string): Promise<void> => {
    try {
      await conn.run(sql);
    } catch (err) {
      throw new Error(`duckdb: ${(err as Error).message.split('\n')[0]} [sql: ${sql.replace(/\s+/g, ' ').slice(0, 160)}]`);
    }
  };
  await run('INSTALL spatial; LOAD spatial; INSTALL httpfs; LOAD httpfs;');
  await run(`SET s3_region=${sqlString(OVERTURE_REGION)};`);
  return {
    run,
    rows: async (sql) => {
      try {
        return (await conn.runAndReadAll(sql)).getRowObjectsJS() as Row[];
      } catch (err) {
        throw new Error(`duckdb: ${(err as Error).message.split('\n')[0]} [sql: ${sql.replace(/\s+/g, ' ').slice(0, 160)}]`);
      }
    },
    close: () => {
      conn.closeSync();
    },
  };
}

/** Typed accessors for query results: fail on an unexpected type instead of coercing. */
export function num(row: Row, key: string): number {
  const v = row[key];
  if (typeof v === 'bigint') return Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`duckdb: column "${key}" is ${String(v)}, expected a number`);
  return v;
}

export function optNum(row: Row, key: string): number | undefined {
  return row[key] === null || row[key] === undefined ? undefined : num(row, key);
}

/** NULL becomes ''. */
export function str(row: Row, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') throw new TypeError(`duckdb: column "${key}" is ${typeof v}, expected a string`);
  return v;
}

export function blob(row: Row, key: string): Uint8Array {
  const v = row[key];
  if (!(v instanceof Uint8Array)) throw new TypeError(`duckdb: column "${key}" is ${typeof v}, expected a blob`);
  return v;
}

export function numList(row: Row, key: string): number[] {
  const v = row[key];
  if (!Array.isArray(v)) throw new TypeError(`duckdb: column "${key}" is ${typeof v}, expected a list`);
  return v.map((x) => Number(x));
}

export function strList(row: Row, key: string): string[] {
  const v = row[key];
  if (!Array.isArray(v)) throw new TypeError(`duckdb: column "${key}" is ${typeof v}, expected a list`);
  return v.map((x) => String(x));
}
