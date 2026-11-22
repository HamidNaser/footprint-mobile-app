/**
 * 019 T006 -- `FacesRow`, the row of faces under the date bar on a group book (research R8,
 * data-model *Derived*, FR-010, FR-016, FR-014).
 *
 * Every person the book covers appears once, in the given order, as one toggle each: tapping
 * calls `onToggle(id)` regardless of its dimmed state -- a dimmed face still "stays choosable"
 * (FR-010). This component owns none of the choosing itself; that wiring (add/remove an id,
 * "Show everyone" emptying the list) is T013's, in the hook/screen above it. This suite only
 * proves the props this component is handed are drawn and reported correctly.
 *
 * `presentIds` is the one subtlety (FR-010): a `Set` without a person's id dims that face, but
 * `presentIds === null` -- the period still loading, or failed to load -- dims nobody. Dimming on
 * a failure would show "could not load" as "nobody recorded anything", which FR-010 exists to
 * prevent.
 *
 * `chosenIds` drives the label (as in the prototype): "Showing everyone · tap a face to choose"
 * with nobody chosen, or "Showing <names>" with a "Show everyone" action once something is.
 * Wording for these two is spec-stated (task brief); the exact join of three-or-more names is not,
 * and is this file's own reasonable choice.
 */

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

import { FacesRow } from '../FacesRow';

// Icons under @expo/vector-icons schedule their own async setState outside this test's `act()`,
// the same omission `JournalDateBar.test.js` and `CalendarSheet.a11y.test.js` note and raise the
// timeout for -- not something this suite introduces.
jest.setTimeout(15000);

const PEOPLE = [
  { id: 'huda', name: 'Huda', avatarUrl: 'https://example.com/huda.jpg' },
  { id: 'karim', name: 'Karim', avatarUrl: null },
  { id: 'sami', name: 'Sami', avatarUrl: 'https://example.com/sami.jpg' },
  { id: 'lina', name: 'Lina', avatarUrl: null },
];

const render = (props) => {
  let tree;
  act(() => {
    tree = create(
      <FacesRow
        people={PEOPLE}
        presentIds={null}
        chosenIds={[]}
        onToggle={jest.fn()}
        onShowEveryone={jest.fn()}
        {...props}
      />,
    );
  });
  return tree;
};

const face = (tree, id) =>
  tree.root.findAllByType(TouchableOpacity).find((node) => node.props.testID === `faces-row-face-${id}`);

const showEveryone = (tree) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.props.testID === 'faces-row-show-everyone');

/** Every word a `Text` renders, flattened -- a `Text`'s children may be an array. */
const textsIn = (node) =>
  node.findAllByType(Text).flatMap((t) => {
    const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
    return children.filter((c) => typeof c === 'string' && c.trim() !== '');
  });

describe('every person once, in the given order (FR-010)', () => {
  it('renders one toggle per person, in the order given', () => {
    const tree = render();

    const ids = PEOPLE.map((p) => p.id);
    ids.forEach((id) => {
      expect(face(tree, id)).toBeDefined();
    });

    // Reading order: each face's name appears, in the order `people` gave them.
    const names = textsIn(tree.root).filter((t) => PEOPLE.some((p) => p.name === t));
    expect(names).toEqual(['Huda', 'Karim', 'Sami', 'Lina']);
  });

  it('renders nothing for an empty book', () => {
    const tree = render({ people: [] });
    expect(tree.toJSON()).toBeNull();
  });

  it('works for a person with no avatar, without crashing', () => {
    const tree = render();
    expect(face(tree, 'karim')).toBeDefined();
  });
});

