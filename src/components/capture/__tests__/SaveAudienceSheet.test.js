/**
 * 013 T027 -- `SaveAudienceSheet`.
 *
 * What is pinned down here:
 *   - the options are exactly **Only me, Family, Friends, Family & Friends**, in that order,
 *     with **Family pre-selected** and nothing else selected (FR-010);
 *   - no title and no other field is asked for (FR-010): there is nothing to type into;
 *   - tapping one calls `onChoose` with today's visibility value -- `private`, `family`,
 *     `friends` or `family_friends` (research R13, and `VisibilityOptions` in
 *     `src/components/journal/JournalComposeModal.js`), and with nothing else;
 *   - **dismissing calls `onDismiss` and never `onChoose`, by any route the sheet offers**
 *     (FR-011).
 *
 * That last one is the load-bearing case, and it is here in the strongest form the component
 * allows. FR-011: *"A memory MUST NOT be saved without an explicit audience choice from that
 * sheet."* This project's standing rule is that **sharing fails closed** -- if the audience
 * cannot be reliably determined, never store a partial audience and never fall back to a
 * different one. A dismissal that saves anything, or that reports *any* audience upward, is
 * exactly the failure that rule exists to prevent. So every dismissal route is checked, not
 * one of them: the backdrop, the hardware back button (`Modal`'s `onRequestClose`) and Cancel.
 * The last test walks all three in one render and asserts `onChoose` was never called with
 * anything at all.
 *
 * The sheet is **presentational**: it has no save logic, no network, no idea whether it was
 * opened for a new memory or to re-share a refused one. That is deliberate -- the card's
 * re-share reuses this same component (T035/T036). FR-010's *"Save on an edit MUST save
 * straight away, keeping the memory's existing audience, no sheet"* is the **caller's** rule,
 * so there is no edit mode here to test.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';

import SaveAudienceSheet from '../SaveAudienceSheet';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** Today's visibility values (research R13), in the order the sheet must show them. */
const EXPECTED_OPTIONS = [
  { testID: 'audience-option-private', label: 'Only me', value: 'private' },
  { testID: 'audience-option-family', label: 'Family', value: 'family' },
  { testID: 'audience-option-friends', label: 'Friends', value: 'friends' },
  { testID: 'audience-option-family_friends', label: 'Family & Friends', value: 'family_friends' },
];

let trees = [];
let onChoose;
let onDismiss;

const render = async (props = {}) => {
  let tree;
  // Awaited: `@expo/vector-icons` loads its font asynchronously and sets state when it
  // resolves, which outside `act` would add a warning to the suite's output.
  await act(async () => {
    tree = renderer.create(
      <SaveAudienceSheet visible onChoose={onChoose} onDismiss={onDismiss} {...props} />,
    );
  });
  trees.push(tree);
  return tree;
};

const pressable = (tree, testID) =>
  tree.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0];

const nodeAt = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID)[0];

const has = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID).length > 0;

const tap = async (tree, testID) => {
  const target = pressable(tree, testID);
  expect(target).toBeDefined();
  await act(async () => {
    target.props.onPress();
  });
};

/** Every option the sheet shows, in render order. */
const optionIds = (tree) =>
  tree.root
    .findAll(
      (n) =>
        typeof n.props?.testID === 'string' &&
        n.props.testID.startsWith('audience-option-') &&
        typeof n.props?.onPress === 'function',
    )
    .map((n) => n.props.testID)
    .filter((id, index, all) => all.indexOf(id) === index);

const textIn = (node) => {
  const texts = [];
  node.findAll((n) => typeof n.type === 'string' || typeof n.type === 'function').forEach((n) => {
    const { children } = n.props ?? {};
    if (typeof children === 'string') texts.push(children);
    else if (Array.isArray(children)) children.forEach((c) => {
      if (typeof c === 'string') texts.push(c);
    });
  });
  return texts.join(' ');
};

beforeEach(() => {
  onChoose = jest.fn();
  onDismiss = jest.fn();
});

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
});

