/**
 * Unit tests for PlacesApi.
 *
 * ApiClient is fully mocked so these tests exercise the pure request-building and
 * response-adapting logic without loading React Native networking modules.
 */

import { ApiClient } from '../ApiClient';
import {
  getPlaces,
  getPlace,
  getPlaceYearMemories,
  getPlaceMemories,
  checkIWasHere,
  startInterview,
  updateInterview,
  completeInterview,
  createMemoryRequest,
  getMemoryRequests,
  updateMemoryRequest,
} from '../PlacesApi';

jest.mock('../ApiClient', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

// contracts/media-item.md: image and photos are media items, not URL strings.
const item = (id, extra = {}) => ({
  id,
  kind: 'photo',
  thumbnailUrl: `https://cdn/${id}/grid.webp`,
  displayUrl: `https://cdn/${id}/display.webp`,
  unresolved: false,
  ...extra,
});

const detailFixture = () => ({
  id: 'paris',
  name: 'Paris',
  subtitle: 'France',
  image: item('paris'),
  lat: 48.8566,
  lng: 2.3522,
  entriesCount: 2,
  lastVisited: '2023-06-15T00:00:00Z',
  iWasHere: true,
  myYears: [2023],
  years: [
    {
      year: 2023,
      avatars: ['https://cdn/a.jpg'],
      memories: [
        {
          entryId: 'e1',
          journalId: 'j1',
          authorId: 'me',
          authorName: 'Hamid Naser',
          authorAvatar: 'https://cdn/a.jpg',
          date: '2023-06-15T00:00:00Z',
          text: 'Great trip',
          photos: [item('p1'), item('p2'), item('p1')],
          isCurrentUser: true,
        },
      ],
    },
    {
      year: 2010,
      avatars: ['https://cdn/b.jpg'],
      memories: [
        {
          entryId: 'e2',
          journalId: 'j1',
          authorId: 'dad',
          authorName: 'Omar Naser',
          authorAvatar: null,
          date: '2010-04-01T00:00:00Z',
          text: null,
          photos: [],
          isCurrentUser: false,
        },
      ],
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
});

const listFixture = (overrides = {}) => ({
  places: [
    {
      id: 'paris',
      name: 'Paris',
      subtitle: 'France',
      image: item('paris'),
      lat: 48.8566,
      lng: 2.3522,
      entriesCount: 2,
      lastVisited: '2023-06-15T00:00:00Z',
      years: [{ year: 2023, avatars: ['https://cdn/a.jpg'] }],
      ...overrides,
    },
  ],
  totalCount: 1,
});

describe('getPlaces', () => {
  it('keeps the coordinates the list endpoint provides', async () => {
    // PlaceResponse carries Lat/Lng, and PlacesScreen gates its map preview on
    // place.location — dropping them here silently hides the map.
    ApiClient.get.mockResolvedValue(listFixture());

    const [place] = await getPlaces();

    expect(place.location).toEqual({ lat: 48.8566, lng: 2.3522 });
  });

  it('treats 0/0 coordinates as unknown', async () => {
    ApiClient.get.mockResolvedValue(listFixture({ lat: 0, lng: 0 }));
    const [place] = await getPlaces();
    expect(place.location).toBeNull();
  });

  it('reports no location when the payload omits coordinates', async () => {
    ApiClient.get.mockResolvedValue(listFixture({ lat: undefined, lng: undefined }));
    const [place] = await getPlaces();
    expect(place.location).toBeNull();
  });

  it('leaves iWasHere false — the list response has no such field', async () => {
    ApiClient.get.mockResolvedValue(listFixture());
    const [place] = await getPlaces();
    expect(place.iWasHere).toBe(false);
  });

  it('filters by name and subtitle client-side', async () => {
    ApiClient.get.mockResolvedValue(listFixture());

    expect(await getPlaces({ search: 'par' })).toHaveLength(1);
    expect(await getPlaces({ search: 'fran' })).toHaveLength(1);
    expect(await getPlaces({ search: 'tokyo' })).toHaveLength(0);
  });

  it('leaves the image null when nobody has photographed the place', async () => {
    // This used to be an Unsplash travel shot, so an unphotographed place in Amman
    // showed a stranger's picture of somewhere else beside a real family memory.
    // PlacesScreen draws a monogram from the place's own name instead.
    ApiClient.get.mockResolvedValue({
      places: [{ id: 'p2', name: 'Amman', image: null, years: [] }],
    });

    const [place] = await getPlaces();

    expect(place.image).toBeNull();
  });

  it('still uses the photograph when there is one', async () => {
    // The other half: removing the invented photo must not lose the real one.
    ApiClient.get.mockResolvedValue({
      places: [{ id: 'p1', name: 'Paris', image: item('paris'), years: [] }],
    });

    const [place] = await getPlaces();

    expect(place.image).toEqual(item('paris'));
    expect(place.photos).toEqual([item('paris')]);
  });

});

describe('media-item shape (contracts/media-item.md)', () => {
  it('keeps an unresolved reference as an item with no urls, never a string', async () => {
    ApiClient.get.mockResolvedValue({
      places: [{ id: 'p', name: 'X', image: { id: null, kind: 'photo', thumbnailUrl: null, displayUrl: null, unresolved: true }, years: [] }],
    });
    const [place] = await getPlaces();
    expect(place.image.unresolved).toBe(true);
    expect(place.image.id).toBeNull();
  });

  // I3 / MEDIA-Q3 option A: `originalUrl` is present only for the media's owner. It must
  // survive the adapters onto every list surface, and its absence must stay an absence.
  it('carries the owner-only originalUrl on image, photos and memory media; omitted stays omitted', async () => {
    const mine = item('mine', { originalUrl: 'https://cdn/mine/original.heic' });
    ApiClient.get.mockResolvedValue({ places: [{ id: 'p', name: 'X', image: mine, years: [] }] });
    const [place] = await getPlaces();
    expect(place.image.originalUrl).toBe('https://cdn/mine/original.heic');
    expect(place.photos[0].originalUrl).toBe('https://cdn/mine/original.heic');

    const detail = detailFixture();
    detail.years[0].memories[0].photos = [mine, item('theirs')];
    ApiClient.get.mockResolvedValue(detail);
    const adapted = await getPlace('paris');
    const [mineOut, theirsOut] = adapted.years[0].memories[0].media;
    expect(mineOut.originalUrl).toBe('https://cdn/mine/original.heic');
    expect('originalUrl' in theirsOut).toBe(false);
    expect(adapted.photos.find((p) => p.id === 'mine').originalUrl).toBe('https://cdn/mine/original.heic');
    expect('originalUrl' in adapted.photos.find((p) => p.id === 'theirs')).toBe(false);
  });
});

describe('getPlace', () => {
  it('calls the versioned detail endpoint and adapts the response', async () => {
    ApiClient.get.mockResolvedValue(detailFixture());

    const place = await getPlace('paris');

    expect(ApiClient.get).toHaveBeenCalledTimes(1);
    expect(ApiClient.get.mock.calls[0][0]).toContain('/api/v1/places/paris');

    expect(place.id).toBe('paris');
    expect(place.location).toEqual({ lat: 48.8566, lng: 2.3522 });
    expect(place.iWasHere).toBe(true);
    expect(place.myYears).toEqual([2023]);
    expect(place.years).toHaveLength(2);
    expect(place.years[0].memoryCount).toBe(1);
    expect(place.years[0].memories[0].caption).toBe('Great trip');
    // photos are media items collected from all memories, de-duplicated by media id.
    expect(place.photos).toEqual([item('p1'), item('p2')]);
    expect(place.image).toEqual(item('paris'));
  });

  it('throws when the place is not found', async () => {
    ApiClient.get.mockResolvedValue(null);
    await expect(getPlace('missing')).rejects.toThrow('Place not found');
  });
});

describe('getPlaceYearMemories', () => {
  it('returns adapted memories for the requested year only', async () => {
    ApiClient.get.mockResolvedValue(detailFixture());

    const memories = await getPlaceYearMemories('paris', 2023);

    expect(memories).toHaveLength(1);
    const m = memories[0];
    expect(m.id).toBe('e1');
    expect(m.year).toBe(2023);
    expect(m.author).toEqual({
      id: 'me',
      name: 'Hamid Naser',
      firstName: 'Hamid',
      avatar: 'https://cdn/a.jpg',
    });
    // Media items, not URL strings. `uri` stays as the display copy for the older detail
    // views that read it; it is never the original.
    expect(m.media.map((x) => x.id)).toEqual(['p1', 'p2', 'p1']);
    expect(m.media[0]).toMatchObject({
      id: 'p1',
      kind: 'photo',
      type: 'photo',
      thumbnailUrl: 'https://cdn/p1/grid.webp',
      displayUrl: 'https://cdn/p1/display.webp',
      unresolved: false,
    });
    expect(m.media[0].uri).toBe('https://cdn/p1/display.webp');
    expect(m.isCurrentUser).toBe(true);
  });

  it('returns an empty array for a year with no memories', async () => {
    ApiClient.get.mockResolvedValue(detailFixture());
    expect(await getPlaceYearMemories('paris', 1999)).toEqual([]);
  });
});

describe('getPlaceMemories', () => {
  it('flattens memories across all years', async () => {
    ApiClient.get.mockResolvedValue(detailFixture());
    const memories = await getPlaceMemories('paris');
    expect(memories.map((m) => m.id)).toEqual(['e1', 'e2']);
  });
});

describe('checkIWasHere', () => {
  it('returns the iWasHere flag and my years from the detail', async () => {
    ApiClient.get.mockResolvedValue(detailFixture());
    expect(await checkIWasHere('paris')).toEqual({ iWasHere: true, myYears: [2023] });
  });
});

describe('interview endpoints', () => {
  it('startInterview posts to the interviews endpoint', async () => {
    ApiClient.post.mockResolvedValue({ id: 'i1', status: 'draft' });

    await startInterview({ intervieweeId: 'grandpa', placeId: 'paris', placeName: 'Paris' });

    const [url, body] = ApiClient.post.mock.calls[0];
    expect(url).toContain('/api/v1/interviews');
    expect(body).toMatchObject({ intervieweeId: 'grandpa', placeId: 'paris', placeName: 'Paris' });
  });

  it('updateInterview puts to the interview id endpoint', async () => {
    ApiClient.put.mockResolvedValue({ id: 'i1' });
    await updateInterview('i1', { status: 'complete' });
    const [url, body] = ApiClient.put.mock.calls[0];
    expect(url).toContain('/api/v1/interviews/i1');
    expect(body).toEqual({ status: 'complete' });
  });

  it('completeInterview posts to the complete endpoint', async () => {
    ApiClient.post.mockResolvedValue({ interview: { id: 'i1' }, journalEntryId: null });
    await completeInterview('i1');
    expect(ApiClient.post.mock.calls[0][0]).toContain('/api/v1/interviews/i1/complete');
  });
});

describe('memory request endpoints', () => {
  it('createMemoryRequest posts the request body', async () => {
    ApiClient.post.mockResolvedValue({ id: 'r1', status: 'pending' });

    await createMemoryRequest({
      placeId: 'paris',
      requestedFromId: 'grandpa',
      placeName: 'Paris',
      message: 'Tell me!',
    });

    const [url, body] = ApiClient.post.mock.calls[0];
    expect(url).toContain('/api/v1/memory-requests');
    expect(body).toEqual({
      placeId: 'paris',
      requestedFromId: 'grandpa',
      placeName: 'Paris',
      message: 'Tell me!',
    });
  });

  it('getMemoryRequests builds the type query and returns the requests array', async () => {
    ApiClient.get.mockResolvedValue({ requests: [{ id: 'r1' }], totalCount: 1, pendingCount: 1 });

    const result = await getMemoryRequests({ type: 'received' });

    expect(ApiClient.get.mock.calls[0][0]).toContain('/api/v1/memory-requests?type=received');
    expect(result).toEqual([{ id: 'r1' }]);
  });

  it('getMemoryRequests returns an empty array when the payload is empty', async () => {
    ApiClient.get.mockResolvedValue(null);
    expect(await getMemoryRequests()).toEqual([]);
  });

  it('updateMemoryRequest puts status and memoryId', async () => {
    ApiClient.put.mockResolvedValue({ id: 'r1', status: 'fulfilled' });

    await updateMemoryRequest('r1', { status: 'fulfilled', memoryId: 'entry_1' });

    const [url, body] = ApiClient.put.mock.calls[0];
    expect(url).toContain('/api/v1/memory-requests/r1');
    expect(body).toEqual({ status: 'fulfilled', memoryId: 'entry_1' });
  });
});
