import type { AuditRule } from './types';
import { group, len } from './types';

export const headingRules: AuditRule[] = [
  {
    id: 'HEAD-001',
    category: 'headings',
    severity: 'error',
    run: (ctx) => (ctx.page.headings.some((h) => h.level === 1) ? null : { selector: 'body' }),
  },
  {
    id: 'HEAD-002',
    category: 'headings',
    severity: 'error',
    applicable: (ctx) => ctx.page.headings.some((h) => h.level === 1),
    run: (ctx) => {
      const h1s = ctx.page.headings.filter((h) => h.level === 1);
      // Only an error when every H1 is empty; a page with one filled H1 is fine.
      return h1s.every((h) => h.text.trim() === '') ? { selector: h1s[0].selector } : null;
    },
  },
  {
    id: 'HEAD-003',
    category: 'headings',
    severity: 'warning',
    run: (ctx) => {
      const h1s = ctx.page.headings.filter((h) => h.level === 1);
      return h1s.length > 1
        ? {
            count: h1s.length,
            selector: h1s[0].selector,
            selectors: h1s.map((h) => h.selector),
            value: h1s.map((h) => h.text || '—').join(' | '),
            params: { n: h1s.length },
          }
        : null;
    },
  },
  {
    id: 'HEAD-004',
    category: 'headings',
    severity: 'warning',
    applicable: (ctx) => ctx.page.headings.some((h) => h.level === 1 && h.text.trim() !== ''),
    run: (ctx) => {
      const long = ctx.page.headings.filter(
        (h) => h.level === 1 && len(h.text) > ctx.thresholds.h1Max,
      );
      return group(
        long.map((h) => ({
          selector: h.selector,
          value: h.text,
          params: { max: ctx.thresholds.h1Max },
        })),
      );
    },
  },
  {
    id: 'HEAD-005',
    category: 'headings',
    severity: 'warning',
    applicable: (ctx) => ctx.page.headings.length > 0,
    run: (ctx) => {
      const empty = ctx.page.headings.filter((h) => h.text.trim() === '');
      return group(empty.map((h) => ({ selector: h.selector, value: `H${h.level}` })));
    },
  },
  {
    id: 'HEAD-006',
    category: 'headings',
    severity: 'warning',
    applicable: (ctx) => ctx.page.headings.length > 1,
    run: (ctx) => {
      const skips: { selector: string; value: string }[] = [];
      let previous = 0;
      for (const h of ctx.page.headings) {
        if (previous !== 0 && h.level > previous + 1) {
          skips.push({ selector: h.selector, value: `H${previous} → H${h.level}` });
        }
        previous = h.level;
      }
      return group(skips.map((s) => ({ selector: s.selector, value: s.value })));
    },
  },
  {
    id: 'HEAD-007',
    category: 'headings',
    severity: 'warning',
    applicable: (ctx) => ctx.page.headings.length > 1,
    run: (ctx) => {
      const seen = new Map<string, string[]>();
      for (const h of ctx.page.headings) {
        const key = `${h.level}|${h.text.trim().toLowerCase()}`;
        if (!h.text.trim()) continue;
        const list = seen.get(key);
        if (list) list.push(h.selector);
        else seen.set(key, [h.selector]);
      }
      const dupes = [...seen.entries()].filter(([, sels]) => sels.length > 1);
      return dupes.length
        ? {
            count: dupes.length,
            selector: dupes[0][1][0],
            selectors: dupes.flatMap(([, sels]) => sels),
            value: dupes.map(([key]) => key.split('|')[1]).join(' | '),
            params: { n: dupes.length },
          }
        : null;
    },
  },
  {
    id: 'HEAD-008',
    category: 'headings',
    severity: 'info',
    applicable: (ctx) => ctx.page.headings.length > 0,
    run: (ctx) => {
      const hidden = ctx.page.headings.filter((h) => !h.visible && h.text.trim() !== '');
      return group(hidden.map((h) => ({ selector: h.selector, value: `H${h.level}: ${h.text}` })));
    },
  },
  {
    id: 'HEAD-009',
    category: 'headings',
    severity: 'info',
    applicable: (ctx) =>
      !!ctx.page.title?.trim() && ctx.page.headings.some((h) => h.level === 1 && h.text.trim()),
    run: (ctx) => {
      const h1 = ctx.page.headings.find((h) => h.level === 1 && h.text.trim());
      return h1 && h1.text.trim().toLowerCase() === ctx.page.title!.trim().toLowerCase()
        ? { selector: h1.selector, value: h1.text }
        : null;
    },
  },
  {
    id: 'HEAD-010',
    category: 'headings',
    severity: 'info',
    applicable: (ctx) => ctx.page.content.words > 300,
    run: (ctx) => (ctx.page.headings.some((h) => h.level === 2) ? null : { selector: 'body' }),
  },
];
