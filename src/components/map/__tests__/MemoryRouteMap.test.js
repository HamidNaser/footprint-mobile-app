/**
 * MemoryRouteMap (013 T047) -- the "Where this happened" map under a saved memory.
 *
 * The map draws what `toNumberedPieces` decided (T046) and nothing of its own: one
 * `NumberedPin` per group, in number order, joined by a dashed line once there are two
 * groups, under a heading and above a line counting the pieces that have no place
 * (FR-022 to FR-026). So these tests drive it with real entries and read the real pins,
 * rather than with hand-built groups -- a group's shape is `toNumberedPieces`' own suite's
 * business, and a map test that invented its own groups could agree with itself while
 * disagreeing with the numbers the card puts on the pieces.
 *
 * `react-native-maps` is native and cannot load under jest, so it is mocked to string
 * elements the way `EntryMarker.test.js` and `NumberedPin.test.js` mock it; the props the
 * real `MapView`, `Polyline` and `Marker` would receive are then readable on the tree.
 * `NumberedPin` itself is **not** mocked -- it is the thing being arranged on the map, and
 * mocking it would leave the pin's number, its coordinate and its press untested here.
 *
 * Two of these tests exist because of what this component must *not* become. It renders its
 * own `MapView` rather than `JournalMapView` (round-3 M2), and `JournalMapView` asks for the
 * user's location on mount (`:233-237`); so the location service and `expo-location` are
 * mocked and asserted untouched. And the coordinate a pin is drawn on must be the one the
 * server sent for this viewer, never the rounded merging key, because the server has already
 * coarsened it to the precision this viewer may see (FR-026).
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';

jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  Polyline: 'Polyline',
  PROVIDER_GOOGLE: 'google',
}));

jest.mock('../../../services/LocationService', () => {
  const service = {
    checkPermissions: jest.fn(),
    requestPermissions: jest.fn(),
    getCurrentLocation: jest.fn(),
  };
  return { __esModule: true, LocationService: service, default: service, PermissionStatus: {} };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

import * as ExpoLocation from 'expo-location';
import LocationService from '../../../services/LocationService';
import { PIN_COLOURS } from '../NumberedPin';
import MemoryRouteMap from '../MemoryRouteMap';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Two spots on the same street, 0.0009 degrees of latitude apart -- about 100 m, which the
// 5-decimal merging grid keeps as two places (round-2 H2).
const BUS = { lat: 51.5001, lng: -0.1401 };
const PLATFORM = { lat: 51.501, lng: -0.1401 };
// Within a metre of the bus stop: both coordinates round to the same 5-decimal key, so these
// two share one marker (FR-023).
const BESIDE_THE_BUS = { lat: 51.500104, lng: -0.140097 };
const THIRD_PLACE = { lat: 51.502, lng: -0.1401 };

const text = (content, { at = null, location = null } = {}) => ({
  type: 'text',
  content,
  capturedAt: at,
  location,
});

const photos = (media) => ({ type: 'photos', media });

const photo = (id, { at = null, location = null } = {}) => ({ id, capturedAt: at, location });

const render = (props) => {
  let tree;
  act(() => {
    tree = renderer.create(<MemoryRouteMap entry={{ contentBlocks: [] }} {...props} />);
  });
  return tree;
};

const map = (tree) => tree.root.findByType('MapView');
const maps = (tree) => tree.root.findAllByType('MapView');
const markers = (tree) => tree.root.findAllByType('Marker');
const polylines = (tree) => tree.root.findAllByType('Polyline');
const labels = (tree) =>
  tree.root.findAllByProps({ testID: 'numbered-pin-label' }).map((node) => node.props.children);
const textAt = (tree, testID) => {
  const found = tree.root.findAllByProps({ testID });
  return found.length === 0 ? null : found[0].props.children;
};
const press = (marker) => act(() => marker.props.onPress());

describe('a memory with no places', () => {
  it('draws nothing at all, so the card looks exactly as it does today', () => {
    // FR-022: when no piece has a place, no map is shown -- not an empty map, and not a
    // heading over nothing (SC-008).
    const tree = render({
      entry: { contentBlocks: [text('got the bus'), photos([photo('m1')])] },
    });

    expect(tree.toJSON()).toBeNull();
  });

  it('draws nothing for a memory with no pieces either', () => {
    expect(render({ entry: { contentBlocks: [] } }).toJSON()).toBeNull();
  });
});

describe('its heading', () => {
  it('is "Where this happened"', () => {
    const tree = render({ entry: { contentBlocks: [text('here', { location: BUS })] } });

    expect(textAt(tree, 'memory-route-map-title')).toBe('Where this happened');
  });

  it('counts the pieces that are on the map, which is the highest number on it', () => {
    // The subtitle is "n pieces". n is the number of pieces the map shows -- the placed ones,
    // which are numbered 1…n with no gaps -- so a viewer can check it against the last pin.
    // The pieces with no place are counted on their own line below instead (FR-026), so
    // neither line counts a piece the other one counts.
    const tree = render({
      entry: {
        contentBlocks: [
          text('a', { location: BUS }),
          text('b', { location: PLATFORM }),
          text('c'),
        ],
      },
    });

    expect(textAt(tree, 'memory-route-map-subtitle')).toBe('2 pieces');
  });

  it('says "1 piece" of a single piece, not "1 pieces"', () => {
    const tree = render({ entry: { contentBlocks: [text('only one', { location: BUS })] } });

    expect(textAt(tree, 'memory-route-map-subtitle')).toBe('1 piece');
  });
});

describe('the map it draws on', () => {
  it('is one map of its own', () => {
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    expect(maps(tree)).toHaveLength(1);
  });

  it('uses Google on Android, as every other map in the app does', () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

      expect(map(tree).props.provider).toBe('google');
    } finally {
      Platform.OS = original;
    }
  });

  it('leaves the provider to the platform elsewhere', () => {
    expect(Platform.OS).toBe('ios');
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    expect(map(tree).props.provider).toBeUndefined();
  });

  it('never asks where the viewer is', () => {
    // Round-3 M2: this map shows where a memory happened, which needs no permission at all.
    // `JournalMapView` requests one on mount, which is the reason this component is its own
    // map rather than built on that one.
    render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    [
      ...Object.values(LocationService),
      ...Object.values(ExpoLocation),
    ].forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it('shows nothing of the viewer on the map', () => {
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    expect(map(tree).props.showsUserLocation).toBe(false);
    expect(map(tree).props.showsMyLocationButton).toBe(false);
  });

  it('opens over its pins', () => {
    const tree = render({
      entry: {
        contentBlocks: [text('a', { location: BUS }), text('b', { location: PLATFORM })],
      },
    });
    const { latitude, longitude, latitudeDelta, longitudeDelta } = map(tree).props.initialRegion;

    [BUS, PLATFORM].forEach((place) => {
      expect(Math.abs(place.lat - latitude)).toBeLessThan(latitudeDelta / 2);
      expect(Math.abs(place.lng - longitude)).toBeLessThan(longitudeDelta / 2);
    });
  });

  it('opens close in on a memory that happened in one spot', () => {
    // A single pin has no span to fit, and a region of zero degrees is the whole world on
    // some providers and an error on others.
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });
    const { latitudeDelta, longitudeDelta } = map(tree).props.initialRegion;

    expect(latitudeDelta).toBeGreaterThan(0);
    expect(longitudeDelta).toBeGreaterThan(0);
    expect(latitudeDelta).toBeLessThan(0.05);
  });

  it('does not take the card away from the list it scrolls in', () => {
    // A pannable map inside a scrolling list swallows every vertical drag over it, as
    // `PlaceMapPreview` already avoids. Pin presses are unaffected.
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    expect(map(tree).props.scrollEnabled).toBe(false);
    expect(map(tree).props.zoomEnabled).toBe(false);
  });
});

describe('one pin per group', () => {
  it('draws one pin, showing its number, for a memory with one place', () => {
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    expect(markers(tree)).toHaveLength(1);
    expect(labels(tree)).toEqual(['1']);
  });

  it('numbers the places in capture order, with no gaps', () => {
    const tree = render({
      entry: {
        contentBlocks: [
          text('a', { location: BUS }),
          text('no place here'),
          text('b', { location: PLATFORM }),
          text('c', { location: THIRD_PLACE }),
        ],
      },
    });

    expect(labels(tree)).toEqual(['1', '2', '3']);
  });

  it('merges the pieces within a metre into one marker showing how many it holds', () => {
    // The spec's burst of photos: two photos at practically the same spot become one marker
    // reading "2", and the note down the road keeps its own number (FR-023).
    const tree = render({
      entry: {
        contentBlocks: [
          photos([photo('m1', { location: BUS }), photo('m2', { location: BESIDE_THE_BUS })]),
          text('on the platform', { location: PLATFORM }),
        ],
      },
    });

    expect(markers(tree)).toHaveLength(2);
    expect(labels(tree)).toEqual(['2', '3']);
  });

  it('keeps two places about 100 m apart as two pins', () => {
    // Round-2 H2: the merging grid is about a metre, not `JournalMapView`'s 1.1 km, which
    // would fold a whole walk into one marker.
    const tree = render({
      entry: {
        contentBlocks: [text('a', { location: BUS }), text('b', { location: PLATFORM })],
      },
    });

    expect(markers(tree)).toHaveLength(2);
    expect(labels(tree)).toEqual(['1', '2']);
  });

  it('draws each pin exactly where the server put it, never on the rounded merging key', () => {
    // FR-026: the server has already reduced this coordinate to the precision this viewer may
    // see. Drawing the 5-decimal grouping key instead would show one viewer a place more
    // precisely than they are allowed and another less precisely than they are.
    const exact = { lat: 51.5001234, lng: -0.1409876 };
    const tree = render({ entry: { contentBlocks: [text('a', { location: exact })] } });

    expect(markers(tree)[0].props.coordinate).toEqual({
      latitude: 51.5001234,
      longitude: -0.1409876,
    });
  });
});

describe('the route line', () => {
  const twoPlacesInReverse = {
    // Stored the other way round from how they were captured: the ordering rule puts the bus
    // first, so a line following stored order would run backwards.
    contentBlocks: [
      text('on the platform', { at: '2026-03-01T10:05:00Z', location: PLATFORM }),
      text('got the bus', { at: '2026-03-01T10:00:00Z', location: BUS }),
    ],
    serverUpdatedAt: '2026-03-01T11:00:00Z',
  };

  it('is not drawn to a single marker', () => {
    const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });

    expect(polylines(tree)).toHaveLength(0);
  });

  it('is not drawn when every piece is in the same spot', () => {
    const tree = render({
      entry: {
        contentBlocks: [
          photos([photo('m1', { location: BUS }), photo('m2', { location: BESIDE_THE_BUS })]),
        ],
      },
    });

    expect(markers(tree)).toHaveLength(1);
    expect(polylines(tree)).toHaveLength(0);
  });

  it('joins two or more places in capture order, not in stored order', () => {
    const tree = render({
      entry: { contentBlocks: twoPlacesInReverse.contentBlocks },
      serverUpdatedAt: twoPlacesInReverse.serverUpdatedAt,
    });

    expect(polylines(tree)).toHaveLength(1);
    expect(polylines(tree)[0].props.coordinates).toEqual([
      { latitude: BUS.lat, longitude: BUS.lng },
      { latitude: PLATFORM.lat, longitude: PLATFORM.lng },
    ]);
  });

  it('runs through every place once, in number order', () => {
    const tree = render({
      entry: {
        contentBlocks: [
          text('a', { location: BUS }),
          photos([photo('m1', { location: BESIDE_THE_BUS })]),
          text('b', { location: PLATFORM }),
          text('c', { location: THIRD_PLACE }),
        ],
      },
    });

    expect(polylines(tree)[0].props.coordinates).toEqual([
      { latitude: BUS.lat, longitude: BUS.lng },
      { latitude: PLATFORM.lat, longitude: PLATFORM.lng },
      { latitude: THIRD_PLACE.lat, longitude: THIRD_PLACE.lng },
    ]);
  });

  it('is dashed', () => {
    const tree = render({
      entry: {
        contentBlocks: [text('a', { location: BUS }), text('b', { location: PLATFORM })],
      },
    });
    const { lineDashPattern } = polylines(tree)[0].props;

    expect(Array.isArray(lineDashPattern)).toBe(true);
    expect(lineDashPattern.length).toBeGreaterThanOrEqual(2);
    lineDashPattern.forEach((segment) => expect(segment).toBeGreaterThan(0));
  });
});

describe('the pieces with no place', () => {
  const withUnplaced = (count) => ({
    contentBlocks: [
      text('placed', { location: BUS }),
      ...Array.from({ length: count }, (_unused, index) => text(`unplaced ${index}`)),
    ],
  });

  it('are counted under the map', () => {
    // The spec's own wording for this line (FR-026, *Edge Cases*).
    expect(textAt(render({ entry: withUnplaced(2) }), 'memory-route-map-without-place')).toBe(
      '2 pieces without a place',
    );
  });

  it('are counted in the singular when there is one', () => {
    expect(textAt(render({ entry: withUnplaced(1) }), 'memory-route-map-without-place')).toBe(
      '1 piece without a place',
    );
  });

  it('are not mentioned when every piece has a place', () => {
    expect(textAt(render({ entry: withUnplaced(0) }), 'memory-route-map-without-place')).toBeNull();
  });
});

describe('pressing a pin', () => {
  const entry = {
    contentBlocks: [
      photos([photo('m1', { location: BUS }), photo('m2', { location: BESIDE_THE_BUS })]),
      text('on the platform', { location: PLATFORM }),
    ],
  };

  it('hands back the number of the piece it stands for', () => {
    const onPinPress = jest.fn();
    const tree = render({ entry, onPinPress });

    press(markers(tree)[1]);

    expect(onPinPress).toHaveBeenCalledWith([3]);
  });

  it('hands back every number a merged marker holds, so all of its pieces light up', () => {
    // FR-025, round-2 M1: the card highlights all of them and scrolls to the first, which it
    // can only do if it is told all of them.
    const onPinPress = jest.fn();
    const tree = render({ entry, onPinPress });

    press(markers(tree)[0]);

    expect(onPinPress).toHaveBeenCalledWith([1, 2]);
  });

  it('is pressable with no handler given', () => {
    const tree = render({ entry });

    expect(() => press(markers(tree)[0])).not.toThrow();
  });
});

describe('a pin keeps its kind colour', () => {
  const bubbleColour = (tree, index) =>
    tree.root.findAllByProps({ testID: 'numbered-pin' })[index].props.style
      .find((part) => part && part.backgroundColor)
      .backgroundColor;

  it('so a lone pin is the colour of its piece', () => {
    const tree = render({
      entry: { contentBlocks: [photos([photo('m1', { location: BUS })])] },
    });

    expect(bubbleColour(tree, 0)).toBe(PIN_COLOURS.photo);
  });

  it('and a merged marker is the colour of its first-numbered piece', () => {
    // Nothing in the spec or research R10 says what a marker holding more than one *kind*
    // should look like, so T047 decides: it keeps `groups[].kind`, the kind of its first
    // piece. A merged marker already stands for several pieces and says so with a count
    // instead of a number, so no colour could identify them; and a fifth, neutral colour for
    // "mixed" is one the prototype's legend -- Note | Voice | Photo | Video -- cannot explain.
    // Recorded here so that changing it is a decision and not an accident.
    const tree = render({
      entry: {
        contentBlocks: [
          photos([photo('m1', { location: BUS })]),
          text('a note at the same stop', { location: BESIDE_THE_BUS }),
        ],
      },
    });

    expect(markers(tree)).toHaveLength(1);
    expect(labels(tree)).toEqual(['2']);
    expect(bubbleColour(tree, 0)).toBe(PIN_COLOURS.photo);
  });
});
