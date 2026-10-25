/**
 * The holding area on a phone (T064, FR-013).
 *
 * <p>
 * This screen shipped with the note "no test can load it": it imports `ApiClient`, which reaches
 * `AsyncStorage` and throws under jest. That was true of loading it <i>unmocked</i> and was taken
 * to mean the screen could only be checked on a device. It cannot — the modules that throw are
 * exactly the ones worth substituting anyway, and with them mocked the screen mounts and behaves.
 * </p>
 *
 * <p>
 * What still needs a device, and is not claimed here: the real permission dialog, real thumbnail
 * decoding, and the on-screen keyboard. Everything below is logic that was previously unverified.
 * </p>
 */
/*
 * The first mount in this file pays the cost of transforming the screen and everything React
 * Native pulls in behind it, which on a CI runner exceeded jest's 5s default while taking about a
 * second here. Raised for the suite rather than for one test: whichever test happens to run first
 * pays it, so pinning the timeout to a particular one would move the failure rather than fix it.
 */
jest.setTimeout(30000);

jest.mock('../../api/HoldingAreaApi', () => ({
  __esModule: true,
  default: { listUndated: jest.fn(), groupUndated: jest.fn() },
}));
jest.mock('../../api/JournalApi', () => ({
  __esModule: true,
  default: { listJournals: jest.fn() },
}));
// The tiles are DerivativeImage now; its poller reaches ApiClient, which cannot load here.
jest.mock('../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../../utils/resolveImportJournal', () => ({
  resolveImportJournal: jest.fn(),
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { mediaStatusPoller } from '../../services/mediaStatusPoller';
import { MediaApi } from '../../api/MediaApi';
import HoldingAreaApi from '../../api/HoldingAreaApi';
import JournalApi from '../../api/JournalApi';
import { resolveImportJournal } from '../../utils/resolveImportJournal';
import UndatedPhotosScreen from '../UndatedPhotosScreen';

const photo = (id, name, lat = null, lng = null) => ({
  mediaId: id, url: `https://cdn/${id}`, thumbnailUrl: null,
  originalFileName: name, rawLat: lat, rawLng: lng, importBatchId: 'b1',
});

const page = (photos, extra = {}) => ({
  photos, total: photos.length, locationHints: [], hasMore: false, nextCursor: null, ...extra,
});

/** Every string the screen is currently showing, flattened. */
function texts(tree) {
  return tree.root.findAllByType('Text').map((node) => {
    const children = Array.isArray(node.props.children)
      ? node.props.children.flat(3)
      : [node.props.children];
    return children.filter((c) => typeof c === 'string' || typeof c === 'number').join('');
  });
}

const shows = (tree, pattern) => texts(tree).some((t) => pattern.test(t));

/**
 * A pressable by its accessibility label or by the text inside it.
 *
 * `findAll` and take the first, never `find`: a `TouchableOpacity` appears twice in the tree — the
 * composite and the instance it renders — and both carry `onPress`, so `find` never resolves.
 */
function pressable(tree, matcher) {
  const matches = tree.root.findAll((node) => {
    if (typeof node.props?.onPress !== 'function') return false;
    if (matcher.test(String(node.props.accessibilityLabel ?? ''))) return true;

    return node.findAllByType('Text').some((t) => {
      const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
      return matcher.test(children.filter((c) => typeof c === 'string').join(''));
    });
  });

  if (matches.length === 0) {
    throw new Error(`No pressable matching ${matcher}. Showing: ${JSON.stringify(texts(tree))}`);
  }

  return matches[0];
}

const press = async (tree, matcher) => {
  await act(async () => { pressable(tree, matcher).props.onPress(); });
};

const typeDate = async (tree, value) => {
  await act(async () => { tree.root.findByType(TextInput).props.onChangeText(value); });
};

async function mount() {
  let tree;
  await act(async () => { tree = create(<UndatedPhotosScreen navigation={{ goBack: jest.fn() }} />); });
  // A second settle, for the journal-name read that starts alongside the first page.
  await act(async () => {});
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  JournalApi.listJournals.mockResolvedValue([{ id: 'j1', name: 'Family' }]);
  HoldingAreaApi.listUndated.mockResolvedValue(page([photo('m1', 'Christmas1978.jpg'), photo('m2', 'scan-002.jpg')]));
  HoldingAreaApi.groupUndated.mockResolvedValue({ journalEntryId: 'e1', photoCount: 1, remainingUndated: 1 });
  resolveImportJournal.mockResolvedValue({ id: 'j1', name: 'Family', created: false });
});

describe('UndatedPhotosScreen', () => {
  it('names the journal the entries will go into', async () => {
    expect(shows(await mount(), /Entries will go into Family/)).toBe(true);
  });

  it('does not create a journal merely because the screen was opened', async () => {
    // Opening a workspace is not consent to write anything.
    await mount();

    expect(resolveImportJournal).not.toHaveBeenCalled();
  });

  it('shows each photograph by the name it arrived with', async () => {
    // Frequently the only clue there is: "Christmas1978.jpg" is the whole reason somebody can
    // date it at all.
    const tree = await mount();

    expect(shows(tree, /Christmas1978\.jpg/)).toBe(true);
    expect(shows(tree, /scan-002\.jpg/)).toBe(true);
  });

  it('reads as finished, not broken, when nothing is held', async () => {
    HoldingAreaApi.listUndated.mockResolvedValue(page([]));

    expect(shows(await mount(), /Nothing is waiting for a date/)).toBe(true);
  });

  it('shows what it understood a date to be before anything is created', async () => {
    // Otherwise "1978" quietly becoming 1 January 1978 is something somebody discovers in
    // their journal later.
    const tree = await mount();
    await typeDate(tree, '1978-07');

    expect(shows(tree, /Reads as July 1978/)).toBe(true);
  });

  it('says so when it cannot read a date, rather than failing silently', async () => {
    const tree = await mount();
    await typeDate(tree, 'last summer');

    expect(shows(tree, /Not a date/)).toBe(true);
  });

  it('creates an entry from the chosen photographs at the precision typed', async () => {
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, '1978');
    await press(tree, /Create an entry/);

    expect(HoldingAreaApi.groupUndated).toHaveBeenCalledWith({
      mediaIds: ['m1'], journalId: 'j1', date: '1978-01-01', datePrecision: 'year',
    });
  });

  it('keeps a full date a full date', async () => {
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, '1978-12-25');
    await press(tree, /Create an entry/);

    expect(HoldingAreaApi.groupUndated.mock.calls[0][0].datePrecision).toBe('day');
  });

  it('sends nothing when the date cannot be read', async () => {
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, 'last summer');
    await press(tree, /Create an entry/);

    expect(HoldingAreaApi.groupUndated).not.toHaveBeenCalled();
  });

  it('sends nothing when no photograph is chosen', async () => {
    const tree = await mount();
    await typeDate(tree, '1978');
    await press(tree, /Create an entry/);

    expect(HoldingAreaApi.groupUndated).not.toHaveBeenCalled();
  });

  it('selects and deselects, so a mistaken tap is recoverable', async () => {
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, '1978');
    await press(tree, /Create an entry/);

    expect(HoldingAreaApi.groupUndated).not.toHaveBeenCalled();
  });

  it('reports what became of them and what is left', async () => {
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, '1978');
    await press(tree, /Create an entry/);

    expect(shows(tree, /Entry created from 1 photograph/)).toBe(true);
    expect(shows(tree, /1 still waiting/)).toBe(true);
  });

  it('reloads the list once an entry is made, because the holding area has changed', async () => {
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, '1978');
    await press(tree, /Create an entry/);

    expect(HoldingAreaApi.listUndated).toHaveBeenCalledTimes(2);
    // From the beginning, not from a cursor into the set that has just changed.
    expect(HoldingAreaApi.listUndated.mock.calls[1][1]).toBeNull();
  });

  it('says why nothing happened when the server refuses', async () => {
    HoldingAreaApi.groupUndated.mockRejectedValue(new Error('that journal is gone'));
    const tree = await mount();
    await press(tree, /Select Christmas1978\.jpg/);
    await typeDate(tree, '1978');
    await press(tree, /Create an entry/);

    expect(shows(tree, /that journal is gone/)).toBe(true);
  });

  it('says why nothing loaded when the list itself fails', async () => {
    HoldingAreaApi.listUndated.mockRejectedValue(new Error('offline'));

    expect(shows(await mount(), /offline/)).toBe(true);
  });

  describe('more than one page', () => {
    beforeEach(() => {
      /*
       * Driven by the cursor rather than by call order, which is both more faithful — the server
       * answers the cursor it was sent — and immune to a trap I hit writing this:
       * `jest.clearAllMocks()` does not drain a `mockResolvedValueOnce` queue, so a test that
       * consumed one of two queued pages left the other behind for the next test. Two tests here
       * and two in the hint block failed for that reason and passed in isolation, which is the
       * most misleading way for a suite to be wrong.
       */
      HoldingAreaApi.listUndated.mockImplementation(async (_limit, after) => (after === 'm1'
        ? { photos: [photo('m2', 'b.jpg')], total: 3, locationHints: [], hasMore: false, nextCursor: null }
        : { photos: [photo('m1', 'a.jpg')], total: 3, locationHints: [], hasMore: true, nextCursor: 'm1' }));
    });

    it('says how many are loaded when that is not all of them', async () => {
      expect(shows(await mount(), /Showing 1 of 3/)).toBe(true);
    });

    it('asks for the next page from where the last one ended', async () => {
      const tree = await mount();
      await press(tree, /Load more/);

      expect(HoldingAreaApi.listUndated.mock.calls[1][1]).toBe('m1');
    });

    it('adds to what is shown rather than replacing it', async () => {
      const tree = await mount();
      await press(tree, /Load more/);

      expect(shows(tree, /b\.jpg/)).toBe(true);
      expect(shows(tree, /a\.jpg/)).toBe(true);
    });

    it('keeps a selection made before loading more', async () => {
      // Appending is the easy part; keeping the selection is what an implementation drops.
      const tree = await mount();
      await press(tree, /Select a\.jpg/);
      await press(tree, /Load more/);
      await typeDate(tree, '1978');
      await press(tree, /Create an entry/);

      expect(HoldingAreaApi.groupUndated.mock.calls[0][0].mediaIds).toEqual(['m1']);
    });

    it('stops offering when there is nothing left to load', async () => {
      const tree = await mount();
      await press(tree, /Load more/);

      expect(() => pressable(tree, /Load more/)).toThrow(/No pressable/);
    });
  });

  it('does not offer to load more when there is no cursor to load from', async () => {
    /*
     * Without a cursor there is nothing to ask for. Offered anyway, "Load more" re-fetched the
     * first page for ever — `after` was null both times — so somebody tapped a button that
     * silently did nothing. The server sets `hasMore` and `nextCursor` together today; this is
     * the screen not depending on that.
     */
    HoldingAreaApi.listUndated.mockResolvedValue({
      photos: [photo('m1', 'a.jpg')], total: 9, locationHints: [], hasMore: true, nextCursor: null,
    });

    const tree = await mount();

    expect(() => pressable(tree, /Load more/)).toThrow(/No pressable/);
  });

  describe('a shared-place hint', () => {
    beforeEach(() => {
      HoldingAreaApi.listUndated.mockResolvedValue({
        photos: [photo('m1', 'a.jpg', 43.4, -80.4), photo('m2', 'b.jpg', 43.4, -80.4), photo('m3', 'c.jpg')],
        total: 3,
        locationHints: [{ lat: 43.4, lng: -80.4, radiusMetres: 750, photoCount: 2, mediaIds: ['m1', 'm2'] }],
        hasMore: false,
        nextCursor: null,
      });
    });

    it('is offered as something that may be done, not something that was', async () => {
      // Principle I: no occasion is asserted. The wording has to stay conditional.
      const tree = await mount();

      expect(shows(tree, /2 photographs were taken near each other/)).toBe(true);
      expect(shows(tree, /created|grouped/i)).toBe(false);
    });

    it('creates nothing by itself', async () => {
      const tree = await mount();
      await press(tree, /Select these 2/);

      expect(HoldingAreaApi.groupUndated).not.toHaveBeenCalled();
    });

    it('selects its photographs when acted on, and only its own', async () => {
      const tree = await mount();
      await press(tree, /Select these 2/);
      await typeDate(tree, '1978');
      await press(tree, /Create an entry/);

      expect(HoldingAreaApi.groupUndated.mock.calls[0][0].mediaIds).toEqual(['m1', 'm2']);
    });

    it('scopes itself to what is loaded when there is more to come', async () => {
      // The server computes a hint over one page and cannot see photographs not yet fetched.
      HoldingAreaApi.listUndated.mockResolvedValue({
        photos: [photo('m1', 'a.jpg', 43.4, -80.4)],
        total: 500,
        locationHints: [{ lat: 43.4, lng: -80.4, radiusMetres: 750, photoCount: 1, mediaIds: ['m1'] }],
        hasMore: true,
        nextCursor: 'm1',
      });

      expect(shows(await mount(), /loaded so far/)).toBe(true);
    });
  });
});

