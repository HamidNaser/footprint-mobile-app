/**
 * Contract tests for the theme system.
 *
 * These guard the thing that makes a second theme cheap: every registered theme
 * must satisfy the same token contract, so a Theme* component can read any
 * token from any theme without a null check. A half-finished asset kit should
 * fail here, at `npm test`, rather than as a blank screen on a device.
 */
import { createTheme, BASE_THEME, ICON_NAMES } from '../tokens';
import { THEMES, THEME_KEYS, resolveTheme, DEFAULT_THEME_KEY, ALL_FONT_ASSETS } from '../themes';

describe('createTheme', () => {
  it('fills every base token when the partial declares nothing', () => {
    const theme = createTheme({ key: 'empty', label: 'Empty' });
    expect(Object.keys(theme.colors)).toEqual(Object.keys(BASE_THEME.colors));
    expect(theme.radii).toEqual(BASE_THEME.radii);
    expect(theme.spacing).toEqual(BASE_THEME.spacing);
  });

  it('merges nested tokens instead of replacing the whole group', () => {
    const theme = createTheme({ colors: { primary: '#123456' } });
    expect(theme.colors.primary).toBe('#123456');
    // Siblings survive the merge -- this is what lets a theme override one colour.
    expect(theme.colors.textPrimary).toBe(BASE_THEME.colors.textPrimary);
  });

  it('assigns components wholesale rather than merging them', () => {
    const Icon = () => null;
    const theme = createTheme({ Icon });
    expect(theme.Icon).toBe(Icon);
  });

  it('does not mutate the base theme', () => {
    const before = BASE_THEME.colors.primary;
    createTheme({ colors: { primary: '#000000' } });
    expect(BASE_THEME.colors.primary).toBe(before);
  });
});

describe('theme registry', () => {
  it('registers at least the default theme', () => {
    expect(THEME_KEYS).toContain(DEFAULT_THEME_KEY);
    expect(THEME_KEYS.length).toBeGreaterThan(0);
  });

  it.each(THEME_KEYS)('%s satisfies the token contract', (key) => {
    const theme = THEMES[key];

    expect(theme.key).toBe(key);
    expect(typeof theme.label).toBe('string');
    expect(theme.label.length).toBeGreaterThan(0);

    // Every colour the components read must exist and be a real value.
    for (const token of Object.keys(BASE_THEME.colors)) {
      expect(typeof theme.colors[token]).toBe('string');
      expect(theme.colors[token].length).toBeGreaterThan(0);
    }

    // Every typography role, and every border role.
    for (const role of Object.keys(BASE_THEME.typography)) {
      expect(typeof theme.typography[role].size).toBe('number');
    }
    for (const role of Object.keys(BASE_THEME.borders)) {
      expect(typeof theme.borders[role].width).toBe('number');
      expect(typeof theme.borders[role].color).toBe('string');
    }

    // A theme without an icon set would render an app with no icons at all.
    expect(typeof theme.Icon).toBe('function');
  });

  it.each(THEME_KEYS)('%s renders every semantic icon name', (key) => {
    const { Icon } = THEMES[key];
    for (const name of ICON_NAMES) {
      // Icon sets are plain components; calling them directly is enough to
      // catch a missing entry without pulling in a renderer.
      expect(() => Icon({ name, size: 24, color: '#000', active: false })).not.toThrow();
      expect(Icon({ name, size: 24, color: '#000', active: false })).not.toBeNull();
    }
  });

  it('falls back to the default theme for an unknown key', () => {
    expect(resolveTheme('no-such-theme').key).toBe(DEFAULT_THEME_KEY);
    expect(resolveTheme(undefined).key).toBe(DEFAULT_THEME_KEY);
  });

  it('collects font assets from every theme into one load', () => {
    const declared = Object.values(THEMES).flatMap((t) => Object.keys(t.fontAssets || {}));
    expect(Object.keys(ALL_FONT_ASSETS).sort()).toEqual([...new Set(declared)].sort());
  });
});
