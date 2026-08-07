import type { AuditRule } from './types';
import { len } from './types';

const LANG_CODE = /^[a-z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Compares URLs ignoring the trailing slash, the hash and the default port. */
export function sameUrl(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (raw: string) => {
    try {
      const u = new URL(raw);
      u.hash = '';
      const path = u.pathname.replace(/\/+$/, '');
      return `${u.protocol}//${u.host}${path}${u.search}`.toLowerCase();
    } catch {
      return raw.replace(/\/+$/, '').toLowerCase();
    }
  };
  return norm(a) === norm(b);
}

export const metaRules: AuditRule[] = [
  {
    id: 'META-001',
    category: 'meta',
    severity: 'error',
    run: (ctx) => (ctx.page.title === null ? { selector: 'head' } : null),
  },
  {
    id: 'META-002',
    category: 'meta',
    severity: 'error',
    applicable: (ctx) => ctx.page.title !== null,
    run: (ctx) => (ctx.page.title!.trim() === '' ? { selector: 'title' } : null),
  },
  {
    id: 'META-003',
    category: 'meta',
    severity: 'warning',
    applicable: (ctx) => len(ctx.page.title) > 0,
    run: (ctx) => {
      const l = len(ctx.page.title);
      return l > ctx.thresholds.titleMax
        ? {
            selector: 'title',
            value: ctx.page.title!,
            params: { n: l, max: ctx.thresholds.titleMax },
          }
        : null;
    },
  },
  {
    id: 'META-004',
    category: 'meta',
    severity: 'warning',
    applicable: (ctx) => len(ctx.page.title) > 0,
    run: (ctx) => {
      const l = len(ctx.page.title);
      return l < ctx.thresholds.titleMin
        ? {
            selector: 'title',
            value: ctx.page.title!,
            params: { n: l, min: ctx.thresholds.titleMin, max: ctx.thresholds.titleMax },
          }
        : null;
    },
  },
  {
    id: 'META-005',
    category: 'meta',
    severity: 'error',
    run: (ctx) =>
      ctx.meta.name('description') === null
        ? {
            selector: 'head',
            params: {
              min: ctx.thresholds.descriptionMin,
              max: ctx.thresholds.descriptionMax,
            },
          }
        : null,
  },
  {
    id: 'META-006',
    category: 'meta',
    severity: 'error',
    applicable: (ctx) => ctx.meta.name('description') !== null,
    run: (ctx) =>
      ctx.meta.name('description')!.trim() === ''
        ? { selector: 'meta[name="description"]' }
        : null,
  },
  {
    id: 'META-007',
    category: 'meta',
    severity: 'warning',
    applicable: (ctx) => len(ctx.meta.name('description')) > 0,
    run: (ctx) => {
      const d = ctx.meta.name('description')!;
      const l = len(d);
      return l > ctx.thresholds.descriptionMax
        ? {
            selector: 'meta[name="description"]',
            value: d,
            params: { n: l, max: ctx.thresholds.descriptionMax },
          }
        : null;
    },
  },
  {
    id: 'META-015',
    category: 'meta',
    severity: 'warning',
    applicable: (ctx) => len(ctx.meta.name('description')) > 0,
    run: (ctx) => {
      const d = ctx.meta.name('description')!;
      const l = len(d);
      return l < ctx.thresholds.descriptionMin
        ? {
            selector: 'meta[name="description"]',
            value: d,
            params: {
              n: l,
              min: ctx.thresholds.descriptionMin,
              max: ctx.thresholds.descriptionMax,
            },
          }
        : null;
    },
  },
  {
    id: 'META-016',
    category: 'meta',
    severity: 'warning',
    run: (ctx) =>
      ctx.page.titleCount && ctx.page.titleCount > 1
        ? { selector: 'title', params: { n: ctx.page.titleCount } }
        : null,
  },
  {
    id: 'META-017',
    category: 'meta',
    severity: 'info',
    run: (ctx) => {
      const k = ctx.meta.name('keywords');
      return k && k.trim() ? { selector: 'meta[name="keywords"]', value: k } : null;
    },
  },
  {
    id: 'META-008',
    category: 'canonical',
    severity: 'warning',
    run: (ctx) => (ctx.page.canonical === null ? { selector: 'head' } : null),
  },
  {
    id: 'META-009',
    category: 'canonical',
    severity: 'warning',
    applicable: (ctx) => ctx.page.canonicalResolved !== null,
    run: (ctx) =>
      sameUrl(ctx.page.canonicalResolved, ctx.page.finalUrl)
        ? null
        : { selector: 'link[rel="canonical"]', value: ctx.page.canonicalResolved! },
  },
  {
    id: 'META-018',
    category: 'canonical',
    severity: 'warning',
    run: (ctx) =>
      ctx.page.canonicalCount && ctx.page.canonicalCount > 1
        ? { selector: 'link[rel="canonical"]', params: { n: ctx.page.canonicalCount } }
        : null,
  },
  {
    id: 'META-019',
    category: 'canonical',
    severity: 'info',
    applicable: (ctx) => ctx.page.canonical !== null,
    run: (ctx) =>
      isAbsolute(ctx.page.canonical!)
        ? null
        : { selector: 'link[rel="canonical"]', value: ctx.page.canonical! },
  },
  {
    id: 'META-020',
    category: 'canonical',
    severity: 'warning',
    applicable: (ctx) => ctx.page.hreflang.length > 0,
    run: (ctx) =>
      ctx.page.hreflang.some((h) => sameUrl(h.href, ctx.page.finalUrl))
        ? null
        : { selector: 'link[rel="alternate"]', params: { n: ctx.page.hreflang.length } },
  },
  {
    id: 'META-021',
    category: 'canonical',
    severity: 'warning',
    applicable: (ctx) => ctx.page.hreflang.length > 0,
    run: (ctx) => {
      const bad = ctx.page.hreflang.filter(
        (h) => h.lang !== 'x-default' && !LANG_CODE.test(h.lang),
      );
      return bad.length
        ? {
            selector: 'link[rel="alternate"]',
            value: bad.map((b) => b.lang).join(', '),
            count: bad.length,
            params: { n: bad.length },
          }
        : null;
    },
  },
  {
    id: 'META-022',
    category: 'canonical',
    severity: 'info',
    applicable: (ctx) => ctx.page.hreflang.length > 1,
    run: (ctx) =>
      ctx.page.hreflang.some((h) => h.lang.toLowerCase() === 'x-default')
        ? null
        : { selector: 'link[rel="alternate"]' },
  },
  {
    id: 'META-010',
    category: 'technical',
    severity: 'warning',
    run: (ctx) => (ctx.meta.name('viewport') === null ? { selector: 'head' } : null),
  },
  {
    id: 'META-011',
    category: 'meta',
    severity: 'warning',
    run: (ctx) => {
      const lang = ctx.page.htmlLang;
      return lang && lang.trim() ? null : { selector: 'html' };
    },
  },
  {
    id: 'META-012',
    category: 'indexing',
    severity: 'warning',
    run: (ctx) => {
      const d = ctx.meta.robotsDirectives();
      return d.includes('noindex') || d.includes('none')
        ? { selector: 'meta[name="robots"]', value: d.join(', ') }
        : null;
    },
  },
  {
    id: 'META-013',
    category: 'indexing',
    severity: 'info',
    run: (ctx) => {
      const d = ctx.meta.robotsDirectives();
      return d.includes('nofollow') || d.includes('none')
        ? { selector: 'meta[name="robots"]', value: d.join(', ') }
        : null;
    },
  },
  {
    id: 'META-014',
    category: 'technical',
    severity: 'info',
    run: (ctx) => (ctx.page.favicons.length === 0 ? { selector: 'head' } : null),
  },
];
