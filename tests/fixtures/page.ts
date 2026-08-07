import type {
  ContentStats,
  HeadingInfo,
  ImageInfo,
  LinkInfo,
  PageData,
  ResourceStats,
} from '../../src/shared/types';

export function makeContent(overrides: Partial<ContentStats> = {}): ContentStats {
  return {
    words: 600,
    characters: 3600,
    charactersNoSpaces: 3000,
    paragraphs: 8,
    lists: 2,
    tables: 0,
    titleWords: 6,
    h1Words: 5,
    textToHtmlRatio: 18,
    hiddenTextBlocks: 0,
    unigrams: [],
    bigrams: [],
    trigrams: [],
    visibleText: 'Sample visible page text used by the content analysers.',
    ...overrides,
  };
}

export function makeResources(overrides: Partial<ResourceStats> = {}): ResourceStats {
  return {
    scripts: 3,
    scriptsAsync: 1,
    scriptsDefer: 2,
    scriptsBlocking: 0,
    stylesheets: 2,
    inlineStyles: 1,
    mixedContent: [],
    failedImages: 0,
    jsErrors: [],
    ...overrides,
  };
}

export function makeHeading(
  level: HeadingInfo['level'],
  text: string,
  overrides: Partial<HeadingInfo> = {},
): HeadingInfo {
  return {
    level,
    text,
    selector: `h${level}`,
    visible: true,
    index: 0,
    ...overrides,
  };
}

export function makeLink(overrides: Partial<LinkInfo> = {}): LinkInfo {
  return {
    href: '/about',
    resolved: 'https://example.com/about',
    text: 'About us',
    type: 'internal',
    rel: [],
    nofollow: false,
    sponsored: false,
    ugc: false,
    imageOnly: false,
    selector: 'a',
    ...overrides,
  };
}

export function makeImage(overrides: Partial<ImageInfo> = {}): ImageInfo {
  return {
    src: 'https://example.com/photo.jpg',
    alt: 'A photo',
    title: null,
    naturalWidth: 800,
    naturalHeight: 600,
    hasWidthAttr: true,
    hasHeightAttr: true,
    loading: 'lazy',
    srcset: 'photo.jpg 1x, photo@2x.jpg 2x',
    loaded: true,
    visible: true,
    aboveTheFold: false,
    format: 'jpg',
    isSvg: false,
    hasAccessibleName: true,
    selector: 'img',
    ...overrides,
  };
}

/**
 * A page that passes every base check. Tests break exactly one thing at a time
 * so an assertion failure points at a single rule.
 */
export function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: 'https://example.com/page',
    finalUrl: 'https://example.com/page',
    protocol: 'https:',
    hostname: 'example.com',
    pathname: '/page',
    title: 'Купить ноутбук в Екатеринбурге — цены и доставка',
    titleCount: 1,
    metas: [
      {
        key: 'description',
        kind: 'name',
        content:
          'Большой выбор ноутбуков в Екатеринбурге: цены, доставка по городу и области, гарантия производителя на всю технику.',
      },
      { key: 'viewport', kind: 'name', content: 'width=device-width, initial-scale=1' },
      { key: 'og:title', kind: 'property', content: 'Купить ноутбук' },
      { key: 'og:description', kind: 'property', content: 'Каталог ноутбуков' },
      { key: 'og:image', kind: 'property', content: 'https://example.com/og.png' },
      { key: 'og:url', kind: 'property', content: 'https://example.com/page' },
      { key: 'og:type', kind: 'property', content: 'website' },
      { key: 'twitter:card', kind: 'name', content: 'summary_large_image' },
    ],
    canonical: 'https://example.com/page',
    canonicalResolved: 'https://example.com/page',
    canonicalCount: 1,
    htmlLang: 'ru',
    charset: 'utf-8',
    favicons: ['https://example.com/favicon.ico'],
    hreflang: [],
    headings: [
      makeHeading(1, 'Ноутбуки в Екатеринбурге'),
      makeHeading(2, 'Популярные модели', { selector: 'h2:nth-of-type(1)', index: 1 }),
      makeHeading(3, 'Lenovo', { selector: 'h3:nth-of-type(1)', index: 2 }),
      makeHeading(2, 'Доставка и оплата', { selector: 'h2:nth-of-type(2)', index: 3 }),
    ],
    links: [makeLink(), makeLink({ type: 'external', resolved: 'https://ya.ru/', text: 'Яндекс' })],
    images: [makeImage()],
    structuredData: [
      {
        format: 'json-ld',
        types: ['Product'],
        context: 'https://schema.org',
        raw: '{"@context":"https://schema.org","@type":"Product","name":"Ноутбук"}',
        parsed: { '@context': 'https://schema.org', '@type': 'Product', name: 'Ноутбук' },
        selector: 'script',
      },
    ],
    content: makeContent(),
    resources: makeResources(),
    domNodes: 820,
    htmlSize: 20_000,
    iframes: 0,
    truncated: {},
    collectedAt: 1_700_000_000_000,
    collectorMs: 42,
    ...overrides,
  };
}
