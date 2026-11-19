/**
 * 013 T066 -- HomeScreen renders `ComingUpCard` after the Events quick action, fed by
 * `useUpcomingEvents`, and wired to Timeline's Events view (FR-034, research R11, SC-009).
 *
 * `useUpcomingEvents`'s own behaviour (the civil-date split, the fail-closed error) is covered
 * by its own test (T061); this file is only about what `HomeScreen` does with what the hook
 * gives it, the same division `TimelineScreen.events.test.js` draws for the same hook.
 *
 * The phase checkpoint -- "the six tabs are unchanged (T012)" -- is not re-pinned here:
 * `HomeScreen` renders no tab chrome of its own, so there is nothing about the tab list for this
 * file to check; that checkpoint belongs where the tabs are defined (`AppNavigator.js`).
 *
 * Fix round 1: `HomeScreen` is a bottom-tab screen that never unmounts, so the one load on
 * mount was the only one for the rest of the app session -- a transient failure stranded the
 * card on its error line indefinitely. `@react-navigation/native` is mocked the same way
 * `JournalScreen.capture.test.js` and `PlacesScreen` already establish: `useFocusEffect` runs
 * its effect on mount (React Navigation treats the first mount as a focus) and `__refocus()`
 * runs it again for every mounted screen, standing in for the person switching back to Home
 * from another tab -- the moment this fix is actually for.
 */

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Sam', avatarUrl: null } }),
}));
jest.mock('../../hooks/useUpcomingEvents', () => ({ useUpcomingEvents: jest.fn() }));
jest.mock('@react-navigation/native', () => {
  const ReactForMock = require('react');
  const focused = new Map();
  return {
    useFocusEffect: (effect) => {
      ReactForMock.useEffect(() => {
        focused.set(effect, effect());
        return () => {
          const cleanup = focused.get(effect);
          focused.delete(effect);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    },
    __refocus: () => {
      focused.forEach((cleanup, effect) => {
        if (typeof cleanup === 'function') cleanup();
        focused.set(effect, effect());
      });
    },
  };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
import { __refocus } from '@react-navigation/native';
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents';
import HomeScreen from '../HomeScreen';

const event = (overrides) => ({
  id: 'e1',
  title: 'Garden Party',
  date: '2026-11-08',
  location: { name: 'The Loft' },
  ...overrides,
});

function mockUpcoming(overrides) {
  useUpcomingEvents.mockReturnValue({
    upcoming: [],
    past: [],
    draftsCount: 0,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  });
}

function texts(tree) {
  return tree.root.findAllByType(Text).map((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children.flat(3) : [node.props.children];
    return children.filter((c) => typeof c === 'string' || typeof c === 'number').join('');
  });
}

const shows = (tree, pattern) => texts(tree).some((t) => pattern.test(t));

/** Find a pressable (host `TouchableOpacity`) whose own rendered text matches. */
function pressableByText(tree, matcher) {
  const matches = tree.root.findAll((node) => {
    if (node.type !== TouchableOpacity) return false;
    if (typeof node.props?.onPress !== 'function') return false;
    return node.findAllByType(Text).some((t) => {
      const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
      return matcher.test(children.filter((c) => typeof c === 'string').join(''));
    });
  });
  if (matches.length === 0) {
    throw new Error(`No pressable matching ${matcher}. Showing: ${JSON.stringify(texts(tree))}`);
  }
  return matches[0];
}

/**
 * `SafeAreaView` (react-native-safe-area-context) schedules an insets update on mount; every
 * other screen test in this repo that renders a `SafeAreaView` screen mounts through `act`,
 * plus a tick to flush it, for the same reason (`EventsScreen.initialTab.test.js`,
 * `TimelineScreen.events.test.js`) -- skipping it does not fail the assertions below, it fails
 * the *next* test instead, once Jest tears the environment down mid-update.
 */
const mounted = [];

async function mount(props) {
  let tree;
  await act(async () => {
    tree = create(<HomeScreen navigation={{ navigate: jest.fn() }} {...props} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  mounted.push(tree);
  return tree;
}

beforeEach(() => {
  useUpcomingEvents.mockReset();
  mockUpcoming({});
});

// Unmount every tree this file created -- the `@react-navigation/native` mock's `focused` map
// is module-scoped (one real instance for the whole file, same as `useFocusEffect`'s own real
// listener registry), so an unmounted test's entry must be cleaned up before the next test
// calls `__refocus()`, or a later test would also re-run an earlier test's stale effect.
afterEach(() => {
  while (mounted.length) {
    const tree = mounted.pop();
    act(() => {
      tree.unmount();
    });
  }
});

describe('HomeScreen (T066 -- Coming up card)', () => {
  it('does not ask for the drafts tab, so the landing screen makes two requests and not three (Minor 6)', async () => {
    // The card reads `upcoming` and `error` and nothing else, so the drafts request bought
    // nothing -- a third call on the screen the app opens on. The Timeline pane, which does
    // show "Drafts (n)", asks for it (`TimelineScreen.events.test.js` pins that side).
    mockUpcoming({ upcoming: [event()] });
    await mount();

    expect(useUpcomingEvents).toHaveBeenCalled();
    useUpcomingEvents.mock.calls.forEach(([options]) => {
      expect(options?.includeDrafts).not.toBe(true);
    });
  });

  it('renders the Events quick action, then the Coming up card, in that order', async () => {
    mockUpcoming({ upcoming: [event()] });
    const tree = await mount();

    const all = texts(tree);
    const eventsIndex = all.indexOf('Events');
    const comingUpIndex = all.indexOf('Coming up');
    expect(eventsIndex).toBeGreaterThanOrEqual(0);
    expect(comingUpIndex).toBeGreaterThan(eventsIndex);
  });

  it('shows no Coming up card at all when there are no upcoming events', async () => {
    mockUpcoming({ upcoming: [] });
    const tree = await mount();

    expect(shows(tree, /^Coming up$/)).toBe(false);
    expect(shows(tree, /Couldn.t load upcoming events/)).toBe(false);
    // The Events quick action itself is unaffected either way.
    expect(shows(tree, /^Events$/)).toBe(true);
  });

  it("shows the quiet error line, not the card, when events can't be loaded", async () => {
    mockUpcoming({ error: { message: 'Network request failed' } });
    const tree = await mount();

    expect(shows(tree, /Couldn.t load upcoming events/)).toBe(true);
    expect(shows(tree, /^Coming up$/)).toBe(false);
  });

  it("tapping the Coming up card navigates to Timeline's Events view", async () => {
    mockUpcoming({ upcoming: [event()] });
    const navigate = jest.fn();
    const tree = await mount({ navigation: { navigate } });

    pressableByText(tree, /^See all/).props.onPress();
    expect(navigate).toHaveBeenCalledWith('Timeline', { view: 'events' });
  });

  // Minor 1 (fix round 1): `pressableByText` finds the first pressable whose subtree contains
  // the matching text -- for "See all", that is the *outer card* `TouchableOpacity` (it wraps
  // the nested "See all" button, so the text is in its subtree too), not the nested button
  // itself. The test above alone cannot tell the two apart, and a nested-touchable bug that
  // swallows the tap on the real "See all" button would still pass it. Every pressable the
  // card exposes is checked here, one at a time, each cleared before the next is pressed, so a
  // broken nested button cannot hide behind the outer card's own onPress.
  it('every pressable on the card -- the card body and the nested "See all" -- independently navigates to Timeline', async () => {
    mockUpcoming({ upcoming: [event()] });
    const navigate = jest.fn();
    const tree = await mount({ navigation: { navigate } });

    const pressables = tree.root.findAll(
      (node) => node.type === TouchableOpacity && typeof node.props.onPress === 'function'
    );
    // The whole card plus the nested "See all" -- not the Events quick action, which is its own
    // separate pressable elsewhere in the tree and would not reach this filter by coincidence
    // (different onPress, asserted against a different call below).
    const cardPressables = pressables.filter((node) =>
      node.findAllByType(Text).some((t) => {
        const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
        return /^(Coming up|See all)/.test(children.filter((c) => typeof c === 'string').join(''));
      })
    );
    expect(cardPressables.length).toBeGreaterThanOrEqual(2);

    cardPressables.forEach((node) => {
      navigate.mockClear();
      node.props.onPress();
      expect(navigate).toHaveBeenCalledWith('Timeline', { view: 'events' });
    });
  });

  it('still navigates the Events quick action to the Events screen, unchanged', async () => {
    mockUpcoming({});
    const navigate = jest.fn();
    const tree = await mount({ navigation: { navigate } });

    pressableByText(tree, /^Events$/).props.onPress();
    expect(navigate).toHaveBeenCalledWith('Events');
  });

  // Fix round 1, Important 1: Home never unmounts, so without a retry a transient failure would
  // strand the card on its error line for the rest of the app session. Retried quietly on
  // focus -- no visible "Try again" (FR-034 asks for a *quiet* line) -- and only when there is
  // an error to recover from, so an ordinary tab switch does not refetch on every visit.
  describe('retries on focus when the card has an error, quietly (fix round 1)', () => {
    it('with an error, coming back into focus calls refresh', async () => {
      const refresh = jest.fn();
      mockUpcoming({ error: { message: 'Network request failed' }, refresh });
      await mount();

      // The mount itself is already a focus event (React Navigation treats first mount as
      // one); `__refocus()` stands in for a *later* focus -- the person actually switching
      // back to Home from another tab, which is the moment this fix exists for.
      refresh.mockClear();
      act(() => {
        __refocus();
      });

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('with no error, coming back into focus does not call refresh', async () => {
      const refresh = jest.fn();
      mockUpcoming({ upcoming: [event()], refresh });
      await mount();

      refresh.mockClear();
      act(() => {
        __refocus();
      });

      expect(refresh).not.toHaveBeenCalled();
    });

    // Fix round 2, Critical: `useUpcomingEvents.refresh()` sets a *new* `error` object on
    // every failed load, even an identical repeated failure (`setError({ ... })`,
    // `useUpcomingEvents.js:156`, is a fresh object every time). React Navigation's real
    // `useFocusEffect` (mocked above the same way) re-invokes its callback immediately --
    // with no focus/blur transition at all -- whenever the callback's own identity changes
    // while the screen is already focused. A focus callback whose `useCallback` deps include
    // `upcomingError` directly therefore gets a new identity on every failure and retries
    // immediately, which fails again, unbounded: a retry storm against the network, worst
    // during the outage this retry exists to recover from.
    //
    // This case reproduces the *trigger* deterministically and safely -- one explicit
    // `tree.update()` with a brand-new (but still truthy) `error` object and the same
    // `refresh` reference, no tab switch -- rather than letting a real implementation's own
    // `setState` cascade run inside the test, which could hang or recurse without bound
    // against a genuinely broken implementation. `refresh` here is an inert `jest.fn()`, so
    // even the buggy code path can only call it one extra time from this one forced
    // re-render, never more -- enough to prove the trigger exists without needing to run the
    // loop itself.
    it('a mid-focus re-render with a new (but still truthy) error object does not call refresh again', async () => {
      const refresh = jest.fn();
      const navigation = { navigate: jest.fn() };
      mockUpcoming({ error: { message: 'Network request failed' }, refresh });
      const tree = await mount({ navigation });

      refresh.mockClear();
      // Same `refresh` function, a brand-new `error` object -- no focus/blur event, just
      // HomeScreen re-rendering with a changed value from the hook, the same shape a repeated
      // identical failure produces.
      await act(async () => {
        mockUpcoming({ error: { message: 'Network request failed' }, refresh });
        tree.update(<HomeScreen navigation={navigation} />);
      });

      expect(refresh).not.toHaveBeenCalled();
    });
  });

  // Minor 2 (fix round 1): `shows()` is order-blind, so a card that silently reversed its two
  // rows would still pass every other test in this file. The hook is responsible for the
  // ascending order itself (pinned by `useUpcomingEvents.test.js`); this only pins that the
  // card renders whatever order it is given, rather than re-deriving or reversing it.
  it('renders the two events in the order given, soonest first', async () => {
    mockUpcoming({
      upcoming: [
        event({ id: 'e1', title: 'Garden Party', date: '2026-11-08' }),
        event({ id: 'e2', title: 'Book Club', date: '2026-11-15' }),
      ],
    });
    const tree = await mount();

    const all = texts(tree);
    expect(all.indexOf('Garden Party')).toBeLessThan(all.indexOf('Book Club'));
  });
});
