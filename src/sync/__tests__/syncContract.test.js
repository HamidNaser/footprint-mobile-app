/**
 * Every field name this phone sends and reads must exist in the backend's contract record.
 *
 * Five times this app named a field one thing and the Hub named it another, and nothing
 * noticed. Every failure was silent -- a value was sent, nothing received it, no error
 * anywhere -- and they survived months:
 *
 *   - the upload-correlation label (`localId` here, `clientId` there): memories duplicated
 *     on every retry
 *   - `updated` being a list of objects where this app iterated strings: edits re-sent
 *     forever, never confirmed
 *   - the fields on a refusal: refusals silently discarded, sync reported clean
 *   - no field for location sharing: a privacy control that did nothing
 *   - no field for date precision: "sometime in 1998" stored as an exact day
 *
 * The only guard was a code comment asking people to be careful.
 *
 * `src/sync/contract/sync-contract.record.json` is the Hub's own account of its sync
 * contract -- generated in the backend repository from the real DTOs using the production
 * JSON serializer, then copied here. It is not written by hand on either side, which is the
 * whole point: a hand-written list in each repository would have caught none of the five,
 * because each side passes against its own list and the two can disagree forever.
 *
 * These tests drive the REAL serialiser and the REAL sync paths -- `JournalApi.batchSync`,
 * `JournalApi.getChanges`, `SyncEngine._pushLocalChanges` -- and check the field names those
 * actually produce and consume. Deliberately not a transcription of them: the bug class here
 * is precisely "the code and the description of the code disagree", so a test that reads a
 * list someone typed out would reproduce the problem rather than catch it.
 *
 * WHAT THIS CANNOT DO. It cannot tell whether the vendored record is current. The two test
 * suites do not talk to each other, so if the Hub's contract changes and nobody copies the
 * record over, this keeps passing against a stale copy. That residual risk is much smaller
 * than what we suffered and different in kind: creating a mismatch now takes a deliberate,
 * reviewable edit to the record file, rather than happening silently because nobody wrote
 * the agreement down.
 */

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

jest.mock('../NetworkMonitor', () => ({
  NetworkMonitor: {
    initialize: jest.fn(),
    isOnline: jest.fn().mockReturnValue(true),
    isOffline: jest.fn().mockReturnValue(false),
    shouldSync: jest.fn().mockResolvedValue(true),
    addConnectionListener: jest.fn(),
    destroy: jest.fn(),
  },
  NetworkState: { ONLINE: 'online', OFFLINE: 'offline', UNKNOWN: 'unknown' },
}));

jest.mock('../SyncQueue', () => ({
  SyncOperationType: {
    CREATE_ENTRY: 'create_entry',
    UPDATE_ENTRY: 'update_entry',
    DELETE_ENTRY: 'delete_entry',
    UPLOAD_MEDIA: 'upload_media',
    DELETE_MEDIA: 'delete_media',
  },
  OperationStatus: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CONFLICT: 'conflict',
  },
  SyncQueue: {
    getPendingOperations: jest.fn(),
    markInProgress: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markConflict: jest.fn(),
  },
}));

jest.mock('../ConflictResolver', () => ({
  ConflictResolver: {
    processServerConflicts: jest.fn(),
    resolveConflict: jest.fn(),
    detectConflict: jest.fn().mockReturnValue(null),
  },
  ResolutionResult: {
    NO_CONFLICT: 'no_conflict',
    REQUIRES_MANUAL: 'requires_manual',
    SERVER_REFUSED: 'server_refused',
  },
}));

jest.mock('../../api/MediaApi', () => ({ MediaApi: {} }));

jest.mock('../../repositories', () => ({
  JournalRepository: {
    markSynced: jest.fn(),
    getById: jest.fn(),
    getByServerId: jest.fn(),
    hardDelete: jest.fn(),
    createFromServer: jest.fn(),
    applyServerUpdate: jest.fn(),
  },
}));

jest.mock('../../services/JournalService', () => ({
  JournalService: { on: jest.fn(), emit: jest.fn(), _queueMediaForUpload: jest.fn() },
}));

