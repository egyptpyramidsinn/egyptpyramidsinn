'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLanguage } from '@/hooks/use-language';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'AED';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  convert: (amount: number) => number;
  convertTo: (amount: number, targetCurrency: Currency) => number;
  format: (amount: number) => string;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const COUNTRY_COOKIE = 'NEXT_COUNTRY';
const IP_GEO_ENDPOINT = 'https://ipapi.co/json/';
const IP_GEO_TIMEOUT_MS = 3500;

const languageLocales: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  ar: 'ar-EG',
  zh: 'zh-CN',
  ru: 'ru-RU',
};

function isSupportedCurrency(value: string | null | undefined): value is Currency {
  return !!value && currencies.some((c) => c.code === value);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizeCountryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const normalized = country.trim().toUpperCase();
  return normalized.length === 2 ? normalized : null;
}

async function fetchCountryFromIp(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), IP_GEO_TIMEOUT_MS);

  try {
    const response = await fetch(IP_GEO_ENDPOINT, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { country_code?: string; country?: string };
    return normalizeCountryCode(data.country_code ?? data.country);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function CurrencyProvider({
  children,
  defaultCurrency,
}: {
  children: React.ReactNode;
  defaultCurrency?: string;
}) {
  const resolvedDefault =
    defaultCurrency && currencies.some((c) => c.code === defaultCurrency)
      ? (defaultCurrency as Currency)
      : 'USD';

  const [currency, setCurrency] = useState<Currency>(resolvedDefault);
  const { language } = useLanguage();
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    EGP: 47.5,
    SAR: 3.75,
    AED: 3.67,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load currency on mount while enforcing EGP for Egypt-based users.
  useEffect(() => {
    let isActive = true;

    const initializeCurrency = async () => {
      const savedCurrency = localStorage.getItem('currency');
      const preferredCurrency: Currency = isSupportedCurrency(savedCurrency)
        ? savedCurrency
        : resolvedDefault;

      const cookieCountry = normalizeCountryCode(readCookie(COUNTRY_COOKIE));
      const detectedCountry = cookieCountry ?? (await fetchCountryFromIp());
      const nextCurrency: Currency = detectedCountry === 'EG' ? 'EGP' : preferredCurrency;

      if (!isActive) return;
      setCurrency((current) => (current === nextCurrency ? current : nextCurrency));
    };

    initializeCurrency();

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch exchange rates from API
  useEffect(() => {
    const fetchRates = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'
        );
        if (!response.ok) throw new Error('Failed to fetch rates');
        const data = await response.json();

        // The API returns rates in lowercase (e.g. "eur": 0.92)
        // We need to map them to our uppercase Currency type
        const apiRates = data.usd;
        const newRates: Record<string, number> = { USD: 1 };

        currencies.forEach((c) => {
          if (c.code === 'USD') return;
          const rate = apiRates[c.code.toLowerCase()];
          if (rate) {
            newRates[c.code] = rate;
          }
        });

        setExchangeRates((prev) => ({ ...prev, ...newRates }));
      } catch (error) {
        console.error('Error fetching currency rates:', error);
        // Fallback is already set in initial state
      } finally {
        setIsLoading(false);
      }
    };

    fetchRates();
  }, []);

  // Save currency to local storage when changed
  useEffect(() => {
    localStorage.setItem('currency', currency);
  }, [currency]);

  const convertTo = (amount: number, targetCurrency: Currency) => {
    const rate = exchangeRates[targetCurrency] || 1;
    return amount * rate;
  };

  const convert = (amount: number) => {
    return convertTo(amount, currency);
  };

  const format = (amount: number) => {
    const convertedAmount = convert(amount);
    const locale = languageLocales[language] ?? 'en-US';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(convertedAmount);
  };

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency, convert, convertTo, format, isLoading }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

export const currencies = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
];
