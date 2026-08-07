import { useState } from 'react';
import type { AuditResult } from '../../shared/types';
import type { RobotsInfo } from '../../shared/messages';
import { useI18n } from '../i18n-context';
import { api, requestHostPermission } from '../api';
import { DataTable, StatGrid } from '../components/ui';

function yesNo(value: boolean, yes: string, no: string) {
  return (
    <span className={value ? 'status status--ok' : 'status status--bad'}>{value ? yes : no}</span>
  );
}

export function TechnicalTab({
  result,
  network,
  onNetwork,
}: {
  result: AuditResult;
  network: RobotsInfo | null;
  onNetwork: (info: RobotsInfo) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const page = result.page;
  const resources = page.resources;

  const runNetworkChecks = async () => {
    const granted = await requestHostPermission();
    if (!granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setBusy(true);
    try {
      const origin = new URL(page.finalUrl).origin;
      onNetwork(await api.checkRobots(origin, page.finalUrl));
    } catch {
      /* the button stays available for a retry */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pane">
      <StatGrid
        stats={[
          {
            label: t('ui.technical.https'),
            value: yesNo(page.protocol === 'https:', t('ui.yes'), t('ui.no')),
          },
          { label: t('ui.technical.domNodes'), value: page.domNodes.toLocaleString() },
          {
            label: t('ui.technical.htmlSize'),
            value: `${Math.round(page.htmlSize / 1024)} KB`,
          },
          { label: t('ui.technical.scripts'), value: resources.scripts },
          { label: t('ui.technical.styles'), value: resources.stylesheets },
          { label: t('ui.technical.iframes'), value: page.iframes },
        ]}
      />

      <DataTable
        headers={['', t('ui.value')]}
        rows={[
          [
            t('ui.technical.scripts'),
            `${resources.scripts} · ${resources.scriptsAsync} ${t('ui.technical.async')} · ${resources.scriptsDefer} ${t('ui.technical.defer')} · ${resources.scriptsBlocking} ${t('ui.technical.blocking')}`,
          ],
          [
            t('ui.technical.mixedContent'),
            resources.mixedContent.length ? (
              <span className="status status--bad">{resources.mixedContent.length}</span>
            ) : (
              <span className="status status--ok">0</span>
            ),
          ],
          [
            t('ui.technical.jsErrors'),
            resources.jsErrors.length ? (
              <span className="clamp-2">{resources.jsErrors.join(' | ')}</span>
            ) : (
              <span className="status status--ok">0</span>
            ),
          ],
          [t('ui.meta.charset'), page.charset ?? <span className="muted">{t('ui.none')}</span>],
        ]}
      />

      {page.iframes > 0 ? <p className="muted small">{t('ui.technical.iframeNote')}</p> : null}

      <h2 className="pane__title">{t('ui.technical.runNetworkChecks')}</h2>
      <p className="muted small">{t('ui.technical.networkNote')}</p>
      <div className="toolbar">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={runNetworkChecks}
          disabled={busy}
        >
          {busy ? t('ui.analyzing') : t('ui.technical.runNetworkChecks')}
        </button>
      </div>
      {denied ? <p className="notice notice--warning">{t('ui.errorsUi.noPermission')}</p> : null}

      {network ? (
        <DataTable
          headers={['', t('ui.value')]}
          rows={[
            [t('ui.technical.httpStatus'), network.httpStatus ?? '—'],
            [
              t('ui.technical.robotsTxt'),
              network.robotsTxtFound ? (
                <a href={network.robotsTxtUrl} target="_blank" rel="noreferrer">
                  {network.robotsTxtUrl}
                </a>
              ) : (
                <span className="status status--bad">404</span>
              ),
            ],
            [
              'Disallow',
              network.blockedBy.length ? (
                <span className="status status--bad">{network.blockedBy.join(', ')}</span>
              ) : (
                <span className="status status--ok">—</span>
              ),
            ],
            [
              t('ui.technical.sitemap'),
              network.sitemapUrls.length ? (
                <span className="wrap-any">{network.sitemapUrls.join(', ')}</span>
              ) : (
                <span className="status status--bad">—</span>
              ),
            ],
            [
              t('ui.technical.xRobots'),
              network.xRobotsTag ?? <span className="muted">{t('ui.none')}</span>,
            ],
            [
              t('ui.technical.redirects'),
              network.redirectChain.length > 1 ? (
                <span className="wrap-any">{network.redirectChain.join(' → ')}</span>
              ) : (
                '—'
              ),
            ],
          ]}
        />
      ) : null}
    </div>
  );
}
