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
});
