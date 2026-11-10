// Supabase Edge Function (Deno): 実験の振り返り（推測と提案）を作る。
// 事実の集計はクライアント側で済んでいる。ここではAIに「推測」と「提案」だけを書かせる。
//
//   supabase functions deploy analyze-experiment
//
// 契約: POST body = AnalyzeRequest -> { inferences: string[], nextSteps: string[] }
// 状態: 型チェックとロジックの単体テストは済み。実環境へのデプロイと実通信は未検証（README 参照）。
import { callClaude, createClient, toHttpError } from '../_shared/claude.ts';
import { corsHeaders, jsonResponse, verifyUser } from '../_shared/http.ts';
import { ANALYSIS_SCHEMA, buildAnalyzePrompt, parseAnalysisOutput, parseAnalyzeRequest } from './logic.ts';

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
  try { req = parseAnalyzeRequest(await request.json()); } catch { return jsonResponse({ error: 'invalid request' }, 400, cors); }
  const { system, user } = buildAnalyzePrompt(req);

  try {
    // 短い記録の読み取りなので、既定は安価な軽量モデル。LUCIDA_MODEL_ANALYZE で差し替えられる
    const model = Deno.env.get('LUCIDA_MODEL_ANALYZE') ?? Deno.env.get('LUCIDA_MODEL_LIGHT') ?? 'claude-haiku-5-5';
    const { text } = await callClaude(createClient(apiKey), { model, effort: 'low', system, user, schema: ANALYSIS_SCHEMA });
    return jsonResponse(parseAnalysisOutput(text), 200, cors);
  } catch (e) {
    console.error('analyze-experiment failed:', e);
    const { status, error } = toHttpError(e);
    return jsonResponse({ error }, status, cors);
  }
});
