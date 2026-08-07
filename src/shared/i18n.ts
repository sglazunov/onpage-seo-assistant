import ru from '../locales/ru.json';
import en from '../locales/en.json';
import type { Lang } from './types';

const DICTS = { ru, en } as const;

export type Dict = typeof ru;

export type Translate = (key: string, params?: Record<string, string | number>) => string;

function lookup(dict: unknown, path: string[]): string | undefined {
  let node: unknown = dict;
  for (const part of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * Resolves a dotted key against the active locale, falling back to Russian and
 * finally to the key itself. Never throws — a missing string must not break an
 * audit that is already half-rendered.
 */
export function createTranslate(lang: Lang): Translate {
  const primary = DICTS[lang] ?? DICTS.ru;
  return (key, params) => {
    const path = key.split('.');
    const hit = lookup(primary, path) ?? lookup(DICTS.ru, path);
    return hit === undefined ? key : interpolate(hit, params);
  };
}

export function detectLang(): Lang {
  const raw =
    typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage
      ? chrome.i18n.getUILanguage()
      : typeof navigator !== 'undefined'
        ? navigator.language
        : 'ru';
  return raw.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export const t_ru = createTranslate('ru');
export const t_en = createTranslate('en');
