/**
 * MemoryRouteMap (013 T048) -- the "Where this happened" map under a saved memory.
 *
 * It arranges what `toNumberedPieces` (T046) decided and decides nothing of its own about
 * numbering or merging: one `NumberedPin` per group in number order, a dashed `Polyline`
 * through them once there are two groups, a heading, and a line counting the pieces with no
 * place (FR-022 to FR-026). The card above it draws the matching number badges from the same
 * function, which is what makes a pin and a badge agree (FR-023).
 *
 * Four decisions worth stating:
 *
 * 1. **It renders its own `MapView`** (research R10, round-3 M2), and `JournalMapView` is left
 *    untouched and unused by this feature. That component has no numbered marker, no slot for
 *    an ordered line, and a cluster press that only zooms -- and it asks for the user's
 *    location on mount (`:233-237`). **This map never asks.** It shows where a memory
 *    happened, which needs no permission, and asking for one to draw a saved place would be a
 *    prompt a viewer cannot make sense of.
 * 2. **It takes the entry, not the groups.** `toNumberedPieces` is pure and cheap, and giving
 *    this component the same two inputs the card gives it means a caller cannot hand the map
 *    groups that disagree with the badges on the pieces.
 * 3. **The subtitle counts the pieces on the map.** They are numbered 1…n with no gaps, so n
 *    is also the highest number a viewer can see on it, which makes the subtitle checkable
 *    against the map. The pieces with no place are counted on their own line (FR-026), so
 *    neither line counts a piece the other one counts.
 * 4. **A coordinate is passed through exactly as it arrived.** The server has already reduced
 *    every location to the precision this particular viewer may see
 *    (`JournalsController.cs:2565-2569`), so the only safe thing to draw is the value itself;
 *    the rounded key that decided the grouping is never drawn (FR-026).
 *
 * The map is **not pannable or zoomable**, as `PlaceMapPreview` already is not: a map that
 * takes gestures inside a scrolling list swallows every vertical drag that starts over it, and
 * this one sits in the middle of a Journal card. Pin presses are unaffected.
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import NumberedPin from './NumberedPin';
import { toNumberedPieces } from '../../utils/memoryPieces';

/**
 * The height of the map itself. Exported because `JournalEntryCard` mounts this component only
 * while the card is visible in the list and shows a placeholder of the same height otherwise
 * (T050, research R10 *Lazy rendering*), and the two must not drift apart.
 */
export const MEMORY_ROUTE_MAP_HEIGHT = 180;

/**
 * The smallest span the map opens on, in degrees -- about 440 m north to south. A memory that
 * happened in one spot has no span to fit, and a region of zero degrees is not a view of
 * anywhere; a route narrower than this is padded out to it for the same reason.
 */
const MIN_SPAN_DEGREES = 0.004;

/** How much wider than the route itself the opening view is, so no pin sits on the edge. */
const SPAN_PADDING = 1.8;

/** The app's primary blue, as `PlaceMapPreview` uses it. */
const ROUTE_COLOUR = '#4361ee';

/** Dashed, in the same pattern as the journal map's trail (`JournalMapView.js:373`). */
const ROUTE_DASH_PATTERN = [5, 5];

/**
 * The region that shows every group, from the coordinates themselves rather than by calling
 * `fitToCoordinates` on a ref: the map is static, so the opening region is the only region,
 * and arithmetic needs no map instance and no `onMapReady`.
 */
function regionFor(groups) {
  const lats = groups.map((group) => group.lat);
  const lngs = groups.map((group) => group.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * SPAN_PADDING, MIN_SPAN_DEGREES),
    longitudeDelta: Math.max((maxLng - minLng) * SPAN_PADDING, MIN_SPAN_DEGREES),
  };
}

/** "1 piece", "4 pieces" -- a count a person reads, rather than "1 pieces". */
const pieceCount = (count) => `${count} ${count === 1 ? 'piece' : 'pieces'}`;

/**
 * @param {object} props
 * @param {object} props.entry The saved memory, as the card has it: `{ contentBlocks }`.
 * @param {string|null} [props.serverUpdatedAt] The server's record of the memory's last save,
 *   which the ordering rule needs. Absent means the device does not have it yet, and then no
 *   capture time is treated as impossible (FR-029).
 * @param {(numbers: number[]) => void} [props.onPinPress] Given every number the pressed pin
 *   holds. The card highlights them all and brings the first into view (FR-025).
 * @param {object} [props.style] Extra style for the block, so the card can space it.
 */
function MemoryRouteMap({ entry, serverUpdatedAt, onPinPress, style }) {
  const { groups, withoutPlaceCount } = useMemo(
    () => toNumberedPieces(entry, serverUpdatedAt),
    [entry, serverUpdatedAt],
  );

  // FR-022: a memory with no places shows no map at all -- not an empty one, and not a
  // heading over nothing. Its card then looks exactly as it does today (SC-008).
  if (groups.length === 0) return null;

  const placedCount = groups.reduce((total, group) => total + group.numbers.length, 0);
  const route = groups.map((group) => ({ latitude: group.lat, longitude: group.lng }));

  return (
    <View testID="memory-route-map" style={[styles.container, style]}>
      <Text testID="memory-route-map-title" style={styles.title}>
        Where this happened
      </Text>
      <Text testID="memory-route-map-subtitle" style={styles.subtitle}>
        {pieceCount(placedCount)}
      </Text>

      <View style={styles.frame}>
        <MapView
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={regionFor(groups)}
          showsUserLocation={false}
          showsMyLocationButton={false}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
        >
          {/* FR-024: a line joins two or more places, and is never drawn to a single pin. */}
          {route.length > 1 && (
            <Polyline
              coordinates={route}
              strokeColor={ROUTE_COLOUR}
              strokeWidth={2}
              lineDashPattern={ROUTE_DASH_PATTERN}
            />
          )}

          {groups.map((group) => (
            <NumberedPin
              key={group.key}
              numbers={group.numbers}
              kind={group.kind}
              lat={group.lat}
              lng={group.lng}
              onPress={onPinPress}
            />
          ))}
        </MapView>
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
    marginTop: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  frame: {
    height: MEMORY_ROUTE_MAP_HEIGHT,
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8EEFF',
  },
  withoutPlace: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 8,
  },
});
