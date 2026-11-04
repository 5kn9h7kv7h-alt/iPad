import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useLucida } from './store';
import { Archive } from './pages/Archive';
import { Capture } from './pages/Capture';
import { DiscoveryDetail } from './pages/DiscoveryDetail';
import { Explore } from './pages/Explore';
import { Home } from './pages/Home';
import { Lab } from './pages/Lab';
import { Network } from './pages/Network';
import { Profile } from './pages/Profile';

export function App() {
  const { ready, loadError } = useLucida();
  if (loadError) {
    return (
      <main className="boot"><h1 className="wordmark">LUCIDA</h1>
        <p role="alert" className="error">{loadError}</p>
        <button className="btn" onClick={() => location.reload()}>再読み込み</button></main>
    );
  }
  if (!ready) return <main className="boot"><h1 className="wordmark">LUCIDA</h1><p className="muted" aria-live="polite">読み込み中…</p></main>;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/network" element={<Network />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/d/:id" element={<DiscoveryDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
