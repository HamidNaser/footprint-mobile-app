import { runPhotoImport } from '../runPhotoImport';

/**
 * Importing a phone's photograph library (User Story 3, FR-001, FR-009, FR-011).
 *
 * <p>
 * The same contract as the web client's `runImport` — create a batch, read each photograph
 * before uploading it, register in pages, then finalize repeatedly until the server says
 * there is nothing ungrouped left — against a different source. A browser is handed files; a
 * phone enumerates a library it never holds all of at once.
 * </p>
 *
 * <p>
 * The failure that matters most is the same one: stopping early. A library is tens of
 * thousands of photographs across many pages, and a loop that runs once leaves most of them
 * unimported while reporting success.
 * </p>
 *
 * <p>
 * Everything is injected. Nothing here may import `expo-media-library` or `ApiClient`, both
 * of which throw the moment they load under jest — which is the whole reason this logic is
 * not inside the screen.
 * </p>
 */
const asset = (id) => ({ id, filename: `${id}.HEIC`, mediaType: 'photo' });

function deps(overrides = {}) {
  return {
    listAssets: jest.fn(async () => ({ assets: [asset('a'), asset('b')], endCursor: null, hasNextPage: false })),
    assetInfo: jest.fn(async (a) => ({ ...a, localUri: `file:///${a.id}`, exif: { Make: 'Apple' } })),
    hashOf: jest.fn(async (a) => `hash-${a.id}`),
    uploadImage: jest.fn(async (a) => ({ mediaId: `media-${a.asset.id}` })),
    buildPhotoMetadata: jest.fn((a, context) => ({ originalFileName: a.filename, ...context })),
    createBatch: jest.fn(async () => ({ batchId: 'b1' })),
    registerPhotos: jest.fn(async () => ({ registered: 0, duplicates: 0, held: 0 })),
    finalizeBatch: jest.fn(async () => ({ entriesCreated: 0, photosRemaining: 0, hasMore: false })),
    listBatches: jest.fn(async () => []),
    listBatchPhotos: jest.fn(async () => ({ photos: [] })),
    savePhotoMetadata: jest.fn(async () => {}),
    confirmPhotoMetadata: jest.fn(async () => {}),
    countVideos: jest.fn(async () => 0),
    ...overrides,
  };
}

