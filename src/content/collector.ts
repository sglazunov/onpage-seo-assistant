import { LIMITS } from '../shared/constants';
import type {
  ContentStats,
  HeadingInfo,
  HreflangEntry,
  ImageInfo,
  LinkInfo,
  LinkType,
  MetaTagRaw,
  PageData,
  ResourceStats,
  StructuredDataBlock,
} from '../shared/types';
import { countWords, termFrequencies } from '../core/analyzers/text';
import { cssPath, resetSelectorCache } from './selector';

/** JS errors are captured from page load onward — see installErrorRecorder(). */
const jsErrors: string[] = [];

export function installErrorRecorder(): void {
  const push = (message: string) => {
    if (jsErrors.length < 20 && !jsErrors.includes(message)) jsErrors.push(message);
  };
  window.addEventListener('error', (event) => {
    if (event.message) push(event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    push(`Unhandled promise rejection: ${String((event as PromiseRejectionEvent).reason)}`);
  });
}

function isVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // Inline elements with only inline children can legitimately measure 0×0.
    return element.getClientRects().length > 0;
  }
  return true;
}

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function resolveUrl(raw: string): string {
  try {
    return new URL(raw, document.baseURI).href;
  } catch {
    return raw;
  }
}

function classifyLink(href: string, resolved: string): LinkType {
  const trimmed = href.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.startsWith('#')) return 'anchor';
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:')) return 'javascript';
  if (lower.startsWith('mailto:')) return 'mail';
  if (lower.startsWith('tel:')) return 'phone';
  try {
    const url = new URL(resolved);
    if (!/^https?:$/.test(url.protocol)) return 'invalid';
    return url.hostname === location.hostname ? 'internal' : 'external';
  } catch {
    return 'invalid';
  }
}

function collectMetas(): MetaTagRaw[] {
  const out: MetaTagRaw[] = [];
  for (const meta of Array.from(document.querySelectorAll('meta'))) {
    const content = meta.getAttribute('content') ?? '';
    const name = meta.getAttribute('name');
    const property = meta.getAttribute('property');
    const httpEquiv = meta.getAttribute('http-equiv');
    const itemprop = meta.getAttribute('itemprop');
    if (name !== null) out.push({ key: name, kind: 'name', content });
    else if (property !== null) out.push({ key: property, kind: 'property', content });
    else if (httpEquiv !== null) out.push({ key: httpEquiv, kind: 'http-equiv', content });
    else if (itemprop !== null) out.push({ key: itemprop, kind: 'itemprop', content });
  }
  return out;
}

function collectHeadings(): { headings: HeadingInfo[]; truncated?: number } {
  const nodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const capped = nodes.slice(0, LIMITS.headings);
  const headings = capped.map<HeadingInfo>((node, index) => ({
    level: Number(node.tagName[1]) as HeadingInfo['level'],
    text: textOf(node),
    selector: cssPath(node),
    visible: isVisible(node),
    index,
  }));
  return nodes.length > LIMITS.headings
    ? { headings, truncated: nodes.length }
    : { headings };
}

function collectLinks(): { links: LinkInfo[]; truncated?: number } {
  const nodes = Array.from(document.querySelectorAll('a'));
  const capped = nodes.slice(0, LIMITS.links);
  const links = capped.map<LinkInfo>((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    const resolved = href ? resolveUrl(href) : location.href;
    const rel = (anchor.getAttribute('rel') ?? '')
      .split(/\s+/)
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    const text = textOf(anchor);
    const img = anchor.querySelector('img');
    return {
      href,
      resolved,
      text,
      type: classifyLink(href, resolved),
      rel,
      target: anchor.getAttribute('target') ?? undefined,
      nofollow: rel.includes('nofollow'),
      sponsored: rel.includes('sponsored'),
      ugc: rel.includes('ugc'),
      imageOnly: !text && Boolean(img),
      imageAlt: img ? img.getAttribute('alt') : undefined,
      selector: cssPath(anchor),
    };
  });
  return nodes.length > LIMITS.links ? { links, truncated: nodes.length } : { links };
}

