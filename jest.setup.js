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

/**
 * `expo-audio`, for the third time and the same reason.
 *
 * It **cannot be imported under jest at all**: `ExpoAudio.ts` reaches
 * `AudioModule.AudioPlayer.prototype` at module scope to shim `replace`, and outside a native
 * runtime `AudioModule.AudioPlayer` is undefined -- so the suite dies at *import* time with
 * "Cannot read properties of undefined (reading 'prototype')", before any test runs. Until now
 * the files importing it were leaf components that each suite stubbed by name
 * (`jest.mock('../../media/AudioPlayer', ...)`). Since 013 T054 `VoicePlayer` is in
 * `JournalEntryCard` (the voice pill) and in `PieceList` (the capture screen's audio rows), so
 * **every** suite that renders a Journal card or the capture screen now pulls `expo-audio` in,
 * as do the suites that merely import a file that imports one. Stubbed here once rather than in
 * each of them, and in each of the ones that come after.
 *
 * Only the exports this app actually imports are stubbed, so anything else fails loudly rather
 * than resolving to a silent stub. The player is idle and does nothing: a suite that drives
 * playback or recording -- `VoicePlayer.test.js`, `VoiceRecorderBar.test.js` -- declares its own
 * `jest.mock`, and that wins.
 */
jest.mock('expo-audio', () => {
  const { useMemo } = require('react');

  const IDLE_STATUS = {
    id: 'stub-player',
    playing: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
    didJustFinish: false,
    isBuffering: false,
    error: null,
  };

  const makePlayer = () => ({
    id: 'stub-player',
    playing: false,
    currentTime: 0,
    duration: 0,
    currentStatus: IDLE_STATUS,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => {}),
    replace: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeListener: jest.fn(),
  });

  const makeRecorder = () => ({
    id: 'stub-recorder',
    uri: null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(),
    stop: jest.fn(async () => {}),
    pause: jest.fn(),
    getStatus: () => ({
      canRecord: false,
      isRecording: false,
      durationMillis: 0,
      mediaServicesDidReset: false,
    }),
  });

  const granted = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };

  return {
    AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
    IOSOutputFormat: { MPEG4AAC: 'aac ' },
    RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
    setAudioModeAsync: jest.fn(async () => {}),
    setIsAudioActiveAsync: jest.fn(async () => {}),
    requestRecordingPermissionsAsync: jest.fn(async () => granted),
    getRecordingPermissionsAsync: jest.fn(async () => granted),
    createAudioPlayer: jest.fn(() => makePlayer()),
    useAudioPlayer: () => useMemo(makePlayer, []),
    useAudioPlayerStatus: () => IDLE_STATUS,
    useAudioRecorder: () => useMemo(makeRecorder, []),
    useAudioRecorderState: () => ({
      canRecord: false,
      isRecording: false,
      durationMillis: 0,
      mediaServicesDidReset: false,
    }),
  };
});
