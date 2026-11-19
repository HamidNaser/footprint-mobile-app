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
 *
 * T073 adds **Remove**, at the end of each row's meta line (FR-036). Two things about it are
 * this file's and not the screen's:
 *
 *   - **It reports the piece, not the row's number.** The screen removes by `localId`
 *     (`CaptureDraftStore.removePiece(slot, localId)`), and an index is precisely the thing
 *     that stops being true the moment a row goes.
 *   - **The last remaining piece has none**, whatever its kind. A memory with no pieces cannot
 *     be saved, so a control that could empty the list would leave Save silently doing nothing;
 *     emptying a new memory is Discard [FR-015], and an edit's last piece would mean deleting
 *     the memory itself, which this feature does not change.
 *
 * Everything else about a removal -- whether it happens, what the question says, what is
 * written and what is said when it cannot be -- is the screen's (`CaptureScreen`). Here it is a
 * button that reports a tap.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
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
function PieceRow({
  piece,
  index,
  onChangeText,
  onBlurText,
  onRemove,
  canRemove,
  focusNonce,
  isRecording,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus?.();
  }, [focusNonce]);

  const kind = KINDS[piece.kind];

  return (
    <View testID={`piece-row-${index}`} style={styles.row}>
      <View testID={`piece-meta-${index}`} style={styles.meta}>
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

        {canRemove && (
          // ⚠ Deliberately **not** deadened while a recording runs, unlike the player below.
          // The player's control is, because playing a clip asks the one shared audio session
          // for `allowsRecording: false` and would end the recording; removing touches no
          // audio session at all, so there is nothing for it to interrupt (FR-007).
          <TouchableOpacity
            testID={`piece-remove-${index}`}
            accessibilityRole="button"
            // The row's own kind, which is the only thing that tells four otherwise identical
            // controls apart for somebody reading by label alone (UI contract).
            accessibilityLabel={`Remove this ${kindLabel(piece.kind)}`}
            // A genuine 44pt target, which is what both platforms ask for and what this
            // control in particular needs: it sits at the end of a line whose place name is
            // `numberOfLines={1}` and can run right up to it. The label is 13pt (~16pt tall)
            // with 6pt of padding above and below, so 28pt is drawn and 8pt of slop at each
            // end makes 44; sideways it is wider than that before the slop is counted.
            hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
            style={styles.remove}
            onPress={() => onRemove?.(piece)}
          >
            <Text style={styles.removeLabel}>Remove</Text>
          </TouchableOpacity>
        )}
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
 * @param {(piece: object) => void} [props.onRemove] A row's Remove was tapped, with that row's
 *   own piece (FR-036). Never offered on the last remaining piece, so this is never the call
 *   that empties a memory.
 * @param {{localId: string, nonce: number}|null} [props.focusRequest] Which note should take
 *   the keyboard, and a nonce so the same note can be asked for twice.
 * @param {boolean} [props.isRecording] True while a voice recording is running on this screen,
 *   which stops a clip already on the list from being played over it (FR-007).
 */
export default function PieceList({
  pieces = [],
  onChangeText,
  onBlurText,
  onRemove,
  focusRequest,
  isRecording = false,
}) {
  // How many pieces there are, and nothing about what kind the last one is: a one-piece memory
  // offers no Remove at all, because the memory it would empty cannot be saved.
  const canRemove = pieces.length > 1;

  return (
    <View testID="capture-piece-list" style={styles.list}>
      {pieces.map((piece, index) => (
        <PieceRow
          key={piece.localId ?? `piece-${index}`}
          piece={piece}
          index={index}
          onChangeText={onChangeText}
          onBlurText={onBlurText}
          onRemove={onRemove}
          canRemove={canRemove}
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
  remove: {
    // Six at each end, which with the 13pt label and the control's `hitSlop` is the 44pt
    // touch target. See the control.
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  removeLabel: {
    fontSize: 13,
    fontWeight: '600',
    // The app's own destructive red -- the one on the composer's remove-attachment control and
    // the place picker's trash. Deliberately **not** `KINDS.audio`'s `#E5484D`: that is the
    // colour of the words "Voice clip" at the other end of this very line, and two identical
    // reds on one meta line read as one thing said twice.
    color: '#FF3B30',
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
