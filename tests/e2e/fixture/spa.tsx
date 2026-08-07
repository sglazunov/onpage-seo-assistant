import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { collectPageData } from '../../../src/content/collector';
import { clearHighlights, highlight, scrollTo } from '../../../src/content/highlighter';
import { runAudit } from '../../../src/core/analyzers/audit';

/**
 * A real React SPA used by the acceptance run. It reproduces the situations a
 * DOM-snapshot audit gets wrong: the title is set by JavaScript, headings and
 * links are swapped on a client-side route change, and further images and
 * links appear only after the first paint.
 */

type Route = 'a' | 'b';

interface RouteContent {
  title: string;
  h1: string;
  h2: string[];
  links: { href: string; text: string }[];
  jsonLd: Record<string, unknown>;
}

const ROUTES: Record<Route, RouteContent> = {
  a: {
    title: 'Маршрут A — каталог ноутбуков',
    h1: 'Ноутбуки в наличии',
    h2: ['Популярные модели', 'Доставка'],
    links: [
      { href: '/catalog/lenovo', text: 'Lenovo' },
      { href: '/catalog/asus', text: 'ASUS' },
      { href: 'https://external-a.test/', text: 'Внешняя ссылка A' },
    ],
    jsonLd: { '@context': 'https://schema.org', '@type': 'Product', name: 'Ноутбук A' },
  },
  b: {
    title: 'Маршрут B — условия доставки',
    h1: 'Доставка и оплата',
    h2: ['Сроки', 'Способы оплаты', 'Возврат'],
    links: [
      { href: '/delivery/spb', text: 'Санкт-Петербург' },
      { href: 'https://external-b.test/', text: 'Внешняя ссылка B' },
    ],
    jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'Доставка' },
  },
};

/** 1x1 transparent GIF — keeps the fixture free of network requests. */
const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function App() {
  const [route, setRoute] = useState<Route>('a');
  const [lateContent, setLateContent] = useState(false);
  const content = ROUTES[route];

  // Title is only ever set from JavaScript, never present in the served HTML.
  useEffect(() => {
    document.title = content.title;
  }, [content.title]);

  // Content that arrives after the first paint, like a lazy-loaded block.
  useEffect(() => {
    setLateContent(false);
    const timer = setTimeout(() => setLateContent(true), 150);
    return () => clearTimeout(timer);
  }, [route]);

  return (
    <main>
      <script
        type="application/ld+json"
        // The fixture owns this string; it is not page-derived input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(content.jsonLd) }}
      />

      <nav>
        {/* Labels deliberately avoid the route names: the spec asserts that no
            route-A string survives a switch, and permanent chrome would be a
            false positive. */}
        <button type="button" id="go-a" onClick={() => setRoute('a')}>
          Первый раздел
        </button>
        <button type="button" id="go-b" onClick={() => setRoute('b')}>
          Второй раздел
        </button>
      </nav>

      <h1>{content.h1}</h1>

      {content.h2.map((text) => (
        <section key={text}>
          <h2>{text}</h2>
          <p>
            Текст блока «{text}». Он существует только пока открыт текущий раздел и должен
            исчезать из отчёта после перехода.
          </p>
        </section>
      ))}

      <ul>
        {content.links.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.text}</a>
          </li>
        ))}
      </ul>

      {/* Present from the first render, alt missing on purpose. */}
      <img id="img-initial" src={PIXEL} width={120} height={80} />

      {/* Pushed far down so scrolling is actually required to reach it. */}
      <div style={{ height: '1800px' }} />

      {lateContent ? (
        <div id="late">
          <h3>Загружено после первой отрисовки</h3>
          <a href="/late-link" id="late-link">
            Ссылка, добавленная после загрузки
          </a>
          <img id="img-late" src={PIXEL} alt="Изображение после загрузки" width={64} height={64} />
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('app')!).render(<App />);

// Exposed for the acceptance spec — see tests/e2e/global.d.ts.
window.__seoHarness = {
  collect: collectPageData,
  audit: (page) => runAudit(page),
  highlight,
  scrollTo,
  clearHighlights,
};
