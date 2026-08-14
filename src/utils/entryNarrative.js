/**
 * Whether a memory has anything said about it.
 *
 * <p>
 * A photograph without context decays into an unidentifiable image — the box of prints
 * nobody can label because everyone who knew is gone. Finding those while somebody can
 * still answer is the point of the interview feature, and this is the predicate that finds
 * them.
 * </p>
 *
 * Mirrors `EntryNarrative` on the backend, deliberately and by hand. The web asks the
 * server (`?needsStory=true`) because it reads from the API; mobile reads its own SQLite
 * database, so the same rule has to exist here. Two copies of one rule can drift, which is
 * why the definition below is stated in the same words as the backend's and why the tests
 * cover the same cases.
 *
 *   An entry has no story when it has media blocks, and no text block, and no audio block.
 *
 * Derived rather than stored. A `hasStory` column would go stale the moment an entry is
 * edited, and the mock version of exactly that flag is why "untold stories" sat dark for
 * months.
 */

/** Every name a photograph block goes by locally. Server entries arrive as `photos`; the
 *  compose flow has historically written `image` and `photo` too. */
const MEDIA_TYPES = new Set(['photos', 'photo', 'image', 'images', 'video', 'videos']);

const isMediaBlock = (block) =>
  MEDIA_TYPES.has(block?.type) || (Array.isArray(block?.media) && block.media.length > 0);

const hasMedia = (block) => {
  if (Array.isArray(block?.media)) return block.media.length > 0;
  // A bare media block with no `media` array is one item in itself -- the shape the photo
  // reader in JournalScreen already falls back to.
  return isMediaBlock(block) && Boolean(block?.localPath || block?.serverUrl || block?.uri);
};

/** True when somebody has written or recorded something about this memory. */
export function hasNarrative(entry) {
  const blocks = entry?.contentBlocks;
  if (!Array.isArray(blocks)) return false;

  return blocks.some((block) => {
    if (block?.type === 'text') {
      return typeof block.content === 'string' && block.content.trim() !== '';
    }
    // A voice counts as much as a paragraph. For a family memory it counts for more: a
    // grandchild will re-read the transcript, but they will listen to the voice.
    if (block?.type === 'audio') {
      return hasMedia(block);
    }
    return false;
  });
}

/**
 * True when the entry has media but nothing said about it.
 *
 * Deliberately narrow. A missing title or caption does not count; this is about a memory
 * nobody has explained. An entry with no media at all is not missing a story, so it is
 * excluded rather than counted.
 */
export function needsStory(entry) {
  const blocks = entry?.contentBlocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return false;

  if (!blocks.some((block) => isMediaBlock(block) && hasMedia(block))) return false;

  return !hasNarrative(entry);
}

/** The entries worth asking about, newest first. */
export function entriesNeedingStory(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(needsStory);
}

export default needsStory;
