import { STORE_NAMES, type Collection, type Repository, type StoreName } from './repository';

// v2: nodes / edges / experiments / experimentLogs を追加（v1 のデータはそのまま残る）
const DB_VERSION = 2;

const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error ?? new Error('transaction aborted'));
});

export async function createIdbRepository(dbName = 'lucida'): Promise<Repository> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(dbName, DB_VERSION);
    open.onupgradeneeded = () => {
      for (const s of STORE_NAMES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('indexedDB blocked'));
  });

  const col = (s: StoreName): Collection<any> => ({
    list: () => req(db.transaction(s).objectStore(s).getAll()),
    get: async (id) => (await req(db.transaction(s).objectStore(s).get(id))) ?? undefined,
    async put(item) { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(item); await done(tx); },
    async remove(id) { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).delete(id); await done(tx); },
  });

  const repo: any = {
    kind: 'indexeddb', persistent: true,
    async exportAll() {
      const out: any = {};
      for (const s of STORE_NAMES) out[s] = await req(db.transaction(s).objectStore(s).getAll());
      return out;
    },
    async importAll(d: any) {
      const tx = db.transaction(STORE_NAMES, 'readwrite');
      for (const s of STORE_NAMES) for (const v of d[s] ?? []) tx.objectStore(s).put(v);
      await done(tx);
    },
    async clearAll() {
      const tx = db.transaction(STORE_NAMES, 'readwrite');
      for (const s of STORE_NAMES) tx.objectStore(s).clear();
      await done(tx);
    },
  };
  for (const s of STORE_NAMES) repo[s] = col(s);
  return repo as Repository;
}
