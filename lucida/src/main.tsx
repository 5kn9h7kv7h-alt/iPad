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
