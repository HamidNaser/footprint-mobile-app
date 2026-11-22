/**
 * The memory map is mounted lazily on **every** screen that lists memory cards, not just the
 * Journal (013 research R10 *Lazy rendering*, plan.md's risk table, review fix Important 3).
 *
 * `JournalEntryCard` mounts a native map view for a memory that has places, and `isVisible`
 * defaults to `true` -- deliberately, so a screen that forgets to gate shows the map rather than
 * silently losing it. The cost of that default is that a screen which forgets is invisible:
 * `PersonJournalScreen` and `FamilySummaryScreen` passed nothing, so every card they put on
 * screen mounted a map at once -- and `FamilySummaryScreen` was the worse of the two, because it
 * paginated with `onEndReached`, so the cards and their maps accumulated for as long as somebody
 * kept scrolling.
 *
 * Both screens now do what `JournalScreen` does -- `useViewableKeys`, the list's
 * `onViewableItemsChanged`, and `isVisible` per card. These cases drive the list's viewability
 * callback and read the `isVisible` each card is actually handed, so they fail if either screen
 * stops gating; the card's own rendering of `isVisible` is `JournalEntryCard.map.test.js`'s.
 *
 * **Both screens are a `FlatList` now** (019 T009, T011). `FamilySummaryScreen`'s case used to
 * drive a `SectionList` with the **prefixed** keys one really reports
 * (`<section>:<itemKey>`, `VirtualizedSectionList._subExtractor`); the family book is a page at
 * a time, over the same single list `PersonJournalScreen` uses, so the keys it reports are the
 * bare ones its own `keyExtractor` answers. That endless scroll is gone, and with it the reason
 * this file was the worst case -- but the gating still has to hold, because a month of a large
 * household is plenty of cards.
 */

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...rest }) => ReactLib.createElement(View, rest, children),
    SafeAreaProvider: ({ children }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactLib.createElement(Text, null, name ?? '');
  return { Ionicons: Icon, MaterialIcons: Icon, FontAwesome: Icon };
});

/** A probe in the card's place: it records the `isVisible` the screen handed it. */
jest.mock('../../components/journal/JournalEntryCard', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Card = ({ entry, isVisible }) =>
    ReactLib.createElement(View, {
      testID: `card-${entry.localId}`,
      'data-visible': isVisible,
    });
  Card.displayName = 'JournalEntryCardProbe';
  return { __esModule: true, JournalEntryCard: Card, default: Card, isOwnMemory: () => false };
});

// There is no per-day roster mock here any more. Both rewired screens draw `JournalDateBar` and
// `FacesRow` above their lists instead (019 T011, research R8), and both come from the journal
// barrel mocked below; the roster went with the day-by-day scroll it sat above. A mock left
// behind would read as a live reference to a component nothing draws.

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, accessToken: 'token' }),
}));

jest.mock('../../services/SocialService', () => ({
  getUserEntries: jest.fn(async () => []),
  getJournalBook: jest.fn(async () => ({ days: [], household: [], hasMore: false })),
}));

/**
 * `PersonJournalScreen` reads the server's calendar look-ups now, not `getUserEntries` (019
 * T009). Its day is `getDay`; `getCalendar` decides which day the book opens on.
 */
jest.mock('../../services/JournalCalendarService', () => ({
  getCalendar: jest.fn(async () => ({ authorIds: [], days: [] })),
  getPeriod: jest.fn(async () => []),
  getDay: jest.fn(async () => []),
}));

jest.mock('../../components/journal', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Pass = ({ children }) => ReactLib.createElement(View, null, children);
  const Nothing = () => null;
  return {
    CalendarCoils: Nothing,
    DateSwipeContainer: Pass,
    EntryGalleryModal: Nothing,
    FullScreenMediaViewer: Nothing,
    CalendarPickerModal: Nothing,
    QuickCaptureBar: Nothing,
    // 019: the two the rewired screens draw above their lists. Neither has anything to do with
    // whether a card mounts its map, which is all this file is about.
    JournalDateBar: Nothing,
    FacesRow: Nothing,
  };
});

// Neither is exported from the barrel above, so neither is covered by its mock -- and both reach
// real components (a `Modal`, a measured heading) that this file has no reason to mount.
jest.mock('../../components/journal/CalendarSheet');
jest.mock('../../components/journal/CalendarListHeading');

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { FlatList } from 'react-native';

import { getJournalBook } from '../../services/SocialService';
import { getCalendar, getDay } from '../../services/JournalCalendarService';
import PersonJournalScreen from '../PersonJournalScreen';
import FamilySummaryScreen from '../FamilySummaryScreen';

global.IS_REACT_ACT_ENVIRONMENT = true;

const DAY = '2026-11-10';

const entry = (localId) => ({
  localId,
  serverId: localId,
  date: DAY,
  createdAt: `${DAY}T10:00:00.000Z`,
  userId: 'them',
  contentBlocks: [],
});

/** The `isVisible` each card was handed, by entry id. */
const visibilityByCard = (tree) =>
  Object.fromEntries(
    tree.root
      .findAll((node) => typeof node.props?.testID === 'string' && node.props.testID.startsWith('card-'))
      .map((node) => [node.props.testID.replace('card-', ''), node.props['data-visible']]),
  );

