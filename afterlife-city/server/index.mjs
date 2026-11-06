// Minimal AI proxy. API keys stay on the server; the browser only sees /api/ai.
//   ANTHROPIC_API_KEY=...  (or GEMINI_API_KEY=...)  node server/index.mjs
// Optional: AI_MODEL, PORT (default 8787), HOST (default 127.0.0.1)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const GEMINI = process.env.GEMINI_API_KEY;
const provider = ANTHROPIC ? 'anthropic' : GEMINI ? 'gemini' : null;
const MODEL = process.env.AI_MODEL ?? (provider === 'gemini' ? 'gemini-2.5-flash' : 'claude-haiku-5-5');
const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');

const RULES = `あなたは架空の海沿いの街「ルミエール・ベイ」の語り部です。シミュレーションエンジンが管理する確定データだけを材料にします。
厳守事項:
- 入力に存在しない住人・場所を作らない。IDは入力に含まれるものだけを使う。
- 過去の出来事を改変しない。矛盾する記憶を作らない。
- 同じ出来事を繰り返さない。不自然に大きな変化（死亡・犯罪・破産など）を起こさない。
- あなたの文章は演出であり、数値や関係性を直接変更しない。
- 出力は指定されたJSONのみ。説明文やコードブロックは付けない。日本語で書く。`;

const PROMPTS = {
  events: p => `${RULES}

以下は現在の街の状況です。住人の暮らしから自然に生まれる小さな出来事の「提案」を最大3件、JSON配列で返してください。
type は meetup(2人の待ち合わせ)/festival(祭り)/rumor(噂)/hobby(新しい趣味)のいずれか。
各要素: {"type","title"(40字以内),"detail"(120字以内),"cause","locationId","people":[住人ID],"startInMinutes"(60〜2880),"durationMinutes","param"(hobbyのみ:趣味名)}
meetupは面識のある2人、場所は営業中の店や公園。hobbyのparamは次から選ぶ: 読書,釣り,写真,散歩,音楽,料理,絵,海,カフェ巡り,園芸,将棋,映画,ランニング,星空。
titleやdetailに、people以外の住人の名前を含めないこと。

街の状況:
${JSON.stringify(p)}`,
  dialogue: p => `${RULES}

次の2人の会話を2〜4行で書いてください。性格・関係性・場所・話題・口調(tone)を反映し、1行は50字以内。
出力: [{"speakerId":"<aId または bId>","text":"..."}]

${JSON.stringify(p)}`,
  documentary: p => `${RULES}

次の住人の人生を、静かなドキュメンタリーのナレーション風に4〜6段落でまとめてください。入力にある出来事だけを使い、新しい事実を足さないこと。
出力: {"title":"...","paragraphs":["...",...]}

${JSON.stringify(p)}`,
  summary: p => `${RULES}

次の記憶リストを、本人の視点で1〜2文に要約してください。出力: {"summary":"..."}

${JSON.stringify(p)}`,
};

const hits = [];
function limited() {
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 20) return true;
  hits.push(now);
  return false;
}

function extractJson(text) {
  const a = text.search(/[[{]/);
  if (a < 0) throw new Error('no json');
  const open = text[a], close = open === '{' ? '}' : ']';
  const b = text.lastIndexOf(close);
  return JSON.parse(text.slice(a, b + 1));
}

async function callModel(prompt) {
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const j = await r.json();
    return j.content?.map(c => c.text ?? '').join('') ?? '';
  }
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  }
  throw new Error('no provider');
}

function readBody(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.url === '/api/ai/status') return send(200, { enabled: !!provider, provider, model: provider ? MODEL : null });
    if (req.url === '/api/ai' && req.method === 'POST') {
      if (!provider) return send(503, { ok: false, error: 'AI is not configured' });
      if (limited()) return send(429, { ok: false, error: 'rate limited' });
      const { task, payload } = JSON.parse(await readBody(req));
      const build = PROMPTS[task];
      if (!build) return send(400, { ok: false, error: 'unknown task' });
      const text = await callModel(build(payload));
      return send(200, { ok: true, data: extractJson(text) });
    }
    // static (production build)
    const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(DIST, rel === '/' || rel === '.' ? 'index.html' : rel);
    if (!file.startsWith(DIST)) return send(403, { error: 'forbidden' });
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    send(e?.code === 'ENOENT' ? 404 : 500, { ok: false, error: String(e?.message ?? e) });
  }
});
server.listen(PORT, HOST, () => console.log(`AFTERLIFE CITY server http://${HOST}:${PORT}  AI: ${provider ?? 'disabled'}${provider ? ` (${MODEL})` : ''}`));
