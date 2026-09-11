/**
 * Renders a semantic icon through the active theme's icon set.
 * Callers never name a glyph -- they name a concept ('family'), and the theme
 * decides what that looks like.
 */
import React from 'react';
import { useTheme } from '../ThemeContext';

export default function ThemeIcon({ name, size = 24, color, active = false }) {
  const theme = useTheme();
  const Icon = theme.Icon;
  if (!Icon) return null;
  const resolved = color ?? (active ? theme.colors.navActive : theme.colors.textSecondary);
  return <Icon name={name} size={size} color={resolved} active={active} />;
}
