import { describe, expect, it } from 'vitest';
import { runAudit } from '../../src/core/analyzers/audit';
import type { AuditResult } from '../../src/shared/types';
import { makeHeading, makeImage, makeLink, makePage } from '../fixtures/page';

const NOW = 1_700_000_000_000;

function audit(page = makePage()): AuditResult {
  return runAudit(page, { now: NOW });
}

function ids(result: AuditResult): string[] {
  return result.issues.map((i) => i.id);
}

function issue(result: AuditResult, id: string) {
  return result.issues.find((i) => i.id === id);
}

describe('TC-001 — page with complete metadata', () => {
  it('reports no errors and no warnings', () => {
    const result = audit();
    expect(result.score.errors).toBe(0);
    expect(result.score.warnings).toBe(0);
    expect(result.score.overall).toBe(100);
  });

  it('lists the base checks as passed', () => {
    const result = audit();
    expect(result.passed.map((p) => p.id)).toContain('META-001');
    expect(result.passed.map((p) => p.id)).toContain('HEAD-001');
  });
});

describe('TC-002..TC-005 — meta and heading rules', () => {
  it('TC-002: missing title raises META-001 as an error', () => {
    const result = audit(makePage({ title: null, titleCount: 0 }));
    expect(ids(result)).toContain('META-001');
    expect(issue(result, 'META-001')?.severity).toBe('error');
  });

  it('an empty title raises META-002, not META-001', () => {
    const result = audit(makePage({ title: '   ' }));
    expect(ids(result)).toContain('META-002');
    expect(ids(result)).not.toContain('META-001');
  });

  it('TC-003: missing description raises META-005 as an error', () => {
    const result = audit(makePage({ metas: [] }));
    expect(issue(result, 'META-005')?.severity).toBe('error');
  });

  it('TC-004: missing H1 raises HEAD-001 as an error', () => {
    const result = audit(makePage({ headings: [makeHeading(2, 'Только H2')] }));
    expect(issue(result, 'HEAD-001')?.severity).toBe('error');
  });

  it('TC-005: two H1 raise HEAD-003 as a warning, never an error', () => {
    const result = audit(
      makePage({
        headings: [
          makeHeading(1, 'Первый'),
          makeHeading(1, 'Второй', { selector: 'h1:nth-of-type(2)', index: 1 }),
        ],
      }),
    );
    expect(issue(result, 'HEAD-003')?.severity).toBe('warning');
    expect(issue(result, 'HEAD-003')?.count).toBe(2);
  });

  it('a skipped heading level raises HEAD-006', () => {
    const result = audit(
      makePage({
        headings: [makeHeading(1, 'H1'), makeHeading(4, 'H4', { selector: 'h4', index: 1 })],
      }),
    );
    expect(ids(result)).toContain('HEAD-006');
  });

  it('title length rules use the configured thresholds', () => {
    const page = makePage({ title: 'Короткий' });
    expect(ids(runAudit(page, { now: NOW }))).toContain('META-004');
    expect(ids(runAudit(page, { now: NOW, settings: { thresholds: { titleMin: 3 } as never } })))
      .not.toContain('META-004');
  });
});

describe('TC-006 — images', () => {
  it('a missing alt attribute raises IMG-001', () => {
    const result = audit(makePage({ images: [makeImage({ alt: null })] }));
    expect(issue(result, 'IMG-001')?.severity).toBe('warning');
  });

  it('distinguishes a missing alt from an intentionally empty one', () => {
    const result = audit(makePage({ images: [makeImage({ alt: '' })] }));
    expect(ids(result)).not.toContain('IMG-001');
    expect(issue(result, 'IMG-002')?.severity).toBe('info');
    expect(issue(result, 'IMG-002')?.scoreImpact).toBe(0);
  });

  it('TC-014: an image that failed to load raises IMG-005 as an error', () => {
    const result = audit(makePage({ images: [makeImage({ loaded: false })] }));
    expect(issue(result, 'IMG-005')?.severity).toBe('error');
  });
});

describe('TC-007..TC-008 — structured data and social', () => {
  it('TC-007: broken JSON-LD raises SD-002 as an error', () => {
    const result = audit(
      makePage({
        structuredData: [
          {
            format: 'json-ld',
            types: [],
            raw: '{"@type":"Product",}',
            error: 'Unexpected token }',
            selector: 'script',
          },
        ],
      }),
    );
    expect(issue(result, 'SD-002')?.severity).toBe('error');
  });

  it('no structured data at all raises SD-001', () => {
    const result = audit(makePage({ structuredData: [] }));
    expect(ids(result)).toContain('SD-001');
  });

  it('TC-008: no Open Graph raises SOC-007 and suppresses the per-tag rules', () => {
    const result = audit(makePage({ metas: [] }));
    expect(issue(result, 'SOC-007')?.severity).toBe('warning');
    expect(ids(result)).not.toContain('SOC-001');
  });
});

