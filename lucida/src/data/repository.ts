import type { CacheRow, Discovery, Interaction, Interest, Note, Prefs, Question, Source, UsageRow } from '../domain/types';

/** どのバックエンド（IndexedDB / メモリ / Supabase）も同じ形で扱う。UIはここだけを見る。 */
export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface Collections {
  interests: Interest;
  discoveries: Discovery;
  sources: Source;
  questions: Question;
  interactions: Interaction;
  notes: Note;
  preferences: Prefs;
  usage: UsageRow;
  cache: CacheRow;
}
export type StoreName = keyof Collections;
export const STORE_NAMES: StoreName[] = [
  'interests', 'discoveries', 'sources', 'questions', 'interactions', 'notes', 'preferences', 'usage', 'cache',
];

export type Repository = {
  readonly kind: 'indexeddb' | 'memory' | 'supabase';
  /** ブラウザ再起動後も残る保存先か */
  readonly persistent: boolean;
  /** バックアップ用の全件エクスポート／インポート／全削除 */
  exportAll(): Promise<{ [K in StoreName]: Collections[K][] }>;
  importAll(data: Partial<{ [K in StoreName]: Collections[K][] }>): Promise<void>;
  clearAll(): Promise<void>;
} & { [K in StoreName]: Collection<Collections[K]> };
