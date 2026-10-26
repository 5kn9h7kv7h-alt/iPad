// レシート解析・分類・家計簿の集計（純粋ロジック。DOM・保存に依存しない）。単体テスト対象。
import { addDays, isValidDate, newId, todayStr } from './model.js';

export const CATEGORIES = ['食費', '外食', '日用品', '交通費', '医療・健康', '衣服・美容', '趣味・娯楽', '教育・書籍', '水道光熱・通信', '雑費', 'その他'];
export const CATEGORY_COLORS = {
  '食費': '#3dffb0', '外食': '#ffb454', '日用品': '#2de2ff', '交通費': '#7aa7ff', '医療・健康': '#ff6b88',
  '衣服・美容': '#e08bff', '趣味・娯楽': '#ffe14d', '教育・書籍': '#5ff0d4', '水道光熱・通信': '#b4e04d', '雑費': '#ff9f6b', 'その他': '#93a7bd',
};

// ---- 正規化 ----
const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function foldKana(s) { return kataToHira(String(s ?? '').normalize('NFKC').toLowerCase()); }
export function normalizeName(s) {
  return foldKana(s).replace(/[\s　・･*※★\-_/()（）[\]【】「」"'.,、。:：;]/g, '');
}

// ---- 分類 ----
// 品名に含まれる語から分類する。複数ヒットしたら最も長い語を優先（「パンツ」が「パン」に負けない）。
const KEYWORDS = {
  '食費': ['牛乳', '豆乳', '卵', 'たまご', '玉子', 'パン', '食パン', '米', 'お米', 'ご飯', 'ごはん', 'おにぎり', '弁当', '惣菜', 'サラダ', '野菜', 'トマト', 'きゅうり', 'にんじん', '人参', '玉ねぎ', 'たまねぎ',
    'じゃがいも', 'キャベツ', 'レタス', 'ほうれん草', 'ねぎ', '大根', '白菜', 'ピーマン', 'なす', 'もやし', 'きのこ', 'しいたけ', '果物', 'りんご', 'バナナ', 'みかん', 'いちご', 'ぶどう', 'レモン', 'おくら',
    '肉', '豚', '牛肉', '鶏', 'ひき肉', 'ハム', 'ソーセージ', 'ベーコン', '魚', '鮭', 'さば', '刺身', 'えび', 'いか', 'あじ', '豆腐', '納豆', '味噌', 'みそ', '醤油', 'しょうゆ', '砂糖', '塩', '油', 'マヨネーズ',
    'ケチャップ', 'ソース', 'カレー', 'パスタ', 'そば', 'うどん', '麺', 'ヨーグルト', 'チーズ', 'バター', 'ジュース', 'お茶', '茶', 'コーヒー', '珈琲', '紅茶', 'ビール', '酒', 'ワイン', 'チューハイ',
    'ミネラルウォーター', '天然水', '炭酸', '菓子', 'チョコ', 'スナック', 'アイス', 'ケーキ', 'ガム', 'ポテト', '冷凍', 'ふりかけ', 'のり', '海苔', 'ツナ', '缶詰', 'プリン', 'ゼリー',
    'いも', '芋', 'かぼちゃ', 'ごぼう', 'れんこん', 'ブロッコリー', 'アスパラ', 'ゴーヤ', 'とうもろこし', '枝豆', 'にら', '小松菜', 'ほうれんそう', 'チンゲン菜', '水菜', 'セロリ', 'パプリカ', 'ズッキーニ', 'しょうが', '生姜', 'にんにく',
    'ささみ', '手羽', 'ステーキ', 'ホルモン', '餃子', 'ぎょうざ', 'シュウマイ', 'コロッケ', 'から揚げ', '唐揚', '天ぷら', 'こんにゃく', '油揚げ', '厚揚げ', 'かまぼこ', 'ちくわ', 'はんぺん', 'しらす', 'ほたて', 'あさり', 'わかめ', '昆布', 'だし',
    'シチュー', 'スープ', '小麦粉', '片栗粉', 'パン粉', 'みりん', 'コンソメ', 'ドレッシング', 'ジャム', 'はちみつ', 'ごま', 'おかし', 'せんべい', 'クッキー', 'ビスケット', 'キャンディ', 'グミ', 'ヨーグルト'],
  '外食': ['ランチ', 'ディナー', '定食', 'ドリンク', 'ハンバーガー', 'バーガー', 'ピザ', '寿司', '丼', 'ラテ', 'モーニング', 'お通し', '飲み放題', 'コース', 'フライドポテト', 'ラーメン店'],
  '日用品': ['ティッシュ', 'トイレット', 'ペーパー', '洗剤', '洗濯', '柔軟剤', 'シャンプー', 'リンス', 'コンディショナー', 'ボディソープ', '石鹸', 'せっけん', '歯ブラシ', '歯磨き', '歯みがき', 'スポンジ',
    'ラップ', 'アルミホイル', 'ごみ袋', 'ゴミ袋', 'ポリ袋', 'レジ袋', '袋', '電池', '電球', 'マスク', 'ハンドソープ', '除菌', '消臭', '芳香', 'ハンガー', 'タオル', '掃除', 'キッチン', '綿棒', 'ナプキン', 'おむつ',
    'ベビー', 'ペットフード', 'ペット', '油性', 'ライター', 'ゴム手袋', '洗い'],
  '衣服・美容': ['シャツ', 'パンツ', 'ズボン', 'スカート', '靴下', '下着', 'コート', 'ジャケット', '靴', 'シューズ', 'バッグ', '帽子', '手袋', 'マフラー', '化粧', 'ファンデ', '口紅', 'リップ', '乳液', '化粧水', '美容',
    'ヘア', 'カット', 'パーマ', '香水', 'パンスト', 'ストッキング'],
  '医療・健康': ['薬', '錠', 'ビタミン', 'サプリ', '絆創膏', 'ばんそうこう', '包帯', '湿布', '目薬', '体温計', '風邪', '病院', '診察', '診療', '処方', '歯科', '消毒', '頭痛', '胃腸'],
  '交通費': ['電車', 'jr', '地下鉄', 'バス', 'タクシー', '切符', '乗車', '運賃', '交通', 'suica', 'icoca', 'pasmo', 'チャージ', 'ガソリン', '高速', '駐車', 'パーキング'],
  '趣味・娯楽': ['映画', 'チケット', 'ゲーム', '漫画', 'まんが', '雑誌', 'カラオケ', 'ライブ', '入場', 'おもちゃ', '玩具', 'cd', 'dvd', 'ブルーレイ', 'ガチャ', '釣り', 'ゴルフ', 'カードゲーム'],
  '教育・書籍': ['書籍', '単行本', '文庫', '新書', '参考書', '問題集', '教科書', 'ノート', '辞書', '受講', '授業料', '学費', 'コピー', '印刷', 'ペン', '鉛筆', 'シャーペン', '消しゴム', 'ファイル', 'レポート用紙'],
  // めったに買い換えない物（調理器具・収納・家具小物・家電小物など）
  '雑費': ['フライパン', '鍋', 'やかん', 'ケトル', 'ごみ箱', 'ゴミ箱', 'ダストボックス', '包丁', 'まな板', 'ボウル', 'ざる', '食器', 'お皿', '皿', 'コップ', 'マグカップ', 'グラス', '箸', 'カトラリー',
    '収納', 'ボックス', 'ケース', 'カーテン', '時計', '傘', '掃除機', 'アイロン', '延長コード', 'ハサミ', 'はさみ', 'カッター', '工具', 'ドライバー', '物干し', '洗濯ばさみ', 'ピンチ', 'バケツ', 'ほうき', 'ちりとり', '布団', 'シーツ', '枕'],
  '水道光熱・通信': ['電気', 'ガス代', '水道', '通信', '携帯', 'スマホ', 'インターネット', 'wi-fi', 'wifi', '料金', '電話代', 'nhk', '受信料'],
};
const KEYWORD_LIST = Object.entries(KEYWORDS).flatMap(([category, kws]) => kws.map((kw) => ({ kw: normalizeName(kw), category })));

// 店名から分類を補正する。override は店の種類が決まる業態（外食・交通）、fallback は品名で分からない時のみ。
const STORE_OVERRIDE = [
  [/(カフェ|珈琲|コーヒー店|喫茶|ラーメン|食堂|レストラン|居酒屋|マクドナルド|モスバーガー|吉野家|すき家|松屋|スターバックス|スタバ|ドトール|サイゼリヤ|ガスト|焼肉|寿司|すし|バーガー|ファミレス|うどん店|そば店)/i, '外食'],
  [/(JR|電鉄|鉄道|タクシー|ガソリンスタンド|ENEOS|エネオス|出光)/i, '交通費'],
];
const STORE_FALLBACK = [
  [/(薬局|ドラッグ|クリニック|病院|歯科|医院)/, '医療・健康'],
  [/(書店|ブックス|文具)/, '教育・書籍'],
  [/(ホームセンター|100円|ダイソー|セリア|ドラッグ|ニトリ)/, '日用品'],
  [/(スーパー|マート|ストア|市場|青果|精肉|鮮魚|パン屋|ベーカリー|コンビニ|ファミリーマート|ローソン|セブン)/, '食費'],
];

export function categorize(name, { rules = [], store = '' } = {}) {
  const key = normalizeName(name);
  const learned = rules.find((r) => r.id === key);
  if (learned && CATEGORIES.includes(learned.category)) return learned.category;
  for (const [re, cat] of STORE_OVERRIDE) if (re.test(store)) return cat;
  let best = null;
  for (const { kw, category } of KEYWORD_LIST) {
    if (kw && key.includes(kw) && (!best || kw.length > best.kw.length)) best = { kw, category };
  }
  if (best) return best.category;
  for (const [re, cat] of STORE_FALLBACK) if (re.test(store)) return cat;
  return 'その他';
}

export function makeRule(name, category, now = new Date()) {
  return { id: normalizeName(name), name: String(name).trim().slice(0, 100), category, updatedAt: now.toISOString() };
}

// ---- 金額 ----
export function parseYen(raw) {
  let s = String(raw ?? '').normalize('NFKC').replace(/[¥\\\s円]/g, '');
  // OCRは 1→l/I、0→O/o と読むことがある。ただし本物の数字が2つ以上ある時だけ直す（"ll" のような語を数字にしない）
  if (/[OolI]/.test(s)) { if ((s.match(/\d/g) || []).length < 2) return NaN; s = s.replace(/[lI]/g, '1').replace(/[Oo]/g, '0'); }
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, '')); // OCRは「,」を「.」と読むことがある
  if (/^-?\d+$/.test(s)) return Number(s);
  return NaN;
}

