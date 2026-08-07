import { useEffect, useState } from 'react';
import type { HistoryEntry, Lang, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { createTranslate } from '../shared/i18n';
import {
  clearHistory,
  getHistory,
  getSettings,
  removeHistoryEntry,
  setSettings,
} from '../shared/storage';

const NUMBER_FIELDS = [
  ['titleMin', 'ui.settings.titleMin'],
  ['titleMax', 'ui.settings.titleMax'],
  ['descriptionMin', 'ui.settings.descriptionMin'],
  ['descriptionMax', 'ui.settings.descriptionMax'],
  ['h1Max', 'ui.settings.h1Max'],
  ['altMax', 'ui.settings.altMax'],
  ['anchorMax', 'ui.settings.anchorMax'],
] as const;

export function Options() {
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saved, setSaved] = useState(false);
  const t = createTranslate(settings.lang);

  useEffect(() => {
    void (async () => {
      setLocal(await getSettings());
      setHistory(await getHistory());
    })();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const save = async (next: Settings) => {
    setLocal(next);
    await setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const patch = (partial: Partial<Settings>) => void save({ ...settings, ...partial });

  return (
    <div className="options">
      <h1>{t('ui.settings.title')}</h1>

      <section className="opt-group">
        <label className="opt">
          <span>{t('ui.settings.language')}</span>
          <select
            value={settings.lang}
            onChange={(e) => patch({ lang: e.target.value as Lang })}
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="opt">
          <span>{t('ui.settings.theme')}</span>
          <select
            value={settings.theme}
            onChange={(e) => patch({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="system">{t('ui.settings.themeSystem')}</option>
            <option value="light">{t('ui.settings.themeLight')}</option>
            <option value="dark">{t('ui.settings.themeDark')}</option>
          </select>
        </label>

        <label className="opt opt--check">
          <input
            type="checkbox"
            checked={settings.autoRunOnOpen}
            onChange={(e) => patch({ autoRunOnOpen: e.target.checked })}
          />
          <span>{t('ui.settings.autoRun')}</span>
        </label>

        <label className="opt opt--check">
          <input
            type="checkbox"
            checked={settings.saveHistory}
            onChange={(e) => patch({ saveHistory: e.target.checked })}
          />
          <span>{t('ui.settings.saveHistory')}</span>
        </label>

        <label className="opt">
          <span>{t('ui.settings.historyLimit')}</span>
          <input
            type="number"
            min={1}
            max={500}
            value={settings.historyLimit}
            onChange={(e) => patch({ historyLimit: Number(e.target.value) || 1 })}
          />
        </label>

        <label className="opt">
          <span>{t('ui.settings.concurrency')}</span>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.linkCheckConcurrency}
            onChange={(e) => patch({ linkCheckConcurrency: Number(e.target.value) || 1 })}
          />
        </label>
      </section>

      <h2>{t('ui.settings.thresholds')}</h2>
      <p className="hint">{t('ui.settings.thresholdNote')}</p>
      <section className="opt-group">
        {NUMBER_FIELDS.map(([key, label]) => (
          <label className="opt" key={key}>
            <span>{t(label)}</span>
            <input
              type="number"
              min={1}
              max={500}
              value={settings.thresholds[key]}
              onChange={(e) =>
                patch({
                  thresholds: { ...settings.thresholds, [key]: Number(e.target.value) || 1 },
                })
              }
            />
          </label>
        ))}
      </section>

      <h2>{t('ui.settings.mutedRules')}</h2>
      <p className="hint">{t('ui.settings.mutedNote')}</p>
      <input
        className="wide"
        type="text"
        value={settings.mutedRules.join(', ')}
        onChange={(e) =>
          setLocal({
            ...settings,
            mutedRules: e.target.value
              .split(',')
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean),
          })
        }
        onBlur={() => void save(settings)}
        placeholder="META-014, IMG-007"
      />

      <h2>{t('ui.history')}</h2>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await clearHistory();
            setHistory([]);
          }}
        >
          {t('ui.settings.clearHistory')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void save({ ...DEFAULT_SETTINGS, lang: settings.lang })}
        >
          {t('ui.settings.reset')}
        </button>
        {saved ? <span className="saved">✓ {t('ui.settings.saved')}</span> : null}
      </div>

      {history.length === 0 ? (
        <p className="hint">—</p>
      ) : (
        <table className="hist">
          <thead>
            <tr>
              <th>{t('ui.score')}</th>
              <th>URL</th>
              <th>{t('ui.errors')}</th>
              <th>{t('ui.warnings')}</th>
              <th>{t('ui.analyzedAt')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <b>{entry.score}</b>
                </td>
                <td className="hist__url">
                  <a href={entry.url} target="_blank" rel="noreferrer">
                    {entry.pageTitle || entry.url}
                  </a>
                </td>
                <td>{entry.errors}</td>
                <td>{entry.warnings}</td>
                <td>{new Date(entry.analyzedAt).toLocaleString()}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn--sm"
                    aria-label={`${t('ui.close')} ${entry.url}`}
                    onClick={async () => {
                      await removeHistoryEntry(entry.id);
                      setHistory(await getHistory());
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint">
        <a
          href="https://github.com/sglazunov/onpage-seo-assistant/blob/main/PRIVACY.md"
          target="_blank"
          rel="noreferrer"
        >
          {t('ui.settings.privacy')}
        </a>
      </p>
    </div>
  );
}
