/**
 * 013 T063 -- FR-035 regression guard for `EventsScreen`, written **before** T064 extracts its
 * list body into `EventsList`. This is deliberately not a red test: its whole value is pinning
 * today's behaviour of the screen exactly as it stands, so T064's extraction can be shown not to
 * have changed anything. It must pass green against the current screen, unmodified.
 *
 * What it pins (research R11, R16):
 *   - the My / Invites / Drafts segmented control, and that tapping a tab re-asks `useEvents` for
 *     that tab;
 *   - the list of events for the active tab, rendered as `EventCard`s;
 *   - the + (FAB) opening `EventForm` in create mode -- the one way FR-033 says this screen must
 *     keep offering to make a new event.
 *
 * `useEvents` is mocked rather than let run for real: this file is about what `EventsScreen` does
 * with what the hook gives it (the control, the list, the +), not about the hook itself, which
 * already has its own coverage. `EventCard` and its children are left real -- real enough that "a
 * list of events renders" means an actual row per event, not a mock satisfied by construction.
 */

/**
 * `EventsScreen` pulls in the events components barrel, which (via `DateTimeField` ->
 * `components/journal` -> `JournalComposeModal` -> `MediaPicker`) reaches `expo-media-library`
 * and `expo-image-picker`. Neither loads under jest -- `expo-media-library` throws
 * "Super expression must either be null or a function" at import time, the same reason
 * `JournalScreen.capture.test.js` stubs it. Nothing in this file drives either picker, so a bare
 * stub is enough.
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
// The same barrel chain also reaches `FullScreenMediaViewer` (expo-video),
// `VideoThumbnail`/capture helpers (expo-video-thumbnails), the camera screen (expo-camera) and
// `CalendarPickerModal` (`@react-native-community/datetimepicker`) -- all native-only, all
// unused by anything this file actually renders.
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

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  // Spread the real module rather than replacing it outright: if a later change (e.g. T064's
  // extraction) reaches for `useRoute`/`useFocusEffect`/anything else this file doesn't
  // anticipate, the guard should fail on a real assertion, not on a missing-export module
  // error that reads like the screen broke when only this mock is stale.
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { useEvents } from '../../hooks/useEvents';
import EventsScreen from '../EventsScreen';

const guest = (id, status) => ({ id, name: `Guest ${id}`, avatar: null, status });

const makeEvent = (overrides) => ({
  id: 'ev1',
  tab: 'my',
  templateId: 'party',
  title: 'Birthday Bash',
  subtitle: '',
  date: '2099-01-01', // civil date, YYYY-MM-DD -- the real wire shape (CivilDateJsonConverter).
  location: { name: 'The Loft', address: '', lat: null, lng: null },
  host: { id: 'u1', name: 'Sam', avatar: null },
  coverImage: '',
  status: 'published',
  description: '',
  rsvp: null,
  guests: [guest('g1', 'going')],
  ...overrides,
});

function texts(tree) {
  return tree.root.findAllByType('Text').map((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children.flat(3) : [node.props.children];
    return children.filter((c) => typeof c === 'string' || typeof c === 'number').join('');
  });
}

const shows = (tree, pattern) => texts(tree).some((t) => pattern.test(t));

/**
 * Find a pressable (host `TouchableOpacity`) whose rendered text matches.
 *
 * Filtered to the host `TouchableOpacity` type specifically, not merely "anything with an
 * `onPress` prop" -- `findAll` also walks through `EventCard` itself, a `memo`-wrapped
 * composite that simply forwards its own `onPress` prop (`handleSelect`) without binding it to
 * an event. Matching that node and calling `.props.onPress()` with no argument is how this once
 * reached `EventsScreen`'s `handleSelect` with `event` undefined -- a false "it works" on the
 * wrong node, not evidence the button was pressed.
 */
function pressableByText(tree, matcher) {
  const matches = tree.root.findAll((node) => {
    if (node.type !== TouchableOpacity) return false;
    if (typeof node.props?.onPress !== 'function') return false;
    return node.findAllByType('Text').some((t) => {
      const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
      return matcher.test(children.filter((c) => typeof c === 'string').join(''));
    });
  });
  if (matches.length === 0) {
    throw new Error(`No pressable matching ${matcher}. Showing: ${JSON.stringify(texts(tree))}`);
  }
  return matches[0];
}

/** The FAB carries only an icon, no matching text -- found by the `add` icon it renders. */
function findFab(tree) {
  const matches = tree.root.findAll(
    (node) =>
      node.type === TouchableOpacity &&
      typeof node.props?.onPress === 'function' &&
      node.findAllByProps({ name: 'add' }).length > 0
  );
  if (matches.length === 0) throw new Error('No + (FAB) found.');
  return matches[0];
}

