import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted font: no request to Google (DSGVO), shipped with the build.
import '@fontsource-variable/nunito';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
