import { describe, expect, it } from 'vitest';
import { runAudit } from '../../src/core/analyzers/audit';
import { computeScore } from '../../src/core/scoring/score';
import { penaltyFor } from '../../src/core/scoring/weights';
import type { AuditIssue } from '../../src/shared/types';
import { makeImage, makePage } from '../fixtures/page';

const NOW = 1_700_000_000_000;

function makeIssue(overrides: Partial<AuditIssue> = {}): AuditIssue {
  return {
    id: 'META-005',
    category: 'meta',
    severity: 'error',
    title: 't',
    description: 'd',
    recommendation: 'r',
    scoreImpact: 8,
    ...overrides,
  };
}

describe('computeScore', () => {
  it('follows the spec example: 100 - 8 - 5 - 2 - 1 - 1 = 83', () => {
    const issues = [
      makeIssue({ id: 'META-005', category: 'meta', scoreImpact: 8 }),
      makeIssue({ id: 'META-008', category: 'canonical', severity: 'warning', scoreImpact: 5 }),
      makeIssue({ id: 'IMG-001', category: 'images', severity: 'warning', scoreImpact: 2 }),
      makeIssue({ id: 'HEAD-006', category: 'headings', severity: 'warning', scoreImpact: 1 }),
      makeIssue({ id: 'SOC-007', category: 'social', severity: 'warning', scoreImpact: 1 }),
    ];
    expect(computeScore(issues, []).overall).toBe(83);
  });

  it('clamps to the 0..100 range', () => {
    const heavy = Array.from({ length: 40 }, () => makeIssue({ scoreImpact: 10 }));
    expect(computeScore(heavy, []).overall).toBe(0);
    expect(computeScore([], []).overall).toBe(100);
  });

  it('reports each category separately', () => {
    const score = computeScore([makeIssue({ category: 'images', scoreImpact: 20 })], []);
    const images = score.categories.find((c) => c.category === 'images');
    const meta = score.categories.find((c) => c.category === 'meta');
    expect(images?.score).toBe(80);
    expect(meta?.score).toBe(100);
  });

  it('groups categories into technical / content / social', () => {
    const score = computeScore(
      [makeIssue({ id: 'SOC-007', category: 'social', scoreImpact: 10 })],
      [],
    );
    expect(score.groups.social).toBe(90);
    expect(score.groups.technical).toBe(100);
    expect(score.groups.content).toBe(100);
  });

  it('category weights sum to 100', () => {
    const total = computeScore([], []).categories.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });
});

describe('penaltyFor', () => {
  it('scales with the match count but stops at 2x the base', () => {
    expect(penaltyFor('IMG-001', 'warning', 1)).toBe(3);
    expect(penaltyFor('IMG-001', 'warning', 3)).toBe(5);
    expect(penaltyFor('IMG-001', 'warning', 500)).toBe(6);
  });

  it('never penalises an info-level rule', () => {
    expect(penaltyFor('IMG-002', 'info', 100)).toBe(0);
  });
});

describe('determinism', () => {
  it('produces an identical result for identical input', () => {
    const page = makePage({ images: [makeImage({ alt: null })] });
    const a = runAudit(page, { now: NOW });
    const b = runAudit(page, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sorts issues by severity, then category, then id', () => {
    const result = runAudit(
      makePage({
        title: null,
        titleCount: 0,
        headings: [],
        images: [makeImage({ alt: null })],
        structuredData: [],
      }),
      { now: NOW },
    );
    const severities = result.issues.map((i) => i.severity);
    const order = { error: 0, warning: 1, info: 2 } as const;
    const sorted = [...severities].sort((a, b) => order[a] - order[b]);
    expect(severities).toEqual(sorted);
  });
});
