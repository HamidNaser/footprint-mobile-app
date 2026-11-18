/**
 * 016 T006 -- the headings that stand above the cards in a month or a year list.
 *
 * `CalendarListHeading` draws the two heading rows `calendarModel.buildRows` produces, and
 * nothing else: the **small grey day heading** of FR-005 ("Thu 5 March"), and the **month
 * heading** of FR-006 ("March 2026" with its count), which a year list pins and opens.
 *
 * What this file is careful about, and why.
 *
 * - **A heading is never a card.** FR-009 says a memory looks exactly as it does today, so the
 *   one thing this component may not do is draw anything that reads as part of a memory. Every
 *   case here is about the heading's own text and its own control.
 * - **The day heading is not tappable.** It opens nothing -- only a month heading does -- and a
 *   row that lights up under a finger and then does nothing is worse than a row that does not.
 *   So "no `TouchableOpacity` at all" is an assertion rather than an omission.
 * - **The month heading is opaque.** In a year list it is pinned (`stickyHeaderIndices`, research
 *   R8) and the month's cards scroll underneath it; a transparent pinned heading would have the
 *   cards legible through the words naming them.
 * - **An unrecognised row draws nothing.** A heading of a kind this file does not know would
 *   otherwise be an empty grey bar in the middle of somebody's memories, which reads as a
 *   defect. Nothing at all is the honest answer, and `buildRows` emits only the two kinds.
 * - **No date is parsed here.** The labels arrive already worded, from `calendarModel`, which is
 *   the one place in this feature that turns a civil date into words. This component is handed
 *   strings and draws them, so there is nothing here for a time zone to move -- and
 *   `calendarModel.test.js`'s civil-date guard reads the file to keep it that way.
 *
 * Accessibility labels and roles are T009's, deliberately last so they are written over the
 * finished lists, and nothing is asserted about them here.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

import { CalendarListHeading, memoriesLabel } from '../CalendarListHeading';

/**
 * Every word the tree renders, flattened -- a `Text`'s children may be an array.
 *
 * Blank strings are left out, and they are not an omission: `@expo/vector-icons` draws a chevron
 * as a `Text` whose glyph is empty under jest, so a heading with an icon on it would otherwise
 * report an empty string nobody can read as though it were a label.
 */
const textsIn = (node) =>
  node.findAllByType(Text).flatMap((t) => {
    const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
    return children.filter((c) => typeof c === 'string' && c.trim() !== '');
  });

const render = (props) => {
  let tree;
  act(() => {
    tree = create(<CalendarListHeading {...props} />);
  });
  return tree;
};

/** The flattened style of the outermost view this component draws, as React Native resolves it. */
const flatten = (style) =>
  Object.assign({}, ...(Array.isArray(style) ? style.flat(3) : [style]).filter(Boolean));

const rootStyle = (tree) => {
  const host = tree.root.findAll((node) => typeof node.type === 'string' && node.props?.style)[0];
  return flatten(host.props.style);
};

const textStyle = (tree, words) => {
  const node = tree.root.findAllByType(Text).find((t) => textsIn(t).includes(words));
  return flatten(node.props.style);
};

describe('the grey day heading (FR-005)', () => {
  it('draws the day it is given, and nothing else', () => {
    const tree = render({ kind: 'dayHeading', label: 'Thu 5 March' });

    expect(textsIn(tree.root)).toEqual(['Thu 5 March']);
  });

  it('is small and grey, so it names the day without competing with it', () => {
    const tree = render({ kind: 'dayHeading', label: 'Thu 5 March' });
    const style = textStyle(tree, 'Thu 5 March');

    // Smaller than the body text a card writes a memory in, and a grey rather than its ink.
    expect(style.fontSize).toBeLessThanOrEqual(13);
    expect(String(style.color).toLowerCase()).toBe('#8e8e93');
  });

  it('cannot be tapped, because it opens nothing', () => {
    const tree = render({ kind: 'dayHeading', label: 'Thu 5 March' });

    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
  });

  it('ignores a count and an open flag, which belong to a month heading', () => {
    // `buildRows` never puts them on a day heading row; a day heading handed them anyway must
    // not grow a count out of them.
    const tree = render({ kind: 'dayHeading', label: 'Thu 5 March', count: 4, open: true });

    expect(textsIn(tree.root)).toEqual(['Thu 5 March']);
  });
});

