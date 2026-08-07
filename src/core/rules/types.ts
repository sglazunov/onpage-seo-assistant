import type { RobotsInfo } from '../../shared/messages';
import type { AuditCategory, IssueSeverity, PageData, Thresholds } from '../../shared/types';
import type { Translate } from '../../shared/i18n';

/** What a rule returns when it finds something. Text comes from the locale files. */
export interface RuleFinding {
  value?: string;
  selector?: string;
  selectors?: string[];
  count?: number;
  /** Interpolated into rules.<id>.{t,d,r}. */
  params?: Record<string, string | number>;
  /** Overrides the rule's declared severity for this specific finding. */
  severity?: IssueSeverity;
}

export interface AuditContext {
  page: PageData;
  t: Translate;
  thresholds: Thresholds;
  /** Present only after the user ran the network pass. */
  network: RobotsInfo | null;
  meta: MetaIndex;
}

export interface AuditRule {
  id: string;
  category: AuditCategory;
  severity: IssueSeverity;
  /**
   * When it returns false the rule is skipped entirely — it appears neither in
   * issues nor in the passed list. Use it for checks that cannot be evaluated
   * (a "title too long" check on a page with no title at all).
   */
  applicable?: (ctx: AuditContext) => boolean;
  run: (ctx: AuditContext) => RuleFinding | RuleFinding[] | null;
}

/** Case-insensitive lookup over the raw meta tags collected from the page. */
export class MetaIndex {
  private readonly byName = new Map<string, string[]>();
  private readonly byProperty = new Map<string, string[]>();
  private readonly byHttpEquiv = new Map<string, string[]>();

  constructor(page: PageData) {
    for (const m of page.metas) {
      const key = m.key.toLowerCase();
      const target =
        m.kind === 'property'
          ? this.byProperty
          : m.kind === 'http-equiv'
            ? this.byHttpEquiv
            : this.byName;
      const list = target.get(key);
      if (list) list.push(m.content);
      else target.set(key, [m.content]);
    }
  }

  /** Returns null when the tag is absent, '' when present but empty. */
  name(key: string): string | null {
    const v = this.byName.get(key.toLowerCase());
    return v ? v[0] : null;
  }

  namesAll(key: string): string[] {
    return this.byName.get(key.toLowerCase()) ?? [];
  }

  property(key: string): string | null {
    const v = this.byProperty.get(key.toLowerCase());
    return v ? v[0] : null;
  }

  httpEquiv(key: string): string | null {
    const v = this.byHttpEquiv.get(key.toLowerCase());
    return v ? v[0] : null;
  }

  /** og:* / twitter:* live under either `property` or `name` depending on the CMS. */
  social(key: string): string | null {
    return this.property(key) ?? this.name(key);
  }

  hasAnyOpenGraph(): boolean {
    for (const k of this.byProperty.keys()) if (k.startsWith('og:')) return true;
    for (const k of this.byName.keys()) if (k.startsWith('og:')) return true;
    return false;
  }

  /** Merged robots directives from meta robots + googlebot + yandex. */
  robotsDirectives(): string[] {
    const raw = [
      ...this.namesAll('robots'),
      ...this.namesAll('googlebot'),
      ...this.namesAll('yandex'),
    ];
    return raw
      .join(',')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
}

export function len(value: string | null | undefined): number {
  return value ? [...value.trim()].length : 0;
}

export function countWords(value: string | null | undefined): number {
  if (!value) return 0;
  const m = value.trim().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Groups per-element findings into one finding carrying every selector. */
export function group(findings: RuleFinding[]): RuleFinding | null {
  if (findings.length === 0) return null;
  const selectors = findings.map((f) => f.selector).filter((s): s is string => Boolean(s));
  return {
    ...findings[0],
    count: findings.length,
    selectors,
    selector: selectors[0],
    params: { ...findings[0].params, n: findings.length },
  };
}
