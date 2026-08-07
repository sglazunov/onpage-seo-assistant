import type { AuditRule } from './types';
import { metaRules } from './meta';
import { headingRules } from './headings';
import { linkRules } from './links';
import { imageRules } from './images';
import { schemaRules } from './schema';
import { socialRules } from './social';
import { contentRules } from './content';
import { technicalRules } from './technical';

/**
 * Registry order defines the order issues appear in when severity ties.
 * Adding a rule means: append it here + add rules.<ID> to both locale files.
 */
export const ALL_RULES: AuditRule[] = [
  ...metaRules,
  ...headingRules,
  ...linkRules,
  ...imageRules,
  ...schemaRules,
  ...socialRules,
  ...contentRules,
  ...technicalRules,
];

export const RULE_IDS = ALL_RULES.map((r) => r.id);

export function getRule(id: string): AuditRule | undefined {
  return ALL_RULES.find((r) => r.id === id);
}

export * from './types';
