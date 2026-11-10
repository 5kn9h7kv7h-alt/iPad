import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useLucida } from './store';
import { Archive } from './pages/Archive';
import { Capture } from './pages/Capture';
import { DiscoveryDetail } from './pages/DiscoveryDetail';
import { Explore } from './pages/Explore';
import { Home } from './pages/Home';
import { Lab } from './pages/Lab';
import { ExperimentDetail } from './pages/ExperimentDetail';
import { Profile } from './pages/Profile';
import { SignIn } from './pages/SignIn';

// グラフ描画ライブラリは大きいので、Networkを開いたときだけ読み込む
const Network = lazy(() => import('./pages/Network'));

export function App() {
  const { ready, loadError, needsSignIn } = useLucida();
  if (loadError) {
    return (
      <main className="boot"><h1 className="wordmark">LUCIDA</h1>
        <p role="alert" className="error">{loadError}</p>
        <button className="btn" onClick={() => location.reload()}>再読み込み</button></main>
    );
  }
  if (!ready) return <main className="boot"><h1 className="wordmark">LUCIDA</h1><p className="muted" aria-live="polite">読み込み中…</p></main>;
  if (needsSignIn) return <SignIn />;
  return (
    <Shell>
      <Suspense fallback={<div className="page"><p className="muted" aria-live="polite">読み込み中…</p></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/network" element={<Network />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/lab/:id" element={<ExperimentDetail />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/d/:id" element={<DiscoveryDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Shell>
  );
}