describe('UndatedPhotosScreen: media tiles (007)', () => {
  it('keeps the three-up grid: the width is on the outer wrapper, the tile fills it', async () => {
    const tree = await mount();
    const wrappers = tree.root.findAll((n) => n.props.collapsable === false && typeof n.props.onLayout === 'function' && n.instance);
    expect(wrappers).toHaveLength(2);
    wrappers.forEach((w) => {
      expect(StyleSheet.flatten(w.props.style).width).toBe('31%');
      const slot = w.findAll((n) => n.props.style && StyleSheet.flatten(n.props.style)?.borderWidth === 2)[0];
      expect(StyleSheet.flatten(slot.props.style).width).toBe('100%');
    });
  });

  const watched = () => mediaStatusPoller.watch.mock.calls.map((c) => c[0]);

  it('a tile scrolled out of view stops watching, and watches again when it returns (FR-027)', async () => {
    const tree = await mount();
    expect(watched().sort()).toEqual(['m1', 'm2']);
    mediaStatusPoller.unwatch.mockClear();
    mediaStatusPoller.watch.mockClear();

    const pos = { m1: 100, m2: 5000 };
    const scroll = tree.root.findByType(ScrollView);
    scroll.instance.measureInWindow = (cb) => cb(0, 0, 400, 700);
    // The tiles' ViewportTile wrappers, in photo order.
    const wrappers = tree.root.findAll((n) => n.props.collapsable === false && typeof n.props.onLayout === 'function' && n.instance);
    expect(wrappers).toHaveLength(2);
    ['m1', 'm2'].forEach((id, i) => {
      wrappers[i].instance.measureInWindow = (cb) => cb(0, pos[id], 100, 100);
    });

    act(() => scroll.props.onLayout({}));
    expect(mediaStatusPoller.unwatch.mock.calls.map((c) => c[0])).toEqual(['m2']);

    pos.m2 = 300; // scrolled into view
    act(() => scroll.props.onMomentumScrollEnd({}));
    expect(watched()).toEqual(['m2']);
  });

  it("the owner's Try again sits beside the tile's touchable, not inside it", async () => {
    const tree = await mount();
    const cb = mediaStatusPoller.watch.mock.calls.find((c) => c[0] === 'm1')[1];
    act(() => cb({ id: 'm1', status: 'failed', updatedAt: 't', failureReason: 'corrupt' }));
    const btn = tree.root.findAll(
      (n) => n.type === TouchableOpacity && n.findAllByType(Text).some((t) => t.props.children === 'Try again'),
    )[0];
    expect(btn).toBeDefined();
    for (let up = btn.parent; up; up = up.parent) expect(up.type).not.toBe(TouchableOpacity);
    MediaApi.retry.mockResolvedValue({});
    await act(async () => {
      await btn.props.onPress();
    });
    expect(MediaApi.retry).toHaveBeenCalledWith('m1');
  });
});