describe('dimming follows presentIds, and a dimmed face stays tappable (FR-010)', () => {
  it('dims a face absent from a present Set, and leaves the rest alone', () => {
    const tree = render({ presentIds: new Set(['huda', 'sami']) });

    expect(face(tree, 'karim').props.accessibilityLabel).toMatch(/nothing/i);
    expect(face(tree, 'huda').props.accessibilityLabel).not.toMatch(/nothing/i);
  });

  it('dims nobody while presentIds is null -- loading or failed, never "nobody recorded"', () => {
    const tree = render({ presentIds: null });

    PEOPLE.forEach((p) => {
      expect(face(tree, p.id).props.accessibilityLabel).not.toMatch(/nothing/i);
    });
  });

  it('calls onToggle for a dimmed face exactly as for any other -- it stays choosable', () => {
    const onToggle = jest.fn();
    const tree = render({ presentIds: new Set(['huda']), onToggle });

    act(() => {
      face(tree, 'karim').props.onPress();
    });

    expect(onToggle).toHaveBeenCalledWith('karim');
  });
});

describe('a chosen face is visibly marked and announced (FR-016)', () => {
  it('carries accessibilityState.selected for a chosen face, and not for the rest', () => {
    const tree = render({ chosenIds: ['sami'] });

    expect(face(tree, 'sami').props.accessibilityState.selected).toBe(true);
    expect(face(tree, 'huda').props.accessibilityState.selected).toBe(false);
  });

  it('is a button, so a tap always reports onToggle, chosen or not', () => {
    const onToggle = jest.fn();
    const tree = render({ chosenIds: ['sami'], onToggle });

    expect(face(tree, 'sami').props.accessibilityRole).toBe('button');

    act(() => {
      face(tree, 'sami').props.onPress();
    });

    expect(onToggle).toHaveBeenCalledWith('sami');
  });
});

describe('the row label (prototype, task brief)', () => {
  it('reads "Showing everyone · tap a face to choose" with nobody chosen, and has no "Show everyone" action', () => {
    const tree = render({ chosenIds: [] });

    expect(textsIn(tree.root)).toContain('Showing everyone · tap a face to choose');
    expect(showEveryone(tree)).toBeUndefined();
  });

  it('reads "Showing Huda and Sami" with two chosen, and offers "Show everyone"', () => {
    const tree = render({ chosenIds: ['huda', 'sami'] });

    expect(textsIn(tree.root)).toContain('Showing Huda and Sami');
    expect(showEveryone(tree)).toBeDefined();
  });

  it('calls onShowEveryone when that action is pressed', () => {
    const onShowEveryone = jest.fn();
    const tree = render({ chosenIds: ['huda'], onShowEveryone });

    act(() => {
      showEveryone(tree).props.onPress();
    });

    expect(onShowEveryone).toHaveBeenCalledTimes(1);
  });
});

describe('large text (FR-014) -- what a renderer can actually check', () => {
  // Scoped to the `Text`s this component itself draws (its label and each person's name) --
  // never the whole tree, which also holds @expo/vector-icons' own glyph `Text`, drawn with
  // `allowFontScaling={false}` inside the library itself and no business being asserted on here.
  const ownTexts = (tree) =>
    tree.root.findAllByType(Text).filter((text) => {
      const children = Array.isArray(text.props.children) ? text.props.children : [text.props.children];
      return children.some(
        (c) => typeof c === 'string' && (PEOPLE.some((p) => p.name === c) || c.startsWith('Showing') || c === 'Show everyone'),
      );
    });

  it('sets no numberOfLines on any text, so a name cannot be cut off', () => {
    const tree = render({ chosenIds: ['huda', 'sami', 'lina'] });

    ownTexts(tree).forEach((text) => {
      expect(text.props.numberOfLines).toBeUndefined();
    });
  });

  it('disables font scaling nowhere -- no allowFontScaling={false}, no restrictive maxFontSizeMultiplier', () => {
    const tree = render({ chosenIds: ['huda', 'sami', 'lina'] });

    ownTexts(tree).forEach((text) => {
      expect(text.props.allowFontScaling).not.toBe(false);
      expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    });
  });
});
