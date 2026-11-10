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
export interface Note {
  id: string; kind: NoteKind; text: string; tags: string[]; createdAt: string;
  /** 取り込み元。手動入力は未設定。連携(ファイル取り込み)で入った記録は連携ID */
  source?: 'calendar' | 'study';
  /** 取り込み元での識別子（再取り込み時の重複防止） */
  externalId?: string;
  importedAt?: string;
}

export interface Prefs {
  id: 'prefs';
  dailyTarget: number; // Homeで自動生成する枚数
  dailyLimit: number; // 1日に生成できる発見の上限（AI費用の上限にもなる）
  aiMode: 'auto' | 'rule';
  /** 外部情報(Web検索)の利用許可。明示的にオンにした場合のみ。既定はオフ */
  webSearch: boolean;
  /** 提案数の決め方: adaptive=反応に合わせて自動調整 / fixed=dailyTarget固定 */
  frequencyMode: 'adaptive' | 'fixed';
  /** 外部サービス連携の許可（連携ID→許可）。明示的にオンにしたものだけ使える */
  integrations: Record<string, boolean>;
  /** 初回の案内を終えたか */
  onboarded: boolean;
  profileSummary: string;
  summaryUpdatedAt: string;
}
export const DEFAULT_PREFS: Prefs = {
  id: 'prefs', dailyTarget: 3, dailyLimit: 6, aiMode: 'auto', webSearch: false, frequencyMode: 'adaptive', integrations: {}, onboarded: false, profileSummary: '', summaryUpdatedAt: '',
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

// ---- Knowledge Network (Phase 3) ----
export const NODE_TYPES = ['topic', 'discovery', 'question', 'insight', 'experiment'] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export const NODE_TYPE_JA: Record<NodeType, string> = {
  topic: 'テーマ', discovery: '発見', question: '疑問', insight: '気づき', experiment: '実験',
};

/**
 * ノードの保存レコード。興味・発見・疑問などから導かれるノードは id が決まっており（例 `topic:<id>`）、
 * このレコードは位置・非表示・明示的な追加(pinned)だけを持つ。refId のないものはユーザーが作った自由ノード。
 */
export interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  refId?: string;
  x?: number;
  y?: number;
  hidden?: boolean;
  /** 自動では載らない項目を、ユーザーがNetworkに追加した */
  pinned?: boolean;
  note?: string;
  createdAt: string;
}

export interface KnowledgeEdge {
  id: string;
  sourceNode: string;
  targetNode: string;
  relation: string;
  /** user=自分で結んだ / ai=候補を承認した / system=実験と発見の関係など、事実として決まるもの */
  origin: 'user' | 'ai' | 'system';
  /** dismissed=候補を却下した記録（再提案しないために残す。表示はしない） */
  status: 'active' | 'dismissed';
  createdAt: string;
}

// ---- Lab (Phase 3) ----
export type Outcome = 'supported' | 'not_supported' | 'unclear';
export const OUTCOME_JA: Record<Outcome, string> = {
  supported: '仮説は支持された', not_supported: '仮説は支持されなかった', unclear: 'どちらとも言えない',
};

/** 分析結果。facts は記録の集計（事実）、inferences は推測、nextSteps は提案。 */
export interface Analysis {
  facts: string[];
  inferences: string[];
  nextSteps: string[];
  caveat: string;
  provider: string;
  createdAt: string;
}

export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  plan: string;
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
  status: 'planned' | 'running' | 'done';
  outcome?: Outcome;
  result?: string;
  aiAnalysis?: Analysis;
  discoveryId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ExperimentLog {
  id: string;
  experimentId: string;
  day: string; // YYYY-MM-DD
  did: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: string;
}
