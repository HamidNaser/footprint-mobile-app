import React, { useEffect, useMemo, useRef } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMediaDerivative } from '../../hooks/useMediaDerivative';
import { FailedActions, FailedTile } from './FailedTile';
import { PHOTO_NOT_UPLOADED, PHOTO_PREPARING, PHOTO_UNAVAILABLE, SMALL_TILE_PX } from './DerivativeImage';
import { videoSource } from '../../utils/mediaSource';

/**
 * A video tile driven through the 007 lifecycle (final review I1; FR-021, FR-022, FR-024).
 * VideoThumbnail (native and web) renders this whenever it is given a media item.
 *
 * The poster frame is the video's grid copy, watched by media id through useMediaDerivative,
 * exactly as a photo tile watches its own:
 *  - ready (or a stored poster) ... the poster under a play overlay
 *  - pending ...................... a frame made from the file on the device if there is one
 *                                   (`localFrame`), else "Preparing photo…"
 *  - unavailable / loadFailed ..... "Photo unavailable"
 *  - failed ....................... the owner (the server sent a `failureReason`) gets "This video
 *                                   couldn't be prepared", the reason and Try again; anyone else
 *                                   gets "Photo unavailable" (fails closed). No Download original
 *                                   on a video: that waits on the owner's decision (I3).
 *
 * The tile is itself a touchable (tapping plays the original), so Try again is never put inside
 * it: a host whose own touchable wraps the tile passes `onFailedOwner` and renders the actions
 * beside it (FailedSlot); otherwise the tile renders them beside its own touchable.
 *
 * The original video is never an image source. A stored "thumbnail" that is the original (the
 * SQLite normaliser falls back to the server address) or the device's video file is dropped.
 */

const NO_MEDIA = null;

export function posterMediaOf(media) {
  if (!media) return NO_MEDIA;
  const originals = new Set([media.url, media.serverUrl, media.localPath].filter((u) => typeof u === 'string' && u));
  const poster = (u) => (typeof u === 'string' && u && !originals.has(u) ? u : null);
  return {
    ...media,
    kind: 'video',
    localPath: null,
    thumbnailUrl: poster(media.thumbnailUrl),
    thumbnailUri: poster(media.thumbnailUri),
  };
}

function Plate({ width, height, testID, label }) {
  const small = [width, height].some((d) => typeof d === 'number' && d < SMALL_TILE_PX);
  return (
    <View
      style={[styles.plate, { width, height }]}
      testID={testID}
      accessible
      accessibilityLabel={label.replace(/…$/, '')}
    >
      {small ? null : <Text style={styles.plateText}>{label}</Text>}
    </View>
  );
}

const formatDuration = (millis) => {
  if (!millis || isNaN(millis)) return '';
  const totalSeconds = Math.floor(millis / 1000);
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
};

export function VideoPosterTile({
  media,
  localFrame = null,
  duration,
  width,
  height,
  showDuration = true,
  showPlayIcon = true,
  onPress,
  onFailedOwner,
  style,
  imageStyle,
}) {
  const posterMedia = useMemo(() => posterMediaOf(media), [media]);
  const { src, state, failureReason, onError, tryAgain, retrying, retryError } = useMediaDerivative(posterMedia);

  const neverUploaded = !!(media?.uploadFailed || media?.missingFile);
  const ownerFailed = state === 'failed' && !!failureReason;
  const posterShown = !neverUploaded && !!src && (state === 'idle' || state === 'ready');
  const frameShown = !posterShown && !neverUploaded && !!localFrame && (state === 'idle' || state === 'pending');
  const shownUri = posterShown ? src : frameShown ? localFrame : null;

  // A host that wraps this tile in its own touchable takes the owner's actions (FailedSlot).
  const onFailedOwnerRef = useRef(onFailedOwner);
  onFailedOwnerRef.current = onFailedOwner;
  useEffect(() => {
    onFailedOwnerRef.current?.(ownerFailed ? { tryAgain, retrying, retryError, originalUrl: null } : null);
  }, [ownerFailed, tryAgain, retrying, retryError]);
  useEffect(() => () => onFailedOwnerRef.current?.(null), []);

  let content;
  if (neverUploaded) {
    content = <Plate width={width} height={height} testID="media-not-uploaded" label={PHOTO_NOT_UPLOADED} />;
  } else if (state === 'unavailable' || state === 'loadFailed') {
    content = <Plate width={width} height={height} testID="media-unavailable" label={PHOTO_UNAVAILABLE} />;
  } else if (state === 'failed') {
    content = failureReason ? (
      // Words only inside the touchable; the actions go beside it. `url` is withheld so the
      // tile cannot offer Download original (I3).
      <FailedTile
        style={{ width, height }}
        media={{ ...posterMedia, url: null, serverUrl: null }}
        failureReason={failureReason}
        showActions={false}
      />
    ) : (
      <Plate width={width} height={height} testID="media-failed" label={PHOTO_UNAVAILABLE} />
    );
  } else if (shownUri) {
    content = (
      <Image
        source={{ uri: shownUri }}
        style={[styles.thumbnail, { width, height }, imageStyle]}
        resizeMode="cover"
        onError={posterShown ? onError : undefined}
      />
    );
  } else {
    content = <Plate width={width} height={height} testID="media-pending" label={PHOTO_PREPARING} />;
  }

  const tile = (
    <TouchableOpacity
      style={[styles.container, { width, height }, ownerFailed && !onFailedOwner ? null : style]}
      onPress={() => onPress?.({ videoUri: videoSource(media), thumbnailUri: shownUri, duration, media })}
      activeOpacity={onPress ? 0.8 : 1}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel="Play video"
      testID="video-play-overlay"
    >
      {content}
      {showPlayIcon && shownUri ? (
        <View style={styles.playIconContainer} pointerEvents="none">
          <View style={styles.playIcon}>
            <Ionicons name="play" size={20} color="#FFF" />
          </View>
        </View>
      ) : null}
      {showDuration && duration && shownUri ? (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  if (ownerFailed && !onFailedOwner) {
    return (
      <View style={[{ width, height }, style]}>
        {tile}
        <View style={styles.slotActions} pointerEvents="box-none">
          <FailedActions actions={{ tryAgain, retrying, retryError, originalUrl: null }} />
        </View>
      </View>
    );
  }
  return tile;
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#F0F0F0' },
  thumbnail: { borderRadius: 8 },
  plate: { backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  plateText: { color: '#666', fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
  playIconContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  playIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 3,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: { color: '#FFF', fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'] },
  slotActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingBottom: 2,
  },
});

export default VideoPosterTile;
