/**
 * 007 T060 -- one tile, every state. DerivativeImage is what each photo surface renders;
 * the surfaces themselves are checked in derivativeSurfaces.test.js.
 */
import React from 'react';
import { Image, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});

import { mediaStatusPoller } from '../../../services/mediaStatusPoller';
import { Platform } from 'react-native';
import DerivativeImage from '../DerivativeImage';

global.IS_REACT_ACT_ENVIRONMENT = true;

const render = (props) => {
  let tree;
  act(() => {
    tree = renderer.create(<DerivativeImage style={{ height: 100 }} {...props} />);
  });
  return tree;
};
const texts = (tree) => tree.root.findAllByType(Text).map((t) => t.props.children);
const images = (tree) => tree.root.findAllByType(Image);
const hasPlaceholder = (tree) => tree.root.findAllByProps({ testID: 'media-pending' }).length > 0;

beforeEach(() => {
  jest.useFakeTimers();
  mediaStatusPoller.watch.mockClear();
  mediaStatusPoller.unwatch.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('DerivativeImage', () => {
  it('renders the device copy for a local photo, and does not poll while it loads', () => {
    const tree = render({ media: { id: 'm1', localPath: 'file:///a.jpg' } });
    expect(images(tree)[0].props.source).toEqual({ uri: 'file:///a.jpg' });
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('the pending plate says "Preparing photo…" (FR-020)', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null } });
    expect(texts(tree)).toContain('Preparing photo…');
  });

  it('on a very small tile the text is dropped but the label stays accessible', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null }, style: { width: 40, height: 40 } });
    expect(texts(tree)).not.toContain('Preparing photo…');
    const plate = tree.root.findAllByType(View).find((v) => v.props.testID === 'media-pending');
    expect(plate.props.accessibilityLabel).toBe('Preparing photo');
  });

  it('a small tile sized by aspect ratio alone still gets the full text', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null }, style: { width: '100%', aspectRatio: 1 } });
    expect(texts(tree)).toContain('Preparing photo…');
  });

  it('a local file that has gone falls back to the server copy', () => {
    const tree = render({ media: { id: 'm1', localPath: 'file:///x.jpg', thumbnailUrl: 'https://cdn/g.webp' } });
    act(() => images(tree)[0].props.onError());
    expect(images(tree)[0].props.source).toEqual({ uri: 'https://cdn/g.webp' });
  });

  describe('on web', () => {
    const original = Platform.OS;
    beforeEach(() => {
      Platform.OS = 'web';
    });
    afterEach(() => {
      Platform.OS = original;
    });
    it('adds no border radius the style did not ask for', () => {
      const tree = render({ media: { id: 'm1', localPath: 'file:///x.jpg' }, style: { height: 80 } });
      const img = tree.root.findByType('img');
      expect(img.props.style.borderRadius).toBeUndefined();
    });
    it('honours the border radius the style does ask for', () => {
      const tree = render({ media: { id: 'm1', localPath: 'file:///x.jpg' }, style: { height: 80, borderRadius: 6 } });
      expect(tree.root.findByType('img').props.style.borderRadius).toBe(6);
    });
  });

  it('renders the pending placeholder, never { uri: null }, when there is no source yet', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null } });
    expect(hasPlaceholder(tree)).toBe(true);
    expect(images(tree)).toHaveLength(0);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
  });

  it('swaps to the ready copy in place, with the ?v= cache-buster', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null } });
    const cb = mediaStatusPoller.watch.mock.calls[0][1];
    act(() =>
      cb({ id: 'm1', status: 'ready', updatedAt: 'T1', gridUrl: 'https://cdn/g.webp', displayUrl: 'https://cdn/d.webp' }),
    );
    expect(hasPlaceholder(tree)).toBe(false);
    expect(images(tree)[0].props.source).toEqual({ uri: 'https://cdn/g.webp?v=T1' });
  });

  it('the display variant asks for the display copy', () => {
    const tree = render({ media: { id: 'm1', displayUrl: null }, variant: 'display' });
    const cb = mediaStatusPoller.watch.mock.calls[0][1];
    act(() => cb({ id: 'm1', status: 'ready', updatedAt: 'T1', gridUrl: 'https://cdn/g.webp', displayUrl: 'https://cdn/d.webp' }));
    expect(images(tree)[0].props.source).toEqual({ uri: 'https://cdn/d.webp?v=T1' });
  });

  it('a remote copy that will not load goes to the placeholder and starts polling', () => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: 'https://cdn/g.webp' } });
    expect(images(tree)[0].props.source).toEqual({ uri: 'https://cdn/g.webp' });
    act(() => images(tree)[0].props.onError());
    expect(hasPlaceholder(tree)).toBe(true);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unavailable', { id: 'm1', status: 'unavailable' }],
    ['failed with no failureReason (not the owner)', { id: 'm1', status: 'failed', updatedAt: 't' }],
  ])('says "Photo unavailable" for %s', (_name, payload) => {
    const tree = render({ media: { id: 'm1', thumbnailUrl: null } });
    act(() => mediaStatusPoller.watch.mock.calls[0][1](payload));
    expect(texts(tree)).toContain('Photo unavailable');
    expect(images(tree)).toHaveLength(0);
  });

  it('says "Photo unavailable" for an unresolved reference, and for a copy that never loads', () => {
    expect(texts(render({ media: { id: null, unresolved: true } }))).toContain('Photo unavailable');
  });

  it("keeps \"Photo couldn't be uploaded\" for an upload-failed or missing-file photo", () => {
    expect(texts(render({ media: { id: 'x', uploadFailed: true } }))).toContain("Photo couldn't be uploaded");
    expect(texts(render({ media: { id: 'x', missingFile: true } }))).toContain("Photo couldn't be uploaded");
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  describe('onStateChange', () => {
    const track = () => {
      const seen = [];
      return { seen, onStateChange: (st) => seen.push(st) };
    };
    const READY = { id: 'm1', status: 'ready', updatedAt: 'T', gridUrl: 'https://cdn/g.webp', displayUrl: 'https://cdn/d.webp' };

    it('reports pending, then loading and loaded once the ready copy arrives and renders', () => {
      const { seen, onStateChange } = track();
      const tree = render({ media: { id: 'm1', thumbnailUrl: null }, onStateChange });
      expect(seen).toEqual(['pending']);
      act(() => mediaStatusPoller.watch.mock.calls[0][1](READY));
      expect(seen.at(-1)).toBe('loading');
      act(() => images(tree)[0].props.onLoad());
      expect(seen.at(-1)).toBe('loaded');
    });

    it('a photo that loads straight away goes loading, loaded', () => {
      const { seen, onStateChange } = track();
      const tree = render({ media: { id: 'm1', localPath: 'file:///a.jpg' }, onStateChange });
      expect(seen).toEqual(['loading']);
      act(() => images(tree)[0].props.onLoad());
      expect(seen).toEqual(['loading', 'loaded']);
    });

    it.each([
      ['unavailable', { id: 'm1', status: 'unavailable' }],
      ['failed', { id: 'm1', status: 'failed', updatedAt: 't' }],
    ])('reports %s', (name, payload) => {
      const { seen, onStateChange } = track();
      render({ media: { id: 'm1', thumbnailUrl: null }, onStateChange });
      act(() => mediaStatusPoller.watch.mock.calls[0][1](payload));
      expect(seen.at(-1)).toBe(name);
    });

    it('reports loadFailed when a ready copy will not load', () => {
      const { seen, onStateChange } = track();
      const tree = render({ media: { id: 'm1', thumbnailUrl: null }, onStateChange });
      const ready = () => act(() => mediaStatusPoller.watch.mock.calls.at(-1)[1](READY));
      const exhaust = () => {
        act(() => images(tree)[0].props.onError());
        act(() => jest.advanceTimersByTime(2000));
        act(() => images(tree)[0].props.onError());
      };
      ready();
      exhaust();
      ready();
      exhaust();
      ready();
      exhaust();
      expect(seen.at(-1)).toBe('loadFailed');
    });

    it('reports uploadFailed', () => {
      const { seen, onStateChange } = track();
      render({ media: { id: 'x', uploadFailed: true }, onStateChange });
      expect(seen).toEqual(['uploadFailed']);
    });
  });

  describe('legacy id-less items (seed data)', () => {
    it('an item with a uri and no id renders that uri directly, and never polls', () => {
      const tree = render({ media: { uri: 'https://seed/x.jpg', type: 'photo' } });
      expect(images(tree)[0].props.source).toEqual({ uri: 'https://seed/x.jpg' });
      expect(images(tree)[0].props.onError).toBeUndefined(); // nothing to recover: no media id
      expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
    });
    it('an item with an id keeps the lifecycle: uri alone is not shown', () => {
      const tree = render({ media: { id: 'm1', uri: 'https://cdn/original.jpg', thumbnailUrl: null } });
      expect(images(tree)).toHaveLength(0);
    });
  });
});
