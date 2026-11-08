import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SimpleFAB } from '../journal/FloatingActionButton';

/**
 * The "+" over every tab (FR-001, research.md R12): a single button, no sub-menu, that
 * opens `Capture` in one tap. Reuses the journal module's existing `SimpleFAB` rather than
 * the expandable `FloatingActionButton` it sits beside, since there is nothing here to
 * expand into.
 *
 * `useBottomTabBarHeight` only resolves inside a screen that the Bottom Tab Navigator is
 * rendering (the context it reads is provided per-screen, not at the navigator level), so
 * this is mounted from inside each of the six tab screens (see `withCaptureFab` in
 * `AppNavigator.js`) rather than as a sibling of `<Tab.Navigator>` -- which keeps the
 * offset correct on every device instead of guessing a constant.
 */
export default function CaptureFab() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <SimpleFAB
      icon="add"
      onPress={() => navigation.navigate('Capture', { mode: 'new' })}
      bottomOffset={tabBarHeight + 16}
    />
  );
}
