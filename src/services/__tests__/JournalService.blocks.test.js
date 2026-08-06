/**
 * Tests for content-block construction and media persistence.
 *
 * Both guard production failures where an entry saved fine but rendered as
 * nothing (wrong block shape) or as a grey placeholder (media left in the OS
 * cache). Heavy dependencies are mocked; no database or native modules load.
 */

jest.mock('../DatabaseService', () => ({ DatabaseService: {} }));
jest.mock('../SettingsService', () => ({
  SettingsService: {},
  StorageMode: { LOCAL_ONLY: 'local_only' },
}));
jest.mock('../../repositories/JournalRepository', () => ({
  JournalRepository: class {},
  EntryVisibility: { PRIVATE: 'private' },
  SortOrder: { DESC: 'desc' },
}));
jest.mock('../FileService', () => ({
  FileService: { persist: jest.fn(), isPersisted: jest.fn() },
  MediaType: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
}));

import { JournalService, ContentBlock } from '../JournalService';
import { FileService, MediaType } from '../FileService';
import { ContentBlockType } from '../../database/schema';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: pretend every source path is a cache path that gets copied.
  FileService.persist.mockImplementation(async (uri) =>
    uri.startsWith('file:///docs/') ? uri : `file:///docs/media/${uri.split('/').pop()}`
  );
});

describe('ContentBlock shapes', () => {
  // JournalEntryCard switches on block.type and reads block.media. A block that
  // matches neither renders as nothing, which is what made photos invisible.
  it('builds a photos block, not an undefined type', () => {
    const block = ContentBlock.image({ localPath: 'file:///tmp/a.jpg', width: 100, height: 50 });

    expect(block.type).toBe(ContentBlockType.PHOTOS);
    expect(block.type).toBeDefined();
    expect(block.media).toHaveLength(1);
    expect(block.media[0].localPath).toBe('file:///tmp/a.jpg');
    expect(block.media[0].width).toBe(100);
  });

  it('builds a video block carrying its media array', () => {
    const block = ContentBlock.video({ localPath: 'file:///tmp/v.mp4', duration: 12 });

    expect(block.type).toBe(ContentBlockType.VIDEO);
    expect(block.media[0].localPath).toBe('file:///tmp/v.mp4');
    expect(block.duration).toBe(12);
  });

  it('builds an audio block carrying its media array', () => {
    const block = ContentBlock.audio({ localPath: 'file:///tmp/a.m4a', duration: 3 });

    expect(block.type).toBe(ContentBlockType.AUDIO);
    expect(block.media[0].localPath).toBe('file:///tmp/a.m4a');
  });

  it('gives location blocks a real type', () => {
    const block = ContentBlock.location({ lat: 1, lng: 2, name: 'Gare du Nord' });

    expect(block.type).toBe(ContentBlockType.LOCATION);
    expect(block.type).toBeDefined();
  });

  it('builds a text block the card can render', () => {
    const block = ContentBlock.text('hello');
    expect(block.type).toBe(ContentBlockType.TEXT);
    expect(block.content).toBe('hello');
  });
});

describe('_persistMediaBlocks', () => {
  it('copies capture URIs out of the cache', async () => {
    // The regression: the compose modal stored the raw ImagePicker URI, which
    // the OS purges, so the photo later rendered as a grey placeholder.
    const blocks = [
      { type: 'photos', media: [{ localId: 'p1', localPath: 'file:///cache/pic.jpg' }] },
    ];

    const [photos] = await JournalService._persistMediaBlocks(blocks);

    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/pic.jpg', MediaType.IMAGE);
    expect(photos.media[0].localPath).toBe('file:///docs/media/pic.jpg');
    expect(photos.media[0].localId).toBe('p1');
  });

  it('uses the right media type per block', async () => {
    await JournalService._persistMediaBlocks([
      { type: 'photos', media: [{ localPath: 'file:///cache/a.jpg' }] },
      { type: 'video', media: [{ localPath: 'file:///cache/b.mp4' }] },
      { type: 'audio', media: [{ localPath: 'file:///cache/c.m4a' }] },
    ]);

    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/a.jpg', MediaType.IMAGE);
    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/b.mp4', MediaType.VIDEO);
    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/c.m4a', MediaType.AUDIO);
  });

  it('persists video thumbnails too', async () => {
    const blocks = [{
      type: 'video',
      media: [{ localPath: 'file:///cache/v.mp4', thumbnailPath: 'file:///cache/v.jpg' }],
    }];

    const [video] = await JournalService._persistMediaBlocks(blocks);

    expect(video.media[0].thumbnailPath).toBe('file:///docs/media/v.jpg');
  });

  it('leaves text blocks untouched', async () => {
    const text = { type: 'text', content: 'walked to the station' };
    const [result] = await JournalService._persistMediaBlocks([text]);

    expect(result).toBe(text);
    expect(FileService.persist).not.toHaveBeenCalled();
  });

  it('is safe to run twice on already-persisted media', async () => {
    const blocks = [{ type: 'photos', media: [{ localPath: 'file:///docs/media/pic.jpg' }] }];

    const once = await JournalService._persistMediaBlocks(blocks);
    const twice = await JournalService._persistMediaBlocks(once);

    expect(twice[0].media[0].localPath).toBe('file:///docs/media/pic.jpg');
  });

  it('keeps the original URI when persisting fails, rather than losing the capture', async () => {
    FileService.persist.mockRejectedValue(new Error('disk full'));
    const blocks = [{ type: 'photos', media: [{ localPath: 'file:///cache/pic.jpg' }] }];

    const [photos] = await JournalService._persistMediaBlocks(blocks);

    expect(photos.media[0].localPath).toBe('file:///cache/pic.jpg');
  });

  it('tolerates malformed blocks', async () => {
    const result = await JournalService._persistMediaBlocks([
      null,
      { type: 'photos' },
      { type: 'photos', media: [{ localId: 'no-path' }] },
    ]);

    expect(result).toHaveLength(3);
    expect(FileService.persist).not.toHaveBeenCalled();
  });

  it('returns an empty array for a missing block list', async () => {
    expect(await JournalService._persistMediaBlocks(undefined)).toEqual([]);
  });
});
