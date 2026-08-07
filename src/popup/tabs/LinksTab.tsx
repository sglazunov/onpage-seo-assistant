import { useMemo, useState } from 'react';
import type { AuditResult, LinkInfo } from '../../shared/types';
import type { LinkCheckResult } from '../../background/link-checker';
import { exportLinksCsv } from '../../core/export';
import { useI18n } from '../i18n-context';
import { api, downloadFile, requestHostPermission } from '../api';
import { DataTable, ShowButton, StatGrid } from '../components/ui';

type Filter = 'all' | 'internal' | 'external' | 'nofollow' | 'problem';

function isProblem(link: LinkInfo): boolean {
  return (
    link.type === 'empty' ||
    link.type === 'javascript' ||
    link.type === 'invalid' ||
    (!link.text.trim() && !link.imageAlt?.trim()) ||
    (typeof link.status === 'number' && link.status >= 400)
  );
}

/** Only a real 4xx/5xx response is rendered as a failure. */
const BAD_OUTCOMES = new Set(['client-error', 'server-error']);
const INCONCLUSIVE_OUTCOMES = new Set(['cors', 'timeout', 'network', 'unknown']);

const MAX_ROWS = 500;

export function LinksTab({
  result,
  onLinkStatuses,
  concurrency,
}: {
  result: AuditResult;
  onLinkStatuses: (results: LinkCheckResult[]) => void;
  concurrency: number;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const links = result.page.links;
  const checked = links.some((l) => Boolean(l.checkResult));

  const stats = useMemo(
    () => ({
      total: links.length,
      internal: links.filter((l) => l.type === 'internal').length,
      external: links.filter((l) => l.type === 'external').length,
      nofollow: links.filter((l) => l.nofollow).length,
      unique: new Set(links.map((l) => l.resolved)).size,
    }),
    [links],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case 'internal':
        return links.filter((l) => l.type === 'internal');
      case 'external':
        return links.filter((l) => l.type === 'external');
      case 'nofollow':
        return links.filter((l) => l.nofollow);
      case 'problem':
        return links.filter(isProblem);
      default:
        return links;
    }
  }, [links, filter]);

  const runStatusCheck = async () => {
    const granted = await requestHostPermission();
    if (!granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);

    const checkable = links.filter((l) => l.type === 'internal' || l.type === 'external');
    const unique = [...new Map(checkable.map((l) => [l.resolved, l])).values()];
    setProgress({ done: 0, total: unique.length });

    const listener = (message: unknown) => {
      const payload = message as { type?: string; done?: number; total?: number };
      if (payload?.type === 'LINK_CHECK_PROGRESS') {
        setProgress({ done: payload.done ?? 0, total: payload.total ?? 0 });
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    try {
      const results = await api.checkLinks(
        unique.map((l) => ({ resolved: l.resolved, type: l.type })),
        concurrency,
      );
      onLinkStatuses(results);
    } finally {
      chrome.runtime.onMessage.removeListener(listener);
      setProgress(null);
    }
  };

  const highlightCurrent = () =>
    api.highlight(visible.slice(0, 300).map((l) => l.selector), 'links', 'a');

  return (
    <div className="pane">
      <StatGrid
        stats={[
          { label: t('ui.links.total'), value: stats.total },
          { label: t('ui.links.internal'), value: stats.internal },
          { label: t('ui.links.external'), value: stats.external },
          { label: t('ui.links.nofollow'), value: stats.nofollow },
          { label: t('ui.links.unique'), value: stats.unique },
        ]}
      />

      <div className="toolbar">
        {(['all', 'internal', 'external', 'nofollow', 'problem'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${filter === value ? ' chip--active' : ''}`}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {value === 'all'
              ? t('ui.overview.filterAll')
              : value === 'problem'
                ? t('ui.errors')
                : t(`ui.links.${value}`)}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button type="button" className="btn btn--ghost btn--sm" onClick={highlightCurrent}>
          ⌖ {t('ui.links.highlightAll')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => api.clearHighlights()}
        >
          {t('ui.clearHighlights')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            const file = exportLinksCsv(result);
            downloadFile(file.filename, file.mime, file.content);
          }}
        >
          ↓ {t('ui.links.exportCsv')}
        </button>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={runStatusCheck}
          disabled={progress !== null}
        >
          {t('ui.links.checkStatuses')}
        </button>
      </div>

      {progress ? (
        <p className="notice notice--info" role="status">
          {t('ui.links.checking', { done: progress.done, total: progress.total })}
        </p>
      ) : null}
      {permissionDenied ? (
        <p className="notice notice--warning">{t('ui.errorsUi.noPermission')}</p>
      ) : null}
      <p className="muted small">{t('ui.links.needsPermission')}</p>
      {checked ? <p className="muted small">{t('ui.links.inconclusiveNote')}</p> : null}

      {visible.length > MAX_ROWS ? (
        <p className="muted small">
          {t('ui.showing', { shown: MAX_ROWS, total: visible.length })}
        </p>
      ) : null}

      <DataTable
        headers={[t('ui.links.anchor'), 'URL', t('ui.status'), '']}
        rows={visible.slice(0, MAX_ROWS).map((link) => [
          <span className="clamp-2">{link.text || <em>{t('ui.links.noAnchor')}</em>}</span>,
          <span className="wrap-any">
            {link.resolved}
            {link.rel.length ? <em className="rel"> rel={link.rel.join(' ')}</em> : null}
          </span>,
          <StatusCell link={link} />,
          <ShowButton selector={link.selector} category="links" label="a" />,
        ])}
      />
    </div>
  );
}

function StatusCell({ link }: { link: LinkInfo }) {
  const { t } = useI18n();
  if (!link.checkResult) return <span className="status">{link.type}</span>;

  const bad = BAD_OUTCOMES.has(link.checkResult);
  const inconclusive = INCONCLUSIVE_OUTCOMES.has(link.checkResult);
  const label = t(`ui.links.outcome.${link.checkResult}`);

  return (
    <span
      className={bad ? 'status status--bad' : inconclusive ? 'status muted' : 'status status--ok'}
      title={link.checkError ?? undefined}
    >
      {link.status ?? label}
      {link.status && link.checkResult !== 'ok' ? ` · ${label}` : ''}
    </span>
  );
}
