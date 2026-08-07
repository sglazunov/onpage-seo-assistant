import { useState } from 'react';
import type { AuditIssue, IssueSeverity } from '../../shared/types';
import { useI18n } from '../i18n-context';
import { Badge, CopyButton, ShowButton } from './ui';

const CATEGORY_HIGHLIGHT: Record<string, string> = {
  meta: 'meta',
  canonical: 'meta',
  indexing: 'meta',
  headings: 'headings',
  links: 'links',
  images: 'images',
  schema: 'schema',
  social: 'meta',
  content: 'content',
  technical: 'default',
};

function IssueRow({ issue }: { issue: AuditIssue }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <li className={`issue issue--${issue.severity}`}>
      <button
        type="button"
        className="issue__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Badge severity={issue.severity}>{t(`severity.${issue.severity}`)}</Badge>
        <span className="issue__title">{issue.title}</span>
        {issue.count && issue.count > 1 ? (
          <span className="issue__count">×{issue.count}</span>
        ) : null}
        <span className="issue__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <div className="issue__body">
          <p className="issue__meta">
            <code>{issue.id}</code> · {t(`categories.${issue.category}`)}
            {issue.scoreImpact > 0 ? ` · −${issue.scoreImpact}` : ''}
          </p>
          <p>{issue.description}</p>
          {issue.value ? (
            <pre className="issue__value">{issue.value.slice(0, 600)}</pre>
          ) : null}
          <p className="issue__rec">
            <strong>{t('ui.recommendation')}:</strong> {issue.recommendation}
          </p>
          <div className="issue__actions">
            <ShowButton
              selector={issue.selector}
              selectors={issue.selectors}
              category={CATEGORY_HIGHLIGHT[issue.category] ?? 'default'}
              label={issue.id}
            />
            <CopyButton value={`[${issue.id}] ${issue.title}\n${issue.recommendation}`} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function IssueList({ issues }: { issues: AuditIssue[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<IssueSeverity | 'all'>('all');

  const visible = filter === 'all' ? issues : issues.filter((i) => i.severity === filter);

  if (issues.length === 0) {
    return <p className="empty empty--ok">{t('ui.overview.noIssues')}</p>;
  }

  return (
    <>
      <div className="filters" role="group" aria-label={t('ui.overview.issues')}>
        {(['all', 'error', 'warning', 'info'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${filter === value ? ' chip--active' : ''}`}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {value === 'all' ? t('ui.overview.filterAll') : t(`severity.${value}`)}
            <span className="chip__n">
              {value === 'all' ? issues.length : issues.filter((i) => i.severity === value).length}
            </span>
          </button>
        ))}
      </div>

      <ul className="issues">
        {visible.map((issue) => (
          <IssueRow key={`${issue.id}-${issue.selector ?? ''}`} issue={issue} />
        ))}
      </ul>
    </>
  );
}
