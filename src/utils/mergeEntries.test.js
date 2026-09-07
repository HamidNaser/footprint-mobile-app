/**
 * Entries must not appear twice, however the pages arrive.
 *
 * Pagination is by offset. Anything landing between two page fetches shifts every offset
 * after it, so the next page repeats rows already held -- and a sync pull does precisely
 * that, dozens of entries at a time, while someone is scrolling. React saw two children
 * with the same key, said so, and then rendered whichever it liked.
 *
 * The merge is the only thing standing between that and a duplicated journal, so its two
 * properties are pinned here: nothing repeats, and order is not disturbed.
 */

import { mergeEntries } from './mergeEntries';

const entry = (localId, extra = {}) => ({ localId, ...extra });

describe('mergeEntries', () => {
  it('does not repeat an entry that arrives in two pages', () => {
    const page1 = [entry('a'), entry('b')];
    const page2 = [entry('b'), entry('c')]; // 'b' repeats after an offset shift

    expect(mergeEntries(page1, page2).map((e) => e.localId)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the order the pages arrived in', () => {
    const merged = mergeEntries([entry('a'), entry('b')], [entry('c'), entry('d')]);

    expect(merged.map((e) => e.localId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the first copy, so an optimistic insert is not displaced', () => {
    // The just-created entry is prepended, then the server's copy of the same row arrives
    // underneath. Replacing the local one would swap it out from under the reader.
    const optimistic = entry('a', { pending: true });
    const fromServer = entry('a', { pending: false });

    const merged = mergeEntries([optimistic], [fromServer]);

    expect(merged).toHaveLength(1);
    expect(merged[0].pending).toBe(true);
  });

  it('falls back to serverId when an entry has no localId', () => {
    const merged = mergeEntries(
      [{ serverId: 's1' }],
      [{ serverId: 's1' }, { serverId: 's2' }]
    );

    expect(merged.map((e) => e.serverId)).toEqual(['s1', 's2']);
  });

  it('keeps an entry with no identifier at all rather than dropping it', () => {
    // An entry with no id is a different bug. Discarding it here would hide that one
    // behind this fix.
    const merged = mergeEntries([{}], [{}]);

    expect(merged).toHaveLength(2);
  });

  it('handles empty inputs', () => {
    expect(mergeEntries([], [])).toEqual([]);
    expect(mergeEntries([entry('a')], []).map((e) => e.localId)).toEqual(['a']);
    expect(mergeEntries([], [entry('a')]).map((e) => e.localId)).toEqual(['a']);
  });
});