describe('SaveAudienceSheet: the four audiences, Family pre-selected (FR-010)', () => {
  it('offers exactly Only me, Family, Friends and Family & Friends, in that order', async () => {
    const tree = await render();

    expect(optionIds(tree)).toEqual(EXPECTED_OPTIONS.map((option) => option.testID));

    EXPECTED_OPTIONS.forEach(({ testID, label }) => {
      expect(textIn(nodeAt(tree, testID))).toContain(label);
    });
  });

  it('pre-selects Family, and nothing else', async () => {
    const tree = await render();

    EXPECTED_OPTIONS.forEach(({ testID, value }) => {
      const option = pressable(tree, testID);
      const selected = value === 'family';
      expect(option.props.accessibilityState).toEqual(
        expect.objectContaining({ selected }),
      );
      // The tick is on the pre-selected one only.
      expect(has(tree, `${testID}-selected`)).toBe(selected);
    });
  });

  it('asks for no title and no other field (FR-010)', async () => {
    const tree = await render();

    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('renders nothing while it is not visible', async () => {
    const tree = await render({ visible: false });

    expect(optionIds(tree)).toEqual([]);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('SaveAudienceSheet: a tap is the save (FR-010, research R13)', () => {
  EXPECTED_OPTIONS.forEach(({ testID, label, value }) => {
    it(`“${label}” calls onChoose with "${value}"`, async () => {
      const tree = await render();

      await tap(tree, testID);

      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith(value);
      // A choice is not a dismissal; the caller closes the sheet itself.
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  it('sends only the four real visibility values, and invents none', async () => {
    const tree = await render();

    const sent = [];
    for (const { testID } of EXPECTED_OPTIONS) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, testID);
      sent.push(onChoose.mock.calls[onChoose.mock.calls.length - 1][0]);
    }

    expect(sent).toEqual(['private', 'family', 'friends', 'family_friends']);
    onChoose.mock.calls.forEach((call) => {
      expect(call).toHaveLength(1); // the visibility, and nothing beside it
    });
  });
});

describe('SaveAudienceSheet: dismissing never saves (FR-011, sharing fails closed)', () => {
  it('reports the backdrop as a dismissal and saves nothing', async () => {
    const tree = await render();

    await tap(tree, 'audience-sheet-backdrop');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('reports Cancel as a dismissal and saves nothing', async () => {
    const tree = await render();

    await tap(tree, 'audience-sheet-cancel-button');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('reports the hardware back button as a dismissal and saves nothing', async () => {
    const tree = await render();

    // Android's back button reaches a Modal through onRequestClose, which is the one
    // dismissal route with no control on screen to tap.
    const modal = tree.root.findAll((n) => n.props?.testID === 'audience-sheet-modal')[0];
    expect(modal).toBeDefined();
    expect(typeof modal.props.onRequestClose).toBe('function');

    await act(async () => {
      modal.props.onRequestClose();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('never calls onChoose on any dismissal route, with anything at all', async () => {
    const tree = await render();

    const modal = tree.root.findAll((n) => n.props?.testID === 'audience-sheet-modal')[0];

    await tap(tree, 'audience-sheet-backdrop');
    await tap(tree, 'audience-sheet-cancel-button');
    await act(async () => {
      modal.props.onRequestClose();
    });

    expect(onDismiss).toHaveBeenCalledTimes(3);
    // Not "not called with the pre-selected value" -- not called, full stop. A dismissal
    // that reported any audience at all would be the partial audience the standing rule
    // forbids.
    expect(onChoose).not.toHaveBeenCalled();
    expect(onChoose.mock.calls).toEqual([]);
  });

  it('offers no dismissal route that is not one of those three', async () => {
    const tree = await render();

    const controls = Array.from(
      new Set(
        tree.root
          .findAll(
            (n) => typeof n.props?.onPress === 'function' && typeof n.props?.testID === 'string',
          )
          .map((n) => n.props.testID),
      ),
    ).sort();

    expect(controls).toEqual([
      'audience-option-family',
      'audience-option-family_friends',
      'audience-option-friends',
      'audience-option-private',
      'audience-sheet-backdrop',
      'audience-sheet-cancel-button',
    ]);
    // Nothing pressable hides from the list above, so no untested route can save or dismiss.
    expect(
      tree.root.findAll(
        (n) => typeof n.props?.onPress === 'function' && typeof n.props?.testID !== 'string',
      ),
    ).toHaveLength(0);
  });
});
