import {
  peopleAtPlace,
  filterByPeople,
  togglePerson,
  buildGroups,
  placeStats,
} from '../placeExplorer';

/**
 * Reading a place by who was there. Ported from the web's Details tab, so what is checked
 * here is mostly the rules that would let the two clients disagree about the same place --
 * a person counted twice, an empty selection meaning nobody, groups in a different order.
 */
const HAMID = { id: 'u1', name: 'Hamid Naser', firstName: 'Hamid', avatar: 'h.jpg' };
const OMAR = { id: 'u2', name: 'Omar Naser', firstName: 'Omar', avatar: 'o.jpg' };

const MEMORIES = [
  { id: 'm1', year: 2026, date: '2026-05-05', author: HAMID },
  { id: 'm2', year: 2026, date: '2026-08-01', author: OMAR },
  { id: 'm3', year: 2024, date: '2024-03-02', author: HAMID },
];

describe('peopleAtPlace', () => {
  it('lists each person once, however many memories they posted', () => {
    expect(peopleAtPlace(MEMORIES).map((p) => p.id)).toEqual(['u1', 'u2']);
  });

  it('ignores memories with no author rather than inventing one', () => {
    const people = peopleAtPlace([...MEMORIES, { id: 'm4', year: 2020 }]);
    expect(people).toHaveLength(2);
  });

  it('survives being handed nothing', () => {
    expect(peopleAtPlace()).toEqual([]);
  });
});

describe('filterByPeople', () => {
  it('shows everyone when nobody is chosen', () => {
    // Where the reader starts. A place showing nothing until somebody is picked reads as
    // broken rather than as unfiltered.
    expect(filterByPeople(MEMORIES, [])).toHaveLength(3);
  });

  it('shows only the chosen people', () => {
    expect(filterByPeople(MEMORIES, ['u1']).map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('shows nothing for somebody with no memories here', () => {
    expect(filterByPeople(MEMORIES, ['nobody'])).toEqual([]);
  });
});

describe('togglePerson', () => {
  it('adds and removes', () => {
    expect(togglePerson([], 'u1')).toEqual(['u1']);
    expect(togglePerson(['u1', 'u2'], 'u1')).toEqual(['u2']);
  });
});

describe('buildGroups', () => {
  it('groups by year, newest year first', () => {
    const groups = buildGroups(MEMORIES, 'year');

    expect(groups.map((g) => g.label)).toEqual(['2026', '2024']);
    expect(groups[0].items).toHaveLength(2);
  });

  it('orders memories within a year newest first', () => {
    const [twentySix] = buildGroups(MEMORIES, 'year');

    expect(twentySix.items.map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('groups by person, alphabetically', () => {
    // No natural order among people, and an arbitrary one shuffles under the reader as
    // memories arrive.
    const groups = buildGroups(MEMORIES, 'person');

    expect(groups.map((g) => g.label)).toEqual(['Hamid', 'Omar']);
    expect(groups[0].avatar).toBe('h.jpg');
  });

  it('keeps memories with no author or year rather than dropping them', () => {
    const groups = buildGroups([{ id: 'm9', date: '2020-01-01' }], 'year');

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('unknown');
  });
});

describe('placeStats', () => {
  it('counts memories and the people who left them', () => {
    expect(placeStats(MEMORIES)).toEqual({ memories: 3, visitors: 2 });
  });

  it('is zero for a place with nothing at it', () => {
    expect(placeStats([])).toEqual({ memories: 0, visitors: 0 });
  });
});
