import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_SCHEMA, buildAnalyzePrompt, parseAnalysisOutput, parseAnalyzeRequest } from '../analyze-experiment/logic.ts';
import { CANDIDATES_SCHEMA, parseRequest, pickModel } from '../generate-discovery/logic.ts';
import { callClaude, RefusalError, supportsFallback, toHttpError, TruncatedError, webSearchTool } from './claude.ts';
import { bearerToken, corsHeaders, verifyUser } from './http.ts';

/** SDKクライアントの代わり。stream(...).finalMessage() が返す応答を順に差し出し、送られたパラメータを記録する。 */
function fakeClient(responses: (Record<string, unknown> | Error)[]) {
  const calls: Record<string, any>[] = [];
  const client = {
    beta: { messages: { stream: (params: Record<string, any>) => {
      calls.push(structuredClone(params));
      const next = responses.shift();
      return { finalMessage: async () => { if (next instanceof Error) throw next; return next; } };
    } } },
  } as unknown as Anthropic;
  return { client, calls };
}
const msg = (over: Record<string, unknown> = {}) => ({ model: 'served', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }], ...over });
const base = { effort: 'low' as const, system: 'S', user: 'U' };

describe('callClaude', () => {
  it('対応モデルではフォールバックを指定し、構造化出力のスキーマと effort を送る', async () => {
    const { client, calls } = fakeClient([msg()]);
    const r = await callClaude(client, { ...base, model: 'claude-opus-5-5', schema: { type: 'object' } });
    expect(r).toEqual({ text: '{"ok":true}', model: 'served' });
    expect(calls[0]).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(calls[0].output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } });
    expect(calls[0].tools).toBeUndefined();
    expect(calls[0].temperature).toBeUndefined();
    expect(calls[0].thinking).toBeUndefined(); // 思考は既定(adaptive)に任せ、深さは effort で決める
  });
  it('Haiku にはフォールバックを付けない', async () => {
    const { client, calls } = fakeClient([msg()]);
    await callClaude(client, { ...base, model: 'claude-haiku-5-5' });
    expect(calls[0].fallbacks).toBeUndefined();
    expect(calls[0].betas).toBeUndefined();
  });
  it('Web検索は指定されたときだけ有効にし、そのときは構造化出力を外す', async () => {
    const { client, calls } = fakeClient([msg()]);
    await callClaude(client, { ...base, model: 'claude-opus-5-5', webSearch: true, schema: { type: 'object' } });
    expect(calls[0].tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }]);
    expect(calls[0].output_config).toEqual({ effort: 'low' });
  });
  it('拒否(refusal)のときは content を読まずに例外にする', async () => {
    const { client } = fakeClient([msg({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, content: [] })]);
    await expect(callClaude(client, { ...base, model: 'claude-opus-5-5' })).rejects.toBeInstanceOf(RefusalError);
  });
  it('pause_turn は応答をそのまま戻して再開し、回数に上限がある', async () => {
    const paused = msg({ stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 't', name: 'web_search', input: {} }] });
    const { client, calls } = fakeClient([paused, msg()]);
    const r = await callClaude(client, { ...base, model: 'claude-opus-5-5', webSearch: true });
    expect(r.text).toBe('{"ok":true}');
    expect(calls[1].messages).toHaveLength(2);
    expect(calls[1].messages[1]).toEqual({ role: 'assistant', content: paused.content });
    const loop = fakeClient([paused, paused, paused, paused, paused]);
    await callClaude(loop.client, { ...base, model: 'claude-opus-5-5', webSearch: true });
    expect(loop.calls).toHaveLength(4); // 最初の1回 + 再開3回まで
  });
  it('出力が上限で切れたら失敗にする（壊れたJSONを返さない）', async () => {
    const { client } = fakeClient([msg({ stop_reason: 'max_tokens' })]);
    await expect(callClaude(client, { ...base, model: 'claude-haiku-5-5' })).rejects.toBeInstanceOf(TruncatedError);
  });
  it('フォールバック指定が拒まれたら、外して一度だけやり直す', async () => {
    const bad = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks not supported' } }, 'fallbacks not supported', new Headers());
    const { client, calls } = fakeClient([bad, msg()]);
    await callClaude(client, { ...base, model: 'claude-opus-5-5' });
    expect(calls).toHaveLength(2);
    expect(calls[1].fallbacks).toBeUndefined();
    const twice = fakeClient([bad, bad]);
    await expect(callClaude(twice.client, { ...base, model: 'claude-opus-5-5' })).rejects.toBeInstanceOf(Anthropic.BadRequestError);
  });
  it('モデルごとの対応を判定する', () => {
    expect(supportsFallback('claude-opus-5-5')).toBe(true);
    expect(supportsFallback('claude-sonnet-5-5')).toBe(true);
    expect(supportsFallback('claude-haiku-5-5')).toBe(false);
    expect(webSearchTool('claude-sonnet-5-5')).toBe('web_search_20260209');
    expect(webSearchTool('claude-haiku-5-5')).toBe('web_search_20250305');
  });
  it('例外をHTTPステータスに変換し、内部の詳細は返さない', () => {
    expect(toHttpError(new RefusalError('bio'))).toEqual({ status: 422, error: 'the model declined this request' });
    expect(toHttpError(new Anthropic.RateLimitError(429, undefined, 'secret detail', new Headers())).status).toBe(429);
    expect(toHttpError(new Anthropic.AuthenticationError(401, undefined, 'bad key sk-xxx', new Headers()))).toEqual({ status: 503, error: 'server is not configured' });
    expect(JSON.stringify(toHttpError(new Anthropic.BadRequestError(400, undefined, 'sk-secret', new Headers())))).not.toContain('sk-secret');
    expect(toHttpError(new Error('x')).status).toBe(500);
  });
});

