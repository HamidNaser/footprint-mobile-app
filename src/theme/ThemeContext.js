/**
 * ThemeProvider / useTheme
 *
 * Holds the active theme, persists the choice, and loads every registered
 * theme's fonts once at startup.
 *
 * Font loading is deliberately NON-BLOCKING. `useFonts` resolves asynchronously
 * and can fail (no network on first launch, a bad asset). Rather than gate the
 * app behind a splash screen, the provider strips `fontFamily` from the theme
 * until the fonts are actually ready, so the UI renders immediately in system
 * faces and swaps in the real ones when they land. A font problem can slow the
 * app down; it can't white-screen it.
 */
import React, {
  createContext, useContext, useState, useEffect, useMemo, useCallback,
} from 'react';
import { useFonts } from 'expo-font';
import SettingsService from '../services/SettingsService';
import {
  THEMES, THEME_OPTIONS, ALL_FONT_ASSETS, DEFAULT_THEME_KEY, resolveTheme,
} from './themes';

const ThemeContext = createContext(null);

/** Drop font families the loader hasn't delivered yet. */
function withSystemFonts(theme) {
  const typography = Object.fromEntries(
    Object.entries(theme.typography).map(([role, spec]) => [
      role,
      { ...spec, family: undefined },
    ])
  );
  return { ...theme, typography };
}

export function ThemeProvider({ children, initialThemeKey = DEFAULT_THEME_KEY }) {
  const [themeKey, setThemeKeyState] = useState(initialThemeKey);
  const [isHydrated, setIsHydrated] = useState(false);
  const [fontsLoaded, fontError] = useFonts(ALL_FONT_ASSETS);

  // Restore the persisted choice. Failure is not fatal -- we keep the initial.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SettingsService.getAppTheme();
        if (!cancelled && stored && THEMES[stored]) {
          setThemeKeyState(stored);
        }
      } catch {
        // keep initialThemeKey
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeKey = useCallback(async (key) => {
    if (!THEMES[key]) return;
    setThemeKeyState(key);
    try {
      await SettingsService.setAppTheme(key);
    } catch {
      // in-memory switch still applies
    }
  }, []);

  const fontsReady = fontsLoaded && !fontError;

  const theme = useMemo(() => {
    const resolved = resolveTheme(themeKey);
    return fontsReady ? resolved : withSystemFonts(resolved);
  }, [themeKey, fontsReady]);

  const value = useMemo(
    () => ({
      theme,
      themeKey,
      setThemeKey,
      options: THEME_OPTIONS,
      fontsReady,
      isHydrated,
    }),
    [theme, themeKey, setThemeKey, fontsReady, isHydrated]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Returns the active theme object.
 *
 * Falls back to the default theme when no provider is mounted so that a screen
 * rendered outside the tree (or in a test) still styles itself instead of
 * throwing.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx ? ctx.theme : resolveTheme(DEFAULT_THEME_KEY);
}

/** Full context -- for the Settings picker. */
export function useThemeControls() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeControls must be used inside a ThemeProvider');
  }
  return ctx;
}

/**
 * Build a StyleSheet from the active theme, rebuilt only when the theme changes.
 *
 *   const styles = useThemedStyles(makeStyles);
 *   const makeStyles = (t) => ({ card: { backgroundColor: t.colors.surface } });
 */
export function useThemedStyles(factory) {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}

/** Convenience: a text style for a typography role. */
export function textStyle(theme, role, overrides = {}) {
  const spec = theme.typography[role] || theme.typography.body;
  return {
    fontFamily: spec.family,
    fontSize: spec.size,
    fontWeight: spec.family ? undefined : spec.weight,
    letterSpacing: spec.letterSpacing,
    color: theme.colors.textPrimary,
    ...overrides,
  };
}