describe('TC-009 — indexability', () => {
  it('noindex is surfaced with the directives as the value', () => {
    const result = audit(
      makePage({ metas: [{ key: 'robots', kind: 'name', content: 'noindex, nofollow' }] }),
    );
    expect(issue(result, 'META-012')?.severity).toBe('warning');
    expect(issue(result, 'META-012')?.value).toContain('noindex');
    expect(issue(result, 'META-013')?.severity).toBe('info');
  });

  it('reads directives from googlebot and yandex too', () => {
    const result = audit(
      makePage({ metas: [{ key: 'yandex', kind: 'name', content: 'noindex' }] }),
    );
    expect(ids(result)).toContain('META-012');
  });
});

describe('TC-013 — protocol', () => {
  it('a plain http page raises TECH-001', () => {
    const result = audit(
      makePage({
        protocol: 'http:',
        url: 'http://example.com/page',
        finalUrl: 'http://example.com/page',
        canonical: 'http://example.com/page',
        canonicalResolved: 'http://example.com/page',
      }),
    );
    expect(issue(result, 'TECH-001')?.severity).toBe('warning');
  });

  it('does not flag localhost as an http mistake', () => {
    const result = audit(
      makePage({
        protocol: 'http:',
        hostname: 'localhost',
        url: 'http://localhost:3000/page',
        finalUrl: 'http://localhost:3000/page',
        canonical: 'http://localhost:3000/page',
        canonicalResolved: 'http://localhost:3000/page',
      }),
    );
    expect(ids(result)).not.toContain('TECH-001');
  });
});

describe('canonical comparison', () => {
  it('ignores a trailing slash and the hash', () => {
    const result = audit(
      makePage({ canonicalResolved: 'https://example.com/page/#top', canonical: '/page/' }),
    );
    expect(ids(result)).not.toContain('META-009');
  });

  it('flags a canonical that points somewhere else', () => {
    const result = audit(makePage({ canonicalResolved: 'https://example.com/other' }));
    expect(issue(result, 'META-009')?.severity).toBe('warning');
  });
});

describe('links', () => {
  it('flags target=_blank without noopener', () => {
    const result = audit(
      makePage({ links: [makeLink({ target: '_blank', type: 'external', rel: [] })] }),
    );
    expect(ids(result)).toContain('LINK-006');
  });

  it('accepts noreferrer as sufficient', () => {
    const result = audit(
      makePage({ links: [makeLink({ target: '_blank', rel: ['noreferrer'] })] }),
    );
    expect(ids(result)).not.toContain('LINK-006');
  });

  it('groups repeated findings into one issue carrying every selector', () => {
    const result = audit(
      makePage({
        links: [
          makeLink({ href: '', type: 'empty', selector: 'a:nth-of-type(1)' }),
          makeLink({ href: '', type: 'empty', selector: 'a:nth-of-type(2)' }),
        ],
      }),
    );
    const found = issue(result, 'LINK-001');
    expect(found?.count).toBe(2);
    expect(found?.selectors).toEqual(['a:nth-of-type(1)', 'a:nth-of-type(2)']);
  });
});

describe('TC-011/TC-012 — robustness', () => {
  it('survives a completely empty page', () => {
    const empty = makePage({
      title: null,
      titleCount: 0,
      metas: [],
      canonical: null,
      canonicalResolved: null,
      canonicalCount: 0,
      htmlLang: null,
      charset: null,
      favicons: [],
      headings: [],
      links: [],
      images: [],
      structuredData: [],
    });
    const result = audit(empty);
    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.score.errors).toBeGreaterThan(0);
  });

  it('handles 1000 links without an unbounded penalty', () => {
    const links = Array.from({ length: 1000 }, (_, i) =>
      makeLink({ href: '', type: 'empty', selector: `a:nth-of-type(${i + 1})` }),
    );
    const result = audit(makePage({ links }));
    expect(issue(result, 'LINK-001')?.count).toBe(1000);
    expect(issue(result, 'LINK-001')?.scoreImpact).toBeLessThanOrEqual(8);
  });

  it('TC-012: iframes are reported as a known limitation, not an error', () => {
    const result = audit(makePage({ iframes: 3 }));
    expect(issue(result, 'TECH-007')?.severity).toBe('info');
  });
});

describe('muted rules', () => {
  it('drops the score impact and demotes the severity', () => {
    const page = makePage({ title: null, titleCount: 0 });
    const result = runAudit(page, { now: NOW, settings: { mutedRules: ['META-001'] } });
    expect(issue(result, 'META-001')?.severity).toBe('info');
    expect(issue(result, 'META-001')?.scoreImpact).toBe(0);
  });
});
