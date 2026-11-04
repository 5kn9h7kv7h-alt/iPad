import type { Candidate } from '../domain/types';
import { CATEGORIES } from '../domain/types';
import type { DiscoveryProvider } from './provider';

/**
 * サーバー側（Supabase Edge Function 等）の生成エンドポイントを呼ぶプロバイダー。
 * AIキーはサーバー側にだけ置く。ここにはURLのみ。
 * 契約: POST {endpoint} body=GenerateRequest -> { candidates: Candidate[] }（出典 sources 必須）。
 * 応答は必ず検証し、出典のない候補は捨てる（確認できない情報を事実として出さないため）。
 */
export function createRemoteProvider(endpoint: string, fetchImpl: typeof fetch = fetch): DiscoveryProvider {
  return {
    id: 'remote-ai',
    metered: true,
    async generate(req, signal) {
      const res = await fetchImpl(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal,
      });
      if (!res.ok) throw new Error(`AIエンドポイントがエラーを返しました (${res.status})`);
      const json = (await res.json()) as { candidates?: unknown };
      return validateCandidates(json.candidates);
    },
  };
}

export function validateCandidates(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) throw new Error('AI応答の形式が不正です');
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const out: Candidate[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const sources = Array.isArray(r.sources)
      ? (r.sources as Record<string, unknown>[]).map((s) => ({ title: str(s.title), url: str(s.url) }))
          .filter((s) => s.title && /^https?:\/\//.test(s.url))
      : [];
    const category = CATEGORIES.find((c) => c === r.category);
    if (!str(r.title) || !str(r.fact) || !category || sources.length === 0) continue;
    out.push({
      sourceKey: str(r.sourceKey) || `ai-${str(r.title)}`,
      category, tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(str).filter(Boolean).slice(0, 8) : [],
      title: str(r.title), fact: str(r.fact), reasoning: str(r.reasoning), suggestion: str(r.suggestion),
      utility: typeof r.utility === 'number' ? r.utility : undefined, sources, provenance: 'ai',
    });
  }
  return out;
}
