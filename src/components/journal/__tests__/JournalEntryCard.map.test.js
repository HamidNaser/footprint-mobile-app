/**
 * 013 T049 -- the numbers on the pieces, the lazy map slot, and what a tapped pin finds.
 *
 * `toNumberedPieces` (T046) decided the order, the numbers and the groups, and
 * `MemoryRouteMap` (T048) draws them. This file is about the third party to that agreement:
 * the **card**, which must put the same number on the piece itself, mount the map in the right
 * place and only while the card is on screen, and turn a pin press into a scroll and a
 * highlight (FR-021 to FR-025).
 *
 * Five things this file is deliberately careful about.
 *
 * 1. **A badge is tied to its piece, not merely counted.** Counting badges would pass on a card
 *    that put every number on the first photo. So each badge is found through the piece
 *    container it sits in, and the container is then asked which photograph it holds
 *    (`DerivativeImage`'s `media`). A number on the wrong tile fails here.
 *
 * 2. **SC-007 is the one assertion the whole ordering rule exists for.** The same memory is
 *    built twice -- once as the viewer's own, through `DatabaseService._mapEntryRow`, and once
 *    as somebody else's, through `SocialService.adaptEntry` -- from the same server `updatedAt`,
 *    with one capture moment that cannot be true. Both cards must badge the pieces
 *    **identically**. The two real mappers are used rather than hand-written shapes, because
 *    the field either survives those functions or the map never appears on one of the two
 *    routes (research R10, round-3 M1). The expected numbering is also written out literally,
 *    so the pair cannot agree with each other while both being wrong.
 *
 * 3. **`isVisible` defaults to true, and the default is load-bearing.** `PersonJournalScreen`
 *    and `FamilySummaryScreen` render this card and know nothing about viewability; a default
 *    of false would silently remove the map from both (round-2 M10). So the default is checked
 *    here *and* those two screens are read to confirm they still pass nothing -- the day one of
 *    them starts passing `isVisible`, this file says so rather than quietly covering less.
 *
 * 4. **Lazy means the map is not in the tree at all.** The assertion is on the absence of
 *    `MapView` itself, not just of the heading: a hidden-but-mounted map still costs a native
 *    view per card, which is the performance goal the placeholder exists to meet (research R10
 *    *Lazy rendering*).
 *
 * 5. **A memory with no places keeps its card exactly as it is today (SC-008)** -- which means
 *    no badges, no map *and no placeholder*. A placeholder on such a card would reserve 180
 *    points of empty space under every old text memory in the Journal.
 *
 * `react-native-maps` is native and cannot load under jest, so it is mocked to string elements
 * the way `MemoryRouteMap.test.js` and `NumberedPin.test.js` mock it -- which leaves the real
 * `MemoryRouteMap` and the real `NumberedPin` in the tree, so a pin is pressed here for real
 * rather than by calling the card's own handler.
 */

jest.setTimeout(30000);

jest.mock('react-native-maps', () => ({
  __esModule: true,
  default: 'MapView',
  Marker: 'Marker',
  Polyline: 'Polyline',
  PROVIDER_GOOGLE: 'google',
}));

