import { STORE_NAMES, type Collection, type Repository, type StoreName } from './repository';

export function createMemoryRepository(): Repository {
  const data = Object.fromEntries(STORE_NAMES.map((s) => [s, new Map<string, any>()])) as Record<StoreName, Map<string, any>>;
  const col = (s: StoreName): Collection<any> => ({
    async list() { return [...data[s].values()].map((v) => structuredClone(v)); },
    async get(id) { const v = data[s].get(id); return v ? structuredClone(v) : undefined; },
    async put(item) { data[s].set(item.id, structuredClone(item)); },
    async remove(id) { data[s].delete(id); },
  });
  const repo: any = {
    kind: 'memory', persistent: false,
    async exportAll() { return Object.fromEntries(STORE_NAMES.map((s) => [s, [...data[s].values()].map((v) => structuredClone(v))])); },
    async importAll(d: any) { for (const s of STORE_NAMES) for (const v of d[s] ?? []) data[s].set(v.id, structuredClone(v)); },
    async clearAll() { for (const s of STORE_NAMES) data[s].clear(); },
  };
  for (const s of STORE_NAMES) repo[s] = col(s);
  return repo as Repository;
}
