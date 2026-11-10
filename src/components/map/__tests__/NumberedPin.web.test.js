/**
 * NumberedPin on web (013 T047/T048, web siblings).
 *
 * `react-native-maps` is native-only, so every file importing it has a `.web.js` sibling, and
 * a marker's sibling draws nothing -- `EntryMarker.web.js` is the existing precedent: a marker
 * cannot exist without a map to put it on.
 *
 * What the sibling cannot drop is `PIN_COLOURS` and `pinColour`. They are exported because the
 * same number badge appears on the piece itself in the card (FR-023), and the card imports
 * them from here -- which on web resolves to the sibling. If the two tables ever disagreed, a
 * voice clip's badge would be one colour on a phone and another in a browser. They are
 * therefore compared key for key against the native file, in the same suite, the way
 * `VideoThumbnail.test.js` and `hostSiblingActions.test.js` test a native and web pair
 * together.
 *
 * This is a separate file from `NumberedPin.test.js` rather than an addition to it: that suite
 * belongs to T044 and is already merged, and these assertions arrived with the sibling.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import renderer, { act } from 'react-test-renderer';

jest.mock('react-native-maps', () => ({ __esModule: true, Marker: 'Marker' }));

import NativeNumberedPin, { PIN_COLOURS, pinColour } from '../NumberedPin';
import WebNumberedPin, {
  PIN_COLOURS as WEB_PIN_COLOURS,
  pinColour as webPinColour,
} from '../NumberedPin.web';

global.IS_REACT_ACT_ENVIRONMENT = true;

const render = (Component, props) => {
  let tree;
  act(() => {
    tree = renderer.create(<Component numbers={[1]} kind="text" lat={51.5} lng={-0.14} {...props} />);
  });
  return tree;
};

describe('a pin on web', () => {
  it.each([
    ['a single pin', { numbers: [1] }],
    ['a merged pin', { numbers: [2, 3, 4] }],
    ['a pin with no place', { lat: null, lng: null }],
    ['a pin holding no pieces', { numbers: [] }],
  ])('draws nothing for %s, because there is no map to draw it on', (_what, props) => {
    expect(render(WebNumberedPin, props).toJSON()).toBeNull();
  });

  it('renders nothing where the native one renders a marker', () => {
    // The same props, side by side: the difference between the two files is the marker itself
    // and nothing else, which is what makes this a sibling rather than a second component.
    expect(render(NativeNumberedPin, { numbers: [3] }).root.findAllByType('Marker')).toHaveLength(1);
    expect(render(WebNumberedPin, { numbers: [3] }).toJSON()).toBeNull();
  });

  it('does not call a press handler it never draws anything to press', () => {
    const onPress = jest.fn();
    render(WebNumberedPin, { numbers: [3], onPress });

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('the badge colours a card reads from here', () => {
  it('are the same table on web as on a phone, key for key', () => {
    expect(WEB_PIN_COLOURS).toEqual(PIN_COLOURS);
  });

  it.each(['text', 'audio', 'photo', 'video'])('answer the same for %s', (kind) => {
    expect(webPinColour(kind)).toBe(pinColour(kind));
  });

  it('answer the same neutral colour for a kind neither file knows', () => {
    expect(webPinColour('hologram')).toBe(pinColour('hologram'));
    expect(webPinColour(undefined)).toBe(pinColour(undefined));
  });
});

describe('the sibling itself', () => {
  it('does not import the native-only module', () => {
    // Asserted on the file rather than on a mock: a mocked `react-native-maps` loads perfectly
    // well under jest and would hide exactly the import that breaks the web bundle.
    const source = fs.readFileSync(path.join(__dirname, '..', 'NumberedPin.web.js'), 'utf8');

    expect(source).not.toMatch(/(?:from|require\()\s*['"]react-native-maps['"]/);
  });
});
