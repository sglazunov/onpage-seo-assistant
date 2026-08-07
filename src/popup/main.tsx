import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { detectLang } from '../shared/i18n';
import { getSettings } from '../shared/storage';
import './styles.css';

async function boot() {
  const container = document.getElementById('root');
  if (!container) return;

  // The stored preference wins; the browser UI language is only the fallback.
  let lang = detectLang();
  try {
    lang = (await getSettings()).lang;
  } catch {
    /* storage unavailable — keep the detected language */
  }

  createRoot(container).render(
    <StrictMode>
      <App lang={lang} />
    </StrictMode>,
  );
}

void boot();
