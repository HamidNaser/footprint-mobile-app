/**
 * Journal Service
 * 
 * Business logic layer for journal operations.
 * Orchestrates between JournalRepository, FileService, and other services.
 * Provides a clean API for UI components to interact with journal entries.
 */

import { JournalRepository, EntryVisibility, LocationSharing, SortOrder } from '../repositories/JournalRepository';
import { FileService, MediaType } from './FileService';
import { DatabaseService } from './DatabaseService';
import { SettingsService, StorageMode } from './SettingsService';
// The queue, for the one operation `reshareEntry` has to put there itself (see its comment).
// A static import is safe: SyncQueue reaches only the database, so it closes no cycle the way
// SyncEngine would -- that one is still required lazily in `_syncNow`.
import { SyncQueue, SyncOperationType } from '../sync/SyncQueue';
import { ContentBlockType, UploadStatus, SyncStatus } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * Content block creation helpers
 */
export const ContentBlock = {
  /**
   * Create a text block
   * @param {string} text - Text content
   * @param {number} order - Block order
   * @returns {object} Text content block
   */
  text(text, order = 0) {
    return {
      id: uuidv4(),
      type: ContentBlockType.TEXT,
      content: text,
      order,
    };
  },

  /**
   * Create an image block
   * @param {object} params - { localPath, serverUrl?, width?, height?, caption? }
   * @param {number} order - Block order
   * @returns {object} Image content block
   */
  image({ localPath, serverUrl, width, height, caption }, order = 0) {
    // Emits a `photos` block with a one-item `media` array: that is the shape
    // JournalEntryCard renders. This previously used ContentBlockType.IMAGE --
    // a constant that does not exist -- so every block it built had
    // `type: undefined` and silently rendered as nothing.
    return {
      id: uuidv4(),
      type: ContentBlockType.PHOTOS,
      media: [{
        localId: uuidv4(),
        localPath,
        serverUrl: serverUrl || null,
        width: width || null,
        height: height || null,
      }],
      caption: caption || null,
      order,
    };
  },

  /**
   * Create a video block
   * @param {object} params - { localPath, serverUrl?, thumbnailPath?, duration?, caption? }
   * @param {number} order - Block order
   * @returns {object} Video content block
   */
  video({ localPath, serverUrl, thumbnailPath, thumbnailServerUrl, duration, caption }, order = 0) {
    // Media goes in a `media` array; JournalEntryCard reads block.media, not
    // block.localPath, so a flat block rendered as an empty player.
    return {
      id: uuidv4(),
      type: ContentBlockType.VIDEO,
      media: [{
        localId: uuidv4(),
        localPath,
        serverUrl: serverUrl || null,
        thumbnailPath: thumbnailPath || null,
        thumbnailServerUrl: thumbnailServerUrl || null,
        duration: duration || null,
      }],
      duration: duration || null,
      caption: caption || null,
      order,
    };
  },

  /**
   * Create an audio block
   * @param {object} params - { localPath, serverUrl?, duration?, caption? }
   * @param {number} order - Block order
   * @returns {object} Audio content block
   */
  audio({ localPath, serverUrl, duration, caption }, order = 0) {
    // Same as video: the card reads block.media.
    return {
      id: uuidv4(),
      type: ContentBlockType.AUDIO,
      media: [{
        localId: uuidv4(),
        localPath,
        serverUrl: serverUrl || null,
        duration: duration || null,
      }],
      duration: duration || null,
      caption: caption || null,
      order,
    };
  },

  /**
   * Create a location block
   * @param {object} params - { lat, lng, name?, address? }
   * @param {number} order - Block order
   * @returns {object} Location content block
   */
  location({ lat, lng, name, address }, order = 0) {
    return {
      id: uuidv4(),
      type: ContentBlockType.LOCATION, // now a real constant; was undefined
      lat,
      lng,
      name: name || null,
      address: address || null,
      order,
    };
  },
};

class JournalServiceClass {
  constructor() {
    this.repository = JournalRepository;
    this.fileService = FileService;
    this.dbService = DatabaseService;
    this.settingsService = SettingsService;
    this._eventListeners = new Map();
  }

  // ============================================================
  // Entry Creation
  // ============================================================

