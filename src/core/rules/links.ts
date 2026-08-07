import type { AuditRule } from './types';
import { group, len } from './types';

export const linkRules: AuditRule[] = [
  {
    id: 'LINK-001',
    category: 'links',
    severity: 'warning',
    applicable: (ctx) => ctx.page.links.length > 0,
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => l.type === 'empty')
          .map((l) => ({ selector: l.selector, value: l.text || '—' })),
      ),
  },
  {
    id: 'LINK-002',
    category: 'links',
    severity: 'info',
    applicable: (ctx) => ctx.page.links.length > 0,
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => l.href.trim() === '#')
          .map((l) => ({ selector: l.selector, value: l.text || '—' })),
      ),
  },
  {
    id: 'LINK-003',
    category: 'links',
    severity: 'warning',
    applicable: (ctx) => ctx.page.links.length > 0,
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => l.type === 'javascript')
          .map((l) => ({ selector: l.selector, value: l.href })),
      ),
  },
  {
    id: 'LINK-004',
    category: 'links',
    severity: 'warning',
    applicable: (ctx) => ctx.page.links.length > 0,
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => !l.text.trim() && !l.imageOnly && l.type !== 'empty')
          .map((l) => ({ selector: l.selector, value: l.resolved })),
      ),
  },
  {
    id: 'LINK-005',
    category: 'links',
    severity: 'warning',
    applicable: (ctx) => ctx.page.links.some((l) => l.imageOnly),
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => l.imageOnly && !l.text.trim() && !l.imageAlt?.trim())
          .map((l) => ({ selector: l.selector, value: l.resolved })),
      ),
  },
  {
    id: 'LINK-006',
    category: 'links',
    severity: 'warning',
    applicable: (ctx) => ctx.page.links.some((l) => l.target === '_blank'),
    run: (ctx) =>
      group(
        ctx.page.links
          .filter(
            (l) =>
              l.target === '_blank' &&
              !l.rel.includes('noopener') &&
              !l.rel.includes('noreferrer'),
          )
          .map((l) => ({ selector: l.selector, value: l.resolved })),
      ),
  },
  {
    id: 'LINK-007',
    category: 'links',
    severity: 'info',
    applicable: (ctx) => ctx.page.links.some((l) => l.type === 'internal'),
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => l.type === 'internal' && l.nofollow)
          .map((l) => ({ selector: l.selector, value: l.resolved })),
      ),
  },
  {
    id: 'LINK-008',
    category: 'links',
    severity: 'info',
    applicable: (ctx) => ctx.page.links.length > 1,
    run: (ctx) => {
      const anchorsByUrl = new Map<string, Set<string>>();
      const selectorByUrl = new Map<string, string>();
      for (const l of ctx.page.links) {
        if (l.type !== 'internal' && l.type !== 'external') continue;
        const text = l.text.trim().toLowerCase();
        if (!text) continue;
        const set = anchorsByUrl.get(l.resolved);
        if (set) set.add(text);
        else {
          anchorsByUrl.set(l.resolved, new Set([text]));
          selectorByUrl.set(l.resolved, l.selector);
        }
      }
      const conflicting = [...anchorsByUrl.entries()].filter(([, set]) => set.size > 1);
      return conflicting.length
        ? {
            count: conflicting.length,
            selector: selectorByUrl.get(conflicting[0][0]),
            selectors: conflicting
              .map(([url]) => selectorByUrl.get(url))
              .filter((s): s is string => Boolean(s)),
            value: conflicting[0][0],
            params: { n: conflicting.length },
          }
        : null;
    },
  },
  {
    id: 'LINK-009',
    category: 'links',
    severity: 'warning',
    applicable: (ctx) => ctx.page.protocol === 'https:',
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => l.resolved.startsWith('http://'))
          .map((l) => ({ selector: l.selector, value: l.resolved })),
      ),
  },
  {
    id: 'LINK-012',
    category: 'links',
    severity: 'info',
    applicable: (ctx) => ctx.page.links.length > 0,
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => len(l.text) > ctx.thresholds.anchorMax)
          .map((l) => ({
            selector: l.selector,
            value: l.text,
            params: { max: ctx.thresholds.anchorMax },
          })),
      ),
  },
  /* Network-dependent — only fire once the user ran the HTTP status pass. */
  {
    id: 'LINK-010',
    category: 'links',
    severity: 'error',
    applicable: (ctx) => ctx.page.links.some((l) => typeof l.status === 'number'),
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => typeof l.status === 'number' && l.status >= 400)
          .map((l) => ({ selector: l.selector, value: `${l.status} — ${l.resolved}` })),
      ),
  },
  {
    id: 'LINK-011',
    category: 'links',
    severity: 'info',
    applicable: (ctx) => ctx.page.links.some((l) => typeof l.status === 'number'),
    run: (ctx) =>
      group(
        ctx.page.links
          .filter((l) => Boolean(l.redirectedTo))
          .map((l) => ({ selector: l.selector, value: `${l.resolved} → ${l.redirectedTo}` })),
      ),
  },
];
