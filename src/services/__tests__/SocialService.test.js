/**
 * SocialService (013 T041) -- what another person's memory keeps on its way into a card.
 *
 * `adaptBlock` is a whitelist, and on `release/1.0` that whitelist drops `location` and would
 * drop `capturedAt`. Those two fields are exactly what the map under a memory is drawn from
 * (FR-022..FR-026) and what its pieces are ordered by (FR-028, FR-029), so without them the
 * map would appear only on the viewer's *own* memories -- US3-1 says it appears for anyone
 * allowed to see the memory (research R10, quickstart M11).
 *
 * Two rules the tests below exist to hold:
 *
 * 1. **The phone passes a location through exactly as the API sent it, and never re-derives
 *    its precision.** The server has already coarsened every location for this particular
 *    viewer, and that server-side coarsening is what satisfies FR-026. A phone that rounded,
 *    renamed or re-shaped the value would either leak precision the viewer may not have or
 *    quietly degrade one the viewer may. Neither is the phone's call to make.
 * 2. **`serverUpdatedAt` is the server's own `updatedAt`, or nothing at all.** It is the
 *    reference the read-time plausibility rule compares a capture moment against (FR-029): a
 *    moment later than the server's last save, beyond a small tolerance, cannot be true and
 *    must not order pieces. Falling back to `Date.now()` would make that threshold depend on
 *    *when this phone happened to look*, so two phones opening the same memory would order it
 *    differently and break SC-007. Absent means "no threshold", which is what the own-memory
 *    path already stores as NULL (`JournalRepository.createFromServer`, research R2/R15).
 *
 * `adaptBlock` is private, so it is exercised the only way the app reaches it: through
 * `adaptEntry`'s `contentBlocks`.
 */

import { adaptEntry } from '../SocialService';

// A location as the Hub returns it (`LocationResponse`): lat, lng, name, address -- already
// coarsened for this viewer. The decimals are deliberate: they are what must survive.
const BUS_STOP = { lat: 51.5009123, lng: -0.1420456, name: 'Elm St', address: 'Elm St, London' };
const PLATFORM = { lat: 51.5101987, lng: -0.1340555, name: 'Central Station', address: null };

const entryWith = (contentBlocks, extra = {}) =>
  adaptEntry({
    id: 'e1',
    journalId: 'j1',
    userId: 'u1',
    date: '2026-11-01',
    createdAt: '2026-11-01T14:40:00.000Z',
    contentBlocks,
    ...extra,
  });

describe('adaptBlock keeps a block\'s place and capture moment', () => {
  it('keeps a block-level location exactly as the API sent it, every decimal and field', () => {
    const [block] = entryWith([
      { id: 'b1', type: 'text', content: 'Rain on the bus windows', location: BUS_STOP },
    ]).contentBlocks;

    expect(block.location).toEqual(BUS_STOP);
  });

  it('keeps a block-level capturedAt as the exact string it was given', () => {
    const [block] = entryWith([
      { id: 'b1', type: 'text', content: 'note', capturedAt: '2026-11-01T14:41:07.120Z' },
    ]).contentBlocks;

    expect(block.capturedAt).toBe('2026-11-01T14:41:07.120Z');
  });

  it('carries null rather than undefined when a block has neither', () => {
    const [block] = entryWith([{ id: 'b1', type: 'text', content: 'note' }]).contentBlocks;

    expect(block.location).toBeNull();
    expect(block.capturedAt).toBeNull();
  });
});

