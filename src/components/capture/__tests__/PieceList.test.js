/**
 * 013 T072 -- `PieceList`, and the Remove control on every row (FR-036).
 *
 * The component's rows have been covered only through `CaptureScreen.test.js` until now; this
 * is its first test file of its own, and it exists for the control Phase 9 adds -- owner
 * question 013-Q1, answered on 2026-11-10 with option B.
 *
 * What is pinned down here, all of it from `contracts/ui-contract.md`'s *Remove, on every row*:
 *
 *   - **every row carries one**, labelled for a screen reader as "Remove this <kind>" from the
 *     row's *own* kind label -- "Remove this Photo", "Remove this Voice clip" -- so a person
 *     moving by labels alone is told which of four identical-sounding controls they are on;
 *   - **tapping it calls `onRemove(piece)` once, with that row's own piece**. The piece, not its
 *     index: the screen removes by `localId` (`CaptureDraftStore.removePiece(slot, localId)`),
 *     and an index is exactly the thing that stops being true the moment a row goes;
 *   - **the last remaining piece has none**, whatever its kind. A memory with no pieces cannot
 *     be saved, so a control that emptied the list would leave Save silently doing nothing;
 *     getting rid of all of it is Discard in a new memory [FR-015], and in an edit it is
 *     deleting the memory itself, which this feature does not change. The boundary is checked
 *     from both sides -- one piece, no control; two, a control on each;
 *   - **nothing else on the row moves**: the kind / local `HH:mm` / place meta line reads as it
 *     did (FR-004), a note is still typed in and still blurs to its own handlers, the audio row
 *     still has its player and the video row still has its length. A control added to the meta
 *     line is the easiest way to break the line it is added to.
 *
 * This component decides nothing about *whether* a removal happens -- no confirmation, no store
 * call, no message. That is the screen's, and `CaptureScreen.test.js` is where the three confirm
 * wordings and the failure are pinned. Here the control is a button that reports a tap.
 *
 * The pieces below are shaped like the ones the draft store really hands back: a piece this
 * phone captured carries a `uri` inside `documentDirectory/capture-drafts/<slot>/` (the store's
 * `adoptMedia` puts it there, named for the piece's `localId`), a note carries none, and the
 * order of the array *is* the capture order with the note in the middle of it (FR-005).
 *
 * `expo-audio` is stubbed globally in `jest.setup.js`, which is what lets the real `VoicePlayer`
 * render on the audio row here rather than a stand-in for it.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import PieceList, { kindLabel } from '../PieceList';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** A local instant, so the expected `HH:mm` is the same in every timezone. */
const momentAt = (hour, minute) => new Date(2026, 10, 8, hour, minute).toISOString();

/** A place with a name, as a piece captured near one carries it. */
const ARCADE = { lat: 51.5074, lng: -0.1278, name: 'Old arcade, Bridge St', accuracy: 12 };

/** Where the draft store puts the media of a piece captured into the `new` slot. */
const kept = (localId, extension) =>
  `file:///documents/capture-drafts/new/${localId}${extension}`;

const PHOTO = {
  localId: 'p-photo',
  kind: 'photo',
  uri: kept('p-photo', '.jpg'),
  width: 4032,
  height: 3024,
  capturedAt: momentAt(8, 57),
  location: ARCADE,
};

const NOTE = {
  localId: 'p-note',
  kind: 'text',
  content: 'The arcade still smells the same.',
  capturedAt: momentAt(9, 1),
  location: ARCADE,
};

const CLIP = {
  localId: 'p-clip',
  kind: 'audio',
  uri: kept('p-clip', '.m4a'),
  duration: 31,
  waveform: [0.3, 0.6, 0.2],
  capturedAt: momentAt(9, 3),
};

const VIDEO = {
  localId: 'p-video',
  kind: 'video',
  uri: kept('p-video', '.mov'),
  duration: 12,
  // A coordinate with no name yet: "Place recorded", not "No place" (the component's rule 2).
  capturedAt: momentAt(9, 10),
  location: { lat: 51.5074, lng: -0.1278, accuracy: 20 },
};

/** One of each kind, in capture order, with the note in the middle of it (FR-005). */
const FOUR_KINDS = [PHOTO, NOTE, CLIP, VIDEO];

let trees = [];
let onRemove;
let onChangeText;
let onBlurText;

