import React, { useState } from 'react';
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

/**
 * Where the original lives, for Download original. The server's `originalUrl` comes first: it
 * is sent only to the media's owner (I3, MEDIA-Q3 option A) and is the only original a
 * list-shape item (places, lifeline, holding area) carries. Then the stored server original
 * (journal items). Only a web address: never the device copy, which is not failed and is not
 * the server's to offer.
 */
const isWebAddress = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
export function originalUrlOf(media) {
  if (!media) return null;
  return [media.originalUrl, media.serverUrl, media.url].find(isWebAddress) || null;
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

/**
 * One slot in a grid or list of tiles where the tile sits inside the host's own touchable.
 * `children` receives the `onFailedOwner` callback to give DerivativeImage and returns the
 * host's touchable; the owner's Try again / Download original then render beside it, outside
 * it, so no button is nested in another. `style` is the slot's (give it the tile's width).
 */
export function FailedSlot({ children, style }) {
  const [actions, onFailedOwner] = useState(null);
  return (
    <View style={style}>
      {children(onFailedOwner)}
      {actions ? (
        <View style={styles.slotActions} pointerEvents="box-none">
          <FailedActions actions={actions} />
        </View>
      ) : null}
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
  // Over the foot of the slot (outside the host's touchable), so a fixed-size cell never grows.
  slotActions: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.85)', paddingBottom: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  button: { paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: 2 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#0A66C2', fontSize: 12, fontWeight: '600' },
  error: { color: '#B00020', fontSize: 11, textAlign: 'center', width: '100%', marginTop: 2 },
});

export default FailedTile;
