/**
 * Collector tests run against jsdom. jsdom has no layout engine, so every
 * getBoundingClientRect is 0x0 and every element would look hidden. The setup
 * below gives elements a non-zero box unless their computed style says
 * otherwise, which keeps the visibility logic itself under test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectPageData } from '../../../src/content/collector';

const BOX = {
  width: 200,
  height: 40,
  top: 10,
  bottom: 50,
  left: 0,
  right: 200,
  x: 0,
  y: 10,
  toJSON() {},
} as DOMRect;

const ZERO_BOX = { ...BOX, width: 0, height: 0, bottom: 0, right: 0 } as DOMRect;

function setupLayout() {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return window.getComputedStyle(this).display === 'none' ? ZERO_BOX : BOX;
  };
  Element.prototype.getClientRects = function (this: Element) {
    const hidden = window.getComputedStyle(this).display === 'none';
    return (hidden ? [] : [BOX]) as unknown as DOMRectList;
  };
  // jsdom does not expose a global CSS object at all.
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (!g.CSS) g.CSS = {};
  if (!g.CSS.escape) g.CSS.escape = (s: string) => s.replace(/[^\w-]/g, '\\$&');
}

/** The document URL is fixed to https://example.com/page by vitest.config.ts. */
function load(html: string) {
  document.documentElement.innerHTML = html;
}