const press = async (node) => {
  await act(async () => {
    node.props.onPress();
  });
  // Same `VirtualizedList` timer as `mount()` -- re-rendering the list (a tab switch) schedules
  // it again.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

function mockUseEvents(eventsByTab) {
  useEvents.mockImplementation((tab) => ({
    events: eventsByTab[tab] || [],
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }));
}

async function mount() {
  let tree;
  await act(async () => {
    tree = create(<EventsScreen />);
  });
  // `FlatList`/`VirtualizedList` schedules its own cell-measurement update via a real
  // `setTimeout`, after the initial render -- outside this act() otherwise, and React warns.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  useEvents.mockReset();
});

describe('EventsScreen (FR-035 regression guard, pre-extraction)', () => {
  it('renders the My / Invites / Drafts segmented control', async () => {
    mockUseEvents({});
    const tree = await mount();

    expect(shows(tree, /^My events$/)).toBe(true);
    expect(shows(tree, /^Invites$/)).toBe(true);
    expect(shows(tree, /^Drafts$/)).toBe(true);
  });

  it("starts on the 'my' tab and asks useEvents for it", async () => {
    mockUseEvents({ my: [makeEvent({ id: 'hosted' })] });
    await mount();

    expect(useEvents).toHaveBeenCalledWith('my');
  });

  it('lists the active tab\'s events as event rows', async () => {
    mockUseEvents({
      my: [
        makeEvent({ id: 'hosted-1', title: 'Birthday Bash' }),
        makeEvent({ id: 'hosted-2', title: 'Garden Party' }),
      ],
    });
    const tree = await mount();

    expect(shows(tree, /^Birthday Bash$/)).toBe(true);
    expect(shows(tree, /^Garden Party$/)).toBe(true);
  });

  it('switching to Invites re-renders useEvents for that tab and shows its events', async () => {
    mockUseEvents({
      my: [makeEvent({ id: 'hosted', title: 'Birthday Bash' })],
      invites: [makeEvent({ id: 'invited', tab: 'invites', title: 'Garden Party', rsvp: 'going' })],
    });
    const tree = await mount();

    await press(pressableByText(tree, /^Invites$/));

    expect(useEvents).toHaveBeenLastCalledWith('invites');
    expect(shows(tree, /^Garden Party$/)).toBe(true);
  });

  it('switching to Drafts re-renders useEvents for that tab', async () => {
    mockUseEvents({
      my: [makeEvent({ id: 'hosted' })],
      drafts: [makeEvent({ id: 'draft-1', tab: 'drafts', title: 'Unsent Invite', status: 'draft' })],
    });
    const tree = await mount();

    await press(pressableByText(tree, /^Drafts$/));

    expect(useEvents).toHaveBeenLastCalledWith('drafts');
    expect(shows(tree, /^Unsent Invite$/)).toBe(true);
  });

  it('the + opens EventForm in create mode', async () => {
    mockUseEvents({});
    const tree = await mount();

    await press(findFab(tree));

    expect(mockNavigate).toHaveBeenCalledWith('EventForm', { mode: 'create' });
  });

  it('selecting an event opens EventDetail with its id and the event itself', async () => {
    const event = makeEvent({ id: 'hosted-1', title: 'Birthday Bash' });
    mockUseEvents({ my: [event] });
    const tree = await mount();

    await press(pressableByText(tree, /^Birthday Bash$/));

    expect(mockNavigate).toHaveBeenCalledWith('EventDetail', { eventId: 'hosted-1', event });
  });

  // The screen's own comment records why these two are distinct: "you have no events" and "we
  // could not ask" collapsing into one blank screen is exactly what hid a failure before this
  // screen grew an error state at all (:80-84). T064 extracts this `FlatList` next, so this is
  // the regression that extraction could most easily reintroduce without anyone noticing.
  it('shows the error state, with a working Try again, when the hook reports an error', async () => {
    const refresh = jest.fn();
    useEvents.mockImplementation(() => ({
      events: [],
      isLoading: false,
      error: { message: 'Network request failed', status: 503 },
      refresh,
    }));
    const tree = await mount();

    expect(shows(tree, /Couldn't load events/)).toBe(true);
    expect(shows(tree, /Network request failed/)).toBe(true);

    await press(pressableByText(tree, /^Try again$/));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state, not the error state, when there are no events and no error', async () => {
    mockUseEvents({});
    const tree = await mount();

    expect(shows(tree, /No events yet/)).toBe(true);
    expect(shows(tree, /Couldn't load events/)).toBe(false);
  });
});