jest.mock('../../services/SettingsService', () => ({
  SettingsService: {
    getStorageMode: jest.fn().mockResolvedValue('hybrid'),
    getDefaultJournalId: jest.fn().mockResolvedValue('journal-1'),
  },
  StorageMode: { LOCAL_ONLY: 'local_only', HYBRID: 'hybrid', CLOUD: 'cloud' },
}));

jest.mock('../../services/DatabaseService', () => ({
  DatabaseService: {
    getEntryByLocalId: jest.fn().mockResolvedValue(null),
    getSyncMetadata: jest.fn().mockResolvedValue(null),
    setSyncMetadata: jest.fn(),
    getPendingMediaUploads: jest.fn().mockResolvedValue([]),
    getPendingSyncEntries: jest.fn().mockResolvedValue([]),
    getMediaQueue: jest.fn().mockResolvedValue([]),
    updateMediaQueueItem: jest.fn(),
    updateEntry: jest.fn(),
  },
}));

const record = require('../contract/sync-contract.record.json');

const { JournalApi } = require('../../api/JournalApi');
const { SyncEngine } = require('../SyncEngine');
const { ApiClient } = require('../../api/ApiClient');
const { SyncQueue, SyncOperationType } = require('../SyncQueue');
const { ConflictResolver } = require('../ConflictResolver');
const { JournalRepository } = require('../../repositories');

// ============================================================
// Reading the record
// ============================================================

/** Field names the Hub accepts or sends on a given contract type. */
function fieldsOf(typeName) {
  const type = record.types[typeName];
  if (!type) {
    throw new Error(
      `The contract record has no type "${typeName}". Either the backend stopped recording `
        + 'it, or this test is asking about something that was never part of the sync contract.'
    );
  }

  return new Map(type.properties.map((p) => [p.name, p]));
}

/**
 * Fields this app deliberately sends although the Hub does not bind them.
 *
 * Every one is an EXISTING divergence that predates this test, listed so it is visible rather
 * than silent -- not an exemption anyone should grow. A field not in the record and not named
 * here fails the test, which is the point: adding to this list is a deliberate, reviewable
 * edit, and a RENAMED field (`clientId` becoming `localId` again, say) is not covered by any
 * entry here and still fails.
 *
 * These are worth fixing on their own merits -- `mood`, `weather`, `tags` and `title` are
 * collected on the device and thrown away by the server, which is the same bug class this
 * record exists to stop -- but fixing them is a product decision, not a test change.
 */
