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
import { Ionicons } from '@expo/vector-icons';

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

  // De-duplicating a repeated id (two family-tree nodes linked to one account) is a later
  // task's job (research R8/data-model, T010/T011), not this component's -- it only has to
  // honour the count and order it is handed, repeats included.
  it('renders a repeated id as two separate faces, in the given order', () => {
    const withRepeat = [PEOPLE[0], PEOPLE[1], PEOPLE[0]]; // Huda, Karim, Huda again
    const tree = render({ people: withRepeat });

    const allFaces = tree.root
      .findAllByType(TouchableOpacity)
      .filter((node) => node.props.testID?.startsWith('faces-row-face-'));
    expect(allFaces).toHaveLength(3);
    expect(textsIn(tree.root).filter((t) => t === 'Huda' || t === 'Karim')).toEqual([
      'Huda',
      'Karim',
      'Huda',
    ]);
  });
});

/**
 * Review fix round 2. The caption built its names with `.map((p) => p.name)` and no guard, so a
 * chosen person who arrived with no name put the literal word **"Showing undefined"** on screen.
 *
 * The fix cannot simply drop the nameless from the list, either: that leaves "Showing Huda" over
 * a row narrowed to Huda *and somebody else*, or -- with one nameless person chosen and nobody
 * else -- "Showing everyone" over a row narrowed to one. Both are affirmative claims about whose
 * memories are on screen that are not true, which is the project's *Sharing fails closed* rule
 * (`CLAUDE.md`): a partial audience is the one failure mode with no safe side, so the names are
 * all of them or none of them.
 *
 * ⚠ **"Show everyone" must survive it.** It is the only way back to the whole book, and it used
 * to be drawn from the same names -- so a nameless chooser would have taken the way out with it.
 */
describe('a chosen person who arrived with no name (review fix round 2)', () => {
  /** The same book, with Karim's name missing -- everything else about him intact. */
  const NAMELESS = [PEOPLE[0], { id: 'karim', avatarUrl: null }, PEOPLE[2]];

  /** The row's caption: the one line that starts "Showing", never the "Show everyone" action. */
  const caption = (tree) => textsIn(tree.root).find((said) => said.startsWith('Showing'));

  it('never renders the word undefined, and never calls a narrowed row everyone', () => {
    const tree = render({ people: NAMELESS, chosenIds: ['karim'] });

    const said = caption(tree);
    expect(said).toBeDefined();
    expect(said).not.toContain('undefined');
    expect(said).not.toContain('everyone');
    // The way back to the whole book is still there.
    expect(showEveryone(tree)).toBeDefined();
  });

  it('names nobody rather than some of them, when one of two chosen has no name', () => {
    const tree = render({ people: NAMELESS, chosenIds: ['huda', 'karim'] });

    const said = caption(tree);
    expect(said).not.toContain('undefined');
    expect(said).not.toContain('Huda');
    expect(said).not.toContain('everyone');
    expect(showEveryone(tree)).toBeDefined();
  });

  it('still says everyone on that same book while nobody is chosen', () => {
    const tree = render({ people: NAMELESS, chosenIds: [] });

    expect(caption(tree)).toBe('Showing everyone · tap a face to choose');
    expect(showEveryone(tree)).toBeUndefined();
  });

  it('names them all as before when every chosen person has a name', () => {
    const tree = render({ people: NAMELESS, chosenIds: ['huda', 'sami'] });

    expect(caption(tree)).toBe('Showing Huda and Sami');
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

  // FR-016 double-barrels this requirement: visibly marked *and* announced. The case above
  // covers the announcement (`accessibilityState.selected`); this one is the visible half --
  // the checkmark badge is the one visual marking that cannot be mistaken for anything else
  // already on screen (unlike the ring, which is a style on a container a snapshot-free
  // assertion can't easily read), so it is the one asserted on directly.
  it('draws the checkmark badge only on the chosen face, never on the rest', () => {
    const tree = render({ chosenIds: ['sami'] });

    expect(face(tree, 'sami').findAllByType(Ionicons)).toHaveLength(1);
    expect(face(tree, 'sami').findAllByType(Ionicons)[0].props.name).toBe('checkmark');
    expect(face(tree, 'huda').findAllByType(Ionicons)).toHaveLength(0);
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

  // The two-name join above is the brief's own pinned wording; three or more is this file's own
  // reasonable choice (`joinNames`, `FacesRow.js`), left untested until now -- closing that gap.
  it('reads "Showing Huda, Karim and Sami" with three chosen', () => {
    const tree = render({ chosenIds: ['huda', 'karim', 'sami'] });

    expect(textsIn(tree.root)).toContain('Showing Huda, Karim and Sami');
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
