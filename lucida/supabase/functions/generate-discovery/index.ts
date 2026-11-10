// Supabase Edge Function (Deno): 発見候補の生成。
// AIキーはここ（サーバー側の環境変数）にだけ置く。クライアントには決して渡さない。
//
//   supabase secrets set ANTHROPIC_API_KEY=...      # キーはリポジトリに書かない
//   supabase functions deploy generate-discovery
//
// 契約: POST body = GenerateRequest -> { candidates: Candidate[] }（出典必須）
// 状態: 型チェックとロジックの単体テストは済み。実環境へのデプロイと実通信は未検証（README 参照）。
import { callClaude, createClient, toHttpError } from '../_shared/claude.ts';
import { corsHeaders, jsonResponse, verifyUser } from '../_shared/http.ts';
import { buildPrompt, CANDIDATES_SCHEMA, parseModelOutput, parseRequest, pickModel } from './logic.ts';

const cors = corsHeaders(Deno.env.get('LUCIDA_ALLOWED_ORIGIN'));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405, cors);

  const auth = await verifyUser(request, {
    supabaseUrl: Deno.env.get('SUPABASE_URL'), anonKey: Deno.env.get('SUPABASE_ANON_KEY'), allowAnonymous: Deno.env.get('LUCIDA_ALLOW_ANON') === 'true',
  });
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status, cors);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'server is not configured' }, 503, cors);

  let req;
  try { req = parseRequest(await request.json()); } catch { return jsonResponse({ error: 'invalid request' }, 400, cors); }

  // モデルは環境変数で差し替えられる。既定: 通常=Haiku 5.5（安価）、検索・テーマ指定=Opus 5.5
  const { model, tier, effort } = pickModel(req, {
    light: Deno.env.get('LUCIDA_MODEL_LIGHT') ?? 'claude-haiku-5-5',
    heavy: Deno.env.get('LUCIDA_MODEL_HEAVY') ?? 'claude-opus-5-5',
  });
  const { system, user } = buildPrompt(req);

  try {
    const { text, model: servedBy } = await callClaude(createClient(apiKey), {
      model, effort, system, user, webSearch: req.allowWebSearch, schema: CANDIDATES_SCHEMA,
    });
    return jsonResponse({ candidates: parseModelOutput(text), tier, model: servedBy }, 200, cors);
  } catch (e) {
    console.error('generate-discovery failed:', e);
    const { status, error } = toHttpError(e);
    return jsonResponse({ error }, status, cors);
  }
});
