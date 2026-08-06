/**
 * Journal Service
 * 
 * Business logic layer for journal operations.
 * Orchestrates between JournalRepository, FileService, and other services.
 * Provides a clean API for UI components to interact with journal entries.
 */

import { JournalRepository, EntryVisibility, SortOrder } from '../repositories/JournalRepository';
import { FileService, MediaType } from './FileService';
import { DatabaseService } from './DatabaseService';
import { SettingsService, StorageMode } from './SettingsService';
import { ContentBlockType, UploadStatus } from '../database/schema';
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
    });

    // Queue media for upload if there are media blocks
    await this._queueMediaForUpload(entry);

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
   * Queue all media in an entry for upload
   * @param {object} entry - Journal entry
   */
  async _queueMediaForUpload(entry) {
    for (const block of entry.contentBlocks) {
      if ([ContentBlockType.IMAGE, ContentBlockType.VIDEO, ContentBlockType.AUDIO].includes(block.type)) {
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
    // Skip if already has server URL (already uploaded)
    if (block.serverUrl) return;

    // Skip if no local path
    if (!block.localPath) return;

    // Get file info
    const fileInfo = await this.fileService.getFileInfo(block.localPath);
    if (!fileInfo) {
      console.warn(`Media file not found: ${block.localPath}`);
      return;
    }

    // Determine media type
    let mediaType;
    switch (block.type) {
      case ContentBlockType.IMAGE:
        mediaType = MediaType.IMAGE;
        break;
      case ContentBlockType.VIDEO:
        mediaType = MediaType.VIDEO;
        break;
      case ContentBlockType.AUDIO:
        mediaType = MediaType.AUDIO;
        break;
      default:
        return;
    }

    // Queue for upload
    await this.dbService.queueMedia({
      localId: block.id,
      entryLocalId,
      filePath: block.localPath,
      mediaType,
      fileSize: fileInfo.size || 0,
      width: block.width,
      height: block.height,
      duration: block.duration,
      thumbnailPath: block.thumbnailPath,
    });
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
export { EntryVisibility, SortOrder } from '../repositories/JournalRepository';
export { ContentBlockType } from '../database/schema';
export { MediaType } from './FileService';

export default JournalService;
