/**
 * Database Schema Definitions
 * 
 * This file contains all table schemas for the local SQLite database.
 * The database stores journal entries, media queue, and sync metadata
 * for offline-first functionality.
 */

// Current schema version - increment when making breaking changes
export const SCHEMA_VERSION = 1;

/**
 * SQL statements to create all tables
 */
export const CREATE_TABLES = {
  /**
   * Journal entries stored locally
   * - local_id: UUID generated on device, primary key
   * - server_id: ID from backend, null until synced
   * - sync_status: tracks sync state (pending, syncing, synced, conflict, local_only)
   */
  journal_entries: `
    CREATE TABLE IF NOT EXISTS journal_entries (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      journal_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      content_blocks TEXT NOT NULL,
      location_lat REAL,
      location_lng REAL,
      location_name TEXT,
      visibility TEXT DEFAULT 'private',
      reactions_likes INTEGER DEFAULT 0,
      reactions_liked_by TEXT,
      comments_count INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      deleted_at INTEGER
    );
  `,

  /**
   * Media files pending upload to S3
   * - Tracks local file path and upload status
   * - Links to journal entry via entry_local_id
   */
  media_queue: `
    CREATE TABLE IF NOT EXISTS media_queue (
      local_id TEXT PRIMARY KEY,
      entry_local_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      media_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      duration INTEGER,
      server_url TEXT,
      thumbnail_path TEXT,
      thumbnail_server_url TEXT,
      upload_status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (entry_local_id) REFERENCES journal_entries(local_id) ON DELETE CASCADE
    );
  `,

  /**
   * Sync metadata for incremental sync
   * Key-value store for sync cursors and timestamps
   */
  sync_metadata: `
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,

  /**
   * Cached user data for offline access
   * Stores family/friends info for display when offline
   */
  cached_users: `
    CREATE TABLE IF NOT EXISTS cached_users (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      handle TEXT,
      email TEXT,
      avatar_url TEXT,
      avatar_local_path TEXT,
      relationship TEXT,
      location_lat REAL,
      location_lng REAL,
      location_name TEXT,
      location_updated_at INTEGER,
      updated_at INTEGER NOT NULL
    );
  `,

  /**
   * Comments on journal entries (cached for offline)
   */
  cached_comments: `
    CREATE TABLE IF NOT EXISTS cached_comments (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      entry_local_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      synced_at INTEGER,
      FOREIGN KEY (entry_local_id) REFERENCES journal_entries(local_id) ON DELETE CASCADE
    );
  `,

  /**
   * Sync queue for operations that need to be sent to server
   */
  sync_queue: `
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_local_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      last_attempt_at INTEGER
    );
  `,

  /**
   * Schema version tracking for migrations
   */
  schema_version: `
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `,
};

/**
 * Indexes for better query performance
 */
export const CREATE_INDEXES = [
  // Journal entries indexes
  'CREATE INDEX IF NOT EXISTS idx_entries_journal_id ON journal_entries(journal_id);',
  'CREATE INDEX IF NOT EXISTS idx_entries_user_id ON journal_entries(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_entries_date ON journal_entries(date);',
  'CREATE INDEX IF NOT EXISTS idx_entries_sync_status ON journal_entries(sync_status);',
  'CREATE INDEX IF NOT EXISTS idx_entries_server_id ON journal_entries(server_id);',
  
  // Media queue indexes
  'CREATE INDEX IF NOT EXISTS idx_media_entry_id ON media_queue(entry_local_id);',
  'CREATE INDEX IF NOT EXISTS idx_media_upload_status ON media_queue(upload_status);',
  
  // Cached users indexes
  'CREATE INDEX IF NOT EXISTS idx_users_relationship ON cached_users(relationship);',
  
  // Comments indexes
  'CREATE INDEX IF NOT EXISTS idx_comments_entry_id ON cached_comments(entry_local_id);',
  
  // Sync queue indexes
  'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);',
  'CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_local_id);',
];

/**
 * Sync status values
 */
export const SyncStatus = {
  PENDING: 'pending',       // Needs to be synced
  SYNCING: 'syncing',       // Currently syncing
  SYNCED: 'synced',         // Successfully synced
  CONFLICT: 'conflict',     // Sync conflict detected
  LOCAL_ONLY: 'local_only', // User chose not to sync (local-only mode)
  FAILED: 'failed',         // Sync failed after retries
};

/**
 * Upload status values for media
 */
export const UploadStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
};

/**
 * Content block types
 */
export const ContentBlockType = {
  TEXT: 'text',
  PHOTOS: 'photos',
  AUDIO: 'audio',
  VIDEO: 'video',
  // Stored on entries but not yet rendered by JournalEntryCard. Declared so
  // ContentBlock.location() emits a real type -- it previously referenced a
  // missing constant and produced `type: undefined`, which renders as nothing.
  LOCATION: 'location',
};

/**
 * Visibility options
 */
export const Visibility = {
  PRIVATE: 'private',
  FRIENDS: 'friends',
  FAMILY: 'family',
  PUBLIC: 'public',
};

/**
 * Sync queue operation types
 */
export const SyncOperation = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
};

/**
 * Entity types for sync queue
 */
export const EntityType = {
  JOURNAL_ENTRY: 'journal_entry',
  COMMENT: 'comment',
  REACTION: 'reaction',
  MEDIA: 'media',
};