const SENT_BUT_NOT_BOUND_BY_THE_HUB = {
  'CreateSyncEntry.title': 'No Title on any Hub journal DTO. Collected locally, silently dropped.',
  'CreateSyncEntry.mood': 'No Mood on any Hub journal DTO. Collected locally, silently dropped.',
  'CreateSyncEntry.weather': 'No Weather on any Hub journal DTO. Collected locally, silently dropped.',
  'CreateSyncEntry.tags': 'No Tags on any Hub journal DTO. Collected locally, silently dropped.',
  'CreateSyncEntry.createdAt': 'The Hub stamps its own CreatedAt; the sent value is ignored.',
  'CreateSyncEntry.updatedAt': 'The Hub stamps its own UpdatedAt; the sent value is ignored.',

  'UpdateSyncEntry.title': 'As above.',
  'UpdateSyncEntry.mood': 'As above.',
  'UpdateSyncEntry.weather': 'As above.',
  'UpdateSyncEntry.tags': 'As above.',
  'UpdateSyncEntry.createdAt': 'As above.',
  'UpdateSyncEntry.updatedAt': 'As above.',
  'UpdateSyncEntry.date': 'CreateSyncEntry has Date; UpdateSyncEntry does not. Sent and ignored.',
  'UpdateSyncEntry.journalId': 'An update cannot move an entry between journals. Sent and ignored.',
  'UpdateSyncEntry.clientId': 'Bound by the Hub, but _formatEntryForApi sends it on updates too.',

  'CreateJournalEntryRequest.title': 'As above.',
  'CreateJournalEntryRequest.mood': 'As above.',
  'CreateJournalEntryRequest.weather': 'As above.',
  'CreateJournalEntryRequest.tags': 'As above.',
  'CreateJournalEntryRequest.createdAt': 'As above.',
  'CreateJournalEntryRequest.updatedAt': 'As above.',
  'CreateJournalEntryRequest.clientId':
    'CreateJournalEntryRequest has no ClientId -- that is why the single-entry fallback cannot '
    + 'deduplicate a create, and why SyncEngine holds creates back unless the batch provably '
    + 'never landed. Sent and ignored.',

  'UpdateJournalEntryRequest.title': 'As above.',
  'UpdateJournalEntryRequest.mood': 'As above.',
  'UpdateJournalEntryRequest.weather': 'As above.',
  'UpdateJournalEntryRequest.tags': 'As above.',
  'UpdateJournalEntryRequest.createdAt': 'As above.',
  'UpdateJournalEntryRequest.updatedAt': 'As above.',
  'UpdateJournalEntryRequest.clientId': 'As above.',
  'UpdateJournalEntryRequest.date': 'As above.',
  'UpdateJournalEntryRequest.journalId': 'As above.',
  'UpdateJournalEntryRequest.lastModifiedAt':
    'UpdateSyncEntry carries LastModifiedAt; UpdateJournalEntryRequest does not. updateEntry '
    + 'adds it for conflict detection the PATCH endpoint does not implement. Sent and ignored.',
};

/**
 * Fields this app reads off a server payload that the Hub does not send on a sync path.
 */
const READ_BUT_NOT_SENT_BY_THE_HUB = {
  'JournalEntryResponse._id':
    'A raw Mongo id, read as a fallback behind `id` in JournalRepository.createFromServer. The '
    + 'Hub serialises ObjectId as a string into `id` and never sends `_id`, so the fallback is '
    + 'dead on this path. Harmless, and left alone.',
};

// ============================================================
// Checking a payload against the record
// ============================================================

/**
 * Walk a payload this app actually produced and report every field the record does not have.
 *
 * `undefined` values are skipped, because JSON.stringify drops them -- they never reach the
 * wire, so the Hub never sees them and they cannot disagree with anything.
 */
function divergencesIn(payload, typeName, path = typeName) {
  const problems = [];
  const fields = fieldsOf(typeName);

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;

    const field = fields.get(key);

    if (!field) {
      const allowed = SENT_BUT_NOT_BOUND_BY_THE_HUB[`${typeName}.${key}`];
      if (!allowed) {
        problems.push(
          `${path}.${key}: this app sends it; the Hub's record has no such field on `
            + `${typeName}. Known fields: ${[...fields.keys()].sort().join(', ')}`
        );
      }
      continue;
    }

    problems.push(...shapeDivergences(value, field, `${path}.${key}`));
  }

  return problems;
}

function shapeDivergences(value, field, path) {
  const { shape } = field;

  if (value === null) {
    // A null is a null on any shape; the record's `omittedWhenNull` governs the Hub's own
    // writing, not what a client may send.
    return [];
  }

  const arrayMatch = /^array<(.+)>$/.exec(shape);
  if (arrayMatch) {
    if (!Array.isArray(value)) {
      return [`${path}: the record says ${shape}; this app sends ${describeValue(value)}`];
    }

    const problems = [];
    value.forEach((element, index) => {
      problems.push(
        ...shapeDivergences(element, { shape: arrayMatch[1] }, `${path}[${index}]`)
      );
    });
    return problems;
  }

  const objectMatch = /^object:(.+)$/.exec(shape);
  if (objectMatch) {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return [`${path}: the record says ${shape}; this app sends ${describeValue(value)}`];
    }
    return divergencesIn(value, objectMatch[1], path);
  }

  return primitiveDivergences(value, shape, path);
}