const render = async (props = {}) => {
  let tree;
  // Awaited: `VoicePlayer` reaches `@expo/vector-icons`, which loads its font asynchronously
  // and sets state when it resolves -- outside `act` that is a warning in the suite's output.
  await act(async () => {
    tree = renderer.create(
      <PieceList
        pieces={FOUR_KINDS}
        onRemove={onRemove}
        onChangeText={onChangeText}
        onBlurText={onBlurText}
        {...props}
      />,
    );
  });
  trees.push(tree);
  return tree;
};

const nodeAt = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID)[0];

const has = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID).length > 0;

const pressable = (tree, testID) =>
  tree.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0];

const textAt = (tree, testID) => {
  const node = nodeAt(tree, testID);
  if (!node) return undefined;
  const { children } = node.props;
  return Array.isArray(children) ? children.join('') : String(children);
};

const tap = async (tree, testID) => {
  const target = pressable(tree, testID);
  expect(target).toBeDefined();
  await act(async () => {
    target.props.onPress();
  });
};

/** Every row on screen, as `kind | time | place`, in order. */
const rows = (tree) =>
  Array.from(
    new Set(
      tree.root
        .findAll(
          (n) => typeof n.props?.testID === 'string' && /^piece-row-\d+$/.test(n.props.testID),
        )
        .map((n) => n.props.testID),
    ),
  )
    .map((testID) => Number(testID.replace('piece-row-', '')))
    .sort((a, b) => a - b)
    .map((index) =>
      [
        textAt(tree, `piece-kind-${index}`),
        textAt(tree, `piece-time-${index}`),
        textAt(tree, `piece-place-${index}`),
      ].join(' | '),
    );

beforeEach(() => {
  onRemove = jest.fn();
  onChangeText = jest.fn();
  onBlurText = jest.fn();
});

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
});

// ============================================================
// FR-036 -- a Remove control on every row
// ============================================================

describe('PieceList: every piece can be taken back out (FR-036)', () => {
  it('gives every row a control, labelled with that row\'s own kind', async () => {
    const tree = await render();

    FOUR_KINDS.forEach((piece, index) => {
      const control = pressable(tree, `piece-remove-${index}`);
      expect(control).toBeDefined();
      // The row's own kind label, which is the only thing that tells four otherwise
      // identical controls apart for somebody reading by label alone.
      expect(control.props.accessibilityLabel).toBe(`Remove this ${kindLabel(piece.kind)}`);
    });

    // Spelled out once, so the labels are readable here and not only derivable.
    expect(pressable(tree, 'piece-remove-0').props.accessibilityLabel).toBe('Remove this Photo');
    expect(pressable(tree, 'piece-remove-1').props.accessibilityLabel).toBe('Remove this Note');
    expect(pressable(tree, 'piece-remove-2').props.accessibilityLabel).toBe(
      'Remove this Voice clip',
    );
    expect(pressable(tree, 'piece-remove-3').props.accessibilityLabel).toBe('Remove this Video');
  });

  /**
   * **At the end of the row's meta line**, which is where the UI contract puts it -- not merely
   * somewhere in the row, which a control rendered under the note input or below the player
   * would satisfy just as well. So it is anchored on the meta `View`'s own
   * `piece-meta-<index>`, and its position within that line is read off the render order.
   */
  it('puts each row\'s control at the end of that row\'s meta line, and not on another row', async () => {
    const tree = await render();

    FOUR_KINDS.forEach((piece, index) => {
      const meta = nodeAt(tree, `piece-meta-${index}`);
      expect(meta).toBeDefined();

      // Kind, time, place, Remove -- in that order, inside the meta line. `findAll` walks the
      // tree in render order, and each node is seen twice (the composite and its host), so the
      // ids are de-duplicated with their first position kept.
      const inTheLine = Array.from(
        new Set(
          meta
            .findAll((n) => typeof n.props?.testID === 'string')
            .map((n) => n.props.testID)
            .filter((testID) => testID.endsWith(`-${index}`)),
        ),
      );
      expect(inTheLine).toEqual([
        `piece-meta-${index}`,
        `piece-kind-${index}`,
        `piece-time-${index}`,
        `piece-place-${index}`,
        `piece-remove-${index}`,
      ]);

      // And it is that row's control, not another row's: a control outside its own row would
      // still be found by testID anywhere in the tree, so the negative is checked too.
      FOUR_KINDS.forEach((_, other) => {
        if (other === index) return;
        expect(meta.findAll((n) => n.props?.testID === `piece-remove-${other}`)).toHaveLength(0);
      });
    });
  });

  it('calls onRemove once with that row\'s own piece, for every kind', async () => {
    const tree = await render();

    await tap(tree, 'piece-remove-0');
    await tap(tree, 'piece-remove-1');
    await tap(tree, 'piece-remove-2');
    await tap(tree, 'piece-remove-3');

    // The piece itself and nothing else: the screen removes by `localId`, and an index is the
    // one thing that stops being true as soon as a row goes.
    expect(onRemove.mock.calls).toEqual([[PHOTO], [NOTE], [CLIP], [VIDEO]]);
  });

  it('does not report a removal nobody asked for', async () => {
    await render();

    expect(onRemove).not.toHaveBeenCalled();
  });

  /**
   * The rule a one-piece memory turns on. Save is disabled with zero pieces, so a control that
   * could empty the list would leave Save silently doing nothing; emptying the memory is
   * Discard in a new one [FR-015], and deleting the memory itself in an edit, which this
   * feature does not change.
   *
   * Checked for each kind rather than for a note alone: the rule is about how many pieces there
   * are, and nothing about what kind the last one is.
   */
  it('offers no control at all on the last remaining piece, whatever its kind', async () => {
    for (const piece of FOUR_KINDS) {
      // eslint-disable-next-line no-await-in-loop
      const tree = await render({ pieces: [piece] });

      expect(has(tree, 'piece-row-0')).toBe(true);
      expect(has(tree, 'piece-remove-0')).toBe(false);
      // And the row is otherwise whole: this is a missing control, not a missing row.
      expect(textAt(tree, 'piece-kind-0')).toBe(kindLabel(piece.kind));
      expect(textAt(tree, 'piece-time-0')).toBeDefined();
    }
  });

  it('offers one on each row as soon as there are two', async () => {
    const tree = await render({ pieces: [PHOTO, NOTE] });

    expect(pressable(tree, 'piece-remove-0')).toBeDefined();
    expect(pressable(tree, 'piece-remove-1')).toBeDefined();
    expect(has(tree, 'piece-remove-2')).toBe(false);
  });
});

