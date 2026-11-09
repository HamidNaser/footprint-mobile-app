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