describe('the month heading of a year list (FR-006)', () => {
  const MONTH = { kind: 'monthHeading', label: 'March 2026', count: 4, open: false };

  it('names the month and how many memories are in it', () => {
    const tree = render(MONTH);

    expect(textsIn(tree.root)).toContain('March 2026');
    expect(textsIn(tree.root)).toContain('4 memories');
  });

  it('counts one memory as one memory', () => {
    const tree = render({ ...MONTH, count: 1 });

    expect(textsIn(tree.root)).toContain('1 memory');
  });

  it('says nothing about a count it was not given', () => {
    const tree = render({ kind: 'monthHeading', label: 'March 2026' });

    // The month, and no count words at all. Asserted as "nothing about memories" rather than as
    // an exact list, because the chevron is itself a `Text` under jest and whether its glyph has
    // resolved depends on which tests ran before this one.
    const words = textsIn(tree.root);
    expect(words).toContain('March 2026');
    expect(words.filter((said) => /memor/i.test(said))).toEqual([]);
  });

  it('reports a tap, which is what opens and closes the month', () => {
    const onPress = jest.fn();
    const tree = render({ ...MONTH, onPress });

    const controls = tree.root.findAllByType(TouchableOpacity);
    expect(controls).toHaveLength(1);
    act(() => {
      controls[0].props.onPress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not tappable at all when nothing is listening, rather than falsely offering to open', () => {
    const tree = render(MONTH);

    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    expect(textsIn(tree.root)).toContain('March 2026');
  });

  it('shows whether its month is open or closed', () => {
    const closed = render({ ...MONTH, onPress: jest.fn() });
    const open = render({ ...MONTH, open: true, onPress: jest.fn() });

    const iconNames = (tree) =>
      tree.root.findAll((node) => typeof node.props?.name === 'string').map((n) => n.props.name);

    // The two states are told apart, and by the direction the chevron points rather than by a
    // word, which is the convention the rest of the app's disclosures follow.
    expect(iconNames(closed)).toContain('chevron-forward');
    expect(iconNames(open)).toContain('chevron-down');
  });

  it('is opaque, because a year pins it over the cards it names', () => {
    const tree = render(MONTH);

    // Research R8: only month heading rows are sticky, so this one has a month's cards sliding
    // underneath it. A transparent heading would have them legible through its words.
    const background = String(rootStyle(tree).backgroundColor || '').toLowerCase();
    expect(background).not.toBe('');
    expect(background).not.toBe('transparent');
    expect(background).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\s*\)/);
  });
});

describe('a row this component does not recognise', () => {
  it('draws nothing at all, rather than an empty bar among the memories', () => {
    expect(render({ kind: 'entry', label: 'not a heading' }).toJSON()).toBeNull();
    expect(render({ kind: 'dayHeading' }).toJSON()).toBeNull();
    expect(render({ kind: 'dayHeading', label: '   ' }).toJSON()).toBeNull();
    expect(render({}).toJSON()).toBeNull();
  });
});

describe('the words a count is said in', () => {
  /**
   * One home for them, because the date bar in month and year mode says the same words about
   * the same period ("March 2026", "4 memories", FR-007) and T009's spoken labels say them a
   * third time. Two copies would be two things to keep in step, and the one that drifted would
   * be the one read aloud.
   */
  it('is "1 memory" for one and "N memories" for the rest', () => {
    expect(memoriesLabel(0)).toBe('0 memories');
    expect(memoriesLabel(1)).toBe('1 memory');
    expect(memoriesLabel(4)).toBe('4 memories');
  });

  it('is nothing at all for a count that is not a count', () => {
    // A period whose memories have not been read yet has no count to say, and "undefined
    // memories" over somebody's journal would be worse than silence.
    expect(memoriesLabel(null)).toBe('');
    expect(memoriesLabel(undefined)).toBe('');
    expect(memoriesLabel(-1)).toBe('');
    expect(memoriesLabel('4')).toBe('');
  });
});
