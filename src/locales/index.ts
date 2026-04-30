/**
 * Locale loader — maps language codes to their translation JSON files.
 *
 * To add a new language:
 *   1. Create `src/locales/<code>.json` with the translated strings.
 *   2. Add one line here:  <code>: () => import("./<code>.json"),
 *   3. Add the language metadata to the `languages` array in `use-language.tsx`.
 *
 * That's it — no other code changes required.
 */

import type en from './en.json';

export type TranslationMap = typeof en;
export type TranslationKey = keyof TranslationMap;

/** Lazy loaders — each returns a JSON module with a `default` export. */
export const localeLoaders: Record<string, () => Promise<{ default: Partial<TranslationMap> }>> = {
  en: () => import('./en.json'),
  fr: () => import('./fr.json'),
  ar: () => import('./ar.json'),
  de: () => import('./de.json'),
  es: () => import('./es.json'),
  zh: () => import('./zh.json'),
  ru: () => import('./ru.json'),
};
