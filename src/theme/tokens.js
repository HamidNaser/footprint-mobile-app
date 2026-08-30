/**
 * Theme token contract.
 *
 * A theme is DATA, not code. Every visual decision a Theme* component makes is
 * read from the object described here, so adding a theme means adding one file
 * to `src/theme/themes/` and registering it -- no component changes.
 *
 * `createTheme` deep-merges a partial over BASE_THEME, so a new theme only
 * declares what differs from the base. That is the whole point: when the next
 * asset kit arrives, it should be a single file of colours, radii, fonts and an
 * icon component.
 *
 * ---------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------------
 *   key          string    stable id, persisted in settings
 *   label        string    shown in the Settings picker
 *   isDark       bool      drives StatusBar bar-style
 *   colors       object    see BASE_THEME.colors -- all semantic, never named
 *                          after a hue ("primary", not "burgundy")
 *   typography   object    per-role { family, weight, size, letterSpacing }
 *   fontAssets   object    expo-font map merged across ALL themes and loaded
 *                          once at startup; {} when the theme uses system fonts
 *   radii        object    corner radii by role
 *   borders      object    { width, color } by role -- ornate themes use thick
 *                          double borders, flat themes use hairlines
 *   spacing      object    xs..xxl scale
 *   shadows      object    RN shadow objects by role
 *   Icon         component ({ name, size, color, active }) => element
 *   decor        object    optional ornament components; a flat theme supplies
 *                          none and the same Theme* components render plainly
 */

/** Semantic icon names every icon set must handle. */
export const ICON_NAMES = [
  'home', 'journal', 'family', 'friends', 'places', 'timeline',
  'location', 'calendar', 'search', 'notification', 'settings',
  'add-person', 'chevron-down', 'chevron-up',
];

/**
 * The floor every theme stands on. A theme that declares nothing still renders
 * a usable (if plain) screen -- which is what makes a half-finished asset kit
 * safe to drop in.
 */
export const BASE_THEME = {
  key: 'base',
  label: 'Base',
  isDark: false,

  colors: {
    // Surfaces
    background: '#FFFFFF',
    backgroundAlt: '#F5F5F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F0F0F0',
    surfaceSelected: '#FFFFFF',

    // Lines
    border: '#E0E0E0',
    borderStrong: '#C7C7CC',
    borderAccent: '#4361EE',

    // Brand
    primary: '#4361EE',
    onPrimary: '#FFFFFF',
    accent: '#4361EE',
    onAccent: '#FFFFFF',

    // Text
    textPrimary: '#333333',
    textSecondary: '#888888',
    textOnPrimary: '#FFFFFF',

    // Navigation
    navBackground: '#FFFFFF',
    navBorder: '#E0E0E0',
    navActive: '#4361EE',
    navInactive: '#8E8E93',
    navIndicator: 'transparent',

    // Floating action button
    fabBackground: '#F97316',
    fabForeground: '#FFFFFF',
    fabBorder: 'transparent',

    // Status
    danger: '#FF3B30',
    success: '#34C759',
  },

  typography: {
    display: { family: undefined, weight: '600', size: 20, letterSpacing: 0 },
    title:   { family: undefined, weight: '600', size: 16, letterSpacing: 0 },
    body:    { family: undefined, weight: '500', size: 14, letterSpacing: 0 },
    label:   { family: undefined, weight: '500', size: 12, letterSpacing: 0 },
    caption: { family: undefined, weight: '400', size: 11, letterSpacing: 0 },
    navLabel:{ family: undefined, weight: '500', size: 10, letterSpacing: 0 },
  },

  fontAssets: {},

  radii: { card: 12, control: 20, pill: 999, avatar: 999, thumb: 8 },

  borders: {
    card:      { width: 2, color: '#E0E0E0' },
    cardInner: { width: 0, color: 'transparent' },
    control:   { width: 0, color: 'transparent' },
    avatar:    { width: 1, color: '#E0E0E0' },
    avatarInner:{ width: 0, color: 'transparent' },
    nav:       { width: 0, color: 'transparent' },
    screen:    { width: 0, color: 'transparent' },
    screenInner:{ width: 0, color: 'transparent' },
  },

  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },

  shadows: {
    card: {
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
    },
    fab: {
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
  },

  // Set by each theme; see src/theme/icons/
  Icon: null,

  /**
   * Optional ornament components. Every one is nullable -- ThemeBackground and
   * friends check before rendering, so a theme with no decorative assets simply
   * gets none instead of a crash or an empty box.
   */
  decor: {
    ScreenBackground: null,  // ({ children }) full-bleed frame + vines etc.
    HeaderOrnament: null,    // ({ width, color }) flourish under a title
    Divider: null,           // ({ width }) between sections
  },
};

// Components, functions and RN style objects are assigned wholesale rather than
// merged key by key -- deep-merging a component would silently yield a broken
// object that only fails at render time.
const isMergeable = (v) =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  v.$$typeof === undefined;

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    out[key] = isMergeable(value) && isMergeable(base?.[key])
      ? deepMerge(base[key], value)
      : value;
  }
  return out;
}

/** Build a full theme from a partial. */
export function createTheme(partial) {
  return deepMerge(BASE_THEME, partial);
}
