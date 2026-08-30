/**
 * Enchanted Storybook.
 *
 * Palette from docs/CLAUDE_HANDOFF.md in the asset kit. Note the kit's own
 * reference image states different values for six of the seven roles; the
 * handoff doc wins here because it is the file a developer opens.
 *
 * Border widths are the kit's SVG stroke weights divided down to phone scale:
 * card-frame.svg is gold 5 + sage 2 at 900px wide, profile-frame.svg is gold 8
 * + burgundy 3 at 240px.
 */
import { createTheme } from '../tokens';
import StorybookIconSet from '../icons/StorybookIconSet';
import {
  StorybookScreenBackground,
  StorybookHeaderOrnament,
  StorybookDivider,
} from '../decor/StorybookDecor';

import {
  GreatVibes_400Regular,
} from '@expo-google-fonts/great-vibes';
import {
  Cinzel_500Medium,
  Cinzel_600SemiBold,
} from '@expo-google-fonts/cinzel';
import {
  Lora_400Regular,
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_400Regular_Italic,
} from '@expo-google-fonts/lora';

const BURGUNDY = '#6F2C4B';
const GOLD = '#D4AF37';
const SAGE = '#7A8F6A';
const PAPER = '#F7F2E7';
const SOFT = '#EFE6D3';
const INK = '#3A2E2A';
const INK_SOFT = '#8B735E';

export default createTheme({
  key: 'enchantedStorybook',
  label: 'Enchanted Storybook',
  isDark: false,

  colors: {
    background: PAPER,
    backgroundAlt: SOFT,
    surface: PAPER,
    surfaceAlt: SOFT,
    surfaceSelected: PAPER,

    border: SAGE,
    borderStrong: GOLD,
    borderAccent: BURGUNDY,

    primary: BURGUNDY,
    onPrimary: PAPER,
    accent: GOLD,
    onAccent: INK,

    textPrimary: INK,
    textSecondary: INK_SOFT,

    navBackground: PAPER,
    navBorder: GOLD,
    navActive: BURGUNDY,
    navInactive: INK_SOFT,
    navIndicator: BURGUNDY,

    fabBackground: BURGUNDY,
    fabForeground: PAPER,
    fabBorder: GOLD,

    danger: '#8E4966',
    success: SAGE,
  },

  typography: {
    display:  { family: 'GreatVibes_400Regular', weight: '400', size: 34, letterSpacing: 0 },
    title:    { family: 'Cinzel_600SemiBold', weight: '600', size: 14, letterSpacing: 1.1 },
    body:     { family: 'Lora_500Medium', weight: '500', size: 14, letterSpacing: 0 },
    label:    { family: 'Lora_400Regular_Italic', weight: '400', size: 12, letterSpacing: 0 },
    caption:  { family: 'Cinzel_500Medium', weight: '500', size: 10, letterSpacing: 1.4 },
    navLabel: { family: 'Cinzel_600SemiBold', weight: '600', size: 8, letterSpacing: 0.6 },
  },

  // Merged with every other theme's assets and loaded once at startup.
  fontAssets: {
    GreatVibes_400Regular,
    Cinzel_500Medium,
    Cinzel_600SemiBold,
    Lora_400Regular,
    Lora_500Medium,
    Lora_600SemiBold,
    Lora_400Regular_Italic,
  },

  radii: { card: 14, control: 18, pill: 999, avatar: 999, thumb: 8 },

  borders: {
    card:        { width: 2, color: GOLD },
    cardInner:   { width: 1, color: SAGE },
    control:     { width: 1, color: GOLD },
    avatar:      { width: 2, color: GOLD },
    avatarInner: { width: 1, color: BURGUNDY },
    nav:         { width: 1.5, color: GOLD },
  },

  shadows: {
    card: {
      shadowColor: INK, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
    },
    fab: {
      shadowColor: INK, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.28, shadowRadius: 8, elevation: 8,
    },
  },

  Icon: StorybookIconSet,

  decor: {
    ScreenBackground: StorybookScreenBackground,
    HeaderOrnament: StorybookHeaderOrnament,
    Divider: StorybookDivider,
  },
});
