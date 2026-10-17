/**
 * 007 T060 fix round 2 -- a native map marker snapshots its view, so it must track view
 * changes while its photo is pending or loading, and stop once settled (or after a cap).
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';

jest.mock('react-native-maps', () => ({ Marker: 'Marker', Callout: 'Callout' }));
jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});

import { mediaStatusPoller } from '../../../services/mediaStatusPoller';
import { EntryMarker, TRACKING_CAP_MS } from '../EntryMarker';

global.IS_REACT_ACT_ENVIRONMENT = true;

const entryWith = (media) => ({
  id: 'e1',
  createdAt: '2026-01-01T00:00:00Z',
  location: { lat: 1, lng: 2, name: 'X' },
  contentBlocks: media ? [{ type: 'photos', media: [media] }] : [{ type: 'text', content: 'hi' }],
});
const READY = { id: 'm1', status: 'ready', updatedAt: 'T', gridUrl: 'https://cdn/g.webp', displayUrl: 'https://cdn/d.webp' };

const render = (entry) => {
  let tree;
  act(() => {
    tree = renderer.create(<EntryMarker entry={entry} showCallout={false} />);
  });
  return tree;
};
const tracks = (tree) => tree.root.findByType('Marker').props.tracksViewChanges;

beforeEach(() => {
  jest.useFakeTimers();
  mediaStatusPoller.watch.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('EntryMarker tracksViewChanges', () => {
  it('an icon-only marker starts false', () => {
    expect(tracks(render(entryWith(null)))).toBe(false);
  });

  it('a marker whose photo is pending tracks', () => {
    expect(tracks(render(entryWith({ id: 'm1', thumbnailUrl: null })))).toBe(true);
  });

  it('after ready, it keeps tracking until the copy has loaded, then stops', () => {
    const tree = render(entryWith({ id: 'm1', thumbnailUrl: null }));
    act(() => mediaStatusPoller.watch.mock.calls[0][1](READY));
    expect(tracks(tree)).toBe(true);
    act(() => tree.root.findByType(Image).props.onLoad());
    expect(tracks(tree)).toBe(false);
  });

  it('a terminal state stops tracking', () => {
    const tree = render(entryWith({ id: 'm1', thumbnailUrl: null }));
    act(() => mediaStatusPoller.watch.mock.calls[0][1]({ id: 'm1', status: 'unavailable' }));
    expect(tracks(tree)).toBe(false);
  });

  it('the cap turns tracking off after ~5 s even if still pending, and the next change re-enables it', () => {
    const tree = render(entryWith({ id: 'm1', thumbnailUrl: null }));
    expect(TRACKING_CAP_MS).toBe(5000);
    act(() => jest.advanceTimersByTime(TRACKING_CAP_MS - 1));
    expect(tracks(tree)).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(tracks(tree)).toBe(false);
    act(() => mediaStatusPoller.watch.mock.calls[0][1](READY)); // pending -> loading
    expect(tracks(tree)).toBe(true);
    act(() => tree.root.findByType(Image).props.onLoad());
    expect(tracks(tree)).toBe(false);
  });
});
