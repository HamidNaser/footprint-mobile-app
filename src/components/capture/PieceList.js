/**
 * PieceList (013 T030) -- the pieces of one memory, in the order they were captured.
 *
 * FR-005 is the point of this file: **the list order is the capture order**, and a text note
 * keeps its place in it rather than being hoisted to the top the way today's composer hoists
 * its one text field. Nothing here sorts, groups or re-reads a time; the array it is given is
 * the order, which is the same rule `buildContentBlocks` follows on the way to the server
 * (research R8).
 *
 * Each row carries what FR-004 says a piece records -- its kind, the local time it was
 * captured, and where -- so that a person scrolling a half-finished memory can see that the
 * clip from the bus really is the clip from the bus.
 *
 * Three decisions worth stating:
 *
 * 1. **The time is the instant, rendered locally.** `capturedAt` is stored as an ISO-8601 UTC
 *    instant (never a civil date), and the row shows it in the phone's own zone, zero-padded.
 *    Slicing `HH:mm` out of the string would be the same characters for a phone in UTC and
 *    wrong by hours for every other phone.
 * 2. **"No place" means no place.** A piece captured with a coordinate but no name yet is not
 *    place-less -- `CaptureLocation` stamps `{lat, lng, accuracy}` and no name, and a name
 *    only arrives with a place that has one (a block of an edited memory). Saying "No place"
 *    there would tell somebody their place was not kept when it was, so that case reads
 *    "Place recorded" instead.
 * 3. **An unrecognised kind is shown, not hidden.** A draft written by some other producer
 *    could carry a kind this list does not know; `buildContentBlocks` refuses to *save* such
 *    a piece (so it cannot be lost silently), and the least this list can do is show that
 *    there is something there rather than render an empty space.
 *
 * T054 adds the voice player: the audio row's detail line is where it goes, replacing the
 * duration text with a play/pause control (FR-020). Nothing else about the row changes -- the
 * row's kind, time and place are the meta line above it, so the control carries only the
 * clip's position and length. It is the same `VoicePlayer` the Journal card's voice pill uses,
 * which is also what makes "one clip plays at a time" hold across the two screens.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
// `formatClock` comes with it: an audio row and the video row under it must not round the same
// 11.6 seconds two different ways, and one of the two formatters had to go.
import VoicePlayer, { formatClock } from '../journal/VoicePlayer';

/** What each kind is called on a row. The label is the contract; the colour is cosmetic. */
const KINDS = {
  text: { label: 'Note', colour: '#2B7DE9', icon: '✎' },
  audio: { label: 'Voice clip', colour: '#E5484D', icon: '◉' },
  photo: { label: 'Photo', colour: '#1F9D55', icon: '▣' },
  video: { label: 'Video', colour: '#9333EA', icon: '▶' },
};

/** A kind with no entry above is still a piece, and still says so. */
export const kindLabel = (kind) => KINDS[kind]?.label ?? 'Piece';

/**
 * The capture instant in the phone's own zone, `HH:mm`, zero-padded (UI contract).
 *
 * Built from the `Date` rather than from the string: the two are the same characters only on
 * a phone that happens to be in UTC.
 */
