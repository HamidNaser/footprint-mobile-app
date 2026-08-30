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

const detailFixture = () => ({
  id: 'paris',
  name: 'Paris',
  subtitle: 'France',
  image: 'https://cdn/paris.jpg',
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
          photos: ['https://cdn/p1.jpg', 'https://cdn/p2.jpg'],
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
      image: 'https://cdn/paris.jpg',
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
      places: [{ id: 'p1', name: 'Paris', image: 'https://cdn/paris.jpg', years: [] }],
    });

    const [place] = await getPlaces();

    expect(place.image).toBe('https://cdn/paris.jpg');
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
    // photos are collected from all memories, de-duplicated.
    expect(place.photos).toEqual(['https://cdn/p1.jpg', 'https://cdn/p2.jpg']);
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
    expect(m.media).toEqual([
      { uri: 'https://cdn/p1.jpg', type: 'photo' },
      { uri: 'https://cdn/p2.jpg', type: 'photo' },
    ]);
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
