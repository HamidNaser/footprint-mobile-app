/**
 * CaptureDock (013 T030) -- Type · Voice · Camera, always on screen (FR-002).
 *
 * The dock is three controls and no menu: FR-002 is "the capture screen MUST always show
 * three controls", and SC-001 budgets **one tap** for each switch, so anything that had to
 * be opened first would cost a tap it does not have.
 *
 * **The Voice control is handed in, not built here** (`voice`), and that is the whole reason
 * this component takes an element rather than an `onVoice` callback. `VoiceRecorderBar` owns
 * both of its states -- idle it is this slot's button, recording it is the bar with the timer
 * and Stop -- because a Voice tap that merely revealed a bar needing a second "record" tap
 * would make FR-006's one tap two. Everything about a running recording (the recorder, the
 * audio session, the elapsed time, the 5:00 cap) lives inside that component, so **it must
 * keep its place in the tree across the change**: moving it to a different parent would
 * unmount it and end the recording it is in the middle of. The slot below therefore stays at
 * the same position in this row either way, and the full-width bar is a *restyle* of the
 * slot, never a different home for it.
 *
 * The row's two end buttons are fixed-width with `space-between`, so that when the slot
 * leaves the flow (recording) Type and Camera stay exactly where a thumb last found them
 * rather than sliding into the gap.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** The row's height, and so how far above it the recording bar sits. */
export const DOCK_ROW_HEIGHT = 72;

/**
 * @param {object} props
 * @param {() => void} props.onType Add a note, or go back to the note at the end.
 * @param {() => void} props.onCamera Open the camera.
 * @param {React.ReactNode} props.voice The `VoiceRecorderBar` element; see the file header.
 * @param {boolean} [props.isRecording] Lays the voice slot out as the full-width bar above
 *   the row instead of as the row's middle button. Never remounts `voice`.
 */
export default function CaptureDock({ onType, onCamera, voice, isRecording = false }) {
  return (
    <View testID="capture-dock" style={styles.dock}>
      <TouchableOpacity
        testID="capture-type-button"
        accessibilityRole="button"
        accessibilityLabel="Type a note"
        style={styles.button}
        onPress={onType}
      >
        <Ionicons name="create-outline" size={22} color="#2B7DE9" />
        <Text style={styles.label}>Type</Text>
      </TouchableOpacity>

      <View style={[styles.voiceSlot, isRecording && styles.voiceSlotRecording]}>{voice}</View>

      <TouchableOpacity
        testID="capture-camera-button"
        accessibilityRole="button"
        accessibilityLabel="Open the camera"
        style={styles.button}
        onPress={onCamera}
      >
        <Ionicons name="camera-outline" size={22} color="#2B7DE9" />
        <Text style={styles.label}>Camera</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: DOCK_ROW_HEIGHT,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  button: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  label: {
    marginTop: 4,
    fontSize: 12,
    color: '#2B7DE9',
  },
  voiceSlot: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Out of the row's flow and spanning it, directly above it -- the UI contract's
  // "recording bar above the dock, full width". `bottom` is the row's own height, so the
  // bar's lower edge meets the row's upper one.
  voiceSlotRecording: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: DOCK_ROW_HEIGHT,
    width: undefined,
  },
});
