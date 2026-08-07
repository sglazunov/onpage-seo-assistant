/**
 * Single source of truth for every data structure that crosses a boundary
 * (content script -> service worker -> popup -> export files).
 * Everything here must be structured-clone / JSON safe.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

/** Categories double as scoring buckets — see core/scoring/weights.ts. */
export type AuditCategory =
  | 'indexing'
  | 'meta'
  | 'headings'
  | 'canonical'
  | 'links'
  | 'images'
  | 'schema'
  | 'social'
  | 'content'
  | 'technical';

export type Lang = 'ru' | 'en';

export type ExportFormat = 'json' | 'csv' | 'markdown' | 'html';

/* ------------------------------------------------------------------ */
/* Raw page data — produced by the content script, never mutated later */
/* ------------------------------------------------------------------ */

export interface MetaTagRaw {
  /** `name`, `property`, `http-equiv` or `itemprop` — whichever identified the tag. */
  key: string;
  kind: 'name' | 'property' | 'http-equiv' | 'itemprop';
  content: string;
}

export interface HeadingInfo {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  selector: string;
  visible: boolean;
  /** Document order index, used to keep the tree stable. */
  index: number;
}

export type LinkType =
  | 'internal'
  | 'external'
  | 'mail'
  | 'phone'
  | 'anchor'
  | 'javascript'
  | 'empty'
  | 'invalid';

export interface LinkInfo {
  href: string;
  /** Resolved absolute URL, or the raw href when it cannot be resolved. */
  resolved: string;
  text: string;
  type: LinkType;
  rel: string[];
  target?: string;
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
  /** True when the anchor contains only images / has no text node. */
  imageOnly: boolean;
  /** Alt text of the contained image when imageOnly is true. */
  imageAlt?: string | null;
  selector: string;
  /** Filled in later by the link status checker (v0.3 network pass). */
  status?: number;
  redirectedTo?: string;
  checkError?: string;
}

export interface ImageInfo {
  src: string;
  /** null = the alt attribute is absent; '' = present but empty (decorative). */
  alt: string | null;
  title: string | null;
  naturalWidth: number;
  naturalHeight: number;
  hasWidthAttr: boolean;
  hasHeightAttr: boolean;
  loading: string | null;
  srcset: string | null;
  loaded: boolean;
  visible: boolean;
  /** True when the element is inside the initial viewport. */
  aboveTheFold: boolean;
  format: string;
  isSvg: boolean;
  /** For SVG: whether it exposes a title/aria-label/role="img" description. */
  hasAccessibleName: boolean;
  selector: string;
}

export interface StructuredDataBlock {
  format: 'json-ld' | 'microdata' | 'rdfa';
  types: string[];
  context?: string | null;
  raw?: string;
  parsed?: unknown;
  error?: string;
  selector: string;
}

export interface ContentStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  lists: number;
  tables: number;
  titleWords: number;
  h1Words: number;
  textToHtmlRatio: number;
  hiddenTextBlocks: number;
  /** Top single words by frequency, stop-words removed. */
  unigrams: TermFrequency[];
  bigrams: TermFrequency[];
  trigrams: TermFrequency[];
  /** Full visible text, truncated — used for keyword lookups in the popup. */
  visibleText: string;
}

export interface TermFrequency {
  term: string;
  count: number;
  /** Percentage of total words, 2 decimals. */
  density: number;
}

export interface ResourceStats {
  scripts: number;
  scriptsAsync: number;
  scriptsDefer: number;
  scriptsBlocking: number;
  stylesheets: number;
  inlineStyles: number;
  /** http:// subresources found on an https:// page. */
  mixedContent: string[];
  failedImages: number;
  jsErrors: string[];
}

export interface HreflangEntry {
  lang: string;
  href: string;
}

/** Everything the content script can see. Pure data — no DOM references. */
export interface PageData {
  url: string;
  finalUrl: string;
  protocol: string;
  hostname: string;
  pathname: string;
  /** null when the <title> element is missing entirely. */
  title: string | null;
  /** How many <title> elements exist — more than one is a markup bug. */
  titleCount: number;
  metas: MetaTagRaw[];
  canonical: string | null;
  canonicalResolved: string | null;
  canonicalCount: number;
  htmlLang: string | null;
  charset: string | null;
  favicons: string[];
  hreflang: HreflangEntry[];
  headings: HeadingInfo[];
  links: LinkInfo[];
  images: ImageInfo[];
  structuredData: StructuredDataBlock[];
  content: ContentStats;
  resources: ResourceStats;
  domNodes: number;
  htmlSize: number;
  iframes: number;
  /** Set by the collector when a limit in shared/constants.ts was hit. */
  truncated: Partial<Record<'links' | 'images' | 'headings', number>>;
  collectedAt: number;
  collectorMs: number;
}

/* ------------------------------------------------------------------ */
/* Audit output                                                        */
/* ------------------------------------------------------------------ */

export interface AuditIssue {
  /** Rule id, e.g. META-001. Stable across versions — never renumber. */
  id: string;
  category: AuditCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  /** CSS selector of the offending element, when there is one. */
  selector?: string;
  /** The offending value, shown verbatim in the UI. */
  value?: string;
  /** How many elements triggered this rule (issues are grouped per rule). */
  count?: number;
  /** Extra selectors when count > 1. */
  selectors?: string[];
  scoreImpact: number;
}

export interface CategoryScore {
  category: AuditCategory;
  score: number;
  weight: number;
  penalty: number;
  errors: number;
  warnings: number;
  infos: number;
}

export type ScoreGroup = 'technical' | 'content' | 'social';

export interface ScoreResult {
  overall: number;
  groups: Record<ScoreGroup, number>;
  categories: CategoryScore[];
  totalPenalty: number;
  errors: number;
  warnings: number;
  infos: number;
  passed: number;
}

/** A rule that ran and found nothing — shown in the green "passed" list. */
export interface PassedCheck {
  id: string;
  category: AuditCategory;
  title: string;
}

export interface AuditResult {
  version: string;
  url: string;
  finalUrl: string;
  pageTitle: string | null;
  analyzedAt: number;
  durationMs: number;
  lang: Lang;
  page: PageData;
  issues: AuditIssue[];
  passed: PassedCheck[];
  score: ScoreResult;
}

/* ------------------------------------------------------------------ */
/* Settings & history                                                  */
/* ------------------------------------------------------------------ */

export interface Thresholds {
  titleMin: number;
  titleMax: number;
  descriptionMin: number;
  descriptionMax: number;
  h1Max: number;
  altMax: number;
  anchorMax: number;
}

export interface Settings {
  lang: Lang;
  theme: 'system' | 'light' | 'dark';
  saveHistory: boolean;
  historyLimit: number;
  linkCheckConcurrency: number;
  autoRunOnOpen: boolean;
  thresholds: Thresholds;
  /** Rule ids the user muted; they still show as info but score 0. */
  mutedRules: string[];
}

export interface HistoryEntry {
  id: string;
  url: string;
  pageTitle: string | null;
  analyzedAt: number;
  score: number;
  errors: number;
  warnings: number;
  infos: number;
}

/* ------------------------------------------------------------------ */
/* Keyword analysis (popup-side, derived from PageData)                */
/* ------------------------------------------------------------------ */

export interface KeywordPresence {
  url: boolean;
  title: boolean;
  description: boolean;
  h1: boolean;
  h2: boolean;
  firstParagraph: boolean;
  body: boolean;
  occurrences: number;
  density: number;
}
