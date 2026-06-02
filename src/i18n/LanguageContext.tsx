import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import en_app from "./dictionaries/en/app";
import en_guide from "./dictionaries/en/guide";
import es_app from "./dictionaries/es/app";
import es_guide from "./dictionaries/es/guide";
import he_app from "./dictionaries/he/app";
import he_guide from "./dictionaries/he/guide";

export type Language = "en" | "es" | "he";
export type ContentMode = "app" | "guide" | "marketing";

const LANG_STORAGE_KEY = "stafly.lang.v1";
const MODE_STORAGE_KEY = "stafly.contentMode.v1";

type Dict = Record<string, string>;

// dictionary lookup table; "marketing" reserved but not populated in v1.
const DICTIONARIES: Record<Language, Record<ContentMode, Dict>> = {
  en: { app: en_app, guide: en_guide, marketing: {} },
  es: { app: es_app, guide: es_guide, marketing: {} },
  he: { app: he_app, guide: he_guide, marketing: {} },
};

const RTL_LANGUAGES: ReadonlySet<Language> = new Set(["he"]);

function detectInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === "en" || stored === "es" || stored === "he") return stored;
  // Fallback to browser preference; default to English.
  const nav = window.navigator?.language?.toLowerCase() ?? "";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("he") || nav.startsWith("iw")) return "he";
  return "en";
}

function detectInitialMode(): ContentMode {
  if (typeof window === "undefined") return "app";
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === "app" || stored === "guide" || stored === "marketing") return stored;
  return "app";
}

interface LanguageContextValue {
  language: Language;
  contentMode: ContentMode;
  setLanguage: (lang: Language) => void;
  setContentMode: (mode: ContentMode) => void;
  /** Translate a key. Falls back: <lang,mode> → <lang,app> → <en,app> → key. Never throws. */
  t: (key: string, vars?: Record<string, string | number>, modeOverride?: ContentMode) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectInitialLanguage());
  const [contentMode, setContentModeState] = useState<ContentMode>(() => detectInitialMode());

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // localStorage unavailable; ignore.
    }
  }, []);

  const setContentMode = useCallback((mode: ContentMode) => {
    setContentModeState(mode);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback<LanguageContextValue["t"]>(
    (key, vars, modeOverride) => {
      const mode = modeOverride ?? contentMode;
      const primary = DICTIONARIES[language]?.[mode]?.[key];
      if (primary) return interpolate(primary, vars);
      const langAppFallback = DICTIONARIES[language]?.app?.[key];
      if (langAppFallback) return interpolate(langAppFallback, vars);
      const englishFallback = DICTIONARIES.en.app[key];
      if (englishFallback) return interpolate(englishFallback, vars);
      return key;
    },
    [language, contentMode]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, contentMode, setLanguage, setContentMode, t }),
    [language, contentMode, setLanguage, setContentMode, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Hook returning `{ t, language, contentMode, setLanguage, setContentMode }`.
 *  Safe to call outside the provider: falls back to English/app and a no-op setter. */
export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (ctx) return ctx;
  // Safety net: never crash UI if provider is missing.
  return {
    language: "en",
    contentMode: "app",
    setLanguage: () => {},
    setContentMode: () => {},
    t: (key, vars) => {
      const v = DICTIONARIES.en.app[key];
      return v ? interpolate(v, vars) : key;
    },
  };
}
