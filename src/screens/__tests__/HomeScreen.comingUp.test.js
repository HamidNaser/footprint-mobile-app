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
 */

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Sam', avatarUrl: null } }),
}));
jest.mock('../../hooks/useUpcomingEvents', () => ({ useUpcomingEvents: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
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
async function mount(props) {
  let tree;
  await act(async () => {
    tree = create(<HomeScreen navigation={{ navigate: jest.fn() }} {...props} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

beforeEach(() => {
  useUpcomingEvents.mockReset();
  mockUpcoming({});
});

describe('HomeScreen (T066 -- Coming up card)', () => {
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

  it('still navigates the Events quick action to the Events screen, unchanged', async () => {
    mockUpcoming({});
    const navigate = jest.fn();
    const tree = await mount({ navigation: { navigate } });

    pressableByText(tree, /^Events$/).props.onPress();
    expect(navigate).toHaveBeenCalledWith('Events');
  });
});
