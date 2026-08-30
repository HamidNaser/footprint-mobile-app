/**
 * Text bound to a typography role rather than a font size.
 * Roles: display | title | body | label | caption | navLabel
 */
import React from 'react';
import { Text } from 'react-native';
import { useTheme, textStyle } from '../ThemeContext';

export default function ThemeText({
  role = 'body', color, style, children, ...rest
}) {
  const theme = useTheme();
  const base = textStyle(theme, role);
  return (
    <Text {...rest} style={[base, color ? { color } : null, style]}>
      {children}
    </Text>
  );
}
