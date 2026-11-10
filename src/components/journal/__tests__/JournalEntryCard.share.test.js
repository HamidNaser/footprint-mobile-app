/**
 * 013 T035 — what a memory's card says when the server could not apply its audience.
 *
 * FR-011: when the cause is temporary the card says "Waiting to share…" and the phone retries
 * by itself; when the refusal is final it says "Not shared — tap to choose who can see it", and
 * tapping it opens the audience choice again. **While waiting or refused, the card shows
 * "Not shared yet" in place of the audience label, so it never looks shared.**
 *
 * SC-010 is the measurable form of that, and it is why this file exists: **0** memories appear
 * as shared when the server refused their audience. A card still reading "Family" over a memory
 * that is on nobody else's screen is the "appears as shared" half of SC-010, and it is this
 * project's standing rule — *sharing fails closed* — pointing the one way it can go wrong
 * silently. So the audience label is checked for its **absence** in both states, for all four
 * audiences, and not only for the "Not shared yet" that replaces it: a card that showed both
 * would still be a lie.
 *
 * `entry.shareState` (the `share_state` column, mapped camelCase by `DatabaseService`) is the
 * **only** record of what the server last said about the audience (research R15). It is `null`,
 * `'waiting'` or `'refused'`; the two constants live in `src/database/schema.js` beside
 * `SyncStatus`. Nothing here reads the sync engine, and the refusal is deliberately **not** on
 * the sync badge: it is shown on the card and nowhere else (R15, owner Q3), so the badge is
 * checked to be unchanged by it.
 *
 * The re-share reuses `SaveAudienceSheet` (T027/T028) rather than a second audience picker, and
 * the card reports a choice upward as `onReshare(entry, visibility)` — it saves nothing itself.
 * A dismissal reports nothing at all, which is FR-011 again: a memory is never shared on
 * anything but an explicit choice.
 */

jest.setTimeout(30000);

jest.mock('../../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));
jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../EngagementSection', () => ({ EngagementSection: () => null }));
jest.mock('../../media/AudioPlayer', () => ({ AudioPlayer: () => null }));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import renderer, { act } from 'react-test-renderer';

import { JournalEntryCard } from '../JournalEntryCard';
import SaveAudienceSheet from '../../capture/SaveAudienceSheet';
import { ShareState } from '../../../database/schema';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** The words a person reads. Asserted verbatim: these are the product's promise (FR-011). */
const WAITING_LINE = 'Waiting to share…';
const REFUSED_LINE = 'Not shared — tap to choose who can see it';
const NOT_SHARED_YET = 'Not shared yet';

/** Every audience label the header can otherwise show (`VISIBILITY_DISPLAY` in the card). */
const AUDIENCE_LABELS = {
  private: 'Only Me',
  family: 'Family',
  friends: 'Friends',
  family_friends: 'Family & Friends',
};

const user = { id: 'u1', name: 'Sam' };

const entryWith = (overrides = {}) => ({
  localId: 'local-1',
  id: 'local-1',
  userId: 'u1',
  visibility: 'family',
  syncStatus: 'pending',
  createdAt: Date.now(),
  contentBlocks: [{ type: 'text', content: 'walked to the station' }],
  ...overrides,
});

const trees = [];

/**
 * Awaited: `@expo/vector-icons` resolves its font asynchronously and sets state when it does,
 * which outside `act` would put a warning in this suite's output.
 */
const render = async (entry, props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <JournalEntryCard
        entry={entry}
        user={user}
        currentUserId="u1"
        showEngagement={false}
        {...props}
      />,
    );
  });
  trees.push(tree);
  return tree;
};

afterEach(() => {
  while (trees.length) {
    const tree = trees.pop();
    try {
      act(() => tree.unmount());
    } catch {
      /* already gone */
    }
  }
  jest.clearAllMocks();
});

/** Every string the card renders, flattened — children may be an array of fragments. */
const texts = (node) =>
  node
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : t.props.children))
    .filter((value) => typeof value === 'string');

