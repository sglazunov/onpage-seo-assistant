import { collectPageData } from '../../../src/content/collector';
import { clearHighlights, highlight, scrollTo } from '../../../src/content/highlighter';
import { runAudit } from '../../../src/core/analyzers/audit';
import { buildExport, summaryText } from '../../../src/core/export';

// Adds bulk content that would be unreadable inline: 1200 headings and a
// cookie/localStorage footprint the collector must not touch.
const bulk = document.createElement('div');
bulk.id = 'bulk';
for (let i = 0; i < 1200; i += 1) {
  const h = document.createElement('h5');
  h.textContent = `Массовый заголовок ${i}`;
  bulk.appendChild(h);
}
document.body.appendChild(bulk);

document.cookie = 'seo_test_cookie=НЕДОЛЖНОПОПАСТЬВОТЧЁТ; path=/';
localStorage.setItem('seo_test_ls', 'НЕДОЛЖНОПОПАСТЬВОТЧЁТLS');

window.__seoHarness = {
  collect: collectPageData,
  audit: (page) => runAudit(page),
  highlight,
  scrollTo,
  clearHighlights,
  buildExport,
  summaryText,
};
