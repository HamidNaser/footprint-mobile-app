/**
 * JournalEntryCard Component
 * 
 * Displays a single journal entry in a threaded/sequential format:
 * - Content blocks render in order (text, photos, audio, etc.)
 * - Similar to WhatsApp/Instagram story where content appears in sequence
 * - Supports: text, photo grids, video thumbnails, audio players, location
 */

import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Avatar from '../Avatar';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoThumbnail } from '../media/VideoThumbnail';
// 013 T054: the voice pill's play control, which `media/AudioPlayer` never made work
// (FR-020). That file stays for `InterviewModeScreen`, which still uses it.
import VoicePlayer from './VoicePlayer';
import { EngagementSection } from './EngagementSection';
import DerivativeImage from '../media/DerivativeImage';
import { FailedSlot } from '../media/FailedTile';
import SaveAudienceSheet from '../capture/SaveAudienceSheet';
import { ShareState } from '../../database/schema';
// One copy of the words, shared with `JournalEntryDetail` -- the screen a tap on this card
// opens, which must not say "Family" over a memory this card has just called not shared.
import { SHARE_LINES, NOT_SHARED_YET } from './shareLabels';
import MemoryRouteMap, {
  MEMORY_ROUTE_MAP_GAP,
  memoryRouteMapSlotHeight,
} from '../map/MemoryRouteMap';
// The pin's own colour function, so a piece's badge and its pin cannot be different colours
// (FR-023). It reads the `PIN_COLOURS` table the map's markers read, and carries the same
// neutral colour for a kind neither file knows -- repeating that fallback here is how the two
// would drift. Both exports have a web sibling, so this import resolves in a browser too.
import { pinColour } from '../map/NumberedPin';
// One function decides the order, the numbers and the groups of a memory's pieces. The card
// badges the pieces from it and `MemoryRouteMap` draws the pins from it, which is what makes a
// badge and a pin agree (FR-023, research R10).
import { toNumberedPieces } from '../../utils/memoryPieces';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const CONTENT_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 2);

/** How long a piece stays lit after its pin is pressed (FR-025, `contracts/ui-contract.md`). */
const PIECE_HIGHLIGHT_MS = 1500;

/** The map's own route colour, so a lit piece reads as "the map is pointing at this one". */
const HIGHLIGHT_COLOUR = '#4361ee';

/** `blockIndex` and `mediaIndex` from `toNumberedPieces`, as one lookup key. */
const pieceKey = (blockIndex, mediaIndex) => `${blockIndex}:${mediaIndex ?? ''}`;

/**
 * How many tiles a photo or video grid shows, however many items the block holds.
 *
 * Pre-existing and not this feature's to change: the fourth tile carries a `+N` overlay for
 * the rest. What *is* this feature's problem is that `toNumberedPieces` numbers every item with
 * a place, so a six-photograph block draws six pins over four tiles -- see `slotNumbersFor`.
 */
const VISIBLE_MEDIA_TILES = 4;

/**
 * Every piece number one tile of a media grid answers for, and the badge it draws.
 *
 * Ordinarily a tile is one piece. The **last visible tile of a grid that cannot show
 * everything** is different: its `+N` overlay is the only thing on screen standing for items
 * five and up, so it answers for their numbers too (round-1 item 2). Without that, a pin for a
 * hidden photograph was a dead control -- no badge, no `onLayout`, so no measured offset, so
 * `handlePinPress` found nothing to scroll to and nothing lit. Answering means a hidden piece's
 * pin brings its **block** into view and lights the tile standing in for it, which is as close
 * to FR-025 as four tiles allow.
 *
 * What it cannot do is show a hidden piece's badge: the piece is not on screen to carry one.
 * That is a limit of the grid rather than of the numbering, and the `+N` overlay is what says
 * there is more behind it.
 *
 * @param {Array<{number: number, kind: string}|null>} badges aligned with the block's `media`
 * @param {number} index the tile's index in the grid
 * @param {number} total how many media items the block holds
 */
function slotNumbersFor(badges, index, total) {
  const own = badges?.[index] || null;
  const standsForTheRest = index === VISIBLE_MEDIA_TILES - 1 && total > VISIBLE_MEDIA_TILES;
  const hidden = standsForTheRest ? (badges || []).slice(VISIBLE_MEDIA_TILES).filter(Boolean) : [];
  const mine = own ? [own, ...hidden] : hidden;

  return {
    // Only ever the tile's **own** badge. A tile whose photograph has no place of its own must
    // not wear a hidden piece's number: the badge says "this is piece n", and on that tile it
    // would be false (FR-023). Such a tile still answers for the hidden numbers below, so
    // their pins find it even though it shows nothing.
    badge: own,
    numbers: mine.map((badge) => badge.number),
  };
}

