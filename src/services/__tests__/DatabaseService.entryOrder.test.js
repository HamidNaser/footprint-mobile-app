/**
 * 013-fix T11 -- within one day, the newest memory comes first.
 * Ordering by date alone left same-day rows in storage order (oldest first).
 */
jest.mock('../../database', () => ({
  getDatabase: jest.fn(),
  initializeDatabase: jest.fn(),
  getDatabaseStats: jest.fn(),
  clearDatabase: jest.fn(),
}));

const { DatabaseService } = require('../DatabaseService');

describe('getEntriesByJournalId ordering', () => {
  let getAllAsync;
  beforeEach(() => {
    getAllAsync = jest.fn().mockResolvedValue([]);
    DatabaseService.getDb = jest.fn().mockResolvedValue({ getAllAsync });
  });

  const sql = () => getAllAsync.mock.calls[0][0].replace(/\s+/g, ' ');

  it('defaults to newest day first, newest memory first within the day', async () => {
    await DatabaseService.getEntriesByJournalId('j1');
    expect(sql()).toContain('ORDER BY date DESC, created_at DESC');
  });

  it('ascending order flips both keys', async () => {
    await DatabaseService.getEntriesByJournalId('j1', { order: 'ASC' });
    expect(sql()).toContain('ORDER BY date ASC, created_at ASC');
  });
});
