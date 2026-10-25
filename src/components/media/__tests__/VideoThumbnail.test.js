/**
 * 007 T078 -- FR-024, M12: a video tile shows its poster frame (the server's thumbnail copy)
 * with a play overlay; tapping plays the ORIGINAL. The original is never put in an <Image>.
 */
import React from 'react';
import { Image } from 'react-native';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: 'file:///generated.jpg' })) }));

import * as VideoThumbnails from 'expo-video-thumbnails';
import { VideoThumbnail as NativeThumb } from '../VideoThumbnail';
import { VideoThumbnail as WebThumb } from '../VideoThumbnail.web';

global.IS_REACT_ACT_ENVIRONMENT = true;

const VIDEO = {
  id: 'v1',
  kind: 'video',
  thumbnailUrl: 'https://cdn/v1/grid.webp',
  url: 'https://cdn/v1/original.mp4',
};

const render = (Comp, props) => {
  let tree;
  act(() => {
    tree = renderer.create(<Comp width={120} height={90} {...props} />);
  });
  return tree;
};
const images = (tree) => tree.root.findAllByType(Image);
const overlay = (tree) => tree.root.findAll((n) => n.props.testID === 'video-play-overlay' && typeof n.props.onPress === 'function');
const everyUri = (tree) => images(tree).map((i) => i.props.source?.uri);

describe.each([
  ['native', NativeThumb],
  ['web', WebThumb],
])('VideoThumbnail (%s)', (_name, Thumb) => {
  beforeEach(() => VideoThumbnails.getThumbnailAsync.mockClear());

  it('shows the poster frame (thumbnailSource) with a play overlay', () => {
    const tree = render(Thumb, { media: VIDEO, onPress: jest.fn() });
    expect(everyUri(tree)).toEqual([VIDEO.thumbnailUrl]);
    expect(overlay(tree).length).toBeGreaterThan(0);
    expect(overlay(tree)[0].props.accessibilityLabel).toBe('Play video');
  });

  it('never puts the original in an Image', () => {
    const tree = render(Thumb, { media: VIDEO, onPress: jest.fn() });
    expect(everyUri(tree)).not.toContain(VIDEO.url);
  });

  it('tapping plays the original (videoSource), not the poster', () => {
    const onPress = jest.fn();
    const tree = render(Thumb, { media: VIDEO, onPress });
    act(() => overlay(tree)[0].props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls[0][0]).toEqual(
      expect.objectContaining({ videoUri: VIDEO.url, thumbnailUri: VIDEO.thumbnailUrl, media: VIDEO }),
    );
  });

  it('prefers the device copy for playback, as videoSource does', () => {
    const onPress = jest.fn();
    const tree = render(Thumb, { media: { ...VIDEO, localPath: 'file:///v1.mov' }, onPress });
    act(() => overlay(tree)[0].props.onPress());
    expect(onPress.mock.calls[0][0].videoUri).toBe('file:///v1.mov');
  });

  it('does not generate a poster when the server already has one', () => {
    render(Thumb, { media: VIDEO, onPress: jest.fn() });
    expect(VideoThumbnails.getThumbnailAsync).not.toHaveBeenCalled();
  });

  it('still takes the older videoUri / thumbnailUri props', () => {
    const onPress = jest.fn();
    const tree = render(Thumb, { videoUri: 'file:///x.mov', thumbnailUri: 'file:///x.jpg', onPress });
    expect(everyUri(tree)).toEqual(['file:///x.jpg']);
    act(() => overlay(tree)[0].props.onPress());
    expect(onPress.mock.calls[0][0]).toEqual(expect.objectContaining({ videoUri: 'file:///x.mov' }));
  });
});

describe('VideoThumbnail (native): no poster yet', () => {
  it('never shows the original as an image; it makes a frame from the file on the device', async () => {
    const tree = render(NativeThumb, { media: { id: 'v2', kind: 'video', localPath: 'file:///v2.mov' }, onPress: jest.fn() });
    await act(async () => {});
    expect(VideoThumbnails.getThumbnailAsync).toHaveBeenCalledWith('file:///v2.mov', expect.anything());
    expect(everyUri(tree)).not.toContain('file:///v2.mov');
  });
});

describe('VideoThumbnail (web): no poster', () => {
  it('is a plate with a play overlay, not an <Image> of the video', () => {
    const tree = render(WebThumb, { media: { id: 'v3', kind: 'video', url: 'https://cdn/v3/original.mp4' }, onPress: jest.fn() });
    expect(images(tree)).toHaveLength(0);
    expect(overlay(tree).length).toBeGreaterThan(0);
  });
});
