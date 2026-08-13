import { pickThenNow } from '../thenNow';

/**
 * Then & Now was built against a mock and, with real data, never appeared at all: the
 * lookup was keyed by names like 'grandpa_akram' while live places are keyed by ObjectId,
 * so it always missed and the button silently did not render.
 *
 * These pin the rule that decides whether the button shows.
 */
describe('pickThenNow', () => {
  const m = (year, id = String(year)) => ({ id, year });

  it('picks the oldest and newest, whatever order they arrive in', () => {
    const pair = pickThenNow([m(2024), m(1940), m(1999)]);

    expect(pair.then.year).toBe(1940);
    expect(pair.now.year).toBe(2024);
  });

  it('spans decades, which is the case the feature exists for', () => {
    // Swansea in the seeded data.
    const pair = pickThenNow([m(1940), m(1945), m(2023), m(2026)]);

    expect(pair.then.year).toBe(1940);
    expect(pair.now.year).toBe(2026);
  });

  it('returns nothing when every memory is from the same year', () => {
    // A "then and now" of the same year is not a comparison, it is two photographs.
    expect(pickThenNow([m(2024, 'a'), m(2024, 'b'), m(2024, 'c')])).toBeNull();
  });

  it('returns nothing for a single memory', () => {
    expect(pickThenNow([m(2024)])).toBeNull();
  });

  it('returns nothing for an empty or missing list', () => {
    expect(pickThenNow([])).toBeNull();
    expect(pickThenNow(null)).toBeNull();
    expect(pickThenNow(undefined)).toBeNull();
  });

  it('ignores memories with no usable year', () => {
    // A memory whose date never reached the server has no year. Sorting undefined
    // alongside numbers would put an unrenderable card at one end of the comparison.
    const pair = pickThenNow([m(2024), { id: 'x' }, m(1990), { id: 'y', year: null }]);

    expect(pair.then.year).toBe(1990);
    expect(pair.now.year).toBe(2024);
  });

  it('returns nothing when only one memory has a year', () => {
    expect(pickThenNow([m(2024), { id: 'x' }])).toBeNull();
  });

  it('does not mutate the caller list', () => {
    const memories = [m(2024), m(1940)];
    pickThenNow(memories);

    expect(memories[0].year).toBe(2024);
  });
});
