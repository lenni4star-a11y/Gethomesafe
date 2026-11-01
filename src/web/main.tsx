import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LiveViewer } from './components/LiveViewer';
import './styles.css';

// Live-Standort-Link von einer Begleitung (…?live=ID#SCHLÜSSEL): eigene, schlanke Ansicht
const liveId = new URLSearchParams(location.search).get('live');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {liveId ? <LiveViewer id={liveId} keyB64={location.hash.slice(1)} /> : <App />}
  </StrictMode>,
);
