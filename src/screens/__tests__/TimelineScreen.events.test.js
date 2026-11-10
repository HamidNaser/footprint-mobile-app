/**
 * 013 T065 -- the Timeline tab's "Timeline | Events" switch (FR-031, research R11).
 *
 * `TimelineScreen` is otherwise untouched here: `LifelineApi` and `AuthContext` are mocked so
 * this file controls exactly what the Timeline pane has to show, and the fixtures below are
 * deliberately non-trivial (a year, a moment count, a milestone-free detail) so the "existing
 * Timeline content is unchanged" case has something real to find. `useUpcomingEvents` is mocked
 * too -- its own behaviour (the civil-date split, the fail-closed error) is covered by
 * `useUpcomingEvents.test.js` (T061); this file is only about what `TimelineScreen` does with
 * what the hook gives it, same division as `EventsScreen.route.test.js` draws for `useEvents`.
 *
 * `EventsList` (T064) is left real: a "list of events renders" here means an actual "Coming up"/
 * "Past" row per event, not a mock satisfied by construction.
 */

jest.mock('../../api/LifelineApi', () => ({
  getTimelineCandidates: jest.fn().mockResolvedValue([]),
  getLifeline: jest.fn(),
  getLifelineYear: jest.fn(),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Sam', avatarUrl: null } }),
}));
jest.mock('../../hooks/useUpcomingEvents', () => ({ useUpcomingEvents: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { getLifeline, getLifelineYear } from '../../api/LifelineApi';
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents';
import TimelineScreen from '../TimelineScreen';

const OVERVIEW = {
  person: { personId: 'p1', isSelf: true, name: 'You' },
  years: [{ year: 1990, momentCount: 2, isBirthYear: false, milestones: [] }],
  lineage: [{ personId: 'p1', isSelf: true, name: 'You', avatar: null }],
};

const DETAIL = { age: 1, moments: [], gateway: [], atAge: [], world: null, isBirthYear: false };

const guest = (id, status) => ({ id, name: `Guest ${id}`, avatar: null, status });

const makeEvent = (overrides) => ({
  id: 'ev1',
  tab: 'my',
  templateId: 'party',
  title: 'Birthday Bash',
  subtitle: '',
  date: '2099-01-01',
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

/** Find a pressable (host `TouchableOpacity`) whose rendered text matches. */
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

const press = async (node) => {
  await act(async () => {
    node.props.onPress();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/**
 * The switch's active style is the second element of its `style` array
 * (`[styles.viewSwitchBtn, active && styles.viewSwitchBtnActive]`) -- `false` when inactive,
 * the actual style object (truthy) when active. Reading that off the real rendered props,
 * rather than re-deriving it from `TimelineScreen`'s own (unexported) `styles`, is what lets
 * this assert "Timeline looks selected, Events does not" without duplicating the component's
 * styling logic.
 */
function activeFlagOf(pressable) {
  const style = pressable.props.style;
  return Array.isArray(style) ? style[1] : undefined;
}

function mockUpcomingEvents(overrides) {
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

async function mount(props) {
  let tree;
  getLifeline.mockResolvedValue(OVERVIEW);
  getLifelineYear.mockResolvedValue(DETAIL);
  await act(async () => {
    tree = create(<TimelineScreen navigation={{ navigate: jest.fn() }} {...props} />);
  });
  // The overview/year-detail loads resolve asynchronously; flush them, then the
  // `VirtualizedList`/`ScrollView` layout timer the same way `EventsScreen.route.test.js` does.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

beforeEach(() => {
  getLifeline.mockReset();
  getLifelineYear.mockReset();
  useUpcomingEvents.mockReset();
  mockUpcomingEvents({});
});

describe('TimelineScreen (T065 -- Timeline | Events)', () => {
  it('shows a "Timeline" / "Events" control in the header, with Timeline selected by default', async () => {
    const tree = await mount();

    expect(shows(tree, /^Timeline$/)).toBe(true);
    expect(shows(tree, /^Events$/)).toBe(true);

    // Discriminating: "Lifeline" (the header brand) and an empty "Coming up" both render
    // regardless of which pane is active (the header is common chrome; the mocked
    // `useUpcomingEvents` returns empty lists either way), so neither tells the default pane
    // apart on its own. "Photos & Videos" (Timeline's media zone) only renders on the Timeline
    // pane, and "No events yet" (the Events pane's own empty state) only on the Events pane --
    // together they pin which one is showing.
    expect(shows(tree, /Photos & Videos/)).toBe(true);
    expect(shows(tree, /^No events yet/)).toBe(false);

    // And the control itself reads as selected on "Timeline", not "Events".
    expect(activeFlagOf(pressableByText(tree, /^Timeline$/))).toBeTruthy();
    expect(activeFlagOf(pressableByText(tree, /^Events$/))).toBe(false);
  });

  it('tapping "Events" opens the Events pane; tapping back to "Timeline" restores it', async () => {
    const tree = await mount();

    await press(pressableByText(tree, /^Events$/));
    expect(shows(tree, /^No events yet/)).toBe(true); // the Events pane's own empty state
    expect(shows(tree, /Photos & Videos/)).toBe(false); // Timeline's media zone is gone

    await press(pressableByText(tree, /^Timeline$/));
    expect(shows(tree, /Photos & Videos/)).toBe(true);
  });

  it("opens straight into the Events pane when the route param is { view: 'events' }", async () => {
    const tree = await mount({ route: { params: { view: 'events' } } });

    expect(shows(tree, /^No events yet/)).toBe(true);
    expect(shows(tree, /Photos & Videos/)).toBe(false);
  });

  // Important 2: `TimelineScreen` is a bottom-tab screen (`AppNavigator.js`) with no
  // `unmountOnBlur` -- React Navigation keeps it mounted for the app's lifetime, unlike the
  // stack screens (`EventDetail`, `EventForm`, ...) that remount fresh per `navigate`. A second
  // visit from Home's "See all ›" (T066, `navigate('Timeline', { view: 'events' })`) only
  // updates `route.params` on the already-mounted screen -- it does not remount it, so a
  // `useState` initializer alone would silently ignore every visit after the first. This case
  // re-renders the *same* tree with a changed `route` prop, the same way React Navigation would.
  it('follows route.params.view on an already-mounted screen (a tab, not a remounting stack screen)', async () => {
    let tree;
    getLifeline.mockResolvedValue(OVERVIEW);
    getLifelineYear.mockResolvedValue(DETAIL);
    await act(async () => {
      tree = create(
        <TimelineScreen navigation={{ navigate: jest.fn() }} route={{ params: { view: 'timeline' } }} />
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(shows(tree, /Photos & Videos/)).toBe(true);

    await act(async () => {
      tree.update(
        <TimelineScreen navigation={{ navigate: jest.fn() }} route={{ params: { view: 'events' } }} />
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(shows(tree, /^No events yet/)).toBe(true);
    expect(shows(tree, /Photos & Videos/)).toBe(false);
  });

  describe('the Events pane renders EventsList from useUpcomingEvents', () => {
    it('shows "Coming up" and "Past" sections from the hook\'s lists', async () => {
      mockUpcomingEvents({
        upcoming: [makeEvent({ id: 'u1', title: 'Garden Party' })],
        past: [makeEvent({ id: 'p1', title: 'Old Reunion', date: '2000-01-01' })],
        draftsCount: 2,
      });
      const tree = await mount({ route: { params: { view: 'events' } } });

      expect(shows(tree, /^Coming up$/)).toBe(true);
      expect(shows(tree, /^Garden Party$/)).toBe(true);
      expect(shows(tree, /^Past$/)).toBe(true);
      expect(shows(tree, /^Old Reunion$/)).toBe(true);
      expect(shows(tree, /^Drafts \(2\)$/)).toBe(true);
    });

    it('"+ New event" navigates to EventForm in create mode', async () => {
      const navigate = jest.fn();
      const tree = await mount({ navigation: { navigate }, route: { params: { view: 'events' } } });

      await press(pressableByText(tree, /^\+ New event$/));
      expect(navigate).toHaveBeenCalledWith('EventForm', { mode: 'create' });
    });

    it('the Drafts row navigates to the existing drafts view', async () => {
      const navigate = jest.fn();
      mockUpcomingEvents({ draftsCount: 1 });
      const tree = await mount({ navigation: { navigate }, route: { params: { view: 'events' } } });

      await press(pressableByText(tree, /^Drafts \(1\)$/));
      expect(navigate).toHaveBeenCalledWith('Events', { initialTab: 'drafts' });
    });

    it('selecting an event opens EventDetail with its id and the event itself', async () => {
      const navigate = jest.fn();
      const event = makeEvent({ id: 'u1', title: 'Garden Party' });
      mockUpcomingEvents({ upcoming: [event] });
      const tree = await mount({ navigation: { navigate }, route: { params: { view: 'events' } } });

      await press(pressableByText(tree, /^Garden Party$/));
      expect(navigate).toHaveBeenCalledWith('EventDetail', { eventId: 'u1', event });
    });

    it('shows the error state, not the empty state, when the hook reports an error', async () => {
      mockUpcomingEvents({ error: { message: 'Sign in to see your events.', code: 'NOT_AUTHENTICATED' } });
      const tree = await mount({ route: { params: { view: 'events' } } });

      expect(shows(tree, /Couldn.t load events/)).toBe(true);
      expect(shows(tree, /Sign in to see your events\./)).toBe(true);
      expect(shows(tree, /No events yet/)).toBe(false);
    });

    // Fix round 2: the Events pane now mirrors EventsScreen's recovery, not just its list --
    // `useUpcomingEvents` gained a `refresh()` once this pane became its second consumer.
    it("renders a working Try again whose press calls the hook's refresh", async () => {
      const refresh = jest.fn();
      mockUpcomingEvents({ error: { message: 'Network request failed' }, refresh });
      const tree = await mount({ route: { params: { view: 'events' } } });

      await press(pressableByText(tree, /^Try again$/));
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    // Important 4: the Lifeline overview (`years.length === 0`) is Timeline-only data. A
    // brand-new user -- every one of them, on their very first visit -- has no Lifeline years
    // yet, and must still be able to reach the Events pane rather than have the "your timeline
    // is empty" branch swallow it.
    it('renders even when the person has no Lifeline years at all (every brand-new user)', async () => {
      getLifeline.mockReset();
      getLifeline.mockResolvedValue({ person: { personId: 'p1', isSelf: true }, years: [], lineage: [] });
      let tree;
      await act(async () => {
        tree = create(
          <TimelineScreen navigation={{ navigate: jest.fn() }} route={{ params: { view: 'events' } }} />
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(shows(tree, /^No events yet/)).toBe(true);
      expect(shows(tree, /Your timeline is empty/)).toBe(false);
    });
  });

  describe('the existing Timeline content is unchanged', () => {
    it('shows the Lifeline header, the focused year and the media zone, by default', async () => {
      const tree = await mount();

      expect(shows(tree, /^Lifeline$/)).toBe(true);
      expect(shows(tree, /^Your 1st year · 1990$/)).toBe(true);
      expect(shows(tree, /Photos & Videos/)).toBe(true);
      expect(shows(tree, /No media for this year yet\./)).toBe(true);
    });

    it('still shows the "your timeline is empty" state when there are no years, on the Timeline pane', async () => {
      getLifeline.mockReset();
      getLifeline.mockResolvedValue({ person: { personId: 'p1', isSelf: true }, years: [], lineage: [] });
      let tree;
      await act(async () => {
        tree = create(<TimelineScreen navigation={{ navigate: jest.fn() }} />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(shows(tree, /Your timeline is empty/)).toBe(true);
      // The control survives even on the empty-timeline branch.
      expect(shows(tree, /^Events$/)).toBe(true);
    });
  });
});
