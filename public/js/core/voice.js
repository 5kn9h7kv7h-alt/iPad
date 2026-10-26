// ルールベースの日本語コマンド解析。認識結果を直接実行せず、意図と対象を取り出して返す。
import { PROJECTS, getProject } from './model.js';
import { CATEGORIES } from './receipt.js';

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　・･]/g, '')
    .replace(/[。．.!！?？]+$/, '');
}

const ALIASES = PROJECTS.flatMap((p) => p.aliases.map((a) => ({ id: p.id, alias: normalize(a) })));

// 最も長く一致したエイリアスを採用（「大学の勉強」が「大学」より優先される）
function findProject(t) {
  let best = null;
  for (const { id, alias } of ALIASES) {
    const index = t.indexOf(alias);
    if (index < 0) continue;
    if (!best || alias.length > best.alias.length) best = { id, alias, index };
  }
  return best;
}

const removeFound = (t, f) => (f ? t.slice(0, f.index) + t.slice(f.index + f.alias.length) : t);
const unquote = (s) => s.replace(/^[「『"'“]+|[」』"'”]+$/g, '');

// 追加を表す動詞（「〜を追加」「〜を入れておいて」「メモ：〜」など）
const ADD_VERB = '(?:追加|登録|作成|作って|つくって|入れ(?:て)?|いれ(?:て)?|足し(?:て)?|加え(?:て)?|記録|メモ(?:して)?|控え(?:て)?)';
// 語尾（「して」「しておいて」「してほしい」「しといて」「お願いします」…）
const POLITE = '(?:て|して|する|します|ください|ておいて|おいて|とい(?:て)?|おねがい(?:します)?|お願い(?:します)?|ほしい|欲しい|ほしいです|もらえる(?:かな)?|くれる?|いただけますか)*';
// 文全体の検出に使う「強い」動詞（「作る」など、タイトルに入りやすい語は含めない）
const ADD_RE = /(追加|登録|作成|作って|つくって|入れて|いれて|入れとい|足して|加えて|記録|^メモ)/;
const SUFFIX_RE = new RegExp(`(?:を|も)?${ADD_VERB}${POLITE}$`);
const PREFIX_RE = new RegExp(`${ADD_VERB}${POLITE}[:：、,]?(.+)$`);
const GENERIC_TITLE = /^(新しい|あたらしい)?(タスク|やること|予定|todo|依頼|開発依頼)$/;
const TRAIL_PARTICLES = /(?:[、,]|を|に|へ)+$/;

function extractAddText(t, found) {
  // プロジェクト名と、その直後の「の/に/へ」「のタスクに」などを取り除く
  let s = removeFound(t, found).replace(/^(?:の?(?:タスク|やること|予定|todo)(?:リスト)?)?[にへで、,:：]*/, '');
  let out = s.replace(SUFFIX_RE, '');
  if (out === s) {
    const m = s.match(PREFIX_RE); // 「追加：レポートを書く」「メモ：牛乳を買う」形式
    out = m ? m[1] : s;
  }
  out = unquote(out)
    .replace(/^(新しい|あたらしい)?(タスク|やること)[:：を、,]*/, '')
    .replace(TRAIL_PARTICLES, '');
  if (out) out = out.replace(/(?:という|との|の)?(?:タスク|やること|todo)$/, '');
  out = unquote(out.replace(TRAIL_PARTICLES, ''));
  return GENERIC_TITLE.test(out) ? '' : out;
}

function extractRequestBody(t, found) {
  const s = removeFound(t, found);
  const i = s.search(/依頼/);
  const after = s.slice(i + 2).replace(new RegExp(`^(?:を|として)?${ADD_VERB}${POLITE}[:：、,]?`), '').replace(/^[をはで、,:：]+/, '');
  if (after && !/^(?:お願い|ください|して|する)/.test(after)) return unquote(after);
  // 「〇〇という開発依頼を登録」「〇〇を依頼」形式
  const before = s.slice(0, i).replace(/開発$/, '').replace(/^[にへで、,:：]+/, '').replace(/(という|との|の|を)$/, '');
  return unquote(before);
}

// 家計簿の分類名の言い方（音声認識では「・」が落ちる／言い換えられる）
const CATEGORY_ALIASES = [
  ['食費', ['食費', '食べ物', '食料品']], ['外食', ['外食']], ['日用品', ['日用品']], ['交通費', ['交通費', '交通']],
  ['医療・健康', ['医療', '健康', '医療費']], ['衣服・美容', ['衣服', '美容', '服']], ['趣味・娯楽', ['趣味', '娯楽']],
  ['教育・書籍', ['教育', '書籍', '本代']], ['雑費', ['雑費']], ['水道光熱・通信', ['光熱', '水道', '通信', '電気代']],
].filter(([c]) => CATEGORIES.includes(c));
const LEDGER_RE = /(家計簿|支出|出費|レシート|いくら使|使ったお金)/;
// 「レシートを追加」は読み取り。「レシート機能を作るタスクを追加」のように間に別の語があればタスク追加。
const SCAN_DIRECT = /レシート(?:を|の|から)?(?:読み取|読みとり|スキャン|撮|取り込|追加|登録|入力)/;
const SCAN_VERB = /(読み取|読みとり|スキャン|撮|取り込)/;

const SHOW_WORD = /(表示|見せ|一覧|教えて|確認|見たい|見て|開いて|知りたい|[?？]$|は$|ある$)/;
const NAV_WORD = /(移動|行って|行く|開く|開いて|画面|ページ|見に)/;
const TASKISH = /(タスク|やる|やら|やるべき|すること|やること|予定|課題|宿題|こと)/;

/**
 * @param {string} raw 認識結果または手入力
 * @param {{currentProjectId?: string|null, selectedTaskId?: string|null}} ctx
 * @returns {{intent: string, projectId?: string|null, view?: string, title?: string, body?: string, mutating: boolean, summary: string}}
 */
export function parseCommand(raw, ctx = {}) {
  const t = normalize(raw);
  const found = findProject(t);
  const projectId = found?.id ?? null;
  const pName = projectId ? getProject(projectId).name : null;
  const scope = pName ? `${pName}の` : '';
  const res = (intent, extra = {}) => ({ intent, mutating: false, projectId, summary: '', ...extra });

  if (!t) return res('empty', { summary: '指示が空です' });

  if (/(未完了に|未完了へ|完了を取り消|完了を解除|完了をキャンセル|やり直|元に戻|もう一度|もう1度|もういちど|再開|終わってない|終わっていない)/.test(t)) {
    return res('uncomplete_task', { mutating: true, summary: '選択中のタスクを未完了に戻す' });
  }

  const endsWithAdd = SUFFIX_RE.test(t);

  // 家計簿・レシート。「家計簿をつけるを追加」のようなタスク追加は、下のタスク追加に任せる。
  const catEntry = CATEGORY_ALIASES.find(([, names]) => names.some((n) => t.includes(n)));
  const spendQuery = /(食費|外食|日用品|交通費|医療費|光熱費|電気代|通信費)(?:は|を)?(?:いくら|どれくらい|教えて|表示|見せて)/.test(t);
  if (LEDGER_RE.test(t) || spendQuery) {
    if (SCAN_DIRECT.test(t) || (/レシート/.test(t) && SCAN_VERB.test(t))) return res('scan_receipt', { summary: 'レシートを読み取る' });
    if (!endsWithAdd) {
      const month = /(先月|前月)/.test(t) ? 'last' : 'this';
      const category = catEntry ? catEntry[0] : null;
      return res('show_ledger', { month, category, summary: `${month === 'last' ? '先月' : '今月'}の${category ? `${category}の` : ''}家計簿を表示` });
    }
  }
  const isRequest = /(開発依頼|依頼(?:を|として)?(?:追加|登録|作成|記録)|依頼(?:して|する|します|ください|お願い(?:します)?)?$|(?:claude|クロード|ai)(?:に|へ)依頼)/.test(t);
  if (isRequest && (endsWithAdd || !SHOW_WORD.test(t))) {
    const body = extractRequestBody(t, found);
    const target = projectId ?? ctx.currentProjectId ?? null;
    return res('add_request', {
      projectId: target, body, mutating: true,
      summary: `${target ? getProject(target).name : '（プロジェクト未指定）'}に開発依頼を記録${body ? `：「${body}」` : ''}`,
    });
  }

  // 「レポートを確認するを追加」のように文末が追加の動詞なら、途中の「確認」等の語で表示指示と誤判定しない
  if (ADD_RE.test(t) && (endsWithAdd || !SHOW_WORD.test(t))) {
    const title = extractAddText(t, found);
    const target = projectId ?? ctx.currentProjectId ?? null;
    return res('add_task', {
      projectId: target, title, mutating: true,
      summary: `${target ? getProject(target).name : '（プロジェクト未指定）'}にタスクを追加${title ? `：「${title}」` : ''}`,
    });
  }

  if (/(削除|消して|消す|消去)/.test(t) && !SHOW_WORD.test(t)) {
    return res('delete_task', { mutating: true, danger: true, summary: '選択中のタスクを削除する' });
  }

  if (SHOW_WORD.test(t) && /(完了|終わった|済み)/.test(t) && !/未完了/.test(t)) {
    return res('show_tasks', { view: 'done', summary: `${scope}完了したタスクを表示` });
  }

  if (/(完了|終わった|終わり|終了|済みに|できた|チェック|やった|やり終え)/.test(t) && !SHOW_WORD.test(t) && !/未完了/.test(t)) {
    return res('complete_task', { mutating: true, summary: '選択中のタスクを完了にする' });
  }

  if (/(期限切れ|期限がきれ|遅れ|過ぎ)/.test(t)) {
    return res('show_tasks', { view: 'overdue', summary: `${scope}期限切れのタスクを表示` });
  }
  if (/(優先度.{0,2}高|高優先|重要|大事|大切|急ぎ|至急|緊急|優先)/.test(t)) {
    return res('show_tasks', { view: 'high', summary: `${scope}優先度の高いタスクを表示` });
  }
  if (/(今日|きょう|本日)/.test(t) && TASKISH.test(t)) {
    return res('show_tasks', { view: 'today', summary: `${scope}今日やるタスクを表示` });
  }
  if (/(開発状況|状況|進捗|進み具合|どこまで|状態|ホーム|トップ)/.test(t)) {
    return res('show_status', { summary: pName ? `${pName}の状況を表示` : '全プロジェクトの状況を表示' });
  }
  if (projectId && (SHOW_WORD.test(t) || NAV_WORD.test(t) || /タスク/.test(t) || t === found.alias)) {
    return res('show_project', { summary: `${pName}のタスクを表示` });
  }
  if (/(すべて|全て|全部|全体|横断|未完了|やり残し|残って|残り|未着手|やること|やるべき)/.test(t) || (SHOW_WORD.test(t) && /タスク/.test(t))) {
    return res('show_tasks', { view: 'open', summary: '全プロジェクトの未完了タスクを表示' });
  }
  return res('unknown', { summary: '指示を解釈できませんでした' });
}