function formatOf(src: string): string {
  const match = src.split('?')[0].split('#')[0].match(/\.([a-z0-9]+)$/i);
  if (match) return match[1].toLowerCase();
  if (src.startsWith('data:image/')) return src.slice(11).split(';')[0];
  return '';
}

function collectImages(): { images: ImageInfo[]; truncated?: number } {
  const viewportHeight = window.innerHeight || 800;
  const imgNodes = Array.from(document.querySelectorAll('img'));
  const svgNodes = Array.from(document.querySelectorAll('svg'));
  const total = imgNodes.length + svgNodes.length;

  const images: ImageInfo[] = [];

  for (const img of imgNodes) {
    if (images.length >= LIMITS.images) break;
    const rect = img.getBoundingClientRect();
    const src = img.currentSrc || img.getAttribute('src') || '';
    images.push({
      src,
      alt: img.hasAttribute('alt') ? img.getAttribute('alt') : null,
      title: img.getAttribute('title'),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      hasWidthAttr: img.hasAttribute('width'),
      hasHeightAttr: img.hasAttribute('height'),
      loading: img.getAttribute('loading'),
      srcset: img.getAttribute('srcset'),
      // complete && naturalWidth === 0 means the fetch failed.
      loaded: img.complete ? img.naturalWidth > 0 : true,
      visible: isVisible(img),
      aboveTheFold: rect.top < viewportHeight && rect.bottom > 0,
      format: formatOf(src),
      isSvg: false,
      hasAccessibleName: true,
      selector: cssPath(img),
    });
  }

  for (const svg of svgNodes) {
    if (images.length >= LIMITS.images) break;
    const rect = svg.getBoundingClientRect();
    images.push({
      src: '',
      alt: svg.getAttribute('aria-label'),
      title: svg.querySelector('title')?.textContent ?? null,
      naturalWidth: Math.round(rect.width),
      naturalHeight: Math.round(rect.height),
      hasWidthAttr: svg.hasAttribute('width'),
      hasHeightAttr: svg.hasAttribute('height'),
      loading: null,
      srcset: null,
      loaded: true,
      visible: isVisible(svg),
      aboveTheFold: rect.top < viewportHeight && rect.bottom > 0,
      format: 'svg',
      isSvg: true,
      hasAccessibleName: Boolean(
        svg.querySelector('title')?.textContent?.trim() ||
          svg.getAttribute('aria-label') ||
          svg.getAttribute('aria-labelledby'),
      ),
      selector: cssPath(svg),
    });
  }

  return total > LIMITS.images ? { images, truncated: total } : { images };
}

function typesFromJsonLd(value: unknown, acc: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) typesFromJsonLd(item, acc);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') acc.add(type);
  else if (Array.isArray(type)) for (const item of type) if (typeof item === 'string') acc.add(item);
  if (Array.isArray(record['@graph'])) typesFromJsonLd(record['@graph'], acc);
}

function contextOf(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = contextOf(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const context = (value as Record<string, unknown>)['@context'];
  if (typeof context === 'string') return context;
  if (Array.isArray(context)) {
    const first = context.find((c) => typeof c === 'string');
    return typeof first === 'string' ? first : null;
  }
  if (typeof context === 'object' && context !== null) return JSON.stringify(context);
  return null;
}

function collectStructuredData(): StructuredDataBlock[] {
  const blocks: StructuredDataBlock[] = [];

  for (const script of Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  )) {
    const raw = (script.textContent ?? '').trim().slice(0, LIMITS.jsonLdChars);
    const selector = cssPath(script);
    if (!raw) {
      blocks.push({ format: 'json-ld', types: [], raw, error: 'Empty JSON-LD block', selector });
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const types = new Set<string>();
      typesFromJsonLd(parsed, types);
      blocks.push({
        format: 'json-ld',
        types: [...types],
        context: contextOf(parsed),
        raw,
        parsed,
        selector,
      });
    } catch (error) {
      blocks.push({
        format: 'json-ld',
        types: [],
        raw,
        error: error instanceof Error ? error.message : String(error),
        selector,
      });
    }
  }

  const microdataRoots = Array.from(document.querySelectorAll('[itemscope][itemtype]'));
  for (const node of microdataRoots.slice(0, 50)) {
    const itemtype = node.getAttribute('itemtype') ?? '';
    blocks.push({
      format: 'microdata',
      types: [itemtype.split('/').pop() ?? itemtype],
      context: itemtype,
      selector: cssPath(node),
    });
  }

  const rdfaRoots = Array.from(document.querySelectorAll('[typeof][vocab], [typeof][property]'));
  for (const node of rdfaRoots.slice(0, 50)) {
    blocks.push({
      format: 'rdfa',
      types: [node.getAttribute('typeof') ?? ''],
      context: node.getAttribute('vocab'),
      selector: cssPath(node),
    });
  }

  return blocks;
}

