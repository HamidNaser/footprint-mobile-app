/**
 * 013 T064 fix round 1 -- `EventsScreen`'s `route.params.initialTab` (added alongside the
 * `EventsList` extraction so the Events pane's "Drafts (n)" row has a real place to land:
 * `navigate('Events', { initialTab: 'drafts' })`).
 *
 * Deliberately a **separate** file from `EventsScreen.route.test.js` (T063): that file is the
 * FR-035 regression guard and pins the screen's *default* behaviour only -- it must stay
 * unmodified. This file is the one place `initialTab`'s own validation and fallback are tested.
 * Without it, replacing the whole `requestedTab`/`initialTab` expression in `EventsScreen.js`
 * with a literal `'my'` leaves the guard (and every other test in this feature) green, while
 * silently breaking the "navigates to the existing drafts view" half of T064's contract: tapping
 * "Drafts (n)" in the Events pane would always land on My events, with the count nowhere in
 * sight.
 */

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getAssetInfoAsync: jest.fn().mockResolvedValue({}),
  getAssetsAsync: jest.fn().mockResolvedValue({ assets: [] }),
  MediaType: { photo: 'photo', video: 'video' },
  SortBy: { creationTime: 'creationTime' },
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { All: 'All', Images: 'Images', Videos: 'Videos' },
}));
jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() }),
}));
jest.mock('expo-video-thumbnails', () => ({
  getThumbnailAsync: jest.fn(async () => ({ uri: 'file:///generated.jpg' })),
}));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
  useMicrophonePermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock('@react-native-community/datetimepicker', () => () => null);

jest.mock('../../hooks/useEvents', () => ({ useEvents: jest.fn() }));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { useEvents } from '../../hooks/useEvents';
import EventsScreen from '../EventsScreen';

beforeEach(() => {
  useEvents.mockReset();
  useEvents.mockImplementation(() => ({ events: [], isLoading: false, error: null, refresh: jest.fn() }));
});

async function mount(route) {
  let tree;
  await act(async () => {
    tree = create(<EventsScreen route={route} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

describe('EventsScreen route.params.initialTab', () => {
  it("starts on 'drafts' when route.params.initialTab is 'drafts'", async () => {
    await mount({ params: { initialTab: 'drafts' } });
    expect(useEvents).toHaveBeenCalledWith('drafts');
  });

  it("falls back to 'my' when initialTab is not a real tab id", async () => {
    await mount({ params: { initialTab: 'nonsense' } });
    expect(useEvents).toHaveBeenCalledWith('my');
  });
});
