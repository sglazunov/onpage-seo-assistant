import type { AuditRule } from './types';
import { group } from './types';

export const schemaRules: AuditRule[] = [
  {
    id: 'SD-001',
    category: 'schema',
    severity: 'warning',
    run: (ctx) => (ctx.page.structuredData.length === 0 ? { selector: 'head' } : null),
  },
  {
    id: 'SD-002',
    category: 'schema',
    severity: 'error',
    applicable: (ctx) => ctx.page.structuredData.some((b) => b.format === 'json-ld'),
    run: (ctx) =>
      group(
        ctx.page.structuredData
          .filter((b) => b.format === 'json-ld' && b.error)
          .map((b) => ({ selector: b.selector, value: b.error })),
      ),
  },
  {
    id: 'SD-003',
    category: 'schema',
    severity: 'warning',
    applicable: (ctx) => ctx.page.structuredData.some((b) => b.format === 'json-ld' && !b.error),
    run: (ctx) =>
      group(
        ctx.page.structuredData
          .filter(
            (b) =>
              b.format === 'json-ld' &&
              !b.error &&
              !(b.context ?? '').toLowerCase().includes('schema.org'),
          )
          .map((b) => ({ selector: b.selector, value: b.context ?? '—' })),
      ),
  },
  {
    id: 'SD-004',
    category: 'schema',
    severity: 'warning',
    applicable: (ctx) => ctx.page.structuredData.some((b) => b.format === 'json-ld' && !b.error),
    run: (ctx) =>
      group(
        ctx.page.structuredData
          .filter((b) => b.format === 'json-ld' && !b.error && b.types.length === 0)
          .map((b) => ({ selector: b.selector })),
      ),
  },
  {
    id: 'SD-005',
    category: 'schema',
    severity: 'info',
    applicable: (ctx) => ctx.page.structuredData.length > 1,
    run: (ctx) => {
      const counts = new Map<string, number>();
      for (const block of ctx.page.structuredData) {
        for (const type of block.types) counts.set(type, (counts.get(type) ?? 0) + 1);
      }
      const dupes = [...counts.entries()].filter(([, n]) => n > 1);
      return dupes.length
        ? {
            selector: ctx.page.structuredData[0].selector,
            value: dupes.map(([type, n]) => `${type} ×${n}`).join(', '),
            count: dupes.length,
            params: { n: dupes.length },
          }
        : null;
    },
  },
  {
    id: 'SD-006',
    category: 'schema',
    severity: 'info',
    run: (ctx) => {
      const legacy = ctx.page.structuredData.filter((b) => b.format !== 'json-ld');
      return legacy.length
        ? {
            selector: legacy[0].selector,
            value: [...new Set(legacy.map((b) => b.format))].join(', '),
            count: legacy.length,
            params: { n: legacy.length },
          }
        : null;
    },
  },
];