export const localHhMm = (capturedAt) => {
  if (!capturedAt) return '--:--';
  const at = new Date(capturedAt);
  if (Number.isNaN(at.getTime())) return '--:--';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/** The place name, or that there is a place but no name yet, or that there is none. */
export const placeLabel = (location) => {
  if (location?.name) return location.name;
  if (location?.lat != null && location?.lng != null) return 'Place recorded';
  return 'No place';
};

/** Everything but a note and a voice clip: those two have a control of their own. */
const detailFor = (piece) => {
  if (piece.kind === 'video') return `Video · ${formatClock(piece.duration)}`;
  if (piece.kind === 'photo') return 'Photo kept with this memory';
  return 'Kept with this memory';
};

/**
 * One piece.
 *
 * `focusNonce` is how the screen asks for this row's note to take the keyboard: it rises by
 * one each time Type is tapped on a memory whose last piece is already a note, so the effect
 * below runs again and focuses the field that is already there instead of a second empty note
 * being added. Zero means "not the focus target".
 */
function PieceRow({ piece, index, onChangeText, onBlurText, focusNonce, isRecording }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus?.();
  }, [focusNonce]);

  const kind = KINDS[piece.kind];

  return (
    <View testID={`piece-row-${index}`} style={styles.row}>
      <View style={styles.meta}>
        <Text
          testID={`piece-kind-${index}`}
          style={[styles.kind, kind?.colour ? { color: kind.colour } : null]}
        >
          {kindLabel(piece.kind)}
        </Text>
        <Text testID={`piece-time-${index}`} style={styles.time}>
          {localHhMm(piece.capturedAt)}
        </Text>
        <Text testID={`piece-place-${index}`} style={styles.place} numberOfLines={1}>
          {placeLabel(piece.location)}
        </Text>
      </View>

      {piece.kind === 'text' ? (
        <TextInput
          ref={inputRef}
          testID={`piece-note-input-${index}`}
          style={styles.note}
          value={piece.content ?? ''}
          onChangeText={(content) => onChangeText?.(piece, content)}
          onBlur={() => onBlurText?.(piece)}
          placeholder="What's happening?"
          placeholderTextColor="#8E8E93"
          multiline
        />
      ) : piece.kind === 'audio' ? (
        // The clip plays here, on the row, rather than only once the memory is saved (FR-020).
        <VoicePlayer
          testID={`piece-player-${index}`}
          // `sourceUri` is the clip of a piece the memory already has, loaded back by an edit
          // (013 T058). Such a piece carries **no** `uri` on purpose -- that field is what the
          // draft store copies and what `buildContentBlocks` writes out as a pending local
          // file, so setting it would re-upload a clip the server already holds -- which left
          // every existing clip reading "This voice clip is unavailable" for the whole of an
          // edit, the one screen state in which FR-020's clips did not play.
          uri={piece.uri ?? piece.sourceUri}
          duration={piece.duration}
          waveform={piece.waveform}
          // ⚠ Load-bearing, not cosmetic: playing a clip asks the one shared audio session for
          // `allowsRecording: false`, which would end the recording running below this list
          // (FR-007). The rows sit above the dock with nothing between them.
          isRecording={isRecording}
          style={styles.player}
        />
      ) : (
        <Text testID={`piece-detail-${index}`} style={styles.detail}>
          {detailFor(piece)}
        </Text>
      )}
    </View>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.pieces In capture order. The array *is* the order (FR-005).
 * @param {(piece: object, content: string) => void} [props.onChangeText]
 * @param {(piece: object) => void} [props.onBlurText]
 * @param {{localId: string, nonce: number}|null} [props.focusRequest] Which note should take
 *   the keyboard, and a nonce so the same note can be asked for twice.
 * @param {boolean} [props.isRecording] True while a voice recording is running on this screen,
 *   which stops a clip already on the list from being played over it (FR-007).
 */
export default function PieceList({
  pieces = [],
  onChangeText,
  onBlurText,
  focusRequest,
  isRecording = false,
}) {
  return (
    <View testID="capture-piece-list" style={styles.list}>
      {pieces.map((piece, index) => (
        <PieceRow
          key={piece.localId ?? `piece-${index}`}
          piece={piece}
          index={index}
          onChangeText={onChangeText}
          onBlurText={onBlurText}
          focusNonce={focusRequest?.localId === piece.localId ? focusRequest.nonce : 0}
          isRecording={isRecording}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFF4',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kind: {
    fontSize: 13,
    fontWeight: '700',
  },
  time: {
    fontSize: 13,
    color: '#8E8E93',
    fontVariant: ['tabular-nums'],
  },
  place: {
    flex: 1,
    fontSize: 13,
    color: '#8E8E93',
  },
  note: {
    marginTop: 6,
    fontSize: 16,
    color: '#1C1C1E',
    minHeight: 40,
    textAlignVertical: 'top',
  },
  detail: {
    marginTop: 6,
    fontSize: 15,
    color: '#1C1C1E',
  },
  player: {
    marginTop: 6,
  },
});
