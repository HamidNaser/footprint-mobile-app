/**
 * 007 final review I3 / MEDIA-Q3 option A (FR-022) -- Download original on list-shape surfaces.
 *
 * A media item (contracts/media-item.md) carries `originalUrl` ONLY when the caller owns the
 * media; it is omitted otherwise. List surfaces (places `image`/`photos`, lifeline `photos`/
 * `previewMedia`, the holding area) have no other original address, so the owner's failed tile
 * offers Download original from `originalUrl`. The server's `originalUrl` is preferred over any
 * locally derived one. Never for anyone else, never without an address, never for a file that
 * is still only on the device.
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
import DerivativeImage from '../DerivativeImage';
import { FailedSlot, originalUrlOf } from '../FailedTile';

global.IS_REACT_ACT_ENVIRONMENT = true;

const SERVER_ORIGINAL = 'https://cdn/m7/original.heic';
// A list-shape item for its owner: copies not ready yet, no `url`, the owner-only `originalUrl`.
const OWNED = { id: 'm7', kind: 'photo', thumbnailUrl: null, displayUrl: null, unresolved: false, originalUrl: SERVER_ORIGINAL };

const mount = (el) => {
  let tree;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
};
const fail = (reason) =>
  act(() =>
    mediaStatusPoller.watch.mock.calls.at(-1)[1]({ id: 'm7', status: 'failed', updatedAt: 't', ...(reason ? { failureReason: reason } : {}) }),
  );
const texts = (tree) => tree.root.findAllByType(Text).map((t) => t.props.children);
const button = (tree, label) =>
  tree.root.findAllByType(TouchableOpacity).find((b) => b.findAllByType(Text).some((t) => t.props.children === label));

beforeEach(() => {
  mediaStatusPoller.watch.mockClear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('a list-shape item for its owner', () => {
  it('offers Download original from originalUrl, and opens it', () => {
    const tree = mount(<DerivativeImage media={OWNED} style={{ height: 120 }} />);
    fail('corrupt');
    expect(button(tree, 'Try again')).toBeTruthy();
    const download = button(tree, 'Download original');
    expect(download).toBeTruthy();
    act(() => download.props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(SERVER_ORIGINAL);
  });

  it("prefers the server's originalUrl over a locally derived original", () => {
    const tree = mount(
      <DerivativeImage media={{ ...OWNED, url: 'https://cdn/stale.jpg', serverUrl: 'https://cdn/stale.jpg' }} style={{ height: 120 }} />,
    );
    fail('corrupt');
    act(() => button(tree, 'Download original').props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(SERVER_ORIGINAL);
  });

  it('inside a tappable host (FailedSlot): Download original is a sibling, never nested in the touchable', () => {
    const tree = mount(
      <FailedSlot style={{ width: 120 }}>
        {(onFailedOwner) => (
          <TouchableOpacity testID="host" onPress={() => {}}>
            <DerivativeImage media={OWNED} style={{ height: 120 }} onFailedOwner={onFailedOwner} />
          </TouchableOpacity>
        )}
      </FailedSlot>,
    );
    fail('timed_out');
    const download = button(tree, 'Download original');
    expect(download).toBeTruthy();
    for (let up = download.parent; up; up = up.parent) expect(up.props.testID).not.toBe('host');
    act(() => download.props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(SERVER_ORIGINAL);
  });
});

describe('fails closed', () => {
  it('anyone else (no failureReason): "Photo unavailable", no actions, even if an address leaked', () => {
    const tree = mount(<DerivativeImage media={OWNED} style={{ height: 120 }} />);
    fail(undefined);
    expect(texts(tree)).toContain('Photo unavailable');
    expect(button(tree, 'Download original')).toBeUndefined();
    expect(button(tree, 'Try again')).toBeUndefined();
  });

  it('the owner without any original address gets Try again only', () => {
    const { originalUrl, ...noUrl } = OWNED;
    const tree = mount(<DerivativeImage media={noUrl} style={{ height: 120 }} />);
    fail('corrupt');
    expect(button(tree, 'Try again')).toBeTruthy();
    expect(button(tree, 'Download original')).toBeUndefined();
  });

  it('a photo that never left the device offers no Download original', () => {
    const tree = mount(<DerivativeImage media={{ ...OWNED, localPath: 'file:///a.jpg', uploadFailed: true }} style={{ height: 120 }} />);
    expect(texts(tree)).toContain("Photo couldn't be uploaded");
    expect(button(tree, 'Download original')).toBeUndefined();
  });

  it.each([
    ['file:///var/mobile/a.jpg'],
    ['ph://ABC-123'],
    ['content://media/external/images/1'],
    ['assets-library://asset/asset.JPG?id=1'],
  ])('originalUrlOf never offers a device address (%s)', (local) => {
    expect(originalUrlOf({ id: 'm7', localPath: local, url: local, serverUrl: local })).toBeNull();
    expect(originalUrlOf({ id: 'm7', originalUrl: local })).toBeNull();
  });

  it('originalUrlOf: originalUrl first, then the stored server original', () => {
    expect(originalUrlOf({ originalUrl: SERVER_ORIGINAL, serverUrl: 'https://cdn/s', url: 'https://cdn/u' })).toBe(SERVER_ORIGINAL);
    expect(originalUrlOf({ serverUrl: 'https://cdn/s', url: 'https://cdn/u' })).toBe('https://cdn/s');
    expect(originalUrlOf({ url: 'https://cdn/u' })).toBe('https://cdn/u');
    expect(originalUrlOf({ id: 'm7' })).toBeNull();
    expect(originalUrlOf(null)).toBeNull();
  });
});
