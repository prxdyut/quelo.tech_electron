const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const EventEmitter = require('events');

/**
 * Sync Queue Service
 * Manages persistent queue of operations that need to be synced when online
 * Includes retry logic, priority handling, and persistence across app restarts
 */
class SyncQueueService extends EventEmitter {
  constructor() {
    super();
    this.queueFile = path.join(app.getPath('userData'), 'sync-queue.json');
    this.queue = [];
    this.processing = false;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.initialized = false;
  }

  /**
   * Initialize sync queue from persistent storage
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.queueFile, 'utf-8');
      this.queue = JSON.parse(data);
      console.log(`[SyncQueue] Loaded ${this.queue.length} items from persistent storage`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[SyncQueue] No existing queue file, starting fresh');
        this.queue = [];
      } else {
        console.error('[SyncQueue] Failed to load queue:', error);
        this.queue = [];
      }
    }

    this.initialized = true;
  }

  /**
   * Save queue to persistent storage
   */
  async save() {
    try {
      await fs.writeFile(this.queueFile, JSON.stringify(this.queue, null, 2), 'utf-8');
      console.log(`[SyncQueue] Saved ${this.queue.length} items to persistent storage`);
    } catch (error) {
      console.error('[SyncQueue] Failed to save queue:', error);
    }
  }

  /**
   * Add item to sync queue
   * @param {object} item - Queue item
   * @param {string} item.type - Operation type (POST, PUT, DELETE, UPLOAD)
   * @param {string} item.endpoint - API endpoint
   * @param {any} item.data - Request data
   * @param {string} item.priority - Priority (high, normal, low)
   * @param {object} item.metadata - Additional metadata
   */
  async add(item) {
    await this.initialize();

    const queueItem = {
      id: this.generateId(),
      type: item.type,
      endpoint: item.endpoint,
      data: item.data,
      priority: item.priority || 'normal',
      metadata: item.metadata || {},
      retries: 0,
      createdAt: Date.now(),
      status: 'pending'
    };

    this.queue.push(queueItem);
    await this.save();

    console.log(`[SyncQueue] Added item ${queueItem.id} (${queueItem.type} ${queueItem.endpoint})`);
    this.emit('itemAdded', queueItem);

    return queueItem.id;
  }

  /**
   * Remove item from queue
   */
  async remove(itemId) {
    await this.initialize();

    const index = this.queue.findIndex(item => item.id === itemId);
    if (index !== -1) {
      const item = this.queue.splice(index, 1)[0];
      await this.save();
      console.log(`[SyncQueue] Removed item ${itemId}`);
      this.emit('itemRemoved', item);
      return true;
    }
    return false;
  }

  /**
   * Update item status
   */
  async updateStatus(itemId, status, error = null) {
    await this.initialize();

    const item = this.queue.find(item => item.id === itemId);
    if (item) {
      item.status = status;
      item.lastAttempt = Date.now();
      if (error) {
        item.lastError = error;
      }
      await this.save();
      this.emit('itemUpdated', item);
    }
  }

  /**
   * Get all queue items
   */
  async getAll() {
    await this.initialize();
    return [...this.queue];
  }

  /**
   * Get queue by priority
   */
  async getByPriority() {
    await this.initialize();
    
    const priorityOrder = { high: 1, normal: 2, low: 3 };
    return [...this.queue].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    await this.initialize();

    const stats = {
      total: this.queue.length,
      pending: 0,
      processing: 0,
      failed: 0,
      byPriority: { high: 0, normal: 0, low: 0 },
      byType: {}
    };

    this.queue.forEach(item => {
      // Status counts
      if (item.status === 'pending') stats.pending++;
      else if (item.status === 'processing') stats.processing++;
      else if (item.status === 'failed') stats.failed++;

      // Priority counts
      stats.byPriority[item.priority]++;

      // Type counts
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Process sync queue
   * @param {function} processor - Function to process each item
   */
  async process(processor) {
    await this.initialize();

    if (this.processing) {
      console.log('[SyncQueue] Already processing queue');
      return { success: false, message: 'Already processing' };
    }

    this.processing = true;
    this.emit('processingStarted');

    console.log(`[SyncQueue] Starting to process ${this.queue.length} items`);

    const items = await this.getByPriority();
    const results = {
      processed: 0,
      failed: 0,
      skipped: 0
    };

    for (const item of items) {
      // Skip if already processing or recently failed
      if (item.status === 'processing') {
        results.skipped++;
        continue;
      }

      // Skip if max retries reached
      if (item.retries >= this.maxRetries) {
        console.warn(`[SyncQueue] Item ${item.id} exceeded max retries, marking as failed`);
        await this.updateStatus(item.id, 'failed', 'Max retries exceeded');
        results.failed++;
        continue;
      }

      // Process item
      try {
        console.log(`[SyncQueue] Processing item ${item.id} (${item.type} ${item.endpoint})`);
        await this.updateStatus(item.id, 'processing');

        const result = await processor(item);

        if (result.success) {
          console.log(`[SyncQueue] Successfully processed item ${item.id}`);
          await this.remove(item.id);
          results.processed++;
          this.emit('itemProcessed', item);
        } else {
          console.warn(`[SyncQueue] Failed to process item ${item.id}:`, result.error);
          item.retries++;
          await this.updateStatus(item.id, 'pending', result.error);
          results.failed++;
          this.emit('itemFailed', item, result.error);

          // Wait before next retry
          if (item.retries < this.maxRetries) {
            await this.delay(this.retryDelay * item.retries);
          }
        }
      } catch (error) {
        console.error(`[SyncQueue] Error processing item ${item.id}:`, error);
        item.retries++;
        await this.updateStatus(item.id, 'pending', error.message);
        results.failed++;
        this.emit('itemFailed', item, error.message);
      }
    }

    this.processing = false;
    this.emit('processingCompleted', results);

    console.log(`[SyncQueue] Processing complete - Processed: ${results.processed}, Failed: ${results.failed}, Skipped: ${results.skipped}`);

    return {
      success: true,
      ...results
    };
  }

  /**
   * Clear entire queue
   */
  async clear() {
    await this.initialize();
    
    const count = this.queue.length;
    this.queue = [];
    await this.save();
    
    console.log(`[SyncQueue] Cleared ${count} items`);
    this.emit('queueCleared');
    
    return count;
  }

  /**
   * Clear failed items
   */
  async clearFailed() {
    await this.initialize();
    
    const failedCount = this.queue.filter(item => item.status === 'failed').length;
    this.queue = this.queue.filter(item => item.status !== 'failed');
    await this.save();
    
    console.log(`[SyncQueue] Cleared ${failedCount} failed items`);
    return failedCount;
  }

  /**
   * Retry failed items
   */
  async retryFailed() {
    await this.initialize();
    
    const failedItems = this.queue.filter(item => item.status === 'failed');
    failedItems.forEach(item => {
      item.status = 'pending';
      item.retries = 0;
      item.lastError = null;
    });
    
    await this.save();
    console.log(`[SyncQueue] Reset ${failedItems.length} failed items for retry`);
    
    return failedItems.length;
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if queue is empty
   */
  async isEmpty() {
    await this.initialize();
    return this.queue.length === 0;
  }

  /**
   * Check if processing
   */
  isProcessing() {
    return this.processing;
  }
}

module.exports = SyncQueueService;
