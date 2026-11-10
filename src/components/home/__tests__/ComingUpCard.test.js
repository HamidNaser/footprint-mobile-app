/**
 * 013 T066 -- `ComingUpCard`, Home's "Coming up" card (FR-034, research R11, SC-009).
 *
 * Three mutually exclusive states this file pins, each written so it would fail if the card
 * were rendered in either of the other two:
 *  - **events**: up to the first two upcoming events (date tile, title, place), the "Coming up"
 *    heading and "See all ›" all present, the error line absent, and a third event never shown.
 *  - **none**: the strong claim -- `toJSON()` is `null`, not merely "the heading text is
 *    absent" -- so there is no empty card competing with the Events quick action for space.
 *  - **error**: the quiet line only, with the heading, "See all ›" and every row absent, so a
 *    failed load can never be mistaken for "you have no events" (the spec's own Edge Case).
 *
 * `onPress` is a plain callback prop here -- this file does not know or care that it resolves to
 * `navigate('Timeline', { view: 'events' })`; that wiring belongs to `HomeScreen` and is pinned
 * by `HomeScreen.comingUp.test.js`.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity, Text } from 'react-native';
import ComingUpCard from '../ComingUpCard';

const event = (overrides) => ({
  id: 'ev1',
  title: 'Garden Party',
  date: '2026-11-08',
  location: { name: 'The Loft' },
  ...overrides,
});

function texts(tree) {
  return tree.root.findAllByType(Text).map((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children.flat(3) : [node.props.children];
    return children.filter((c) => typeof c === 'string' || typeof c === 'number').join('');
  });
}

const shows = (tree, pattern) => texts(tree).some((t) => pattern.test(t));

/** Mounts through `act`, matching `EventsList.test.js` -- this React/renderer combination warns
 * (and, left unflushed, corrupts a *later* test) on a bare `create()`. */
