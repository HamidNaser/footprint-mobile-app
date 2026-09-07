/**
 * Merge entries without letting one appear twice.
 *
 * Pagination is by offset, so anything arriving between two page fetches shifts every
 * offset after it and the next page repeats rows the list already has. A sync pull does
 * exactly that -- 46 entries landed mid-scroll -- and the duplicates reached React as two
 * children with the same key, which it warns about and then renders unpredictably.
 *
 * Keyed on localId, which is generated on the device and is the one identifier every entry
 * has. serverId is null until an entry has synced, so it cannot be the key here.
 *
 * Order is preserved and the first occurrence wins: a later page repeating an entry is
 * stale by definition, and an optimistic insert should not be displaced by the server's
 * copy of the same row arriving underneath it.
 */
export function mergeEntries(existing, incoming) {
  const seen = new Set();
  const merged = [];

  for (const entry of [...existing, ...incoming]) {
    const key = entry?.localId || entry?.serverId;
    if (!key) {
      // Keep it rather than drop it -- an entry with no id at all is a different bug, and
      // silently discarding it here would hide that one behind this fix.
      merged.push(entry);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

export default mergeEntries;