  /**
   * Create a new journal entry
   * @param {object} params - Entry parameters
   * @returns {Promise<object>} Created entry
   */
  async createEntry({
    journalId,
    userId,
    date,
    contentBlocks = [],
    location = null,
    visibility = EntryVisibility.PRIVATE,
    // Who may see the exact coordinates, picked per memory. Named explicitly because this
    // signature destructures: a field that is not listed here is silently dropped, which is
    // how the compose screen's answer went missing between the screen and the database.
    locationSharing = LocationSharing.PRIVATE,
  }) {
    console.log('[JournalService] createEntry:', { journalId, userId, visibility, contentBlockCount: contentBlocks.length });
    
    // Validate inputs
    if (!journalId) throw new Error('journalId is required');
    if (!userId) throw new Error('userId is required');

    // Copy captured media out of the OS cache before the entry references it.
    const durableBlocks = await this._persistMediaBlocks(contentBlocks);

    // Create the entry
    const entry = await this.repository.createEntry({
      journalId,
      userId,
      date,
      contentBlocks: durableBlocks,
      location,
      visibility,
      locationSharing,
    });

    // Queue media for upload if there are media blocks
    await this._queueMediaForUpload(entry);

    // Push it now rather than waiting for the timer.
    //
    // Nothing triggered a sync on create, so a new entry sat in the queue until the
    // five-minute auto-sync came round, the app was backgrounded and reopened, or the
    // network changed. Post a photo and it could be minutes before it existed anywhere but
    // the phone -- which reads as the app being broken rather than as a schedule, because
    // every other app people use posts immediately.
    //
    // Deliberately not awaited: the entry is already saved locally and the screen should
    // not wait on a network round trip to show it. Failures are the sync engine's to
    // handle -- the operation stays queued and is retried -- so a rejection here is
    // logged and dropped rather than surfaced as a save failure.
    this._syncNow('createEntry');

    // NOTE: We don't emit 'entryCreated' here because the caller (useJournal hook)
    // already handles optimistic updates. The event is reserved for entries
    // arriving from external sources (e.g., SignalR sync from another device).

    return entry;
  }

  /**
   * Copy any captured media referenced by content blocks into permanent
   * storage, returning blocks whose `localPath`s are durable.
   *
   * Callers that build blocks themselves (the compose modal does) hand us raw
   * camera / image-picker URIs. Those live in the OS cache, which is purged
   * without warning, so an entry that stores one renders as a grey placeholder
   * once the file is gone. Doing this here rather than in the modal means every
   * caller of createEntry gets it, including future capture surfaces.
   *
   * Already-persisted paths are left alone, so this is safe to run twice.
   *
   * @param {Array<object>} contentBlocks
   * @returns {Promise<Array<object>>} blocks with durable media paths
   */
  async _persistMediaBlocks(contentBlocks) {
    if (!Array.isArray(contentBlocks)) return [];

    const typeForBlock = {
      [ContentBlockType.PHOTOS]: MediaType.IMAGE,
      [ContentBlockType.VIDEO]: MediaType.VIDEO,
      [ContentBlockType.AUDIO]: MediaType.AUDIO,
    };

    return Promise.all(
      contentBlocks.map(async (block) => {
        const mediaType = typeForBlock[block?.type];
        if (!mediaType || !Array.isArray(block.media)) return block;

        const media = await Promise.all(
          block.media.map(async (item) => {
            if (!item?.localPath) return item;
            try {
              const next = {
                ...item,
                localPath: await this.fileService.persist(item.localPath, mediaType),
              };
              if (item.thumbnailPath) {
                next.thumbnailPath = await this.fileService.persist(
                  item.thumbnailPath,
                  MediaType.IMAGE,
                );
              }
              return next;
            } catch (error) {
              // Keep the original URI rather than dropping the block. A cache
              // path that may expire still beats losing the user's capture.
              console.warn(
                '[JournalService] Failed to persist media, keeping source URI:',
                error?.message,
              );
              return item;
            }
          }),
        );

        return { ...block, media };
      }),
    );
  }

  /**
   * Create a simple text entry
   * @param {object} params - { journalId, userId, text, date?, visibility? }
   * @returns {Promise<object>} Created entry
   */
  async createTextEntry({ journalId, userId, text, date, visibility }) {
    const contentBlocks = [ContentBlock.text(text, 0)];

    return this.createEntry({
      journalId,
      userId,
      date,
      contentBlocks,
      visibility,
    });
  }

