import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslate, type Translate } from '../shared/i18n';
import type { Lang } from '../shared/types';

interface I18nValue {
  t: Translate;
  lang: Lang;
}

const I18nContext = createContext<I18nValue>({ t: createTranslate('ru'), lang: 'ru' });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ t: createTranslate(lang), lang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
