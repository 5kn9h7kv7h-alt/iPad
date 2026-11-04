import type { Candidate, Category } from '../domain/types';

export interface GenerateRequest {
  /** 要約済みの興味プロフィール（履歴の全送信はしない） */
  profileSummary: string;
  interests: { name: string; weight: number }[];
  /** すでに生成済みのキー（重複生成を避ける） */
  avoidKeys: string[];
  category?: Category;
  keyword?: string;
  /** いずれかに合致するテーマ（関連発見の探索用） */
  keywords?: string[];
  /** ユーザーが許可した場合のみ true。サーバー側でWeb検索を使ってよい */
  allowWebSearch?: boolean;
  count: number;
}

/** 発見候補の生成元。差し替え可能（ルールベース / 外部AI）。 */
export interface DiscoveryProvider {
  readonly id: string;
  /** コストが発生するか（キャッシュ・日次上限の対象） */
  readonly metered: boolean;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<Candidate[]>;
}
