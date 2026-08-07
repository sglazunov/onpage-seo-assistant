import type { AuditResult } from '../../shared/types';
import { scoreBand } from '../../core/scoring/score';
import { useI18n } from '../i18n-context';

export function ScoreHeader({
  result,
  busy,
  onRefresh,
  onExport,
  onSettings,
}: {
  result: AuditResult;
  busy: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  const s = result.score;
  const band = scoreBand(s.overall);

  return (
    <header className="head">
      <div className="head__top">
        <div className="head__id">
          <h1 className="head__title" title={result.pageTitle ?? ''}>
            {result.pageTitle || t('ui.appName')}
          </h1>
          <a
            className="head__url"
            href={result.finalUrl}
            target="_blank"
            rel="noreferrer"
            title={result.finalUrl}
          >
            {result.finalUrl}
          </a>
        </div>
        <div className="head__buttons">
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onRefresh}
            disabled={busy}
            aria-label={t('ui.refresh')}
            title={t('ui.refresh')}
          >
            ↻
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onExport}
            aria-label={t('ui.export')}
            title={t('ui.export')}
          >
            ↓
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onSettings}
            aria-label={t('ui.settings')}
            title={t('ui.settings')}
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="head__score">
        <div className={`gauge gauge--${band}`} role="img" aria-label={`${t('ui.score')} ${s.overall} / 100`}>
          <span className="gauge__value">{s.overall}</span>
          <span className="gauge__max">/100</span>
        </div>

        <ul className="counters">
          <li className="counters__item counters__item--error">
            <b>{s.errors}</b>
            <span>{t('ui.errors')}</span>
          </li>
          <li className="counters__item counters__item--warning">
            <b>{s.warnings}</b>
            <span>{t('ui.warnings')}</span>
          </li>
          <li className="counters__item counters__item--info">
            <b>{s.infos}</b>
            <span>{t('ui.infos')}</span>
          </li>
          <li className="counters__item counters__item--passed">
            <b>{s.passed}</b>
            <span>{t('ui.passed')}</span>
          </li>
        </ul>
      </div>

      <div className="groups">
        {(['technical', 'content', 'social'] as const).map((group) => (
          <div className="groups__item" key={group}>
            <span className="groups__label">{t(`ui.groups.${group}`)}</span>
            <span className={`groups__value groups__value--${scoreBand(s.groups[group])}`}>
              {s.groups[group]}
            </span>
          </div>
        ))}
        <time className="groups__time" dateTime={new Date(result.analyzedAt).toISOString()}>
          {new Date(result.analyzedAt).toLocaleTimeString()}
        </time>
      </div>
    </header>
  );
}
