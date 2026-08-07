import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { IssueSeverity } from '../../shared/types';
import { api, copyToClipboard } from '../api';
import { useI18n } from '../i18n-context';

export function Badge({
  severity,
  children,
}: {
  severity: IssueSeverity | 'passed';
  children: ReactNode;
}) {
  return <span className={`badge badge--${severity}`}>{children}</span>;
}

export function CopyButton({ value, title }: { value: string; title?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }, [value]);

  useEffect(() => setCopied(false), [value]);

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={onClick}
      aria-label={title ?? t('ui.copy')}
      title={title ?? t('ui.copy')}
    >
      {copied ? `✓ ${t('ui.copied')}` : t('ui.copy')}
    </button>
  );
}

export function ShowButton({
  selector,
  selectors,
  category,
  label,
}: {
  selector?: string;
  selectors?: string[];
  category: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  if (!selector && !selectors?.length) return null;

  const onClick = async () => {
    try {
      if (selectors && selectors.length > 1) {
        const { matched } = await api.highlight(selectors, category, label);
        setFailed(matched === 0);
        if (matched > 0) await api.scrollTo(selectors[0], category, label);
      } else {
        const target = selector ?? selectors![0];
        const { found } = await api.scrollTo(target, category, label);
        setFailed(!found);
      }
    } catch {
      setFailed(true);
    }
    setTimeout(() => setFailed(false), 2000);
  };

  return (
    <button type="button" className="btn btn--ghost btn--sm" onClick={onClick}>
      {failed ? '✕' : '⌖'} {t('ui.show')}
    </button>
  );
}

export function Card({
  title,
  actions,
  children,
  tone,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: IssueSeverity | 'passed';
}) {
  return (
    <section className={`card${tone ? ` card--${tone}` : ''}`}>
      <header className="card__head">
        <h3 className="card__title">{title}</h3>
        {actions ? <div className="card__actions">{actions}</div> : null}
      </header>
      <div className="card__body">{children}</div>
    </section>
  );
}

export function StatGrid({ stats }: { stats: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="stats">
      {stats.map((s) => (
        <div className="stats__item" key={s.label}>
          <dt>{s.label}</dt>
          <dd>{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="muted">{empty ?? '—'}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function ValueBlock({ value }: { value: string | null }) {
  const { t } = useI18n();
  if (value === null) return <span className="muted">{t('ui.none')}</span>;
  if (value.trim() === '') return <span className="muted">""</span>;
  return <span className="value">{value}</span>;
}
