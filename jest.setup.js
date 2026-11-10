/**
 * Shared jest setup.
 *
 * `MediaApi` reaches ApiClient -> AsyncStorage, which cannot load under jest. Since 007 the
 * display-copy hook calls `MediaApi.retry`, so every suite that renders a media tile pulled it
 * in. Mock it here once instead of in each suite. A suite that tests MediaApi itself opts out
 * with `jest.unmock('<path>/api/MediaApi')`; a suite may still declare its own `jest.mock`.
 */
jest.mock('./src/api/MediaApi', () => {
  const api = { retry: jest.fn(), status: jest.fn() };
  return { __esModule: true, MediaApi: api, default: api };
});

/**
 * `react-native-maps`, for the same reason and in the same spirit.
 *
 * It is native-only: importing it under jest reaches `TurboModuleRegistry.getEnforcing` and
 * throws `'RNMapsAirModule' could not be found`, which fails the whole suite at import time
 * rather than in a test. Since 013 T050 `JournalEntryCard` renders `MemoryRouteMap`
 * ("Where this happened"), so **every** suite that renders a Journal card -- or reads a file
 * that imports one -- now pulls the module in: `JournalEntryCard.share.test.js`,
 * `JournalEntryCard.media.test.js` and `derivativeSurfaces.test.js` all did the moment the map
 * went into the card. Stubbed here once rather than in each of them, and in each of the ones
 * that come after.
 *
 * Only the exports this app actually imports are stubbed (`MapView` as the default, `Marker`,
 * `Callout`, `Polyline`, `PROVIDER_GOOGLE`); anything else should fail loudly rather than
 * resolve to a silent stub. A suite that needs the props a map or a marker received -- the map
 * tests, which assert on them -- declares its own `jest.mock` as before, and that wins.
 */
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props) => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: Stub,
    MapView: Stub,
    Marker: Stub,
    Callout: Stub,
    Polyline: Stub,
    PROVIDER_GOOGLE: 'google',
  };
});
