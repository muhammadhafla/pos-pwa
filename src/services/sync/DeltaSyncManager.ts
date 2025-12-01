/**
 * DeltaSyncManager for incremental data synchronization from ERPNext
 * Implements efficient change detection and data transfer with conflict resolution
 */

import { ERPNextClient, ERPNextItem, APIResponse as _APIResponse } from '../erpnext/ERPNextClient';
import { POSDatabase } from '../database/POSDatabase';
import { Item } from '../../types';

export interface SyncConfig {
  branchId: string;
  syncInterval: number; // milliseconds
  batchSize: number;
  maxRetries: number;
  conflictResolution: 'server' | 'client' | 'manual';
}

export interface SyncStatus {
  isRunning: boolean;
  lastSyncTime?: Date;
  nextSyncTime?: Date;
  totalItems: number;
  syncedItems: number;
  failedItems: number;
  conflicts: SyncConflict[];
  performance: SyncPerformance;
}

export interface SyncConflict {
  id: string;
  itemId: string;
  field: string;
  serverValue: any;
  clientValue: any;
  lastModified: Date;
  resolution?: 'server' | 'client' | 'manual';
  resolvedValue?: any;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface SyncPerformance {
  startTime: Date;
  endTime?: Date;
  duration: number;
  itemsPerSecond: number;
  networkRequests: number;
  dataTransferred: number;
  errors: string[];
}

export interface SyncResult {
  success: boolean;
  syncedItems: number;
  failedItems: number;
  conflicts: number;
  duration: number;
  errors: string[];
  nextSyncTime?: Date;
}

export interface ChangeDetection {
  added: string[]; // New item IDs
  modified: string[]; // Modified item IDs
  deleted: string[]; // Deleted item IDs
  totalChanges: number;
}

/**
 * DeltaSyncManager - Handles incremental synchronization with ERPNext
 */
export class DeltaSyncManager {
  private db: POSDatabase;
  private erpNextClient: ERPNextClient;
  private config: SyncConfig;
  private syncTimer?: number;
  private isRunning = false;
  private syncStatus: SyncStatus;
  private performanceMetrics: SyncPerformance;
  private lastSyncTimestamp: Date = new Date(0);

  constructor(db: POSDatabase, erpNextClient: ERPNextClient, config: SyncConfig) {
    this.db = db;
    this.erpNextClient = erpNextClient;
    this.config = config;

    this.syncStatus = {
      isRunning: false,
      totalItems: 0,
      syncedItems: 0,
      failedItems: 0,
      conflicts: [],
      performance: {
        startTime: new Date(),
        duration: 0,
        itemsPerSecond: 0,
        networkRequests: 0,
        dataTransferred: 0,
        errors: [],
      },
    };

    this.performanceMetrics = { ...this.syncStatus.performance };
    this.loadLastSyncTimestamp();
  }

  /**
   * Start automatic synchronization
   */
  async startSync(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Sync already running');
      return;
    }

    this.isRunning = true;
    this.syncStatus.isRunning = true;

    console.log('🔄 Starting delta synchronization...');

    // Perform initial sync
    await this.performDeltaSync();

    // Set up periodic sync
    this.syncTimer = window.setInterval(() => {
      if (navigator.onLine) {
        this.performDeltaSync().catch(error => {
          console.error('Scheduled sync failed:', error);
        });
      }
    }, this.config.syncInterval);

    console.log(`✅ Delta sync started - interval: ${this.config.syncInterval}ms`);
  }

  /**
   * Stop automatic synchronization
   */
  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    this.isRunning = false;
    this.syncStatus.isRunning = false;

