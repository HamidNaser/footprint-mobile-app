/**
 * Surface with the theme's card treatment.
 *
 * Ornate themes describe a double frame (card-frame.svg is a gold stroke with a
 * sage stroke inset inside it). That inner rule is drawn as an absolutely
 * positioned overlay rather than a second wrapper View, so it never affects the
 * layout of the card's children.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

export default function ThemeCard({ children, selected = false, style, contentStyle }) {
  const theme = useTheme();
  const { card, cardInner } = theme.borders;
  const borderColor = selected ? theme.colors.borderAccent : card.color;
  const hasInner = cardInner.width > 0;

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.card,
          borderWidth: card.width,
          borderColor,
        },
        theme.shadows.card,
        style,
      ]}
    >
      {hasInner ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              margin: theme.spacing.xs,
              borderWidth: cardInner.width,
              borderColor: selected ? theme.colors.borderAccent : cardInner.color,
              borderRadius: Math.max(0, theme.radii.card - theme.spacing.xs),
            },
          ]}
        />
      ) : null}
      <View style={[{ padding: theme.spacing.md }, contentStyle]}>{children}</View>
    </View>
  );
}