function primitiveDivergences(value, shape, path) {
  const mismatch = () => [
    `${path}: the record says ${shape}; this app sends ${describeValue(value)} (${JSON.stringify(value)})`,
  ];

  switch (shape) {
    case 'string':
      return typeof value === 'string' ? [] : mismatch();

    case 'boolean':
      return typeof value === 'boolean' ? [] : mismatch();

    case 'integer':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? [] : mismatch();

    case 'date-time':
      // An instant. A string the Hub can parse, or epoch milliseconds.
      if (typeof value === 'number') return [];
      return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? [] : mismatch();

    case 'civil-date(CivilDateJsonConverter)':
      // A day, NOT an instant. The converter's whole reason for existing: naive timezone
      // handling on a date-only value has caused production bugs here, so a full ISO instant
      // in this position is a defect even though it would parse.
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? []
        : [
            `${path}: the record says a civil date (YYYY-MM-DD, a day not an instant); this app `
              + `sends ${JSON.stringify(value)}`,
          ];

    default:
      if (shape.startsWith('enum<')) {
        const members = shape.slice('enum<'.length, -1).split('|');
        return members.includes(value)
          ? []
          : [`${path}: the record allows ${members.join(', ')}; this app sends ${JSON.stringify(value)}`];
      }

      // An unrecognised shape token means the record format moved and this test did not.
      // Said out loud rather than passing by default.
      return [`${path}: this test does not understand the recorded shape "${shape}"`];
  }
}

// NOT named `describe`: that shadows jest's global, so every test block below would call this
// instead of registering a test and the whole suite would silently report zero tests. It does
// not error -- jest just says the file contains no tests. Cost a while to find.
function describeValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

// ============================================================
// Fixtures
// ============================================================

/**
 * A local entry with every field this app could populate, so the real serialiser is exercised
 * at full width rather than on whichever subset a smaller fixture happens to carry.
 */
function fullyPopulatedLocalEntry() {
  return {
    local_id: 'local-1',
    serverId: 'srv-1',
    journal_id: 'journal-1',
    date: '1998-06-14',
    date_precision: 'year',
    title: 'A title the Hub has nowhere to put',
    visibility: 'custom',
    sharedWith: ['friend-1'],
    mood: 'happy',
    weather: 'rain',
    tags: ['holiday'],
    location: { lat: 51.5, lng: -0.12, name: 'London' },
    locationSharing: 'private',
    content_blocks: [
      {
        type: 'photos',
        content: 'what we did',
        duration: 12,
        location: { lat: 51.5, lng: -0.12, name: 'London' },
        media: [
          {
            id: 'media-1',
            url: 'https://example.invalid/a.jpg',
            thumbnailUrl: 'https://example.invalid/a-thumb.jpg',
            width: 100,
            height: 200,
          },
        ],
      },
    ],
    created_at: '2026-10-17T09:00:00.000Z',
    updated_at: '2026-10-17T09:30:00.000Z',
  };
}

/** A server entry shaped exactly as the record describes JournalEntryResponse. */
function serverEntryFromRecord(overrides = {}) {
  return {
    id: 'srv-1',
    journalId: 'journal-1',
    userId: 'user-1',
    date: '1998-06-14',
    datePrecision: 'year',
    contentBlocks: [],
    location: { lat: 51.5, lng: -0.12, name: 'London', address: null },
    locationSharing: 'private',
    visibility: 'private',
    sharedWith: [],
    reactions: { likes: 0, likedByMe: false },
    commentsCount: 0,
    needsStory: false,
    createdAt: '2026-10-17T09:00:00.000Z',
    updatedAt: '2026-10-17T09:30:00.000Z',
    ...overrides,
  };
}

/**
 * What the posted body would look like on the wire: `undefined` dropped, exactly as
 * JSON.stringify would. Without this, a key the app sets to `undefined` reads as present.
 */
function asSentOnTheWire(payload) {
  return JSON.parse(JSON.stringify(payload));
}

beforeEach(() => {
  jest.clearAllMocks();
  ConflictResolver.processServerConflicts.mockResolvedValue([]);
  ConflictResolver.detectConflict.mockReturnValue(null);
});

