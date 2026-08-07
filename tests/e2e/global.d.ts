import type { collectPageData } from '../../src/content/collector';
import type { clearHighlights, highlight, scrollTo } from '../../src/content/highlighter';
import type { runAudit } from '../../src/core/analyzers/audit';
import type { buildExport, summaryText } from '../../src/core/export';

/**
 * The acceptance fixtures expose the very same collector, highlighter, rule
 * engine and exporters the extension ships, driven from a plain page instead of
 * over extension messaging. Nothing here is part of the shipped bundle.
 */
export interface SeoHarness {
  collect: typeof collectPageData;
  audit: (page: ReturnType<typeof collectPageData>) => ReturnType<typeof runAudit>;
  highlight: typeof highlight;
  scrollTo: typeof scrollTo;
  clearHighlights: typeof clearHighlights;
  buildExport?: typeof buildExport;
  summaryText?: typeof summaryText;
}

declare global {
  interface Window {
    __seoHarness: SeoHarness;
  }
}