    console.log('🛑 Delta sync stopped');
  }

  /**
   * Perform delta synchronization
   */
  async performDeltaSync(): Promise<SyncResult> {
    const startTime = Date.now();
    this.performanceMetrics = {
      startTime: new Date(),
      duration: 0,
      itemsPerSecond: 0,
      networkRequests: 0,
      dataTransferred: 0,
      errors: [],
    };

    try {
      console.log('🔍 Detecting changes since last sync...');

      // Detect changes from ERPNext
      const changes = await this.detectChanges();
      this.performanceMetrics.networkRequests++;

      console.log(
        `📊 Changes detected: +${changes.added.length}, ~${changes.modified.length}, -${changes.deleted.length}`
      );

      if (changes.totalChanges === 0) {
        console.log('✅ No changes to sync');
        return {
          success: true,
          syncedItems: 0,
          failedItems: 0,
          conflicts: 0,
          duration: Date.now() - startTime,
          errors: [],
          nextSyncTime: new Date(Date.now() + this.config.syncInterval),
        };
      }

      // Process changes in batches
      const batchSize = this.config.batchSize;
      let syncedItems = 0;
      let failedItems = 0;
      const allConflicts: SyncConflict[] = [];

      // Process added and modified items
      const itemsToSync = [...changes.added, ...changes.modified];

      for (let i = 0; i < itemsToSync.length; i += batchSize) {
        const batch = itemsToSync.slice(i, i + batchSize);

        try {
          const batchResult = await this.syncItemBatch(batch);
          syncedItems += batchResult.synced;
          failedItems += batchResult.failed;
          allConflicts.push(...batchResult.conflicts);

          // Track performance
          this.performanceMetrics.dataTransferred += batchResult.dataSize;

          console.log(
            `📦 Batch ${Math.floor(i / batchSize) + 1}: ${batchResult.synced} synced, ${
              batchResult.failed
            } failed`
          );
        } catch (error) {
          console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
          failedItems += batch.length;
          this.performanceMetrics.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error}`);
        }
      }

      // Handle deleted items
      if (changes.deleted.length > 0) {
        await this.handleDeletedItems(changes.deleted);
      }

      // Resolve conflicts
      const conflictsResolved = await this.resolveConflicts(allConflicts);

      // Update sync status
      this.syncStatus.lastSyncTime = new Date();
      this.syncStatus.nextSyncTime = new Date(Date.now() + this.config.syncInterval);
      this.syncStatus.totalItems += syncedItems;
      this.syncStatus.syncedItems += syncedItems;
      this.syncStatus.failedItems += failedItems;
      this.syncStatus.conflicts = allConflicts;

      const duration = Date.now() - startTime;
      this.performanceMetrics.duration = duration;
      this.performanceMetrics.itemsPerSecond = syncedItems / (duration / 1000);
      this.syncStatus.performance = { ...this.performanceMetrics };

      // Save sync timestamp
      await this.saveLastSyncTimestamp();

      console.log(`✅ Delta sync completed: ${syncedItems} items synced in ${duration}ms`);

      return {
        success: true,
        syncedItems,
        failedItems,
        conflicts: conflictsResolved,
        duration,
        errors: [...this.performanceMetrics.errors],
        nextSyncTime: this.syncStatus.nextSyncTime,
      };
    } catch (error) {
      console.error('❌ Delta sync failed:', error);
      this.performanceMetrics.errors.push(error instanceof Error ? error.message : String(error));

      return {
        success: false,
        syncedItems: 0,
        failedItems: 0,
        conflicts: 0,
        duration: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Detect changes since last sync
   */
  private async detectChanges(): Promise<ChangeDetection> {
    const lastSync = this.lastSyncTimestamp;

    // Get items modified since last sync
    const response = await this.erpNextClient.getItems({
      filters: [
        ['modified', '>', lastSync.toISOString().split('T')[0]], // Date comparison
      ],
      fields: ['name', 'modified', 'creation'],
      limit_page_length: 1000, // Large page to get all changes
    });

    if (!response.success) {
      throw new Error(`Failed to detect changes: ${response.error}`);
    }

    const modifiedItems = response.data?.data ?? [];

    // Get all current local items for comparison
    const localItems = await this.db.items.toArray();
    const localItemIds = new Set(localItems.map(item => item.id));

    // Get ERPNext item IDs
    const remoteItemIds = new Set(modifiedItems.map((item: ERPNextItem) => item.name));

    // Detect changes
    const added = Array.from(remoteItemIds).filter(id => !localItemIds.has(id));
    const modified = modifiedItems
      .filter((item: ERPNextItem) => localItemIds.has(item.name))
      .map((item: ERPNextItem) => item.name);
    const deleted = Array.from(localItemIds).filter(id => !remoteItemIds.has(id));

    return {
      added,
      modified,
      deleted,
      totalChanges: added.length + modified.length + deleted.length,
    };
  }

  /**
   * Sync a batch of items
   */
  private async syncItemBatch(itemIds: string[]): Promise<{
    synced: number;
    failed: number;
    conflicts: SyncConflict[];
    dataSize: number;
  }> {
    let synced = 0;
    let failed = 0;
    const conflicts: SyncConflict[] = [];
    let dataSize = 0;

    for (const itemId of itemIds) {
      try {
        const response = await this.erpNextClient.getItem(itemId);

        if (response.success && response.data) {
          const erpItem = response.data;
          const localItem = await this.db.items.get(itemId);

          // Convert ERPNext item to local format
          const localItemData = this.convertERPNextItemToLocal(erpItem, this.config.branchId);

          // Check for conflicts
          const conflict = this.detectConflict(localItem, localItemData);
          if (conflict) {
            conflicts.push(conflict);

            // Apply conflict resolution
            const resolvedItem = await this.resolveConflict(conflict, localItemData);
            if (resolvedItem) {
              await this.db.items.put(resolvedItem);
              synced++;
              dataSize += JSON.stringify(resolvedItem).length;
            } else {
              failed++;
            }
          } else {
            // No conflict, update directly
            if (localItem) {
              await this.db.items.update(itemId, localItemData);
            } else {
              await this.db.items.add(localItemData);
            }
            synced++;
            dataSize += JSON.stringify(localItemData).length;
          }
        } else {
          console.warn(`⚠️ Failed to get item ${itemId}:`, response.error);
          failed++;
        }
      } catch (error) {
        console.error(`❌ Failed to sync item ${itemId}:`, error);
        failed++;
      }
    }

    return { synced, failed, conflicts, dataSize };
  }

  /**
   * Handle deleted items
   */
  private async handleDeletedItems(deletedItemIds: string[]): Promise<void> {
    console.log(`🗑️ Handling ${deletedItemIds.length} deleted items...`);

    for (const itemId of deletedItemIds) {
      try {
        // Mark as inactive rather than deleting to maintain referential integrity
        await this.db.items.update(itemId, {
          isActive: false,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        });

        console.log(`📤 Marked item ${itemId} as inactive`);
      } catch (error) {
        console.error(`❌ Failed to handle deleted item ${itemId}:`, error);
      }
    }
  }

  /**
   * Convert ERPNext item to local format
   */
  private convertERPNextItemToLocal(erpItem: ERPNextItem, _branchId: string): Item {
    return {
      id: erpItem.name,
      name: erpItem.item_name,
      category: erpItem.item_group,
      unit: erpItem.stock_uom,
      barcode: erpItem.name, // Use item code as barcode if no separate barcode field
      additionalBarcodes: [],
      basePrice: erpItem.standard_rate ?? 0,
      cost: erpItem.valuation_rate ?? 0,
      isActive: true,
      tags: [],
      brand: undefined,
      supplierId: undefined,
      supplierName: undefined,
      stock: {
        current: 0,
        minimum: 0,
        maximum: 0,
      },
      createdAt: new Date(erpItem.creation ?? new Date()),
      updatedAt: new Date(erpItem.modified ?? new Date()),
      lastSyncedAt: new Date(),
    };
  }

  /**
   * Detect conflict between local and remote data
   */
  private detectConflict(localItem: Item | undefined, remoteItem: Item): SyncConflict | null {
    if (!localItem) return null;

    // Check for conflicts in key fields
    const conflictFields = ['name', 'basePrice', 'cost', 'category'];

    for (const field of conflictFields) {
      if ((localItem as any)[field] !== (remoteItem as any)[field]) {
        return {
          id: `${remoteItem.id}-${field}-${Date.now()}`,
          itemId: remoteItem.id,
          field,
          serverValue: (remoteItem as any)[field],
          clientValue: (localItem as any)[field],
          lastModified: new Date(),
        };
      }
    }

    return null;
  }

  /**
   * Resolve a sync conflict
   */
  private async resolveConflict(conflict: SyncConflict, remoteItem: Item): Promise<Item | null> {
    switch (this.config.conflictResolution) {
      case 'server':
        console.log(`🔄 Resolving conflict for ${conflict.itemId}.${conflict.field}: Server wins`);
        return remoteItem;

      case 'client':
        console.log(`🔄 Resolving conflict for ${conflict.itemId}.${conflict.field}: Client wins`);
        const localItem = await this.db.items.get(conflict.itemId);
        return localItem ?? remoteItem;

      case 'manual':
        // For manual resolution, we could prompt the user
        // For now, fall back to server wins
        console.log(`⚠️ Manual conflict resolution not implemented, using server wins`);
        return remoteItem;

      default:
        console.log(`⚠️ Unknown conflict resolution strategy, using server wins`);
        return remoteItem;
    }
  }

  /**
   * Resolve all conflicts
   */
  private async resolveConflicts(conflicts: SyncConflict[]): Promise<number> {
    if (conflicts.length === 0) return 0;

    console.log(`🔄 Resolving ${conflicts.length} conflicts...`);

    let resolved = 0;

    // Group conflicts by item
    const conflictGroups = conflicts.reduce((groups, conflict) => {
      if (!groups[conflict.itemId]) {
        groups[conflict.itemId] = [];
      }
      groups[conflict.itemId].push(conflict);
      return groups;
    }, {} as Record<string, SyncConflict[]>);

    // Resolve conflicts per item
    for (const [itemId, itemConflicts] of Object.entries(conflictGroups)) {
      try {
        const remoteItem = await this.getRemoteItem(itemId);
        if (!remoteItem) continue;

        let resolvedItem = remoteItem;

        for (const conflict of itemConflicts) {
          const resolution = await this.resolveConflict(conflict, resolvedItem);
          if (resolution) {
            resolvedItem = resolution;
            conflict.resolution = this.config.conflictResolution;
            conflict.resolvedValue = (resolution as any)[conflict.field];
            conflict.resolvedAt = new Date();
            resolved++;
          }
        }

        // Save resolved item
        await this.db.items.put(resolvedItem);
      } catch (error) {
        console.error(`❌ Failed to resolve conflicts for item ${itemId}:`, error);
      }
    }

    return resolved;
  }

  /**
   * Get remote item by ID
   */
  private async getRemoteItem(itemId: string): Promise<Item | null> {
    try {
      const response = await this.erpNextClient.getItem(itemId);
      if (response.success && response.data) {
        return this.convertERPNextItemToLocal(response.data, this.config.branchId);
      }
    } catch (error) {
      console.error(`Failed to get remote item ${itemId}:`, error);
    }
    return null;
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Force a full resync
   */
  async forceFullSync(): Promise<SyncResult> {
    console.log('🔄 Forcing full resync...');

    // Reset sync timestamp
    this.lastSyncTimestamp = new Date(0);

    // Perform sync
    return this.performDeltaSync();
  }

  /**
   * Save last sync timestamp
   */
  private async saveLastSyncTimestamp(): Promise<void> {
    try {
      await this.db.syncStatus.put({
        id: `items-sync-${this.config.branchId}`,
        lastSyncTime: this.lastSyncTimestamp,
        pendingTransactions: 0,
        pendingItems: 0,
        lastError:
          this.performanceMetrics.errors.length > 0 ? this.performanceMetrics.errors[0] : undefined,
        isOnline: navigator.onLine,
      });
    } catch (error) {
      console.error('Failed to save sync timestamp:', error);
    }
  }

  /**
   * Load last sync timestamp
   */
  private async loadLastSyncTimestamp(): Promise<void> {
    try {
      const syncRecord = await this.db.syncStatus.get(`items-sync-${this.config.branchId}`);
      if (syncRecord?.lastSyncTime) {
        this.lastSyncTimestamp = new Date(syncRecord.lastSyncTime);
        console.log(`📅 Loaded last sync timestamp: ${this.lastSyncTimestamp.toISOString()}`);
      }
    } catch (error) {
      console.error('Failed to load sync timestamp:', error);
    }
  }

  /**
   * Update sync timestamp to current time
   */
  updateSyncTimestamp(): void {
    this.lastSyncTimestamp = new Date();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): SyncPerformance {
    return { ...this.performanceMetrics };
  }
}
