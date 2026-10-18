/**
 * 007 final review I1 (FR-021, FR-022) -- a video tile watches its poster frame the way a photo
 * tile watches its grid copy: "Preparing photo…" until the poster is ready, then the poster with
 * a play overlay, with no remount; a failed video shows the owner's failed tile with Try again
 * (beside the touchable, never inside it) and everyone else "Photo unavailable". Download
 * original is NOT offered on a video (pending owner decision I3). The original is never an image.
 */
import React from 'react';
import { Image, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: 'file:///generated.jpg' })) }));
jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));

import { mediaStatusPoller } from '../../../services/mediaStatusPoller';
import { MediaApi } from '../../../api/MediaApi';
import { TileVisibility } from '../../../hooks/mediaVisibility';
import { VideoThumbnail as NativeThumb } from '../VideoThumbnail';
import { VideoThumbnail as WebThumb } from '../VideoThumbnail.web';

global.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL = 'https://cdn/v9/original.mp4';
const PENDING_VIDEO = { id: 'v9', url: ORIGINAL, serverUrl: ORIGINAL, thumbnailUrl: null };

const mount = (el) => {
  let tree;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
};
const texts = (tree) => tree.root.findAllByType(Text).map((t) => t.props.children);
const uris = (tree) => tree.root.findAllByType(Image).map((i) => i.props.source?.uri);
const playIcon = (tree) => tree.root.findAll((n) => n.props.name === 'play');
const button = (tree, label) =>
  tree.root.findAllByType(TouchableOpacity).find((b) => b.findAllByType(Text).some((t) => t.props.children === label));
const answer = (id, update) =>
  act(() => mediaStatusPoller.watch.mock.calls.filter((c) => c[0] === id).at(-1)[1]({ id, ...update }));

beforeEach(() => {
  mediaStatusPoller.watch.mockClear();
  mediaStatusPoller.unwatch.mockClear();
  MediaApi.retry.mockReset();
});

describe.each([
  ['native', NativeThumb],
  ['web', WebThumb],
])('VideoThumbnail (%s): the poster lifecycle', (_name, Thumb) => {
  const render = (props) => mount(<Thumb width={120} height={90} onPress={jest.fn()} {...props} />);

  it('pending -> ready: "Preparing photo…", then the poster with a play overlay, without a remount', () => {
    const onPress = jest.fn();
    const tree = render({ media: PENDING_VIDEO, onPress });
    expect(texts(tree)).toContain('Preparing photo…');
    expect(uris(tree)).toEqual([]);
    expect(mediaStatusPoller.watch).toHaveBeenCalledWith('v9', expect.any(Function));

    answer('v9', { status: 'ready', gridUrl: 'https://cdn/v9/grid.webp', updatedAt: 't1' });

    expect(uris(tree)).toEqual(['https://cdn/v9/grid.webp?v=t1']);
    expect(texts(tree)).not.toContain('Preparing photo…');
    expect(playIcon(tree).length).toBeGreaterThan(0);
    act(() => tree.root.findByProps({ testID: 'video-play-overlay' }).props.onPress());
    expect(onPress.mock.calls[0][0].videoUri).toBe(ORIGINAL);
  });

  it('a stored thumbnail that is really the original video is never an image source', () => {
    const tree = render({ media: { ...PENDING_VIDEO, thumbnailUrl: ORIGINAL, thumbnailUri: ORIGINAL } });
    expect(uris(tree)).not.toContain(ORIGINAL);
    expect(texts(tree)).toContain('Preparing photo…');
    expect(mediaStatusPoller.watch).toHaveBeenCalledWith('v9', expect.any(Function));
  });

  it('the owner (a failureReason was sent): failed tile, Try again beside the touchable, no Download original', async () => {
    const tree = render({ media: PENDING_VIDEO });
    answer('v9', { status: 'failed', updatedAt: 't', failureReason: 'corrupt' });
    expect(texts(tree)).toContain("This video couldn't be prepared");
    expect(texts(tree)).toContain('file damaged');
    const btn = button(tree, 'Try again');
    expect(btn).toBeDefined();
    for (let up = btn.parent; up; up = up.parent) expect(up.type).not.toBe(TouchableOpacity);
    expect(button(tree, 'Download original')).toBeUndefined();
    MediaApi.retry.mockResolvedValue({});
    await act(async () => {
      await btn.props.onPress();
    });
    expect(MediaApi.retry).toHaveBeenCalledWith('v9');
    expect(texts(tree)).toContain('Preparing photo…');
  });

  it('anyone else (failed, no reason): "Photo unavailable", no actions -- fails closed', () => {
    const tree = render({ media: PENDING_VIDEO });
    answer('v9', { status: 'failed', updatedAt: 't' });
    expect(texts(tree)).toContain('Photo unavailable');
    expect(texts(tree)).not.toContain("This video couldn't be prepared");
    expect(button(tree, 'Try again')).toBeUndefined();
    expect(uris(tree)).toEqual([]);
  });

  it('unavailable: "Photo unavailable"', () => {
    const tree = render({ media: PENDING_VIDEO });
    answer('v9', { status: 'unavailable' });
    expect(texts(tree)).toContain('Photo unavailable');
  });

  it('loadFailed (ready, but the poster never arrives): "Photo unavailable"', () => {
    const tree = render({ media: PENDING_VIDEO });
    for (let i = 0; i < 3; i++) answer('v9', { status: 'ready', gridUrl: null, updatedAt: 't' });
    expect(texts(tree)).toContain('Photo unavailable');
  });

  it('a host that wraps the tile in its own touchable takes the actions (no Download original)', () => {
    const onFailedOwner = jest.fn();
    const tree = render({ media: PENDING_VIDEO, onFailedOwner });
    answer('v9', { status: 'failed', updatedAt: 't', failureReason: 'timed_out' });
    expect(texts(tree)).toContain("This video couldn't be prepared");
    expect(button(tree, 'Try again')).toBeUndefined();
    expect(onFailedOwner.mock.calls.at(-1)[0]).toEqual(
      expect.objectContaining({ tryAgain: expect.any(Function), originalUrl: null }),
    );
  });

  it('legacy item with no id: renders its stored thumbnail and never polls', () => {
    const tree = render({ media: { url: 'https://cdn/old/v.mp4', thumbnailUri: 'https://cdn/old/thumb.jpg' } });
    expect(uris(tree)).toEqual(['https://cdn/old/thumb.jpg']);
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('off screen it does not watch; on screen it does; leaving again unwatches', () => {
    const el = (visible) => (
      <TileVisibility visible={visible}>
        <Thumb width={120} height={90} media={PENDING_VIDEO} />
      </TileVisibility>
    );
    const tree = mount(el(false));
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
    act(() => tree.update(el(true)));
    expect(mediaStatusPoller.watch).toHaveBeenCalledWith('v9', expect.any(Function));
    act(() => tree.update(el(false)));
    expect(mediaStatusPoller.unwatch).toHaveBeenCalledWith('v9', expect.any(Function));
  });
});
