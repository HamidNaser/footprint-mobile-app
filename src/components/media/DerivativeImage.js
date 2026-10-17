import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useMediaDerivative } from '../../hooks/useMediaDerivative';
import { FailedTile, originalUrlOf } from './FailedTile';

/**
 * One photo tile, in every state of the 007 display-copy lifecycle.
 *
 * Give it the media item, not a URL: the hook picks the source (`thumbnailSource` for tiles,
 * `fullSizeSource` when `variant="display"`), and a source that does not exist yet renders the
 * pending placeholder -- an <Image> is never handed `{ uri: null }`.
 *
 *  - local photo, or a ready copy ... the image
 *  - pending ........................ grey plate, "Preparing photo…" (FR-020; label only on tiles under 60 px)
 *  - unavailable / loadFailed ....... "Photo unavailable"
 *  - failed (server verdict) ........ the owner (the server sent a `failureReason`) gets "This photo
 *                                     couldn't be prepared", the reason, Try again and Download
 *                                     original (FailedTile); anyone else gets "Photo unavailable"
 *                                     with no actions. Pass `onFailedOwner` where the tile sits in
 *                                     a Pressable, to take the actions as a sibling instead.
 *  - uploadFailed / missingFile ..... "Photo couldn't be uploaded" (the photo never left the device)
 *
 * `onStateChange(status)` fires whenever the tile settles into a new status: 'pending',
 * 'loading' (an image is mounted, not yet loaded), 'loaded', 'unavailable', 'loadFailed',
 * 'failed', 'uploadFailed'. The map marker uses it to know when a native snapshot is stale.
 *
 * Legacy: an item with no id and a plain `uri` (the seeded demo memories in data/placesData)
 * renders that uri directly and never polls -- the web id-less bridge.
 *
 * Video tiles do not use this: they keep VideoThumbnail (its poster and play overlay, T078).
 */

export const PHOTO_UNAVAILABLE = 'Photo unavailable';
export const PHOTO_PREPARING = 'Preparing photo…';
/** Under this many px (either side) a tile is too small for words; the label stays accessible. */
export const SMALL_TILE_PX = 60;
export const PHOTO_NOT_UPLOADED = "Photo couldn't be uploaded";

/** A seeded demo item: a plain uri, no media id, no server copies. */
function isLegacy(media) {
  return (
    !!media &&
    typeof media.uri === 'string' &&
    !!media.uri &&
    !media.id &&
    !media.mediaId &&
    !media.unresolved &&
    !media.thumbnailUrl &&
    !media.displayUrl &&
    !media.localPath
  );
}

function isSmall(style) {
  const flat = StyleSheet.flatten(style) || {};
  return [flat.width, flat.height].some((d) => typeof d === 'number' && d < SMALL_TILE_PX);
}

function Plate({ style, testID, label }) {
  const small = isSmall(style);
  return (
    <View
      style={[styles.plate, style]}
      testID={testID}
      accessible
      accessibilityLabel={label ? label.replace(/…$/, '') : undefined}
    >
      {label && !small ? <Text style={styles.plateText}>{label}</Text> : null}
    </View>
  );
}

/**
 * The server sends `failureReason` to the owner only (media-status contract), so its presence is
 * the ownership signal; without it the photo is just unavailable. Fails closed (FR-019).
 */
const defaultRenderFailed = ({ style, media, failureReason, tryAgain, retrying, retryError, hostTakesActions }) =>
  failureReason ? (
    <FailedTile
      style={style}
      media={media}
      failureReason={failureReason}
      tryAgain={tryAgain}
      retrying={retrying}
      retryError={retryError}
      showActions={!hostTakesActions}
    />
  ) : (
    <Plate style={style} testID="media-failed" label={PHOTO_UNAVAILABLE} />
  );

function DerivativeImage({
  media,
  variant = 'grid',
  style,
  resizeMode = 'cover',
  renderFailed = defaultRenderFailed,
  testID,
  onStateChange,
  onFailedOwner,
}) {
  const { src, state, failureReason, onError, rewatch, tryAgain, retrying, retryError } = useMediaDerivative(media, { variant });
  const [loadedSrc, setLoadedSrc] = useState(null);

  const legacyUri = isLegacy(media) ? media.uri : null;
  const showsImage = !!legacyUri || (!!src && (state === 'idle' || state === 'ready'));
  let status;
  if (media?.uploadFailed || media?.missingFile) status = 'uploadFailed';
  else if (legacyUri) status = loadedSrc === legacyUri ? 'loaded' : 'loading';
  else if (state === 'unavailable' || state === 'loadFailed' || state === 'failed') status = state;
  else if (!showsImage) status = 'pending';
  else status = loadedSrc === src ? 'loaded' : 'loading';

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  useEffect(() => {
    onStateChangeRef.current?.(status);
  }, [status]);

  // A host that wraps the tile in a Pressable takes the owner's actions here and renders them
  // beside its Pressable (FailedActions). Null whenever there is nothing to offer.
  const originalUrl = originalUrlOf(media);
  const exposeActions = !!onFailedOwner && state === 'failed' && !!failureReason;
  const onFailedOwnerRef = useRef(onFailedOwner);
  onFailedOwnerRef.current = onFailedOwner;
  useEffect(() => {
    onFailedOwnerRef.current?.(exposeActions ? { tryAgain, retrying, retryError, originalUrl } : null);
  }, [exposeActions, tryAgain, retrying, retryError, originalUrl]);
  useEffect(() => () => onFailedOwnerRef.current?.(null), []);

  if (legacyUri) {
    return (
      <Image
        source={{ uri: legacyUri }}
        style={style}
        resizeMode={resizeMode}
        onLoad={() => setLoadedSrc(legacyUri)}
        testID={testID}
      />
    );
  }

  if (media?.uploadFailed || media?.missingFile) {
    return <Plate style={style} testID="media-not-uploaded" label={PHOTO_NOT_UPLOADED} />;
  }

  if (state === 'unavailable' || state === 'loadFailed') {
    return <Plate style={style} testID="media-unavailable" label={PHOTO_UNAVAILABLE} />;
  }
  if (state === 'failed') {
    return renderFailed({
      style,
      media,
      failureReason,
      rewatch,
      tryAgain,
      retrying,
      retryError,
      hostTakesActions: !!onFailedOwner,
    });
  }
  if (!src || state === 'pending') {
    return <Plate style={style} testID="media-pending" label={PHOTO_PREPARING} />;
  }

  if (Platform.OS === 'web') {
    // RN Image has issues on web here; the journal card has always used a native <img>.
    const flat = StyleSheet.flatten(style) || {};
    return (
      <img
        src={src}
        alt="photo"
        onError={onError}
        onLoad={() => setLoadedSrc(src)}
        data-testid={testID}
        style={{
          width: '100%',
          height: flat.height || '100%',
          objectFit: resizeMode === 'contain' ? 'contain' : 'cover',
          ...(flat.borderRadius != null ? { borderRadius: flat.borderRadius } : null),
          backgroundColor: '#E0E0E0',
          display: 'block',
          ...(flat.width != null ? { width: flat.width } : null),
        }}
      />
    );
  }

  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} onError={onError} onLoad={() => setLoadedSrc(src)} testID={testID} />;
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  plateText: { color: '#666', fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
});

export default React.memo(DerivativeImage);