beforeEach(() => {
  setupLayout();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('meta collection', () => {
  it('tells a missing title from an empty one', () => {
    load('<head></head><body></body>');
    expect(collectPageData().title).toBeNull();

    load('<head><title></title></head><body></body>');
    expect(collectPageData().title).toBe('');
  });

  it('counts duplicate title and canonical tags', () => {
    load(`<head>
      <title>A</title><title>B</title>
      <link rel="canonical" href="/a"><link rel="canonical" href="/b">
    </head><body></body>`);
    const page = collectPageData();
    expect(page.titleCount).toBe(2);
    expect(page.canonicalCount).toBe(2);
    expect(page.title).toBe('A');
  });

  it('resolves a relative canonical against the document base', () => {
    load('<head><link rel="canonical" href="/other"></head><body></body>');
    const page = collectPageData();
    expect(page.canonical).toBe('/other');
    expect(page.canonicalResolved).toBe('https://example.com/other');
  });

  it('reads the declared charset, not document.characterSet', () => {
    load('<head></head><body></body>');
    expect(collectPageData().charset).toBeNull();

    load('<head><meta charset="utf-8"></head><body></body>');
    expect(collectPageData().charset).toBe('utf-8');

    load('<head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251"></head><body></body>');
    expect(collectPageData().charset).toBe('windows-1251');
  });

  it('indexes og: tags whether they use property or name', () => {
    load(`<head>
      <meta property="og:title" content="P">
      <meta name="og:description" content="N">
    </head><body></body>`);
    const keys = collectPageData().metas.map((m) => `${m.kind}:${m.key}`);
    expect(keys).toContain('property:og:title');
    expect(keys).toContain('name:og:description');
  });
});

describe('headings', () => {
  it('keeps document order and flags CSS-hidden headings', () => {
    load(`<head><title>t</title></head><body>
      <h1>Первый</h1>
      <h2>Второй</h2>
      <h3 style="display:none">Скрытый</h3>
    </body>`);
    const headings = collectPageData().headings;
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(headings[0].text).toBe('Первый');
    expect(headings[2].visible).toBe(false);
    expect(headings[0].visible).toBe(true);
  });

  it('produces selectors that resolve back to the same element', () => {
    load(`<head><title>t</title></head><body>
      <div><h2>A</h2><h2>B</h2></div>
    </body>`);
    const headings = collectPageData().headings;
    for (const heading of headings) {
      const found = document.querySelector(heading.selector);
      expect(found?.textContent).toBe(heading.text);
    }
  });
});

describe('links', () => {
  it('classifies every link type', () => {
    load(`<head><title>t</title></head><body>
      <a href="/inner">inner</a>
      <a href="https://other.test/x">outer</a>
      <a href="mailto:a@b.c">mail</a>
      <a href="tel:+70000000000">tel</a>
      <a href="#top">anchor</a>
      <a href="javascript:void(0)">js</a>
      <a href="">empty</a>
    </body>`);
    const types = collectPageData().links.map((l) => l.type);
    expect(types).toEqual([
      'internal',
      'external',
      'mail',
      'phone',
      'anchor',
      'javascript',
      'empty',
    ]);
  });

  it('parses rel tokens and image-only anchors', () => {
    load(`<head><title>t</title></head><body>
      <a href="https://x.test" rel="NoFollow sponsored ugc" target="_blank">x</a>
      <a href="/pic"><img src="/a.png"></a>
    </body>`);
    const [first, second] = collectPageData().links;
    expect(first.nofollow).toBe(true);
    expect(first.sponsored).toBe(true);
    expect(first.ugc).toBe(true);
    expect(first.target).toBe('_blank');
    expect(second.imageOnly).toBe(true);
    expect(second.imageAlt).toBeNull();
  });
});

describe('images', () => {
  it('separates a missing alt from an empty one', () => {
    load(`<head><title>t</title></head><body>
      <img src="/a.png">
      <img src="/b.png" alt="">
      <img src="/c.png" alt="описание">
    </body>`);
    expect(collectPageData().images.map((i) => i.alt)).toEqual([null, '', 'описание']);
  });

  it('records width/height attributes and loading separately from values', () => {
    load(`<head><title>t</title></head><body>
      <img src="/a.png" alt="a" width="100" height="50" loading="lazy" srcset="/a2.png 2x">
      <img src="/b.png" alt="b">
    </body>`);
    const [withAttrs, without] = collectPageData().images;
    expect(withAttrs.hasWidthAttr).toBe(true);
    expect(withAttrs.hasHeightAttr).toBe(true);
    expect(withAttrs.loading).toBe('lazy');
    expect(withAttrs.srcset).toBe('/a2.png 2x');
    expect(without.hasWidthAttr).toBe(false);
    expect(without.loading).toBeNull();
  });

  it('detects an accessible name on inline SVG', () => {
    load(`<head><title>t</title></head><body>
      <svg><title>Иконка</title></svg>
      <svg aria-label="Лого"></svg>
      <svg></svg>
    </body>`);
    const svgs = collectPageData().images.filter((i) => i.isSvg);
    expect(svgs.map((s) => s.hasAccessibleName)).toEqual([true, true, false]);
  });

  it('ignores CSS background images instead of reporting them as <img>', () => {
    load(`<head><title>t</title></head><body>
      <div style="background-image:url(/bg.png)">текст</div>
      <img src="/real.png" alt="real">
    </body>`);
    const images = collectPageData().images;
    expect(images).toHaveLength(1);
    expect(images[0].src).toContain('/real.png');
  });
});

describe('structured data', () => {
  it('extracts types and @context from valid JSON-LD', () => {
    load(`<head><title>t</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product","name":"Ноутбук"}
      </script>
    </head><body></body>`);
    const [block] = collectPageData().structuredData;
    expect(block.format).toBe('json-ld');
    expect(block.types).toEqual(['Product']);
    expect(block.context).toBe('https://schema.org');
    expect(block.error).toBeUndefined();
  });

  it('walks @graph and array roots for types', () => {
    load(`<head><title>t</title>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["Article","NewsArticle"]}]}
      </script>
    </head><body></body>`);
    expect(collectPageData().structuredData[0].types).toEqual([
      'Organization',
      'Article',
      'NewsArticle',
    ]);
  });

  it('records a syntax error instead of throwing', () => {
    load(`<head><title>t</title>
      <script type="application/ld+json">{"@type":"Product",}</script>
    </head><body></body>`);
    const [block] = collectPageData().structuredData;
    expect(block.error).toBeTruthy();
    expect(block.types).toEqual([]);
  });

  it('finds Microdata and RDFa roots', () => {
    load(`<head><title>t</title></head><body>
      <div itemscope itemtype="https://schema.org/Person"><span itemprop="name">A</span></div>
      <div vocab="https://schema.org/" typeof="Book"></div>
    </body>`);
    const formats = collectPageData().structuredData.map((b) => b.format);
    expect(formats).toContain('microdata');
    expect(formats).toContain('rdfa');
  });
});

describe('content and resources', () => {
  it('counts visible text and excludes script and style contents', () => {
    load(`<head><title>t</title></head><body>
      <p>Первый абзац текста.</p>
      <script>var secret = "не должно попасть";</script>
      <style>.x { color: red }</style>
      <p>Второй абзац текста.</p>
    </body>`);
    const content = collectPageData().content;
    expect(content.visibleText).toContain('Первый абзац');
    expect(content.visibleText).not.toContain('secret');
    expect(content.visibleText).not.toContain('color');
    expect(content.paragraphs).toBe(2);
  });

  it('counts hidden text blocks without adding them to the visible text', () => {
    load(`<head><title>t</title></head><body>
      <p>Видимый текст страницы.</p>
      <div style="display:none">Скрытый текст с ключевыми словами для поиска.</div>
    </body>`);
    const content = collectPageData().content;
    expect(content.hiddenTextBlocks).toBe(1);
    expect(content.visibleText).not.toContain('Скрытый');
  });

  it('classifies scripts as async, defer or blocking', () => {
    load(`<head><title>t</title>
      <script src="/a.js"></script>
      <script src="/b.js" async></script>
      <script src="/c.js" defer></script>
      <script src="/d.js" type="module"></script>
    </head><body></body>`);
    const r = collectPageData().resources;
    expect(r.scripts).toBe(4);
    expect(r.scriptsAsync).toBe(1);
    expect(r.scriptsDefer).toBe(1);
    expect(r.scriptsBlocking).toBe(1);
  });

  it('flags http subresources on an https page as mixed content', () => {
    load(
      `<head><title>t</title><link rel="stylesheet" href="http://cdn.test/a.css"></head><body>
        <img src="http://cdn.test/a.png" alt="a">
        <img src="https://cdn.test/b.png" alt="b">
      </body>`,
    );
    expect(collectPageData().resources.mixedContent).toEqual([
      'http://cdn.test/a.css',
      'http://cdn.test/a.png',
    ]);
  });
});

describe('robustness', () => {
  it('handles a completely empty document', () => {
    load('<head></head><body></body>');
    const page = collectPageData();
    expect(page.title).toBeNull();
    expect(page.headings).toEqual([]);
    expect(page.links).toEqual([]);
    expect(page.content.words).toBe(0);
  });

  it('caps collected links and records what was truncated', () => {
    const many = Array.from({ length: 2100 }, (_, i) => `<a href="/p${i}">l${i}</a>`).join('');
    load(`<head><title>t</title></head><body>${many}</body>`);

    const started = Date.now();
    const page = collectPageData();
    const elapsed = Date.now() - started;

    expect(page.links).toHaveLength(2000);
    expect(page.truncated.links).toBe(2100);
    // Guards the selector cache: without it this pass is quadratic and took
    // over six minutes under jsdom.
    expect(elapsed).toBeLessThan(20_000);
  });

  it('produces distinct, resolvable selectors for many same-tag siblings', () => {
    const many = Array.from({ length: 50 }, (_, i) => `<a href="/p${i}">l${i}</a>`).join('');
    load(`<head><title>t</title></head><body><nav>${many}</nav></body>`);
    const links = collectPageData().links;

    expect(new Set(links.map((l) => l.selector)).size).toBe(links.length);
    for (const link of links) {
      expect(document.querySelector(link.selector)?.textContent).toBe(link.text);
    }
  });
});