const SKIP_TEXT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'IFRAME',
  'SVG',
  'CANVAS',
  'OPTION',
]);

/** Walks the body once, splitting text into visible and hidden buckets. */
function extractText(): { visible: string; hiddenBlocks: number } {
  const parts: string[] = [];
  let hiddenBlocks = 0;
  let length = 0;

  const walk = (node: Node, hiddenAncestor: boolean): void => {
    if (length > LIMITS.visibleTextChars) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (hiddenAncestor) {
        if (text.length > 20) hiddenBlocks += 1;
        return;
      }
      parts.push(text);
      length += text.length + 1;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (SKIP_TEXT_TAGS.has(element.tagName)) return;

    const hidden = hiddenAncestor || !isVisible(element);
    for (const child of Array.from(element.childNodes)) walk(child, hidden);
  };

  if (document.body) walk(document.body, false);
  return { visible: parts.join(' '), hiddenBlocks };
}

function collectContent(title: string | null, htmlSize: number): ContentStats {
  const { visible, hiddenBlocks } = extractText();
  const frequencies = termFrequencies(visible);
  const h1 = document.querySelector('h1');
  const characters = visible.length;

  return {
    words: countWords(visible),
    characters,
    charactersNoSpaces: visible.replace(/\s/g, '').length,
    paragraphs: Array.from(document.querySelectorAll('p')).filter((p) => textOf(p).length > 0)
      .length,
    lists: document.querySelectorAll('ul, ol').length,
    tables: document.querySelectorAll('table').length,
    titleWords: countWords(title ?? ''),
    h1Words: countWords(h1 ? textOf(h1) : ''),
    textToHtmlRatio: htmlSize ? Math.round((characters / htmlSize) * 10000) / 100 : 0,
    hiddenTextBlocks: hiddenBlocks,
    unigrams: frequencies.unigrams,
    bigrams: frequencies.bigrams,
    trigrams: frequencies.trigrams,
    visibleText: visible.slice(0, LIMITS.visibleTextChars),
  };
}

function collectResources(): ResourceStats {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const styles = Array.from(
    document.querySelectorAll('link[rel~="stylesheet"]'),
  ) as HTMLLinkElement[];

  const mixedContent: string[] = [];
  if (location.protocol === 'https:') {
    const candidates = [
      ...scripts.map((s) => s.getAttribute('src') ?? ''),
      ...styles.map((s) => s.getAttribute('href') ?? ''),
      ...Array.from(document.querySelectorAll('img[src]')).map(
        (i) => i.getAttribute('src') ?? '',
      ),
      ...Array.from(document.querySelectorAll('iframe[src]')).map(
        (i) => i.getAttribute('src') ?? '',
      ),
    ];
    for (const candidate of candidates) {
      if (candidate.toLowerCase().startsWith('http://') && !mixedContent.includes(candidate)) {
        mixedContent.push(candidate);
      }
    }
  }

  const async = scripts.filter((s) => s.hasAttribute('async')).length;
  const defer = scripts.filter((s) => s.hasAttribute('defer')).length;
  const isModule = (s: HTMLScriptElement) => s.getAttribute('type') === 'module';

  return {
    scripts: scripts.length,
    scriptsAsync: async,
    scriptsDefer: defer,
    scriptsBlocking: scripts.filter(
      (s) => !s.hasAttribute('async') && !s.hasAttribute('defer') && !isModule(s),
    ).length,
    stylesheets: styles.length,
    inlineStyles: document.querySelectorAll('style').length,
    mixedContent,
    failedImages: Array.from(document.querySelectorAll('img')).filter(
      (i) => i.complete && i.naturalWidth === 0 && Boolean(i.getAttribute('src')),
    ).length,
    jsErrors: [...jsErrors],
  };
}

