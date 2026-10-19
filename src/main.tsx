import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted (no request to Google); the browser only downloads the font the active style uses.
import '@fontsource-variable/nunito';
import '@fontsource-variable/figtree';
import '@fontsource-variable/inter';
import App from './App';
import { applyTheme, loadTheme } from './theme';
import './styles.css';

applyTheme(loadTheme()); // before the first render, so there is no flash of the default style

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
