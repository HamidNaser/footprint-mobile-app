/**
 * The media upload has to speak the server's contract, field for field.
 *
 * It did not, and had not since it was written. The presign request sent `mediaType` and
 * `size` where UploadMediaRequest declares `Type` and `FileSize` -- .NET binds JSON
 * case-insensitively but not by synonym, so both arrived empty on a non-nullable record and
 * every upload was rejected with 400 before a byte left the device. Completing an upload
 * sent an `uploadId` that appears nowhere in the response, and read `uploadId` back from a
 * payload that returns `s3Key`.
 *
 * The visible symptom was nothing at all: photos and audio saved locally, entries reported
 * as saved, and media that never reached the server. The entries carrying them were then
 * rejected too, because they referenced local file paths where the server needs a url.
 *
 * A field name is exactly the kind of thing that reads correctly and is wrong, so these
 * pin the three payloads against the contract in
 * Footprint.Hub.Contracts/Api/Media/MediaDtos.cs.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: {
    isOffline: () => false,
    initialize: jest.fn(async () => {}),
    shouldUploadMedia: jest.fn(async () => true),
  },
  NetworkState: {},
}));

import { ApiClient } from '../ApiClient';
import { MediaApi } from '../MediaApi';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('presign request', () => {
  it('sends type, fileName and fileSize — the names the server declares', async () => {
    const post = jest.spyOn(ApiClient, 'post').mockResolvedValue({
      uploadUrl: 'https://s3.example/put',
      s3Key: 'media/abc.png',
      contentType: 'image/png',
    });

    await MediaApi._requestUploadUrl({
      type: 'image',
      filename: 'abc.png',
      size: 1234,
      entryId: 'entry-1',
      contentType: 'image/png',
    });

    const [, body] = post.mock.calls[0];
    expect(body).toEqual({ type: 'image', fileName: 'abc.png', fileSize: 1234 });
  });

  it('does not send the names that matched nothing', async () => {
    const post = jest.spyOn(ApiClient, 'post').mockResolvedValue({ uploadUrl: 'u', s3Key: 'k' });

    await MediaApi._requestUploadUrl({ type: 'image', filename: 'a.png', size: 1 });

    const [, body] = post.mock.calls[0];
    expect(body).not.toHaveProperty('mediaType');
    expect(body).not.toHaveProperty('size');
    expect(body).not.toHaveProperty('filename');
  });

  it('reads back s3Key and the signed content type', async () => {
    jest.spyOn(ApiClient, 'post').mockResolvedValue({
      uploadUrl: 'https://s3.example/put',
      s3Key: 'media/abc.png',
      contentType: 'image/png',
    });

    const result = await MediaApi._requestUploadUrl({ type: 'image', filename: 'a.png', size: 1 });

    // S3 rejects the PUT if the content type differs from the one the URL was signed with,
    // so this has to come back rather than be guessed a second time.
    expect(result.s3Key).toBe('media/abc.png');
    expect(result.contentType).toBe('image/png');
    expect(result).not.toHaveProperty('uploadId');
  });
});

describe('complete request', () => {
  it('sends s3Key and the dimensions, and nothing invented', async () => {
    const post = jest.spyOn(ApiClient, 'post').mockResolvedValue({ id: 'm1', url: 'https://cdn/x' });

    await MediaApi._completeUpload({ s3Key: 'media/abc.png', width: 100, height: 200 });

    const [, body] = post.mock.calls[0];
    expect(body).toEqual({ s3Key: 'media/abc.png', width: 100, height: 200, duration: null });
    expect(body).not.toHaveProperty('uploadId');
    expect(body).not.toHaveProperty('mediaType');
  });

  it('returns the media id and url the entry payload needs', async () => {
    jest.spyOn(ApiClient, 'post').mockResolvedValue({
      id: 'm1',
      url: 'https://cdn/x.png',
      thumbnailUrl: 'https://cdn/t.png',
    });

    const result = await MediaApi._completeUpload({ s3Key: 'k' });

    // Without a url here the entry is pushed referencing a local file path, which the
    // server rejects -- the second failure this bug caused.
    expect(result).toEqual({
      mediaId: 'm1',
      url: 'https://cdn/x.png',
      thumbnailUrl: 'https://cdn/t.png',
    });
  });
});
