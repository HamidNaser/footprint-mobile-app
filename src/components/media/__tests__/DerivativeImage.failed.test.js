/**
 * 007 T070/T071 -- the failed tile (FR-019, FR-022). The server sends `failureReason` to the
 * owner only (contracts/media-status.md), so its presence is the owner signal; without it a
 * failed photo is just "Photo unavailable", with no actions (fails closed).
 */
import React from 'react';
import { Linking, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));

import { mediaStatusPoller } from '../../../services/mediaStatusPoller';
import { MediaApi } from '../../../api/MediaApi';
import DerivativeImage from '../DerivativeImage';
import { FailedActions } from '../FailedTile';

global.IS_REACT_ACT_ENVIRONMENT = true;

const MEDIA = { id: 'm1', thumbnailUrl: null, url: 'https://cdn/m1/original.heic' };
const failedPayload = (failureReason) => ({ id: 'm1', status: 'failed', updatedAt: 't', ...(failureReason ? { failureReason } : {}) });

function render(props) {
  let tree;
  act(() => {
    tree = renderer.create(<DerivativeImage media={MEDIA} style={{ height: 120 }} {...props} />);
  });
  return tree;
}
const fail = (reason) => act(() => mediaStatusPoller.watch.mock.calls.at(-1)[1](failedPayload(reason)));
const texts = (tree) => tree.root.findAllByType(Text).map((t) => t.props.children);
const button = (tree, label) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .find((b) => b.findAllByType(Text).some((t) => t.props.children === label));

beforeEach(() => {
  mediaStatusPoller.watch.mockClear();
  mediaStatusPoller.unwatch.mockClear();
  MediaApi.retry.mockReset();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('the owner: a failed photo', () => {
  it("says it couldn't be prepared, why, and offers Try again and Download original", () => {
    const tree = render();
    fail('corrupt');
    expect(texts(tree)).toContain("This photo couldn't be prepared");
    expect(texts(tree)).toContain('file damaged');
    expect(button(tree, 'Try again')).toBeTruthy();
    expect(button(tree, 'Download original')).toBeTruthy();
  });

  it.each([
    ['unsupported_format', 'format not supported'],
    ['corrupt', 'file damaged'],
    ['timed_out', 'timed out'],
    ['internal', 'a processing problem'],
    ['something_new', 'a processing problem'],
  ])('puts %s in plain words', (reason, words) => {
    const tree = render();
    fail(reason);
    expect(texts(tree)).toContain(words);
  });

  it('says "video" for a video', () => {
    const tree = render({ media: { ...MEDIA, kind: 'video' } });
    fail('timed_out');
    expect(texts(tree)).toContain("This video couldn't be prepared");
  });

  it('Try again retries, then the tile goes back to Preparing photo', async () => {
    MediaApi.retry.mockResolvedValue({ id: 'm1', status: 'pending' });
    const tree = render();
    fail('corrupt');
    mediaStatusPoller.watch.mockClear();
    await act(async () => {
      await button(tree, 'Try again').props.onPress();
    });
    expect(MediaApi.retry).toHaveBeenCalledWith('m1');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain('Preparing photo…');
    expect(texts(tree)).not.toContain("This photo couldn't be prepared");
  });

  it('a 409 also goes back to pending', async () => {
    MediaApi.retry.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const tree = render();
    fail('internal');
    await act(async () => {
      await button(tree, 'Try again').props.onPress();
    });
    expect(texts(tree)).toContain('Preparing photo…');
  });

  it('any other error keeps the failed tile and says so inline', async () => {
    MediaApi.retry.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const tree = render();
    fail('internal');
    await act(async () => {
      await button(tree, 'Try again').props.onPress();
    });
    expect(texts(tree)).toContain("This photo couldn't be prepared");
    expect(texts(tree)).toContain("Couldn't try again just now. Please try later.");
    expect(button(tree, 'Try again')).toBeTruthy();
  });

  it('a double tap sends one request and disables the button meanwhile', async () => {
    let resolve;
    MediaApi.retry.mockReturnValue(new Promise((r) => (resolve = r)));
    const tree = render();
    fail('corrupt');
    let p;
    act(() => {
      p = button(tree, 'Try again').props.onPress();
      button(tree, 'Try again').props.onPress();
    });
    expect(MediaApi.retry).toHaveBeenCalledTimes(1);
    expect(button(tree, 'Try again').props.disabled).toBe(true);
    await act(async () => {
      resolve({});
      await p;
    });
  });

  it('Download original opens the original', () => {
    const tree = render();
    fail('corrupt');
    act(() => button(tree, 'Download original').props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith('https://cdn/m1/original.heic');
  });

  it('offers no Download original when the original address is unknown', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null } });
    fail('corrupt');
    expect(button(tree, 'Try again')).toBeTruthy();
    expect(button(tree, 'Download original')).toBeUndefined();
  });

  it('a very small tile keeps the words off but the label accessible, with no cramped buttons', () => {
    const tree = render({ style: { width: 40, height: 40 } });
    fail('corrupt');
    expect(texts(tree)).not.toContain("This photo couldn't be prepared");
    expect(button(tree, 'Try again')).toBeUndefined();
    const plate = tree.root.findAll((n) => n.props.testID === 'media-failed' && typeof n.type === 'string');
    expect(plate[0].props.accessibilityLabel).toBe("This photo couldn't be prepared");
  });
});

