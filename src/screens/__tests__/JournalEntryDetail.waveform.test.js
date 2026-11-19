/**
 * A voice clip's waveform reaches the player on the detail view -- both platforms (review fix,
 * Minor 10).
 *
 * `journalBlocks.js` writes `waveform` onto the **audio block**, never onto the media item: a
 * clip's levels and length belong to the block, and only a video's duration sits on its item.
 * This screen flattens `block.media` and then read `audio.waveform` off the item, which is
 * always undefined -- so `AudioPlayer` was handed nothing and every clip in the detail view drew
 * the flat placeholder bar instead of its own levels. T053/T054 gave `AudioPlayer` a
 * `waveformData` prop precisely so it would not have to.
 *
 * Both variants are run, by explicit path: metro picks `.web.js` for the web build, jest would
 * never resolve it on its own, and a twin left behind is the same defect on another platform
 * (the same reason `JournalEntryDetail.share.test.js` renders both).
 */

jest.mock('expo-video', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props) => ReactLib.createElement(View, props, props.children),
    useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() })),
  };
});

jest.mock('../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});

/** A probe in the player's place: it records the `waveformData` the screen handed it. */
jest.mock('../../components/media/AudioPlayer', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Player = ({ uri, waveformData }) =>
    ReactLib.createElement(View, {
      testID: 'audio-player-probe',
      'data-uri': uri,
      'data-waveform': waveformData,
    });
  return { __esModule: true, AudioPlayer: Player, default: Player };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { JournalEntryDetail } from '../JournalEntryDetail';
import { JournalEntryDetail as JournalEntryDetailWeb } from '../JournalEntryDetail.web';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** Real-looking levels: a flat array of numbers, as `VoiceRecorderBar` records them. */
const LEVELS = [0.1, 0.42, 0.9, 0.35, 0.12];
const OTHER_LEVELS = [0.8, 0.2];

const entryWith = (contentBlocks) => ({
  localId: 'local-1',
  id: 'local-1',
  userId: 'u1',
  visibility: 'private',
  syncStatus: 'synced',
  createdAt: Date.now(),
  date: '2026-11-10',
  contentBlocks,
});

const audioBlock = (overrides = {}) => ({
  type: 'audio',
  duration: 12,
  waveform: LEVELS,
  media: [{ localId: 'm-clip', localPath: 'file:///clip.m4a' }],
  ...overrides,
});

const trees = [];

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

/**
 * Every player's `waveformData`, in render order.
 *
 * `typeof node.type === 'string'`: the probe's own element and the host `View` it returns carry
 * the same props, so an unfiltered `findAll` reports each player twice.
 */
const waveformsIn = (tree) =>
  tree.root
    .findAll((node) => node.props?.testID === 'audio-player-probe' && typeof node.type === 'string')
    .map((node) => node.props['data-waveform']);

afterEach(() => {
  while (trees.length) {
    const tree = trees.pop();
    act(() => tree.unmount());
  }
});

describe.each([
  ['native', JournalEntryDetail],
  ['web', JournalEntryDetailWeb],
])('JournalEntryDetail (%s): a clip plays with its own waveform', (_name, Variant) => {
  beforeEach(() => {
    Screen = Variant;
  });

  it("hands the player the block's waveform, which is where it is stored", async () => {
    const tree = await render(entryWith([audioBlock()]));

    expect(waveformsIn(tree)).toEqual([LEVELS]);
  });

  it('gives each clip its own levels, not the first one twice', async () => {
    // Discriminating: a fix that reached for `contentBlocks[0].waveform` would pass the case
    // above and fail here.
    const tree = await render(
      entryWith([
        audioBlock(),
        audioBlock({
          waveform: OTHER_LEVELS,
          media: [{ localId: 'm-clip-2', localPath: 'file:///clip-2.m4a' }],
        }),
      ]),
    );

    expect(waveformsIn(tree)).toEqual([LEVELS, OTHER_LEVELS]);
  });

  it('hands nothing rather than something invented when the block has no waveform', async () => {
    // A clip recorded before this feature, or one whose levels the Hub dropped on the way in.
    // `AudioPlayer` draws its placeholder bar for an absent value, which is the honest answer.
    const tree = await render(entryWith([audioBlock({ waveform: undefined })]));

    expect(waveformsIn(tree)).toEqual([undefined]);
  });

  it("prefers the item's own waveform where a shape ever carries one there", async () => {
    const tree = await render(
      entryWith([
        audioBlock({
          media: [{ localId: 'm-clip', localPath: 'file:///clip.m4a', waveform: OTHER_LEVELS }],
        }),
      ]),
    );

    expect(waveformsIn(tree)).toEqual([OTHER_LEVELS]);
  });

  it('renders no player at all for a memory with no clip', async () => {
    const tree = await render(entryWith([{ type: 'text', content: 'walked to the station' }]));

    expect(waveformsIn(tree)).toEqual([]);
  });

  it('does not fall over on an audio block whose media list is missing', async () => {
    // The old `.flatMap(b => b.media)` put `undefined` in the list for this shape; the map
    // replacing it must not throw on it either.
    const tree = await render(entryWith([audioBlock({ media: undefined })]));

    expect(waveformsIn(tree)).toEqual([]);
  });
});
