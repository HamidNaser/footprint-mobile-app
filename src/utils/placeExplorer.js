/**
 * Reading a place by who was there, rather than only by when.
 *
 * <p>
 * The web's Details tab has had this since it was built: everyone who has posted at a
 * place, selectable, and the memories regrouped by year or by person. Mobile had the two
 * numbers at the top of the place sheet and nothing underneath them -- a list of years and
 * no way to ask "what did my father post here".
 * </p>
 *
 * <p>
 * The arithmetic lives here rather than in the screen so it can be tested without
 * rendering anything, and so the two clients group a place the same way. Ported from
 * PlaceDetailsExplorer.jsx deliberately: the same rules, so a place read on a phone and on
 * a laptop cannot disagree about who was there.
 * </p>
 */

/**
 * Everyone with a memory at this place, once each.
 *
 * Deduplicated by id, keeping the first appearance -- the same author arrives on every
 * memory they posted, and a strip listing somebody eleven times is not a list of people.
 */
export function peopleAtPlace(memories = []) {
  const seen = new Map();
  memories.forEach((m) => {
    const author = m?.author;
    if (author && author.id != null && !seen.has(author.id)) {
      seen.set(author.id, author);
    }
  });
  return Array.from(seen.values());
}

/**
 * The memories belonging to the chosen people.
 *
 * An empty selection means everyone rather than nobody. Selecting nothing is where a
 * reader starts, and a place that shows no memories until somebody is picked reads as
 * broken.
 */
export function filterByPeople(memories = [], selectedIds = []) {
  if (!selectedIds.length) return memories;
  const wanted = new Set(selectedIds);
  return memories.filter((m) => m?.author && wanted.has(m.author.id));
}

/** Adding or removing one person from the selection. */
export function togglePerson(selectedIds = [], id) {
  return selectedIds.includes(id)
    ? selectedIds.filter((x) => x !== id)
    : [...selectedIds, id];
}

/**
 * The memories in groups, newest first within each.
 *
 * @param {'year'|'person'} groupBy
 */
export function buildGroups(memories = [], groupBy = 'year') {
  const map = new Map();

  memories.forEach((m) => {
    const key = groupBy === 'person'
      ? (m?.author?.id ?? 'unknown')
      : (m?.year ?? 'unknown');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  });

  const groups = Array.from(map.entries()).map(([key, items]) => {
    const sorted = items.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const first = sorted[0];
    return {
      key,
      label: groupBy === 'person'
        ? (first?.author?.firstName || first?.author?.name || 'Unknown')
        : String(key),
      avatar: groupBy === 'person' ? (first?.author?.avatar || null) : null,
      items: sorted,
    };
  });

  // Years descending, because a place is read from what happened last. People
  // alphabetically, because there is no natural order among them and an arbitrary one
  // changes under the reader as memories arrive.
  return groupBy === 'person'
    ? groups.sort((a, b) => a.label.localeCompare(b.label))
    : groups.sort((a, b) => Number(b.key) - Number(a.key));
}

/** The two numbers at the top of the place: how many memories, and how many people. */
export function placeStats(memories = []) {
  return {
    memories: memories.length,
    visitors: peopleAtPlace(memories).length,
  };
}
