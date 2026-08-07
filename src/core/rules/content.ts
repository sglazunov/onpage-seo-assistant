import type { AuditRule } from './types';

/** Below this the "thin content" hint fires. Deliberately conservative. */
const MIN_WORDS = 300;
/** Density above which a single term is called out as an outlier. */
const DENSITY_ALERT = 6;
const MIN_TEXT_HTML_RATIO = 5;

export const contentRules: AuditRule[] = [
  {
    id: 'CNT-001',
    category: 'content',
    severity: 'warning',
    run: (ctx) =>
      ctx.page.content.words < MIN_WORDS
        ? { selector: 'body', params: { n: ctx.page.content.words } }
        : null,
  },
  {
    id: 'CNT-002',
    category: 'content',
    severity: 'warning',
    run: (ctx) =>
      ctx.page.content.hiddenTextBlocks > 0
        ? { selector: 'body', params: { n: ctx.page.content.hiddenTextBlocks } }
        : null,
  },
  {
    id: 'CNT-003',
    category: 'content',
    severity: 'warning',
    applicable: (ctx) => ctx.page.content.words >= 100,
    run: (ctx) => {
      const top = ctx.page.content.unigrams[0];
      if (!top || top.density < DENSITY_ALERT) return null;
      return {
        selector: 'body',
        value: top.term,
        params: { term: top.term, n: top.count, density: top.density },
      };
    },
  },
  {
    id: 'CNT-004',
    category: 'content',
    severity: 'info',
    applicable: (ctx) => ctx.page.htmlSize > 0 && ctx.page.content.words > 0,
    run: (ctx) =>
      ctx.page.content.textToHtmlRatio < MIN_TEXT_HTML_RATIO
        ? { selector: 'body', params: { ratio: ctx.page.content.textToHtmlRatio } }
        : null,
  },
  {
    id: 'CNT-005',
    category: 'content',
    severity: 'info',
    applicable: (ctx) => ctx.page.content.words > 50,
    run: (ctx) => (ctx.page.content.paragraphs === 0 ? { selector: 'body' } : null),
  },
];
