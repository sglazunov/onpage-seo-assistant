import type { AuditResult } from '../../shared/types';
import { MetaIndex } from '../../core/rules';
import { useI18n } from '../i18n-context';
import { Card, CopyButton, DataTable, ShowButton, ValueBlock } from '../components/ui';

function charCount(value: string | null): number {
  return value ? [...value.trim()].length : 0;
}

function wordCount(value: string | null): number {
  return value ? (value.trim().match(/[\p{L}\p{N}]+/gu) ?? []).length : 0;
}

export function MetaTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const page = result.page;
  const meta = new MetaIndex(page);

  const description = meta.name('description');
  const robots = meta.name('robots');
  const directives = meta.robotsDirectives();
  const indexable = !directives.includes('noindex') && !directives.includes('none');

  const entries: {
    label: string;
    value: string | null;
    selector?: string;
    showLength?: boolean;
  }[] = [
    { label: t('ui.meta.title'), value: page.title, selector: 'title', showLength: true },
    {
      label: t('ui.meta.description'),
      value: description,
      selector: 'meta[name="description"]',
      showLength: true,
    },
    { label: t('ui.meta.robots'), value: robots, selector: 'meta[name="robots"]' },
    { label: t('ui.meta.canonical'), value: page.canonicalResolved, selector: 'link[rel="canonical"]' },
    { label: t('ui.meta.viewport'), value: meta.name('viewport') },
    { label: t('ui.meta.language'), value: page.htmlLang, selector: 'html' },
    { label: t('ui.meta.charset'), value: page.charset },
    { label: t('ui.meta.author'), value: meta.name('author') },
    { label: t('ui.meta.keywords'), value: meta.name('keywords') },
    { label: t('ui.meta.favicon'), value: page.favicons[0] ?? null },
  ];

  return (
    <div className="pane">
      <p className={`notice ${indexable ? 'notice--ok' : 'notice--error'}`}>
        <strong>{t('ui.meta.indexability')}:</strong>{' '}
        {indexable ? t('ui.meta.indexable') : t('ui.meta.notIndexable')}
        {directives.length ? ` (${directives.join(', ')})` : ''}
      </p>

      {entries.map((entry) => (
        <Card
          key={entry.label}
          title={entry.label}
          actions={
            <>
              {entry.value ? <CopyButton value={entry.value} /> : null}
              {entry.selector ? (
                <ShowButton selector={entry.selector} category="meta" label={entry.label} />
              ) : null}
            </>
          }
        >
          <ValueBlock value={entry.value} />
          {entry.showLength && entry.value ? (
            <p className="meta-len">
              {charCount(entry.value)} {t('ui.chars')} · {wordCount(entry.value)} {t('ui.words')}
            </p>
          ) : null}
        </Card>
      ))}

      <h2 className="pane__title">{t('ui.meta.hreflang')}</h2>
      <DataTable
        headers={['hreflang', 'href']}
        rows={page.hreflang.map((h) => [h.lang, <span className="wrap-any">{h.href}</span>])}
        empty={t('ui.none')}
      />
    </div>
  );
}
