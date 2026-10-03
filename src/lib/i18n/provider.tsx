"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { dictionaries, type TranslationKey } from "./dictionaries";
import { LOCALE_COOKIE, type Locale } from "./locale";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [current, setCurrent] = useState<Locale>(locale);

  const setLocale = useCallback((next: Locale) => {
    setCurrent(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: current,
      setLocale,
      t: (key) => dictionaries[current][key] ?? key,
    }),
    [current, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return context;
}