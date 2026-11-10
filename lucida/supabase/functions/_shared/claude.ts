// Claude の呼び出し（公式SDK）。AIキーはサーバー側の環境変数にだけ置く。
import Anthropic from '@anthropic-ai/sdk';

export type Effort = 'low' | 'medium' | 'high';

export interface ClaudeCall {
  model: string;
  effort: Effort;
  system: string;
  user: string;
  /** ユーザーが許可したリクエストでだけ true */
  webSearch?: boolean;
  /** 構造化出力のJSONスキーマ。Web検索と併用すると引用(citations)と両立しないため、検索時は使わない */
  schema?: Record<string, unknown>;
}

/** モデルが安全上の理由で応答を断った */
export class RefusalError extends Error {
  constructor(public category: string | null) { super('refused'); }
}
/** 出力が上限で切れた（JSONが壊れている可能性が高い） */
export class TruncatedError extends Error {}

/** サーバー側のフォールバック（拒否時に別モデルで再実行）に対応するモデルか。Haiku 5.5 は非対応。 */
export const supportsFallback = (model: string) => /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/.test(model);
/** Web検索ツールの版。動的フィルタつき(20260209)は Opus / Sonnet / Fable 系のみ。それ以外は基本版。 */
export const webSearchTool = (model: string) => (/^claude-(opus|sonnet|fable|mythos)-/.test(model) ? 'web_search_20260209' : 'web_search_20250305') as 'web_search_20260209' | 'web_search_20250305';

const MAX_TOKENS = 16000;
const MAX_RESUMES = 3;

export async function callClaude(client: Anthropic, call: ClaudeCall): Promise<{ text: string; model: string }> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: call.user }];
  const useSchema = call.schema && !call.webSearch;
  const run = (withFallback: boolean) => client.beta.messages.stream({
    model: call.model,
    max_tokens: MAX_TOKENS,
    system: call.system,
    messages,
    // 思考の深さ(=費用)は effort で調整する。軽い処理は low、検索やテーマ指定は medium
    output_config: { effort: call.effort, ...(useSchema ? { format: { type: 'json_schema' as const, schema: call.schema! } } : {}) },
    ...(call.webSearch ? { tools: [{ type: webSearchTool(call.model), name: 'web_search' as const, max_uses: 3 }] } : {}),
    // 拒否されたとき、Anthropic 推奨の別モデルでサーバー側が再実行する
    ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  }).finalMessage();

  let fallback = supportsFallback(call.model);
  for (let turn = 0; ; turn++) {
    let message;
    try { message = await run(fallback); }
    catch (e) {
      // フォールバック指定が受け付けられない環境では、指定を外して一度だけやり直す
      if (fallback && e instanceof Anthropic.BadRequestError) { console.warn('fallbacks rejected, retrying without:', e.message); fallback = false; message = await run(false); }
      else throw e;
    }
    // content を読む前に、必ず停止理由を確かめる
    if (message.stop_reason === 'refusal') throw new RefusalError(message.stop_details?.category ?? null);
    if (message.stop_reason === 'pause_turn' && turn < MAX_RESUMES) {
      // サーバー側ツール(Web検索)の途中で一時停止した。応答をそのまま戻すと続きから再開される
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    if (message.stop_reason === 'max_tokens') throw new TruncatedError('output was truncated');
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    return { text, model: message.model };
  }
}

/** SDK の例外を、クライアントへ返す HTTP ステータスと短い理由に変換する（内部の詳細は返さない）。 */
export function toHttpError(e: unknown): { status: number; error: string } {
  if (e instanceof RefusalError) return { status: 422, error: 'the model declined this request' };
  if (e instanceof TruncatedError) return { status: 502, error: 'model output was truncated' };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, error: 'rate limited, try again later' };
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { status: 503, error: 'server is not configured' };
  if (e instanceof Anthropic.BadRequestError) return { status: 502, error: 'upstream rejected the request' };
  if (e instanceof Anthropic.APIConnectionError) return { status: 504, error: 'upstream is unreachable' };
  if (e instanceof Anthropic.APIError) return { status: 502, error: `upstream error ${e.status ?? ''}`.trim() };
  return { status: 500, error: 'internal error' };
}

export const createClient = (apiKey: string) => new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