  /**
   * Create an entry with a photo
   * @param {object} params - { journalId, userId, photoUri, caption?, date?, visibility? }
   * @returns {Promise<object>} Created entry
   */
  async createPhotoEntry({ journalId, userId, photoUri, caption, date, visibility, width, height }) {
    // Save photo to local storage
    const { localPath } = await this.fileService.savePhoto(photoUri);

    const contentBlocks = [
      ContentBlock.image({ localPath, width, height, caption }, 0),
    ];

    return this.createEntry({
      journalId,
      userId,
      date,
      contentBlocks,
      visibility,
    });
  }

  /**
   * Create an entry with a video
   * @param {object} params - { journalId, userId, videoUri, thumbnailUri?, duration?, caption?, date?, visibility? }
   * @returns {Promise<object>} Created entry
   */
  async createVideoEntry({ journalId, userId, videoUri, thumbnailUri, duration, caption, date, visibility }) {
    // Save video to local storage
    const { localPath, filename } = await this.fileService.saveVideo(videoUri);

    // Save thumbnail if provided
    let thumbnailPath = null;
    if (thumbnailUri) {
      const thumbResult = await this.fileService.saveThumbnail(thumbnailUri, filename);
      thumbnailPath = thumbResult.localPath;
    }

    const contentBlocks = [
      ContentBlock.video({ localPath, thumbnailPath, duration, caption }, 0),
    ];

    return this.createEntry({
      journalId,
      userId,
      date,
      contentBlocks,
      visibility,
    });
  }

  /**
   * Create an entry with audio recording
   * @param {object} params - { journalId, userId, audioUri, duration?, caption?, date?, visibility? }
   * @returns {Promise<object>} Created entry
   */
  async createAudioEntry({ journalId, userId, audioUri, duration, caption, date, visibility }) {
    // Save audio to local storage
    const { localPath } = await this.fileService.saveAudioRecording(audioUri);

    const contentBlocks = [
      ContentBlock.audio({ localPath, duration, caption }, 0),
    ];

    return this.createEntry({
      journalId,
      userId,
      date,
      contentBlocks,
      visibility,
    });
  }

  /**
   * Create a mixed-content entry (text + media)
   * @param {object} params - Entry parameters with multiple content types
   * @returns {Promise<object>} Created entry
   */
  async createMixedEntry({ journalId, userId, text, mediaItems = [], location, date, visibility }) {
    const contentBlocks = [];
    let order = 0;

    // Add text block first if provided
    if (text && text.trim().length > 0) {
      contentBlocks.push(ContentBlock.text(text, order++));
    }

    // Process each media item
    for (const media of mediaItems) {
      let savedMedia;
      let block;

      switch (media.type) {
        case MediaType.IMAGE:
          savedMedia = await this.fileService.savePhoto(media.uri);
          block = ContentBlock.image({
            localPath: savedMedia.localPath,
            width: media.width,
            height: media.height,
            caption: media.caption,
          }, order++);
          break;

        case MediaType.VIDEO:
          savedMedia = await this.fileService.saveVideo(media.uri);
          let thumbnailPath = null;
          if (media.thumbnailUri) {
            const thumbResult = await this.fileService.saveThumbnail(media.thumbnailUri, savedMedia.filename);
            thumbnailPath = thumbResult.localPath;
          }
          block = ContentBlock.video({
            localPath: savedMedia.localPath,
            thumbnailPath,
            duration: media.duration,
            caption: media.caption,
          }, order++);
          break;

        case MediaType.AUDIO:
          savedMedia = await this.fileService.saveAudioRecording(media.uri);
          block = ContentBlock.audio({
            localPath: savedMedia.localPath,
            duration: media.duration,
            caption: media.caption,
          }, order++);
          break;

        default:
          console.warn(`Unknown media type: ${media.type}`);
          continue;
      }

      contentBlocks.push(block);
    }

    // Add location block if provided
    if (location) {
      contentBlocks.push(ContentBlock.location(location, order++));
    }

    return this.createEntry({
      journalId,
      userId,
      date,
      contentBlocks,
      location,
      visibility,
    });
  }

