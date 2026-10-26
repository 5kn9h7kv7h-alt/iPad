// 端末内OCR（Tesseract.js を public/vendor に同梱。画像は外部へ送信しない）。ブラウザ専用。
const VENDOR = () => new URL('vendor/tesseract/', document.baseURI).href;

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

/** 大きすぎる写真は縮小し、小さい画像は拡大して、グレースケール化＋コントラスト補正する */
export async function prepareImage(file) {
  const src = await decode(file);
  const w0 = src.width, h0 = src.height;
  const long = Math.max(w0, h0);
  const scale = long > 2200 ? 2200 / long : Math.min(w0, h0) < 700 ? 2 : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w0 * scale); canvas.height = Math.round(h0 * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const n = canvas.width * canvas.height;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  if (hi - lo > 20) {
    const k = 255 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) { const g = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = g; }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const STATUS_JA = {
  'loading tesseract core': '文字認識エンジンを読み込み中…',
  'initializing tesseract': '準備中…',
  'loading language traineddata': '日本語データを読み込み中（初回のみ時間がかかります）…',
  'initializing api': '準備中…',
  'recognizing text': '文字を読み取り中…',
};

/** 画像ファイルから文字列を読み取る。onProgress(メッセージ, 0〜1) */
export async function recognizeImage(file, onProgress = () => {}) {
  onProgress('画像を準備中…', 0);
  const canvas = await prepareImage(file);
  onProgress('文字認識エンジンを読み込み中…', 0);
  const T = await loadTesseract();
  const base = VENDOR();
  const worker = await T.createWorker('jpn', 1, {
    workerPath: `${base}worker.min.js`, corePath: `${base}core`, langPath: `${base}lang`, gzip: false,
    logger: (m) => onProgress(STATUS_JA[m.status] || '処理中…', m.progress || 0),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return { text: data.text || '', confidence: data.confidence ?? null };
  } finally {
    await worker.terminate().catch(() => {}); // iPadのメモリを空ける
  }
}
