/**
 * The root navigator gains a single new entry point -- a "+" that opens `Capture` from any
 * tab (FR-001, research.md R12) -- and must do it without disturbing the six-tab shape
 * (FR-030) or the existing way into `Events` (FR-035).
 *
 * Two different things are being checked here, and they need two different renders:
 *
 * - **Behaviour** -- the tab list, and what tapping the FAB actually does -- is checked by
 *   mounting the real `@react-navigation/bottom-tabs` and `@react-navigation/native-stack`,
 *   with only the leaf screens replaced by trivial stand-ins (so this file is about
 *   navigation shape, not about what any one screen renders -- mounting the real screens
 *   would drag in SQLite, location, sync and media dependencies that have nothing to do
 *   with the question being asked here).
 *
 * - **Registration** -- whether `Capture` and `Events` are configured on the root stack at
 *   all, and with what `options` -- is a fact about *configuration*, not *behaviour*.
 *   `<Stack.Screen>` elements are normally consumed purely as config by
 *   `useNavigationBuilder` and never committed to the render tree, so there is nothing to
 *   find there. This file's second describe block replaces `createNativeStackNavigator`
 *   with a dumb pass-through (`Navigator` renders `children` as-is, `Screen` renders
 *   nothing) so every `<Stack.Screen>` becomes a real, inspectable node carrying its own
 *   `name` and `options` props.
 *
 * Both groups need their own, different mock of the same module paths, so this file uses
 * `jest.doMock` + `jest.resetModules()` + `require` throughout (never the hoisted
 * `jest.mock` + static `import`): a `resetModules` call also clears React itself out of the
 * cache, so every module used after one -- including React, the test renderer, and
 * react-navigation -- is re-required fresh in the same `beforeEach`, to avoid two live
 * copies of React disagreeing about hooks and context.
 */

const SCREEN_NAMES = [
  'HomeScreen',
  'JournalScreen',
  'PersonJournalScreen',
  'FamilySummaryScreen',
  'FamilyScreen',
  'FriendsScreen',
  'PlacesScreen',
  'TimelineScreen',
  'ProfileScreen',
  'SettingsScreen',
  'ImportScreen',
  'UndatedPhotosScreen',
  'LoginScreen',
  'InterviewModeScreen',
  'EventsScreen',
  'EventDetailScreen',
  'EventFormScreen',
];

/** Every screen AppNavigator imports, replaced with a one-line stand-in. */
function mockLeafScreens() {
  SCREEN_NAMES.forEach((name) => {
    jest.doMock(`../../screens/${name}`, () => {
      const ReactLib = require('react');
      const { Text } = require('react-native');
      const Stub = () => ReactLib.createElement(Text, null, name);
      Stub.displayName = name;
      return { __esModule: true, default: Stub };
    });
  });
}

function mockAuth() {
  jest.doMock('../../context/AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: true, isLoading: false }),
  }));
}

describe('MainTabs: the six tabs, and the capture entry point over them', () => {
  let React;
  let create;
  let act;
  let AppNavigator;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ({ create, act } = require('react-test-renderer'));

    mockAuth();
    mockLeafScreens();

    AppNavigator = require('../AppNavigator').default;
  });

  it('keeps exactly Home, Journal, Family, Friends, Places, Timeline, in that order (FR-030)', async () => {
    const { BottomTabBar } = require('@react-navigation/bottom-tabs');

    let tree;
    await act(async () => {
      tree = create(React.createElement(AppNavigator));
    });

    const tabBar = tree.root.findByType(BottomTabBar);
    // .toEqual (not .toContain/arrayContaining) -- a seventh tab, or a reorder, must fail
    // this just as much as a missing one.
    expect(tabBar.props.state.routeNames).toEqual([
      'Home',
      'Journal',
      'Family',
      'Friends',
      'Places',
      'Timeline',
    ]);

    await act(async () => {
      tree.unmount();
    });
  });

  it('renders a CaptureFab over the tabs that opens Capture in one tap, with { mode: "new" } (FR-001)', async () => {
    const { TouchableOpacity } = require('react-native');
    const CaptureScreen = require('../../screens/capture/CaptureScreen').default;

    let tree;
    await act(async () => {
      tree = create(React.createElement(AppNavigator));
    });

    // Every leaf screen is a trivial <Text> stand-in, so the one TouchableOpacity on
    // screen is the FAB's -- this is itself part of what FR-001 asks: a single "+",
    // reachable from the tab currently showing.
    const fab = tree.root.findByType(TouchableOpacity);

    await act(async () => {
      fab.props.onPress();
    });

    const captureScreen = tree.root.findByType(CaptureScreen);
    expect(captureScreen.props.route.params).toEqual({ mode: 'new' });

    await act(async () => {
      tree.unmount();
    });
  });
});

describe('the root stack: Capture registered as a modal, Events left alone', () => {
  let React;
  let create;
  let act;
  let AppNavigator;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ({ create, act } = require('react-test-renderer'));

    mockAuth();

    // Stack.Navigator/Stack.Screen become dumb pass-throughs instead of the real
    // navigator: Navigator renders its children untouched, and Screen is a real (if
    // empty) component, so each <Stack.Screen> -- normally swallowed as configuration by
    // useNavigationBuilder and never rendered -- becomes a committed node carrying its
    // own `name` and `options` props, inspectable below.
    jest.doMock('@react-navigation/native-stack', () => ({
      createNativeStackNavigator: () => ({
        Navigator: ({ children }) => children,
        Screen: () => null,
      }),
    }));

    AppNavigator = require('../AppNavigator').default;
  });

  it('registers Capture with presentation: fullScreenModal', async () => {
    let tree;
    await act(async () => {
      tree = create(React.createElement(AppNavigator));
    });

    const captureScreens = tree.root.findAllByProps({ name: 'Capture' });
    expect(captureScreens).toHaveLength(1);
    expect(captureScreens[0].props.options).toEqual({ presentation: 'fullScreenModal' });

    await act(async () => {
      tree.unmount();
    });
  });

  it('still registers Events (FR-035)', async () => {
    let tree;
    await act(async () => {
      tree = create(React.createElement(AppNavigator));
    });

    expect(tree.root.findAllByProps({ name: 'Events' })).toHaveLength(1);

    await act(async () => {
      tree.unmount();
    });
  });
});