  // ============================================================
  // Entry Retrieval
  // ============================================================

  /**
   * Get an entry by local ID
   * @param {string} localId - Local UUID
   * @returns {Promise<object|null>} Entry or null
   */
  async getEntry(localId) {
    return this.repository.getByLocalId(localId);
  }

  /**
   * Get entries for a journal
   * @param {string} journalId - Journal ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} List of entries
   */
  async getEntries(journalId, options = {}) {
    console.log('[JournalService] getEntries:', { journalId, options });
    const entries = await this.repository.getByJournalId(journalId, options);
    console.log('[JournalService] getEntries result:', { count: entries.length });
    return entries;
  }

  /**
   * Get recent entries for feed display
   * @param {string} journalId - Journal ID
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} Recent entries
   */
  async getRecentEntries(journalId, limit = 20) {
    return this.repository.getRecent(journalId, limit);
  }

  /**
   * Get entries for a specific date
   * @param {string|Date} date - Date to query
   * @param {string} userId - Optional user filter
   * @returns {Promise<Array>} Entries for that date
   */
  async getEntriesByDate(date, userId = null) {
    return this.repository.getByDate(date, userId);
  }

  /**
   * Get entries within a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {string} journalId - Journal ID
   * @returns {Promise<Array>} Entries in range
   */
  async getEntriesByDateRange(startDate, endDate, journalId) {
    return this.repository.getByDateRange(startDate, endDate, journalId);
  }

  /**
   * Get entries grouped by date for calendar view
   * @param {string} journalId - Journal ID
   * @returns {Promise<object>} Entries grouped by date
   */
  async getEntriesGroupedByDate(journalId) {
    return this.repository.getGroupedByDate(journalId);
  }

  /**
   * Get entries containing media (for gallery view)
   * @param {string} journalId - Journal ID
   * @returns {Promise<Array>} Entries with media
   */
  async getMediaEntries(journalId) {
    return this.repository.getEntriesWithMedia(journalId);
  }

  /**
   * Get all media items from entries (for media gallery tab)
   * @param {string} journalId - Journal ID
   * @returns {Promise<Array>} Flattened list of media items
   */
  async getMediaGallery(journalId) {
    const entries = await this.repository.getEntriesWithMedia(journalId);
    
    const mediaItems = [];
    
    for (const entry of entries) {
      for (const block of entry.contentBlocks) {
        if ([ContentBlockType.IMAGE, ContentBlockType.VIDEO, ContentBlockType.AUDIO].includes(block.type)) {
          mediaItems.push({
            ...block,
            entryLocalId: entry.localId,
            entryDate: entry.date,
            entryCreatedAt: entry.createdAt,
          });
        }
      }
    }
    
    // Sort by creation date, newest first
    mediaItems.sort((a, b) => b.entryCreatedAt - a.entryCreatedAt);
    
    return mediaItems;
  }

  /**
   * Search entries by text
   * @param {string} journalId - Journal ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching entries
   */
  async searchEntries(journalId, query) {
    return this.repository.searchByText(journalId, query);
  }

  /**
   * Get entry count for a journal
   * @param {string} journalId - Journal ID
   * @returns {Promise<number>} Entry count
   */
  async getEntryCount(journalId) {
    return this.repository.getCount(journalId);
  }

  // ============================================================
  // Entry Updates
  // ============================================================

  /**
   * Update an entry
   * @param {string} localId - Entry local ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated entry
   */
  async updateEntry(localId, updates) {
    const updatedEntry = await this.repository.update(localId, updates);

    // Queue any new media for upload
    if (updates.contentBlocks) {
      await this._queueMediaForUpload(updatedEntry);
    }

    this._emit('entryUpdated', updatedEntry);

    // Same reasoning as create: an edit should reach the server now, not in five minutes.
    this._syncNow('updateEntry');

    return updatedEntry;
  }

  /**
   * Add content to an existing entry
   * @param {string} localId - Entry local ID
   * @param {object} block - Content block to add
   * @returns {Promise<object>} Updated entry
   */
  async addContent(localId, block) {
    const updatedEntry = await this.repository.addContentBlock(localId, block);

    // Queue media if it's a media block
    if ([ContentBlockType.IMAGE, ContentBlockType.VIDEO, ContentBlockType.AUDIO].includes(block.type)) {
      await this._queueMediaBlockForUpload(updatedEntry.localId, block);
    }

    this._emit('entryUpdated', updatedEntry);

    // Adding a block is a change like any other; push it now.
    this._syncNow('addContentToEntry');

    return updatedEntry;
  }

