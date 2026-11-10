import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { LucidaProvider } from './store';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <LucidaProvider>
        <App />
      </LucidaProvider>
    </HashRouter>
  </StrictMode>,
);

// オフラインでも開けるようにする（本番ビルドのみ。開発中はキャッシュが邪魔になるため登録しない）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker を登録できませんでした', e)); });
}