let trees = [];

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
  jest.clearAllMocks();
});

const mount = async (element) => {
  let tree;
  await act(async () => {
    tree = renderer.create(element);
  });
  await act(async () => {});
  trees.push(tree);
  return tree;
};

describe('PersonJournalScreen gates each card on viewability', () => {
  const render = async () => {
    // The calendar index says the book's newest day with memories is `DAY`, and that day holds
    // the three memories below -- which is how the screen opens with all three on screen.
    getCalendar.mockResolvedValue({
      authorIds: ['them'],
      days: [{ date: DAY, precision: 'day', count: 3 }],
    });
    getDay.mockResolvedValue([entry('a'), entry('b'), entry('c')]);
    const tree = await mount(
      <PersonJournalScreen
        route={{ params: { person: { id: 'them', name: 'Ada' } } }}
        navigation={{ goBack: jest.fn(), navigate: jest.fn() }}
      />,
    );
    // The screen opens on the book's newest day with memories, so all three are on screen.
    expect(Object.keys(visibilityByCard(tree)).sort()).toEqual(['a', 'b', 'c']);
    return tree;
  };

  it('shows every card its map until the list has reported anything', async () => {
    const tree = await render();

    // Nothing is held back before React Native has measured a thing -- the same rule
    // `JournalScreen` relies on, and what makes this agree with the card's `isVisible` default.
    expect(visibilityByCard(tree)).toEqual({ a: true, b: true, c: true });
  });

  it('mounts no map on a card that is off screen, card by card', async () => {
    const tree = await render();
    const list = tree.root.findByType(FlatList);

    await act(async () => {
      list.props.onViewableItemsChanged({
        viewableItems: [{ key: 'a', item: entry('a'), index: 0, isViewable: true }],
        changed: [],
      });
    });

    expect(visibilityByCard(tree)).toEqual({ a: true, b: false, c: false });
  });

  it('shows the map again when a card comes back into view', async () => {
    const tree = await render();
    const fire = async (ids) => {
      await act(async () => {
        tree.root.findByType(FlatList).props.onViewableItemsChanged({
          viewableItems: ids.map((id, index) => ({ key: id, item: entry(id), index, isViewable: true })),
          changed: [],
        });
      });
    };

    await fire(['c']);
    expect(visibilityByCard(tree)).toEqual({ a: false, b: false, c: true });

    await fire(['a', 'b']);
    expect(visibilityByCard(tree)).toEqual({ a: true, b: true, c: false });
  });
});

describe('FamilySummaryScreen gates each card on viewability', () => {
  /**
   * The family book reads in two steps now (019 T011): the household from `/journal/book`, then
   * the calendar's marks, then the day the marks say is newest -- `/journal/book` again, for that
   * one day. Each one is a promise, so the mount needs more than a single flush to settle.
   */
  const render = async () => {
    getJournalBook.mockImplementation(async (token, { before } = {}) => ({
      household: [{ memberId: 'm-them', userId: 'them', name: 'Ada', avatarUrl: null }],
      // The household read (no cursor) carries no day of its own that this screen uses; the day
      // call answers `DAY` and its two memories.
      days: before ? [{ date: DAY, entries: [entry('a'), entry('b')] }] : [],
      hasMore: false,
      oldestDate: DAY,
    }));
    getCalendar.mockResolvedValue({
      authorIds: ['them'],
      days: [{ date: DAY, precision: 'day', count: 2 }],
    });

    const tree = await mount(
      <FamilySummaryScreen
        route={{ params: { memberId: 'node-head' } }}
        navigation={{ goBack: jest.fn(), navigate: jest.fn() }}
      />,
    );
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {});
    }
    expect(Object.keys(visibilityByCard(tree)).sort()).toEqual(['a', 'b']);
    return tree;
  };

  it('shows every card its map until the list has reported anything', async () => {
    const tree = await render();

    expect(visibilityByCard(tree)).toEqual({ a: true, b: true });
  });

  it('mounts no map on a card that is off screen, card by card', async () => {
    const tree = await render();

    await act(async () => {
      tree.root.findByType(FlatList).props.onViewableItemsChanged({
        viewableItems: [{ key: 'b', item: entry('b'), index: 1, isViewable: true }],
        changed: [],
      });
    });

    expect(visibilityByCard(tree)).toEqual({ a: false, b: true });
  });

  it('shows the map again when a card comes back into view', async () => {
    const tree = await render();

    await act(async () => {
      tree.root.findByType(FlatList).props.onViewableItemsChanged({
        viewableItems: [{ key: 'a', item: entry('a'), index: 0, isViewable: true }],
        changed: [],
      });
    });
    expect(visibilityByCard(tree)).toEqual({ a: true, b: false });

    await act(async () => {
      tree.root.findByType(FlatList).props.onViewableItemsChanged({
        viewableItems: [
          { key: 'a', item: entry('a'), index: 0, isViewable: true },
          { key: 'b', item: entry('b'), index: 1, isViewable: true },
        ],
        changed: [],
      });
    });
    expect(visibilityByCard(tree)).toEqual({ a: true, b: true });
  });
});
