/**
 * SaveAudienceSheet (013 T028) -- "Who can see it?", the one tap that saves a new memory.
 *
 * FR-010: Only me, Family, Friends, Family & Friends, with **Family pre-selected**; choosing
 * one saves the memory, and no title or any other field is asked for. The values handed up are
 * today's (research R13): `private`, `family`, `friends`, `family_friends` -- the same four as
 * `VisibilityOptions` in `src/components/journal/JournalComposeModal.js`. They are restated
 * here rather than imported so that this sheet does not pull that whole modal (and its media
 * tree) into every screen that opens it; `AUDIENCE_OPTIONS` below is the single list, and the
 * values must stay in step with that file.
 *
 * FR-011, and this project's standing rule that **sharing fails closed**: dismissing the sheet
 * saves nothing. There is no default choice on the way out, no "most likely" audience, and
 * nothing is reported upward at all -- a dismissal calls `onDismiss` and never `onChoose`. The
 * pre-selected Family is a visual hint about where a tap is expected; it is not a value this
 * component will ever send on its own. Every route out does exactly the same thing: the
 * backdrop, Cancel, and Android's back button through `Modal`'s `onRequestClose`.
 *
 * It is **presentational, and driven entirely by props**. It performs no save, knows nothing
 * about drafts or the network, and cannot tell a new memory from a refused one being re-shared
 * -- because the card's re-share reuses this very component (T035/T036, FR-011). FR-010's
 * *"Save on an edit MUST save straight away, keeping the memory's existing audience, no sheet"*
 * is the **caller's** rule: an edit never opens this sheet, so there is deliberately no edit
 * mode here to get wrong.
 *
 * The copy is the prototype's: "Who can see it?", "One tap saves. You can change it later.",
 * and "Only me" -- note the lower-case "me", as spec FR-010 and the prototype write it, where
 * the older `JournalComposeModal`/`JournalEntryCard` labels read "Only Me".
 *
 * There is no swipe-to-dismiss: this is a React Native `Modal`, and the app carries no gesture
 * library to implement one. Should one be added, it must call `onDismiss` and nothing else.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

/** FR-010, in the order the sheet shows them. Values: research R13. */
export const AUDIENCE_OPTIONS = [
  { value: 'private', label: 'Only me', icon: 'lock-closed-outline' },
  { value: 'family', label: 'Family', icon: 'people-outline' },
  { value: 'friends', label: 'Friends', icon: 'person-add-outline' },
  { value: 'family_friends', label: 'Family & Friends', icon: 'globe-outline' },
];

/**
 * FR-010: Family is pre-selected, for a caller that carries no choice of its own. A hint only --
 * it is never sent without a tap.
 */
export const PRE_SELECTED_AUDIENCE = 'family';

/**
 * @param {object} props
 * @param {boolean} props.visible
 * @param {(visibility: 'private'|'family'|'friends'|'family_friends') => void} props.onChoose
 *   The explicit choice FR-011 requires. Called with the visibility and nothing else.
 * @param {() => void} props.onDismiss Left without choosing. Nothing is saved (FR-011).
 * @param {'private'|'family'|'friends'|'family_friends'} [props.preSelected]
 *   Which option opens ticked. Defaults to Family (FR-010).
 *
 *   **It exists so that a choice the person has already made somewhere else is not silently
 *   replaced by a wider one** (fix round 1 after the whole-branch review, Important 2). The
 *   Journal's quick bar carries its own "Who can see this?" picker; somebody who set it to
 *   **Only me** and tapped Send used to land on this sheet pre-selecting **Family**, with their
 *   own choice discarded and the replacement wider than what they asked for -- the one direction
 *   this project's "sharing fails closed" rule rules out. `CaptureScreen` now passes the
 *   audience the bar was left on straight through to here.
 *
 *   A value this sheet does not offer ticks **nothing**, rather than falling back to Family: an
 *   unrecognised audience is a caller's bug, and the safe shape of that bug is a sheet that
 *   makes the person say what they mean, not one quietly suggesting an audience that may be
 *   wider than they wanted. Either way nothing is ever sent without a tap.
 */
export default function SaveAudienceSheet({
  visible,
  onChoose,
  onDismiss,
  preSelected = PRE_SELECTED_AUDIENCE,
}) {
  // Closed means nothing of it exists -- not a hidden `Modal` still holding its subtree, and
  // so nothing that could be reached while it is not on screen.
  if (!visible) return null;

  return (
    <Modal
      testID="audience-sheet-modal"
      visible={visible}
      transparent
      animationType="slide"
      // Android's back button. The one way out with no control on screen, and it must save
      // no more than the other two (FR-011).
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          testID="audience-sheet-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close without saving"
          style={styles.backdrop}
          onPress={onDismiss}
        />

        <View testID="audience-sheet" style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>

            <Text style={styles.title}>Who can see it?</Text>
            <Text style={styles.subtitle}>One tap saves. You can change it later.</Text>

            {AUDIENCE_OPTIONS.map(({ value, label, icon }) => {
              const isPreSelected = value === preSelected;
              return (
                <TouchableOpacity
                  key={value}
                  testID={`audience-option-${value}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isPreSelected }}
                  style={[styles.option, isPreSelected && styles.optionSelected]}
                  onPress={() => onChoose?.(value)}
                >
                  <Ionicons name={icon} size={20} color="#1C1C1E" />
                  <Text style={styles.optionLabel}>{label}</Text>
                  {isPreSelected && (
                    <Ionicons
                      testID={`audience-option-${value}-selected`}
                      name="checkmark"
                      size={20}
                      color="#2B7DE9"
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              testID="audience-sheet-cancel-button"
              accessibilityRole="button"
              accessibilityLabel="Cancel without saving"
              style={styles.cancel}
              onPress={onDismiss}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D6',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: '#8E8E93',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  optionSelected: {
    borderColor: '#2B7DE9',
    backgroundColor: '#F2F7FF',
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
});

export { SaveAudienceSheet };