describe('adaptBlock keeps each media item\'s own place and capture moment', () => {
  const photos = [
    {
      id: 'b2',
      type: 'photos',
      location: BUS_STOP,
      media: [
        {
          id: 'm1',
          url: 'https://cdn/a.jpg',
          thumbnailUrl: 'https://cdn/a-grid.webp',
          width: 3024,
          height: 4032,
          location: BUS_STOP,
          capturedAt: '2026-11-01T14:57:02.004Z',
        },
        {
          id: 'm2',
          url: 'https://cdn/b.jpg',
          width: 3024,
          height: 4032,
          location: PLATFORM,
          capturedAt: '2026-11-01T14:58:10.511Z',
        },
      ],
    },
  ];

  it('keeps a per-photo location, so two photos a street apart stay a street apart', () => {
    const [block] = entryWith(photos).contentBlocks;

    expect(block.media[0].location).toEqual(BUS_STOP);
    expect(block.media[1].location).toEqual(PLATFORM);
  });

  it('keeps each photo\'s capturedAt as the exact string it was given', () => {
    const [block] = entryWith(photos).contentBlocks;

    expect(block.media[0].capturedAt).toBe('2026-11-01T14:57:02.004Z');
    expect(block.media[1].capturedAt).toBe('2026-11-01T14:58:10.511Z');
  });

  it('carries null rather than undefined when a media item has neither', () => {
    const [block] = entryWith([
      { id: 'b2', type: 'photos', media: [{ id: 'm1', url: 'https://cdn/a.jpg' }] },
    ]).contentBlocks;

    expect(block.media[0].location).toBeNull();
    expect(block.media[0].capturedAt).toBeNull();
  });

  it('still maps the rest of a block and its media as before', () => {
    const [block] = entryWith([
      {
        id: 'b3',
        type: 'audio',
        content: null,
        duration: 42,
        waveform: [1, 2, 3],
        media: [{ id: 'm3', url: 'https://cdn/c.m4a', duration: 42 }],
      },
    ]).contentBlocks;

    expect(block.id).toBe('b3');
    expect(block.type).toBe('audio');
    expect(block.duration).toBe(42);
    expect(block.waveform).toEqual([1, 2, 3]);
    expect(block.media[0]).toMatchObject({ id: 'm3', serverUrl: 'https://cdn/c.m4a', duration: 42 });
  });
});

describe('adaptBlock is still a whitelist', () => {
  // The two new fields are additions to the list, not the end of it. Anything the Hub adds
  // later has to be mapped deliberately, the way these two were.
  it('drops block fields outside its list', () => {
    const [block] = entryWith([
      {
        id: 'b1',
        type: 'text',
        content: 'note',
        location: BUS_STOP,
        capturedAt: '2026-11-01T14:41:07.120Z',
        createdBy: 'u9',
        internalNote: 'server only',
      },
    ]).contentBlocks;

    expect(block).not.toHaveProperty('createdBy');
    expect(block).not.toHaveProperty('internalNote');
    expect(Object.keys(block).sort()).toEqual(
      ['capturedAt', 'content', 'duration', 'id', 'location', 'media', 'type', 'waveform'].sort()
    );
  });

  it('drops media fields outside its list', () => {
    const [block] = entryWith([
      {
        id: 'b2',
        type: 'photos',
        media: [
          {
            id: 'm1',
            url: 'https://cdn/a.jpg',
            location: BUS_STOP,
            capturedAt: '2026-11-01T14:57:02.004Z',
            unresolved: false,
            storageKey: 'server only',
          },
        ],
      },
    ]).contentBlocks;

    expect(block.media[0]).not.toHaveProperty('storageKey');
    expect(block.media[0]).not.toHaveProperty('unresolved');
    expect(Object.keys(block.media[0]).sort()).toEqual(
      [
        'capturedAt',
        'duration',
        'height',
        'id',
        'location',
        'serverUrl',
        'thumbnailUrl',
        'width',
      ].sort()
    );
  });
});

describe('adaptEntry sets serverUpdatedAt from the server\'s updatedAt', () => {
  it('keeps the server\'s updatedAt verbatim, so every device judges a capture moment alike', () => {
    // Verbatim, and the same shape the own-memory path stores in `server_updated_at`: the
    // ordering rule is normative for every client, so the two routes must feed it one value.
    const entry = entryWith([], { updatedAt: '2026-11-01T15:10:00.000Z' });

    expect(entry.serverUpdatedAt).toBe('2026-11-01T15:10:00.000Z');
  });

  it('leaves serverUpdatedAt undefined when the server sends no updatedAt, never now', () => {
    const entry = entryWith([]);

    expect(entry.serverUpdatedAt).toBeUndefined();
    // Said twice on purpose. `Date.now()` is the tempting fallback and the one that breaks
    // SC-007: it would make the threshold a fact about when this phone looked, so the same
    // memory would order differently on two phones. A number here -- any number -- is wrong.
    expect(typeof entry.serverUpdatedAt).not.toBe('number');
  });

  it('still maps updatedAt itself to a millisecond timestamp, and null when absent', () => {
    expect(entryWith([], { updatedAt: '2026-11-01T15:10:00.000Z' }).updatedAt).toBe(
      new Date('2026-11-01T15:10:00.000Z').getTime()
    );
    expect(entryWith([]).updatedAt).toBeNull();
  });
});
