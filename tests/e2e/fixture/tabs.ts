import '../../../src/popup/styles.css';
import ru from '../../../src/locales/ru.json';
import en from '../../../src/locales/en.json';

/**
 * Renders only the popup's tab strip, with the real stylesheet and the real
 * labels, so the layout can be measured at popup width in a real browser.
 */
const TABS = [
  'overview',
  'meta',
  'headings',
  'links',
  'images',
  'schema',
  'social',
  'content',
  'technical',
] as const;

const params = new URLSearchParams(location.search);
const dict = params.get('lang') === 'en' ? en : ru;

const host = document.getElementById('tabs')!;
for (const [index, id] of TABS.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.role = 'tab';
  button.className = `tabs__btn${index === 0 ? ' tabs__btn--active' : ''}`;
  button.setAttribute('aria-selected', String(index === 0));
  button.textContent = (dict.ui.tabs as Record<string, string>)[id];
  host.appendChild(button);
}
