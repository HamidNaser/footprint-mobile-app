import { adaptEntry } from '../SocialService';

/**
 * `adaptEntry` maps a backend entry into the card shape. It has to keep two facts apart
 * that are easy to conflate:
 *
 *   `date`      the calendar day the entry is *about* -- chosen by the writer, so an entry
 *               written after midnight about yesterday belongs to yesterday.
 *   `createdAt` the instant the record was made.
 *
 * It used to fold the first into the second (`new Date(entry.date || entry.createdAt)`),
 * which destroyed the time of day and, because an ISO date-only string parses as UTC
 * midnight while day-bucketing reads local time, also moved entries a day west of UTC.
 *
 * `JournalRepository.createFromServer` already models these separately, and
 * `getEntriesByDate` looks entries up by `date`. These tests hold `adaptEntry` to the
 * same model.
 */
describe('adaptEntry', () => {
  const base = {
    id: 'e1',
    journalId: 'j1',
    userId: 'u1',
    contentBlocks: [],
  };

  it('takes createdAt from createdAt, not from the civil day', () => {
    const entry = adaptEntry({ ...base, date: '2026-05-05', createdAt: '2026-05-05T17:45:00.000Z' });

    expect(entry.createdAt).toBe(new Date('2026-05-05T17:45:00.000Z').getTime());
    expect(entry.createdAt).not.toBe(new Date('2026-05-05').getTime());
  });

  it('keeps the civil day verbatim, never re-parsed through Date', () => {
    // Verbatim is the whole guarantee. `new Date('2026-05-05')` is UTC midnight, so any
    // round-trip through Date and back to a local calendar day lands on the 4th for every
    // timezone west of UTC. Passing the string through untouched cannot shift.
    const entry = adaptEntry({ ...base, date: '2026-05-05', createdAt: '2026-05-05T17:45:00.000Z' });

    expect(entry.date).toBe('2026-05-05');
  });

  it('falls back to the civil day when the server sends no createdAt', () => {
    // Better than Date.now(): a stored entry dated last year should not read as recorded
    // today just because one field was missing.
    const entry = adaptEntry({ ...base, date: '2026-05-05' });

    expect(entry.createdAt).toBe(new Date('2026-05-05').getTime());
    expect(entry.date).toBe('2026-05-05');
  });

  it('carries a null date rather than inventing one when the server sends none', () => {
    const entry = adaptEntry({ ...base, createdAt: '2026-05-05T17:45:00.000Z' });

    expect(entry.date).toBeNull();
    expect(entry.createdAt).toBe(new Date('2026-05-05T17:45:00.000Z').getTime());
  });

  it('still maps the rest of the entry as before', () => {
    const entry = adaptEntry({
      ...base,
      date: '2026-05-05',
      createdAt: '2026-05-05T17:45:00.000Z',
      visibility: 'family',
      author: { id: 'u1', name: 'Reem', avatar: 'a.png' },
      commentsCount: 3,
    });

    expect(entry.localId).toBe('e1');
    expect(entry.serverId).toBe('e1');
    expect(entry.userId).toBe('u1');
    expect(entry.visibility).toBe('family');
    expect(entry.syncStatus).toBe('synced');
    expect(entry.responsesCount).toBe(3);
    expect(entry.author).toEqual({ id: 'u1', name: 'Reem', avatarUrl: 'a.png' });
  });
});
