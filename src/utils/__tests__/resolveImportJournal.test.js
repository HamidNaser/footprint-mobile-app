import { resolveImportJournal, NEW_JOURNAL_NAME } from '../resolveImportJournal';

/**
 * Which journal a mobile import puts its entries in.
 *
 * <p>
 * Deliberately the same rule as `foot-print-web/src/pages/Import/resolveImportJournal.js`,
 * and these are the same cases. Two repositories cannot share a module, so the way the two
 * stay honest is that both are pinned to the same behaviour: the signed-in person's journal,
 * one created if they have none, the most recent if they have several.
 * </p>
 *
 * <p>
 * Nothing is created merely because the import screen was opened — that is the caller's
 * business, and the screen test covers it. What is pinned here is that when this *is* called
 * it never leaves somebody without a destination.
 * </p>
 */
const journal = (id, name, createdAt) => ({ id, name, createdAt });

describe('resolveImportJournal', () => {
  it('uses the one journal there is', async () => {
    const createJournal = jest.fn();

    const chosen = await resolveImportJournal({
      listJournals: async () => [journal('j1', 'Family', '2026-01-01T00:00:00Z')],
      createJournal,
    });

    expect(chosen).toEqual({ id: 'j1', name: 'Family', created: false });
    // A second journal would split the person's library across two notebooks.
    expect(createJournal).not.toHaveBeenCalled();
  });

  it('creates one for somebody who has none', async () => {
    const createJournal = jest.fn(async ({ name }) => journal('new', name, '2026-09-26T00:00:00Z'));

    const chosen = await resolveImportJournal({ listJournals: async () => [], createJournal });

    expect(createJournal).toHaveBeenCalledWith({ name: NEW_JOURNAL_NAME });
    expect(chosen).toEqual({ id: 'new', name: NEW_JOURNAL_NAME, created: true });
  });

  it('takes the most recent when there are several', async () => {
    const chosen = await resolveImportJournal({
      listJournals: async () => [
        journal('old', 'First', '2024-03-01T00:00:00Z'),
        journal('newest', 'Current', '2026-08-01T00:00:00Z'),
        journal('middle', 'Second', '2025-05-01T00:00:00Z'),
      ],
      createJournal: jest.fn(),
    });

    expect(chosen.id).toBe('newest');
  });

  it('still answers when a journal has no date on it', async () => {
    const chosen = await resolveImportJournal({
      listJournals: async () => [journal('a', 'A'), journal('b', 'B')],
      createJournal: jest.fn(),
    });

    expect(chosen.id).toBe('b');
  });

  it('copes with a response wrapped in an object', async () => {
    // `ApiClient` hands back whatever the endpoint answered. A list endpoint that starts
    // paginating would return `{ items: [...] }`, and reading that as "no journals" would
    // silently create a second notebook beside the one the person already has.
    const createJournal = jest.fn();

    const chosen = await resolveImportJournal({
      listJournals: async () => ({ items: [journal('j9', 'Wrapped', '2026-02-01T00:00:00Z')] }),
      createJournal,
    });

    expect(chosen.id).toBe('j9');
    expect(createJournal).not.toHaveBeenCalled();
  });

  it('says plainly when a journal cannot be created', async () => {
    await expect(resolveImportJournal({
      listJournals: async () => [],
      createJournal: async () => { throw new Error('offline'); },
    })).rejects.toThrow(/journal/i);
  });
});