// ---- テキスト解析 ----
// 金額の前の記号は ¥ のほか、OCRが誤読した \ Y y W w V * も許す。行末の1〜2文字のゴミ（紙の縁の誤読）も許す
const AMT = String.raw`-?[\dlI][\dOolI]{0,2}(?:[.,。][\dOolI]{3})+|-?[\dlI][\dOolI]*`;
const ITEM_LINE = new RegExp(String.raw`^(.*?)(\s*(?:[¥\\YyWwV*]\s*)?)(${AMT})\s*円?\s*[※*★軽]?(?:\s+[^\s\d]{1,2})?\s*$`);
const GAP_RE = /[\s¥\\YyWwV*]/;
const SKIP_LINE = /(小計|合計|総合計|お買上|お買い上|税込|税抜|消費税|内税|外税|対象|お預|お釣|おつり|釣銭|釣り|現金|クレジット|カード|ポイント|点数|電話|tel|レジ(?!袋)|担当|no\.|領収|お支払|支払|割引券|会員|残高|ご利用|様|\d{1,2}:\d{2}|\d{4}[/\-.年]\d{1,2}|〒|http)/i;
const DISCOUNT = /(値引|割引|ディスカウント|クーポン)/;
const TOTAL_LINE = /(合計|総合計|お買上|お買い上げ|請求|total)/i;
const TOTAL_EXCLUDE = /(小計|点数|税|内|預|釣)/;
const MAX_YEN = 10_000_000;

