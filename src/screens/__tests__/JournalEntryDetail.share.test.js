/**
 * 013 T036 (round-1 finding 3) — a memory the server refused to share must not read as shared
 * on the screen a tap on its card opens.
 *
 * SC-010 is worded about **memories**, not about cards: *0 memories become visible to anyone,
 * or appear as shared, when the server refuses their audience; every such memory shows
 * "Waiting to share…" or "Not shared" on its card and "Not shared yet" in place of its
 * audience label.* `JournalEntryCard` honours that; this screen did not. It renders the
 * audience from `entry.visibility` with no `shareState` awareness, and it is what opens when
 * the person taps the very card that has just told them the memory is not shared — so a card
 * reading "Not shared yet" opened a screen reading "Family" over a memory on nobody's screen.
 *
 * The words are the card's own, from `src/components/journal/shareLabels.js`, so there is one
 * copy of them and the two surfaces cannot drift apart. They are asserted verbatim here for
 * the same reason the card's tests do: they are the product's promise (FR-011).
 *
 * The *tap* stays on the card. FR-011 gives the audience choice to the card's refused line,
 * and this screen is handed no `onReshare` by anything; the detail view's own entry points are
 * T060's. What is fixed here is the lie, not a second way to re-share.
 */

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props) => React.createElement(View, props, props.children),
    useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() })),
  };
});

/**
 * `expo-audio` is stubbed once in `jest.setup.js` (it cannot be imported under jest at all --
 * it touches `AudioModule.AudioPlayer.prototype` at module scope). The per-file mock that used
 * to sit here shadowed it and carried no `useAudioPlayer`/`useAudioPlayerStatus`, so the first
 * fixture with a voice clip in it would have failed with "useAudioPlayer is not a function" and
 * read like a `VoicePlayer` bug (013 T054, fix round 1).
 */

jest.mock('../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});

jest.mock('../../components/media/AudioPlayer', () => ({ AudioPlayer: () => null }));

import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { JournalEntryDetail } from '../JournalEntryDetail';
// By explicit path: metro picks this one for the web build, jest would never resolve it, and a
// twin left behind is the same lie on another platform. Both are run through everything below.
import { JournalEntryDetail as JournalEntryDetailWeb } from '../JournalEntryDetail.web';
import { ShareState } from '../../database/schema';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** The words a person reads. Verbatim: these are the product's promise (FR-011, SC-010). */
const NOT_SHARED_YET = 'Not shared yet';

/** What this screen otherwise renders for each audience — `visibility`, capitalised. */
const AUDIENCE_LABELS = {
  private: 'Private',
  family: 'Family',
  friends: 'Friends',
  family_friends: 'Family_friends',
};

const entryWith = (overrides = {}) => ({
  localId: 'local-1',
  id: 'local-1',
  userId: 'u1',
  visibility: 'family',
  syncStatus: 'pending',
  createdAt: Date.now(),
  date: '2026-11-08',
  contentBlocks: [{ type: 'text', content: 'walked to the station' }],
  ...overrides,
});

const trees = [];

/** Set per variant by the `describe.each` below, so every case runs against both screens. */
let Screen = JournalEntryDetail;

const render = async (entry) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <Screen entry={entry} user={{ id: 'u1', name: 'Sam' }} onBack={() => {}} />,
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
});

/** Every string the screen renders, flattened — children may be an array of fragments. */
const texts = (node) =>
  node
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : t.props.children))
    .filter((value) => typeof value === 'string');

const shows = (tree, line) => texts(tree.root).includes(line);

describe.each([
  ['JournalEntryDetail', JournalEntryDetail],
  ['JournalEntryDetail.web', JournalEntryDetailWeb],
])('a refused memory never reads as shared on %s (SC-010)', (_name, Component) => {
  beforeEach(() => {
    Screen = Component;
  });

  it('shows "Not shared yet" in place of the audience when the refusal is final', async () => {
    const tree = await render(entryWith({ shareState: ShareState.REFUSED }));

    expect(shows(tree, NOT_SHARED_YET)).toBe(true);
    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(false);
  });

  it('shows it while the share is still waiting, too', async () => {
    const tree = await render(entryWith({ shareState: ShareState.WAITING }));

    expect(shows(tree, NOT_SHARED_YET)).toBe(true);
    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(false);
  });

  it('never shows the audience the person asked for, whichever one it was', async () => {
    // Checked for its **absence**, for all four audiences: a screen showing both the chosen
    // audience and "Not shared yet" would still be a lie, and this is the half that can go
    // wrong silently (*sharing fails closed*).
    for (const [visibility, label] of Object.entries(AUDIENCE_LABELS)) {
      const tree = await render(entryWith({ visibility, shareState: ShareState.REFUSED }));

      expect({ visibility, shows: shows(tree, label) }).toEqual({ visibility, shows: false });
      expect({ visibility, shows: shows(tree, NOT_SHARED_YET) }).toEqual({
        visibility,
        shows: true,
      });
    }
  });

  it('withholds the audience even for a share state the server cannot produce', async () => {
    // Saying less than the truth is safe here; saying more is not. An unexplained value yields
    // no audience label, exactly as on the card.
    const tree = await render(entryWith({ shareState: 'something-new' }));

    expect(shows(tree, AUDIENCE_LABELS.family)).toBe(false);
    expect(shows(tree, NOT_SHARED_YET)).toBe(true);
  });

  it('shows the audience as before when the server has said nothing about it', async () => {
    // The ordinary case, which is every memory until the server refuses one.
    for (const shareState of [null, undefined]) {
      const entry = entryWith({ shareState });
      if (shareState === undefined) delete entry.shareState;

      const tree = await render(entry);

      expect({ shareState, shows: shows(tree, AUDIENCE_LABELS.family) }).toEqual({
        shareState,
        shows: true,
      });
      expect({ shareState, shows: shows(tree, NOT_SHARED_YET) }).toEqual({
        shareState,
        shows: false,
      });
    }
  });
});