// ============================================================
// FR-004 / FR-005 -- the row the control was added to still works
// ============================================================

describe('PieceList: the control disturbs nothing else on the row (FR-004, FR-005)', () => {
  it('leaves the kind, time and place of every row exactly as they were', async () => {
    const tree = await render();

    expect(rows(tree)).toEqual([
      'Photo | 08:57 | Old arcade, Bridge St',
      'Note | 09:01 | Old arcade, Bridge St',
      'Voice clip | 09:03 | No place',
      'Video | 09:10 | Place recorded',
    ]);
  });

  it('leaves each kind\'s own body where it was', async () => {
    const tree = await render();

    // The note is typed in, the clip is played, the video says how long it is -- and the photo
    // says it is kept. One of each, so a control inserted into the wrong branch is caught.
    expect(nodeAt(tree, 'piece-note-input-1').props.value).toBe(NOTE.content);
    expect(pressable(tree, 'piece-player-2-toggle')).toBeDefined();
    expect(textAt(tree, 'piece-detail-3')).toBe('Video · 0:12');
    expect(textAt(tree, 'piece-detail-0')).toBe('Photo kept with this memory');
  });

  it('leaves the note input\'s own handlers reaching the note\'s own piece', async () => {
    const tree = await render();

    const input = tree.root.findAll(
      (n) => n.props?.testID === 'piece-note-input-1' && typeof n.props?.onChangeText === 'function',
    )[0];
    expect(input).toBeDefined();

    await act(async () => {
      input.props.onChangeText('The arcade still smells the same, and the carpet is new.');
    });
    await act(async () => {
      input.props.onBlur();
    });

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenCalledWith(
      NOTE,
      'The arcade still smells the same, and the carpet is new.',
    );
    expect(onBlurText).toHaveBeenCalledTimes(1);
    expect(onBlurText).toHaveBeenCalledWith(NOTE);
    // Typing is not removing: the two controls on the row are not wired to each other.
    expect(onRemove).not.toHaveBeenCalled();
  });

  /**
   * FR-007, one step removed. Playing a clip asks the one shared audio session for
   * `allowsRecording: false`, which would end a recording running below the list -- so the
   * player's control is deadened while one is. Removing touches no audio session at all, so the
   * Remove control is *not* deadened with it; that half is driven through the screen, where the
   * recording really runs, and here it is only that `isRecording` does not reach the control.
   */
  it('keeps every row\'s control live while a recording is running', async () => {
    const tree = await render({ isRecording: true });

    expect(pressable(tree, 'piece-player-2-toggle').props.disabled).toBe(true);
    FOUR_KINDS.forEach((_, index) => {
      const control = pressable(tree, `piece-remove-${index}`);
      expect(control).toBeDefined();
      expect(control.props.disabled).toBeFalsy();
    });
  });
});