describe('generate-discovery: モデルの使い分け', () => {
  const models = { light: 'L', heavy: 'H' };
  it('通常は軽量・effort low、検索やテーマ指定は上位・effort medium', () => {
    expect(pickModel(parseRequest({ count: 1 }), models)).toEqual({ model: 'L', tier: 'light', effort: 'low' });
    expect(pickModel(parseRequest({ count: 1, allowWebSearch: true }), models)).toEqual({ model: 'H', tier: 'heavy', effort: 'medium' });
    expect(pickModel(parseRequest({ count: 1, category: 'Unknown' }), models).tier).toBe('heavy');
  });
  it('スキーマは全オブジェクトで additionalProperties:false（構造化出力の要件）', () => {
    const walk = (n: any): void => {
      if (n && typeof n === 'object') {
        if (n.type === 'object') { expect(n.additionalProperties).toBe(false); expect(Object.keys(n.properties).sort()).toEqual([...n.required].sort()); }
        Object.values(n).forEach(walk);
      }
    };
    walk(CANDIDATES_SCHEMA); walk(ANALYSIS_SCHEMA);
  });
});

describe('analyze-experiment logic', () => {
  const body = { experiment: { title: '朝の散歩', hypothesis: 'h', plan: 'p', startsOn: '2026-11-01', endsOn: '2026-11-07', outcome: 'supported', result: 'よかった' }, facts: ['実施率は80%。'], logs: [{ day: '2026-11-01', did: true, rating: 4, text: 'メモ' }, { day: 'bad', did: true, text: '' }] };
  it('入力を検証し、不正な記録と不明な評価を落とす', () => {
    const r = parseAnalyzeRequest({ ...body, experiment: { ...body.experiment, outcome: 'hacked' } });
    expect(r.logs).toHaveLength(1);
    expect(r.experiment.outcome).toBeUndefined();
    expect(() => parseAnalyzeRequest({ experiment: {} })).toThrow();
    expect(parseAnalyzeRequest({ ...body, facts: Array(50).fill('x') }).facts).toHaveLength(12);
  });
  it('プロンプトに、集計済みの事実・推測の書き方・医療助言の禁止が入る', () => {
    const { system, user } = buildAnalyzePrompt(parseAnalyzeRequest(body));
    expect(system).toContain('推測');
    expect(system).toContain('医療');
    expect(user).toContain('実施率は80%');
    expect(user).toContain('仮説は支持された');
    expect(user).toContain('2026-11-01 実施 手応え4/5');
  });
  it('出力を取り出して件数を制限し、空なら失敗にする', () => {
    expect(parseAnalysisOutput('{"inferences":["a","b","c","d","e"],"nextSteps":["x",1]}')).toEqual({ inferences: ['a', 'b', 'c', 'd'], nextSteps: ['x'] });
    expect(() => parseAnalysisOutput('{"inferences":[],"nextSteps":[]}')).toThrow();
    expect(() => parseAnalysisOutput('no json')).toThrow();
  });
});

describe('利用者の確認', () => {
  const req = (auth?: string) => new Request('https://x.test', { method: 'POST', headers: auth ? { authorization: auth } : {} });
  const env = { supabaseUrl: 'https://p.supabase.co/', anonKey: 'anon' };
  it('トークンがなければ 401', async () => {
    expect(await verifyUser(req(), env)).toMatchObject({ ok: false, status: 401 });
    expect(bearerToken('Basic abc')).toBeNull();
  });
  it('Supabase Auth に問い合わせ、有効な利用者だけを通す', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const ok = (async (url: string, init: RequestInit) => { seen = { url, headers: init.headers as Record<string, string> }; return new Response(JSON.stringify({ id: 'user-1' })); }) as unknown as typeof fetch;
    expect(await verifyUser(req('Bearer tok'), env, ok)).toEqual({ ok: true, userId: 'user-1' });
    expect(seen).toEqual({ url: 'https://p.supabase.co/auth/v1/user', headers: { authorization: 'Bearer tok', apikey: 'anon' } });
    const denied = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    expect(await verifyUser(req('Bearer bad'), env, denied)).toMatchObject({ ok: false, status: 401 });
    const down = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await verifyUser(req('Bearer tok'), env, down)).toMatchObject({ ok: false, status: 503 });
  });
  it('設定がなければ 503、匿名許可は明示したときだけ', async () => {
    expect(await verifyUser(req('Bearer tok'), {})).toMatchObject({ ok: false, status: 503 });
    expect(await verifyUser(req(), { allowAnonymous: true })).toEqual({ ok: true, userId: null });
    expect(corsHeaders(undefined)['access-control-allow-origin']).toBe('*');
    expect(corsHeaders('https://app.example')['access-control-allow-origin']).toBe('https://app.example');
  });
});