// ============================================================
// The record itself
// ============================================================

describe('the vendored contract record', () => {
  it('says plainly that it is a copy, and names the backend commit it came from', () => {
    // A copy with no provenance is undiagnosable: nobody can tell whether it is current, and
    // the stale-copy failure becomes invisible again. Copying the backend's file over this one
    // verbatim loses this block, so this test is what forces the step to be completed.
    expect(record._provenance).toBeDefined();
    expect(record._provenance.isCopy).toBe(true);
    expect(record._provenance.sourceRepository).toBe('footprint-backend');
    expect(record._provenance.takenFromBackendCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(record._provenance.generatedBy).toContain('SyncContractRecordTests');
  });

  it('covers both halves of sync, push and pull', () => {
    // The pull half is easy to forget -- it has no request body of its own -- and forgetting it
    // would leave `entries` / `deletedIds` / `serverTimestamp` / `hasMore` unwritten.
    expect(Object.keys(record.types)).toEqual(
      expect.arrayContaining([
        'BatchSyncRequest',
        'BatchSyncResponse',
        'CreateSyncEntry',
        'UpdateSyncEntry',
        'SyncResultItem',
        'SyncConflict',
        'SyncChangesResponse',
        'CreateJournalEntryRequest',
        'UpdateJournalEntryRequest',
        'JournalEntryResponse',
      ])
    );
  });

  it('was generated with the camelCase policy this app assumes', () => {
    // Every wire name this app uses is camelCase because the Hub's policy makes it so. If that
    // policy ever changed, every field name here would be wrong at once, and the per-field
    // checks below would bury that under a hundred failures instead of stating it.
    expect(record.serializerOptions.propertyNamingPolicy).toBe('camelCase');

    // And the Hub omits nulls rather than writing them -- which is why the batch-reply
    // correlation guard treats an absent `clientId` as the normal case, not an exotic one.
    expect(record.serializerOptions.defaultIgnoreCondition).toBe('WhenWritingNull');
  });
});

// ============================================================
// What this app SENDS
// ============================================================

describe('every field this app sends exists in the record', () => {
  it('batch sync: the body of POST /journals/sync', async () => {
    ApiClient.post.mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
      conflicts: [],
      serverTimestamp: '2026-10-17T09:00:00.000Z',
    });

    const entry = fullyPopulatedLocalEntry();

    // The real JournalApi, not a description of it.
    await JournalApi.batchSync({
      creates: [entry],
      updates: [{ entry, serverId: 'srv-1', lastModifiedAt: entry.updated_at }],
      deletes: ['srv-2'],
    });

    const [, posted] = ApiClient.post.mock.calls[0];
    const body = asSentOnTheWire(posted);

    // The root walk already recurses into creates/updates via the recorded shapes. Deduped on
    // the message rather than reported twice, so a single renamed field reads as one problem.
    const problems = [...new Set(divergencesIn(body, 'BatchSyncRequest'))];

    expect(problems).toEqual([]);
  });

  it('single-entry create: the body of POST /journals/entries', async () => {
    ApiClient.post.mockResolvedValue({ id: 'srv-1' });

    await JournalApi.createEntry(fullyPopulatedLocalEntry());

    const [, posted] = ApiClient.post.mock.calls[0];
    expect(divergencesIn(asSentOnTheWire(posted), 'CreateJournalEntryRequest')).toEqual([]);
  });

  it('single-entry update: the body of PATCH /journals/entries/{id}', async () => {
    ApiClient.patch.mockResolvedValue({ id: 'srv-1' });

    const entry = fullyPopulatedLocalEntry();
    await JournalApi.updateEntry('srv-1', entry, entry.updated_at);

    const [, patched] = ApiClient.patch.mock.calls[0];
    expect(divergencesIn(asSentOnTheWire(patched), 'UpdateJournalEntryRequest')).toEqual([]);
  });

  it('sends the correlation id under the name the Hub binds', async () => {
    // Bug one, named explicitly. Sent as `localId` it arrived as null, skipping the Hub's
    // idempotency guard, and every retried batch made another copy of the same memory. The
    // generic walk above would catch the rename; this says which bug it is.
    ApiClient.post.mockResolvedValue({
      created: [], updated: [], deleted: [], conflicts: [], serverTimestamp: 'x',
    });

    await JournalApi.batchSync({ creates: [fullyPopulatedLocalEntry()], updates: [], deletes: [] });

    const [, posted] = ApiClient.post.mock.calls[0];
    expect(posted.creates[0].clientId).toBe('local-1');
    expect(fieldsOf('CreateSyncEntry').has('clientId')).toBe(true);
  });

  it('sends the date as a civil day, not an instant', async () => {
    // A civil date is a day, not an instant, and the Hub puts CivilDateJsonConverter on it for
    // that reason. An ISO instant here would shift the day for anyone east or west of the
    // server -- quietly, and only for them.
    ApiClient.post.mockResolvedValue({
      created: [], updated: [], deleted: [], conflicts: [], serverTimestamp: 'x',
    });

    await JournalApi.batchSync({ creates: [fullyPopulatedLocalEntry()], updates: [], deletes: [] });

    const [, posted] = ApiClient.post.mock.calls[0];
    expect(posted.creates[0].date).toBe('1998-06-14');
    expect(fieldsOf('CreateSyncEntry').get('date').shape).toBe('civil-date(CivilDateJsonConverter)');
  });

  it('sends the two fields whose absence caused bugs four and five', async () => {
    // Location sharing: a privacy control that did nothing, because no field carried it.
    // Date precision: "sometime in 1998" stored as an exact day, for the same reason.
    ApiClient.post.mockResolvedValue({
      created: [], updated: [], deleted: [], conflicts: [], serverTimestamp: 'x',
    });

    await JournalApi.batchSync({ creates: [fullyPopulatedLocalEntry()], updates: [], deletes: [] });

    const [, posted] = ApiClient.post.mock.calls[0];

    expect(posted.creates[0].locationSharing).toBe('private');
    expect(posted.creates[0].datePrecision).toBe('year');

    expect(fieldsOf('CreateSyncEntry').has('locationSharing')).toBe(true);
    expect(fieldsOf('CreateSyncEntry').has('datePrecision')).toBe(true);
    expect(fieldsOf('UpdateSyncEntry').has('locationSharing')).toBe(true);
    expect(fieldsOf('UpdateSyncEntry').has('datePrecision')).toBe(true);
  });
});

