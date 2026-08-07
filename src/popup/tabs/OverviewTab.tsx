import type { AuditResult } from '../../shared/types';
import { scoreBand } from '../../core/scoring/score';
import { useI18n } from '../i18n-context';
import { IssueList } from '../components/IssueList';

export function OverviewTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const truncated = Object.entries(result.page.truncated);
  // Every point taken off the score, largest first — the score must be
  // reconstructable by the user, not just asserted.
  const penalties = result.issues
    .filter((i) => i.scoreImpact > 0)
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .slice(0, 8);

  return (
    <div className="pane">
      {truncated.length > 0 ? (
        <p className="notice notice--warning">
          {t('ui.overview.truncated', {
            n: truncated.map(([key, value]) => `${key}: ${value}`).join(', '),
          })}
        </p>
      ) : null}

      {penalties.length > 0 ? (
        <>
          <h2 className="pane__title">{t('ui.overview.whyScore')}</h2>
          <ul className="penalties">
            {penalties.map((issue) => (
              <li className="penalties__row" key={`${issue.id}-${issue.selector ?? ''}`}>
                <span className="penalties__value">−{issue.scoreImpact}</span>
                <span className="penalties__label">{issue.title}</span>
              </li>
            ))}
            <li className="penalties__row penalties__row--total">
              <span className="penalties__value">{result.score.overall}</span>
              <span className="penalties__label">
                {t('ui.score')} · 100 − {result.score.totalPenalty}
              </span>
            </li>
          </ul>
        </>
      ) : null}

      <h2 className="pane__title">{t('ui.overview.issues')}</h2>
      <IssueList issues={result.issues} />

      <h2 className="pane__title">{t('ui.overview.byCategory')}</h2>
      <ul className="bars">
        {result.score.categories
          .filter((c) => c.weight > 0 || c.penalty > 0)
          .map((c) => (
            <li className="bars__row" key={c.category}>
              <span className="bars__label">{t(`categories.${c.category}`)}</span>
              <span className="bars__track">
                <span
                  className={`bars__fill bars__fill--${scoreBand(c.score)}`}
                  style={{ width: `${c.score}%` }}
                />
              </span>
              <span className="bars__value">{c.score}</span>
            </li>
          ))}
      </ul>

      <details className="details">
        <summary>
          {t('ui.overview.passedChecks')} ({result.passed.length})
        </summary>
        <ul className="passed">
          {result.passed.map((p) => (
            <li key={p.id}>
              <code>{p.id}</code> {p.title}
            </li>
          ))}
        </ul>
      </details>

      <p className="disclaimer">{t('ui.scoreDisclaimer')}</p>
    </div>
  );
}
