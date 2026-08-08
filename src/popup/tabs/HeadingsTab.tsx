import type { AuditResult } from '../../shared/types';
import { useI18n } from '../i18n-context';
import { CopyButton, Empty, ShowButton, StatGrid } from '../components/ui';
import { api } from '../api';

export function HeadingsTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const headings = result.page.headings;

  const counts = [1, 2, 3, 4, 5, 6].map((level) => ({
    label: `H${level}`,
    value: headings.filter((h) => h.level === level).length,
  }));

  const outline = headings
    .map((h) => `${'  '.repeat(h.level - 1)}H${h.level}: ${h.text || '—'}`)
    .join('\n');

  return (
    <div className="pane">
      <h2 className="pane__title">{t('ui.headings.counts')}</h2>
      <StatGrid stats={counts} />

      <div className="pane__row">
        <h2 className="pane__title">{t('ui.headings.tree')}</h2>
        <div className="pane__row-actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              api.highlight(
                headings.map((h) => h.selector),
                'headings',
                'H',
              )
            }
          >
            ⌖ H1–H6
          </button>
          {outline ? <CopyButton value={outline} /> : null}
        </div>
      </div>

      {headings.length === 0 ? (
        <Empty>{t('ui.headings.empty')}</Empty>
      ) : (
        <ol className="outline">
          {headings.map((h) => (
            <li
              className={`outline__item outline__item--l${h.level}${h.visible ? '' : ' outline__item--hidden'}`}
              key={`${h.index}-${h.selector}`}
              style={{ paddingInlineStart: `${(h.level - 1) * 14}px` }}
            >
              <span className={`outline__tag outline__tag--l${h.level}`}>H{h.level}</span>
              <span className="outline__text">{h.text || <em>—</em>}</span>
              {h.visible ? null : <span className="outline__flag">{t('ui.headings.hidden')}</span>}
              <ShowButton
                selector={h.selector}
                category="headings"
                label={`H${h.level}`}
                verify={h.text}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
