// 端末内OCR（Tesseract.js を public/vendor に同梱。画像は外部へ送信しない）。ブラウザ専用。
import { adaptiveThreshold, findPaperBox, stretchContrast } from './imagefx.js';
import { parseReceiptText, scoreParse } from './receipt.js';

const VENDOR = () => new URL('vendor/tesseract/', document.baseURI).href;

// ---- 設定（この端末のブラウザに保存。画像や認識結果は保存しない）----
export const OCR_MODES = {
  auto: { label: '自動', note: '複数の読み方を試し、合計が一致した結果を採用します。写真の向きが違う時は、向きも自動で試します（おすすめ・時間がかかります）' },
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

// 向きが合っている写真は確信度が高い（実測: 合っている=65前後、違う=30未満）。45以上なら、向きを変える試行は省く
const ROTATE_SKIP_CONFIDENCE = 45;

// ---- 読み方の組み合わせ ----
const VARIANTS = {
  sharp: { name: 'くっきり', binarize: true, psm: '6' },
  sharp90: { name: 'くっきり・右へ90°', binarize: true, psm: '6', rotate: 90 },
  sharp270: { name: 'くっきり・左へ90°', binarize: true, psm: '6', rotate: 270 },
  sharp180: { name: 'くっきり・180°', binarize: true, psm: '6', rotate: 180 },
  plain: { name: '標準', binarize: false, psm: '6' },
  column: { name: '縦一列', binarize: false, psm: '4' },
  sharpColumn: { name: 'くっきり縦一列', binarize: true, psm: '4' },
  raw: { name: '従来', binarize: false, psm: '3', rawImage: true },
};
export function variantsFor(settings) {
  const crop = settings.crop !== false;
  const pick = (names) => names.map((n) => ({ ...VARIANTS[n], crop: VARIANTS[n].rawImage ? false : crop }));
  if (settings.rotate) { // 画面の「向きを変えて読み直す」: 指定の向きだけで読む
    return pick(['sharp', 'plain']).map((v) => ({ ...v, rotate: settings.rotate, name: `${v.name}・${settings.rotate === 90 ? '右へ90°' : settings.rotate === 270 ? '左へ90°' : '180°'}` }));
  }
  if (settings.mode === 'sharp') return pick(['sharp']);
  if (settings.mode === 'plain') return pick(['plain']);
  // 向きの試行（90→270→180）は、最初の結果の確信度が低い時だけ行う（下のループで判定）。右90°が最も多い（EXIFを反映しない場合）
  return pick(['sharp', 'sharp90', 'sharp270', 'sharp180', 'plain', 'column', 'sharpColumn', 'raw']);
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

// 写真を開く。<img> は EXIF の向き（iPadの写真は横向きのピクセル＋向きの印）を反映するので先に試す。
// createImageBitmap は Safari で向きを反映しない版があるため、フォールバックにする。
async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 0) return { source: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch { /* 下へ */ }
  URL.revokeObjectURL(url);
  if (typeof createImageBitmap === 'function') {
    try { const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { source: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close?.() }; } catch { /* 下へ */ }
  }
  throw new Error('画像を開けませんでした');
}

function rotateCanvas(c, deg) {
  const r = ((deg % 360) + 360) % 360;
  if (!r) return c;
  const swap = r === 90 || r === 270;
  const o = document.createElement('canvas');
  o.width = swap ? c.height : c.width; o.height = swap ? c.width : c.height;
  const x = o.getContext('2d', { willReadFrequently: true });
  x.translate(o.width / 2, o.height / 2); x.rotate((r * Math.PI) / 180); x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
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
export async function prepareImage(file, { crop = true, binarize = false, rawImage = false, rotate = 0 } = {}) {
  const dec = await decode(file);
  const w0 = dec.w, h0 = dec.h;
  const long0 = Math.max(w0, h0);
  const s0 = long0 > 2400 ? 2400 / long0 : 1;
  let base = document.createElement('canvas');
  base.width = Math.round(w0 * s0); base.height = Math.round(h0 * s0);
  base.getContext('2d', { willReadFrequently: true }).drawImage(dec.source, 0, 0, base.width, base.height);
  dec.done();
  base = rotateCanvas(base, rotate);
  const bctx = base.getContext('2d', { willReadFrequently: true });
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
      // 向きを変える試行は、文字として読めた明細がまだ無い（＝向きが違う疑いがある）時だけ行う
      if (v.rotate && !settings.rotate && !settings.exhaustive && best && best.score >= 3 && (best.confidence ?? 0) >= ROTATE_SKIP_CONFIDENCE) continue;
      stage = variants.length > 1 ? `（${i + 1}/${variants.length}・${v.name}）` : '';
      const canvas = await prepareImage(file, v);
      await worker.setParameters({ tessedit_pageseg_mode: v.psm, preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(canvas);
      const score = scoreParse(parseReceiptText(data.text || ''));
      tried.push({ name: v.name, score, confidence: Math.round(data.confidence ?? 0) });
      if (!best || score > best.score) best = { score, text: data.text || '', confidence: data.confidence ?? null, method: v.name, canvas };
      if (score >= 100) break; // 明細の合計がレシートの合計と一致したので十分
    }
  } finally {
    await worker.terminate().catch(() => {}); // iPadのメモリを空ける
  }
  return { text: best.text, confidence: best.confidence, method: best.method, tried, preview: previewOf(best.canvas) };
}

/** 確認用の小さな画像（OCRが実際に見た画像）。画面に表示するだけで、保存・送信はしない */
function previewOf(canvas) {
  try {
    const k = Math.min(1, 720 / canvas.width);
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return ''; }
}
