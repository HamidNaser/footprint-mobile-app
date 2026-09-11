/**
 * Default theme -- the app's current look, captured as tokens.
 *
 * This exists so switching themes is symmetric: "turn the new theme off" is a
 * theme, not a code path. It deliberately reuses the hex values already in the
 * screens so nothing shifts when a migrated screen falls back to it.
 */
import { createTheme } from '../tokens';
import IoniconsSet from '../icons/IoniconsSet';

export default createTheme({
  key: 'default',
  label: 'Default',
  isDark: false,

  colors: {
    background: '#F8F9FA',
    backgroundAlt: '#F0F0F0',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F0F0',
    surfaceSelected: '#FFFFFF',

    border: '#E0E0E0',
    borderStrong: '#C7C7CC',
    borderAccent: '#4361EE',

    primary: '#4361EE',
    onPrimary: '#FFFFFF',
    accent: '#4361EE',
    onAccent: '#FFFFFF',

    textPrimary: '#333333',
    textSecondary: '#888888',

    navBackground: '#FFFFFF',
    navBorder: '#E0E0E0',
    navActive: '#2B7DE9',
    navInactive: '#8E8E93',
    navIndicator: 'transparent',

    fabBackground: '#F97316',
    fabForeground: '#FFFFFF',
    fabBorder: 'transparent',
  },

  Icon: IoniconsSet,
});
