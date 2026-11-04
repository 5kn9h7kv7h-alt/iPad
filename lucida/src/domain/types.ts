export const CATEGORIES = ['Science', 'Technology', 'Society', 'Daily Life', 'Ideas', 'Unknown'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_JA: Record<Category, string> = {
  Science: '科学', Technology: '技術', Society: '社会', 'Daily Life': '暮らし', Ideas: '思考', Unknown: '未知',
};

export interface Interest {
  id: string;
  name: string;
  weight: 1 | 2 | 3 | 4 | 5;
  origin: 'manual' | 'inferred';
  createdAt: string;
  updatedAt: string;
}

export interface Scores {
  interest: number; novelty: number; utility: number; timing: number; diversity: number; total: number;
}

/** 事実(fact)は出典つき、考察(reasoning)は推測、提案(suggestion)はAI/ルールによる提案。混ぜない。 */
export interface Discovery {
  id: string;
  sourceKey: string;
  contentHash: string;
  title: string;
  category: Category;
  tags: string[];
  fact: string;
  reasoning: string;
  suggestion: string;
  provenance: 'bundled' | 'ai';
  scores: Scores;
  generatedFor: string; // YYYY-MM-DD
  createdAt: string;
}

export interface Source {
  id: string;
  discoveryId: string;
  title: string;
  url: string;
  fetchedAt: string; // 記録した日時 (ISO)
  note?: string;
  /** 出典の種類: 同梱カタログ / AI(検索)由来 / ユーザーが追加 */
  origin?: 'bundled' | 'ai' | 'user';
  /** ユーザーが実際にリンク先を確認した日時。未確認なら未設定 */
  verifiedAt?: string;
}

export type InteractionKind = 'like' | 'dislike' | 'clear_rating' | 'save' | 'unsave' | 'plan' | 'unplan';
export interface Interaction {
  id: string; discoveryId: string; kind: InteractionKind; createdAt: string;
}

export interface Question { id: string; text: string; status: 'open' | 'resolved'; createdAt: string }

export type NoteKind = 'idea' | 'insight' | 'log';
export interface Note { id: string; kind: NoteKind; text: string; tags: string[]; createdAt: string }

export interface Prefs {
  id: 'prefs';
  dailyTarget: number; // Homeで自動生成する枚数
  dailyLimit: number; // 1日に生成できる発見の上限（AI費用の上限にもなる）
  aiMode: 'auto' | 'rule';
  /** 外部情報(Web検索)の利用許可。明示的にオンにした場合のみ。既定はオフ */
  webSearch: boolean;
  profileSummary: string;
  summaryUpdatedAt: string;
}
export const DEFAULT_PREFS: Prefs = {
  id: 'prefs', dailyTarget: 3, dailyLimit: 6, aiMode: 'auto', webSearch: false, profileSummary: '', summaryUpdatedAt: '',
};

export interface UsageRow { id: string; count: number } // id = YYYY-MM-DD
export interface CacheRow { id: string; value: unknown; createdAt: string }

/** プロバイダーが返す候補。出典つき。 */
export interface Candidate {
  sourceKey: string;
  category: Category;
  tags: string[];
  title: string;
  fact: string;
  reasoning: string;
  suggestion: string;
  timing?: 'morning' | 'evening' | 'weekend' | 'weekday';
  utility?: number; // 0..1
  sources: { title: string; url: string }[];
  provenance: 'bundled' | 'ai';
}