  /**
   * Add a photo to an existing entry
   * @param {string} localId - Entry local ID
   * @param {string} photoUri - Photo URI
   * @param {object} options - { caption?, width?, height? }
   * @returns {Promise<object>} Updated entry
   */
  async addPhoto(localId, photoUri, options = {}) {
    const { localPath } = await this.fileService.savePhoto(photoUri);

    const entry = await this.getEntry(localId);
    const order = entry.contentBlocks.length;

    const block = ContentBlock.image({
      localPath,
      width: options.width,
      height: options.height,
      caption: options.caption,
    }, order);

    return this.addContent(localId, block);
  }

  /**
   * Add audio to an existing entry
   * @param {string} localId - Entry local ID
   * @param {string} audioUri - Audio recording URI
   * @param {object} options - { duration?, caption? }
   * @returns {Promise<object>} Updated entry
   */
  async addAudio(localId, audioUri, options = {}) {
    const { localPath } = await this.fileService.saveAudioRecording(audioUri);

    const entry = await this.getEntry(localId);
    const order = entry.contentBlocks.length;

    const block = ContentBlock.audio({
      localPath,
      duration: options.duration,
      caption: options.caption,
    }, order);

    return this.addContent(localId, block);
  }

  /**
   * Change entry visibility
   * @param {string} localId - Entry local ID
   * @param {string} visibility - New visibility
   * @returns {Promise<object>} Updated entry
   */
  async setVisibility(localId, visibility) {
    return this.updateEntry(localId, { visibility });
  }