/**
 * The number a piece wears, in the colour its pin wears (FR-023).
 *
 * Absolutely positioned by default, over the top-left corner of a photograph or a video
 * thumbnail, which is where a badge on an image belongs. A note and a voice clip pass
 * `styles.pieceBadgeInline` instead and render it above themselves: a circle laid over a
 * paragraph covers the first words of it, and one laid over the voice pill covers the play
 * control FR-020 exists for.
 */
const PieceBadge = ({ number, kind, style }) => (
  <View
    testID={`piece-badge-${number}`}
    style={[styles.pieceBadge, { backgroundColor: pinColour(kind) }, style]}
  >
    <Text style={styles.pieceBadgeText}>{String(number)}</Text>
  </View>
);

/**
 * One piece of a saved memory: the view the card measures, the badge that matches its pin, and
 * the ring while a pressed pin is pointing at it (FR-023, FR-025).
 *
 * A piece the map did not number -- one with no place -- gets no badge, no ring, no test id and
 * no measurement, so a memory with no places renders exactly as it does today (SC-008).
 *
 * The ring is laid over the piece rather than drawn around it, and takes no touches: a piece
 * that grew a border for a second and a half would reflow the card under the reader's thumb.
 *
 * @param {{number: number, kind: string}|null} badge What to draw, if anything.
 * @param {number[]} [numbers] Every piece number this one view answers for. Defaults to the
 *   badge's own; the last tile of a grid that cannot show everything passes more than one
 *   (`slotNumbersFor`), so a pin for a piece behind the `+N` overlay still finds this view.
 * @param {boolean} highlighted Whether any of `numbers` is lit.
 * @param {(number: number, y: number) => void} [onMeasure] Given the piece's offset from the
 *   top of the piece list, which is what a pin press scrolls to.
 */
const PieceSlot = ({
  badge,
  numbers,
  highlighted,
  onMeasure,
  style,
  badgeAbove = false,
  badgeStyle,
  children,
}) => {
  const mine = numbers || (badge ? [badge.number] : []);
  // Which number names this view, for a test id and for the ring. The tile's own when it has
  // one, so `memory-piece-4` stays on the fourth tile whatever else it answers for.
  const anchor = mine.length === 0 ? null : mine[0];
  const marks = badge ? (
    <PieceBadge number={badge.number} kind={badge.kind} style={badgeStyle} />
  ) : null;

  return (
    <View
      style={style}
      testID={anchor === null ? undefined : `memory-piece-${anchor}`}
      onLayout={
        anchor === null || !onMeasure
          ? undefined
          : (event) => mine.forEach((number) => onMeasure(number, event.nativeEvent.layout.y))
      }
    >
      {badgeAbove && marks}
      {children}
      {!badgeAbove && marks}
      {anchor !== null && highlighted && (
        <View
          pointerEvents="none"
          testID={`piece-highlight-${anchor}`}
          style={styles.pieceHighlight}
        />
      )}
    </View>
  );
};

/**
 * Where each numbered tile of a media block sits, measured from the top of the piece list.
 *
 * Two measurements make that up -- the block's own position in the list, and the tile's
 * position inside the block -- and React Native reports them in whichever order it lays the
 * views out. So both halves are remembered and every tile measured so far is reported again
 * whenever either arrives. Reporting the same offset twice costs nothing; reporting a tile's
 * position without its block's would scroll the Journal to the top of the card instead of to
 * the piece.
 *
 * A note and a voice clip need none of this: their own view *is* the block, so they report
 * their offset straight to the card.
 */
function useTileOffsets(onPieceLayout) {
  const blockY = useRef(null);
  const tiles = useRef(new Map());

  const report = useCallback(() => {
    if (blockY.current === null) return;
    tiles.current.forEach((y, number) => onPieceLayout?.(number, blockY.current + y));
  }, [onPieceLayout]);

  const onBlockLayout = useCallback(
    (event) => {
      blockY.current = event.nativeEvent.layout.y;
      report();
    },
    [report],
  );

  const onTileLayout = useCallback(
    (number, y) => {
      tiles.current.set(number, y);
      report();
    },
    [report],
  );

  return { onBlockLayout, onTileLayout };
}

/**
 * Sync status indicator
 */
const SyncStatusBadge = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'synced':
        return { icon: 'cloud-done-outline', color: '#34C759', label: 'Synced' };
      case 'syncing':
        return { icon: 'cloud-upload-outline', color: '#007AFF', label: 'Syncing' };
      case 'pending':
        return { icon: 'cloud-offline-outline', color: '#FF9500', label: 'Pending' };
      case 'conflict':
        return { icon: 'warning-outline', color: '#FF3B30', label: 'Conflict' };
      case 'local_only':
        return { icon: 'phone-portrait-outline', color: '#8E8E93', label: 'Local' };
      default:
        return { icon: 'cloud-outline', color: '#8E8E93', label: '' };
    }
  };

  const config = getStatusConfig();
  
  return (
    <View style={styles.syncBadge}>
      <Ionicons name={config.icon} size={12} color={config.color} />
    </View>
  );
};

/**
 * Text block component
 */
