/**
 * NumberedPin (013 T044) -- one marker on the map under a memory.
 *
 * A pin stands for a **group** of pieces, not for a piece: `toNumberedPieces` (T046) groups
 * the placed pieces whose coordinates round to the same 5-decimal key, about a metre, and
 * `MemoryRouteMap` (T048) draws one of these per group. A lone piece is a group of one, so
 * there is no second kind of marker to keep in step (FR-023, research R10).
 *
 * Three decisions worth stating:
 *
 * 1. **`numbers` decides what the pin says.** One number draws that number -- the same number
 *    the piece carries in the card, which is what makes a pin findable. Several draw *how
 *    many* pieces are there rather than a list, which would not fit in a 1 cm circle;
 *    `onPress` carries the numbers themselves, and the card highlights all of them and scrolls
 *    to the first (FR-025).
 * 2. **A coordinate is missing only when it is `null` or absent.** `lat: 0` is the equator and
 *    `lng: 0` is the prime meridian, and both are real places. `EntryMarker` on `release/1.0`
 *    returns null when its latitude is *falsy* (`:182`), which drops a memory made on either
 *    line and looks exactly like a memory with no place. A pin with no place is simply not
 *    drawn; nothing above it needs to know, and its piece carries no number either.
 * 3. **It never repaints.** A native marker is a snapshot of its view, and `tracksViewChanges`
 *    left on makes every marker redraw on every frame. A number and a colour are both known at
 *    render time -- unlike `EntryMarker`'s photo, which arrives later -- so this one is settled
 *    from the start.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

/**
 * The prototype's colour per kind of piece; its map legend reads "Note | Voice | Photo |
 * Video". The keys are the stored kind names (`audio`, which the legend calls Voice).
 *
 * Exported because the same number badge appears on the piece itself in the card (FR-023), and
 * the pin and the badge have to agree about what colour a voice clip is.
 */
export const PIN_COLOURS = {
  text: '#4361ee',
  audio: '#8e44ad',
  photo: '#2f9e6e',
  video: '#c27c0e',
};

/**
 * An unrecognised kind still gets a pin, in a neutral colour. A piece whose kind this file
 * does not know is still a piece in a place, and it is still numbered; hiding its pin would
 * leave a number in the card with nothing on the map to tap.
 */
const UNKNOWN_COLOUR = '#8E8E93';

export const pinColour = (kind) => PIN_COLOURS[kind] ?? UNKNOWN_COLOUR;

/**
 * @param {object} props
 * @param {number[]} props.numbers The group's piece numbers, in order. One number is a single
 *   pin; more than one is a merged marker.
 * @param {string} [props.kind] The kind of the group's first piece: `text`, `audio`, `photo`
 *   or `video`.
 * @param {number} [props.lat] Latitude. Absent or null means no place, and no pin.
 * @param {number} [props.lng] Longitude, likewise.
 * @param {(numbers: number[]) => void} [props.onPress] Given every number the pin holds.
 */
function NumberedPin({ numbers = [], kind, lat, lng, onPress }) {
  if (lat == null || lng == null || numbers.length === 0) return null;

  const merged = numbers.length > 1;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      onPress={() => onPress?.(numbers)}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View testID="numbered-pin" style={[styles.pin, { backgroundColor: pinColour(kind) }]}>
        <Text testID="numbered-pin-label" style={styles.label}>
          {String(merged ? numbers.length : numbers[0])}
        </Text>
      </View>
    </Marker>
  );
}

export default memo(NumberedPin);

const styles = StyleSheet.create({
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  label: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
