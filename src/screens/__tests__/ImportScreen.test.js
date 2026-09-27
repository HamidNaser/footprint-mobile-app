/**
 * Importing the camera roll, on a phone (User Story 3, FR-001, FR-009).
 *
 * <p>
 * This screen shipped with the note "no test can load it", because `expo-media-library` and
 * `ApiClient` throw the moment they load under jest. That is true unmocked — and mocking them is
 * exactly what a test of this file should do anyway, since they are the boundary.
 * </p>
 *
 * <p>
 * <b>`runPhotoImport` is deliberately NOT mocked.</b> It is the thing this screen exists to wire
 * up, so letting it run for real against substituted boundaries is what actually tests the
 * wiring — whether `listAssets` gets a cursor, whether `uploadImage` is handed the right fields,
 * whether the local metadata row is written before the upload. Stubbing it would test nothing but
 * that a function was called.
 * </p>
 *
 * <p>
 * What still needs a device, and is not claimed here: the real permission dialog, real EXIF coming
 * back from `getAssetInfoAsync`, real thumbnails, and the on-screen keyboard.
 * </p>
 */
/*
 * The first mount in this file pays the cost of transforming the screen and everything React
 * Native pulls in behind it, which on a CI runner exceeded jest's 5s default while taking about a
 * second here. Raised for the suite rather than for one test: whichever test happens to run first
 * pays it, so pinning the timeout to a particular one would move the failure rather than fix it.
 */
jest.setTimeout(30000);

jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  MediaType: { photo: 'photo', video: 'video' },
  SortBy: { creationTime: 'creationTime' },
}));
jest.mock('../../api/MediaApi', () => ({ __esModule: true, default: { uploadMedia: jest.fn() } }));
jest.mock('../../api/ImportApi', () => ({
  __esModule: true,
  default: {
    createBatch: jest.fn(), registerPhotos: jest.fn(), finalizeBatch: jest.fn(),
    listBatches: jest.fn(), listBatchPhotos: jest.fn(),
  },
}));
jest.mock('../../api/JournalApi', () => ({ __esModule: true, default: { listJournals: jest.fn() } }));
jest.mock('../../services/DatabaseService', () => ({
  __esModule: true,
  default: { savePhotoMetadata: jest.fn(), confirmPhotoMetadata: jest.fn() },
}));
jest.mock('../../utils/resolveImportJournal', () => ({ resolveImportJournal: jest.fn() }));
jest.mock('../../utils/contentHash', () => ({ contentHash: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import * as MediaLibrary from 'expo-media-library/legacy';
import MediaApi from '../../api/MediaApi';
import ImportApi from '../../api/ImportApi';
import JournalApi from '../../api/JournalApi';
import DatabaseService from '../../services/DatabaseService';
import { resolveImportJournal } from '../../utils/resolveImportJournal';
import { contentHash } from '../../utils/contentHash';
import ImportScreen from '../ImportScreen';

function texts(tree) {
  return tree.root.findAllByType('Text').map((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children.flat(3) : [node.props.children];
    return children.filter((c) => typeof c === 'string' || typeof c === 'number').join('');
  });
}

const shows = (tree, pattern) => texts(tree).some((t) => pattern.test(t));

/** `findAll` and take the first: a TouchableOpacity appears twice and both carry `onPress`. */
function pressable(tree, matcher) {
  const matches = tree.root.findAll((node) => {
    if (typeof node.props?.onPress !== 'function') return false;
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

async function mount() {
  let tree;
  await act(async () => { tree = create(<ImportScreen navigation={{ goBack: jest.fn() }} />); });
  await act(async () => {});
  return tree;
}

const asset = (id) => ({ id, filename: `${id}.HEIC`, mediaType: 'photo', width: 4032, height: 3024 });

beforeEach(() => {
  jest.clearAllMocks();

  JournalApi.listJournals.mockResolvedValue([{ id: 'j1', name: 'Family' }]);
  resolveImportJournal.mockResolvedValue({ id: 'j1', name: 'Family', created: false });
  MediaLibrary.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });

  // Counts first (photo then video), then the paged walk during the import itself.
  MediaLibrary.getAssetsAsync.mockImplementation(async ({ mediaType, first }) => {
    if (mediaType === 'video') return { assets: [], totalCount: 37, hasNextPage: false, endCursor: null };
    if (first === 1) return { assets: [asset('a')], totalCount: 2, hasNextPage: false, endCursor: null };
    return { assets: [asset('a'), asset('b')], totalCount: 2, hasNextPage: false, endCursor: null };
  });
  MediaLibrary.getAssetInfoAsync.mockImplementation(async (a) => ({
    ...a, localUri: `file:///${a.id}`, exif: { DateTimeOriginal: '2018:07:04 15:22:00', Make: 'Apple' },
  }));

  contentHash.mockImplementation(async (uri) => `hash-${uri}`);
  // Faithful to the real `DatabaseService`, which is async. A bare `jest.fn()` returns
  // undefined, and the first version of these tests failed because of it — which is how the
  // `.catch()` fragility in `runPhotoImport` was found.
  DatabaseService.savePhotoMetadata.mockResolvedValue(undefined);
  DatabaseService.confirmPhotoMetadata.mockResolvedValue(undefined);
  MediaApi.uploadMedia.mockImplementation(async (info) => ({ mediaId: `media-${info.filename}` }));
  ImportApi.createBatch.mockResolvedValue({ batchId: 'b1' });
  ImportApi.listBatches.mockResolvedValue([]);
  ImportApi.listBatchPhotos.mockResolvedValue({ photos: [] });
  ImportApi.registerPhotos.mockResolvedValue({ registered: 2, duplicates: 0, held: 1 });
  ImportApi.finalizeBatch.mockResolvedValue({ entriesCreated: 1, photosRemaining: 0, hasMore: false });
});

describe('ImportScreen', () => {
  it('names the journal the entries will go into', async () => {
    expect(shows(await mount(), /Entries will go into Family/)).toBe(true);
  });

  it('does not create a journal merely because the screen was opened', async () => {
    await mount();

    expect(resolveImportJournal).not.toHaveBeenCalled();
  });

  it('asks for the library only when somebody asks it to', async () => {
    // Opening a screen is not a reason to raise a system permission dialog.
    const tree = await mount();

    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();

    await press(tree, /Choose photos/);
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('says what to do when permission is refused, rather than looking broken', async () => {
    MediaLibrary.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const tree = await mount();

    await press(tree, /Choose photos/);

    expect(shows(tree, /needs access to your photos/i)).toBe(true);
  });

  it('counts the library before asking anybody to commit to it', async () => {
    const tree = await mount();
    await press(tree, /Choose photos/);

    expect(shows(tree, /2 photographs/)).toBe(true);
  });

  it('says how many videos it will leave alone', async () => {
    // Videos are not photographs and are not silently treated as them. Saying so is the
    // difference between "not supported yet" and "where did those go".
    const tree = await mount();
    await press(tree, /Choose photos/);

    expect(shows(tree, /37 videos will not be imported/)).toBe(true);
  });

  it('uploads nothing until asked', async () => {
    const tree = await mount();
    await press(tree, /Choose photos/);

    expect(MediaApi.uploadMedia).not.toHaveBeenCalled();
  });

  describe('running the import', () => {
    const run = async () => {
      const tree = await mount();
      await press(tree, /Choose photos/);
      await press(tree, /^Import$/);
      return tree;
    };

    it('reads each photograph and uploads it', async () => {
      await run();

      expect(MediaLibrary.getAssetInfoAsync).toHaveBeenCalledTimes(2);
      expect(MediaApi.uploadMedia).toHaveBeenCalledTimes(2);
    });

    it('hands the upload a readable uri and the asset dimensions', async () => {
      // The adapter between `runPhotoImport` and `MediaApi` — previously unverified, and the
      // kind of mapping that fails silently by sending undefined.
      await run();

      const [info] = MediaApi.uploadMedia.mock.calls[0];
      expect(info.localUri).toBe('file:///a');
      expect(info.type).toBe('image');
      expect(info.filename).toBe('a.HEIC');
      expect(info.width).toBe(4032);
      expect(info.height).toBe(3024);
    });

    it('marks these as an import rather than a capture', async () => {
      await run();

      const [info] = MediaApi.uploadMedia.mock.calls[0];
      expect(info.photoMetadata.captureRoute).toBe('import');
    });

    it('sends the wall clock the file carried, unconverted', async () => {
      // FR-017 end to end through the real `buildPhotoMetadata`: a zone-less string, never a
      // Date that has picked up the phone's zone on the way.
      await run();

      const [info] = MediaApi.uploadMedia.mock.calls[0];
      expect(info.photoMetadata.takenAtLocal).toBe('2018-07-04T15:22:00');
      expect(info.photoMetadata.takenAtSource).toBe('exif.DateTimeOriginal');
    });

    it('writes the metadata to the device before uploading it', async () => {
      // The durable copy. The OS kills the app to reclaim memory and anything held only in
      // memory goes with it.
      const order = [];
      DatabaseService.savePhotoMetadata.mockImplementation(async () => { order.push('save'); });
      MediaApi.uploadMedia.mockImplementation(async (info) => {
        order.push('upload');
        return { mediaId: `media-${info.filename}` };
      });

      await run();

      expect(order.slice(0, 2)).toEqual(['save', 'upload']);
    });

    it('confirms the local row only after the server has registered it', async () => {
      // Confirming earlier is what would let the purge delete the only durable copy.
      const order = [];
      ImportApi.registerPhotos.mockImplementation(async () => {
        order.push('register');
        return { registered: 2, duplicates: 0, held: 1 };
      });
      DatabaseService.confirmPhotoMetadata.mockImplementation(async () => { order.push('confirm'); });

      await run();

      expect(order[0]).toBe('register');
      expect(order).toContain('confirm');
    });

    it('asks what an interrupted run already got through', async () => {
      await run();

      expect(ImportApi.listBatches).toHaveBeenCalledWith('in_progress');
    });

    it('reports what became of them', async () => {
      const tree = await run();

      expect(shows(tree, /1 entries created/)).toBe(true);
      expect(shows(tree, /1 waiting for a date/)).toBe(true);
    });

    it('says why nothing happened when the server refuses', async () => {
      ImportApi.createBatch.mockRejectedValue(new Error('no journal like that'));
      const tree = await run();

      expect(shows(tree, /no journal like that/)).toBe(true);
    });

    it('walks the library by cursor rather than asking for page one forever', async () => {
      const seen = [];
      MediaLibrary.getAssetsAsync.mockImplementation(async ({ mediaType, first, after }) => {
        if (mediaType === 'video') return { assets: [], totalCount: 0, hasNextPage: false, endCursor: null };
        if (first === 1) return { assets: [asset('a')], totalCount: 2, hasNextPage: false, endCursor: null };
        seen.push(after ?? null);
        return after === 'cursor-1'
          ? { assets: [asset('b')], totalCount: 2, hasNextPage: false, endCursor: null }
          : { assets: [asset('a')], totalCount: 2, hasNextPage: true, endCursor: 'cursor-1' };
      });

      await run();

      expect(seen).toEqual([null, 'cursor-1']);
      expect(MediaApi.uploadMedia).toHaveBeenCalledTimes(2);
    });

    it('asks the library for photographs only, oldest first', async () => {
      // Oldest first is what keeps a resumed run's pages stable: a new photograph appends at
      // the far end rather than shifting everything under the cursor.
      await run();

      const walk = MediaLibrary.getAssetsAsync.mock.calls
        .map(([options]) => options)
        .find((options) => options.first !== 1 && options.mediaType === 'photo');

      expect(walk.mediaType).toBe('photo');
      expect(walk.sortBy).toEqual([['creationTime', true]]);
    });
  });
});