  /**
   * Share a memory again, with an audience the person has just chosen, after the server could
   * not apply the last one (FR-011, research R15).
   *
   * Three things happen, in this order: the chosen audience is stored, the memory is queued
   * for the server **once**, and only then is the refusal cleared.
   *
   * ⚠ **Exactly one operation**, queued here on both arms, and the order is not
   * interchangeable:
   *
   *   - **With a server id** this is an ordinary edit of the audience, so one `UPDATE_ENTRY`
   *     carrying that server id, and the memory goes back to pending so the push collects it.
   *   - **Without one** the server has never held this memory. Its create was removed from the
   *     queue when the refusal was final (`SyncQueue.removeOperation`), so something has to
   *     put a create back -- and it must carry the content **as it stands now**, because a
   *     memory refused before it ever uploaded keeps its later edits on the phone until it is
   *     re-shared (R15, round-3 L4).
   *   - **The refusal is cleared last, and only when the operation is known to exist.**
   *     Clearing it over a memory that was not queued leaves a card reading "Friends" over a
   *     memory on nobody else's screen -- SC-010's "appears as shared", and the one failure
   *     mode with no safe side. The other way round is harmless: the card says "Not shared"
   *     for a moment longer over a memory already on its way, and a successful push clears it
   *     anyway (`JournalRepository.markSynced`).
   *
   * ⚠ **`JournalRepository.update` is deliberately not used, on either arm** (round-1
   * Critical 1). It queues through the private `_enqueueSync`, which **returns early when
   * sync is disabled and catches every enqueue error** -- so it resolves identically whether
   * or not an operation was really written, and its caller cannot tell. That is fine for an
   * ordinary edit, whose worst case is a memory the background sweep picks up later; it is not
   * fine here, where the thing being cleared on the strength of it is the *only* record that
   * the memory is unshared. Queued here, a failure is a rejection, the refusal survives
   * untouched, and the person is told. (`update` would also queue an `UPDATE_ENTRY` with no
   * server id on the other arm, which `SyncEngine._processSingleOperation` drops as completed
   * -- so the memory would stay unshared with nothing on its card to say so.)
   *
   * `SyncQueue.hasPendingOperations` was the alternative: clear the refusal only if a row for
   * this memory exists. Not taken, because it cannot tell *this* operation from one that was
   * already queued for the same memory -- so it would pass on the Local Only path whenever
   * some other row happened to be pending, which is the case it most needs to catch.
   *
   * **Local Only storage refuses outright, before anything is written.** Nothing drains the
   * queue in that mode, so the memory cannot reach the server however long it waits; a stored
   * audience the server will never be told about is the same lie one layer down, so not even
   * that is written (*sharing fails closed*).
   *
   * No audience is ever guessed or substituted: without an explicit choice this refuses and
   * changes nothing (FR-011, *sharing fails closed*).
   *
   * @param {string} localId - Entry local ID
   * @param {string} visibility - The audience the person chose, from `SaveAudienceSheet`
   * @returns {Promise<object>} The entry as stored, with no share state left on it
   */
  async reshareEntry(localId, visibility) {
    if (!localId) throw new Error('reshareEntry requires a localId');
    if (!visibility) {
      throw new Error('reshareEntry requires an audience: a memory is never shared without an explicit choice');
    }

    const entry = await this.repository.getByLocalId(localId);
    if (!entry) throw new Error(`Entry not found: ${localId}`);

    if (!(await this.repository.isSyncEnabled())) {
      // Coded, because the screen has something useful to say about this one and nothing
      // useful to say about the others: trying again changes nothing until cloud sync is back
      // on, so "please try again" would be the wrong advice.
      throw Object.assign(
        new Error(
          'Storage is Local Only, so this memory cannot be shared: nothing queued for it would ever be sent',
        ),
        { code: 'local_only_storage' },
      );
    }

    // The audience, and -- for a memory the server already holds -- a return to pending, which
    // is what makes the push collect it. Only from `synced`: a row sitting in `conflict` or
    // `failed` has something else to settle first, and `JournalRepository.update` is careful
    // about the same thing (`:346-349`).
    const updates = { visibility };
    if (entry.syncStatus === SyncStatus.SYNCED) {
      updates.syncStatus = SyncStatus.PENDING;
    }
    await this.dbService.updateEntry(localId, updates);

    // The operation carries the memory as it stands, audience included: anything the person
    // added while it was refused exists nowhere else yet. (The push also re-reads the row, so
    // a media upload that lands in the meantime is still picked up.)
    await SyncQueue.enqueue({
      type: entry.serverId ? SyncOperationType.UPDATE_ENTRY : SyncOperationType.CREATE_ENTRY,
      entityId: localId,
      serverId: entry.serverId || null,
      data: { ...entry, ...updates, local_id: localId },
    });

    await this.repository.setShareState(localId, null);

    const updated = await this.repository.getByLocalId(localId);

    // The card stops saying "Not shared" without the screen reloading: useJournal listens
    // for this and replaces the entry it holds.
    this._emit('entryUpdated', updated);

    // Same reasoning as create and edit: the person has just asked for this memory to be
    // shared, so it goes now rather than at the next five-minute sweep.
    this._syncNow('reshareEntry');

    return updated;
  }

  // ============================================================
  // Entry Deletion
  // ============================================================

  /**
   * Delete an entry (soft delete)
   * @param {string} localId - Entry local ID
   */
  async deleteEntry(localId) {
    // Get entry to clean up media files later (after sync confirms)
    const entry = await this.getEntry(localId);
    
    if (!entry) {
      throw new Error(`Entry not found: ${localId}`);
    }

    await this.repository.delete(localId);

    this._emit('entryDeleted', { localId });
  }

  // ============================================================
  // Media Queue Management
  // ============================================================

  /**
   * Ask the sync engine to run now, without blocking the caller.
   *
   * Imported lazily to avoid a cycle: SyncEngine imports JournalService for the media
   * backfill, so a top-level import here would close the loop.
   */
  _syncNow(reason) {
    try {
      const { SyncEngine } = require('../sync/SyncEngine');
      Promise.resolve(SyncEngine.sync())
        .catch((error) => console.log(`[JournalService] Immediate sync after ${reason} failed:`, error?.message));
    } catch (error) {
      console.log('[JournalService] Sync engine unavailable:', error?.message);
    }
  }

