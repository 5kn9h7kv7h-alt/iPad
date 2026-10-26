// 保存層。UIはこのリポジトリのメソッドだけを使う。
// 将来クラウド同期を足す場合は、同じメソッドを持つ別バックエンドを渡す。

const STORES = ['tasks', 'requests', 'receipts', 'rules'];
const DB_VERSION = 2; // v2: receipts, rules を追加（既存のtasks/requestsはそのまま残る）

export function createMemoryBackend() {
  const data = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  return {
    kind: 'memory',
    persistent: false,
    async getAll(store) { return [...data[store].values()].map((v) => structuredClone(v)); },
    async putMany(store, values) { for (const v of values) data[store].set(v.id, structuredClone(v)); },
    async remove(store, id) { data[store].delete(id); },
    async replaceAll(next) {
      for (const s of STORES) {
        data[s].clear();
        for (const v of next[s] || []) data[s].set(v.id, structuredClone(v));
      }
    },
  };
}

const idbRequest = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
});

export async function createIdbBackend(dbName = 'ai-control-panel') {
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, DB_VERSION);
    open.onupgradeneeded = () => {
      for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s, { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  return {
    kind: 'indexeddb',
    persistent: true,
    async getAll(store) { return idbRequest(db.transaction(store).objectStore(store).getAll()); },
    async putMany(store, values) {
      const tx = db.transaction(store, 'readwrite');
      for (const v of values) tx.objectStore(store).put(v);
      await idbDone(tx);
    },
    async remove(store, id) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      await idbDone(tx);
    },
    async replaceAll(next) {
      const tx = db.transaction(STORES, 'readwrite');
      for (const s of STORES) {
        tx.objectStore(s).clear();
        for (const v of next[s] || []) tx.objectStore(s).put(v);
      }
      await idbDone(tx);
    },
  };
}

// IndexedDB が使えない環境（一部のプライベートモードなど）ではメモリ保存に切り替える。
export async function openBackend(dbName) {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    return await createIdbBackend(dbName);
  } catch {
    return createMemoryBackend();
  }
}

export function createRepository(backend) {
  return {
    kind: backend.kind,
    persistent: backend.persistent,
    async loadAll() {
      const [tasks, requests, receipts, rules] = await Promise.all(STORES.map((s) => backend.getAll(s)));
      return { tasks, requests, receipts, rules };
    },
    putTask: (t) => backend.putMany('tasks', [t]),
    putTasks: (ts) => backend.putMany('tasks', ts),
    deleteTask: (id) => backend.remove('tasks', id),
    putRequest: (r) => backend.putMany('requests', [r]),
    deleteRequest: (id) => backend.remove('requests', id),
    putReceipt: (r) => backend.putMany('receipts', [r]),
    deleteReceipt: (id) => backend.remove('receipts', id),
    putRules: (rs) => backend.putMany('rules', rs),
    clearRules: async () => { const all = await backend.getAll('rules'); for (const r of all) await backend.remove('rules', r.id); },
    putMany: (data) => Promise.all(STORES.map((s) => backend.putMany(s, data[s] || []))),
    replaceAll: (data) => backend.replaceAll(data),
    clearAll: () => backend.replaceAll(Object.fromEntries(STORES.map((s) => [s, []]))),
  };
}

export async function openRepository(dbName) {
  return createRepository(await openBackend(dbName));
}
