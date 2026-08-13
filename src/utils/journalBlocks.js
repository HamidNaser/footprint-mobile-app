/**
 * Content-block assembly for a capture session.
 *
 * A compose session is a timeline: photo, note, voice note, video, note. The
 * entry should read back in that order. Grouping by kind (all photos, then all
 * videos, then the audio) misrepresents what happened -- a voice note recorded
 * *about* the photo before it ends up detached from it.
 *
 * Kept separate from JournalComposeModal so the ordering rules can be tested
 * without mounting a modal or a camera.
 */

/**
 * Assemble ordered content blocks from a capture session.
 *
 * @param {object} params
 * @param {string} params.text - primary composer text; always opens the entry
 * @param {Array<object>} params.attachedMedia - photos/videos, each `{uri, type, capturedAt}`
 * @param {Array<object>} params.audioRecordings - `{uri, duration, capturedAt}`
 * @param {Array<object>} params.textNotes - `{content, capturedAt}`
 * @param {object} [params.blockLocation] - entry-level `{lat, lng, name}`
 * @param {(m: object) => object|undefined} [params.mediaLocation] - per-item coordinate resolver
 * @returns {Array<object>} content blocks in capture order
 */
export function buildContentBlocks({
  text = '',
  attachedMedia = [],
  audioRecordings = [],
  textNotes = [],
  blockLocation,
  // Consults the item first: an audio note or text note stamped at capture carries its own
  // position, and the entry-level location is only a fallback.
  mediaLocation = (m) => m?.location || blockLocation,
}) {
  const blocks = [];

  if (text.trim()) {
    blocks.push({ type: 'text', content: text.trim(), location: blockLocation });
  }

  // 'image' comes from the gallery picker, 'photo' from the in-modal camera.
  const captures = [
    ...attachedMedia.map((m) => ({
      kind: m.type === 'video' ? 'video' : 'photo',
      item: m,
      at: m.capturedAt ?? 0,
    })),
    ...audioRecordings.map((a) => ({ kind: 'audio', item: a, at: a.capturedAt ?? 0 })),
    ...textNotes.map((t) => ({ kind: 'text', item: t, at: t.capturedAt ?? 0 })),
  ].sort((a, b) => a.at - b.at);

  let i = 0;
  while (i < captures.length) {
    const { kind } = captures[i];

    if (kind === 'photo') {
      // Collapse a consecutive run into one block so the card can lay them out
      // as a grid. A photo taken after a voice note starts a new block.
      const run = [];
      while (i < captures.length && captures[i].kind === 'photo') {
        run.push(captures[i].item);
        i += 1;
      }
      blocks.push({
        type: 'photos',
        location: blockLocation,
        media: run.map((p) => ({
          localId: p.localId || `photo-${p.capturedAt ?? 0}-${p.uri}`,
          localPath: p.uri,
          width: p.width,
          height: p.height,
          location: mediaLocation(p),
        })),
      });
      continue;
    }

    const { item } = captures[i];

    if (kind === 'video') {
      blocks.push({
        type: 'video',
        location: blockLocation,
        media: [{
          localId: item.localId || `video-${item.capturedAt ?? 0}-${item.uri}`,
          localPath: item.uri,
          width: item.width,
          height: item.height,
          duration: item.duration,
          location: mediaLocation(item),
        }],
        duration: item.duration,
      });
    } else if (kind === 'audio') {
      // The recording's own position when it has one, per Decision 10. It used to inherit
      // the entry's single picked location, which for most entries is nothing -- so a
      // grandmother recorded in Paris was filed as having happened nowhere.
      const recordedAt = mediaLocation(item);
      blocks.push({
        type: 'audio',
        location: recordedAt,
        media: [{
          localId: item.localId || `audio-${item.capturedAt ?? 0}-${item.uri}`,
          localPath: item.uri,
          location: recordedAt,
        }],
        duration: item.duration,
        waveform: item.waveform,
      });
    } else if (kind === 'text') {
      // Same for a typed note: where the thought was written, not where the entry was
      // tagged afterwards.
      blocks.push({ type: 'text', content: item.content, location: mediaLocation(item) });
    }

    i += 1;
  }

  return blocks;
}
