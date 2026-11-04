import { createIdbRepository } from './idb';
import { createMemoryRepository } from './memory';
import type { Repository } from './repository';

/**
 * 既定は IndexedDB。Supabase は VITE_LUCIDA_BACKEND=supabase を明示したときだけ有効
 * （サインイン画面は未実装のため、Phase 1 では既定で使わない）。
 */
export async function openRepository(): Promise<Repository> {
  const env = import.meta.env;
  if (env.VITE_LUCIDA_BACKEND === 'supabase' && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
    const { createSupabaseRepository } = await import('./supabase');
    return createSupabaseRepository(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  }
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    return await createIdbRepository();
  } catch (e) {
    console.warn('IndexedDB を開けないためメモリ保存に切り替えました', e);
    return createMemoryRepository();
  }
}
