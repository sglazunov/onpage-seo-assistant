# CLAUDE.md — карта проекта OnPage SEO Assistant

Файл существует, чтобы не перечитывать проект целиком. Здесь — архитектура, инварианты
и точные рецепты типовых изменений. **При изменении архитектуры обновляй этот файл.**

## Что это

Браузерное расширение (Manifest V3) для быстрого on-page SEO-аудита текущей вкладки.
Chrome, Opera, Яндекс Браузер и другие Chromium с MV3. Версия 0.2.0.
Локально: `D:\onpage-seo-assistant`. Полное ТЗ: `docs/TZ.md`. Анализ аналогов: `docs/RESEARCH.md`.

## Команды

```bash
npm install
npm run build       # icons -> UI -> content -> service worker, всё в dist/
npm test            # vitest, 65 тестов
npm run typecheck   # tsc для src + отдельно для конфигов
npm run lint
npm run zip         # release/onpage-seo-assistant-<version>.zip
```

Загрузка: `chrome://extensions` → Developer mode → Load unpacked → папка **`dist`** (не корень).

## Ключевой инвариант архитектуры

**Ядро аудита не знает про DOM и про chrome.\*.** Это главное правило проекта.

```
content script  →  PageData (чистые данные, JSON-safe)
                        ↓
              runAudit(PageData, options)   ← чистая функция, тестируется в Node
                        ↓
                   AuditResult  →  popup UI / экспорт
```

Из этого следует:
- Любое новое поле, нужное правилу, сначала добавляется в `PageData` (`src/shared/types.ts`)
  и собирается в `src/content/collector.ts`. Правило **не может** обратиться к `document`.
- `runAudit` детерминирован: одинаковый вход → побайтово одинаковый выход (кроме `analyzedAt`).
  Есть тест на это в `tests/unit/scoring.test.ts`.
- Тексты правил не живут в коде — только в `src/locales/{ru,en}.json`.

## Карта файлов

| Путь | Роль |
|---|---|
| `src/shared/types.ts` | **Все** структуры данных. Начинай отсюда при любом изменении модели |
| `src/shared/constants.ts` | Лимиты коллектора, дефолтные настройки, ключи storage, цвета подсветки |
| `src/shared/messages.ts` | Типы сообщений popup ↔ service worker ↔ content script |
| `src/shared/i18n.ts` | `createTranslate(lang)` → `t('rules.META-001.t')`. Fallback: en → ru → сам ключ |
| `src/shared/storage.ts` | chrome.storage.local: настройки и история |
| `src/content/collector.ts` | Единственное место, где читается DOM. Возвращает `PageData` |
| `src/content/selector.ts` | Генерация CSS-селектора элемента (id или `:nth-of-type`-путь) |
| `src/content/highlighter.ts` | Оверлеи в shadow DOM, прокрутка, Esc снимает подсветку |
| `src/content/index.ts` | Обработчик сообщений, защита от двойной инъекции |
| `src/core/rules/*.ts` | Правила по категориям. Каждое — объект `AuditRule` |
| `src/core/rules/types.ts` | `AuditRule`, `AuditContext`, `MetaIndex`, хелпер `group()` |
| `src/core/scoring/weights.ts` | Веса категорий и таблица штрафов `PENALTIES` |
| `src/core/scoring/score.ts` | `computeScore` — формула `100 − сумма штрафов`, clamp 0..100 |
| `src/core/analyzers/audit.ts` | `runAudit` — прогон правил, сортировка, сборка `AuditResult` |
| `src/core/analyzers/text.ts` | Токенизация, n-граммы, стоп-слова ru+en, `analyzeKeyword` |
| `src/core/export/index.ts` | JSON / CSV / Markdown / HTML-отчёт / текст сводки |
| `src/background/service-worker.ts` | Инъекция content script, роутинг сообщений, сеть |
| `src/background/robots.ts` | Парсер robots.txt + матчинг правил по алгоритму Google |
| `src/background/link-checker.ts` | HEAD-проверка ссылок с пулом воркеров и прогрессом |
| `src/popup/App.tsx` | Состояние, вкладки, пересчёт аудита через `useMemo` |
| `src/popup/api.ts` | Обёртка над sendMessage, запрос host-разрешений, скачивание файлов |
| `src/options/Options.tsx` | Настройки + история аудитов |

## Как добавить новое правило (главный сценарий)

1. Выбери **новый** ID по схеме `КАТЕГОРИЯ-NNN` (`META`, `HEAD`, `LINK`, `IMG`, `SD`, `SOC`,
   `CNT`, `TECH`). **ID никогда не переиспользуются и не перенумеровываются** — они попадают
   в экспортированные отчёты пользователей.
2. Добавь объект в соответствующий файл `src/core/rules/*.ts`:
   ```ts
   {
     id: 'META-023',
     category: 'meta',        // определяет вес в Score
     severity: 'warning',
     applicable: (ctx) => ...,  // необязательно: false = правило вообще пропускается
     run: (ctx) => найдено ? { selector, value, params } : null,
   }
   ```
   `run` возвращает `null` → правило попадёт в список «пройдено».
   Для множественных совпадений используй `group(findings)` — он сложит их в одну issue
   с `count` и `selectors`.
3. Добавь тексты в **оба** файла `src/locales/ru.json` и `src/locales/en.json`:
   `"META-023": { "t": "...", "d": "...", "r": "..." }`. Плейсхолдеры вида `{max}`
   подставляются из `finding.params`.
