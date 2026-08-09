/**
 * The entry payload must carry the memory's calendar day.
 *
 * It did not. `_formatEntryForApi` sent createdAt and updatedAt but no `date`, so the
 * server had nothing to store and defaulted it to year 1. The device that wrote the
 * entry looked fine — its local row keeps its own date — so the damage was invisible
 * exactly where anyone would have looked for it, and showed up only on the web app or
 * another phone.
 *
 * These tests pin the field and its format. A memory dated 5 August must arrive as
 * 5 August, not as an instant that a server in another timezone can round to the 4th.
 */

import { JournalApi } from '../JournalApi';

jest.mock('../ApiClient', () => ({
  ApiClient: { post: jest.fn().mockResolvedValue({ id: 'server-1' }) },
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOnline: jest.fn().mockReturnValue(true) },
}));

const { ApiClient } = require('../ApiClient');

describe('JournalApi entry payload dates', () => {
  beforeEach(() => {
    ApiClient.post.mockClear();
  });

  const baseEntry = {
    localId: 'local-1',
    journalId: 'j1',
    contentBlocks: [],
    visibility: 'private',
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
  };

  it('sends the entry date as a calendar day', async () => {
    await JournalApi.createEntry({ ...baseEntry, date: '2026-08-05' });

    const [, payload] = ApiClient.post.mock.calls[0];
    expect(payload.date).toBe('2026-08-05');
  });

  it('never sends a timestamp for the memory date', async () => {
    await JournalApi.createEntry({ ...baseEntry, date: '2026-08-05' });

    const [, payload] = ApiClient.post.mock.calls[0];
    expect(payload.date).not.toMatch(/T|Z|:/);
  });

  it('falls back to the creation day rather than sending nothing', async () => {
    // Sending no date at all is what caused year-1 entries. Any plausible day beats
    // silence.
    const { date, ...withoutDate } = { ...baseEntry, date: undefined };
    await JournalApi.createEntry(withoutDate);

    const [, payload] = ApiClient.post.mock.calls[0];
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts the snake_case row that comes back out of SQLite', async () => {
    await JournalApi.createEntry({
      local_id: 'local-2',
      journal_id: 'j1',
      date: '1940-06-03',
      created_at: '2026-08-05T12:00:00.000Z',
    });

    const [, payload] = ApiClient.post.mock.calls[0];
    expect(payload.date).toBe('1940-06-03');
  });

  it('carries the date through batch sync too', async () => {
    ApiClient.post.mockResolvedValueOnce({ created: [], updated: [], deleted: [] });

    await JournalApi.batchSync({
      creates: [{ ...baseEntry, date: '2026-08-05' }],
      updates: [],
      deletes: [],
    });

    const [, payload] = ApiClient.post.mock.calls[0];
    expect(payload.creates[0].date).toBe('2026-08-05');
  });
});
