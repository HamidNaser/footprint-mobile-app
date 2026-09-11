/**
 * Custom tabBar for react-navigation's bottom tabs.
 *
 * Route -> icon is passed in by the navigator rather than hardcoded here, so
 * this stays usable by any navigator and any theme. The accessibility state,
 * labels and navigation event contract mirror react-navigation's default bar,
 * so swapping it in does not regress behaviour.
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import ThemeIcon from './ThemeIcon';
import ThemeText from './ThemeText';

export default function ThemeBottomNavigation({
  state,
  descriptors,
  navigation,
  routeIcons = {},
  showLabels = true,
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { nav } = theme.borders;

  // A theme that gives the bar its own border is drawn as a floating slab
  // (bottom-nav-background.svg); one that does not gets a flush, edge-to-edge
  // bar with a hairline top rule.
  const floating = nav.width > 0;

  return (
    <View
      style={[
        styles.host,
        {
          paddingBottom: Math.max(insets.bottom, floating ? 10 : 0),
          paddingHorizontal: floating ? 16 : 0,
          backgroundColor: floating ? 'transparent' : theme.colors.navBackground,
        },
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.navBackground,
            borderWidth: floating ? nav.width : 0,
            borderColor: nav.color,
            borderRadius: floating ? theme.radii.card : 0,
            borderTopWidth: floating ? nav.width : StyleSheet.hairlineWidth,
            borderTopColor: floating ? nav.color : theme.colors.navBorder,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          const color = isFocused ? theme.colors.navActive : theme.colors.navInactive;
          const showIndicator = isFocused && theme.colors.navIndicator !== 'transparent';

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.item}
            >
              {showIndicator ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.indicator,
                    {
                      backgroundColor: theme.colors.navIndicator,
                      borderRadius: theme.radii.pill,
                    },
                  ]}
                />
              ) : null}

              <ThemeIcon
                name={routeIcons[route.name] || 'home'}
                size={22}
                color={color}
                active={isFocused}
              />

              {showLabels ? (
                <ThemeText
                  role="navLabel"
                  style={{ color, marginTop: 2 }}
                  numberOfLines={1}
                >
                  {String(label).toUpperCase()}
                </ThemeText>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { backgroundColor: 'transparent' },
  bar: { flexDirection: 'row', alignItems: 'center', height: 58 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  indicator: {
    position: 'absolute',
    top: 6,
    width: 38,
    height: 24,
    // active-indicator.svg is a solid burgundy pill. At full strength it would
    // hide the burgundy active icon on top of it, so it is used as a wash.
    opacity: 0.12,
  },
});
