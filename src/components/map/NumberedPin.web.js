/**
 * NumberedPin (013 T044/T048) -- web sibling.
 *
 * `react-native-maps` is native-only, so this file exists for the same reason
 * `EntryMarker.web.js` does, and it does the same thing: **it draws nothing.** A marker has no
 * map to sit on in a browser, and `MemoryRouteMap.web.js` draws no map, so there is nothing
 * for a pin to be on.
 *
 * What it cannot drop is `PIN_COLOURS` and `pinColour`. The native file exports them because
 * the same number badge appears on the piece itself in the card (FR-023), and the card's
 * import of them resolves to *this* file on web -- so dropping them would leave a badge with
 * no colour in a browser. The table is repeated here rather than shared, as every other web
 * sibling in this folder repeats its colours, and `NumberedPin.web.test.js` compares the two
 * key for key so they cannot drift: a voice clip's badge must not be one colour on a phone and
 * another in a browser.
 */

import { memo } from 'react';

/** The same table as the native file's, compared against it in `NumberedPin.web.test.js`. */
export const PIN_COLOURS = {
  text: '#4361ee',
  audio: '#8e44ad',
  photo: '#2f9e6e',
  video: '#c27c0e',
};

/** The neutral colour for a kind this app does not know, as on the native side. */
const UNKNOWN_COLOUR = '#8E8E93';

export const pinColour = (kind) => PIN_COLOURS[kind] ?? UNKNOWN_COLOUR;

/**
 * The same props as the native pin, so a caller cannot tell which file it got. Nothing is
 * drawn, and `onPress` is therefore never called -- there is nothing to press.
 */
function NumberedPin(_props) {
  return null;
}

export default memo(NumberedPin);
