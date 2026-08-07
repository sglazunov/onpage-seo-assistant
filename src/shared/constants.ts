import type { Settings, Thresholds } from './types';

export const EXTENSION_VERSION = '0.2.0';

/**
 * Hard caps applied by the collector. They exist so a pathological page
 * (a sitemap-style listing with 50k links) cannot freeze the popup.
 * PageData.truncated records what was cut.
 */
export const LIMITS = {
  links: 2000,
  images: 1000,
  headings: 500,
  domNodes: 100_000,
  /** Visible text kept for keyword lookups. */
  visibleTextChars: 200_000,
  /** Terms kept per n-gram list. */
  topTerms: 25,
  /** JSON-LD block size we are willing to keep verbatim. */
  jsonLdChars: 100_000,
} as const;

export const DEFAULT_THRESHOLDS: Thresholds = {
  titleMin: 30,
  titleMax: 60,
  descriptionMin: 70,
  descriptionMax: 160,
  h1Max: 70,
  altMax: 125,
  anchorMax: 100,
};

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ru',
  theme: 'system',
  saveHistory: true,
  historyLimit: 50,
  linkCheckConcurrency: 6,
  autoRunOnOpen: true,
  thresholds: { ...DEFAULT_THRESHOLDS },
  mutedRules: [],
};

export const STORAGE_KEYS = {
  settings: 'settings',
  history: 'history',
  lastResult: 'lastResult',
} as const;

/** Pages where content scripts can never run — the popup shows a hint instead. */
export const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'opera://',
  'browser://',
  'about:',
  'devtools://',
  'view-source:',
  'https://chromewebstore.google.com',
  'https://chrome.google.com/webstore',
  'https://addons.opera.com',
];

export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return RESTRICTED_URL_PREFIXES.some((p) => url.startsWith(p));
}

/** Highlight colour per category — shared by the highlighter and the legend. */
export const HIGHLIGHT_COLORS: Record<string, string> = {
  meta: '#8b5cf6',
  headings: '#2563eb',
  links: '#0d9488',
  images: '#d97706',
  schema: '#db2777',
  content: '#65a30d',
  hidden: '#6b7280',
  default: '#dc2626',
};
