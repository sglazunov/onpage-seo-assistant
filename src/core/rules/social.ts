import type { AuditRule } from './types';
import { sameUrl } from './meta';

function missingOg(key: string, id: string, severity: 'warning' | 'info'): AuditRule {
  return {
    id,
    category: 'social',
    severity,
    // Suppressed when Open Graph is absent altogether — SOC-007 covers that case.
    applicable: (ctx) => ctx.meta.hasAnyOpenGraph(),
    run: (ctx) => {
      const value = ctx.meta.social(key);
      return value && value.trim() ? null : { selector: 'head', value: key };
    },
  };
}

export const socialRules: AuditRule[] = [
  {
    id: 'SOC-007',
    category: 'social',
    severity: 'warning',
    run: (ctx) => (ctx.meta.hasAnyOpenGraph() ? null : { selector: 'head' }),
  },
  missingOg('og:title', 'SOC-001', 'warning'),
  missingOg('og:description', 'SOC-002', 'warning'),
  missingOg('og:image', 'SOC-003', 'warning'),
  missingOg('og:url', 'SOC-004', 'info'),
  missingOg('og:type', 'SOC-005', 'info'),
  {
    id: 'SOC-006',
    category: 'social',
    severity: 'info',
    run: (ctx) => {
      const card = ctx.meta.social('twitter:card');
      return card && card.trim() ? null : { selector: 'head' };
    },
  },
  {
    id: 'SOC-008',
    category: 'social',
    severity: 'info',
    applicable: (ctx) => Boolean(ctx.meta.social('og:url') && ctx.page.canonicalResolved),
    run: (ctx) =>
      sameUrl(ctx.meta.social('og:url'), ctx.page.canonicalResolved)
        ? null
        : {
            selector: 'head',
            value: `og:url ${ctx.meta.social('og:url')} ≠ canonical ${ctx.page.canonicalResolved}`,
          },
  },
];