// ============================================================
// What this app READS
// ============================================================

/**
 * Wrap a payload so every property this app looks at is recorded.
 *
 * Driven from the real code rather than from a list of field names someone typed: the reads
 * are whatever the sync paths actually perform, including the ones nobody remembers writing.
 */
function recordingProxy(value, onRead, path = '') {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return new Proxy(value, {
      get(target, key, receiver) {
        const inner = Reflect.get(target, key, receiver);
        if (typeof key === 'symbol' || typeof inner === 'function') return inner;
        return recordingProxy(inner, onRead, path);
      },
    });
  }

  return new Proxy(value, {
    get(target, key, receiver) {
      if (typeof key !== 'symbol') {
        // `then` is probed by the await machinery, not by our code reading a field.
        if (key !== 'then') onRead(key);
      }

      const inner = Reflect.get(target, key, receiver);
      if (typeof key === 'symbol' || typeof inner === 'function') return inner;
      return recordingProxy(inner, onRead, path ? `${path}.${String(key)}` : String(key));
    },
  });
}

function unknownReads(reads, typeName) {
  const fields = fieldsOf(typeName);

  return [...reads].filter(
    (key) => !fields.has(key) && !READ_BUT_NOT_SENT_BY_THE_HUB[`${typeName}.${key}`]
  );
}

