/**
 * The roster exists for the people who are *not* on the page.
 *
 * Which makes its central property a negative one, and negatives are what quietly stop
 * holding: nobody is ever dropped for having recorded nothing. An optimisation that skipped
 * empty members would look tidier, pass every other test, and silently reintroduce the
 * exact confusion this module was written to answer — a thin day reading as a broken
 * screen.
 */

import { rosterForDay, rosterCaption, dayOf } from './dayRoster';

const at = (key) => new Date(`${key}T12:00:00`).getTime();

const section = (memberId, relation, name, entries = []) => ({
  memberId,
  relation,
  name,
  avatarUrl: null,
  entries,
});

const entry = (id, createdAt) => ({ serverId: id, createdAt });

describe('rosterForDay', () => {
  const household = [
    section('m1', 'head', 'Akram', [entry('a', at('2026-08-05'))]),
    section('m2', 'spouse', 'Reem', []),
    section('m3', 'child', 'Lina', [entry('b', at('2026-08-01'))]),
  ];

  it('keeps everybody, including those who recorded nothing that day', () => {
    const roster = rosterForDay(household, '2026-08-05');

    expect(roster.map((r) => r.name)).toEqual(['Akram', 'Reem', 'Lina']);
  });

  it('counts only the entries on the day being read', () => {
    const roster = rosterForDay(household, '2026-08-05');

    expect(roster.map((r) => r.count)).toEqual([1, 0, 0]);
  });

  it('orders head, then spouse, then children whatever order the sections arrive in', () => {
    const roster = rosterForDay(
      [household[2], household[1], household[0]],
      '2026-08-05'
    );

    expect(roster.map((r) => r.relation)).toEqual(['head', 'spouse', 'child']);
  });

  it('puts an unranked relation last, so a friends group keeps its own order', () => {
    const roster = rosterForDay(
      [section('f1', undefined, 'Ann'), section('f2', undefined, 'Ben')],
      null
    );

    expect(roster.map((r) => r.name)).toEqual(['Ann', 'Ben']);
  });

  it('counts everything when no day is given', () => {
    const roster = rosterForDay(household, null);

    expect(roster.map((r) => r.count)).toEqual([1, 0, 1]);
  });

  it('carries entry ids so a face can jump to what it is about', () => {
    const roster = rosterForDay(household, '2026-08-05');

    expect(roster[0].entryIds).toEqual(['a']);
    expect(roster[1].entryIds).toEqual([]);
  });

  it('survives empty and missing input', () => {
    expect(rosterForDay([], '2026-08-05')).toEqual([]);
    expect(rosterForDay(null, null)).toEqual([]);
  });
});

describe('rosterCaption', () => {
  const roster = (recorded, total) =>
    Array.from({ length: total }, (_, i) => ({ count: i < recorded ? 1 : 0 }));

  it('says nobody recorded anything', () => {
    expect(rosterCaption(roster(0, 4), '5 August')).toBe(
      'Nobody recorded anything on 5 August'
    );
  });

  it('says how many of how many', () => {
    expect(rosterCaption(roster(1, 4), '5 August')).toBe('1 of 4 recorded something on 5 August');
  });

  it('says when everybody did', () => {
    expect(rosterCaption(roster(4, 4), '5 August')).toBe('All 4 recorded something on 5 August');
  });

  it('does not say "all 1" for a household of one', () => {
    expect(rosterCaption(roster(1, 1), '5 August')).toBe('1 memory on 5 August');
  });

  it('says nothing at all for an empty roster', () => {
    expect(rosterCaption([], '5 August')).toBe('');
  });
});

describe('dayOf', () => {
  it('keeps an already-formatted civil date rather than re-parsing it', () => {
    // Re-parsing '2026-05-12' gives UTC midnight, which is 11 May west of Greenwich --
    // the civil-date bug this codebase has already paid for more than once.
    expect(dayOf({ date: '2026-05-12' })).toBe('2026-05-12');
  });

  it('returns null when there is no usable date', () => {
    expect(dayOf({})).toBeNull();
    expect(dayOf(null)).toBeNull();
  });
});