jest.mock('../../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));
jest.mock('../../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../../media/AudioPlayer', () => ({ AudioPlayer: () => null }));

// `DatabaseService` is reached only for its row mapping, which touches no connection. The
// module it imports is stubbed so importing it opens no database (as
// `displayUrlPersistence.test.js` does).
jest.mock('../../../database', () => ({
  getDatabase: jest.fn(),
  initializeDatabase: jest.fn(),
  getDatabaseStats: jest.fn(),
  clearDatabase: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { JournalEntryCard } from '../JournalEntryCard';
import { EngagementSection } from '../EngagementSection';
import DerivativeImage from '../../media/DerivativeImage';
import {
  MEMORY_ROUTE_MAP_HEIGHT,
  MEMORY_ROUTE_MAP_GAP,
  memoryRouteMapSlotHeight,
} from '../../map/MemoryRouteMap';
import {
  MEMORY_ROUTE_MAP_GAP as WEB_MEMORY_ROUTE_MAP_GAP,
  memoryRouteMapSlotHeight as webSlotHeight,
} from '../../map/MemoryRouteMap.web';
import { PIN_COLOURS } from '../../map/NumberedPin';
import { toNumberedPieces } from '../../../utils/memoryPieces';
import { adaptEntry } from '../../../services/SocialService';
import DatabaseService from '../../../services/DatabaseService';

global.IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Places. Two spots on the same street about 100 m apart, which the 5-decimal merging grid
// keeps as two places; and one within a metre of the bus stop, which shares its marker.
// ---------------------------------------------------------------------------

const BUS = { lat: 51.5001, lng: -0.1401 };
const PLATFORM = { lat: 51.501, lng: -0.1401 };
const KIOSK = { lat: 51.502, lng: -0.1401 };
const BESIDE_THE_BUS = { lat: 51.500104, lng: -0.140097 };

// ---------------------------------------------------------------------------
// Blocks, in the shape the card is handed them
// ---------------------------------------------------------------------------

const text = (content, { at = null, location = null } = {}) => ({
  type: 'text',
  content,
  capturedAt: at,
  location,
});

const photo = (id, { at = null, location = null } = {}) => ({
  id,
  localId: id,
  thumbnailUrl: `https://cdn/${id}/thumb.jpg`,
  url: `https://cdn/${id}/original.jpg`,
  capturedAt: at,
  location,
});

const photos = (items, { location = null } = {}) => ({ type: 'photos', location, media: items });

const audio = (id, { at = null, location = null } = {}) => ({
  type: 'audio',
  location,
  duration: 12,
  media: [{ id, localId: id, localPath: `file:///${id}.m4a`, capturedAt: at, location }],
});

const video = (id, { at = null, location = null } = {}) => ({
  type: 'video',
  location,
  duration: 8,
  media: [{ id, localId: id, url: `https://cdn/${id}.mp4`, capturedAt: at, location, duration: 8 }],
});

const user = { id: 'u1', name: 'Sam' };

const entryWith = (contentBlocks, overrides = {}) => ({
  localId: 'local-1',
  id: 'local-1',
  userId: 'u1',
  visibility: 'private',
  syncStatus: 'synced',
  createdAt: Date.now(),
  contentBlocks,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const trees = [];

/**
 * Awaited: `@expo/vector-icons` resolves its font asynchronously and sets state when it does,
 * which outside `act` would put a warning in this suite's output.
 */
const render = async (entry, props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <JournalEntryCard entry={entry} user={user} currentUserId="u1" {...props} />,
    );
  });
  trees.push(tree);
  return tree;
};

afterEach(() => {
  while (trees.length) {
    const tree = trees.pop();
    try {
      act(() => tree.unmount());
    } catch {
      /* already gone */
    }
  }
  jest.clearAllMocks();
});

/** Every instance in the tree, in render order, so two nodes can be compared for position. */
const inRenderOrder = (tree) => tree.root.findAll(() => true);

/**
 * React Native's `View` is itself a component that renders a host `View` and passes `testID`
 * straight through, so a single test id matches two instances. Only the host element is taken,
 * or every count in this file would be doubled.
 */
const isHost = (node) => typeof node.type === 'string';

const withTestId = (tree, testID) =>
  tree.root.findAll((node) => isHost(node) && node.props?.testID === testID);

const has = (tree, testID) => withTestId(tree, testID).length > 0;

/** The container of each numbered piece, in the order the card renders them. */
const numberedPieces = (tree) =>
  tree.root
    .findAll(
      (node) =>
        isHost(node) &&
        typeof node.props?.testID === 'string' &&
        /^memory-piece-\d+$/.test(node.props.testID),
    )
    .map((node) => ({ number: Number(node.props.testID.slice('memory-piece-'.length)), node }));

/** The numbers the card badges, in the order the pieces are rendered in. */
const badgeNumbersInRenderOrder = (tree) => numberedPieces(tree).map((piece) => piece.number);

/** The badge a piece carries, as a person reads it: the digits inside the circle. */
const badgeLabel = (pieceNode, number) =>
  pieceNode
    .findAll((node) => isHost(node) && node.props?.testID === `piece-badge-${number}`)[0]
    ?.findAllByType(Text)[0]?.props?.children;

/** `React.memo` gives a fiber the inner function as its type, so `findByType` needs that. */
const DerivativeImageComponent = DerivativeImage.type ?? DerivativeImage;

const photographIn = (pieceNode) =>
  pieceNode.findAllByType(DerivativeImageComponent)[0]?.props?.media?.id;

const EngagementComponent = EngagementSection.type ?? EngagementSection;

/**
 * The strings a person reads, with every fragment kept -- including the numbers. `texts` below
 * drops the non-strings, because `TextBlock` renders its content beside a falsy "read more"
 * fragment and joining that would append "false"; the `+N` overlay on a full grid renders
 * `['+', 2]`, which only reads as "+2" if the number is kept.
 */
const rawTexts = (node) =>
  node
    .findAllByType(Text)
    .map((element) =>
      Array.isArray(element.props.children)
        ? element.props.children.filter((child) => child !== false).join('')
        : String(element.props.children ?? ''),
    );

/**
 * Every string the card renders. `TextBlock` renders its content beside a falsy "read more"
 * fragment, so a child may be an array rather than a string.
 */
const texts = (node) =>
  node
    .findAllByType(Text)
    .map((element) =>
      Array.isArray(element.props.children)
        ? element.props.children.filter((child) => typeof child === 'string').join('')
        : element.props.children,
    )
    .filter((value) => typeof value === 'string');

const positionOf = (tree, predicate) => inRenderOrder(tree).findIndex(predicate);

const byTestId = (testID) => (node) => isHost(node) && node.props?.testID === testID;

/** A `MapView` anywhere in the tree -- the native view the placeholder exists to avoid. */
const mapViews = (tree) => tree.root.findAll((node) => node.type === 'MapView');

/** Every marker the map drew, with the digits on it and the coordinate it sits on. */
const pins = (tree) =>
  tree.root
    .findAll((node) => node.type === 'Marker')
    .map((marker) => ({
      label: marker.findAll(byTestId('numbered-pin-label'))[0]?.props?.children,
      coordinate: marker.props.coordinate,
      press: marker.props.onPress,
    }));

/** The pin standing on a place, so a pin and a badge can be compared for the same piece. */
const pinAt = (tree, place) =>
  pins(tree).find(
    (pin) => pin.coordinate?.latitude === place.lat && pin.coordinate?.longitude === place.lng,
  );

/**
 * The parts of the mounted map that take vertical space. Every one of them carries an explicit
 * `lineHeight` or `height`, which is what lets the card reserve exactly the same space while
 * the map is not mounted; `partHeight` refuses a part that carries neither rather than quietly
 * counting it as nothing.
 */
const SLOT_PARTS = [
  'memory-route-map-title',
  'memory-route-map-subtitle',
  'memory-route-map-frame',
  'memory-route-map-without-place',
];

const partHeight = (node) => {
  const style = StyleSheet.flatten(node.props.style) || {};
  const height = style.height ?? style.lineHeight;
  if (height === undefined) {
    throw new Error(
      `"${node.props.testID}" has neither a height nor a lineHeight, so the card cannot reserve its space`,
    );
  }
  return (style.marginTop || 0) + height;
};

/** The height the mounted map really occupies, added up the way React Native would lay it out. */
const mountedSlotHeight = (tree) =>
  SLOT_PARTS.flatMap((id) => withTestId(tree, id)).reduce(
    (total, node) => total + partHeight(node),
    0,
  );

/** The gap above the slot, which the placeholder has to repeat or the pieces above it move. */
const slotGap = (tree) =>
  StyleSheet.flatten(withTestId(tree, 'memory-route-map')[0].props.style).marginTop || 0;

const placeholderStyle = (tree) =>
  StyleSheet.flatten(withTestId(tree, 'memory-route-map-placeholder')[0].props.style);

/** The badge array each media block was handed, for the identity check below. */
const blockBadgeArrays = (tree) =>
  tree.root
    .findAll((node) => typeof node.type === 'function' && node.props?.badges !== undefined)
    .map((node) => node.props.badges);

const pressPin = async (tree, label) => {
  const pin = pins(tree).find((candidate) => candidate.label === label);
  if (!pin) throw new Error(`No pin on the map reads "${label}"`);
  await act(async () => {
    pin.press();
  });
};

/** Report a layout to the card, as React Native would once the view is measured. */
const layout = async (node, y) => {
  await act(async () => {
    node.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 320, height: 100 } } });
  });
};