const TextBlock = memo(({ content, isFirst, badge, highlighted, onMeasure }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_LENGTH = 300;
  const shouldTruncate = content.length > MAX_LENGTH;
  const displayText = isExpanded ? content : content.slice(0, MAX_LENGTH);

  return (
    <PieceSlot
      style={[styles.textBlock, !isFirst && styles.textBlockSpacing]}
      badge={badge}
      highlighted={highlighted}
      onMeasure={onMeasure}
      badgeAbove
      badgeStyle={styles.pieceBadgeInline}
    >
      <Text style={styles.textContent}>
        {displayText}
        {shouldTruncate && !isExpanded && '...'}
      </Text>
      {shouldTruncate && (
        <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
          <Text style={styles.readMore}>
            {isExpanded ? 'Show less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}
    </PieceSlot>
  );
});

/**
 * A photo that can never upload says so (007 R-c), rather than showing a blank tile.
 * Module-level on purpose: a component defined inside PhotoBlock is a new type on every
 * render, so its hook (the display-copy lifecycle) would restart each time.
 */
const NotUploadedTile = ({ style }) => (
  <View style={[styles.photo, style, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0E0E0' }]}>
    <Text style={styles.failedTileText}>Photo couldn't be uploaded</Text>
  </View>
);

/**
 * One grid tile. Takes the media item, never a URL: DerivativeImage picks the thumbnail
 * (device copy first) and renders the pending placeholder when there is no source yet.
 */
const PhotoImage = ({ media, style, onPress, failed }) =>
  failed ? (
    <NotUploadedTile style={style} />
  ) : (
    // The owner's Try again / Download original for a failed photo render beside the touchable
    // (FailedSlot), not inside it: no button nested in another.
    <FailedSlot style={styles.photoSlot}>
      {(onFailedOwner) => (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
          <DerivativeImage media={media} style={[styles.photo, style]} resizeMode="cover" onFailedOwner={onFailedOwner} />
        </TouchableOpacity>
      )}
    </FailedSlot>
  );

/**
 * Photo block - displays photos in a grid
 * Uses native img on web (RN Image has issues), RN Image on native
 */
/**
 * A grid tile is a postage stamp. Loading the full-size original into one costs 76 KB
 * where the Hub will serve a 7 KB rendition -- and the person opening the photograph
 * properly gets the display copy, because the viewer picks its own source.
 */
const PhotoBlock = memo(({ photos, onPhotoPress, badges, highlighted, onPieceLayout, testID }) => {
  const { onBlockLayout, onTileLayout } = useTileOffsets(onPieceLayout);

  if (!Array.isArray(photos) || photos.length === 0) return null;

  const PHOTO_HEIGHT = 200;
  const GRID_GAP = 4;

  // Each tile is its own piece on the map, so each carries its own number (FR-023). `slotFor`
  // gives one tile the badge, the ring and the measurement; the four grids below are otherwise
  // exactly as they were, so the card lays out as it does today (FR-021).
  //
  // The tiles themselves are deliberately **not** collapsed into one shared `<PhotoImage>`:
  // `uploadFailedTile.test.js` and `derivativeSurfaces.test.js` both read this file and hold
  // every one of the five tile sites to passing `failed={…uploadFailed…}` and `media={…}`, so
  // that no layout can grow a tile that forgets either. Five copies is the price of that guard.
  const slotFor = (index) => {
    const { badge, numbers } = slotNumbersFor(badges, index, photos.length);
    return {
      badge,
      numbers,
      highlighted: numbers.some((number) => !!highlighted?.has(number)),
      onMeasure: onTileLayout,
    };
  };

  const renderSinglePhoto = () => (
    <PieceSlot {...slotFor(0)}>
      <PhotoImage
        media={photos[0]}
        failed={photos[0]?.uploadFailed || photos[0]?.missingFile}
        style={{ height: PHOTO_HEIGHT }}
        onPress={() => onPhotoPress?.(photos, 0)}
      />
    </PieceSlot>
  );

  const renderTwoPhotos = () => (
    <View style={styles.photoRow}>
      {photos.slice(0, 2).map((photo, index) => (
        <PieceSlot
          key={photo.localId || photo.id || index}
          {...slotFor(index)}
          style={{ flex: 1, marginLeft: index > 0 ? GRID_GAP : 0 }}
        >
          <PhotoImage
            media={photo}
            failed={photo?.uploadFailed || photo?.missingFile}
            style={{ height: PHOTO_HEIGHT }}
            onPress={() => onPhotoPress?.(photos, index)}
          />
        </PieceSlot>
      ))}
    </View>
  );

  const renderThreePhotos = () => (
    <View style={styles.photoRow}>
      <PieceSlot {...slotFor(0)} style={{ flex: 2 }}>
        <PhotoImage
          media={photos[0]}
          failed={photos[0]?.uploadFailed || photos[0]?.missingFile}
          style={{ height: PHOTO_HEIGHT }}
          onPress={() => onPhotoPress?.(photos, 0)}
        />
      </PieceSlot>
      <View style={{ flex: 1, marginLeft: GRID_GAP }}>
        {photos.slice(1, 3).map((photo, index) => (
          <PieceSlot
            key={photo.localId || photo.id || index}
            {...slotFor(index + 1)}
            style={{ marginTop: index > 0 ? GRID_GAP : 0, flex: 1 }}
          >
            <PhotoImage
              media={photo}
              failed={photo?.uploadFailed || photo?.missingFile}
              style={{ height: (PHOTO_HEIGHT - GRID_GAP) / 2 }}
              onPress={() => onPhotoPress?.(photos, index + 1)}
            />
          </PieceSlot>
        ))}
      </View>
    </View>
  );

  const renderFourPlusPhotos = () => (
    <View style={styles.photoGrid}>
      {photos.slice(0, VISIBLE_MEDIA_TILES).map((photo, index) => (
        <PieceSlot
          key={photo.localId || photo.id || index}
          {...slotFor(index)}
          style={styles.gridPhotoContainer}
        >
          <PhotoImage
            media={photo}
            failed={photo?.uploadFailed || photo?.missingFile}
            style={{ height: '100%' }}
            onPress={() => onPhotoPress?.(photos, index)}
          />
          {index === VISIBLE_MEDIA_TILES - 1 && photos.length > VISIBLE_MEDIA_TILES && (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreText}>+{photos.length - VISIBLE_MEDIA_TILES}</Text>
            </View>
          )}
        </PieceSlot>
      ))}
    </View>
  );

  return (
    <View testID={testID} style={styles.mediaBlock} onLayout={onBlockLayout}>
      {photos.length === 1 && renderSinglePhoto()}
      {photos.length === 2 && renderTwoPhotos()}
      {photos.length === 3 && renderThreePhotos()}
      {photos.length >= 4 && renderFourPlusPhotos()}
    </View>
  );
});

/**
 * Video block - displays video thumbnails
 */
const VideoBlock = memo(({ videos, onVideoPress, badges, highlighted, onPieceLayout, testID }) => {
  const { onBlockLayout, onTileLayout } = useTileOffsets(onPieceLayout);

  if (!Array.isArray(videos) || videos.length === 0) return null;

  return (
    <View testID={testID} style={styles.mediaBlock} onLayout={onBlockLayout}>
      <View style={styles.videoGrid}>
        {videos.slice(0, VISIBLE_MEDIA_TILES).map((video, index) => {
          const { badge, numbers } = slotNumbersFor(badges, index, videos.length);
          return (
            <PieceSlot
              key={video.localId || video.id || index}
              style={styles.videoContainer}
              badge={badge}
              numbers={numbers}
              highlighted={numbers.some((number) => !!highlighted?.has(number))}
              onMeasure={onTileLayout}
            >
              <VideoThumbnail
                media={video}
                duration={video.duration}
                width={videos.length === 1 ? CONTENT_WIDTH - 32 : (CONTENT_WIDTH - 36) / 2}
                height={videos.length === 1 ? 200 : 100}
                onPress={() => onVideoPress?.(videos, index)}
              />
              {index === VISIBLE_MEDIA_TILES - 1 && videos.length > VISIBLE_MEDIA_TILES && (
                <View style={styles.moreOverlay}>
                  <Text style={styles.moreText}>+{videos.length - VISIBLE_MEDIA_TILES}</Text>
                </View>
              )}
            </PieceSlot>
          );
        })}
      </View>
    </View>
  );
});

/**
 * Audio block - the voice pill, with a play control that works (013 T054, FR-020).
 *
 * The pill is unchanged: the mic badge, then the waveform strip with its play-progress
 * colouring and tap-to-seek, then the time -- FR-021 allows the card only the additions this
 * feature lists, so nothing it draws today is dropped, and the one thing that changes is that
 * the play control now works. The only thing gone is the *separate* duration text, because
 * `VoicePlayer` prints the clip's position and its length, so the pill was saying the length
 * twice.
 *
 * `waveform` comes from the **block**, not from the media item: that is where
 * `journalBlocks.js` puts a clip's levels. The item is what the old code read
 * (`waveformData={audio.waveform}`), which was always `undefined`.
 */
const AudioBlock = memo(({ audio, waveform, primaryColor, badge, highlighted, onMeasure, testID }) => {
  if (!audio) return null;

  return (
    <PieceSlot
      style={styles.audioBlock}
      badge={badge}
      highlighted={highlighted}
      onMeasure={onMeasure}
      badgeAbove
      badgeStyle={styles.pieceBadgeInline}
    >
      <View style={styles.audioWrapper}>
        <View style={styles.audioIcon}>
          <Ionicons name="mic" size={18} color="#FFF" />
        </View>
        <VoicePlayer
          testID={testID}
          uri={audio.localPath || audio.serverUrl}
          duration={audio.duration}
          waveform={waveform}
          color={primaryColor}
          style={styles.audioPlayer}
        />
      </View>
    </PieceSlot>
  );
});

/**
 * Format relative time
 */
const formatRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString();
};

/**
 * Visibility config for display
 */
const VISIBILITY_DISPLAY = {
  private: { icon: 'lock-closed', label: 'Only Me' },
  family: { icon: 'people', label: 'Family' },
  friends: { icon: 'person-add', label: 'Friends' },
  family_friends: { icon: 'globe-outline', label: 'Family & Friends' },
};

/**
 * Main JournalEntryCard component - Threaded/Sequential Layout
 */
export const JournalEntryCard = memo(({
  entry,
  user,
  currentUserId,  // To determine if this is user's own entry
  onGalleryPress,
  onPhotoPress,
  onVideoPress,
  onMenuPress,
  onReact,           // Callback when user reacts: (entryId, reactionKey) => void
  onAddResponse,     // Callback when user adds response: (entryId, text) => void
  onViewResponses,   // Callback to view all responses
  onReshare,         // The audience chosen again for a refused share: (entry, visibility) => void
  primaryColor = '#007AFF',
  showSyncStatus = true,
  showEngagement = true,  // Show reactions/comments section
  // Whether the list this card is in reports it as on screen. **True by default**, and
  // deliberately: `PersonJournalScreen` and `FamilySummaryScreen` render this card and know
  // nothing about viewability, so a default of false would take the map off both of them
  // silently (round-2 M10, research R10 *Lazy rendering*).
  isVisible = true,
  // Where to bring a piece into view, when a pin is pressed: the piece's offset from the top
  // of this card. Only a list can scroll, so the card reports and `JournalScreen` scrolls
  // (FR-025, T052). A screen that cannot scroll passes nothing, and a press still highlights.
  onRequestScrollTo,
  style,
}) => {
  // Determine if this is the current user's entry
  const isOwnEntry = currentUserId && (entry.userId === currentUserId || entry.authorId === currentUserId);
  // Check if entry has any media (photos, videos) for gallery button
  const hasMedia = entry.contentBlocks?.some(b => 
    b.type === 'photos' || b.type === 'video'
  );

  // Find current user's reaction (if any)
  // Handle new format: { heart: [users], thanks: [users] }
  const userReaction = entry.reactions ? 
    Object.entries(entry.reactions).find(([key, users]) => 
      Array.isArray(users) && users.some(u => u.id === currentUserId)
    )?.[0] : null;

  // Handlers for engagement
  const handleReact = useCallback((reactionKey) => {
    onReact?.(entry.id, reactionKey);
  }, [entry.id, onReact]);

  const handleAddResponse = useCallback((text) => {
    onAddResponse?.(entry.id, text);
  }, [entry.id, onAddResponse]);

  const handleViewResponses = useCallback(() => {
    onViewResponses?.(entry.id);
  }, [entry.id, onViewResponses]);

  // What the server last said about this memory's audience, and nothing else: the card
  // neither asks the sync engine nor keeps its own copy (research R15).
  const shareState = entry.shareState || null;

  // The audience choice, offered again. Closed means the sheet is not in the tree at all,
  // so nothing of it can be reached while it is off screen.
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);

  const handleReshareChoice = useCallback((visibility) => {
    setShowAudienceSheet(false);
    // The card shares nothing itself: it reports the explicit choice upward and the screen
    // re-shares the memory (FR-011).
    onReshare?.(entry, visibility);
  }, [entry, onReshare]);

  // ---------------------------------------------------------------------------------------
  // The numbers on the pieces, and the map under them (FR-022 to FR-025)
  // ---------------------------------------------------------------------------------------

  /**
   * The badge each placed piece wears, by where it came from. `entry.serverUpdatedAt` is the
   * server's own record of the memory's last save, spelled the same way on both routes --
   * `DatabaseService._mapEntryRow` for the viewer's own memories and `SocialService.adaptEntry`
   * for anybody else's -- so the same memory is numbered identically on two phones (SC-007).
   *
   * `MemoryRouteMap` below is handed the same two inputs rather than these badges, because
   * `toNumberedPieces` is pure and cheap and giving the map the entry means a caller cannot
   * hand it groups that disagree with the badges (T048's second decision).
   */
  const { badges, mediaBadges, hasPlaces, withoutPlace } = useMemo(() => {
    const byPiece = new Map();
    // One array per media block, aligned with its `media`, built **here** rather than per
    // render: a fresh array each time made `PhotoBlock`'s and `VideoBlock`'s `memo` useless, so
    // lighting one piece re-rendered every grid in the card (round-1 item 7).
    //
    // `Array.isArray`, not `|| []`, for the same reason `memoryPieces.expand` uses it: a
    // historical row whose `media` is a single object would otherwise have no `.map` here
    // either, and there is no error boundary anywhere in `src` to catch it (round-1 item 4).
    const byBlock = new Map();
    (entry.contentBlocks || []).forEach((block, blockIndex) => {
      if (Array.isArray(block?.media)) {
        byBlock.set(blockIndex, new Array(block.media.length).fill(null));
      }
    });

    const { pieces, withoutPlaceCount } = toNumberedPieces(entry, entry.serverUpdatedAt);
    pieces.forEach((piece) => {
      // A piece with no place carries no number, and a memory with no places carries none at
      // all, so its card looks exactly as it does today (FR-023, SC-008).
      if (piece.number == null) return;
      const badge = { number: piece.number, kind: piece.kind };
      byPiece.set(pieceKey(piece.blockIndex, piece.mediaIndex), badge);
      const row = byBlock.get(piece.blockIndex);
      if (row && piece.mediaIndex != null) row[piece.mediaIndex] = badge;
    });

    return {
      badges: byPiece,
      mediaBadges: byBlock,
      hasPlaces: byPiece.size > 0,
      // Whether the mounted map will also show its "k pieces without a place" line, which
      // makes the slot taller -- so the placeholder has to know too (FR-026, round-1 item 1).
      withoutPlace: withoutPlaceCount > 0,
    };
  }, [entry]);

  /** The height the map's slot takes, mounted or not, so the card never changes height. */
  const slotHeight = memoryRouteMapSlotHeight({ withoutPlace });

  /**
   * Where each numbered piece sits: the piece list's offset in the card, and each piece's
   * offset in that list. Held in a ref rather than in state because nothing on screen depends
   * on it -- it is read once, when a pin is pressed -- and a measurement in state would
   * re-render every card in the Journal as the list laid itself out.
   *
   * `content` starts as null, meaning not measured yet. A pin pressed before the card has been
   * laid out reports no offset at all rather than a partial sum: scrolling the Journal to a
   * guessed position moves the memory away from the person who just pressed a pin on it.
   */
  const offsets = useRef({ content: null, pieces: new Map() });

  const onContentLayout = useCallback((event) => {
    offsets.current.content = event.nativeEvent.layout.y;
  }, []);

  const onPieceLayout = useCallback((number, y) => {
    offsets.current.pieces.set(number, y);
  }, []);

  /** The pieces a pressed pin is pointing at, for a second and a half (FR-025). */
  const [highlighted, setHighlighted] = useState(null);
  const highlightTimer = useRef(null);

  /**
   * Read through a ref so the press handler below never changes identity.
   *
   * `JournalScreen` builds this callback per row -- it has to, because only the row knows its
   * index -- so it is a new function on every render. A press handler that changed with it
   * would be a new prop on `MemoryRouteMap` every time this card re-rendered, which defeats
   * the `memo` around it and redraws every marker each time a piece lights up. The map is the
   * expensive thing in this card, and it is the reason the card mounts it lazily at all.
   */
  const scrollRequest = useRef(onRequestScrollTo);
  scrollRequest.current = onRequestScrollTo;

  // The timer outlives nothing: a card scrolled out of the Journal while a piece is lit would
  // otherwise set state on an unmounted component a second later.
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  /**
   * A pin was pressed. A merged marker hands up every number it holds, so all of them light up
   * and the first is the one brought into view (FR-025, round-2 M1).
   */
  const handlePinPress = useCallback((numbers) => {
    if (!numbers || numbers.length === 0) return;

    setHighlighted(new Set(numbers));
    // Restarted rather than extended, so the piece pressed second gets its own second and a
    // half and the piece pressed first goes out at once.
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      highlightTimer.current = null;
      setHighlighted(null);
    }, PIECE_HIGHLIGHT_MS);

    const { content, pieces } = offsets.current;
    const y = pieces.get(numbers[0]);
    if (content !== null && y !== undefined) scrollRequest.current?.(content + y);
  }, []);

  /**
   * Render a single content block based on its type
   */
  const renderContentBlock = (block, index) => {
    const isFirst = index === 0;
    const blockBadge = badges.get(pieceKey(index, null)) || null;
    const isLit = (badge) => !!badge && !!highlighted?.has(badge.number);

    switch (block.type) {
      case 'text':
        return (
          <TextBlock
            key={`text-${index}`}
            content={block.content}
            isFirst={isFirst}
            badge={blockBadge}
            highlighted={isLit(blockBadge)}
            onMeasure={onPieceLayout}
          />
        );

      case 'photos':
        return (
          <PhotoBlock
            key={`photos-${index}`}
            photos={block.media}
            onPhotoPress={onPhotoPress}
            badges={mediaBadges.get(index)}
            highlighted={highlighted}
            onPieceLayout={onPieceLayout}
            testID={`memory-piece-block-${index}`}
          />
        );

      case 'video':
        return (
          <VideoBlock
            key={`video-${index}`}
            videos={block.media}
            onVideoPress={onVideoPress}
            badges={mediaBadges.get(index)}
            highlighted={highlighted}
            onPieceLayout={onPieceLayout}
            testID={`memory-piece-block-${index}`}
          />
        );

      case 'audio':
        // Handle both single audio and array of audio
        const audioItems = Array.isArray(block.media) ? block.media : [block.media];
        return audioItems.map((audio, audioIndex) => {
          const badge = badges.get(pieceKey(index, audioIndex)) || null;
          return (
            <AudioBlock
              key={`audio-${index}-${audioIndex}`}
              audio={audio}
              // The clip's levels sit on the block, beside the media rather than on it.
              waveform={block.waveform}
              primaryColor={primaryColor}
              badge={badge}
              highlighted={isLit(badge)}
              // A voice clip's own view is its block, so it reports straight to the card.
              onMeasure={onPieceLayout}
              // Two clips in one memory are two players, so each needs its own testID.
              testID={`memory-voice-player-${index}-${audioIndex}`}
            />
          );
        });

      default:
        return null;
    }
  };

  return (
    <View style={[styles.card, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Avatar src={user?.avatarUrl} name={user?.name} style={styles.avatar} />
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName}>{user?.name || 'Unknown'}</Text>
            {showSyncStatus && <SyncStatusBadge status={entry.syncStatus} />}
          </View>
          <View style={styles.timestampRow}>
            <Text style={styles.timestamp}>{formatRelativeTime(entry.createdAt)}</Text>
            {/* The audience, or -- when the server could not apply it -- "Not shared yet" in
                its place, so the card never looks shared (FR-011, SC-010). */}
            {shareState ? (
              <View style={styles.headerVisibility}>
                <Text style={styles.headerVisibilityDot}>·</Text>
                <Ionicons name="eye-off-outline" size={12} color="#8E8E93" />
                <Text style={styles.headerVisibilityText}>{NOT_SHARED_YET}</Text>
              </View>
            ) : (
              // Visibility indicator - only show on own entries
              isOwnEntry && entry.visibility && VISIBILITY_DISPLAY[entry.visibility] && (
                <View style={styles.headerVisibility}>
                  <Text style={styles.headerVisibilityDot}>·</Text>
                  <Ionicons
                    name={VISIBILITY_DISPLAY[entry.visibility].icon}
                    size={12}
                    color="#8E8E93"
                  />
                  <Text style={styles.headerVisibilityText}>
                    {VISIBILITY_DISPLAY[entry.visibility].label}
                  </Text>
                </View>
              )
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.menuButton} onPress={() => onMenuPress?.(entry)}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {/* The share line, under the header: the refusal is never silent, and it is shown here
          and nowhere else -- not on the sync badge (FR-011, research R15). The
          "Unfinished edit - continue" line (FR-013) belongs beside this one, in T060.

          ⚠ `isOwnEntry`, because this line is an offer to choose who may see a memory, and
          that belongs to the person whose memory it is. No card can reach it today --
          `SocialService.adaptEntry` sets `visibility` and no `shareState`, so another person's
          memory carries none, and the two screens that render those cards pass no `onReshare`
          -- but T042 changes `adaptEntry`, and a share state arriving on somebody else's
          memory would otherwise put an audience sheet over it. The *label* above is the
          deliberate asymmetry and stays unguarded: whosever memory it is, it must not look
          shared (SC-010).

          The cost of the gate, named: a refused memory whose card is rendered without
          `currentUserId` shows no re-share line. It still shows "Not shared yet", so it never
          looks shared -- and a refusal cannot exist without an account that uploaded the
          memory, which is the same account the Journal renders with. */}
      {isOwnEntry && shareState === ShareState.REFUSED && (
        <TouchableOpacity
          style={styles.shareLine}
          onPress={() => setShowAudienceSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={SHARE_LINES[ShareState.REFUSED]}
          activeOpacity={0.7}
        >
          <Ionicons name="eye-off-outline" size={14} color="#C7682A" />
          <Text style={[styles.shareLineText, styles.shareLineRefused]}>
            {SHARE_LINES[ShareState.REFUSED]}
          </Text>
        </TouchableOpacity>
      )}
      {/* Not a control: FR-011 gives the tap to the final refusal only. The phone is still
          going to send this one by itself, and offering the sheet here would invite a second
          audience for a memory whose first one has not been answered. */}
      {shareState === ShareState.WAITING && (
        <View style={styles.shareLine}>
          <Ionicons name="time-outline" size={14} color="#8E8E93" />
          <Text style={styles.shareLineText}>{SHARE_LINES[ShareState.WAITING]}</Text>
        </View>
      )}

      {/* The same sheet that saved the memory (T027/T028), not a second audience picker. */}
      {showAudienceSheet && (
        <SaveAudienceSheet
          visible
          onChoose={handleReshareChoice}
          // Left without choosing: nothing is shared, and the card goes on saying so.
          onDismiss={() => setShowAudienceSheet(false)}
        />
      )}

      {/* Content Blocks - Rendered in sequence (threaded) */}
      <View testID="memory-pieces" style={styles.contentContainer} onLayout={onContentLayout}>
        {entry.contentBlocks?.map((block, index) => renderContentBlock(block, index))}
      </View>

      {/* "Where this happened", under the pieces and above the reactions (FR-022).

          Nothing is rendered when no piece has a place -- not the map, and not the placeholder
          either: an old text memory would otherwise reserve the map's height under every one
          of them (SC-008).

          **Mounted only while the card is on screen** (research R10 *Lazy rendering*). A map
          costs a native view per card, and the Journal is a list of them, so an off-screen
          card holds the height open with a plain view instead. That is a performance
          requirement rather than an optimisation: the height is `MemoryRouteMap`'s own export,
          so the two cannot drift and a card does not jump as it scrolls into view. */}
      {hasPlaces && (
        <View style={styles.mapSlot}>
          {isVisible ? (
            <MemoryRouteMap
              entry={entry}
              serverUpdatedAt={entry.serverUpdatedAt}
              onPinPress={handlePinPress}
            />
          ) : (
            <View
              testID="memory-route-map-placeholder"
              style={[styles.mapPlaceholder, { height: slotHeight }]}
            />
          )}
        </View>
      )}

      {/* Engagement Section - Reactions & Responses */}
      {showEngagement && (
        <View style={styles.engagementContainer}>
          <EngagementSection
            reactions={entry.reactions}
            responses={entry.responses}
            userReaction={userReaction}
            commentsCount={entry.responsesCount || entry.responses?.length || 0}
            onReact={handleReact}
            onAddResponse={handleAddResponse}
            onViewAllResponses={handleViewResponses}
            currentUserId={currentUserId}
            primaryColor={primaryColor}
          />
        </View>
      )}

      {/* Footer with Gallery Button */}
      {hasMedia && (
        <View style={styles.footer}>
          <View style={styles.statsRow} />
          
          {/* Gallery Button - Bottom Right */}
          <TouchableOpacity 
            style={[styles.galleryButton, { backgroundColor: primaryColor }]}
            onPress={() => onGalleryPress?.(entry)}
            activeOpacity={0.8}
          >
            <Ionicons name="images-outline" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const PHOTO_HEIGHT = 200;
const GRID_GAP = 4;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    marginHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: CARD_PADDING,
    paddingBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerVisibility: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerVisibilityDot: {
    color: '#8E8E93',
    marginHorizontal: 4,
    fontSize: 12,
  },
  headerVisibilityText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 3,
  },
  menuButton: {
    padding: 8,
  },

  // Sync badge
  syncBadge: {
    marginLeft: 6,
  },

  // Share lines (FR-011)
  shareLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 10,
  },
  shareLineText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  shareLineRefused: {
    color: '#C7682A',
    fontWeight: '500',
  },

  // Content container
  contentContainer: {
    paddingHorizontal: CARD_PADDING,
  },

  // Engagement section
  engagementContainer: {
    paddingHorizontal: CARD_PADDING,
  },

  // The map slot, and the number badges on the pieces (FR-022 to FR-025)
  mapSlot: {
    paddingHorizontal: CARD_PADDING,
  },
  // The height `MemoryRouteMap` reserves for the map itself, held open while the card is off
  // screen. Its `marginTop` is the map container's, so the pieces above sit where they will.
  mapPlaceholder: {
    marginTop: MEMORY_ROUTE_MAP_GAP,
    borderRadius: 12,
    backgroundColor: '#E8EEFF',
  },
  pieceBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  // A note's and a voice clip's badge, above the piece rather than over it.
  pieceBadgeInline: {
    position: 'relative',
    top: 0,
    left: 0,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  pieceBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Laid over the piece, so lighting one reflows nothing under the reader's thumb.
  pieceHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: HIGHLIGHT_COLOUR,
    backgroundColor: 'rgba(67, 97, 238, 0.10)',
  },

  // Text blocks
  textBlock: {
    marginBottom: 12,
  },
  textBlockSpacing: {
    marginTop: 8,
  },
  textContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1C1C1E',
  },
  readMore: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    color: '#007AFF',
  },

  // Media blocks
  mediaBlock: {
    marginBottom: 12,
  },

  // Photo styles
  // Holds the touchable and, for the owner of a failed photo, Try again beside it.
  photoSlot: { flex: 1 },
  photo: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  photoRow: {
    flexDirection: 'row',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridPhotoContainer: {
    width: (CONTENT_WIDTH - 32 - GRID_GAP) / 2,
    height: (PHOTO_HEIGHT - GRID_GAP) / 2,
  },
  gridPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedTileText: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  moreText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
  },

  // Video styles
  videoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  videoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Audio styles
  audioBlock: {
    marginBottom: 12,
  },
  audioWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  audioIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  audioPlayer: {
    flex: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CARD_PADDING,
    paddingBottom: CARD_PADDING,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  visibilityText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
  },
  
  // Gallery button - bottom right
  galleryButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      },
    }),
  },
});

export default JournalEntryCard;
