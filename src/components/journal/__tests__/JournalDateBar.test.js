/**
 * 019 T005 -- `JournalDateBar`, the date bar shared by the Family and Friends calendar screens
 * (research R9).
 *
 * This is a copy of the Journal tab's private `DateSelector` (`JournalScreen.js` L355-433), with
 * the same props -- `date`, `label`, `count`, `periodKind`, `hasPrevious`, `hasNext`,
 * `onPrevious`, `onNext`, `onDatePress` -- and the same accessibility (FR-014): ◄ ► are named
 * "Previous/Next <periodKind>" and report `accessibilityState.disabled` at either end of the
 * book, and the period button carries one combined label so a screen reader reads the period and
 * its count as one thing.
 *
 * **The one deliberate difference (FR-013, research R9):** `DateSelector` reads its `date` prop
 * with `new Date(date)`, which parses a bare `'YYYY-MM-DD'` key as UTC midnight and shows the day
 * before anywhere west of Greenwich. This component takes the same kind of key but words it
 * through `parseDateKey` (`src/utils/journalDate.js`), which builds a *local* calendar day from
 * its parts. The civil-date case below pins that, and is written to hold in any zone -- not only
 * one west of UTC -- because `scripts/test-tz.mjs` (T014) runs this file in three.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

import { JournalDateBar } from '../JournalDateBar';

// This bar renders two `@expo/vector-icons` chevrons, which schedule their own async setState
// outside this test's `act()` -- the same omission `CalendarListHeading.a11y.test.js` and
// `CalendarSheet.a11y.test.js` note and raise the timeout for, rather than something this suite
// introduces.
jest.setTimeout(15000);

const render = (props) => {
  let tree;
  act(() => {
    tree = create(<JournalDateBar {...props} />);
  });
  return tree;
};

const control = (tree, testID) =>
  tree.root.findAllByType(TouchableOpacity).find((node) => node.props.testID === testID);

/** Every word a `Text` renders, flattened -- a `Text`'s children may be an array. */
const textsIn = (node) =>
  node.findAllByType(Text).flatMap((t) => {
    const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
    return children.filter((c) => typeof c === 'string' && c.trim() !== '');
  });

describe('day mode -- a civil date, worded without a label or a count', () => {
  it('words a day key as its weekday and day of month', () => {
    // A Thursday, chosen so the weekday word is itself a check that the right day was read.
    const tree = render({ date: '2026-03-05', hasPrevious: true, hasNext: true });

    expect(textsIn(control(tree, 'date-bar-period'))).toEqual(['Thu, Mar 5']);
    expect(control(tree, 'date-bar-period').props.accessibilityLabel).toBe('Thu, Mar 5');
  });

  /**
   * FR-013 (research R9, analyze round 4 H1): `new Date('2026-03-05')` parses as UTC midnight,
   * which reads as 4 March anywhere west of Greenwich. `parseDateKey` builds the day from its
   * own parts, so this must read as 5 March in **any** zone -- `scripts/test-tz.mjs` proves it
   * in three, and this assertion alone is written to hold regardless of which zone runs it: it
   * checks the day-of-month word never regresses to the day before, not a single zone's exact
   * rendering.
   */
  it('reads 2026-03-05 as the 5th, never the 4th, in whichever zone this runs', () => {
    const tree = render({ date: '2026-03-05' });

    const words = textsIn(control(tree, 'date-bar-period'))[0];
    expect(words).toContain('5');
    expect(words).not.toContain('4');
  });
});

describe('month and year mode -- a given label, worded with its count', () => {
  it('shows a month label with its count, combined into one accessibility label', () => {
    const tree = render({
      date: '2026-03-01',
      label: 'March 2026',
      count: 4,
      periodKind: 'month',
    });

    expect(textsIn(control(tree, 'date-bar-period'))).toEqual(['March 2026', '4 memories']);
    expect(control(tree, 'date-bar-period').props.accessibilityLabel).toBe('March 2026, 4 memories');
  });

  it('shows a year label with its count, counting one memory as "1 memory"', () => {
    const tree = render({
      date: '2026-01-01',
      label: '2026',
      count: 1,
      periodKind: 'year',
    });

    expect(textsIn(control(tree, 'date-bar-period'))).toEqual(['2026', '1 memory']);
    expect(control(tree, 'date-bar-period').props.accessibilityLabel).toBe('2026, 1 memory');
  });

  it('says nothing about a count that has not been read yet (count is null)', () => {
    const tree = render({
      date: '2026-03-01',
      label: 'March 2026',
      count: null,
      periodKind: 'month',
    });

    expect(textsIn(control(tree, 'date-bar-period'))).toEqual(['March 2026']);
    expect(control(tree, 'date-bar-period').props.accessibilityLabel).toBe('March 2026');
  });
});

describe('the two arrows (FR-014)', () => {
  it('names each arrow after the period it steps to, and reports neither end reached', () => {
    const tree = render({ date: '2026-03-05', periodKind: 'day', hasPrevious: true, hasNext: true });

    expect(control(tree, 'date-bar-previous').props.accessibilityRole).toBe('button');
    expect(control(tree, 'date-bar-previous').props.accessibilityLabel).toBe('Previous day');
    expect(control(tree, 'date-bar-previous').props.accessibilityState).toEqual({ disabled: false });

    expect(control(tree, 'date-bar-next').props.accessibilityRole).toBe('button');
    expect(control(tree, 'date-bar-next').props.accessibilityLabel).toBe('Next day');
    expect(control(tree, 'date-bar-next').props.accessibilityState).toEqual({ disabled: false });
  });

  it('names a month-mode arrow after the month, and a year-mode arrow after the year', () => {
    const month = render({ date: '2026-03-01', label: 'March 2026', periodKind: 'month' });
    expect(control(month, 'date-bar-previous').props.accessibilityLabel).toBe('Previous month');
    expect(control(month, 'date-bar-next').props.accessibilityLabel).toBe('Next month');

    const year = render({ date: '2026-01-01', label: '2026', periodKind: 'year' });
    expect(control(year, 'date-bar-previous').props.accessibilityLabel).toBe('Previous year');
    expect(control(year, 'date-bar-next').props.accessibilityLabel).toBe('Next year');
  });

  it('announces ◄ as unavailable at the oldest end of the book', () => {
    const tree = render({ date: '2026-03-05', hasPrevious: false, hasNext: true });

    expect(control(tree, 'date-bar-previous').props.accessibilityState).toEqual({ disabled: true });
    expect(control(tree, 'date-bar-next').props.accessibilityState).toEqual({ disabled: false });
  });

  it('announces ► as unavailable at the newest end of the book', () => {
    const tree = render({ date: '2026-03-05', hasPrevious: true, hasNext: false });

    expect(control(tree, 'date-bar-previous').props.accessibilityState).toEqual({ disabled: false });
    expect(control(tree, 'date-bar-next').props.accessibilityState).toEqual({ disabled: true });
  });

  it('reports a tap on either arrow and on the period itself', () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();
    const onDatePress = jest.fn();
    const tree = render({ date: '2026-03-05', onPrevious, onNext, onDatePress });

    act(() => control(tree, 'date-bar-previous').props.onPress());
    act(() => control(tree, 'date-bar-next').props.onPress());
    act(() => control(tree, 'date-bar-period').props.onPress());

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onDatePress).toHaveBeenCalledTimes(1);
  });
});
