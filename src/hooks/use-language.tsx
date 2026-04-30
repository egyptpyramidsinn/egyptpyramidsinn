'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { localeLoaders } from '@/locales';
import type { TranslationMap } from '@/locales';

const LOCALE_COOKIE = 'NEXT_LOCALE';

function writeLocaleCookie(lang: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export type Language = string;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
}

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Cache of already-loaded translation maps (avoids re-fetching)
const loadedLocales: Record<string, Partial<TranslationMap>> = {};

function toSupportedLocale(candidate: string | null | undefined): Language | null {
  if (!candidate) return null;
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) return null;
  if (localeLoaders[normalized]) return normalized;

  const baseLocale = normalized.split('-')[0];
  return localeLoaders[baseLocale] ? baseLocale : null;
}

function detectBrowserLocale(): Language | null {
  if (typeof navigator === 'undefined') return null;
  const browserLocales = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];

  for (const locale of browserLocales) {
    const supportedLocale = toSupportedLocale(locale);
    if (supportedLocale) return supportedLocale;
  }

  return null;
}

async function loadLocale(lang: Language): Promise<Partial<TranslationMap>> {
  if (loadedLocales[lang]) return loadedLocales[lang];
  const loader = localeLoaders[lang];
  if (!loader) return {};
  const mod = await loader();
  loadedLocales[lang] = mod.default ?? mod;
  return loadedLocales[lang];
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  // translations for the current language — starts populated from en.json
  const [translations, setTranslations] = useState<Partial<TranslationMap>>({});
  // fallback (English) — loaded once on mount
  const [fallback, setFallback] = useState<Partial<TranslationMap>>({});
  const router = useRouter();
  const prevLanguageRef = useRef<Language | null>(null);
  const userTriggeredLanguageChangeRef = useRef(false);

  // Load English first so t() never returns bare keys
  useEffect(() => {
    loadLocale('en').then((en) => {
      setFallback(en);
      // Also use it as the active locale if language is already "en"
      setTranslations((prev) => (Object.keys(prev).length === 0 ? en : prev));
    });
  }, []);

  // Resolve startup language with this priority:
  // localStorage (supported only) -> browser language -> English fallback.
  useEffect(() => {
    const saved = toSupportedLocale(localStorage.getItem('language'));
    const detected = detectBrowserLocale();
    const initial = saved ?? detected ?? 'en';

    if (initial !== 'en') {
      setLanguageState(initial);
    }

    writeLocaleCookie(initial);
    prevLanguageRef.current = initial;
  }, []);

  // Load locale file whenever language changes
  useEffect(() => {
    loadLocale(language).then(setTranslations);

    localStorage.setItem('language', language);
    document.documentElement.dir = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    writeLocaleCookie(language);

    // Only refresh server components for explicit user locale switches.
    const prev = prevLanguageRef.current;
    if (prev !== null && prev !== language && userTriggeredLanguageChangeRef.current) {
      router.refresh();
    }

    userTriggeredLanguageChangeRef.current = false;
    prevLanguageRef.current = language;
  }, [language, router]);

  const setLanguage = useCallback((lang: Language) => {
    const supportedLanguage = toSupportedLocale(lang);
    if (supportedLanguage) {
      setLanguageState((prev) => {
        if (prev === supportedLanguage) return prev;
        userTriggeredLanguageChangeRef.current = true;
        return supportedLanguage;
      });
    } else {
      console.warn(`[i18n] Unknown locale "${lang}". Add it to src/locales/index.ts.`);
    }
  }, []);

  const t = useCallback(
    (key: string): string =>
      (translations as Record<string, string>)[key] ??
      (fallback as Record<string, string>)[key] ??
      key,
    [translations, fallback]
  );

  const dir: 'ltr' | 'rtl' = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

/**
 * List of supported languages shown in the language switcher UI.
 * Add new entries here when adding a new locale JSON file.
 */
export const languages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ar', name: 'العربية', flag: '🇪🇬' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
];
