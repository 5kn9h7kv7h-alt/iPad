import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { installDebug } from './debug';

if (location.search.includes('debug')) installDebug();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