// ---------------------------------------------------------------------------
// FR-023 -- the same number on the piece as on its pin, and only on a piece with a place
// ---------------------------------------------------------------------------

describe('a piece with a place carries the number its pin carries (FR-023)', () => {
  const blocks = [
    text('on the 34 bus', { at: '2026-11-01T08:41:00.000Z', location: BUS }),
    photos([
      photo('p-platform', { at: '2026-11-01T08:45:00.000Z', location: PLATFORM }),
      photo('p-nowhere', { at: '2026-11-01T08:46:00.000Z' }),
    ]),
    audio('a-kiosk', { at: '2026-11-01T08:50:00.000Z', location: KIOSK }),
  ];
  const entry = entryWith(blocks, { serverUpdatedAt: '2026-11-01T09:00:00.000Z' });

  it('numbers exactly the pieces `toNumberedPieces` numbered, and nothing else', async () => {
    // The rule is one function's, and the card is held to its answer rather than to a copy of
    // it: if the card numbered pieces its own way the two would drift, and a pin would point
    // at a badge that is not there.
    const expected = toNumberedPieces(entry, entry.serverUpdatedAt)
      .pieces.filter((piece) => piece.number != null)
      .map((piece) => piece.number);
    const tree = await render(entry);

    expect(expected).toEqual([1, 2, 3]);
    expect(badgeNumbersInRenderOrder(tree).slice().sort((a, b) => a - b)).toEqual(expected);
  });

  it('puts each number on the piece it belongs to, photo tile by photo tile', async () => {
    const tree = await render(entry);
    const pieces = numberedPieces(tree);

    // 1 is the note, 2 is the photograph taken on the platform, 3 is the voice clip. The
    // photograph is identified by the file it shows, so a badge on the wrong tile fails.
    expect(pieces.map((piece) => piece.number)).toEqual([1, 2, 3]);
    expect(badgeLabel(pieces[0].node, 1)).toBe('1');
    expect(badgeLabel(pieces[1].node, 2)).toBe('2');
    expect(photographIn(pieces[1].node)).toBe('p-platform');
    expect(badgeLabel(pieces[2].node, 3)).toBe('3');
  });

  it('gives the photograph with no place no badge at all', async () => {
    const tree = await render(entry);

    // Both photographs are on screen; only one of them is numbered.
    expect(
      tree.root.findAllByType(DerivativeImageComponent).map((image) => image.props.media.id),
    ).toEqual([
      'p-platform',
      'p-nowhere',
    ]);
    expect(numberedPieces(tree).map((piece) => photographIn(piece.node))).not.toContain('p-nowhere');
    expect(numberedPieces(tree)).toHaveLength(3);
  });

  it('badges every tile of a photo block whose photographs are each somewhere', async () => {
    // "photos: on each tile" (ui-contract). A block is not badged once for all of its
    // photographs: a four-photograph grid taken across a walk is four pins and four tiles.
    const walk = entryWith([
      photos([
        photo('p-bus', { at: '2026-11-01T08:41:00.000Z', location: BUS }),
        photo('p-platform', { at: '2026-11-01T08:45:00.000Z', location: PLATFORM }),
        photo('p-kiosk', { at: '2026-11-01T08:50:00.000Z', location: KIOSK }),
      ]),
    ]);
    const tree = await render(walk);

    expect(
      numberedPieces(tree).map((piece) => [piece.number, photographIn(piece.node)]),
    ).toEqual([
      [1, 'p-bus'],
      [2, 'p-platform'],
      [3, 'p-kiosk'],
    ]);
  });

  it('colours a badge as its pin is coloured, so the two can be matched by eye', async () => {
    // The reason `NumberedPin` exports its colour table: a voice clip's badge must not be one
    // colour on the piece and another on the map (FR-023).
    const tree = await render(entry);
    const pieces = numberedPieces(tree);
    const colourOf = (node, number) =>
      StyleSheet.flatten(node.findAll(byTestId(`piece-badge-${number}`))[0].props.style).backgroundColor;

    expect(colourOf(pieces[0].node, 1)).toBe(PIN_COLOURS.text);
    expect(colourOf(pieces[1].node, 2)).toBe(PIN_COLOURS.photo);
    expect(colourOf(pieces[2].node, 3)).toBe(PIN_COLOURS.audio);
  });

  it('numbers a video piece too', async () => {
    const tree = await render(
      entryWith([
        text('waiting', { at: '2026-11-01T08:41:00.000Z', location: BUS }),
        video('v-platform', { at: '2026-11-01T08:45:00.000Z', location: PLATFORM }),
      ]),
    );

    expect(badgeNumbersInRenderOrder(tree)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// SC-007, FR-029 -- the same memory is numbered identically on both routes
// ---------------------------------------------------------------------------

describe('the same memory is numbered identically whoever is looking (SC-007)', () => {
  // The server's record of the last save. A capture moment later than this plus ten minutes
  // cannot be true, and is unusable for ordering -- but is still stored exactly as recorded.
  const SERVER_UPDATED_AT = '2026-11-01T09:20:00.000Z';
  const LATE_NOTE = '2026-11-01T09:10:00.000Z';
  const EARLY_PHOTO = '2026-11-01T08:41:00.000Z';
  const IMPOSSIBLE = '2099-01-01T00:00:00.000Z';

  /**
   * Stored order: the note, then the photograph, then the voice clip. The photograph was taken
   * first, so it is numbered 1; the voice clip's moment cannot be true, so it takes the
   * photograph's key and stays beside it as 2; the note is 3. Rendered in stored order that
   * reads 3, 1, 2 -- which is the point: a card that ignored the rule and numbered in stored
   * order would read 1, 2, 3.
   */
  const EXPECTED = [3, 1, 2];

  /** The memory as the Hub returns it, for a viewer who may see somebody else's. */
  const fromServer = {
    id: 'server-1',
    journalId: 'journal-1',
    userId: 'u2',
    date: '2026-11-01',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: SERVER_UPDATED_AT,
    visibility: 'family',
    commentsCount: 0,
    author: { id: 'u2', name: 'Alex' },
    contentBlocks: [
      { id: 'b1', type: 'text', content: 'nearly home', capturedAt: LATE_NOTE, location: BUS },
      {
        id: 'b2',
        type: 'photos',
        media: [{ id: 'm1', url: 'https://cdn/m1.jpg', capturedAt: EARLY_PHOTO, location: PLATFORM }],
      },
      {
        id: 'b3',
        type: 'audio',
        duration: 12,
        media: [{ id: 'm2', url: 'https://cdn/m2.m4a', capturedAt: IMPOSSIBLE, location: KIOSK }],
      },
    ],
  };

  /** The same memory as this phone stores its owner's own, read back out of SQLite. */
  const ownRow = {
    local_id: 'local-1',
    server_id: 'server-1',
    journal_id: 'journal-1',
    user_id: 'u1',
    date: '2026-11-01',
    visibility: 'family',
    sync_status: 'synced',
    server_updated_at: SERVER_UPDATED_AT,
    created_at: Date.parse('2026-11-01T09:00:00.000Z'),
    updated_at: Date.parse(SERVER_UPDATED_AT),
    reactions_liked_by: '[]',
    content_blocks: JSON.stringify([
      { type: 'text', content: 'nearly home', capturedAt: LATE_NOTE, location: BUS },
      {
        type: 'photos',
        media: [
          { localId: 'm1', url: 'https://cdn/m1.jpg', capturedAt: EARLY_PHOTO, location: PLATFORM },
        ],
      },
      {
        type: 'audio',
        duration: 12,
        media: [
          { localId: 'm2', localPath: 'file:///m2.m4a', capturedAt: IMPOSSIBLE, location: KIOSK },
        ],
      },
    ]),
  };

  it('keeps the capture moment and the place on both routes, so there is something to compare', async () => {
    // The guard that stops the comparison below being vacuous: if `adaptBlock`'s whitelist
    // dropped either field (research R10) both cards would show stored order and agree about
    // nothing, and the test would still pass.
    const adapted = adaptEntry(fromServer);
    const own = DatabaseService._mapEntryRow(ownRow);

    for (const entry of [adapted, own]) {
      expect(entry.serverUpdatedAt).toBe(SERVER_UPDATED_AT);
      expect(entry.contentBlocks[0].capturedAt).toBe(LATE_NOTE);
      expect(entry.contentBlocks[0].location).toEqual(BUS);
      expect(entry.contentBlocks[1].media[0].capturedAt).toBe(EARLY_PHOTO);
      expect(entry.contentBlocks[2].media[0].capturedAt).toBe(IMPOSSIBLE);
    }
  });

  it('numbers the pieces identically as the viewer’s own and as somebody else’s', async () => {
    const mine = await render(DatabaseService._mapEntryRow(ownRow));
    const theirs = await render(adaptEntry(fromServer), { currentUserId: 'u1' });

    // Written out as well as compared: two cards that were both wrong in the same way would
    // still be equal to each other.
    expect(badgeNumbersInRenderOrder(mine)).toEqual(EXPECTED);
    expect(badgeNumbersInRenderOrder(theirs)).toEqual(badgeNumbersInRenderOrder(mine));
  });

  it('stores the impossible moment exactly as recorded, and only declines to order by it', async () => {
    // Principle III. The value is still on the piece; it is the ordering that ignores it. And
    // the rule's own answer, read off the stored positions, is the numbering the card is held
    // to above: stored piece 1 (the photograph) is 1, stored piece 2 (the voice clip, whose
    // moment cannot be true) stays beside it as 2, and the note is 3.
    const own = DatabaseService._mapEntryRow(ownRow);

    expect(own.contentBlocks[2].media[0].capturedAt).toBe(IMPOSSIBLE);
    expect(
      toNumberedPieces(own, own.serverUpdatedAt).pieces.map((piece) => [
        piece.storedIndex,
        piece.number,
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
      [0, 3],
    ]);
  });

  it('gives somebody else’s memory its map (US3-1)', async () => {
    const tree = await render(adaptEntry(fromServer), { currentUserId: 'u1' });

    expect(has(tree, 'memory-route-map')).toBe(true);
    expect(pins(tree).map((pin) => pin.label).sort()).toEqual(['1', '2', '3']);
  });

  it('puts the number on the pin and the same number on its piece, place by place', async () => {
    // Round-1 item 3, and the whole point of FR-023. Every other case here reads the pin
    // labels as a *set*, which cannot tell 1-2-3 apart from 3-1-2: dropping `serverUpdatedAt`
    // from the `<MemoryRouteMap>` call renumbers the map (the voice clip becomes pin 3) while
    // the badges stay 3-1-2, and a set would not notice. This memory is the one to say it on,
    // because its threshold is not inert: one of its moments cannot be true.
    //
    // Pieces render in stored order -- the note, the photograph, the voice clip -- so the
    // badges beside each place are read off that order.
    const tree = await render(adaptEntry(fromServer), { currentUserId: 'u1' });
    const [note, photograph, voice] = numberedPieces(tree);

    expect([note.number, photograph.number, voice.number]).toEqual([3, 1, 2]);
    expect(pinAt(tree, BUS).label).toBe('3');
    expect(badgeLabel(note.node, 3)).toBe('3');
    expect(pinAt(tree, PLATFORM).label).toBe('1');
    expect(badgeLabel(photograph.node, 1)).toBe('1');
    expect(pinAt(tree, KIOSK).label).toBe('2');
    expect(badgeLabel(voice.node, 2)).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// FR-022, research R10 -- where the map sits, and when it is mounted at all
// ---------------------------------------------------------------------------

describe('the map sits under the pieces and above the reactions (FR-022)', () => {
  const entry = entryWith([
    text('on the 34 bus', { at: '2026-11-01T08:41:00.000Z', location: BUS }),
    text('on the platform', { at: '2026-11-01T08:45:00.000Z', location: PLATFORM }),
  ]);

  it('renders after the last piece and before the engagement row', async () => {
    const tree = await render(entry);

    const lastPiece = positionOf(tree, byTestId('memory-piece-2'));
    const map = positionOf(tree, byTestId('memory-route-map'));
    const engagement = positionOf(tree, (node) => node.type === EngagementComponent);

    expect(lastPiece).toBeGreaterThan(-1);
    expect(engagement).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(lastPiece);
    expect(map).toBeLessThan(engagement);
  });

  it('mounts the map when no one says anything about visibility (round-2 M10)', async () => {
    // `PersonJournalScreen` and `FamilySummaryScreen` render this card and pass no
    // `isVisible`; a default of false would take the map off both of them silently.
    const tree = await render(entry);

    expect(has(tree, 'memory-route-map')).toBe(true);
    expect(mapViews(tree)).toHaveLength(1);
    expect(has(tree, 'memory-route-map-placeholder')).toBe(false);
  });

  it('mounts the map when the list says the card is visible', async () => {
    const tree = await render(entry, { isVisible: true });

    expect(has(tree, 'memory-route-map')).toBe(true);
    expect(mapViews(tree)).toHaveLength(1);
  });

  it('mounts no map at all off screen, and holds its height open instead', async () => {
    // The performance goal: an off-screen card costs no native map view. Asserted on `MapView`
    // rather than on the heading, because a mounted-but-hidden map would still cost one.
    const tree = await render(entry, { isVisible: false });

    expect(mapViews(tree)).toHaveLength(0);
    expect(has(tree, 'memory-route-map')).toBe(false);
    expect(withTestId(tree, 'memory-route-map-placeholder')).toHaveLength(1);
  });

  it('holds open exactly the height the mounted map takes, gap included', async () => {
    // Round-1 item 1. The first version of this reserved the **frame's** height alone, 45 to 70
    // points short of the slot, so a card changed height the instant the list stopped calling
    // it viewable -- pulling everything below it up mid-scroll, which is the jump the
    // placeholder exists to prevent. So the two rendered heights are compared with each other,
    // not with the inner constant: reserving the frame alone fails here now.
    const visible = await render(entry);
    const hidden = await render(entry, { isVisible: false });
    const placeholder = placeholderStyle(hidden);

    expect(placeholder.height).toBe(mountedSlotHeight(visible));
    expect(placeholder.marginTop).toBe(slotGap(visible));
    // The heading alone is more than the frame, so this says the sum is really a sum.
    expect(placeholder.height).toBeGreaterThan(MEMORY_ROUTE_MAP_HEIGHT);
  });

  it('holds open the taller height when the map will also count the pieces with no place', async () => {
    // The slot's height is conditional: `MemoryRouteMap` adds a "k pieces without a place" line
    // when there is one (FR-026), so the placeholder has to be conditional on the same thing.
    const mixed = entryWith([
      text('on the 34 bus', { location: BUS }),
      text('on the platform', { location: PLATFORM }),
      text('somewhere on the way'),
    ]);
    const visible = await render(mixed);
    const hidden = await render(mixed, { isVisible: false });

    expect(has(visible, 'memory-route-map-without-place')).toBe(true);
    expect(placeholderStyle(hidden).height).toBe(mountedSlotHeight(visible));

    // And it is genuinely taller than the same memory without that line.
    const plainHidden = await render(entry, { isVisible: false });
    expect(placeholderStyle(hidden).height).toBeGreaterThan(placeholderStyle(plainHidden).height);
  });

  it('reserves the same height in a browser, so the card lays out identically there', async () => {
    // The card's import of the slot height resolves to `MemoryRouteMap.web.js` on web. If the
    // two files disagreed, a card would be one height on a phone and another in a browser.
    expect(webSlotHeight({ withoutPlace: false })).toBe(
      memoryRouteMapSlotHeight({ withoutPlace: false }),
    );
    expect(webSlotHeight({ withoutPlace: true })).toBe(
      memoryRouteMapSlotHeight({ withoutPlace: true }),
    );
    expect(WEB_MEMORY_ROUTE_MAP_GAP).toBe(MEMORY_ROUTE_MAP_GAP);
  });

  it('keeps the numbers on the pieces while the card is off screen', async () => {
    // The badges are not part of the map, and a piece that loses its number as the card
    // scrolls would flicker its way down the Journal.
    const tree = await render(entry, { isVisible: false });

    expect(badgeNumbersInRenderOrder(tree)).toEqual([1, 2]);
  });

  it('is the only way the two screens that render this card get their map', async () => {
    // Read from the screens themselves, so the default above cannot quietly stop mattering:
    // the day either screen starts passing `isVisible`, this says so.
    const screens = path.join(__dirname, '..', '..', '..', 'screens');
    for (const file of ['PersonJournalScreen.js', 'FamilySummaryScreen.js']) {
      const source = fs.readFileSync(path.join(screens, file), 'utf8');
      expect(source).toMatch(/<JournalEntryCard/);
      expect(source).not.toMatch(/isVisible/);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-025 -- a tapped pin finds its piece
// ---------------------------------------------------------------------------

describe('tapping a pin brings its piece into view and highlights it (FR-025)', () => {
  /** The pieces are at two places, so there are two pins to tell apart. */
  const entry = entryWith([
    text('on the 34 bus', { location: BUS }),
    audio('a-platform', { location: PLATFORM }),
  ]);

  /**
   * The card's measurements, as React Native reports them: the piece list sits 40 points below
   * the top of the card, the note at the top of the list, the voice clip 120 points down it.
   */
  const measure = async (tree) => {
    await layout(withTestId(tree, 'memory-pieces')[0], 40);
    await layout(withTestId(tree, 'memory-piece-1')[0], 0);
    await layout(withTestId(tree, 'memory-piece-2')[0], 120);
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks to be scrolled to the piece’s measured offset', async () => {
    const onRequestScrollTo = jest.fn();
    const tree = await render(entry, { onRequestScrollTo });
    await measure(tree);

    await pressPin(tree, '2');

    expect(onRequestScrollTo.mock.calls).toEqual([[160]]);
  });

  it('measures each piece separately, so a different pin finds a different place', async () => {
    const onRequestScrollTo = jest.fn();
    const tree = await render(entry, { onRequestScrollTo });
    await measure(tree);

    await pressPin(tree, '1');

    expect(onRequestScrollTo.mock.calls).toEqual([[40]]);
  });

  it('asks for nothing until the piece has been measured, rather than guessing an offset', async () => {
    // A guessed offset scrolls the Journal somewhere arbitrary, which is worse than not
    // moving: the person pressed a pin and the memory jumped away from them.
    const onRequestScrollTo = jest.fn();
    const tree = await render(entry, { onRequestScrollTo });

    await pressPin(tree, '2');

    expect(onRequestScrollTo).not.toHaveBeenCalled();
  });

  it('highlights the piece, and stops highlighting it after 1.5 s', async () => {
    const tree = await render(entry, { onRequestScrollTo: jest.fn() });
    await measure(tree);

    await pressPin(tree, '2');
    expect(has(tree, 'piece-highlight-2')).toBe(true);
    expect(has(tree, 'piece-highlight-1')).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(1400);
    });
    expect(has(tree, 'piece-highlight-2')).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(has(tree, 'piece-highlight-2')).toBe(false);
  });

  it('highlights nothing before a pin is pressed', async () => {
    const tree = await render(entry, { onRequestScrollTo: jest.fn() });
    await measure(tree);

    expect(has(tree, 'piece-highlight-1')).toBe(false);
    expect(has(tree, 'piece-highlight-2')).toBe(false);
  });

  it('highlights every piece of a merged marker and scrolls to the first', async () => {
    // Two pieces within a metre of each other share one marker, which says "2" rather than a
    // number (round-2 M1). Pressing it has to find both of them.
    const onRequestScrollTo = jest.fn();
    const together = entryWith([
      text('on the 34 bus', { location: BUS }),
      audio('a-beside', { location: BESIDE_THE_BUS }),
    ]);
    const tree = await render(together, { onRequestScrollTo });
    await layout(withTestId(tree, 'memory-pieces')[0], 40);
    await layout(withTestId(tree, 'memory-piece-1')[0], 0);
    await layout(withTestId(tree, 'memory-piece-2')[0], 120);

    // One marker, holding both numbers, labelled with how many there are.
    expect(pins(tree).map((pin) => pin.label)).toEqual(['2']);

    await pressPin(tree, '2');

    expect(has(tree, 'piece-highlight-1')).toBe(true);
    expect(has(tree, 'piece-highlight-2')).toBe(true);
    expect(onRequestScrollTo.mock.calls).toEqual([[40]]);
  });

  it('moves the highlight to the piece pressed next, rather than keeping both lit', async () => {
    const tree = await render(entry, { onRequestScrollTo: jest.fn() });
    await measure(tree);

    await pressPin(tree, '1');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await pressPin(tree, '2');

    expect(has(tree, 'piece-highlight-1')).toBe(false);
    expect(has(tree, 'piece-highlight-2')).toBe(true);

    // And the second press gets its own 1.5 s, rather than inheriting what was left of the
    // first press's.
    await act(async () => {
      jest.advanceTimersByTime(1400);
    });
    expect(has(tree, 'piece-highlight-2')).toBe(true);
  });

  it('asks for no scroll when the card is rendered by a screen that cannot scroll it', async () => {
    // `PersonJournalScreen` and `FamilySummaryScreen` pass no `onRequestScrollTo`. The press
    // must still highlight, and must not throw.
    const tree = await render(entry);
    await measure(tree);

    await pressPin(tree, '2');

    expect(has(tree, 'piece-highlight-2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SC-008 -- a memory saved before this feature
// ---------------------------------------------------------------------------

describe('a memory saved before this feature (SC-008)', () => {
  it('shows its map in stored order when it has places and no capture moments', async () => {
    // Nothing on it carries a time, and the phone has no server `updatedAt` for it either, so
    // the order is the order it is stored in -- which is FR-028 and US3-6.
    const old = entryWith([
      text('the kiosk', { location: KIOSK }),
      text('the platform', { location: PLATFORM }),
      text('the bus stop', { location: BUS }),
    ]);
    const tree = await render(old);

    expect(old.serverUpdatedAt).toBeUndefined();
    expect(badgeNumbersInRenderOrder(tree)).toEqual([1, 2, 3]);
    expect(has(tree, 'memory-route-map')).toBe(true);
  });

  it('renders exactly as before when no piece has a place: no badges, no map, no gap', async () => {
    const old = entryWith([
      text('walked to the station'),
      photos([photo('p1'), photo('p2')]),
      audio('a1'),
    ]);
    const tree = await render(old);

    expect(numberedPieces(tree)).toHaveLength(0);
    expect(has(tree, 'memory-route-map')).toBe(false);
    expect(mapViews(tree)).toHaveLength(0);
    // The card itself is untouched: the words are still there and the reactions still render.
    expect(texts(tree.root)).toContain('walked to the station');
    expect(tree.root.findAll((node) => node.type === EngagementComponent)).toHaveLength(1);
  });

  it('holds no height open for a map it is never going to show', async () => {
    // The placeholder is the map's height, so an old text memory off screen would otherwise
    // reserve 180 points of blank space under every one of them.
    const old = entryWith([text('walked to the station')]);
    const tree = await render(old, { isVisible: false });

    expect(has(tree, 'memory-route-map-placeholder')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round-1 item 2 — a photo or video grid that cannot show every tile
// ---------------------------------------------------------------------------

/**
 * `toNumberedPieces` numbers **every** media item with a place, but the card's grid has shown
 * at most four tiles since long before this feature, the fourth carrying a `+N` overlay. So a
 * six-photograph block at six places draws pins 1 to 6 while the card has four tiles — and the
 * first version of this task left pins 5 and 6 pressing nothing at all: no badge, no
 * `onLayout`, hence no offset, so `handlePinPress` found nothing to scroll to and nothing lit.
 * A dead control.
 *
 * The ruling: the tile standing in for the rest **answers for their numbers too**, so a hidden
 * piece's pin brings its block into view and lights that tile. It is the closest reading of
 * FR-025 the pre-existing four-tile layout allows, and it beats a tap that looks broken. The
 * layout itself is not changed.
 *
 * What it cannot do is show a hidden piece's badge, because the piece is not on screen to carry
 * one — a limitation of the grid, not of the numbering, and the `+N` overlay is what says there
 * is more behind it.
 */
describe('a grid that cannot show every tile still answers for every pin (FR-025)', () => {
  // Six distinct places along one street: 0.0009 degrees apart is about 100 m, which the
  // 5-decimal merging grid keeps as six separate markers.
  const SIX_PLACES = [
    { lat: 51.5001, lng: -0.1401 },
    { lat: 51.501, lng: -0.1401 },
    { lat: 51.5019, lng: -0.1401 },
    { lat: 51.5028, lng: -0.1401 },
    { lat: 51.5037, lng: -0.1401 },
    { lat: 51.5046, lng: -0.1401 },
  ];

  const six = entryWith([
    photos(
      SIX_PLACES.map((location, index) =>
        photo(`p${index + 1}`, { at: `2026-11-01T08:4${index}:00.000Z`, location }),
      ),
    ),
  ]);

  /** The card as React Native would measure it: the list, the block in it, the fourth tile. */
  const measure = async (tree) => {
    await layout(withTestId(tree, 'memory-pieces')[0], 40);
    await layout(withTestId(tree, 'memory-piece-block-0')[0], 10);
    await layout(withTestId(tree, 'memory-piece-4')[0], 98);
  };

  it('numbers all six pieces on the map, and badges the four tiles it can show', async () => {
    const tree = await render(six);

    expect(pins(tree).map((pin) => pin.label).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(badgeNumbersInRenderOrder(tree)).toEqual([1, 2, 3, 4]);
    expect(rawTexts(tree.root)).toContain('+2');
  });

  it('brings the block into view and lights the tile when a hidden piece’s pin is pressed', async () => {
    const onRequestScrollTo = jest.fn();
    const tree = await render(six, { onRequestScrollTo });
    await measure(tree);

    await pressPin(tree, '6');

    // The fourth tile's own offset: the piece list 40 down the card, the block 10 down the
    // list, the tile 98 down the block.
    expect(onRequestScrollTo.mock.calls).toEqual([[148]]);
    expect(has(tree, 'piece-highlight-4')).toBe(true);
  });

  it('answers for every hidden piece, not only the last one', async () => {
    const onRequestScrollTo = jest.fn();
    const tree = await render(six, { onRequestScrollTo });
    await measure(tree);

    await pressPin(tree, '5');

    expect(onRequestScrollTo.mock.calls).toEqual([[148]]);
    expect(has(tree, 'piece-highlight-4')).toBe(true);
  });

  it('sums the three levels of a photo tile’s offset, not the tile’s own alone', async () => {
    // The visible tiles measure the same way, which is what makes the case above meaningful:
    // the offset is the piece list's, plus the block's in it, plus the tile's in the block.
    const onRequestScrollTo = jest.fn();
    const tree = await render(six, { onRequestScrollTo });
    await layout(withTestId(tree, 'memory-pieces')[0], 40);
    await layout(withTestId(tree, 'memory-piece-block-0')[0], 10);
    await layout(withTestId(tree, 'memory-piece-1')[0], 0);

    await pressPin(tree, '1');

    expect(onRequestScrollTo.mock.calls).toEqual([[50]]);
  });

  it('leaves a grid of four or fewer alone: each tile answers only for itself', async () => {
    const onRequestScrollTo = jest.fn();
    const four = entryWith([
      photos(
        SIX_PLACES.slice(0, 4).map((location, index) =>
          photo(`p${index + 1}`, { at: `2026-11-01T08:4${index}:00.000Z`, location }),
        ),
      ),
    ]);
    const tree = await render(four, { onRequestScrollTo });
    await layout(withTestId(tree, 'memory-pieces')[0], 40);
    await layout(withTestId(tree, 'memory-piece-block-0')[0], 0);
    await layout(withTestId(tree, 'memory-piece-4')[0], 98);
    await layout(withTestId(tree, 'memory-piece-3')[0], 0);

    await pressPin(tree, '3');

    expect(rawTexts(tree.root)).not.toContain('+0');
    expect(onRequestScrollTo.mock.calls).toEqual([[40]]);
    expect(has(tree, 'piece-highlight-3')).toBe(true);
    expect(has(tree, 'piece-highlight-4')).toBe(false);
  });

  it('does the same for a video grid', async () => {
    const onRequestScrollTo = jest.fn();
    const sixVideos = entryWith([
      {
        type: 'video',
        location: null,
        media: SIX_PLACES.map((location, index) => ({
          id: `v${index + 1}`,
          localId: `v${index + 1}`,
          url: `https://cdn/v${index + 1}.mp4`,
          capturedAt: `2026-11-01T08:4${index}:00.000Z`,
          location,
          duration: 8,
        })),
      },
    ]);
    const tree = await render(sixVideos, { onRequestScrollTo });
    await layout(withTestId(tree, 'memory-pieces')[0], 40);
    await layout(withTestId(tree, 'memory-piece-block-0')[0], 0);
    await layout(withTestId(tree, 'memory-piece-4')[0], 104);

    await pressPin(tree, '6');

    expect(badgeNumbersInRenderOrder(tree)).toEqual([1, 2, 3, 4]);
    expect(onRequestScrollTo.mock.calls).toEqual([[144]]);
    expect(has(tree, 'piece-highlight-4')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Round-1 item 7 — the badge arrays a media block is handed
// ---------------------------------------------------------------------------

describe('the badges handed to a media block (round-1 item 7)', () => {
  it('are the same array across a re-render, so the block’s memo still holds', async () => {
    // A fresh array per render made `PhotoBlock`'s `memo` useless, so lighting one piece
    // re-rendered every photo grid in the card. Built once, with the numbering.
    const tree = await render(
      entryWith([
        photos([
          photo('p1', { at: '2026-11-01T08:41:00.000Z', location: BUS }),
          photo('p2', { at: '2026-11-01T08:45:00.000Z', location: PLATFORM }),
        ]),
      ]),
      { onRequestScrollTo: jest.fn() },
    );

    const before = blockBadgeArrays(tree);
    expect(before).toHaveLength(1);
    expect(before[0].map((badge) => badge?.number)).toEqual([1, 2]);

    await pressPin(tree, '1');

    expect(blockBadgeArrays(tree)[0]).toBe(before[0]);
  });
});
