/**
 * The transposition, pinned.
 *
 * The endpoint answers by person and the screen reads by day, so these two orderings are
 * the whole substance of this module: days newest first, and within a day the family in a
 * fixed order -- head, spouse, then children. The second one has no visible symptom when it
 * breaks. A day simply comes out in whatever order the server returned, which looks like a
 * deliberate choice rather than a bug, so it is worth a test rather than an eye.
 *
 * Attribution is the other thing worth holding: entries are attributed from the section,
 * because the section is the only place that reliably knows whose journal this is.
 */

import { familySummaryToDays, flattenFamilyEntries, dayLabel } from './familySummaryDays';

const day = (key, hour = 12) => new Date(`${key}T${String(hour).padStart(2, '0')}:00:00`).getTime();

const section = (memberId, relation, name, entries) => ({
  memberId,
  relation,
  name,
  avatarUrl: null,
  entries,
});

const entry = (id, createdAt) => ({ localId: id, serverId: id, createdAt, author: {} });

describe('familySummaryToDays', () => {
  it('pools every member into one list grouped by day', () => {
    const days = familySummaryToDays([
      section('m1', 'head', 'Akram', [entry('a', day('2026-08-05'))]),
      section('m2', 'spouse', 'Reem', [entry('b', day('2026-08-05'))]),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0].data.map((e) => e.serverId)).toEqual(['a', 'b']);
  });

  it('orders days newest first', () => {
    const days = familySummaryToDays([
      section('m1', 'head', 'Akram', [
        entry('older', day('2026-08-01')),
        entry('newer', day('2026-08-09')),
      ]),
    ]);

    expect(days.map((d) => d.key)).toEqual(['2026-08-09', '2026-08-01']);
  });

  it('orders a day head, then spouse, then children', () => {
    // The server is free to return sections in any order; the day must not inherit it.
    const days = familySummaryToDays([
      section('m3', 'child', 'Lina', [entry('child', day('2026-08-05'))]),
      section('m2', 'spouse', 'Reem', [entry('spouse', day('2026-08-05'))]),
      section('m1', 'head', 'Akram', [entry('head', day('2026-08-05'))]),
    ]);

    expect(days[0].data.map((e) => e.serverId)).toEqual(['head', 'spouse', 'child']);
  });

  it('keeps two children in the order the server returned them', () => {
    const days = familySummaryToDays([
      section('m1', 'child', 'Lina', [entry('first', day('2026-08-05'))]),
      section('m2', 'child', 'Sami', [entry('second', day('2026-08-05'))]),
    ]);

    expect(days[0].data.map((e) => e.serverId)).toEqual(['first', 'second']);
  });

  it('puts an unknown relation last rather than first', () => {
    const days = familySummaryToDays([
      section('m9', undefined, 'Nobody', [entry('unknown', day('2026-08-05'))]),
      section('m1', 'head', 'Akram', [entry('head', day('2026-08-05'))]),
    ]);

    expect(days[0].data.map((e) => e.serverId)).toEqual(['head', 'unknown']);
  });

  it('attributes each entry from its section, not from the entry', () => {
    // adaptEntry leaves the author blank when the API omits one. The section always knows.
    const days = familySummaryToDays([
      section('m2', 'spouse', 'Reem', [entry('a', day('2026-08-05'))]),
    ]);

    expect(days[0].data[0].author).toMatchObject({ id: 'm2', name: 'Reem' });
  });

  it('keeps an undated entry under its own heading, last', () => {
    // Filing it under today would be a guess; dropping it looks like data loss.
    const days = familySummaryToDays([
      section('m1', 'head', 'Akram', [
        entry('dated', day('2026-08-05')),
        entry('undated', null),
      ]),
    ]);

    expect(days.map((d) => d.key)).toEqual(['2026-08-05', 'undated']);
    expect(days[1].title).toBe('Date unknown');
  });

  it('drops nothing when a member has no entries', () => {
    const days = familySummaryToDays([
      section('m1', 'head', 'Akram', [entry('a', day('2026-08-05'))]),
      section('m2', 'spouse', 'Reem', []),
    ]);

    expect(days[0].data).toHaveLength(1);
  });

  it('survives empty and missing input', () => {
    expect(familySummaryToDays([])).toEqual([]);
    expect(familySummaryToDays(null)).toEqual([]);
    expect(familySummaryToDays(undefined)).toEqual([]);
  });
});

describe('flattenFamilyEntries', () => {
  it('carries relation and section position for ordering', () => {
    const flat = flattenFamilyEntries([
      section('m1', 'head', 'Akram', [entry('a', day('2026-08-05'))]),
    ]);

    expect(flat[0]).toMatchObject({ relation: 'head', sectionIndex: 0 });
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
