// ファイルの保存。Claudeの共有ページでは `downloads` 機能（確認ダイアログ付き）を使い、
// 通常のブラウザでは <a download> を使う。viewerが断った場合は何も保存しない。
export async function saveFile(filename, text, type = 'application/json') {
  // CSVだけ、Excelで文字化けしないようBOMを付ける（JSONに付けると読み込めなくなる）
  const body = type.startsWith('text/csv') ? `\ufeff${text}` : text;
  try {
    const downloads = await window.claude?.use?.('downloads');
    if (downloads) {
      try { await downloads.save({ filename, data: body }); return 'saved'; }
      catch (e) { if (e?.code === 'declined') return 'declined'; return 'failed'; }
    }
  } catch { /* 機能なし → 通常のダウンロードへ */ }
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
