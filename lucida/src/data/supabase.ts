import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { STORE_NAMES, type Collection, type RepoAuth, type Repository, type StoreName } from './repository';

/**
 * Supabase バックエンド（Phase 1 では未接続・準備のみ。実環境での動作は未検証）。
 * テーブルは supabase/migrations/0001_init.sql を参照。全テーブルに user_id があり、RLS で本人のみアクセス可能。
 * アプリ側の camelCase ⇄ DB の snake_case を機械的に変換する。
 * 注意: ここで使うのは公開前提の anon key だけ。AIキーは決してクライアントに置かない。
 */

const TABLE: Record<StoreName, string> = {
  interests: 'interests', discoveries: 'discoveries', sources: 'sources', questions: 'questions',
  interactions: 'interactions', notes: 'notes', preferences: 'user_preferences', usage: 'ai_usage', cache: 'ai_cache',
  nodes: 'knowledge_nodes', edges: 'knowledge_edges', experiments: 'experiments', experimentLogs: 'experiment_logs',
};

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const mapKeys = (o: Record<string, unknown>, f: (k: string) => string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));
/** DBの行 → アプリの値。null の列は「未設定」として落とす（アプリ側は undefined で扱う）。 */
export const fromRow = (row: Record<string, unknown>) => {
  const o = mapKeys(Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)), camel);
  delete o.userId;
  return o;
};
/** アプリの値 → DBの行。undefined は null にして、列の値を消せるようにする（例: 位置のリセット）。 */
export const toRow = (item: Record<string, unknown>, userId: string) => ({
  ...Object.fromEntries(Object.entries(item).map(([k, v]) => [snake(k), v === undefined ? null : v])), user_id: userId,
});

export function createSupabaseRepository(url: string, anonKey: string): Repository {
  const client: SupabaseClient = createClient(url, anonKey);

  async function userId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('Supabase: サインインが必要です');
    return data.user.id;
  }

  const col = (s: StoreName): Collection<any> => {
    const table = TABLE[s];
    return {
      async list() {
        const { data, error } = await client.from(table).select('*');
        if (error) throw error;
        return (data ?? []).map(fromRow);
      },
      async get(id) {
        const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? fromRow(data) : undefined;
      },
      async put(item) {
        const { error } = await client.from(table).upsert(toRow(item as unknown as Record<string, unknown>, await userId()));
        if (error) throw error;
      },
      async remove(id) {
        const { error } = await client.from(table).delete().eq('id', id);
        if (error) throw error;
      },
    };
  };

  const auth: RepoAuth = {
    async currentEmail() {
      const { data } = await client.auth.getSession();
      return data.session?.user.email ?? null;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(error.message);
    },
    async functionHeaders() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      const headers: Record<string, string> = token ? { authorization: `Bearer ${token}`, apikey: anonKey } : {};
      return headers;
    },
  };

  const repo: any = {
    kind: 'supabase', persistent: true, auth,
    async exportAll() {
      const out: any = {};
      for (const s of STORE_NAMES) out[s] = await repo[s].list();
      return out;
    },
    async importAll(d: any) { for (const s of STORE_NAMES) for (const v of d[s] ?? []) await repo[s].put(v); },
    async clearAll() {
      for (const s of STORE_NAMES) { for (const v of await repo[s].list()) await repo[s].remove(v.id); }
    },
  };
  for (const s of STORE_NAMES) repo[s] = col(s);
  return repo as Repository;
}
