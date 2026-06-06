/**
 * Sync Queue
 * 
 * Manages a persistent queue of sync operations.
 * Operations are stored in SQLite and processed in order.
 */

import { getDatabase } from '../database';
import { SyncStatus } from '../database/schema';

/**
 * Sync operation types
 */
export const SyncOperationType = {
  CREATE_ENTRY: 'create_entry',
  UPDATE_ENTRY: 'update_entry',
  DELETE_ENTRY: 'delete_entry',
  UPLOAD_MEDIA: 'upload_media',
  DELETE_MEDIA: 'delete_media',
};

/**
 * Operation status
 */
export const OperationStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CONFLICT: 'conflict',
};

/**
 * SyncQueue class for managing offline operations
 */
class SyncQueueClass {
  constructor() {
    this._listeners = new Set();
    this._processing = false;
  }

  // ============================================================
  // Queue Operations
  // ============================================================

  /**
   * Add an operation to the sync queue
   * @param {object} operation - Operation details
   * @returns {Promise<string>} Operation ID
   */
  async enqueue(operation) {
    const db = await getDatabase();
    
    const {
      type,
      entityId,      // Local ID of the entity
      serverId,      // Server ID (if exists)
      data,          // Operation payload
      priority = 0,  // Higher priority = processed first
    } = operation;

    const id = this._generateId();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO sync_queue (
        id, operation_type, entity_id, server_id, payload, 
        status, priority, retry_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        entityId,
        serverId || null,
        JSON.stringify(data),
        OperationStatus.PENDING,
        priority,
        0,
        now,
        now,
      ]
    );

    console.log('[SyncQueue] Enqueued operation:', { id, type, entityId });
    this._notifyListeners();
    
