/**
 * The root navigator gains a single new entry point -- a "+" that opens `Capture` from any
 * tab (FR-001, research.md R12) -- and must do it without disturbing the six-tab shape
 * (FR-030) or the existing way into `Events` (FR-035).
 *
 * Two different things are being checked here, and they need two different renders:
 *
 * - **Behaviour** -- the tab list, and what the FAB actually does -- is checked by mounting
 *   the real `@react-navigation/bottom-tabs` and `@react-navigation/native-stack`, with
 *   only the leaf screens replaced by trivial stand-ins (so this file is about navigation
 *   shape, not about what any one screen renders -- mounting the real screens would drag
 *   in SQLite, location, sync and media dependencies that have nothing to do with the
 *   question being asked here). The FAB is `CaptureFab` mounted once per tab screen (see
 *   `withCaptureFab` in `AppNavigator.js`), which makes "on every tab" six independent
 *   wirings rather than one structurally-unbreakable overlay -- so a dedicated test
 *   navigates to each of the six tabs in turn and checks that one is there, rather than
 *   trusting that finding one proves all six.
 *
 * - **Registration** -- whether `Capture` and `Events` are configured on the root stack at
 *   all, and with what `options` -- is a fact about *configuration*, not *behaviour*.
 *   `<Stack.Screen>` elements are normally consumed purely as config by
 *   `useNavigationBuilder` and never committed to the render tree, so there is nothing to
 *   find there. This file's second describe block replaces `createNativeStackNavigator`
 *   with a dumb pass-through (`Navigator` renders `children` as-is, `Screen` renders
 *   nothing) so every `<Stack.Screen>` becomes a real, inspectable node carrying its own
 *   `name` and `options` props. The leaf screens are still replaced with stand-ins here too
 *   -- `Screen` renders nothing, so skipping that mock would happen to pass today, but only
 *   by accident, and the real screens' module-level imports (SQLite, location, media) are
 *   exactly the dependencies this file exists to stay clear of.
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

/** The six tabs, paired with the module name their `withCaptureFab` wrapper carries. */
const TABS = [
  ['Home', 'HomeScreen'],
  ['Journal', 'JournalScreen'],
  ['Family', 'FamilyScreen'],
  ['Friends', 'FriendsScreen'],
  ['Places', 'PlacesScreen'],
  ['Timeline', 'TimelineScreen'],
];

/**
 * Every screen AppNavigator imports, replaced with a one-line stand-in.
 *
 * `capture/CaptureScreen` is in here as of T030. It needed no stand-in while it was T013's
 * placeholder, but the real screen reaches SQLite (the draft store), AsyncStorage
 * (`SettingsService`), expo-camera and expo-audio at *module* level -- exactly the
 * dependencies this file exists to stay clear of, and none of them is a fact about
 * navigation. The stand-in keeps `findByType` and `props.route.params` working below,
 * because the test and the navigator resolve the same mocked module.
 */
const CAPTURE_SCREEN_PATH = 'capture/CaptureScreen';

function mockLeafScreens() {
  [...SCREEN_NAMES, CAPTURE_SCREEN_PATH].forEach((name) => {
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

/**
 * The `capture-fab` testID, found without descending into a match's own subtree.
 * `TouchableOpacity` forwards `testID` through several of its own internal layers (checked
 * directly under jest: `SimpleFAB` itself, two `TouchableOpacity` fibers, `Animated.View`,
 * and two host `View`s all carry the same `testID` for one logical button -- a plain
 * `findAllByProps` would report 6 matches for a single FAB). `{ deep: false }` stops at the
 * first (outermost) match per branch, which is what "how many FABs" actually means here.
 */
function fabsIn(instance) {
  return instance.findAllByProps({ testID: 'capture-fab' }, { deep: false });
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

  it('renders a CaptureFab on every one of the six tabs, not just the one shown first (FR-001)', async () => {
    const { BottomTabBar } = require('@react-navigation/bottom-tabs');

    let tree;
    await act(async () => {
      tree = create(React.createElement(AppNavigator));
    });

    // The tab navigator's own `navigation` prop (the one BottomTabBar's default buttons
    // use to switch tabs), so each tab actually gets focused and mounted in turn, rather
    // than asserting against whatever a previous tab left behind.
    const { navigation } = tree.root.findByType(BottomTabBar).props;

    for (const [routeName, screenModuleName] of TABS) {
      await act(async () => {
        navigation.navigate(routeName);
      });

      // Scoped to *this* tab's own wrapper -- not the whole tree -- so a FAB left mounted
      // by an earlier tab (lazy screens stay mounted once visited) can't be mistaken for
      // this one having its own. `withCaptureFab`'s wrapper carries the wrapped screen's
      // module name in its displayName, which is how it's found here.
      const wrapper = tree.root.find(
        (node) => node.type && node.type.displayName === `withCaptureFab(${screenModuleName})`
      );

      // { deep: false }: TouchableOpacity forwards `testID` through several of its own
      // internal layers (checked directly: SimpleFAB itself, two TouchableOpacity fibers,
      // Animated.View, two host Views all carry the same testID for one logical button),
      // so a deep findAllByProps would report 6 for a single FAB. `deep: false` stops
      // descending once it matches the outermost one, which is what "exactly one FAB" means.
      expect(fabsIn(wrapper)).toHaveLength(1);
    }

    await act(async () => {
      tree.unmount();
    });
  });

  it('opens Capture with { mode: "new" } when the FAB is pressed (FR-001)', async () => {
    const CaptureScreen = require('../../screens/capture/CaptureScreen').default;

    let tree;
    await act(async () => {
      tree = create(React.createElement(AppNavigator));
    });

    const [fab] = fabsIn(tree.root);

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
    mockLeafScreens();

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
