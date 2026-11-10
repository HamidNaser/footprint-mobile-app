/**
 * 013 T064 -- `EventsList` (research R11), the list body extracted from `EventsScreen` so the
 * same rows/empty/error states serve two shapes:
 *   - **flat** (`events`): `EventsScreen`'s My / Invites / Drafts tabs, unchanged (FR-035, pinned
 *     separately by `EventsScreen.route.test.js`, T063);
 *   - **sectioned** (`upcoming` / `past`): the Timeline tab's Events pane -- "Coming up"
 *     (ascending) then "Past" (descending), an optional "Drafts (n)" row and a "+ New event" row
 *     (FR-031-033).
 *
 * `onDrafts`/`onCreate`/`onRefresh`/`onRetry` are callback props, not navigation calls owned by
 * this component -- matching how `EventCard` takes `onPress` rather than navigating itself. The
 * screens that render `EventsList` decide what each callback does. `useUpcomingEvents` (the
 * Events pane's data source) has no `refresh()` by design, so the Events pane passes no
 * `onRefresh`/`onRetry` -- the "omits the Try again button" case below pins that this component
 * degrades gracefully (hides the button) rather than wiring it to nothing.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import EventsList from '../EventsList';

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
  // Same `VirtualizedList` timer as `mount()` below -- re-rendering the list schedules it again.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

async function mount(props) {
  let tree;
  await act(async () => {
    tree = create(<EventsList {...props} />);
  });
  // `FlatList`/`VirtualizedList` schedules its own cell-measurement update via a real
  // `setTimeout`, after the initial render -- outside this act() otherwise, and React warns.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

describe('EventsList', () => {
  describe('sectioned mode (Timeline Events pane)', () => {
    it('renders "Coming up" before "Past", each from its own given list', async () => {
      const upcoming = [makeEvent({ id: 'u1', title: 'Garden Party' })];
      const past = [makeEvent({ id: 'p1', title: 'Old Reunion', date: '2000-01-01' })];
      const tree = await mount({ upcoming, past });

      const order = texts(tree);
      const comingUpIdx = order.findIndex((t) => t === 'Coming up');
      const gardenIdx = order.findIndex((t) => t === 'Garden Party');
      const pastIdx = order.findIndex((t) => t === 'Past');
      const reunionIdx = order.findIndex((t) => t === 'Old Reunion');

      expect(comingUpIdx).toBeGreaterThan(-1);
      expect(pastIdx).toBeGreaterThan(-1);
      expect(comingUpIdx).toBeLessThan(gardenIdx);
      expect(gardenIdx).toBeLessThan(pastIdx);
      expect(pastIdx).toBeLessThan(reunionIdx);
    });

    it('omits a section header for a list that is empty', async () => {
      const tree = await mount({ upcoming: [makeEvent({ id: 'u1' })], past: [] });
      expect(shows(tree, /^Coming up$/)).toBe(true);
      expect(shows(tree, /^Past$/)).toBe(false);
    });

    it('shows "Drafts (n)" when n > 0 and calls onDrafts when pressed', async () => {
      const onDrafts = jest.fn();
      const tree = await mount({ upcoming: [], past: [], draftsCount: 3, onDrafts });

      expect(shows(tree, /^Drafts \(3\)$/)).toBe(true);
      await press(pressableByText(tree, /^Drafts \(3\)$/));
      expect(onDrafts).toHaveBeenCalledTimes(1);
    });

    it('hides the Drafts row when the count is 0', async () => {
      const onDrafts = jest.fn();
      const tree = await mount({ upcoming: [], past: [], draftsCount: 0, onDrafts });
      expect(texts(tree).some((t) => /^Drafts \(/.test(t))).toBe(false);
    });

    it('"+ New event" calls onCreate', async () => {
      const onCreate = jest.fn();
      const tree = await mount({ upcoming: [], past: [], onCreate });

      expect(shows(tree, /^\+ New event$/)).toBe(true);
      await press(pressableByText(tree, /^\+ New event$/));
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it('shows the empty state, not the error state, when there are no events and no error', async () => {
      const tree = await mount({ upcoming: [], past: [] });
      expect(shows(tree, /No events yet/)).toBe(true);
      expect(shows(tree, /Couldn.t load events/)).toBe(false);
    });

    it('shows the error state, not the empty state, when the hook reports an error', async () => {
      const tree = await mount({ upcoming: [], past: [], error: { message: 'Network request failed' } });
      expect(shows(tree, /Couldn.t load events/)).toBe(true);
      expect(shows(tree, /Network request failed/)).toBe(true);
      expect(shows(tree, /No events yet/)).toBe(false);
    });

    it('omits the Try again button when no onRetry is given (useUpcomingEvents has no refresh)', async () => {
      const tree = await mount({ upcoming: [], past: [], error: { message: 'Network request failed' } });
      expect(shows(tree, /Couldn.t load events/)).toBe(true);
      expect(() => pressableByText(tree, /^Try again$/)).toThrow();
    });

    it('a row press calls onSelect with the event', async () => {
      const onSelect = jest.fn();
      const event = makeEvent({ id: 'u1', title: 'Garden Party' });
      const tree = await mount({ upcoming: [event], past: [], onSelect });

      await press(pressableByText(tree, /^Garden Party$/));
      expect(onSelect).toHaveBeenCalledWith(event);
    });
  });

  describe('flat mode (EventsScreen tabs)', () => {
    it('renders the given events as rows, with no section headers', async () => {
      const events = [
        makeEvent({ id: 'e1', title: 'Birthday Bash' }),
        makeEvent({ id: 'e2', title: 'Garden Party' }),
      ];
      const tree = await mount({ events, tab: 'my' });

      expect(shows(tree, /^Birthday Bash$/)).toBe(true);
      expect(shows(tree, /^Garden Party$/)).toBe(true);
      expect(shows(tree, /^Coming up$/)).toBe(false);
      expect(shows(tree, /^Past$/)).toBe(false);
    });

    it('shows no Drafts row or + New event row when those callbacks are not given', async () => {
      const tree = await mount({ events: [makeEvent({ id: 'e1' })], tab: 'my' });
      expect(texts(tree).some((t) => /^Drafts \(/.test(t))).toBe(false);
      expect(shows(tree, /^\+ New event$/)).toBe(false);
    });

    it("shows the tab's own empty copy", async () => {
      const tree = await mount({ events: [], tab: 'invites' });
      expect(shows(tree, /No invitations/)).toBe(true);
    });

    it('shows the error state with a working Try again when onRetry is given', async () => {
      const onRetry = jest.fn();
      const tree = await mount({
        events: [],
        tab: 'my',
        error: { message: 'Network request failed', status: 503 },
        onRetry,
      });

      expect(shows(tree, /Couldn.t load events/)).toBe(true);
      expect(shows(tree, /Network request failed/)).toBe(true);
      await press(pressableByText(tree, /^Try again$/));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
