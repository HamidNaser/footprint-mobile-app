import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useMediaDerivative } from '../../hooks/useMediaDerivative';

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
 *  - failed (server verdict) ........ "Photo unavailable" for now. SEAM for T070/T071: the
 *                                     owner's failed tile with Try again replaces `renderFailed`.
 *  - uploadFailed / missingFile ..... "Photo couldn't be uploaded" (the photo never left the device)
 *
 * Video tiles do not use this: they keep VideoThumbnail (T078 adds the overlay).
 */

export const PHOTO_UNAVAILABLE = 'Photo unavailable';
export const PHOTO_PREPARING = 'Preparing photo…';
/** Under this many px (either side) a tile is too small for words; the label stays accessible. */
export const SMALL_TILE_PX = 60;
export const PHOTO_NOT_UPLOADED = "Photo couldn't be uploaded";

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

/** The seam: T070/T071 pass `renderFailed` to show Try again to the owner. */
const defaultRenderFailed = ({ style }) => <Plate style={style} testID="media-failed" label={PHOTO_UNAVAILABLE} />;

function DerivativeImage({
  media,
  variant = 'grid',
  style,
  resizeMode = 'cover',
  renderFailed = defaultRenderFailed,
  testID,
}) {
  const { src, state, failureReason, onError, rewatch } = useMediaDerivative(media, { variant });

  if (media?.uploadFailed || media?.missingFile) {
    return <Plate style={style} testID="media-not-uploaded" label={PHOTO_NOT_UPLOADED} />;
  }

  if (state === 'unavailable' || state === 'loadFailed') {
    return <Plate style={style} testID="media-unavailable" label={PHOTO_UNAVAILABLE} />;
  }
  if (state === 'failed') {
    return renderFailed({ style, media, failureReason, rewatch });
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

  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} onError={onError} testID={testID} />;
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
