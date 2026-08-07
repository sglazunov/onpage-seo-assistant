import type { AuditRule } from './types';

const LARGE_DOM = 1500;

export const technicalRules: AuditRule[] = [
  {
    id: 'TECH-001',
    category: 'technical',
    severity: 'warning',
    // localhost and file:// are development contexts, not deployment mistakes.
    applicable: (ctx) =>
      ctx.page.protocol.startsWith('http') &&
      !['localhost', '127.0.0.1', '::1'].includes(ctx.page.hostname),
    run: (ctx) =>
      ctx.page.protocol === 'https:'
        ? null
        : { selector: 'html', params: { protocol: ctx.page.protocol } },
  },
  {
    id: 'TECH-002',
    category: 'technical',
    severity: 'error',
    applicable: (ctx) => ctx.page.protocol === 'https:',
    run: (ctx) =>
      ctx.page.resources.mixedContent.length
        ? {
            selector: 'html',
            value: ctx.page.resources.mixedContent.slice(0, 5).join(', '),
            count: ctx.page.resources.mixedContent.length,
            params: { n: ctx.page.resources.mixedContent.length },
          }
        : null,
  },
  {
    id: 'TECH-003',
    category: 'technical',
    severity: 'warning',
    run: (ctx) => (ctx.page.charset ? null : { selector: 'head' }),
  },
  {
    id: 'TECH-004',
    category: 'technical',
    severity: 'info',
    run: (ctx) =>
      ctx.page.domNodes > LARGE_DOM
        ? { selector: 'body', params: { n: ctx.page.domNodes } }
        : null,
  },
  {
    id: 'TECH-005',
    category: 'technical',
    severity: 'info',
    applicable: (ctx) => ctx.page.resources.scripts > 0,
    run: (ctx) =>
      ctx.page.resources.scriptsBlocking > 0
        ? { selector: 'head', params: { n: ctx.page.resources.scriptsBlocking } }
        : null,
  },
  {
    id: 'TECH-006',
    category: 'technical',
    severity: 'info',
    run: (ctx) =>
      ctx.page.resources.jsErrors.length
        ? {
            selector: 'html',
            value: ctx.page.resources.jsErrors.slice(0, 3).join(' | '),
            count: ctx.page.resources.jsErrors.length,
            params: { n: ctx.page.resources.jsErrors.length },
          }
        : null,
  },
  {
    id: 'TECH-007',
    category: 'technical',
    severity: 'info',
    run: (ctx) =>
      ctx.page.iframes > 0 ? { selector: 'iframe', params: { n: ctx.page.iframes } } : null,
  },

  /* Network pass — these only run once RobotsInfo has been fetched. */
  {
    id: 'TECH-008',
    category: 'indexing',
    severity: 'error',
    applicable: (ctx) => ctx.network !== null,
    run: (ctx) =>
      ctx.network!.blockedBy.length
        ? { selector: 'html', params: { rule: ctx.network!.blockedBy[0] } }
        : null,
  },
  {
    id: 'TECH-009',
    category: 'indexing',
    severity: 'error',
    applicable: (ctx) => ctx.network !== null && ctx.network.xRobotsTag !== null,
    run: (ctx) =>
      /noindex|none/i.test(ctx.network!.xRobotsTag ?? '')
        ? { selector: 'html', params: { value: ctx.network!.xRobotsTag ?? '' } }
        : null,
  },
  {
    id: 'TECH-010',
    category: 'indexing',
    severity: 'info',
    applicable: (ctx) => ctx.network !== null,
    run: (ctx) =>
      ctx.network!.sitemapUrls.length === 0 && ctx.network!.sitemapReachable === false
        ? { selector: 'html' }
        : null,
  },
  {
    id: 'TECH-011',
    category: 'technical',
    severity: 'info',
    applicable: (ctx) => ctx.network !== null,
    run: (ctx) =>
      ctx.network!.redirectChain.length > 1
        ? {
            selector: 'html',
            value: ctx.network!.redirectChain.join(' → '),
            params: { n: ctx.network!.redirectChain.length - 1 },
          }
        : null,
  },
  {
    id: 'TECH-012',
    category: 'indexing',
    severity: 'info',
    applicable: (ctx) => ctx.network !== null,
    run: (ctx) => (ctx.network!.robotsTxtFound ? null : { selector: 'html' }),
  },
];