function collectFavicons(): string[] {
  const selectors = [
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  const found = new Set<string>();
  for (const selector of selectors) {
    for (const link of Array.from(document.querySelectorAll(selector))) {
      const href = link.getAttribute('href');
      if (href) found.add(resolveUrl(href));
    }
  }
  return [...found];
}

function declaredCharset(): string | null {
  const metaCharset = document.querySelector('meta[charset]')?.getAttribute('charset');
  if (metaCharset?.trim()) return metaCharset.trim();
  const equiv = Array.from(document.querySelectorAll('meta[http-equiv]')).find(
    (m) => (m.getAttribute('http-equiv') ?? '').toLowerCase() === 'content-type',
  );
  const match = equiv?.getAttribute('content')?.match(/charset=([\w-]+)/i);
  return match ? match[1] : null;
}

function collectHreflang(): HreflangEntry[] {
  return Array.from(document.querySelectorAll('link[rel~="alternate"][hreflang]')).map((link) => ({
    lang: (link.getAttribute('hreflang') ?? '').trim(),
    href: resolveUrl(link.getAttribute('href') ?? ''),
  }));
}

/** The single entry point the message handler calls. Never throws. */
export function collectPageData(): PageData {
  const started = performance.now();
  // Selector positions are cached per pass; the DOM may have changed since the
  // previous audit, which matters most on SPA re-renders.
  resetSelectorCache();

  const titleElements = document.querySelectorAll('title');
  const titleElement = document.querySelector('title');
  const canonicalElements = document.querySelectorAll('link[rel~="canonical"]');
  const canonicalRaw = canonicalElements[0]?.getAttribute('href') ?? null;

  const html = document.documentElement?.outerHTML ?? '';
  const htmlSize = html.length;

  const { headings, truncated: headingsTruncated } = collectHeadings();
  const { links, truncated: linksTruncated } = collectLinks();
  const { images, truncated: imagesTruncated } = collectImages();

  const truncated: PageData['truncated'] = {};
  if (headingsTruncated) truncated.headings = headingsTruncated;
  if (linksTruncated) truncated.links = linksTruncated;
  if (imagesTruncated) truncated.images = imagesTruncated;

  const title = titleElement ? (titleElement.textContent ?? '') : null;

  return {
    url: location.href,
    finalUrl: location.href,
    protocol: location.protocol,
    hostname: location.hostname,
    pathname: location.pathname,
    title,
    titleCount: titleElements.length,
    metas: collectMetas(),
    canonical: canonicalRaw,
    canonicalResolved: canonicalRaw ? resolveUrl(canonicalRaw) : null,
    canonicalCount: canonicalElements.length,
    htmlLang: document.documentElement?.getAttribute('lang') ?? null,
    // The *declared* charset, not document.characterSet — browsers always fill
    // the latter in, so it can never tell us the meta tag is missing.
    charset: declaredCharset(),
    favicons: collectFavicons(),
    hreflang: collectHreflang(),
    headings,
    links,
    images,
    structuredData: collectStructuredData(),
    content: collectContent(title, htmlSize),
    resources: collectResources(),
    domNodes: document.getElementsByTagName('*').length,
    htmlSize,
    iframes: document.querySelectorAll('iframe').length,
    truncated,
    collectedAt: Date.now(),
    collectorMs: Math.round(performance.now() - started),
  };
}