  /**
   * Queue all media in an entry for upload
   * @param {object} entry - Journal entry
   */
  async _queueMediaForUpload(entry) {
    // PHOTOS, not IMAGE. ContentBlockType has no IMAGE member, so this list contained
    // `undefined` and matched nothing -- no media was ever queued, nothing was ever
    // uploaded, and every entry carrying a photo was then pushed with local file paths
    // where the server requires a url. It answered 400 and the entry retried forever.
    const MEDIA_TYPES = [
      ContentBlockType.PHOTOS,
      ContentBlockType.VIDEO,
      ContentBlockType.AUDIO,
    ];

    for (const block of entry.contentBlocks || []) {
      if (MEDIA_TYPES.includes(block?.type)) {
        await this._queueMediaBlockForUpload(entry.localId, block);
      }
    }
  }

  /**
   * Queue a single media block for upload
   * @param {string} entryLocalId - Entry local ID
   * @param {object} block - Media content block
   */
  async _queueMediaBlockForUpload(entryLocalId, block) {
    // A block holds an array of media, not one file. This read block.localPath and
    // block.id -- fields that live on each media item, not on the block -- so even once
    // the type check above matched, it returned immediately on the missing path.
    const items = Array.isArray(block.media) ? block.media : [];
    if (items.length === 0) return;

    const mediaType = {
      [ContentBlockType.PHOTOS]: MediaType.IMAGE,
      [ContentBlockType.VIDEO]: MediaType.VIDEO,
      [ContentBlockType.AUDIO]: MediaType.AUDIO,
    }[block.type];

    if (!mediaType) return;

    for (const item of items) {
      // Already uploaded: nothing to do.
      if (item?.serverUrl) continue;

      const localPath = item?.localPath || item?.uri;
      if (!localPath) continue;

      const fileInfo = await this.fileService.getFileInfo(localPath);
      if (!fileInfo) {
        console.warn(`[JournalService] Media file not found: ${localPath}`);
        continue;
      }

      await this.dbService.queueMedia({
        // Falls back to a value derived from the file itself. Media saved before this
        // path worked may carry no id, and a null primary key would let the same file be
        // queued again on every sync instead of being recognised as already there.
        localId: item.id || `${entryLocalId}:${localPath}`,
        entryLocalId,
        filePath: localPath,
        mediaType,
        fileSize: fileInfo.size || 0,
        width: item.width,
        height: item.height,
        duration: item.duration ?? block.duration,
        thumbnailPath: item.thumbnailPath || item.thumbnailUri,
      });
    }
  }

  /**
   * Get pending media uploads
   * @returns {Promise<Array>} Media items waiting to be uploaded
   */
  async getPendingUploads() {
    return this.dbService.getPendingMediaUploads();
  }

  // ============================================================
  // Sync Status
  // ============================================================

  /**
   * Get entries pending sync
   * @returns {Promise<Array>} Entries that need syncing
   */
  async getPendingSyncEntries() {
    return this.repository.getPendingSync();
  }

  /**
   * Get sync statistics
   * @param {string} journalId - Journal ID
   * @returns {Promise<object>} Sync stats
   */
  async getSyncStats(journalId) {
    const entries = await this.getEntries(journalId, { limit: 1000 });
    
    let synced = 0;
    let pending = 0;
    let failed = 0;
    let localOnly = 0;

    for (const entry of entries) {
      switch (entry.syncStatus) {
        case 'synced':
          synced++;
          break;
        case 'pending':
          pending++;
          break;
        case 'failed':
          failed++;
          break;
        case 'local_only':
          localOnly++;
          break;
      }
    }

    return {
      total: entries.length,
      synced,
      pending,
      failed,
      localOnly,
    };
  }

  // ============================================================
  // Event System
  // ============================================================

  /**
   * Subscribe to journal events
   * @param {string} event - Event name (entryCreated, entryUpdated, entryDeleted)
   * @param {function} callback - Event handler
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    this._eventListeners.get(event).add(callback);

    return () => {
      const listeners = this._eventListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  _emit(event, data) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[JournalService] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  // ============================================================
  // Storage Info
  // ============================================================

  /**
   * Get storage usage for journal media
   * @returns {Promise<object>} Storage usage stats
   */
  async getStorageUsage() {
    return this.fileService.getStorageUsage();
  }
}

// Export singleton instance
export const JournalService = new JournalServiceClass();

// Re-export related types
export { EntryVisibility, LocationSharing, SortOrder } from '../repositories/JournalRepository';
export { ContentBlockType } from '../database/schema';
export { MediaType } from './FileService';

export default JournalService;
