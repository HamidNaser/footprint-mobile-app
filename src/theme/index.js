/**
 * Public entry point for the theme system.
 *
 *   import { ThemeProvider, useTheme, ThemeCard } from '../theme';
 *
 * Adding a theme means adding a file to ./themes and registering it there.
 * Nothing in this barrel, and nothing in the Theme* components, changes.
 */
export {
  ThemeProvider,
  useTheme,
  useThemeControls,
  useThemedStyles,
  textStyle,
} from './ThemeContext';

export {
  THEMES,
  THEME_KEYS,
  THEME_OPTIONS,
  DEFAULT_THEME_KEY,
  resolveTheme,
} from './themes';

export { createTheme, BASE_THEME, ICON_NAMES } from './tokens';

export * from './components';