describe('everyone else: unavailable, no actions', () => {
  it('a failed photo with no failureReason is not the owner: "Photo unavailable"', () => {
    const tree = render();
    fail(undefined);
    expect(texts(tree)).toContain('Photo unavailable');
    expect(button(tree, 'Try again')).toBeUndefined();
    expect(button(tree, 'Download original')).toBeUndefined();
  });

  it('unavailable gets no actions', () => {
    const tree = render();
    act(() => mediaStatusPoller.watch.mock.calls.at(-1)[1]({ id: 'm1', status: 'unavailable' }));
    expect(texts(tree)).toContain('Photo unavailable');
    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
  });
});

describe('inside a tappable host: actions as a sibling', () => {
  it('with onFailedOwner the tile shows words only and hands the actions to the host', () => {
    const onFailedOwner = jest.fn();
    const tree = render({ onFailedOwner });
    expect(onFailedOwner).toHaveBeenLastCalledWith(null);
    fail('timed_out');
    expect(texts(tree)).toContain("This photo couldn't be prepared");
    expect(button(tree, 'Try again')).toBeUndefined();
    const actions = onFailedOwner.mock.calls.at(-1)[0];
    expect(actions).toEqual(
      expect.objectContaining({ tryAgain: expect.any(Function), retrying: false, retryError: false, originalUrl: MEDIA.url }),
    );
  });

  it('FailedActions renders Try again and Download original, and nothing for null', () => {
    let tree;
    const tryAgain = jest.fn();
    act(() => {
      tree = renderer.create(
        <FailedActions actions={{ tryAgain, retrying: false, retryError: true, originalUrl: 'https://cdn/o.heic' }} />,
      );
    });
    act(() => button(tree, 'Try again').props.onPress());
    expect(tryAgain).toHaveBeenCalledTimes(1);
    act(() => button(tree, 'Download original').props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith('https://cdn/o.heic');
    expect(texts(tree)).toContain("Couldn't try again just now. Please try later.");
    act(() => tree.update(<FailedActions actions={null} />));
    expect(tree.toJSON()).toBeNull();
  });

  it('tells the host to drop the actions when the tile leaves the failed state, and on unmount', async () => {
    MediaApi.retry.mockResolvedValue({});
    const onFailedOwner = jest.fn();
    const tree = render({ onFailedOwner });
    fail('corrupt');
    await act(async () => {
      await onFailedOwner.mock.calls.at(-1)[0].tryAgain();
    });
    expect(onFailedOwner).toHaveBeenLastCalledWith(null);
    act(() => tree.unmount());
    expect(onFailedOwner).toHaveBeenLastCalledWith(null);
  });
});
