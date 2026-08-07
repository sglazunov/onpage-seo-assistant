import type { AuditCategory, IssueSeverity, ScoreGroup } from '../../shared/types';

/**
 * Category weights from the spec. They sum to 100 and drive the per-category
 * bars; `technical` carries 0 because its checks are informational or are
 * already counted under `indexing`.
 */
export const CATEGORY_WEIGHTS: Record<AuditCategory, number> = {
  indexing: 25,
  meta: 20,
  headings: 15,
  canonical: 10,
  links: 10,
  images: 8,
  schema: 7,
  social: 3,
  content: 2,
  technical: 0,
};

export const CATEGORY_ORDER: AuditCategory[] = [
  'indexing',
  'meta',
  'headings',
  'canonical',
  'links',
  'images',
  'schema',
  'social',
  'content',
  'technical',
];

export const GROUP_OF: Record<AuditCategory, ScoreGroup> = {
  indexing: 'technical',
  canonical: 'technical',
  technical: 'technical',
  links: 'technical',
  meta: 'content',
  headings: 'content',
  content: 'content',
  images: 'content',
  social: 'social',
  schema: 'social',
};

/** Fallback penalty when a rule has no explicit entry in PENALTIES. */
export const DEFAULT_PENALTY: Record<IssueSeverity, number> = {
  error: 8,
  warning: 3,
  info: 0,
};

/**
 * Per-rule penalties. Values follow the spec: errors -5..-15, warnings -1..-5,
 * info 0. Keep them here rather than on the rule objects so scoring stays a
 * single reviewable table.
 */
export const PENALTIES: Record<string, number> = {
  'META-001': 15,
  'META-002': 15,
  'META-003': 3,
  'META-004': 2,
  'META-005': 8,
  'META-006': 8,
  'META-007': 3,
  'META-015': 2,
  'META-016': 3,
  'META-017': 0,
  'META-008': 5,
  'META-009': 4,
  'META-018': 5,
  'META-019': 0,
  'META-020': 3,
  'META-021': 3,
  'META-022': 0,
  'META-010': 4,
  'META-011': 2,
  'META-012': 15,
  'META-013': 0,
  'META-014': 0,

  'HEAD-001': 10,
  'HEAD-002': 10,
  'HEAD-003': 3,
  'HEAD-004': 2,
  'HEAD-005': 2,
  'HEAD-006': 1,
  'HEAD-007': 2,
  'HEAD-008': 0,
  'HEAD-009': 0,
  'HEAD-010': 0,

  'LINK-001': 2,
  'LINK-002': 0,
  'LINK-003': 2,
  'LINK-004': 3,
  'LINK-005': 2,
  'LINK-006': 2,
  'LINK-007': 0,
  'LINK-008': 0,
  'LINK-009': 3,
  'LINK-010': 8,
  'LINK-011': 0,
  'LINK-012': 0,

  'IMG-001': 3,
  'IMG-002': 0,
  'IMG-003': 0,
  'IMG-004': 2,
  'IMG-005': 5,
  'IMG-006': 0,
  'IMG-007': 0,
  'IMG-008': 0,
  'IMG-009': 0,
  'IMG-010': 2,

  'SD-001': 4,
  'SD-002': 6,
  'SD-003': 3,
  'SD-004': 3,
  'SD-005': 0,
  'SD-006': 0,

  'SOC-001': 1,
  'SOC-002': 1,
  'SOC-003': 1,
  'SOC-004': 0,
  'SOC-005': 0,
  'SOC-006': 0,
  'SOC-007': 2,
  'SOC-008': 0,

  'CNT-001': 2,
  'CNT-002': 2,
  'CNT-003': 1,
  'CNT-004': 0,
  'CNT-005': 0,

  'TECH-001': 5,
  'TECH-002': 5,
  'TECH-003': 2,
  'TECH-004': 0,
  'TECH-005': 0,
  'TECH-006': 0,
  'TECH-007': 0,
  'TECH-008': 15,
  'TECH-009': 15,
  'TECH-010': 0,
  'TECH-011': 0,
  'TECH-012': 0,
};

/**
 * A rule that fires on 300 images must not zero the score on its own, so the
 * per-rule penalty is capped regardless of how many elements matched.
 */
export const PENALTY_MULTIPLIER_CAP = 2;

export function penaltyFor(ruleId: string, severity: IssueSeverity, count: number): number {
  const base = PENALTIES[ruleId] ?? DEFAULT_PENALTY[severity];
  if (base === 0) return 0;
  // 1 match = base, 2..4 = 1.5x, 5+ = 2x. Deterministic and bounded.
  const multiplier = count >= 5 ? PENALTY_MULTIPLIER_CAP : count >= 2 ? 1.5 : 1;
  return Math.round(base * multiplier);
}
