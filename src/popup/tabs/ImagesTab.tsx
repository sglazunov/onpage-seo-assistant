import { useMemo, useState } from 'react';
import type { AuditResult } from '../../shared/types';
import { exportImagesCsv } from '../../core/export';
import { useI18n } from '../i18n-context';
import { api, downloadFile } from '../api';
import { DataTable, ShowButton, StatGrid } from '../components/ui';

type Filter = 'all' | 'noAlt' | 'failed' | 'hidden';

export function ImagesTab({ result }: { result: AuditResult }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const images = result.page.images;

  const visible = useMemo(() => {
    switch (filter) {
      case 'noAlt':
        return images.filter((i) => i.alt === null);
      case 'failed':
        return images.filter((i) => !i.loaded);
      case 'hidden':
        return images.filter((i) => !i.visible);
      default:
        return images;
    }
  }, [images, filter]);

  return (
    <div className="pane">
      <StatGrid
        stats={[
          { label: t('ui.images.total'), value: images.length },
          { label: t('ui.images.noAlt'), value: images.filter((i) => i.alt === null).length },
          { label: t('ui.images.emptyAlt'), value: images.filter((i) => i.alt === '').length },
          { label: t('ui.images.failed'), value: images.filter((i) => !i.loaded).length },
          {
            label: t('ui.images.lazy'),
            value: images.filter((i) => i.loading === 'lazy').length,
          },
        ]}
      />

      <div className="toolbar">
        {(['all', 'noAlt', 'failed', 'hidden'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`chip${filter === value ? ' chip--active' : ''}`}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {value === 'all' ? t('ui.overview.filterAll') : t(`ui.images.${value}`)}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() =>
            api.highlight(visible.slice(0, 300).map((i) => i.selector), 'images', 'img')
          }
        >
          ⌖ {t('ui.images.highlightAll')}
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
            const file = exportImagesCsv(result);
            downloadFile(file.filename, file.mime, file.content);
          }}
        >
          ↓ {t('ui.images.exportCsv')}
        </button>
      </div>

      <DataTable
        headers={['', 'ALT', t('ui.images.dimensions'), '']}
        rows={visible.slice(0, 300).map((image) => [
          image.src ? (
            <img className="thumb" src={image.src} alt="" loading="lazy" />
          ) : (
            <span className="thumb thumb--svg">SVG</span>
          ),
          image.alt === null ? (
            <span className="status status--bad">[no alt]</span>
          ) : image.alt === '' ? (
            <span className="muted">[empty]</span>
          ) : (
            <span className="clamp-2">{image.alt}</span>
          ),
          <span className="small">
            {image.naturalWidth}×{image.naturalHeight}
            {image.loading ? ` · ${image.loading}` : ''}
            {image.loaded ? '' : ' · ✕'}
          </span>,
          <ShowButton selector={image.selector} category="images" label="img" />,
        ])}
      />
    </div>
  );
}
