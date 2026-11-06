// Save / load through IndexedDB (falls back to nothing when unavailable — the app still runs).
import type { WorldState } from '../sim/types';
import { migrateWorld } from '../sim/world';

const DB = 'afterlife-city', STORE = 'save', KEY = 'world', SAVE_VERSION = 1;

export interface SaveRecord { world: WorldState; savedAtMs: number; speed: number; aiEnabled: boolean }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGame(rec: SaveRecord): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(JSON.stringify(rec), KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch { return false; }
}

export function parseSave(text: string): SaveRecord | null {
  try {
    const rec = JSON.parse(text) as SaveRecord;
    if (!rec?.world || rec.world.version !== SAVE_VERSION || !rec.world.citizens || !rec.world.buildings) return null;
    migrateWorld(rec.world);
    return rec;
  } catch { return null; }
}

export async function loadGame(): Promise<SaveRecord | null> {
  try {
    const db = await open();
    const text = await new Promise<string | undefined>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result as string | undefined);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return text ? parseSave(text) : null;
  } catch { return null; }
}

export async function clearGame(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => res(); });
    db.close();
  } catch { /* ignore */ }
}
