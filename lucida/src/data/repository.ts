import type {
  CacheRow, Discovery, Experiment, ExperimentLog, Interaction, Interest, KnowledgeEdge, KnowledgeNode, Note, Prefs, Question, Source, UsageRow,
} from '../domain/types';

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
  nodes: KnowledgeNode;
  edges: KnowledgeEdge;
  experiments: Experiment;
  experimentLogs: ExperimentLog;
}
export type StoreName = keyof Collections;
export const STORE_NAMES: StoreName[] = [
  'interests', 'discoveries', 'sources', 'questions', 'interactions', 'notes', 'preferences', 'usage', 'cache',
  'nodes', 'edges', 'experiments', 'experimentLogs',
];

/** サインインが必要なバックエンド（Supabase）だけが実装する。ローカル保存では未定義。 */
export interface RepoAuth {
  currentEmail(): Promise<string | null>;
  signIn(email: string, password: string): Promise<void>;
  /** 確認メールが必要な設定なら needsConfirmation=true（その場合はまだサインインしていない） */
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  /** サーバー側の関数（AI中継）を呼ぶときのヘッダー */
  functionHeaders(): Promise<Record<string, string>>;
}

export type Repository = {
  readonly auth?: RepoAuth;
  readonly kind: 'indexeddb' | 'memory' | 'supabase';
  /** ブラウザ再起動後も残る保存先か */
  readonly persistent: boolean;
  /** バックアップ用の全件エクスポート／インポート／全削除 */
  exportAll(): Promise<{ [K in StoreName]: Collections[K][] }>;
  importAll(data: Partial<{ [K in StoreName]: Collections[K][] }>): Promise<void>;
  clearAll(): Promise<void>;
} & { [K in StoreName]: Collection<Collections[K]> };
