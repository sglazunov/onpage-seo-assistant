import type { RobotsInfo } from '../../shared/messages';
import type { AuditIssue, AuditResult, Lang, PageData, PassedCheck, Settings } from '../../shared/types';
import { DEFAULT_SETTINGS, EXTENSION_VERSION } from '../../shared/constants';
import { createTranslate } from '../../shared/i18n';
import { ALL_RULES, MetaIndex, type AuditContext, type RuleFinding } from '../rules';
import { computeScore } from '../scoring/score';
import { CATEGORY_ORDER, penaltyFor } from '../scoring/weights';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export interface RunAuditOptions {
  settings?: Partial<Settings>;
  network?: RobotsInfo | null;
  /** Injected in tests so results do not depend on the clock. */
  now?: number;
}

function toArray(result: RuleFinding | RuleFinding[] | null): RuleFinding[] {
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

/**
 * Pure function: same PageData + same settings always produce the same
 * AuditResult (apart from `analyzedAt`). Everything the popup renders comes
 * from here, so this is the single place to unit test.
 */
export function runAudit(page: PageData, options: RunAuditOptions = {}): AuditResult {
  const started = options.now ?? Date.now();
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...options.settings,
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...options.settings?.thresholds },
  };
  const lang: Lang = settings.lang;
  const t = createTranslate(lang);
  const muted = new Set(settings.mutedRules.map((id) => id.trim().toUpperCase()).filter(Boolean));

  const ctx: AuditContext = {
    page,
    t,
    thresholds: settings.thresholds,
    network: options.network ?? null,
    meta: new MetaIndex(page),
  };

  const issues: AuditIssue[] = [];
  const passed: PassedCheck[] = [];

  for (const rule of ALL_RULES) {
    let findings: RuleFinding[];
    try {
      if (rule.applicable && !rule.applicable(ctx)) continue;
      findings = toArray(rule.run(ctx));
    } catch (error) {
      // A broken rule must never take down the whole audit.
      // eslint-disable-next-line no-console
      console.warn(`[onpage-seo] rule ${rule.id} failed`, error);
      continue;
    }

    if (findings.length === 0) {
      passed.push({
        id: rule.id,
        category: rule.category,
        title: t(`rules.${rule.id}.t`),
      });
      continue;
    }

    for (const finding of findings) {
      const severity = finding.severity ?? rule.severity;
      const count = finding.count ?? 1;
      const isMuted = muted.has(rule.id);
      const params = { ...finding.params, n: finding.params?.n ?? count };
      issues.push({
        id: rule.id,
        category: rule.category,
        severity: isMuted ? 'info' : severity,
        title: t(`rules.${rule.id}.t`, params),
        description: t(`rules.${rule.id}.d`, params),
        recommendation: t(`rules.${rule.id}.r`, params),
        selector: finding.selector,
        selectors: finding.selectors,
        value: finding.value,
        count,
        scoreImpact: isMuted ? 0 : penaltyFor(rule.id, severity, count),
      });
    }
  }

  issues.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byCategory =
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (byCategory !== 0) return byCategory;
    return a.id.localeCompare(b.id);
  });

  passed.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.id.localeCompare(b.id),
  );

  return {
    version: EXTENSION_VERSION,
    url: page.url,
    finalUrl: page.finalUrl,
    pageTitle: page.title,
    analyzedAt: started,
    durationMs: (options.now ?? Date.now()) - started,
    lang,
    page,
    issues,
    passed,
    score: computeScore(issues, passed),
  };
}
