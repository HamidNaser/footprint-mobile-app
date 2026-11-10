import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { SimpleFAB } from '../journal/FloatingActionButton';

/**
 * Pixels between the FAB and the screen edge, matching the other hand-rolled FABs in this
 * app (`FamilyScreen.js`, `FriendsScreen.js`: `bottom: 20, right: 20`).
 */
const BOTTOM_OFFSET = 20;

/**
 * The "+" over every tab (FR-001, research.md R12): a single button, no sub-menu, that
 * opens `Capture` in one tap. Reuses the journal module's existing `SimpleFAB` rather than
 * the expandable `FloatingActionButton` it sits beside, since there is nothing here to
 * expand into.
 *
 * Mounted once per tab screen (see `withCaptureFab` in `AppNavigator.js`), *inside* the
 * scene the Bottom Tab Navigator renders, rather than as a sibling of `<Tab.Navigator>` —
 * `useBottomTabBarHeight` only resolves there (its context is provided per-screen inside
 * `BottomTabView`, not at the navigator level), so a sibling placement throws on every
 * render.
 *
 * Fix round 1: having moved inside the scene, the scene's own bottom edge already stops
 * above the tab bar (it is an in-flow flex sibling of the tab bar when visible, not
 * absolutely positioned over it), so `useBottomTabBarHeight` would double-count that
 * height here and float the "+" a full tab-bar height too high, growing with the device's
 * bottom safe-area inset. A plain constant is what's correct once the FAB lives inside the
 * scene -- the same one every other FAB in this app already uses.
 */
export default function CaptureFab() {
  const navigation = useNavigation();

  return (
    <SimpleFAB
      testID="capture-fab"
      icon="add"
      onPress={() => navigation.navigate('Capture', { mode: 'new' })}
      bottomOffset={BOTTOM_OFFSET}
    />
  );
}
