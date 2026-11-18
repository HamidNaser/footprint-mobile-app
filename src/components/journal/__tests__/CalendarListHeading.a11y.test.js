/**
 * 016 T009 -- the month and day headings read by a screen reader (FR-014).
 *
 * `CalendarListHeading.test.js` (T006/T007) swept the look of the two heading rows and left
 * their accessibility for last, in both words and in its own header comment. This file is that
 * last piece: the grey day heading is a `header`, named by its own words; the month heading is a
 * `button`, named by its words, its count and whether it is open or closed, with `expanded`
 * carried in its own state as well as in the words -- the same doubled signal FR-014's own
 * example gives ("March 2026, 4 memories, open").
 *
 * Written before `CalendarListHeading.js` carries any of this, so every case below is expected
 * to fail first, for the reason it names: a role or a label that is not there yet.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity, View } from 'react-native';

import { CalendarListHeading } from '../CalendarListHeading';

const render = (props) => {
  let tree;
  act(() => {
    tree = create(<CalendarListHeading {...props} />);
  });
  return tree;
};

describe('the grey day heading is a header, named by its own words (FR-014)', () => {
  it('carries the header role and its label', () => {
    const tree = render({ kind: 'dayHeading', label: 'Thu 5 March' });
    const host = tree.root.findByType(View);

    expect(host.props.accessibilityRole).toBe('header');
    expect(host.props.accessibilityLabel).toBe('Thu 5 March');
  });
});

describe('the month heading is a button, named by its words, its count and its state (FR-014)', () => {
  const MONTH = { kind: 'monthHeading', label: 'March 2026', count: 4, open: false, onPress: () => {} };

  it('says its words, its count and that it is closed', () => {
    const tree = render(MONTH);
    const control = tree.root.findByType(TouchableOpacity);

    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.accessibilityLabel).toBe('March 2026, 4 memories, closed');
    expect(control.props.accessibilityState).toEqual({ expanded: false });
  });

  it('says it is open once it is -- FR-014\'s own example', () => {
    const tree = render({ ...MONTH, open: true });
    const control = tree.root.findByType(TouchableOpacity);

    expect(control.props.accessibilityLabel).toBe('March 2026, 4 memories, open');
    expect(control.props.accessibilityState).toEqual({ expanded: true });
  });

  it('counts one memory as "1 memory", not "1 memories"', () => {
    const tree = render({ ...MONTH, count: 1 });
    const control = tree.root.findByType(TouchableOpacity);

    expect(control.props.accessibilityLabel).toBe('March 2026, 1 memory, closed');
  });

  it('says nothing about a count it was not given', () => {
    const tree = render({ kind: 'monthHeading', label: 'March 2026', open: false, onPress: () => {} });
    const control = tree.root.findByType(TouchableOpacity);

    expect(control.props.accessibilityLabel).toBe('March 2026, closed');
  });

  it('is still a button, named and stated, even with nothing listening for a tap', () => {
    // The plain `View` branch: production always hands this component an `onPress` for a month
    // heading (`JournalScreen.renderRow`), but a month heading drawn without one — which this
    // component's own design allows, so that it never dims under a tap it cannot answer — is
    // still the thing FR-014 is talking about, and still has to say so.
    const tree = render({ kind: 'monthHeading', label: 'March 2026', count: 4, open: true });
    const host = tree.root.findByType(View);

    expect(host.props.accessibilityRole).toBe('button');
    expect(host.props.accessibilityLabel).toBe('March 2026, 4 memories, open');
    expect(host.props.accessibilityState).toEqual({ expanded: true });
    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
  });
});
