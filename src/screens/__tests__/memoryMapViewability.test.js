/**
 * The memory map is mounted lazily on **every** screen that lists memory cards, not just the
 * Journal (013 research R10 *Lazy rendering*, plan.md's risk table, review fix Important 3).
 *
 * `JournalEntryCard` mounts a native map view for a memory that has places, and `isVisible`
 * defaults to `true` -- deliberately, so a screen that forgets to gate shows the map rather than
 * silently losing it. The cost of that default is that a screen which forgets is invisible:
 * `PersonJournalScreen` and `FamilySummaryScreen` passed nothing, so every card they put on
 * screen mounted a map at once. `FamilySummaryScreen` is the worse of the two, because it
 * paginates with `onEndReached`: the cards, and their maps, accumulate for as long as somebody
 * keeps scrolling.
 *
 * Both screens now do what `JournalScreen` does -- `useViewableKeys`, the list's
 * `onViewableItemsChanged`, and `isVisible` per card. These cases drive the list's viewability
 * callback and read the `isVisible` each card is actually handed, so they fail if either screen
 * stops gating; the card's own rendering of `isVisible` is `JournalEntryCard.map.test.js`'s.
 *
 * `FamilySummaryScreen`'s case uses the **prefixed** keys a real `SectionList` reports
 * (`<section>:<itemKey>`, `VirtualizedSectionList._subExtractor`), not the bare keys a
 * hand-written token would carry: with the bare shape the screen would pass here and gate
 * nothing on a device.
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

jest.mock('../../components/DayRoster', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => ReactLib.createElement(View, null) };
});

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, accessToken: 'token' }),
}));

jest.mock('../../services/SocialService', () => ({
  getUserEntries: jest.fn(async () => []),
  getJournalBook: jest.fn(async () => ({ days: [], household: [], hasMore: false })),
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
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { FlatList, SectionList } from 'react-native';

import { getUserEntries, getJournalBook } from '../../services/SocialService';
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
    getUserEntries.mockResolvedValue([entry('a'), entry('b'), entry('c')]);
    const tree = await mount(
      <PersonJournalScreen
        route={{ params: { person: { id: 'them', name: 'Ada' } } }}
        navigation={{ goBack: jest.fn(), navigate: jest.fn() }}
      />,
    );
    // The screen opens on the latest day that holds entries, so all three are on screen.
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
  const render = async () => {
    getJournalBook.mockResolvedValue({
      days: [
        {
          date: DAY,
          entries: [
            { ...entry('a'), memberId: 'them' },
            { ...entry('b'), memberId: 'them' },
          ],
        },
      ],
      household: [{ memberId: 'them', name: 'Ada' }],
      hasMore: false,
      oldestDate: DAY,
    });
    const tree = await mount(
      <FamilySummaryScreen
        route={{ params: {} }}
        navigation={{ goBack: jest.fn(), navigate: jest.fn() }}
      />,
    );
    expect(Object.keys(visibilityByCard(tree)).sort()).toEqual(['a', 'b']);
    return tree;
  };

  it('shows every card its map until the list has reported anything', async () => {
    const tree = await render();

    expect(visibilityByCard(tree)).toEqual({ a: true, b: true });
  });

  it('mounts no map on a card that is off screen — with the prefixed keys a real SectionList sends', async () => {
    const tree = await render();

    await act(async () => {
      tree.root.findByType(SectionList).props.onViewableItemsChanged({
        // `<section>:<itemKey>`, as VirtualizedSectionList._subExtractor builds it. A bare 'b'
        // here would let a screen that gates nothing pass this case.
        viewableItems: [{ key: '0:b', item: { ...entry('b'), memberId: 'them' }, index: 1, isViewable: true }],
        changed: [],
      });
    });

    expect(visibilityByCard(tree)).toEqual({ a: false, b: true });
  });
});
