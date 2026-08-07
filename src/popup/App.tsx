import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuditResult, PageData, Settings } from '../shared/types';
import type { RobotsInfo } from '../shared/messages';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { runAudit } from '../core/analyzers/audit';
import { api } from './api';
import { I18nProvider, useI18n } from './i18n-context';
import { ScoreHeader } from './components/ScoreHeader';
import { ExportMenu } from './components/ExportMenu';
import { OverviewTab } from './tabs/OverviewTab';
import { MetaTab } from './tabs/MetaTab';
import { HeadingsTab } from './tabs/HeadingsTab';
import { LinksTab } from './tabs/LinksTab';
import { ImagesTab } from './tabs/ImagesTab';
import { SchemaTab } from './tabs/SchemaTab';
import { SocialTab } from './tabs/SocialTab';
import { ContentTab } from './tabs/ContentTab';
import { TechnicalTab } from './tabs/TechnicalTab';

const TABS = [
  'overview',
  'meta',
  'headings',
  'links',
  'images',
  'schema',
  'social',
  'content',
  'technical',
] as const;

type TabId = (typeof TABS)[number];

function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function Shell() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [page, setPage] = useState<PageData | null>(null);
  const [network, setNetwork] = useState<RobotsInfo | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [exportOpen, setExportOpen] = useState(false);
  const tablistRef = useRef<HTMLDivElement>(null);

  const result: AuditResult | null = useMemo(
    () => (page ? runAudit(page, { settings, network }) : null),
    [page, settings, network],
  );

  const audit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.getPageData();
      setPage(data);
      setNetwork(null);
    } catch (caught) {
      const err = caught as Error & { code?: string };
      setError({ message: err.message, code: err.code });
      setPage(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = DEFAULT_SETTINGS;
      try {
        loaded = await api.getSettings();
      } catch {
        /* first run before the worker booted — defaults are fine */
      }
      if (cancelled) return;
      setSettings(loaded);
      applyTheme(loaded.theme);
      if (loaded.autoRunOnOpen) void audit();
      else setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [audit]);

  // History is written from the popup because the audit itself runs here.
  useEffect(() => {
    if (!result || !settings.saveHistory) return;
    void api.saveHistory(result).catch(() => undefined);
  }, [result, settings.saveHistory]);

  const onLinkStatuses = useCallback(
    (results: { url: string; status?: number; redirectedTo?: string }[]) => {
      const byUrl = new Map(results.map((r) => [r.url, r]));
      setPage((previous) =>
        previous
          ? {
              ...previous,
              links: previous.links.map((link) => {
                const hit = byUrl.get(link.resolved);
                return hit ? { ...link, status: hit.status, redirectedTo: hit.redirectedTo } : link;
              }),
            }
          : previous,
      );
    },
    [],
  );

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const index = TABS.indexOf(tab);
    if (event.key === 'ArrowRight') setTab(TABS[(index + 1) % TABS.length]);
    else if (event.key === 'ArrowLeft') setTab(TABS[(index - 1 + TABS.length) % TABS.length]);
    else return;
    event.preventDefault();
    // Keep focus on the newly selected tab for screen readers.
    requestAnimationFrame(() => {
      tablistRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    });
  };

  if (busy && !result) {
    return (
      <div className="state" role="status">
        <div className="spinner" aria-hidden="true" />
        <p>{t('ui.analyzing')}</p>
      </div>
    );
  }

  if (error || !result) {
    const message =
      error?.code === 'RESTRICTED'
        ? t('ui.errorsUi.restricted')
        : error?.code === 'NO_CONTENT_SCRIPT'
          ? t('ui.errorsUi.noContentScript')
          : t('ui.errorsUi.generic', { msg: error?.message ?? '' });
    return (
      <div className="state">
        <p className="state__error">{message}</p>
        <button type="button" className="btn btn--primary" onClick={audit}>
          {t('ui.runAudit')}
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app__header">
        <ScoreHeader
          result={result}
          busy={busy}
          onRefresh={audit}
          onExport={() => setExportOpen((v) => !v)}
          onSettings={() => chrome.runtime.openOptionsPage()}
        />
        <ExportMenu result={result} open={exportOpen} onClose={() => setExportOpen(false)} />
      </div>

      <div className="tabs" role="tablist" ref={tablistRef} onKeyDown={onTabKeyDown}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={`tabs__btn${tab === id ? ' tabs__btn--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {t(`ui.tabs.${id}`)}
          </button>
        ))}
      </div>

      <main className="app__body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <OverviewTab result={result} />}
        {tab === 'meta' && <MetaTab result={result} />}
        {tab === 'headings' && <HeadingsTab result={result} />}
        {tab === 'links' && <LinksTab result={result} onLinkStatuses={onLinkStatuses} />}
        {tab === 'images' && <ImagesTab result={result} />}
        {tab === 'schema' && <SchemaTab result={result} />}
        {tab === 'social' && <SocialTab result={result} />}
        {tab === 'content' && <ContentTab result={result} />}
        {tab === 'technical' && (
          <TechnicalTab result={result} network={network} onNetwork={setNetwork} />
        )}
      </main>
    </div>
  );
}

export function App({ lang }: { lang: Settings['lang'] }) {
  const [current, setCurrent] = useState(lang);

  // The options page can change the language while the popup is open.
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const next = changes.settings?.newValue as Settings | undefined;
      if (next?.lang) setCurrent(next.lang);
      if (next?.theme) applyTheme(next.theme);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return (
    <I18nProvider lang={current}>
      <Shell />
    </I18nProvider>
  );
}
