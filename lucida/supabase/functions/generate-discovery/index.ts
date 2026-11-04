// Supabase Edge Function (Deno)。AIキーはここ(サーバー側の環境変数)にだけ置く。
// 未デプロイ・未検証（この開発環境ではDeno/Anthropic APIに接続できないため）。デプロイ手順は README を参照。
//
//   supabase secrets set ANTHROPIC_API_KEY=...        # キーはリポジトリに書かない
//   supabase functions deploy generate-discovery       # 既定で JWT 検証あり（サインイン済みユーザーのみ）
//
// 契約: POST body = GenerateRequest -> { candidates: Candidate[] }（出典必須）
import { buildPrompt, parseModelOutput, parseRequest, pickModel } from './logic.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const cors = {
  'access-control-allow-origin': Deno.env.get('LUCIDA_ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'server is not configured' }, 503);

  let req;
  try { req = parseRequest(await request.json()); } catch { return json({ error: 'invalid request' }, 400); }

  const { model, tier } = pickModel(req, {
    light: Deno.env.get('LUCIDA_MODEL_LIGHT') ?? 'claude-haiku-5-5',
    heavy: Deno.env.get('LUCIDA_MODEL_HEAVY') ?? 'claude-sonnet-5-5',
  });
  const { system, user } = buildPrompt(req);

  const body: Record<string, unknown> = {
    model, max_tokens: 2500, system, messages: [{ role: 'user', content: user }],
  };
  // Web検索は、ユーザーが許可したリクエストでのみ有効（検索回数も絞る）
  if (req.allowWebSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return json({ error: `upstream ${res.status}` }, 502);
    const data = await res.json() as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    return json({ candidates: parseModelOutput(text), tier });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
