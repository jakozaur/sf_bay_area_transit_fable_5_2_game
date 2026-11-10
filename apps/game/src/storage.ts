/**
 * Where saves and the campaign profile live: IndexedDB through idb-keyval in the browser, a Map in tests.
 * A save slot is one record: the sim's SaveFile, the manual edit log text it references and the slot info
 * for the Continue button. Nothing here falls back: a browser without IndexedDB makes save and load fail
 * with a message the session shows.
 */
import type { CampaignProgress, SaveFile, SaveSlotInfo } from '@bayvox/core';
import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';

export const AUTOSAVE_SLOT = 'auto';
const SLOT_PREFIX = 'save.';
const CAMPAIGN_KEY = 'campaign';

export interface SaveRecord {
  info: SaveSlotInfo;
  save: SaveFile;
  /** packages/world edit-log text of the hand digs; empty when nothing was dug. */
  editLog: string;
}

/** Key-value storage of structured-cloneable values. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, unknown>();
  return {
    get: async (key) => structuredClone(map.get(key)),
    set: async (key, value) => void map.set(key, structuredClone(value)),
    delete: async (key) => void map.delete(key),
    keys: async () => [...map.keys()],
  };
}

export function createIdbStore(): KeyValueStore {
  let store: UseStore | null = null;
  const use = (): UseStore => {
    if (typeof indexedDB === 'undefined') throw new Error('storage: this browser has no IndexedDB, saves are unavailable');
    store ??= createStore('bayvox', 'game');
    return store;
  };
  return {
    get: (key) => get(key, use()),
    set: (key, value) => set(key, value, use()),
    delete: (key) => del(key, use()),
    keys: async () => (await keys(use())).map(String),
  };
}

function isRecord(v: unknown): v is SaveRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<SaveRecord>;
  return typeof r.info === 'object' && r.info !== null && typeof r.save === 'object' && r.save !== null && typeof r.editLog === 'string';
}

export class GameStorage {
  private readonly kv: KeyValueStore;

  constructor(kv: KeyValueStore) {
    this.kv = kv;
  }

  async writeSave(record: SaveRecord): Promise<void> {
    await this.kv.set(SLOT_PREFIX + record.info.slot, record);
  }

  /** The record of `slot`. Rejects naming the slot when it is missing or not a save. */
  async readSave(slot: string): Promise<SaveRecord> {
    const v = await this.kv.get(SLOT_PREFIX + slot);
    if (v === undefined) throw new Error(`storage: there is no save in slot "${slot}"`);
    if (!isRecord(v)) throw new Error(`storage: slot "${slot}" does not hold a save`);
    return v;
  }

  /** Slot infos, newest first. Records that are not saves are skipped with a console warning naming the key. */
  async listSaves(): Promise<SaveSlotInfo[]> {
    const out: SaveSlotInfo[] = [];
    for (const key of await this.kv.keys()) {
      if (!key.startsWith(SLOT_PREFIX)) continue;
      const v = await this.kv.get(key);
      if (isRecord(v)) out.push(v.info);
      else console.warn(`storage: ignoring ${key}, it is not a save record`);
    }
    return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  }

  async deleteSave(slot: string): Promise<void> {
    await this.kv.delete(SLOT_PREFIX + slot);
  }

  /** The stored campaign profile, or null when there is none yet. Rejects on a record of another shape. */
  async readCampaign(): Promise<CampaignProgress | null> {
    const v = await this.kv.get(CAMPAIGN_KEY);
    if (v === undefined) return null;
    const c = v as Partial<CampaignProgress>;
    if (c.schemaVersion !== 1 || typeof c.missions !== 'object' || c.missions === null)
      throw new Error('storage: the stored campaign profile has an unknown shape');
    return c as CampaignProgress;
  }

  async writeCampaign(progress: CampaignProgress): Promise<void> {
    await this.kv.set(CAMPAIGN_KEY, progress);
  }
}
