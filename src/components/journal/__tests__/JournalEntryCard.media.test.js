/**
 * 007 host-level checks on JournalEntryCard's photos:
 *  - viewport gating (FR-027, SC-007): an off-screen row's tile does not watch;
 *  - fail closed (FR-019): only the owner (the server sent a failureReason) sees a reason or
 *    actions; a photo that never uploaded says so and offers nothing;
 *  - the owner's actions sit BESIDE the photo's touchable, never inside it.
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
import { FlatList, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { mediaStatusPoller } from '../../../services/mediaStatusPoller';
import { MediaApi } from '../../../api/MediaApi';
import { TileVisibility } from '../../../hooks/mediaVisibility';
import { ViewportFlatList } from '../../media/ViewportLists';
import { JournalEntryCard } from '../JournalEntryCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id, media) => ({
  id,
  userId: 'u1',
  createdAt: '2026-10-01T10:00:00Z',
  contentBlocks: [{ type: 'photos', media }],
});
const photo = (id, extra = {}) => ({ id, thumbnailUrl: null, url: `https://cdn/${id}/original.heic`, ...extra });
const user = { id: 'u1', name: 'Hamid' };

function render(el) {
  let tree;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}
const card = (e) => <JournalEntryCard entry={e} user={user} currentUserId="u1" showEngagement={false} />;
const texts = (tree) => tree.root.findAllByType(Text).map((t) => t.props.children);
const tryAgain = (tree) =>
  tree.root.findAll((n) => n.type === TouchableOpacity && n.findAllByType(Text).some((t) => t.props.children === 'Try again'))[0];
const fail = (payload) => act(() => mediaStatusPoller.watch.mock.calls.at(-1)[1](payload));

beforeEach(() => {
  mediaStatusPoller.watch.mockClear();
  mediaStatusPoller.unwatch.mockClear();
  MediaApi.retry.mockReset();
});

describe('viewport gating through the list', () => {
  it('an off-screen row does not watch; it watches when it comes into view', () => {
    const rows = [entry('e1', [photo('m1')]), entry('e2', [photo('m2')])];
    const tree = render(
      <ViewportFlatList data={rows} keyExtractor={(e) => e.id} renderItem={({ item }) => card(item)} />,
    );
    expect(mediaStatusPoller.watch.mock.calls.map((c) => c[0]).sort()).toEqual(['m1', 'm2']);

    mediaStatusPoller.watch.mockClear();
    const list = () => tree.root.findByType(FlatList);
    // Only e1 is on screen.
    act(() => list().props.onViewableItemsChanged({ viewableItems: [{ key: 'e1', item: rows[0], index: 0 }], changed: [] }));
    expect(mediaStatusPoller.unwatch.mock.calls.map((c) => c[0])).toEqual(['m2']);
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();

    // Scrolled: e2 in view.
    act(() => list().props.onViewableItemsChanged({ viewableItems: [{ key: 'e2', item: rows[1], index: 1 }], changed: [] }));
    expect(mediaStatusPoller.watch.mock.calls.map((c) => c[0])).toEqual(['m2']);
  });

  it('a card in a hidden TileVisibility never watches', () => {
    render(<TileVisibility visible={false}>{card(entry('e1', [photo('m1')]))}</TileVisibility>);
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });
});

describe('fail closed', () => {
  it('a photo that never uploaded says so: no reason, no actions, no polling', () => {
    const tree = render(card(entry('e1', [photo('m1', { uploadFailed: true })])));
    expect(texts(tree)).toContain("Photo couldn't be uploaded");
    expect(tryAgain(tree)).toBeUndefined();
    expect(texts(tree)).not.toContain('Download original');
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('a server-failed photo with no failureReason (not the owner) is just unavailable', () => {
    const tree = render(card(entry('e1', [photo('m1')])));
    fail({ id: 'm1', status: 'failed', updatedAt: 't' });
    expect(texts(tree)).toContain('Photo unavailable');
    expect(tryAgain(tree)).toBeUndefined();
    expect(texts(tree)).not.toContain('Download original');
    expect(texts(tree)).not.toContain('file damaged');
  });
});

describe('the owner: actions beside the touchable, not inside it', () => {
  it('shows the reason in the tile and Try again outside the photo touchable', async () => {
    MediaApi.retry.mockResolvedValue({});
    const tree = render(card(entry('e1', [photo('m1')])));
    fail({ id: 'm1', status: 'failed', updatedAt: 't', failureReason: 'corrupt' });
    expect(texts(tree)).toContain('file damaged');
    const btn = tryAgain(tree);
    expect(btn).toBeDefined();
    // No touchable above the button: it is a sibling of the photo's touchable.
    let up = btn.parent;
    while (up) {
      expect(up.type).not.toBe(TouchableOpacity);
      up = up.parent;
    }
    await act(async () => {
      await btn.props.onPress();
    });
    expect(MediaApi.retry).toHaveBeenCalledWith('m1');
  });
});