// OCRが数字を似た文字に読み違えるもの（Z→2、d→9 など）。行末の金額らしい塊だけ直す
const CONFUSABLE = { Z: '2', z: '2', S: '5', s: '5', B: '8', b: '6', G: '6', g: '9', q: '9', d: '9', A: '4', T: '7' };
function fixAmountTail(l) {
  return l.replace(/(\S+)$/, (tok) => {
    const m = tok.match(/^([¥\\YyWwV*]*)(.*)$/);
    const body = m[2];
    if (!/\d/.test(body) || body.length > 9 || !/^[\dZzSsBbGgqdATlIOo.,\-]+$/.test(body) || !/[ZzSsBbGgqdAT]/.test(body)) return tok;
    return m[1] + body.replace(/[ZzSsBbGgqdAT]/g, (c) => CONFUSABLE[c]);
  });
}

const joinCjkSpaces = (s) => s.replace(/(?<=[぀-ヿ一-鿿])[ 　]+(?=[぀-ヿ一-鿿])/g, '');

let guessedYear = false;
function parseDate(text, now) {
  guessedYear = false;
  const today = todayStr(now);
  const earliest = addDays(today, -366);
  const latest = addDays(today, 1);
  const pad = (n) => String(n).padStart(2, '0');
  const ok = (y, m, d) => { const s = `${y}-${pad(m)}-${pad(d)}`; return isValidDate(s) && s >= earliest && s <= latest ? s : null; };
  let m;
  if ((m = text.match(/(20\d{2})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})/))) { const r = ok(m[1], +m[2], +m[3]); if (r) return r; }
  if ((m = text.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)) || (m = text.match(/\bR\s*(\d{1,2})[./年](\d{1,2})[./月](\d{1,2})/))) { const r = ok(2018 + +m[1], +m[2], +m[3]); if (r) return r; }
  if ((m = text.match(/(?<![\d-])(\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})(?![\d-])/))) { const r = ok(2000 + +m[1], +m[2], +m[3]); if (r) return r; }
  // 年が欠けた・誤読された場合（例「926年10朋26日」）: 月と日から補う。今年とし、未来の日付になるなら去年とする
  if ((m = text.match(/(\d{1,2})\s*[月朋用]\s*(\d{1,2})\s*日/)) || (m = text.match(/\d*年\s*(\d{1,2})\D{1,2}(\d{1,2})\s*日/))) {
    const y = now.getFullYear();
    const r = ok(y, +m[1], +m[2]) || ok(y - 1, +m[1], +m[2]);
    if (r) { guessedYear = true; return r; }
  }
  return null;
}

