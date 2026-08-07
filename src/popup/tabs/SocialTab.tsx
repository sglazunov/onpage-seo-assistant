import type { AuditResult } from '../../shared/types';
import { MetaIndex } from '../../core/rules';
import { useI18n } from '../i18n-context';
import { DataTable, ValueBlock } from '../components/ui';

const OG_KEYS = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name'];
const TW_KEYS = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

export function SocialTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const meta = new MetaIndex(result.page);

  const image = meta.social('og:image') ?? meta.social('twitter:image');
  const title = meta.social('og:title') ?? meta.social('twitter:title') ?? result.page.title;
  const description =
    meta.social('og:description') ??
    meta.social('twitter:description') ??
    meta.name('description');

  return (
    <div className="pane">
      {meta.hasAnyOpenGraph() ? null : (
        <p className="notice notice--warning">{t('ui.social.noOg')}</p>
      )}

      <h2 className="pane__title">{t('ui.social.preview')}</h2>
      <div className="og-card">
        {image ? (
          <img className="og-card__img" src={image} alt="" loading="lazy" />
        ) : (
          <div className="og-card__img og-card__img--empty">{t('ui.social.noImage')}</div>
        )}
        <div className="og-card__body">
          <span className="og-card__host">{result.page.hostname}</span>
          <strong className="og-card__title">{title || '—'}</strong>
          <span className="og-card__desc">{description || '—'}</span>
        </div>
      </div>

      <h2 className="pane__title">{t('ui.social.openGraph')}</h2>
      <DataTable
        headers={['Tag', t('ui.value')]}
        rows={OG_KEYS.map((key) => [
          <code>{key}</code>,
          <ValueBlock value={meta.social(key)} />,
        ])}
      />

      <h2 className="pane__title">{t('ui.social.twitter')}</h2>
      <DataTable
        headers={['Tag', t('ui.value')]}
        rows={TW_KEYS.map((key) => [
          <code>{key}</code>,
          <ValueBlock value={meta.social(key)} />,
        ])}
      />
    </div>
  );
}
