// 端末内OCR（Tesseract.js を public/vendor に同梱。画像は外部へ送信しない）。ブラウザ専用。
import { adaptiveThreshold, findPaperBox, stretchContrast } from './imagefx.js';
import { parseReceiptText, scoreParse } from './receipt.js';

const VENDOR = () => new URL('vendor/tesseract/', document.baseURI).href;

// ---- 設定（この端末のブラウザに保存。画像や認識結果は保存しない）----
export const OCR_MODES = {
  auto: { label: '自動', note: '複数の読み方を試して、合計が一致した結果を採用します（おすすめ・時間がかかります）' },
  plain: { label: '標準', note: '1回だけ読みます（速い）。きれいに撮れたレシート向きです' },
  sharp: { label: 'くっきり', note: '文字をくっきりさせて1回読みます。影や暗い背景、かすれに強い設定です' },
};
const SETTINGS_KEY = 'acp-ocr-settings';
export const DEFAULT_OCR_SETTINGS = { mode: 'auto', crop: true };

export function loadOcrSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { mode: Object.keys(OCR_MODES).includes(raw.mode) ? raw.mode : DEFAULT_OCR_SETTINGS.mode, crop: raw.crop !== false };
  } catch { return { ...DEFAULT_OCR_SETTINGS }; }
}
export function saveOcrSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode: settings.mode, crop: !!settings.crop })); } catch { /* 保存できなくても動作は続ける */ }
}

// ---- 読み方の組み合わせ ----
const VARIANTS = {
  sharp: { name: 'くっきり', binarize: true, psm: '6' },
  plain: { name: '標準', binarize: false, psm: '6' },
  column: { name: '縦一列', binarize: false, psm: '4' },
  sharpColumn: { name: 'くっきり縦一列', binarize: true, psm: '4' },
  raw: { name: '従来', binarize: false, psm: '3', rawImage: true },
};
export function variantsFor(settings) {
  const crop = settings.crop !== false;
  const pick = (names) => names.map((n) => ({ ...VARIANTS[n], crop: VARIANTS[n].rawImage ? false : crop }));
  if (settings.mode === 'sharp') return pick(['sharp']);
  if (settings.mode === 'plain') return pick(['plain']);
  return pick(['sharp', 'plain', 'column', 'sharpColumn', 'raw']);
}

// ---- 部品の読み込み ----
let scriptPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = `${VENDOR()}tesseract.min.js`;
      el.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract が見つかりません')));
      el.onerror = () => { scriptPromise = null; reject(new Error('文字認識の部品を読み込めませんでした（オフライン、または初回の読み込みに失敗）')); };
      document.head.append(el);
    });
  }
  return scriptPromise;
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 下のImage経由にフォールバック */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を開けませんでした'));
      img.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

const toGray = (img) => {
  const d = img.data, g = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return g;
};
const grayToCanvas = (gray, w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < gray.length; i++) { const v = gray[i]; out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v; out.data[i * 4 + 3] = 255; }
  ctx.putImageData(out, 0, 0);
  return c;
};

/** 写真を読み取りやすい画像にする。大きすぎれば縮小、紙を切り出し、文字が小さければ拡大、コントラスト補正、必要なら二値化 */
export async function prepareImage(file, { crop = true, binarize = false, rawImage = false } = {}) {
  const src = await decode(file);
  const w0 = src.width, h0 = src.height;
  const long0 = Math.max(w0, h0);
  const s0 = long0 > 2400 ? 2400 / long0 : 1;
  const base = document.createElement('canvas');
  base.width = Math.round(w0 * s0); base.height = Math.round(h0 * s0);
  const bctx = base.getContext('2d', { willReadFrequently: true });
  bctx.drawImage(src, 0, 0, base.width, base.height);
  src.close?.();
  if (rawImage) { // 従来の処理（切り出しなし・拡大のみ）
    const g = stretchContrast(toGray(bctx.getImageData(0, 0, base.width, base.height)));
    return grayToCanvas(g, base.width, base.height);
  }
  let region = { x: 0, y: 0, w: base.width, h: base.height };
  if (crop) {
    const gray = toGray(bctx.getImageData(0, 0, base.width, base.height));
    region = findPaperBox(gray, base.width, base.height) || region;
  }
  // 文字の大きさをそろえる: 紙の幅が約1500pxになるよう拡大縮小（上限は2倍）
  const k = Math.min(2, Math.max(0.5, 1500 / region.w));
  const out = document.createElement('canvas');
  out.width = Math.round(region.w * k); out.height = Math.round(region.h * k);
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(base, region.x, region.y, region.w, region.h, 0, 0, out.width, out.height);
  let gray = stretchContrast(toGray(octx.getImageData(0, 0, out.width, out.height)));
  if (binarize) gray = adaptiveThreshold(gray, out.width, out.height);
  return grayToCanvas(gray, out.width, out.height);
}

const STATUS_JA = {
  'loading tesseract core': '文字認識エンジンを読み込み中…',
  'initializing tesseract': '準備中…',
  'loading language traineddata': '日本語データを読み込み中（初回のみ時間がかかります）…',
  'initializing api': '準備中…',
  'recognizing text': '文字を読み取り中…',
};

/**
 * 画像ファイルから文字列を読み取る。設定に従って1〜5通りの読み方を試し、いちばん良い結果を返す。
 * onProgress(メッセージ, 0〜1)
 * @returns {{text:string, confidence:number|null, method:string, tried:{name:string,score:number}[]}}
 */
export async function recognizeImage(file, onProgress = () => {}, settings = loadOcrSettings()) {
  onProgress('画像を準備中…', 0);
  const variants = variantsFor(settings);
  onProgress('文字認識エンジンを読み込み中…', 0);
  const T = await loadTesseract();
  const base = VENDOR();
  let stage = '';
  const worker = await T.createWorker('jpn', 1, {
    workerPath: `${base}worker.min.js`, corePath: `${base}core`, langPath: `${base}lang`, gzip: false, workerBlobURL: false,
    logger: (m) => onProgress(`${stage}${STATUS_JA[m.status] || '処理中…'}`, m.progress || 0),
  });
  const tried = [];
  let best = null;
  try {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      stage = variants.length > 1 ? `（${i + 1}/${variants.length}・${v.name}）` : '';
      const canvas = await prepareImage(file, v);
      await worker.setParameters({ tessedit_pageseg_mode: v.psm, preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(canvas);
      const score = scoreParse(parseReceiptText(data.text || ''));
      tried.push({ name: v.name, score });
      if (!best || score > best.score) best = { score, text: data.text || '', confidence: data.confidence ?? null, method: v.name };
      if (score >= 100) break; // 明細の合計がレシートの合計と一致したので十分
    }
  } finally {
    await worker.terminate().catch(() => {}); // iPadのメモリを空ける
  }
  return { text: best.text, confidence: best.confidence, method: best.method, tried };
}
