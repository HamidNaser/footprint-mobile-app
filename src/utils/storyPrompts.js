/**
 * "Seven photographs here from 1975, and no story yet."
 *
 * Turns the memories at a place into prompts to record one. The backend decides *which*
 * memories qualify — `needsStory` on each memory means photographs with no text and no
 * voice — so this file only decides how to ask.
 *
 * The wording matters more than it looks. "Tell me about Swansea in 1975" gets a better
 * answer than "here are some photos, write something", because the place and the year are
 * already in front of the person. That is the whole reason the prompt lives on a place
 * rather than in a generic inbox.
 *
 * Ported from the web app so both clients ask in the same words. Mobile previously read
 * `getStoryPrompts` from the seeded data file, keyed on mock place ids, so a real place
 * produced no prompt at all.
 */

/** A memory with no author name still needs asking about; "someone" is not useful. */
const nameOf = (memory) => memory.authorName || memory.author?.name || null;

const avatarOf = (memory) => memory.authorAvatar || memory.author?.avatar || null;

/**
 * Places adapts a memory on its way to the screen: the API gives `photos` as urls, and
 * `adaptMemory` turns those into `media` objects. Both shapes reach this file, and counting
 * only one of them would word every prompt on the cards as "This memory".
 */
function countPhotos(memory) {
  if (Array.isArray(memory.photos)) return memory.photos.length;
  if (Array.isArray(memory.media)) return memory.media.length;
  return 0;
}

function photoPhrase(count) {
  if (count <= 0) return 'This memory';
  return count === 1 ? 'One photograph' : `${count} photographs`;
}

/**
 * How to ask, which depends on whose memory it is.
 *
 * Someone else's photographs are a request — you cannot answer for them. Your own are an
 * invitation, and the second person is what makes it feel like one.
 */
function promptFor(memory, year) {
  const count = countPhotos(memory);
  const when = year ? ` from ${year}` : '';
  const name = nameOf(memory);

  if (memory.isCurrentUser) {
    const subject = count === 1 ? 'it' : 'them';
    return count > 0
      ? `${photoPhrase(count)}${when}, and no story yet — tell us about ${subject}`
      : `This memory${when} has no story yet — tell us about it`;
  }

  if (!name) {
    return `${photoPhrase(count)}${when}, and no story yet`;
  }

  // A memory whose photographs did not load is still worth asking about, but naming a
  // count of zero reads as a bug to whoever sees it.
  if (count === 0) {
    return `Ask ${name} about this memory${when}`;
  }

  const subject = count === 1 ? 'this photograph' : `these ${count} photographs`;
  return `Ask ${name} about ${subject}${when}`;
}

/**
 * Build the prompts for a year at a place.
 *
 * @param {Array<object>} memories - adapted place memories, each carrying `needsStory`
 * @param {number} [year] - the year being viewed, used only for wording
 * @returns {Array<{memoryId: string, memory: object, author: {name: string|null, avatar: string|null}, prompt: string, year: number|undefined}>}
 */
export function buildStoryPrompts(memories, year) {
  if (!Array.isArray(memories)) return [];

  return memories
    .filter((memory) => memory?.needsStory)
    .map((memory) => ({
      memoryId: memory.id,
      // Carried whole so the interview can target this entry. Passing only the id would
      // mean re-finding the memory to know who to interview.
      memory,
      author: { name: nameOf(memory), avatar: avatarOf(memory) },
      prompt: promptFor(memory, year),
      year,
    }));
}

export default buildStoryPrompts;