const shows = (tree, line) => texts(tree.root).includes(line);

/** The innermost control carrying this line — the tappable line itself, not a row around it. */
const lineControl = (tree, line) => {
  const matches = tree.root.findAll(
    (node) =>
      node.type === TouchableOpacity &&
      typeof node.props?.onPress === 'function' &&
      texts(node).includes(line),
  );
  return matches[matches.length - 1];
};

const tap = async (control) => {
  expect(control).toBeDefined();
  await act(async () => {
    control.props.onPress();
  });
};

/** The audience sheet, only when the card has really put it on screen. */
const sheets = (tree) => tree.root.findAllByType(SaveAudienceSheet);

const sheetOption = (tree, value) =>
  tree.root.findAll(
    (node) =>
      node.props?.testID === `audience-option-${value}` &&
      typeof node.props?.onPress === 'function',
  )[0];

const syncBadgeIcons = (tree) =>
  tree.root
    .findAllByType(Ionicons)
    .map((icon) => icon.props.name)
    .filter((name) => typeof name === 'string' && name.startsWith('cloud'));

// ---------------------------------------------------------------------------
// The two lines (FR-011)
// ---------------------------------------------------------------------------

describe('the card says what the server said about the audience (FR-011)', () => {
  it('a share the server could not apply yet reads "Waiting to share…"', async () => {
    const tree = await render(entryWith({ shareState: ShareState.WAITING }));

    expect(shows(tree, WAITING_LINE)).toBe(true);
  });

  it('a share the server refused for good reads "Not shared — tap to choose who can see it"', async () => {
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }));

    expect(shows(tree, REFUSED_LINE)).toBe(true);
  });

  it('shows one line and never both — waiting is not refused', async () => {
    const waiting = await render(entryWith({ shareState: ShareState.WAITING }));
    expect(shows(waiting, REFUSED_LINE)).toBe(false);

    const refused = await render(entryWith({ shareState: ShareState.REFUSED }));
    expect(shows(refused, WAITING_LINE)).toBe(false);
  });

  it('says nothing about sharing when the server has said nothing', async () => {
    // The ordinary case, which is every memory until the server refuses one. Neither line
    // appears and the audience label is exactly as it is today.
    const tree = await render(entryWith({ shareState: null }));

    expect(shows(tree, WAITING_LINE)).toBe(false);
    expect(shows(tree, REFUSED_LINE)).toBe(false);
    expect(shows(tree, NOT_SHARED_YET)).toBe(false);
    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(true);
  });

  it('says nothing about sharing when the field is absent altogether', async () => {
    // Entries from other screens (and other people's memories, which carry no share state at
    // all) arrive without the field. An `undefined` must read as "nothing to say", not as a
    // refusal.
    const entry = entryWith();
    delete entry.shareState;

    const tree = await render(entry);

    expect(shows(tree, WAITING_LINE)).toBe(false);
    expect(shows(tree, REFUSED_LINE)).toBe(false);
    expect(shows(tree, NOT_SHARED_YET)).toBe(false);
    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SC-010 — it never looks shared
// ---------------------------------------------------------------------------

describe('a memory the server would not share never looks shared (SC-010)', () => {
  it('reads "Not shared yet" in the header in both states', async () => {
    for (const state of [ShareState.WAITING, ShareState.REFUSED]) {
      const tree = await render(entryWith({ shareState: state }));

      expect({ state, header: shows(tree, NOT_SHARED_YET) }).toEqual({ state, header: true });
    }
  });

  it('never shows the audience the person asked for, whichever one it was', async () => {
    // The sharp edge of this task. The label is what makes a card *look* shared, so each of
    // the four audiences is checked for absence in each state — a card reading "Family" over a
    // memory on nobody's screen is the "appears as shared" half of SC-010.
    for (const state of [ShareState.WAITING, ShareState.REFUSED]) {
      for (const [visibility, label] of Object.entries(AUDIENCE_LABELS)) {
        const tree = await render(entryWith({ visibility, shareState: state }));

        expect({ state, visibility, label: shows(tree, label) }).toEqual({
          state,
          visibility,
          label: false,
        });
        expect({ state, visibility, replaced: shows(tree, NOT_SHARED_YET) }).toEqual({
          state,
          visibility,
          replaced: true,
        });
      }
    }
  });

  it('withholds the audience label even for a share state the server cannot produce', async () => {
    // `share_state` holds only the two values above, and the schema pins that. If some later
    // writer ever puts a third one there, the card must still not claim the memory is shared:
    // fail closed. No line is invented for a value nothing can explain.
    const tree = await render(entryWith({ shareState: 'something-new' }));

    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(false);
    expect(shows(tree, WAITING_LINE)).toBe(false);
    expect(shows(tree, REFUSED_LINE)).toBe(false);
  });

  it('leaves the sync badge exactly as it was — the refusal is on the card only', async () => {
    // Research R15, owner Q3: `share_state` is the only record, and it is not on the badge.
    // A synced memory whose audience was refused still shows the synced badge, because the
    // memory itself did reach the server; what did not happen is the sharing.
    const plain = await render(entryWith({ syncStatus: 'synced' }));
    const refused = await render(entryWith({ syncStatus: 'synced', shareState: ShareState.REFUSED }));

    expect(syncBadgeIcons(plain)).toEqual(['cloud-done-outline']);
    expect(syncBadgeIcons(refused)).toEqual(syncBadgeIcons(plain));
  });
});

// ---------------------------------------------------------------------------
// FR-011, US1-8 — tapping it opens the audience choice again
// ---------------------------------------------------------------------------

describe('tapping the refused line offers the audience again (US1-8)', () => {
  it('does not put the audience sheet on screen until the line is tapped', async () => {
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }));

    expect(sheets(tree)).toHaveLength(0);
  });

  it('opens SaveAudienceSheet — the same sheet that saved the memory, not a second picker', async () => {
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }));

    await tap(lineControl(tree, REFUSED_LINE));

    expect(sheets(tree)).toHaveLength(1);
    expect(sheetOption(tree, 'friends')).toBeDefined();
  });

  it('reports the chosen audience up as onReshare(entry, visibility), once', async () => {
    const onReshare = jest.fn();
    const entry = entryWith({ shareState: ShareState.REFUSED });
    const tree = await render(entry, { onReshare });

    await tap(lineControl(tree, REFUSED_LINE));
    await tap(sheetOption(tree, 'friends'));

    expect(onReshare).toHaveBeenCalledTimes(1);
    expect(onReshare).toHaveBeenCalledWith(entry, 'friends');
  });

  it('closes the sheet once a choice is made', async () => {
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }), {
      onReshare: jest.fn(),
    });

    await tap(lineControl(tree, REFUSED_LINE));
    await tap(sheetOption(tree, 'family_friends'));

    expect(sheets(tree)).toHaveLength(0);
  });

  it('shares nothing when the sheet is dismissed', async () => {
    // FR-011 and *sharing fails closed*: there is no default on the way out. The sheet closes
    // and nothing is reported upward, so the memory stays unshared and still says so.
    const onReshare = jest.fn();
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }), { onReshare });

    await tap(lineControl(tree, REFUSED_LINE));
    const sheet = sheets(tree)[0];
    await act(async () => {
      sheet.props.onDismiss();
    });

    expect(onReshare).not.toHaveBeenCalled();
    expect(sheets(tree)).toHaveLength(0);
    expect(shows(tree, REFUSED_LINE)).toBe(true);
  });

  it('survives a choice with no onReshare wired, rather than throwing in the list', async () => {
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }));

    await tap(lineControl(tree, REFUSED_LINE));
    await tap(sheetOption(tree, 'private'));

    expect(sheets(tree)).toHaveLength(0);
  });

  it('offers no choice while the share is merely waiting — the phone retries by itself', async () => {
    // FR-011 gives the tap to the final refusal only: a waiting share is still going to be
    // sent, and offering the sheet there would invite a second audience for a memory whose
    // first one has not been answered.
    const onReshare = jest.fn();
    const tree = await render(entryWith({ shareState: ShareState.WAITING }), { onReshare });

    expect(lineControl(tree, WAITING_LINE)).toBeUndefined();
    expect(sheets(tree)).toHaveLength(0);
    expect(onReshare).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Whose memory it is (round-1 finding 5)
// ---------------------------------------------------------------------------

/**
 * The tap is an offer to choose who may see a memory, so it belongs to the person whose memory
 * it is and to nobody else. Today no card can reach this: `SocialService.adaptEntry` sets
 * `visibility` and no `shareState`, so another person's memory carries none, and the two
 * screens that render those cards pass no `onReshare` either. T042 changes `adaptEntry`, and a
 * `shareState` that arrived on somebody else's memory would otherwise put an audience sheet
 * over it.
 *
 * The *label* is the deliberate asymmetry and stays: "Not shared yet" replaces the audience
 * for any truthy share state, whosever memory it is, because saying less than the truth is
 * safe here and saying more is not (SC-010, *sharing fails closed*).
 */
describe('the audience is never offered over somebody else\'s memory', () => {
  const someoneElses = (overrides = {}) =>
    entryWith({ userId: 'someone-else', authorId: 'someone-else', ...overrides });

  it('offers no tappable line on a memory that is not the reader\'s', async () => {
    const onReshare = jest.fn();
    const tree = await render(someoneElses({ shareState: ShareState.REFUSED }), { onReshare });

    expect(lineControl(tree, REFUSED_LINE)).toBeUndefined();
    expect(shows(tree, REFUSED_LINE)).toBe(false);
    expect(sheets(tree)).toHaveLength(0);
    expect(onReshare).not.toHaveBeenCalled();
  });

  it('still withholds the audience label on that memory, so it never looks shared', async () => {
    const tree = await render(someoneElses({ shareState: ShareState.REFUSED }));

    expect(shows(tree, NOT_SHARED_YET)).toBe(true);
    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(false);
  });

  it('keeps the tappable line on the reader\'s own memory', async () => {
    // The other half of the gate: it must not have taken the re-share away from the one
    // person entitled to it.
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }), {
      onReshare: jest.fn(),
    });

    expect(lineControl(tree, REFUSED_LINE)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 013 T059 — the unfinished-edit line (FR-013, US2-7)
// ---------------------------------------------------------------------------

/**
 * The card's *other* line under the header, and the reason it is pinned in this file: it sits
 * beside the share lines above, in the same slot, and a card that showed one where the other
 * belongs — or both in a way that reads as one sentence — is what this file is for.
 *
 * FR-013 allows exactly one unsaved edit, and this line is how the person finds it again: while
 * an edit of a memory is unsaved, *that* memory's card says "Unfinished edit — continue", and
 * tapping it reopens the edit. Without the line the edit is invisible until something else
 * happens to open it, which for somebody who put four photographs into an edit and had the app
 * closed on them reads as the edit being lost (US2-7).
 *
 * **Whether a memory has an unsaved edit is not the card's to know.** The `edit` slot names the
 * one memory it belongs to (`CaptureDraftStore.getEditFor`), and the screen that renders the
 * list reads it once and tells each card; a card reading the store itself would mean one
 * database read per memory in the day. So the card is told, and it reports a tap upward —
 * exactly as it does for the re-share above, which it also does not perform itself. What the
 * screen does with it is `JournalScreen.capture.test.js`.
 */
describe('a memory with an unsaved edit says so, and offers it back (FR-013)', () => {
  /** The words a person reads. Verbatim, from `contracts/ui-contract.md`. */
  const UNFINISHED_LINE = 'Unfinished edit — continue';

  it('says nothing about an edit on a memory that has none unsaved', async () => {
    // Every memory, nearly always: the line exists for the one memory in the `edit` slot, and
    // a card that always said it would send people back into an edit they had already saved.
    const tree = await render(entryWith());

    expect(shows(tree, UNFINISHED_LINE)).toBe(false);
    expect(lineControl(tree, UNFINISHED_LINE)).toBeUndefined();
  });

  it('shows "Unfinished edit — continue" on the memory whose edit is unsaved', async () => {
    const tree = await render(entryWith(), { hasUnfinishedEdit: true });

    expect(shows(tree, UNFINISHED_LINE)).toBe(true);
  });

  it('reports a tap on the line upward as onContinueEdit(entry), once', async () => {
    // The card reopens nothing itself -- it has no navigator and no store. The whole memory is
    // handed up, not its id, so the screen has the pieces it needs to name the memory in a
    // confirmation without looking it up again.
    const onContinueEdit = jest.fn();
    const entry = entryWith();
    const tree = await render(entry, { hasUnfinishedEdit: true, onContinueEdit });

    await tap(lineControl(tree, UNFINISHED_LINE));

    expect(onContinueEdit).toHaveBeenCalledTimes(1);
    expect(onContinueEdit).toHaveBeenCalledWith(entry);
  });

  it('offers nothing to tap while there is no unsaved edit to continue', async () => {
    // The pair of the case above: wiring the callback is not what puts the line on a card, so
    // a screen that passes `onContinueEdit` to every card does not thereby claim every memory
    // has an unfinished edit.
    const onContinueEdit = jest.fn();
    const tree = await render(entryWith(), { onContinueEdit });

    expect(shows(tree, UNFINISHED_LINE)).toBe(false);
    expect(onContinueEdit).not.toHaveBeenCalled();
  });

  it('survives a tap with no onContinueEdit wired, rather than throwing in the list', async () => {
    // `PersonJournalScreen` and `FamilySummaryScreen` render this card and know nothing about
    // drafts. They pass neither prop, so they never show the line -- but a card that threw on
    // a tap would take the whole list down with it.
    const tree = await render(entryWith(), { hasUnfinishedEdit: true });

    await tap(lineControl(tree, UNFINISHED_LINE));

    expect(shows(tree, UNFINISHED_LINE)).toBe(true);
  });

  it('says both things when a memory is unshared and unfinished at once', async () => {
    // The two lines are independent: the server refused the audience of the memory as saved,
    // and there is an edit of it that has not been saved. Each must be its own control, or
    // tapping one would do the other's thing.
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }), {
      hasUnfinishedEdit: true,
      onContinueEdit: jest.fn(),
      onReshare: jest.fn(),
    });

    expect(shows(tree, REFUSED_LINE)).toBe(true);
    expect(shows(tree, UNFINISHED_LINE)).toBe(true);
    expect(lineControl(tree, UNFINISHED_LINE)).not.toBe(lineControl(tree, REFUSED_LINE));
  });

  it('opens no audience sheet when the unfinished-edit line is tapped', async () => {
    // What going wrong would look like: the person taps "continue" on an edit and is asked who
    // may see the memory. Nothing is shared by continuing an edit (FR-011).
    const onReshare = jest.fn();
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }), {
      hasUnfinishedEdit: true,
      onContinueEdit: jest.fn(),
      onReshare,
    });

    await tap(lineControl(tree, UNFINISHED_LINE));

    expect(sheets(tree)).toHaveLength(0);
    expect(onReshare).not.toHaveBeenCalled();
  });

  it('still says the memory is not shared, so continuing an edit hides nothing', async () => {
    // FR-021: the unfinished-edit line is an *addition*. It does not stand in for the share
    // line, and SC-010's "never looks shared" holds whatever else the card is saying.
    const tree = await render(entryWith({ shareState: ShareState.WAITING }), {
      hasUnfinishedEdit: true,
    });

    expect(shows(tree, NOT_SHARED_YET)).toBe(true);
    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(false);
    expect(shows(tree, UNFINISHED_LINE)).toBe(true);
  });
});