async function mount(element) {
  let tree;
  await act(async () => {
    tree = create(element);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

describe('ComingUpCard (T066)', () => {
  it('shows the next one or two upcoming events -- date tile, title, place -- and nothing from the other two states', async () => {
    const tree = await mount(
      <ComingUpCard
        upcoming={[
          event({ id: 'e1', title: 'Garden Party', date: '2026-11-08', location: { name: 'The Loft' } }),
          event({ id: 'e2', title: 'Book Club', date: '2026-11-15', location: { name: 'Library' } }),
          event({ id: 'e3', title: 'Should not show', date: '2026-12-01', location: { name: 'Nowhere' } }),
        ]}
        error={null}
        onPress={() => {}}
      />
    );

    expect(shows(tree, /^Coming up$/)).toBe(true);
    expect(shows(tree, /^Garden Party$/)).toBe(true);
    expect(shows(tree, /^The Loft$/)).toBe(true);
    expect(shows(tree, /^Book Club$/)).toBe(true);
    expect(shows(tree, /^Library$/)).toBe(true);
    expect(shows(tree, /NOV/)).toBe(true);
    expect(shows(tree, /^08$/)).toBe(true);
    expect(shows(tree, /^15$/)).toBe(true);
    expect(shows(tree, /^See all/)).toBe(true);

    // Only the first two -- a third upcoming event never displaces the card's one-or-two slot.
    expect(shows(tree, /Should not show/)).toBe(false);
    expect(shows(tree, /^Nowhere$/)).toBe(false);

    // Discriminating against the other two states.
    expect(shows(tree, /Couldn.t load upcoming events/)).toBe(false);
    expect(tree.toJSON()).not.toBeNull();
  });

  it('renders nothing at all when there are no upcoming events, not merely "no heading text"', async () => {
    const tree = await mount(<ComingUpCard upcoming={[]} error={null} onPress={() => {}} />);

    // The strong claim: the component renders no tree whatsoever.
    expect(tree.toJSON()).toBeNull();
    expect(shows(tree, /^Coming up$/)).toBe(false);
    expect(shows(tree, /Couldn.t load upcoming events/)).toBe(false);
  });

  it("shows a quiet \"Couldn't load upcoming events\" line on error, instead of disappearing or showing rows", async () => {
    const tree = await mount(
      <ComingUpCard upcoming={[]} error={{ message: 'Network request failed' }} onPress={() => {}} />
    );

    expect(shows(tree, /Couldn.t load upcoming events/)).toBe(true);
    expect(tree.toJSON()).not.toBeNull();

    // Discriminating against the other two states: no heading, no "See all", no rows.
    expect(shows(tree, /^Coming up$/)).toBe(false);
    expect(shows(tree, /^See all/)).toBe(false);
  });

  it('never shows rows on error, even if a caller passed a non-empty upcoming list alongside it', async () => {
    // `useUpcomingEvents` fails closed (error implies empty lists), so this shape never actually
    // reaches the card in practice -- this only pins that the card does not silently prefer
    // stale rows over the error if a caller ever did pass both.
    const tree = await mount(
      <ComingUpCard
        upcoming={[event({ title: 'Should not appear' })]}
        error={{ message: 'boom' }}
        onPress={() => {}}
      />
    );

    expect(shows(tree, /Couldn.t load upcoming events/)).toBe(true);
    expect(shows(tree, /Should not appear/)).toBe(false);
  });

  // Fix round 1, Minor 1: the original version of this test called every pressable in one
  // `forEach` behind a single aggregate `expect(onPress).toHaveBeenCalled()`, which cannot
  // tell which one fired -- `onPress={() => {}}` on the nested "See all" button (:89) would
  // still pass, as long as the outer card's own `onPress` fired. Each pressable is now pressed
  // and asserted, then cleared, before the next one -- a broken nested button cannot hide
  // behind the outer card.
  it('tapping the card, and tapping "See all ›", each independently call onPress', async () => {
    const onPress = jest.fn();
    const tree = await mount(<ComingUpCard upcoming={[event()]} error={null} onPress={onPress} />);

    const pressables = tree.root.findAll(
      (node) => node.type === TouchableOpacity && typeof node.props.onPress === 'function'
    );
    expect(pressables.length).toBeGreaterThanOrEqual(2); // the whole card, and "See all ›"

    for (const node of pressables) {
      onPress.mockClear();
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        node.props.onPress();
      });
      expect(onPress).toHaveBeenCalledTimes(1);
    }
  });

  // Minor 4 (fix round 1): `useUpcomingEvents` deliberately sorts a malformed-dated event last
  // but still returns it (constitution: fail open rather than silently drop it) -- so a person
  // with exactly one well-formed upcoming event sees a malformed-dated one in the card's
  // *second* slot. Handled (the tile goes blank, nothing throws) but was untested.
  it('renders a blank date tile, not a crash, for a malformed second-slot date', async () => {
    const tree = await mount(
      <ComingUpCard
        upcoming={[
          event({ id: 'e1', title: 'Garden Party', date: '2026-11-08' }),
          event({ id: 'e2', title: 'Mystery Meetup', date: 'not-a-date' }),
        ]}
        error={null}
        onPress={() => {}}
      />
    );

    expect(shows(tree, /^Mystery Meetup$/)).toBe(true);
    // No month/day rendered for the malformed one -- not a throw, not a fabricated date.
    expect(shows(tree, /not-a-date/)).toBe(false);
  });

  // Minor 4 continued: the other two handled-but-untested edge cases the reviewer named,
  // one assertion each.
  it('omits the place line when an event has no location', async () => {
    const tree = await mount(
      <ComingUpCard
        upcoming={[event({ title: 'No Place Party', location: null })]}
        error={null}
        onPress={() => {}}
      />
    );

    expect(shows(tree, /^No Place Party$/)).toBe(true);
    expect(shows(tree, /^The Loft$/)).toBe(false);
  });

  it('renders a very long title without crashing', async () => {
    const longTitle = 'A'.repeat(200);
    const tree = await mount(
      <ComingUpCard upcoming={[event({ title: longTitle })]} error={null} onPress={() => {}} />
    );

    expect(shows(tree, new RegExp(`^${longTitle}$`))).toBe(true);
  });

  // Minor 3 (fix round 1, ruled): keep the `'Untitled event'` fallback and pin it -- a blank
  // title is worse than a fallback a person would actually read, and it was unrequested,
  // user-visible and untested.
  it("falls back to 'Untitled event' when an event has no title", async () => {
    const tree = await mount(
      <ComingUpCard upcoming={[event({ title: '' })]} error={null} onPress={() => {}} />
    );

    expect(shows(tree, /^Untitled event$/)).toBe(true);
  });
});