function parseStore(lines) {
  for (const line of lines.slice(0, 8)) {
    const l = line.trim();
    if (l.length < 2 || /(tel|電話|〒|http|領収|レシート|\d{4}\s*年|\d+[:：]\d+|^[\d\s\-－ー=*＊]+$)/i.test(l)) continue;
    if (!/[぀-ヿ一-鿿A-Za-z]/.test(l)) continue;
    const m = l.match(ITEM_LINE);
    if (m && m[3] && !SKIP_LINE.test(l) && Number.isFinite(parseYen(m[3])) && GAP_RE.test(m[2])) continue; // 金額つきの行は店名ではない
    return joinCjkSpaces(l).slice(0, 40);
  }
  return '';
}

/**
 * OCR結果などのテキストから、日付・店名・明細・合計を取り出す。
 * 完全には読めない前提で、warnings に注意点を入れて返す（UIで必ず確認・修正する）。
 */
export function parseReceiptText(rawText, { now = new Date(), rules = [] } = {}) {
  const text = String(rawText ?? '').normalize('NFKC');
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, '')).filter((l) => l.trim());
  const warnings = [];

  const date = parseDate(text, now);
  if (!date) warnings.push('日付を読み取れませんでした。今日の日付を入れています。確認してください。');
  else if (guessedYear) warnings.push('年を読み取れなかったため、月と日から日付を補いました。確認してください。');
  const store = parseStore(lines);

  const items = [];
  let total = null;
  const totals = [];
  let subtotal = null, outerTax = 0, running = 0, closed = false;
  const pending = []; // 品名らしいのに金額を読めなかった行（小計との差額で推定する候補）
  let seenDate = false;
  for (const line of lines) {
    const l = fixAmountTail(line.trim());
    if (/\d{1,2}\s*[月朋用]\s*\d{1,2}\s*日|\d{4}[/\-.年]\d{1,2}/.test(l)) seenDate = true;
    if (TOTAL_LINE.test(l) && !TOTAL_EXCLUDE.test(l)) {
      const m = l.match(ITEM_LINE);
      const v = m ? parseYen(m[3]) : NaN;
      if (Number.isFinite(v) && v > 0 && v <= MAX_YEN) { totals.push(v); closed = true; } // 合計より後ろは明細ではない
      continue;
    }
    if (/小計/.test(l)) {
      const m = l.match(ITEM_LINE);
      const v = m ? parseYen(m[3]) : NaN;
      // 小計が「ここまでの明細の合計」と一致したら、明細はここまで（後ろは税・支払いの行）
      if (Number.isFinite(v) && v > 0 && v !== running && pending.length === 1 && v > running && v - running <= MAX_YEN) {
        // 金額を読めなかった行がちょうど1行なら、小計との差額をその行の金額と推定する（必ず警告して確認してもらう）
        const p = pending[0];
        const gap = v - running;
        items.splice(p.at, 0, { name: p.name, amount: gap, category: 'その他', _discount: false });
        running = v;
        warnings.push(`「${p.name}」の金額を読み取れなかったため、小計との差額 ¥${gap.toLocaleString('ja-JP')} と推定しました。確認してください。`);
      }
      if (Number.isFinite(v) && v > 0 && v === running) { subtotal = v; closed = true; }
      continue;
    }
    if (/外税/.test(l)) { // 外税額の行。末尾の金額を集める（税率の「8」「10%」は金額として読まない）
      const m = l.match(ITEM_LINE);
      const v = m ? parseYen(m[3]) : NaN;
      if (Number.isFinite(v) && v > 0 && v < MAX_YEN) outerTax += v;
      continue;
    }
    if (closed) continue;
    if (!DISCOUNT.test(l) && SKIP_LINE.test(l)) continue;
    const m = l.match(ITEM_LINE);
    if (!m || !Number.isFinite(parseYen(m[3]))) {
      // 金額の欠けた品名らしい行を候補に覚えておく（日付より後・日本語2文字以上・数字始まりでない）
      const cand = joinCjkSpaces(l).replace(/^[外内]\s?\d{1,2}\s+/, '').replace(/\s+[A-Z]{1,2}$/, '').replace(/^[・*※★\s]+|[・*※★\s]+$/g, '');
      if (seenDate && !/^\d/.test(cand) && (cand.match(/[぀-ヿ一-鿿]/g) || []).length >= 2 && cand.length <= 40) pending.push({ name: cand, at: items.length });
      continue;
    }
    let name = joinCjkSpaces(m[1].trim())
      .replace(/^[外内]\s?\d{1,2}\s+/, '') // 税区分の記号（外8 / 内10）
      .replace(/^\d{6,}\s*/, '').replace(/\s+[A-Z]$/, '') // 商品コード・行末の区分記号（J など）
      .replace(/^[・*※★]+|[・*※★\s]+$/g, '');
    if (/[¥\\]\s*\d/.test(name) || /^\d{4,}/.test(name) || /[ー－―=＝_-]{3,}/.test(name)) continue; // 金額が文字化けした行・レジ番号・区切り線
    const sepHasGap = GAP_RE.test(m[2]);
    if (!sepHasGap && /[\d\-/:.,]$/.test(name)) continue; // 住所・電話番号・日付の端数を明細にしない
    if (!name || !/[぀-ヿ一-鿿A-Za-z]/.test(name) || name.length > 100) continue;
    let amount = parseYen(m[3]);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_YEN) continue;
    const isDiscount = DISCOUNT.test(name);
    if (isDiscount) amount = -Math.abs(amount); // OCRがマイナスを落としても割引は負にする
    items.push({ name, amount, category: 'その他', _discount: isDiscount });
    running += amount;
  }
  if (totals.length) total = Math.max(...totals);

  let prev = null;
  for (const it of items) {
    it.category = it._discount && prev ? prev : categorize(it.name, { rules, store });
    if (!it._discount) prev = it.category;
    delete it._discount;
  }

  // 外税のレシート: 明細の合計=小計 で、合計との差（または外税額）が税として妥当なら、消費税の行を足して支払額に合わせる
  let sum = items.reduce((a, i) => a + i.amount, 0);
  if (items.length && subtotal !== null && sum === subtotal) {
    const tax = total !== null && total > subtotal ? total - subtotal : outerTax;
    if (tax > 0 && tax <= Math.ceil(subtotal * 0.12)) {
      const byCat = new Map();
      for (const it of items) if (it.amount > 0) byCat.set(it.category, (byCat.get(it.category) || 0) + it.amount);
      const dominant = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'その他';
      items.push({ name: '消費税（外税）', amount: tax, category: dominant });
      sum += tax;
      if (total === null) { total = sum; warnings.push('合計の行を読み取れなかったため、小計と外税額から合計を計算しました。確認してください。'); }
    }
  }

  if (!items.length) warnings.push('明細を読み取れませんでした。手入力で追加してください。');
  if (total !== null && items.length && sum !== total) warnings.push(`明細の合計（¥${sum.toLocaleString('ja-JP')}）がレシートの合計（¥${total.toLocaleString('ja-JP')}）と一致しません。読み間違いや抜けがないか確認してください。`);
  if (total === null && items.length) warnings.push('合計の行を読み取れませんでした。明細の合計を使います。');

  return {
    date: date || todayStr(now), dateFound: !!date, store, items, total: total ?? sum, warnings,
    totalFound: total !== null, sumMatches: items.length > 0 && ((total !== null && sum === total) || (total === null && subtotal !== null && sum === subtotal)),
  };
}

