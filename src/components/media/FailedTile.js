import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

/**
 * The owner's failed tile (007 FR-019, FR-022): "This photo couldn't be prepared", the reason
 * in plain words, Try again and Download original.
 *
 * The server sends `failureReason` to the owner only, so DerivativeImage shows this tile only
 * when a reason is present; everyone else gets "Photo unavailable" with no actions.
 *
 * <p>
 * Where the host wraps the tile in a Pressable, nesting the buttons inside it works but makes
 * touch handling confusing. Such a host passes `onFailedOwner` to DerivativeImage: the tile then
 * shows words only, hands `{ tryAgain, retrying, retryError, originalUrl }` (or `null`) to the
 * host, and the host renders <FailedActions> as a SIBLING outside its Pressable. Mirrors the
 * web `onFailedOwner` / `FailedActions`.
 * </p>
 */

// Plain words for the server's failure reasons (FR-019). Anything new reads as a generic problem.
export const REASON_WORDS = {
  unsupported_format: 'format not supported',
  corrupt: 'file damaged',
  timed_out: 'timed out',
  internal: 'a processing problem',
};
export const reasonWords = (reason) => REASON_WORDS[reason] || REASON_WORDS.internal;

export const failedLabel = (media) => `This ${media?.kind === 'video' ? 'video' : 'photo'} couldn't be prepared`;
export const RETRY_ERROR_TEXT = "Couldn't try again just now. Please try later.";
const SMALL_PX = 60;

/** Where the original lives, for Download original. Never the device copy: that one is not failed. */
export function originalUrlOf(media) {
  const url = media?.serverUrl || media?.url;
  return typeof url === 'string' && url ? url : null;
}

export function openOriginal(url) {
  if (url) Linking.openURL(url).catch(() => {});
}

export function FailedActions({ actions }) {
  if (!actions) return null;
  return (
    <View style={styles.actions} testID="media-failed-actions">
      <TouchableOpacity
        accessibilityRole="button"
        onPress={actions.tryAgain}
        disabled={actions.retrying}
        style={[styles.button, actions.retrying && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
      {actions.originalUrl ? (
        <TouchableOpacity accessibilityRole="link" onPress={() => openOriginal(actions.originalUrl)} style={styles.button}>
          <Text style={styles.buttonText}>Download original</Text>
        </TouchableOpacity>
      ) : null}
      {actions.retryError ? <Text style={styles.error}>{RETRY_ERROR_TEXT}</Text> : null}
    </View>
  );
}

export function FailedTile({ style, media, failureReason, tryAgain, retrying, retryError, showActions = true }) {
  const flat = StyleSheet.flatten(style) || {};
  const small = [flat.width, flat.height].some((d) => typeof d === 'number' && d < SMALL_PX);
  const label = failedLabel(media);
  return (
    <View style={[styles.plate, style]} testID="media-failed" accessible accessibilityLabel={label}>
      {small ? null : (
        <>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.reason}>{reasonWords(failureReason)}</Text>
          {showActions ? (
            <FailedActions actions={{ tryAgain, retrying, retryError, originalUrl: originalUrlOf(media) }} />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 6 },
  label: { color: '#444', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  reason: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  button: { paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: 2 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#0A66C2', fontSize: 12, fontWeight: '600' },
  error: { color: '#B00020', fontSize: 11, textAlign: 'center', width: '100%', marginTop: 2 },
});

export default FailedTile;
