/**
 * Database Initialization and Management
 * 
 * This module provides the main entry point for database operations.
 * It handles:
 * - Database creation and opening
 * - Schema initialization
 * - Migrations
 * - Database instance management
 */

import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES, CREATE_INDEXES, SCHEMA_VERSION } from './schema';
import { runMigrations, getLatestVersion } from './migrations';

// Database name
const DATABASE_NAME = 'footprint.db';

// Singleton database instance
let dbInstance = null;

/**
 * Get or create the database instance
 * @returns {Promise<SQLiteDatabase>} The database instance
 */
export const getDatabase = async () => {
  if (dbInstance) {
    return dbInstance;
  }
  
  console.log('[Database] Opening database:', DATABASE_NAME);
  dbInstance = await SQLite.openDatabaseAsync(DATABASE_NAME);
  
  // Enable foreign keys
  await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
  
  // Enable WAL mode for better performance
  await dbInstance.execAsync('PRAGMA journal_mode = WAL;');
  
  return dbInstance;
};

/**
 * Initialize the database schema
 * Creates all tables and indexes if they don't exist
 * @param {SQLiteDatabase} db - Database instance
 */
const initializeSchema = async (db) => {
  console.log('[Database] Initializing schema...');
  
  // Create all tables
  for (const [tableName, createSQL] of Object.entries(CREATE_TABLES)) {
    try {
      await db.execAsync(createSQL);
      console.log(`[Database] Created table: ${tableName}`);
    } catch (error) {
      console.error(`[Database] Error creating table ${tableName}:`, error);
      throw error;
    }
  }
  
  // Create all indexes
  for (const indexSQL of CREATE_INDEXES) {
    try {
      await db.execAsync(indexSQL);
    } catch (error) {
      console.error('[Database] Error creating index:', error);
      // Continue with other indexes
    }
  }
  
  console.log('[Database] Schema initialization complete');
};

/**
 * Get the current schema version from the database
 * @param {SQLiteDatabase} db - Database instance
 * @returns {Promise<number>} Current schema version (0 if not set)
 */
const getCurrentVersion = async (db) => {
  try {
    const result = await db.getFirstAsync(
      'SELECT MAX(version) as version FROM schema_version'
    );
    return result?.version || 0;
  } catch (error) {
    // Table doesn't exist yet
    return 0;
  }
};

/**
 * Set the schema version
 * @param {SQLiteDatabase} db - Database instance
 * @param {number} version - Version to set
 */
const setSchemaVersion = async (db, version) => {
  await db.runAsync(
    'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)',
    [version, Date.now()]
  );
};

/**
 * Initialize the database
 * - Opens or creates the database
 * - Creates schema if needed
 * - Runs any pending migrations
 * @returns {Promise<SQLiteDatabase>} Initialized database instance
 */
export const initializeDatabase = async () => {
  try {
    const db = await getDatabase();
    
    // Initialize schema (creates tables if they don't exist)
    await initializeSchema(db);
    
    // Check current version and run migrations if needed
    const currentVersion = await getCurrentVersion(db);
    const latestVersion = getLatestVersion();
    
    console.log(`[Database] Current version: ${currentVersion}, Latest: ${latestVersion}`);
    
    if (currentVersion < latestVersion) {
      await runMigrations(db, currentVersion);
    }
    
    // Ensure version is set
    if (currentVersion === 0) {
      await setSchemaVersion(db, SCHEMA_VERSION);
    }
    
    console.log('[Database] Initialization complete');
    return db;
  } catch (error) {
    console.error('[Database] Initialization failed:', error);
    throw error;
  }
};

/**
 * Close the database connection
 */
export const closeDatabase = async () => {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    console.log('[Database] Connection closed');
  }
};

/**
 * Reset the database (for development/testing only)
 * WARNING: This deletes all data!
 */
export const resetDatabase = async () => {
  console.warn('[Database] RESETTING DATABASE - All data will be lost!');
  
  const db = await getDatabase();
  
  // Drop all tables in reverse order (due to foreign keys)
  const tables = [
    'sync_queue',
    'cached_comments',
    'cached_users',
    'sync_metadata',
    'media_queue',
    'journal_entries',
    'schema_version',
  ];
  
  for (const table of tables) {
    try {
      await db.execAsync(`DROP TABLE IF EXISTS ${table};`);
      console.log(`[Database] Dropped table: ${table}`);
    } catch (error) {
      console.error(`[Database] Error dropping table ${table}:`, error);
    }
  }
  
  // Re-initialize
  await initializeSchema(db);
  await setSchemaVersion(db, SCHEMA_VERSION);
  
  console.log('[Database] Reset complete');
};

/**
 * Unified local-store wipe. Aliased to resetDatabase so callers can use the
 * same name across the native and web implementations.
 */
export const clearDatabase = resetDatabase;

/**
 * Get database statistics (for debugging)
 */
export const getDatabaseStats = async () => {
  const db = await getDatabase();
  
  const stats = {};
  
  // Count entries in each table
  const tables = [
    'journal_entries',
    'media_queue',
    'cached_users',
    'cached_comments',
    'sync_queue',
  ];
  
  for (const table of tables) {
    try {
      const result = await db.getFirstAsync(`SELECT COUNT(*) as count FROM ${table}`);
      stats[table] = result?.count || 0;
    } catch (error) {
      stats[table] = 'error';
    }
  }
  
  // Get pending sync items
  try {
    const pending = await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM journal_entries WHERE sync_status = 'pending'"
    );
    stats.pendingSync = pending?.count || 0;
  } catch (error) {
    stats.pendingSync = 'error';
  }
  
  // Get pending media uploads
  try {
    const pendingMedia = await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM media_queue WHERE upload_status = 'pending'"
    );
    stats.pendingUploads = pendingMedia?.count || 0;
  } catch (error) {
    stats.pendingUploads = 'error';
  }
  
  return stats;
};

// Export schema constants for use in services
export { SyncStatus, UploadStatus, ContentBlockType, Visibility, SyncOperation, EntityType } from './schema';