// ---- レシート（家計簿の1件）----
const STORE_MAX = 60;
const RAW_MAX = 5000;

function validateReceiptFields(f) {
  const errors = {};
  if (!isValidDate(f.date)) errors.date = '日付が正しくありません';
  const store = typeof f.store === 'string' ? f.store.trim() : '';
  if (store.length > STORE_MAX) errors.store = `店名は${STORE_MAX}文字以内にしてください`;
  const items = [];
  if (!Array.isArray(f.items) || !f.items.length) errors.items = '品目を1つ以上入力してください';
  else {
    f.items.forEach((it, i) => {
      const name = typeof it?.name === 'string' ? it.name.trim() : '';
      const amount = Number(it?.amount);
      if (!name || name.length > 100) errors[`item-${i}-name`] = '品名を入力してください（100文字以内）';
      else if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_YEN) errors[`item-${i}-amount`] = '金額は0以外の整数で入力してください';
      else if (!CATEGORIES.includes(it.category)) errors[`item-${i}-category`] = '分類が正しくありません';
      else items.push({ name, amount, category: it.category });
    });
    if (f.items.length > 200) errors.items = '品目が多すぎます（200件まで）';
  }
  const rawText = typeof f.rawText === 'string' ? f.rawText.slice(0, RAW_MAX) : '';
  return { errors, value: { date: f.date, store, items, total: items.reduce((a, i) => a + i.amount, 0), rawText, source: ['ocr', 'claude'].includes(f.source) ? f.source : 'manual' } };
}

