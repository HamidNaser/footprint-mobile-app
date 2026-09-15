/**
 * `journalBookToDays` has two jobs left after the server started grouping and ordering
 * days itself: attribute entries from the household roster, and turn each day into a
 * `SectionList` section. Both are worth pinning because neither has a visible symptom when
 * it breaks -- a re-sorted day or a mis-attributed entry looks like a deliberate choice
 * rather than a bug.
 *
 * The within-day ordering test seeds entries deliberately out of chronological order, so a
 * client-side re-sort (the thing this phase removes) would produce a different result than
 * passthrough. A test where both orderings agree would prove nothing.
 */

import { journalBookToDays, dayLabel } from './journalBookDays';

const householdMember = (memberId, relation, name, overrides = {}) => ({
  memberId,
  userId: `${memberId}-user`,
  relation,
  name,
  avatarUrl: null,
  hasAccount: true,
  ...overrides,
});

const entry = (id, createdAt, memberId, overrides = {}) => ({
  localId: id,
  serverId: id,
  createdAt,
  author: { id: null, name: null, avatarUrl: null },
  memberId,
  ...overrides,
});

const dayOf = (date, entries) => ({ date, entries });

describe('journalBookToDays', () => {
  it('maps one section per day, newest first', () => {
    const days = journalBookToDays(
      [
        dayOf('2026-08-01', [entry('older', 1, 'm1')]),
        dayOf('2026-08-09', [entry('newer', 2, 'm1')]),
      ],
      [householdMember('m1', 'head', 'Akram')],
    );

    expect(days.map((d) => d.key)).toEqual(['2026-08-09', '2026-08-01']);
  });

  it('preserves the server\'s within-day entry order rather than re-sorting', () => {
    // Deliberately out of chronological order: a client-side sort by createdAt (ascending
    // or descending) would reorder these. Passthrough must not.
    const days = journalBookToDays(
      [
        dayOf('2026-08-05', [
          entry('third', 3000, 'm3'),
          entry('first', 1000, 'm1'),
          entry('second', 2000, 'm2'),
        ]),
      ],
      [
        householdMember('m1', 'head', 'Akram'),
        householdMember('m2', 'spouse', 'Reem'),
        householdMember('m3', 'child', 'Lina'),
      ],
    );

    expect(days[0].data.map((e) => e.serverId)).toEqual(['third', 'first', 'second']);
  });

  it('attributes each entry from the household roster, not from the entry', () => {
    const days = journalBookToDays(
      [dayOf('2026-08-05', [entry('a', 1, 'm2')])],
      [householdMember('m2', 'spouse', 'Reem', { avatarUrl: 'https://x/reem.png' })],
    );

    expect(days[0].data[0].author).toEqual({
      id: 'm2',
      name: 'Reem',
      avatarUrl: 'https://x/reem.png',
    });
  });

  it('still renders an entry whose member is absent from the household', () => {
    const days = journalBookToDays(
      [dayOf('2026-08-05', [entry('orphan', 1, 'missing-member')])],
      [householdMember('m1', 'head', 'Akram')],
    );

    expect(days[0].data).toHaveLength(1);
    expect(days[0].data[0].serverId).toBe('orphan');
  });

  it('produces the shape SectionList needs: key, title, data', () => {
    const days = journalBookToDays(
      [dayOf('2026-08-05', [entry('a', 1, 'm1')])],
      [householdMember('m1', 'head', 'Akram')],
    );

    expect(days[0]).toEqual({
      key: '2026-08-05',
      title: expect.any(String),
      data: expect.any(Array),
    });
    expect(days[0].title).toMatch(/2026/);
  });

  it('returns an empty array for empty input', () => {
    expect(journalBookToDays([], [])).toEqual([]);
  });

  it('handles household and days absent entirely, without throwing', () => {
    expect(() => journalBookToDays(undefined, undefined)).not.toThrow();
    expect(journalBookToDays(undefined, undefined)).toEqual([]);
  });

  describe('a day with a missing or empty date', () => {
    it('renders under a "Date unknown" title rather than being dropped', () => {
      const days = journalBookToDays(
        [dayOf(undefined, [entry('a', 1, 'm1')])],
        [householdMember('m1', 'head', 'Akram')],
      );

      expect(days).toHaveLength(1);
      expect(days[0].title).toBe('Date unknown');
      expect(days[0].data).toHaveLength(1);
    });

    it('treats an empty-string date the same as a missing one', () => {
      const days = journalBookToDays(
        [dayOf('', [entry('a', 1, 'm1')])],
        [householdMember('m1', 'head', 'Akram')],
      );

      expect(days[0].title).toBe('Date unknown');
    });

    it('sorts last, after every dated day, and keeps its entries', () => {
      const days = journalBookToDays(
        [
          dayOf(undefined, [entry('mystery', 1, 'm1')]),
          dayOf('2026-08-01', [entry('older', 2, 'm1')]),
          dayOf('2026-08-09', [entry('newer', 3, 'm1')]),
        ],
        [householdMember('m1', 'head', 'Akram')],
      );

      expect(days.map((d) => d.title)).toEqual([
        expect.stringContaining('2026'),
        expect.stringContaining('2026'),
        'Date unknown',
      ]);
      expect(days[2].data.map((e) => e.serverId)).toEqual(['mystery']);
    });
  });
});

describe('dayLabel', () => {
  it('renders a civil date key as a readable heading', () => {
    expect(dayLabel('2026-08-05')).toMatch(/2026/);
  });

  it('returns the key unchanged when it cannot be parsed', () => {
    expect(dayLabel('not-a-date')).toBe('not-a-date');
  });
});
