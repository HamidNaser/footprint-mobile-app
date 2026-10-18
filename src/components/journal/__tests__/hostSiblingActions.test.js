/**
 * 007 T070/T071 -- the owner's Try again in every host that wraps a photo in its own touchable.
 * The actions must render BESIDE that touchable, never inside it (no nested buttons), and
 * must do their job. One test per host family.
 */
jest.setTimeout(30000);
jest.mock('../../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));
jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../../media/AudioPlayer', () => ({ AudioPlayer: () => null }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }));
jest.mock('expo-video', () => ({ VideoView: () => null, useVideoPlayer: () => ({}) }));
jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: 'file:///generated.jpg' })) }));
jest.mock('../EngagementSection', () => ({ EngagementSection: () => null }));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { mediaStatusPoller } from '../../../services/mediaStatusPoller';
import { MediaApi } from '../../../api/MediaApi';
import { MediaGalleryTab } from '../MediaGalleryTab';
import { MediaExplorerSheet } from '../MediaExplorerSheet';
import { JournalEntryDetail } from '../../../screens/JournalEntryDetail';
import { JournalEntryDetail as JournalEntryDetailWeb } from '../../../screens/JournalEntryDetail.web';
import { EntryGalleryModal } from '../EntryGalleryModal';
import { EntryGalleryModal as EntryGalleryModalWeb } from '../EntryGalleryModal.web';
import { JournalEntryCard } from '../JournalEntryCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const PHOTO = { id: 'm1', localId: 'l1', thumbnailUrl: null, url: 'https://cdn/m1/original.heic' };
const FAILED_OWNER = { id: 'm1', status: 'failed', updatedAt: 't', failureReason: 'timed_out' };

const tryAgain = (tree) =>
  tree.root.findAll((n) => n.type === TouchableOpacity && n.findAllByType(Text).some((t) => t.props.children === 'Try again'))[0];
const watchedFor = (id) => mediaStatusPoller.watch.mock.calls.filter((c) => c[0] === id).at(-1)[1];

async function expectSiblingRetry(tree) {
  act(() => watchedFor('m1')(FAILED_OWNER));
  const btn = tryAgain(tree);
  expect(btn).toBeDefined();
  for (let up = btn.parent; up; up = up.parent) expect(up.type).not.toBe(TouchableOpacity);
  MediaApi.retry.mockResolvedValue({});
  await act(async () => {
    await btn.props.onPress();
  });
  expect(MediaApi.retry).toHaveBeenCalledWith('m1');
}

beforeEach(() => {
  mediaStatusPoller.watch.mockClear();
  MediaApi.retry.mockReset();
});

const mount = (el) => {
  let tree;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
};

it('MediaGalleryTab grid', async () => {
  const entries = [{ localId: 'e1', createdAt: 1, date: 'd', contentBlocks: [{ type: 'photos', media: [PHOTO] }] }];
  await expectSiblingRetry(mount(<MediaGalleryTab entries={entries} />));
});

it('MediaExplorerSheet row', async () => {
  await expectSiblingRetry(mount(<MediaExplorerSheet visible onClose={() => {}} photos={[PHOTO]} videos={[]} />));
});

describe.each([
  ['JournalEntryDetail', JournalEntryDetail],
  ['JournalEntryDetail.web', JournalEntryDetailWeb],
])('%s photo grid', (_name, Detail) => {
  it('puts Try again beside the photo touchable', async () => {
    const entry = { localId: 'e1', date: '2026-10-01', contentBlocks: [{ type: 'photos', media: [PHOTO] }] };
    await expectSiblingRetry(mount(<Detail entry={entry} user={{ id: 'u1', name: 'H' }} />));
  });
});

// Final review I1: every host of VideoThumbnail drives the poster by media id, and a failed
// video's Try again sits beside the host's touchable, never inside it. No Download original.
describe('video tiles (final review I1)', () => {
  const VIDEO = { id: 'm1', localId: 'lv1', duration: 3000, thumbnailUrl: null, url: 'https://cdn/m1/original.mp4' };
  const videoEntry = { localId: 'e1', id: 'e1', userId: 'u1', createdAt: 1, date: '2026-10-01', contentBlocks: [{ type: 'video', media: [VIDEO] }] };
  const noDownload = (tree) =>
    expect(tree.root.findAllByType(Text).some((t) => t.props.children === 'Download original')).toBe(false);

  it('MediaGalleryTab video grid item', async () => {
    const tree = mount(<MediaGalleryTab entries={[videoEntry]} />);
    await expectSiblingRetry(tree);
    noDownload(tree);
  });

  it.each([
    ['JournalEntryDetail', JournalEntryDetail],
    ['JournalEntryDetail.web', JournalEntryDetailWeb],
  ])('%s video grid', async (_name, Detail) => {
    const tree = mount(<Detail entry={videoEntry} user={{ id: 'u1', name: 'H' }} />);
    await expectSiblingRetry(tree);
    noDownload(tree);
  });

  it.each([
    ['EntryGalleryModal', EntryGalleryModal],
    ['EntryGalleryModal.web', EntryGalleryModalWeb],
  ])('%s video row', async (_name, Gallery) => {
    const tree = mount(<Gallery visible entry={videoEntry} onClose={() => {}} />);
    await expectSiblingRetry(tree);
    noDownload(tree);
  });

  it('JournalEntryCard video block', async () => {
    const tree = mount(<JournalEntryCard entry={videoEntry} user={{ id: 'u1', name: 'H' }} currentUserId="u1" showEngagement={false} />);
    await expectSiblingRetry(tree);
    noDownload(tree);
  });
});