describe('every field this app reads exists in the record', () => {
  it('the changes pull: GET /journals/changes', async () => {
    const reads = new Set();

    ApiClient.get.mockImplementation(async () =>
      recordingProxy(
        {
          entries: [serverEntryFromRecord()],
          deletedIds: ['srv-9'],
          serverTimestamp: '2026-10-17T09:00:00.000Z',
          hasMore: false,
        },
        (key) => reads.add(key)
      )
    );

    await JournalApi.getChanges('2026-10-16T00:00:00.000Z');

    // Everything the real getChanges touched has to be on SyncChangesResponse.
    expect(unknownReads(reads, 'SyncChangesResponse')).toEqual([]);
    // And it must genuinely have read the four, or this test proves nothing.
    expect([...reads].sort()).toEqual(['deletedIds', 'entries', 'hasMore', 'serverTimestamp']);
  });

  it('a pulled entry, through the real SyncEngine pull path', async () => {
    const reads = new Set();

    ApiClient.get.mockResolvedValue({
      entries: [recordingProxy(serverEntryFromRecord(), (key) => reads.add(key))],
      deletedIds: [],
      serverTimestamp: '2026-10-17T09:00:00.000Z',
      hasMore: false,
    });

    JournalRepository.getByServerId.mockResolvedValue(null);

    await SyncEngine._pullRemoteChanges();

    expect(JournalRepository.createFromServer).toHaveBeenCalled();
    expect(unknownReads(reads, 'JournalEntryResponse')).toEqual([]);
    expect(reads.size).toBeGreaterThan(5);
  });

  it('a pulled entry, through the REAL repository that reads it field by field', async () => {
    // JournalRepository.createFromServer is where a pulled entry is actually taken apart
    // field by field, so it is the read site that matters. Mocked out, the test above only
    // covers SyncEngine's own handful of reads -- so drive the real thing, with just its
    // database boundary stubbed.
    const { JournalRepository: Real } = jest.requireActual('../../repositories/JournalRepository');

    const inserted = [];
    const originalDb = Real.dbService;
    Real.dbService = { insertEntry: async (entry) => inserted.push(entry) };

    const reads = new Set();

    try {
      await Real.createFromServer(
        recordingProxy(serverEntryFromRecord(), (key) => reads.add(key))
      );
    } finally {
      Real.dbService = originalDb;
    }

    expect(inserted).toHaveLength(1);

    // Every field it reached for has to be one the Hub actually sends. `_id` is listed as a
    // known dead fallback; anything else unknown is a real divergence.
    expect(unknownReads(reads, 'JournalEntryResponse')).toEqual([]);

    // And it must have read the fields whose loss caused bugs four and five, or a later
    // refactor could quietly drop them and this test would still pass.
    expect([...reads]).toContain('locationSharing');
    expect([...reads]).toContain('datePrecision');
  });

  it('a batch reply: the fields the push path reads off SyncResultItem', async () => {
    const reads = new Set();

    SyncQueue.getPendingOperations.mockResolvedValue([
      {
        id: 'op-1',
        type: SyncOperationType.CREATE_ENTRY,
        entityId: 'local-1',
        data: { local_id: 'local-1' },
      },
    ]);

    ApiClient.post.mockImplementation(async () => ({
      created: [recordingProxy(
        { clientId: 'local-1', serverId: 'srv-1', serverTimestamp: '2026-10-17T09:00:00.000Z' },
        (key) => reads.add(key)
      )],
      updated: [],
      deleted: [],
      conflicts: [],
      serverTimestamp: '2026-10-17T09:00:00.000Z',
    }));

    await SyncEngine._pushLocalChanges();

    expect(unknownReads(reads, 'SyncResultItem')).toEqual([]);
    expect([...reads]).toContain('clientId');
    expect([...reads]).toContain('serverId');
  });

  it('a refusal: the fields the push path reads off SyncConflict', async () => {
    // Bug three. Refusals were read off the wrong fields, so they were silently discarded and
    // sync reported clean while a memory sat on the phone that the server would never accept.
    const reads = new Set();

    SyncQueue.getPendingOperations.mockResolvedValue([
      { id: 'op-1', type: SyncOperationType.UPDATE_ENTRY, entityId: 'local-1', serverId: 'srv-1', data: {} },
    ]);

    ApiClient.post.mockResolvedValue({
      created: [],
      updated: [],
      deleted: [],
      conflicts: [{ clientId: 'local-1', serverId: 'srv-1', reason: 'Not authorized to update this entry' }],
      serverTimestamp: '2026-10-17T09:00:00.000Z',
    });

    // The real ConflictResolver.processServerConflicts is what reads the refusal, so let it.
    const { ConflictResolver: Real } = jest.requireActual('../ConflictResolver');
    ConflictResolver.processServerConflicts.mockImplementation((conflicts) =>
      Real.processServerConflicts(
        conflicts.map((c) => recordingProxy(c, (key) => reads.add(key)))
      )
    );

    const result = await SyncEngine._pushLocalChanges();

    expect(unknownReads(reads, 'SyncConflict')).toEqual([]);
    expect([...reads].sort()).toEqual(['clientId', 'reason', 'serverId']);

    // And the refusal was actually reported, not swallowed -- the consequence, not the spelling.
    expect(result.conflicts).toBe(1);
    expect(SyncQueue.markConflict).toHaveBeenCalled();
  });
});