    return id;
  }

  /**
   * Add multiple operations in a transaction
   * @param {array} operations - Array of operation objects
   * @returns {Promise<array>} Array of operation IDs
   */
  async enqueueBatch(operations) {
    const db = await getDatabase();
    const ids = [];
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      for (const operation of operations) {
        const id = this._generateId();
        ids.push(id);

        await db.runAsync(
          `INSERT INTO sync_queue (
            id, operation_type, entity_id, server_id, payload,
            status, priority, retry_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            operation.type,
            operation.entityId,
            operation.serverId || null,
            JSON.stringify(operation.data),
            OperationStatus.PENDING,
            operation.priority || 0,
            0,
            now,
            now,
          ]
        );
      }
    });

    console.log('[SyncQueue] Enqueued batch:', ids.length, 'operations');
    this._notifyListeners();
    
    return ids;
  }

  /**
   * Get pending operations, ordered by priority and time
   * @param {number} limit - Maximum operations to return
   * @returns {Promise<array>} Array of operations
   */
  async getPendingOperations(limit = 50) {
    const db = await getDatabase();

    const rows = await db.getAllAsync(
      `SELECT * FROM sync_queue 
       WHERE status = ? OR (status = ? AND retry_count < ?)
       ORDER BY priority DESC, created_at ASC
       LIMIT ?`,
      [OperationStatus.PENDING, OperationStatus.FAILED, 3, limit]
    );

    return rows.map(row => this._formatOperation(row));
  }

  /**
   * Get operation by ID
   * @param {string} operationId - Operation ID
   */
  async getOperation(operationId) {
    const db = await getDatabase();

    const row = await db.getFirstAsync(
      'SELECT * FROM sync_queue WHERE id = ?',
      [operationId]
    );

    return row ? this._formatOperation(row) : null;
  }

  /**
   * Get operations for a specific entity
   * @param {string} entityId - Entity ID
   */
  async getOperationsForEntity(entityId) {
    const db = await getDatabase();

    const rows = await db.getAllAsync(
      `SELECT * FROM sync_queue 
       WHERE entity_id = ? AND status != ?
       ORDER BY created_at ASC`,
      [entityId, OperationStatus.COMPLETED]
    );

    return rows.map(row => this._formatOperation(row));
  }

  /**
   * Get count of pending operations
   */
  async getPendingCount() {
    const db = await getDatabase();

    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM sync_queue 
       WHERE status IN (?, ?)`,
      [OperationStatus.PENDING, OperationStatus.IN_PROGRESS]
    );

    return result?.count || 0;
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const db = await getDatabase();

    const results = await db.getAllAsync(
      `SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status`
    );

    const stats = {
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      conflict: 0,
      total: 0,
    };

    results.forEach(row => {
      switch (row.status) {
        case OperationStatus.PENDING:
          stats.pending = row.count;
          break;
        case OperationStatus.IN_PROGRESS:
          stats.inProgress = row.count;
          break;
        case OperationStatus.COMPLETED:
          stats.completed = row.count;
          break;
        case OperationStatus.FAILED:
          stats.failed = row.count;
          break;
        case OperationStatus.CONFLICT:
          stats.conflict = row.count;
          break;
      }
      stats.total += row.count;
    });

    return stats;
  }

  // ============================================================
  // Status Updates
  // ============================================================

  /**
   * Mark operation as in progress
   * @param {string} operationId - Operation ID
   */
  async markInProgress(operationId) {
    await this._updateStatus(operationId, OperationStatus.IN_PROGRESS);
  }

  /**
   * Mark operation as completed
   * @param {string} operationId - Operation ID
   * @param {object} result - Optional result data
   */
  async markCompleted(operationId, result = null) {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE sync_queue SET 
         status = ?, 
         result = ?,
         completed_at = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        OperationStatus.COMPLETED,
        result ? JSON.stringify(result) : null,
        now,
        now,
        operationId,
      ]
    );

    this._notifyListeners();
  }

  /**
   * Mark operation as failed
   * @param {string} operationId - Operation ID
   * @param {string} error - Error message
   */
  async markFailed(operationId, error) {
    const db = await getDatabase();
    const now = new Date().toISOString();

    // Get current retry count
    const operation = await this.getOperation(operationId);
    const retryCount = (operation?.retryCount || 0) + 1;

    await db.runAsync(
      `UPDATE sync_queue SET 
         status = ?, 
         last_error = ?,
         retry_count = ?,
         updated_at = ?
       WHERE id = ?`,
      [OperationStatus.FAILED, error, retryCount, now, operationId]
    );

    console.log('[SyncQueue] Operation failed:', { operationId, error, retryCount });
    this._notifyListeners();
  }

  /**
   * Mark operation as having a conflict
   * @param {string} operationId - Operation ID
   * @param {object} conflictData - Conflict details
   */
  async markConflict(operationId, conflictData) {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE sync_queue SET 
         status = ?, 
         conflict_data = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        OperationStatus.CONFLICT,
        JSON.stringify(conflictData),
        now,
        operationId,
      ]
    );

    console.log('[SyncQueue] Operation has conflict:', operationId);
    this._notifyListeners();
  }

  /**
   * Reset failed operations for retry
   */
  async resetFailedOperations() {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const result = await db.runAsync(
      `UPDATE sync_queue SET 
         status = ?, 
         updated_at = ?
       WHERE status = ? AND retry_count < ?`,
      [OperationStatus.PENDING, now, OperationStatus.FAILED, 3]
    );

    console.log('[SyncQueue] Reset failed operations:', result.changes);
    this._notifyListeners();
    
    return result.changes;
  }

  // ============================================================
  // Queue Management
  // ============================================================

  /**
   * Remove completed operations older than specified days
   * @param {number} daysOld - Age threshold in days
   */
  async cleanupOldOperations(daysOld = 7) {
    const db = await getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db.runAsync(
      `DELETE FROM sync_queue 
       WHERE status = ? AND completed_at < ?`,
      [OperationStatus.COMPLETED, cutoffDate.toISOString()]
    );

    console.log('[SyncQueue] Cleaned up old operations:', result.changes);
    return result.changes;
  }

  /**
   * Remove all operations for an entity (e.g., when deleted locally while offline)
   * @param {string} entityId - Entity ID
   */
  async removeOperationsForEntity(entityId) {
    const db = await getDatabase();

    const result = await db.runAsync(
      `DELETE FROM sync_queue WHERE entity_id = ? AND status != ?`,
      [entityId, OperationStatus.COMPLETED]
    );

    console.log('[SyncQueue] Removed operations for entity:', entityId, result.changes);
    this._notifyListeners();
    
    return result.changes;
  }

  /**
   * Cancel a pending operation
   * @param {string} operationId - Operation ID
   */
  async cancelOperation(operationId) {
    const db = await getDatabase();

    const result = await db.runAsync(
      `DELETE FROM sync_queue WHERE id = ? AND status = ?`,
      [operationId, OperationStatus.PENDING]
    );

    if (result.changes > 0) {
      console.log('[SyncQueue] Cancelled operation:', operationId);
      this._notifyListeners();
    }

    return result.changes > 0;
  }

  /**
   * Clear all operations (use with caution!)
   */
  async clearAll() {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM sync_queue');
    console.log('[SyncQueue] Cleared all operations');
    this._notifyListeners();
  }

  // ============================================================
  // Optimistic Updates & Deduplication
  // ============================================================

  /**
   * Check if entity has pending operations
   * @param {string} entityId - Entity ID
   */
  async hasPendingOperations(entityId) {
    const db = await getDatabase();

    const result = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM sync_queue 
       WHERE entity_id = ? AND status IN (?, ?, ?)`,
      [
        entityId,
        OperationStatus.PENDING,
        OperationStatus.IN_PROGRESS,
        OperationStatus.FAILED,
      ]
    );

    return (result?.count || 0) > 0;
  }

  /**
   * Deduplicate operations for an entity
   * Keeps only the latest operation of each type
   * @param {string} entityId - Entity ID
   */
  async deduplicateOperations(entityId) {
    const operations = await this.getOperationsForEntity(entityId);
    
    if (operations.length <= 1) return;

    // Group by type
    const byType = {};
    operations.forEach(op => {
      if (!byType[op.type]) byType[op.type] = [];
      byType[op.type].push(op);
    });

    const db = await getDatabase();

    // Keep only latest of each type
    for (const [type, ops] of Object.entries(byType)) {
      if (ops.length > 1) {
        // Sort by created_at desc, keep first
        ops.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const toRemove = ops.slice(1);
        
        for (const op of toRemove) {
          await db.runAsync(
            'DELETE FROM sync_queue WHERE id = ?',
            [op.id]
          );
        }

        console.log(`[SyncQueue] Deduplicated ${toRemove.length} ${type} operations for ${entityId}`);
      }
    }

    this._notifyListeners();
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  /**
   * Subscribe to queue changes
   * @param {function} callback - Callback function
   * @returns {function} Unsubscribe function
   */
  addListener(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Notify listeners of queue changes
   */
  _notifyListeners() {
    this._listeners.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('[SyncQueue] Listener error:', error);
      }
    });
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  async _updateStatus(operationId, status) {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE sync_queue SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, operationId]
    );

    this._notifyListeners();
  }

  _formatOperation(row) {
    return {
      id: row.id,
      type: row.operation_type,
      entityId: row.entity_id,
      serverId: row.server_id,
      data: row.payload ? JSON.parse(row.payload) : null,
      status: row.status,
      priority: row.priority,
      retryCount: row.retry_count,
      lastError: row.last_error,
      conflictData: row.conflict_data ? JSON.parse(row.conflict_data) : null,
      result: row.result ? JSON.parse(row.result) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }

  _generateId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const SyncQueue = new SyncQueueClass();
export default SyncQueue;
