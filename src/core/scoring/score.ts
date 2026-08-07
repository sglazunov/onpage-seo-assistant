import type {
  AuditCategory,
  AuditIssue,
  CategoryScore,
  PassedCheck,
  ScoreGroup,
  ScoreResult,
} from '../../shared/types';
import { CATEGORY_ORDER, CATEGORY_WEIGHTS, GROUP_OF } from './weights';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score = 100 - sum(penalties), clamped, per the spec. The same formula is
 * applied per category and per group so the numbers stay explainable: any bar
 * can be reconstructed by adding up the scoreImpact of its issues.
 */
export function computeScore(issues: AuditIssue[], passed: PassedCheck[]): ScoreResult {
  const byCategory = new Map<AuditCategory, { penalty: number; e: number; w: number; i: number }>();
  for (const category of CATEGORY_ORDER) {
    byCategory.set(category, { penalty: 0, e: 0, w: 0, i: 0 });
  }

  let totalPenalty = 0;
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const issue of issues) {
    const bucket = byCategory.get(issue.category)!;
    bucket.penalty += issue.scoreImpact;
    totalPenalty += issue.scoreImpact;
    if (issue.severity === 'error') {
      bucket.e += 1;
      errors += 1;
    } else if (issue.severity === 'warning') {
      bucket.w += 1;
      warnings += 1;
    } else {
      bucket.i += 1;
      infos += 1;
    }
  }

  const categories: CategoryScore[] = CATEGORY_ORDER.map((category) => {
    const b = byCategory.get(category)!;
    return {
      category,
      score: clamp(100 - b.penalty),
      weight: CATEGORY_WEIGHTS[category],
      penalty: b.penalty,
      errors: b.e,
      warnings: b.w,
      infos: b.i,
    };
  });

  const groupPenalty: Record<ScoreGroup, number> = { technical: 0, content: 0, social: 0 };
  for (const category of CATEGORY_ORDER) {
    groupPenalty[GROUP_OF[category]] += byCategory.get(category)!.penalty;
  }

  return {
    overall: clamp(100 - totalPenalty),
    groups: {
      technical: clamp(100 - groupPenalty.technical),
      content: clamp(100 - groupPenalty.content),
      social: clamp(100 - groupPenalty.social),
    },
    categories,
    totalPenalty,
    errors,
    warnings,
    infos,
    passed: passed.length,
  };
}

export function scoreBand(score: number): 'good' | 'average' | 'poor' {
  if (score >= 80) return 'good';
  if (score >= 50) return 'average';
  return 'poor';
}