describe('runPhotoImport', () => {
  it('imports every photograph in the library', async () => {
    const d = deps();

    const summary = await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.uploadImage).toHaveBeenCalledTimes(2);
    expect(summary.failed).toBe(0);
  });

  it('keeps asking for pages until the library runs out', async () => {
    // A loop that runs once imports the first page and reports success. On a real library
    // that is a few hundred photographs out of twenty thousand.
    const pages = [
      { assets: [asset('a')], endCursor: 'c1', hasNextPage: true },
      { assets: [asset('b')], endCursor: 'c2', hasNextPage: true },
      { assets: [asset('c')], endCursor: null, hasNextPage: false },
    ];
    const d = deps({ listAssets: jest.fn(async () => pages.shift()) });

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.listAssets).toHaveBeenCalledTimes(3);
    expect(d.uploadImage).toHaveBeenCalledTimes(3);
  });

  it('asks for the next page from where the last one ended', async () => {
    const pages = [
      { assets: [asset('a')], endCursor: 'cursor-1', hasNextPage: true },
      { assets: [asset('b')], endCursor: null, hasNextPage: false },
    ];
    const d = deps({ listAssets: jest.fn(async () => pages.shift()) });

    await runPhotoImport({ journalId: 'j1', deps: d });

    // Without the cursor the same page comes back forever.
    expect(d.listAssets.mock.calls[1][0].after).toBe('cursor-1');
  });

  it('reads a photograph before uploading it', async () => {
    // The metadata has to come off the original while the phone still has it.
    const order = [];
    const d = deps({
      assetInfo: jest.fn(async (a) => { order.push(`read:${a.id}`); return { ...a, localUri: 'u' }; }),
      uploadImage: jest.fn(async (a) => { order.push(`up:${a.asset.id}`); return { mediaId: 'm' }; }),
    });

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(order.slice(0, 2)).toEqual(['read:a', 'up:a']);
  });

  it('marks these as an import, not a capture', async () => {
    // A photograph pulled out of the camera roll months later was not captured now, and the
    // route is what tells the server which reading of the date to trust.
    const d = deps();

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.buildPhotoMetadata.mock.calls[0][1].captureRoute).toBe('import');
  });

  it('writes what it read to the device before uploading it', async () => {
    /*
     * The durable copy. The OS kills the app to reclaim memory and anything held only in
     * memory goes with it; the photographs worst affected are the ones taken somewhere with
     * no signal, which are the hardest of all to take again.
     */
    const order = [];
    const d = deps({
      savePhotoMetadata: jest.fn(async () => { order.push('save'); }),
      uploadImage: jest.fn(async () => { order.push('upload'); return { mediaId: 'm' }; }),
    });

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(order.slice(0, 2)).toEqual(['save', 'upload']);
  });

  it('only confirms a local row once the server holds it', async () => {
    // Confirming early is what makes the purge throw away the only durable copy.
    const d = deps({ registerPhotos: jest.fn(async () => ({ registered: 2, duplicates: 0, held: 0 })) });

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.confirmPhotoMetadata).toHaveBeenCalledTimes(2);
  });

  it('does not confirm anything when registration fails', async () => {
    const d = deps({ registerPhotos: jest.fn(async () => { throw new Error('offline'); }) });

    await expect(runPhotoImport({ journalId: 'j1', deps: d })).rejects.toThrow(/offline/);
    expect(d.confirmPhotoMetadata).not.toHaveBeenCalled();
  });

  it('skips photographs an interrupted run already uploaded', async () => {
    // FR-011. The diff is by content hash, because it is the only thing the two sides can
    // compare — the phone holds assets the server has never seen and has no id for.
    const d = deps({
      listBatches: jest.fn(async () => [{ batchId: 'open-1', status: 'in_progress' }]),
      listBatchPhotos: jest.fn(async () => ({ photos: [{ contentHash: 'hash-a' }] })),
    });

    const summary = await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.uploadImage).toHaveBeenCalledTimes(1);
    expect(d.uploadImage.mock.calls[0][0].asset.id).toBe('b');
    expect(summary.skipped).toBe(1);
  });

  it('continues the open batch rather than starting a second', async () => {
    const d = deps({
      listBatches: jest.fn(async () => [{ batchId: 'open-1', status: 'in_progress' }]),
    });

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.createBatch).not.toHaveBeenCalled();
    expect(d.registerPhotos.mock.calls[0][0]).toBe('open-1');
  });

  it('re-offers a photograph it cannot hash rather than dropping it', async () => {
    // The server deduplicates a genuine repeat anyway, so being wrong this way costs an
    // upload. Being wrong the other way silently loses a photograph.
    const d = deps({
      hashOf: jest.fn(async () => { throw new Error('unreadable'); }),
      listBatches: jest.fn(async () => [{ batchId: 'open-1', status: 'in_progress' }]),
      listBatchPhotos: jest.fn(async () => ({ photos: [{ contentHash: 'hash-a' }] })),
    });

    await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.uploadImage).toHaveBeenCalledTimes(2);
  });

  it('one bad photograph does not abandon the rest', async () => {
    const d = deps({
      uploadImage: jest.fn(async (a) => {
        if (a.asset.id === 'a') throw new Error('upload failed');
        return { mediaId: 'media-b' };
      }),
    });

    const summary = await runPhotoImport({ journalId: 'j1', deps: d });

    expect(summary.failed).toBe(1);
    expect(d.registerPhotos.mock.calls[0][1]).toHaveLength(1);
  });

  it('groups until the server says there is nothing left', async () => {
    const finalizes = [
      { entriesCreated: 2, photosRemaining: 5, hasMore: true },
      { entriesCreated: 3, photosRemaining: 0, hasMore: false },
    ];
    const d = deps({ finalizeBatch: jest.fn(async () => finalizes.shift()) });

    const summary = await runPhotoImport({ journalId: 'j1', deps: d });

    expect(d.finalizeBatch).toHaveBeenCalledTimes(2);
    expect(summary.entriesCreated).toBe(5);
    expect(summary.incomplete).toBe(false);
  });

  it('reports rather than spins when the server never finishes grouping', async () => {
    const d = deps({
      finalizeBatch: jest.fn(async () => ({ entriesCreated: 1, photosRemaining: 1, hasMore: true })),
    });

    const summary = await runPhotoImport({ journalId: 'j1', deps: d });

    expect(summary.incomplete).toBe(true);
    expect(d.finalizeBatch.mock.calls.length).toBeLessThan(500);
  });

  it('counts the videos it did not import', async () => {
    // Videos are not photographs and are not silently treated as them. Saying how many there
    // are is the difference between "not supported" and "where did those go".
    const d = deps({ countVideos: jest.fn(async () => 37) });

    const summary = await runPhotoImport({ journalId: 'j1', deps: d });

    expect(summary.videos).toBe(37);
    expect(d.uploadImage).toHaveBeenCalledTimes(2);
  });

  it('says how far along it is', async () => {
    const phases = [];
    const d = deps();

    await runPhotoImport({ journalId: 'j1', deps: d, onProgress: (p) => phases.push(p.phase) });

    expect(phases).toContain('reading');
    expect(phases).toContain('grouping');
    expect(phases[phases.length - 1]).toBe('done');
  });

  it('refuses to start without somewhere to put the entries', async () => {
    await expect(runPhotoImport({ journalId: null, deps: deps() }))
      .rejects.toThrow(/journal/i);
  });
});
