import { describe, expect, it } from 'vitest';
import { runAudit } from '../../src/core/analyzers/audit';
import {
  buildExport,
  buildFilename,
  exportImagesCsv,
  exportJson,
  exportLinksCsv,
  summaryText,
} from '../../src/core/export';
import { makeImage, makePage } from '../fixtures/page';

const NOW = Date.UTC(2026, 7, 7, 12, 0, 0);
const result = runAudit(makePage({ images: [makeImage({ alt: null })] }), { now: NOW });

describe('filenames', () => {
  it('follows the seo-audit-<host>-<date>.<ext> pattern', () => {
    expect(buildFilename(result, 'json')).toMatch(/^seo-audit-example\.com-2026-08-07\.json$/);
  });
});

describe('TC-015 — JSON export', () => {
  it('contains the full AuditResult and round-trips', () => {
    const file = exportJson(result);
    const parsed = JSON.parse(file.content);
    expect(parsed.score.overall).toBe(result.score.overall);
    expect(parsed.page.images).toHaveLength(1);
    expect(parsed.issues.length).toBe(result.issues.length);
    expect(file.mime).toContain('application/json');
  });
});

describe('CSV exports', () => {
  it('escapes separators and quotes', () => {
    const withComma = runAudit(
      makePage({ title: 'Заголовок; с "кавычками"' }),
      { now: NOW },
    );
    const csv = buildExport(withComma, 'csv').content;
    expect(csv.split('\r\n')[0]).toContain('ID;Category;Severity');
    expect(csv).not.toMatch(/\n[^"]*Заголовок; с/);
  });

  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(exportLinksCsv(result).content.charCodeAt(0)).toBe(0xfeff);
  });

  it('marks a missing alt attribute distinctly from an empty one', () => {
    const csv = exportImagesCsv(result).content;
    expect(csv).toContain('[no alt attribute]');
  });
});

describe('HTML and Markdown exports', () => {
  it('escapes HTML so page content cannot inject markup into the report', () => {
    const hostile = runAudit(makePage({ title: '<script>alert(1)</script>' }), { now: NOW });
    const html = buildExport(hostile, 'html').content;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the score disclaimer in every human-readable format', () => {
    expect(buildExport(result, 'html').content).toContain('диагностическая оценка');
    expect(buildExport(result, 'markdown').content).toContain('диагностическая оценка');
    expect(summaryText(result)).toContain('диагностическая оценка');
  });

  it('renders the heading outline in Markdown', () => {
    expect(buildExport(result, 'markdown').content).toContain('- H1: Ноутбуки в Екатеринбурге');
  });

  it('keeps every Markdown table rectangular even when values contain a pipe', () => {
    const hostile = runAudit(
      makePage({ title: 'Ноутбук | дёшево | Екатеринбург', htmlLang: 'ru|RU' }),
      { now: NOW },
    );
    const md = buildExport(hostile, 'markdown').content;

    // Group consecutive "|" lines into tables and check each one separately.
    let current: string[] = [];
    const tables: string[][] = [];
    for (const line of md.split('\n')) {
      if (line.startsWith('|')) current.push(line);
      else if (current.length) {
        tables.push(current);
        current = [];
      }
    }
    if (current.length) tables.push(current);

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      // A escaped pipe (\|) must not count as a column separator.
      const widths = new Set(table.map((row) => row.replace(/\\\|/g, '').split('|').length));
      expect(widths.size).toBe(1);
    }
  });

  it('HTML report is self-contained: no external resource is loaded', () => {
    const html = buildExport(result, 'html').content;
    // Anchors are fine — they are not fetched. Anything that loads is not.
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(html).not.toMatch(/<img[\s>]/i);
    expect(html).not.toMatch(/url\(\s*https?:/i);
    expect(html).not.toMatch(/@import/i);
  });

  it('keeps Cyrillic intact in every format', () => {
    // CSV carries only the issue table, so assert on Cyrillic in general
    // rather than on a string that lives in the page metadata.
    for (const format of ['json', 'csv', 'markdown', 'html'] as const) {
      expect(buildExport(result, format).content).toMatch(/[А-Яа-яЁё]{4,}/);
    }
    expect(buildExport(result, 'json').content).toContain('Екатеринбурге');
  });
});

describe('filename safety', () => {
  // Reserved on Windows (plus space, which breaks naive shell handling).
  const FORBIDDEN_WINDOWS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', ' '];

  it.each([
    'https://пример.рф/путь?q=1&x=<script>',
    'https://example.com:8443/a/b/c?d=e#f',
    'https://sub.domain.example.co.uk/very/deep/path',
    'http://127.0.0.1:3000/page',
  ])('produces a Windows-safe name for %s', (url) => {
    const audited = runAudit(makePage({ url, finalUrl: url }), { now: NOW });
    for (const format of ['json', 'csv', 'markdown', 'html'] as const) {
      const name = buildExport(audited, format).filename;
      for (const char of FORBIDDEN_WINDOWS) expect(name).not.toContain(char);
      expect([...name].every((c) => c.codePointAt(0)! >= 0x20)).toBe(true);
      expect(name.length).toBeLessThan(120);
    }
  });

  it('falls back to a stable name when the URL cannot be parsed', () => {
    const audited = runAudit(makePage({ finalUrl: 'not a url' }), { now: NOW });
    expect(buildExport(audited, 'json').filename).toBe('seo-audit-page-2026-08-07.json');
  });
});
