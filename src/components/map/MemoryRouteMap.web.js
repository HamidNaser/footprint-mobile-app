/**
 * MemoryRouteMap (013 T048) -- web sibling.
 *
 * `react-native-maps` is native-only, so this file exists for the same reason
 * `JournalMapView.web.js` and `PlaceMapPreview.web.js` do, and it follows them: where the
 * native file puts a map, this one puts a frame of the same height saying where the map is
 * available. Everything around the map is kept, because none of it is the map:
 *
 * - **a memory with no places still draws nothing at all** (FR-022). That rule is not about
 *   the map being native; it is about there being nowhere to show, so it must hold here too,
 *   or a browser would show a heading over nothing where a phone shows nothing;
 * - the heading, and the subtitle counting the pieces that have a place -- which is what makes
 *   the number badges in the card mean something on web, since the card draws those itself;
 * - the line counting the pieces with no place (FR-026).
 *
 * `MEMORY_ROUTE_MAP_HEIGHT` is exported with the same value as the native file's, so a card
 * reserving space for either lays out the same; the test compares the two.
 *
 * **No coordinate is printed.** `PlaceMapPreview.web.js` writes its one place out as numbers,
 * which is the one part of those stubs not followed here: this component can hold a dozen
 * places, a list of decimals is not a route, and FR-026 is about showing a viewer no more than
 * they may see -- text is a poor place to be casual about that.
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toNumberedPieces } from '../../utils/memoryPieces';

/** The same height the native map takes, so the card lays out identically. */
export const MEMORY_ROUTE_MAP_HEIGHT = 180;

/**
 * The slot's heights, repeated from the native file rather than shared -- as this folder's web
 * siblings repeat their colours -- and compared with it key for key by a test, because
 * `JournalEntryCard`'s import of them resolves to *this* file in a browser (round-1 item 1).
 * If the two disagreed, a card would reserve one height on a phone and another on web, and the
 * placeholder would stop being the height of the thing it stands in for.
 *
 * Every line carries an explicit `lineHeight` for the same reason it does on the native side:
 * a line whose height is whatever the platform's font metrics make it cannot be reserved.
 */
const TITLE_LINE_HEIGHT = 20;
const SUBTITLE_GAP = 2;
const SUBTITLE_LINE_HEIGHT = 18;
const FRAME_GAP = 8;
const WITHOUT_PLACE_GAP = 8;
const WITHOUT_PLACE_LINE_HEIGHT = 18;

/** The gap above the whole slot, as on the native side. */
export const MEMORY_ROUTE_MAP_GAP = 12;

/** The height of the whole slot. The same arithmetic as the native file's. */
export function memoryRouteMapSlotHeight({ withoutPlace = false } = {}) {
  return (
    TITLE_LINE_HEIGHT +
    SUBTITLE_GAP +
    SUBTITLE_LINE_HEIGHT +
    FRAME_GAP +
    MEMORY_ROUTE_MAP_HEIGHT +
    (withoutPlace ? WITHOUT_PLACE_GAP + WITHOUT_PLACE_LINE_HEIGHT : 0)
  );
}

/** "1 piece", "4 pieces" -- as the native file reads it. */
const pieceCount = (count) => `${count} ${count === 1 ? 'piece' : 'pieces'}`;

/**
 * @param {object} props
 * @param {object} props.entry The saved memory, as the card has it: `{ contentBlocks }`.
 * @param {string|null} [props.serverUpdatedAt] The server's record of the memory's last save.
 * @param {(numbers: number[]) => void} [props.onPinPress] Accepted so that a caller cannot
 *   tell the two files apart. There are no pins on web, so it is never called.
 */
function MemoryRouteMap({ entry, serverUpdatedAt }) {
  const { groups, withoutPlaceCount } = useMemo(
    () => toNumberedPieces(entry, serverUpdatedAt),
    [entry, serverUpdatedAt],
  );

  // FR-022, on web as on a phone: no places, no map -- and nothing in its place either.
  if (groups.length === 0) return null;

  const placedCount = groups.reduce((total, group) => total + group.numbers.length, 0);

  return (
    <View testID="memory-route-map" style={styles.container}>
      <Text testID="memory-route-map-title" style={styles.title}>
        Where this happened
      </Text>
      <Text testID="memory-route-map-subtitle" style={styles.subtitle}>
        {pieceCount(placedCount)}
      </Text>

      <View testID="memory-route-map-frame" style={styles.frame}>
        <Ionicons name="map-outline" size={40} color="#C7C7CC" />
        <Text testID="memory-route-map-unsupported" style={styles.unsupported}>
          The map is only available on iOS and Android.
        </Text>
      </View>

      {withoutPlaceCount > 0 && (
        <Text testID="memory-route-map-without-place" style={styles.withoutPlace}>
          {`${pieceCount(withoutPlaceCount)} without a place`}
        </Text>
      )}
    </View>
  );
}

export default memo(MemoryRouteMap);

const styles = StyleSheet.create({
  container: {
    marginTop: MEMORY_ROUTE_MAP_GAP,
  },
  title: {
    fontSize: 15,
    lineHeight: TITLE_LINE_HEIGHT,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: SUBTITLE_LINE_HEIGHT,
    color: '#8E8E93',
    marginTop: SUBTITLE_GAP,
  },
  frame: {
    height: MEMORY_ROUTE_MAP_HEIGHT,
    marginTop: FRAME_GAP,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8EEFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  unsupported: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  withoutPlace: {
    fontSize: 13,
    lineHeight: WITHOUT_PLACE_LINE_HEIGHT,
    color: '#8E8E93',
    marginTop: WITHOUT_PLACE_GAP,
  },
});
