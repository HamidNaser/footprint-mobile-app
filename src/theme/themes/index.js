/**
 * Theme registry.
 *
 * Adding a theme = add a file next to this one and add it to THEMES. Nothing
 * else in the app needs to change: the Settings picker, the font loader and
 * every Theme* component read from here.
 */
import defaultTheme from './default';
import enchantedStorybook from './enchantedStorybook';

export const THEMES = {
  [defaultTheme.key]: defaultTheme,
  [enchantedStorybook.key]: enchantedStorybook,
};

export const THEME_KEYS = Object.keys(THEMES);

export const DEFAULT_THEME_KEY = defaultTheme.key;

/** Never throws -- an unknown key (removed theme, corrupt storage) falls back. */
export function resolveTheme(key) {
  return THEMES[key] || THEMES[DEFAULT_THEME_KEY];
}

/** Every theme's font assets, merged for a single startup load. */
export const ALL_FONT_ASSETS = Object.values(THEMES).reduce(
  (acc, theme) => ({ ...acc, ...(theme.fontAssets || {}) }),
  {}
);

/** For the Settings picker. */
export const THEME_OPTIONS = Object.values(THEMES).map((t) => ({
  key: t.key,
  label: t.label,
}));
