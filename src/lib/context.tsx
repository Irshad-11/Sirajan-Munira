import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthChange, signInAdmin, signOutAdmin, trackEvent } from './supabase';

// ---------------------------------------------------------------------------
// Admin auth context (FR-27–29)
// ---------------------------------------------------------------------------

interface AdminCtx {
  isAdmin: boolean;
  loading: boolean;
  loginOpen: boolean;
  setLoginOpen: (v: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AdminContext = createContext<AdminCtx | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession()
      .then(setSession)
      .finally(() => setLoading(false));
    return onAuthChange(setSession);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const s = await signInAdmin(email, password);
      setSession(s);
      setLoginOpen(false);
    } catch (e: any) {
      setError(e.message || 'Login failed');
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOutAdmin();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ isAdmin: !!session, loading, loginOpen, setLoginOpen, login, logout, error }),
    [session, loading, loginOpen, login, logout, error]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Reader preferences (FR-19–20, FR-23–25) — all client-side only
// ---------------------------------------------------------------------------

export const THEMES = [
  { id: 'paper-light', label: 'Paper Light', group: 'light', mode: 'light' },
  { id: 'ivory', label: 'Ivory', group: 'light', mode: 'light' },
  { id: 'sepia', label: 'Sepia', group: 'sepia', mode: 'light' },
  { id: 'old-manuscript', label: 'Old Manuscript', group: 'sepia', mode: 'light' },
  { id: 'slate-dark', label: 'Slate Dark', group: 'dark', mode: 'dark' },
  { id: 'midnight', label: 'Midnight', group: 'low-light', mode: 'dark' },
  { id: 'charcoal', label: 'Charcoal', group: 'dark', mode: 'dark' },
  { id: 'forest', label: 'Forest', group: 'dark', mode: 'dark' },
  { id: 'high-contrast-light', label: 'High Contrast (Light)', group: 'high-contrast', mode: 'light' },
  { id: 'high-contrast-dark', label: 'High Contrast (Dark)', group: 'high-contrast', mode: 'dark' },
  { id: 'rose-dusk', label: 'Rose Dusk', group: 'low-light', mode: 'dark' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type EnglishFont = 'inter' | 'roboto' | 'lora';

export interface CopyFormatSettings {
  includeBookTitle: boolean;
  includePageNumber: boolean;
  includeSourceLink: boolean;
  order: ('content' | 'title' | 'page' | 'source')[];
}

const DEFAULT_COPY_SETTINGS: CopyFormatSettings = {
  includeBookTitle: true,
  includePageNumber: true,
  includeSourceLink: true,
  order: ['content', 'title', 'page', 'source'],
};

interface PrefsCtx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  englishFont: EnglishFont;
  setEnglishFont: (f: EnglishFont) => void;
  bookmarks: string[];
  toggleBookmark: (headingId: string) => void;
  isBookmarked: (headingId: string) => boolean;
  copySettings: CopyFormatSettings;
  setCopySettings: (s: CopyFormatSettings) => void;
  clearLocalData: () => void;
}

const PrefsContext = createContext<PrefsCtx | null>(null);

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readLS('sm_theme', 'paper-light' as ThemeId));
  const [englishFont, setFontState] = useState<EnglishFont>(() => readLS('sm_font', 'inter' as EnglishFont));
  const [bookmarks, setBookmarks] = useState<string[]>(() => readLS('sm_bookmarks', [] as string[]));
  const [copySettings, setCopySettingsState] = useState<CopyFormatSettings>(() =>
    readLS('sm_copy_settings', DEFAULT_COPY_SETTINGS)
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-mode', THEMES.find((t) => t.id === theme)?.mode || 'light');
    localStorage.setItem('sm_theme', JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-font', englishFont);
    localStorage.setItem('sm_font', JSON.stringify(englishFont));
  }, [englishFont]);

  const toggleBookmark = useCallback((headingId: string) => {
    setBookmarks((prev) => {
      const next = prev.includes(headingId) ? prev.filter((id) => id !== headingId) : [...prev, headingId];
      localStorage.setItem('sm_bookmarks', JSON.stringify(next));
      return next;
    });
  }, []);

  const isBookmarked = useCallback((headingId: string) => bookmarks.includes(headingId), [bookmarks]);

  const setCopySettings = useCallback((s: CopyFormatSettings) => {
    setCopySettingsState(s);
    localStorage.setItem('sm_copy_settings', JSON.stringify(s));
  }, []);

  const clearLocalData = useCallback(() => {
    localStorage.removeItem('sm_bookmarks');
    localStorage.removeItem('sm_theme');
    localStorage.removeItem('sm_font');
    localStorage.removeItem('sm_copy_settings');
    setBookmarks([]);
    setThemeState('paper-light');
    setFontState('inter');
    setCopySettingsState(DEFAULT_COPY_SETTINGS);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      englishFont,
      setEnglishFont: setFontState,
      bookmarks,
      toggleBookmark,
      isBookmarked,
      copySettings,
      setCopySettings,
      clearLocalData,
    }),
    [theme, englishFont, bookmarks, toggleBookmark, isBookmarked, copySettings, setCopySettings, clearLocalData]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Analytics tracking hook (FR-32)
// ---------------------------------------------------------------------------

export function useTrackView(targetType: 'book' | 'heading' | 'category' | 'site', targetId: string | null) {
  useEffect(() => {
    trackEvent('view', targetType, targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, targetId]);
}