export function createReceipt(input, now = new Date(), id = newId('rcp-')) {
  const { errors, value } = validateReceiptFields(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const iso = now.toISOString();
  return { ok: true, receipt: { id, ...value, createdAt: iso, updatedAt: iso } };
}

export function updateReceipt(receipt, patch, now = new Date()) {
  const { errors, value } = validateReceiptFields({ ...receipt, ...patch });
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, receipt: { ...receipt, ...value, updatedAt: now.toISOString() } };
}

/** バックアップ読み込み用：不正なら null（例外を投げない） */
export function sanitizeReceipt(raw, nowIso) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const r = createReceipt(raw, new Date(nowIso), raw.id);
  if (!r.ok) return null;
  const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : nowIso);
  return { ...r.receipt, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt) };
}

export function sanitizeRule(raw, nowIso) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || !CATEGORIES.includes(raw.category)) return null;
  return { id: raw.id, name: String(raw.name ?? raw.id).slice(0, 100), category: raw.category, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso };
}

// ---- 集計 ----
export const monthOf = (dateStr) => dateStr.slice(0, 7);
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const isValidMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const monthLabel = (month) => `${month.slice(0, 4)}年${Number(month.slice(5))}月`;

export function receiptsInMonth(receipts, month) {
  return receipts.filter((r) => monthOf(r.date) === month).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export function monthSummary(receipts, month) {
  const list = receiptsInMonth(receipts, month);
  const byCat = new Map();
  let total = 0;
  for (const r of list) for (const it of r.items) { byCat.set(it.category, (byCat.get(it.category) || 0) + it.amount); total += it.amount; }
  const categories = [...byCat.entries()].map(([category, amount]) => ({ category, amount, percent: total > 0 ? Math.round((amount / total) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
  return { month, total, count: list.length, categories };
}

/** カテゴリで絞った時の、そのレシート内の該当金額 */
export const amountInCategory = (receipt, category) => receipt.items.filter((i) => !category || i.category === category).reduce((a, i) => a + i.amount, 0);

// ---- CSV（Excel互換。式として解釈される先頭文字は無効化）----
const csvCell = (v) => {
  let s = String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(receipts) {
  const rows = [['日付', '店名', '品名', '金額', '分類']];
  for (const r of [...receipts].sort((a, b) => (a.date < b.date ? -1 : 1))) for (const it of r.items) rows.push([r.date, r.store, it.name, it.amount, it.category]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** レシートの内容から決まるID（同じ内容を2回取り込んでも重複しない）。FNV-1a */
export function contentId(r) {
  const text = JSON.stringify([r.date, String(r.store || '').trim(), (r.items || []).map((i) => [String(i.name).trim(), i.amount, i.category])]);
  let h = 0x811c9dc5;
  for (const ch of text) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `rcp-${h.toString(16).padStart(8, '0')}`;
}

/** 文字として読めた明細か。品名の半分以上が日本語（OCRの英字ゴミを除く）で、金額が5円以上 */
export function isPlausibleItem(it) {
  const letters = String(it.name).replace(/[\s\d.,()（）\-%¥*]/g, '');
  const cjk = (letters.match(/[぀-ヿ一-鿿]/g) || []).length;
  return cjk >= 1 && cjk / letters.length >= 0.5 && Math.abs(it.amount) >= 5;
}

/** 読み取り結果の良さ（大きいほど良い）。文字として読めた明細だけを数え、合計が一致すれば大きく加点する */

export function scoreParse(p) {
  const n = p.items.filter(isPlausibleItem).length;
  if (!n) return 0;
  return n + (p.sumMatches ? 100 : 0) + (p.dateFound ? 2 : 0) + (p.store ? 1 : 0);
}

/**
 * 画面に結果を出してよいか。ゴミの出力に、偶然それらしい行が1つ混ざっても通さないよう、
 * 「読めた明細が半分以上」に加えて、根拠が2つ以上あることを求める。
 * 根拠 = 日付が読めた / 合計が読めた / 明細の合計が一致した / 読めた明細が3行以上（これは2つ分）
 */
export function isReadable(p) {
  const n = p.items.filter(isPlausibleItem).length;
  if (n < 1 || n < p.items.length * 0.5) return false;
  const evidence = (p.dateFound ? 1 : 0) + (p.totalFound ? 1 : 0) + (p.sumMatches ? 1 : 0) + (n >= 3 ? 2 : 0);
  return evidence >= 2;
}