// ============================================================
// Shape, not just names
// ============================================================

describe('the push path honours the shapes the record declares', () => {
  it('treats created and updated as lists of objects, and deleted as a list of strings', async () => {
    // Bug two, which a names-only record would have missed entirely: BatchSyncResponse.Updated
    // is a list of SyncResultItem objects and this app iterated it as a list of strings, so
    // `o.serverId === <object>` never matched and accepted edits were re-pushed on every sync,
    // forever, never confirmed.
    //
    // The reply below is built FROM the record's declared shapes rather than from a fake Hub
    // somebody wrote by hand -- so if the record says these shapes, the real push path has to
    // cope with exactly these shapes.
    const batch = fieldsOf('BatchSyncResponse');
    expect(batch.get('created').shape).toBe('array<object:SyncResultItem>');
    expect(batch.get('updated').shape).toBe('array<object:SyncResultItem>');
    expect(batch.get('deleted').shape).toBe('array<string>');
    expect(batch.get('conflicts').shape).toBe('array<object:SyncConflict>');

    const resultItem = (clientId, serverId) => {
      const item = {};
      for (const [name] of fieldsOf('SyncResultItem')) {
        if (name === 'clientId') item.clientId = clientId;
        if (name === 'serverId') item.serverId = serverId;
        if (name === 'serverTimestamp') item.serverTimestamp = '2026-10-17T09:00:00.000Z';
      }
      return item;
    };

    SyncQueue.getPendingOperations.mockResolvedValue([
      { id: 'op-create', type: SyncOperationType.CREATE_ENTRY, entityId: 'local-1', data: { local_id: 'local-1' } },
      { id: 'op-update', type: SyncOperationType.UPDATE_ENTRY, entityId: 'local-2', serverId: 'srv-2', data: {} },
      { id: 'op-delete', type: SyncOperationType.DELETE_ENTRY, entityId: 'local-3', serverId: 'srv-3', data: {} },
    ]);

    ApiClient.post.mockResolvedValue({
      created: [resultItem('local-1', 'srv-1')],
      updated: [resultItem(null, 'srv-2')],   // objects, per the record
      deleted: ['srv-3'],                      // strings, per the record
      conflicts: [],
      serverTimestamp: '2026-10-17T09:00:00.000Z',
    });

    const result = await SyncEngine._pushLocalChanges();

    // All three settled. The consequence a person suffers, not the spelling of a field: an
    // unsettled operation is re-pushed on the next sync and every sync after it.
    expect(result.succeeded).toBe(3);
    expect(result.conflicts).toBe(0);

    const settled = SyncQueue.markCompleted.mock.calls.map(([id]) => id).sort();
    expect(settled).toEqual(['op-create', 'op-delete', 'op-update']);
  });
});