4. Добавь штраф в `PENALTIES` (`src/core/scoring/weights.ts`). Без записи возьмётся
   дефолт по severity: error 8, warning 3, info 0.
5. Напиши тест в `tests/unit/rules.test.ts`, используя фабрики из `tests/fixtures/page.ts`.

Правило регистрируется автоматически через `src/core/rules/index.ts` — там же порядок вывода.

## Скоринг

- `overall = clamp(100 − Σ scoreImpact)`. Категория и группа считаются той же формулой
  по своему подмножеству issue — поэтому любое число в UI можно разложить обратно.
- Штраф за правило растёт с количеством совпадений, но **ограничен**:
  1 совпадение = base, 2–4 = ×1.5, 5+ = ×2 (`penaltyFor`). Без этого страница с 300
  картинками без alt обнуляла бы Score.
- Веса категорий в сумме = 100. `technical` имеет вес 0: его проверки либо
  информационные, либо уже учтены в `indexing`.
- Группы: `technical` = indexing + canonical + technical + links;
  `content` = meta + headings + content + images; `social` = social + schema.

## Сборка: почему три конфига Vite

- `vite.config.ts` — popup.html + options.html. Идёт **первым**, владеет `emptyOutDir`
  и копированием `public/` (манифест, `_locales`, иконки).
- `vite.config.content.ts` — content script одним IIFE-файлом. Иначе
  `chrome.scripting.executeScript({files})` не разрешит импорты.
- `vite.config.sw.ts` — service worker одним IIFE-файлом (классический, не module).

Оба «библиотечных» конфига идут с `emptyOutDir: false`, **порядок в `npm run build` менять нельзя.**

Иконки генерируются `scripts/gen-icons.mjs` (ручной PNG-энкодер на `zlib`, без зависимостей).
`public/icons/*.png` в `.gitignore` — это артефакт сборки.

## Разрешения и приватность

При установке запрашиваются только `activeTab`, `scripting`, `storage`, `downloads`.
Доступ к сайтам (`http://*/*`, `https://*/*`) лежит в `optional_host_permissions` и
запрашивается **из обработчика клика** в popup (`requestHostPermission`) только перед
сетевыми проверками — Chrome требует user gesture.

Расширение не отправляет данные наружу. Сетевые запросы бывают только к robots.txt,
sitemap.xml, текущему URL и к адресам ссылок самой страницы — при явном действии пользователя.
См. `PRIVACY.md`.

## Подводные камни, на которые уже наступили

- **`document.characterSet` бесполезен** для проверки `<meta charset>`: браузер всегда его
  заполняет. Используется `declaredCharset()` в коллекторе.
- **`img.complete && naturalWidth === 0`** — единственный надёжный признак незагрузившейся
  картинки. У SVG эта эвристика не работает, поэтому они обрабатываются отдельной веткой.
- **Селекторы устаревают** после перерисовки SPA. `highlight()`/`scrollTo()` ловят исключения
  `querySelector` и возвращают количество реально найденных элементов, а не падают.
- **`cssPath` был квадратичным.** Наивный вариант делал `Array.from(parent.children)` на каждый
  элемент: страница с 2000 ссылок собиралась 396 секунд. Сейчас первый вызов заполняет кэш
  сегментов сразу для всех детей родителя — 0.8 с на том же тесте. Кэш сбрасывается в начале
  каждого `collectPageData()`, иначе после ререндера SPA вернутся устаревшие индексы.
- **CORS-ошибку нельзя отличить от сетевой** по одному `fetch`. Повторный запрос с
  `mode: 'no-cors'`: успех (opaque-ответ) — значит хост жив и мешал CORS; провал — реальная
  сетевая ошибка. Ни то ни другое не считается битой ссылкой.
- **Значения страницы ломают Markdown-таблицы.** Один символ `|` в title сдвигает все колонки —
  ячейки прогоняются через `mdCell()`.
- **Service worker в MV3 умирает между событиями** — ничего нельзя кэшировать в модульной
  области. Всё состояние только в `chrome.storage`.
- **Скачивание файлов невозможно из service worker**: там нет `URL.createObjectURL`.
  Blob создаётся в popup (`downloadFile` в `src/popup/api.ts`).
- **`sendResponse` асинхронно** требует `return true` из слушателя `onMessage`.
- CSS-переменные тёмной темы задаются дважды: через `prefers-color-scheme` и через
  `:root[data-theme="dark"]`, чтобы ручной выбор в настройках перебивал системный.

## Состояние по релизам

Готово (0.1 + 0.2 + большая часть 0.3): весь локальный аудит, 85 правил, подсветка,
экспорт в 4 формата, история, настройки, robots.txt/sitemap/X-Robots-Tag, HTTP-статусы ссылок,
частотность и n-граммы, проверка ключевой фразы, ru/en, тёмная тема.

Не сделано: e2e-тесты Playwright, CI, публикация в магазины, расширенная валидация
обязательных полей Schema.org по типам (Product/Article/FAQPage), readability-метрики.

Известные ограничения, о которых спрашивают:
- **CSS background-image не анализируются** — собираются только `<img>` и inline `<svg>`.
  Это осознанно: у фона нет alt и он не участвует в поиске по картинкам. Есть тест, что
  фон не попадает в список изображений.
- **Виртуализации списков нет.** Таблицы ссылок и изображений режутся до 500 и 300 строк
  соответственно, с подписью «Показано N из M». Полные данные есть в экспорте.
- **Содержимое iframe не анализируется** (`TECH-007` помечает это явно).

Ручной приёмочный прогон и статус релиза: `docs/ACCEPTANCE.md`.
