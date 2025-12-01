/**
 * MasterSyncService - Central coordinator for all ERPNext synchronization operations
 * Manages both master data sync and transaction queue with comprehensive monitoring
 */

import { ERPNextClient } from '../erpnext/ERPNextClient';
import { POSDatabase } from '../database/POSDatabase';
import { DeltaSyncManager, SyncStatus, SyncResult } from './DeltaSyncManager';
import { TransactionQueueManager, QueueProcessingStats } from './TransactionQueueManager';
import { SyncPerformanceMonitor, SyncMetrics as _SyncMetrics } from './SyncPerformanceMonitor';
import { toast } from 'react-hot-toast';

export interface SyncConfiguration {
  erpnext: {
    baseUrl: string;
    apiVersion: string;
    timeout: number;
    maxRetries: number;
    retryDelay: number;
  };
  masterData: {
    branchId: string;
    syncInterval: number;
    batchSize: number;
    conflictResolution: 'server' | 'client' | 'manual';
  };
  transactions: {
    maxConcurrent: number;
    retryDelay: number;
    cleanupInterval: number;
  };
  monitoring: {
    healthCheckInterval: number;
    performanceLogging: boolean;
    alertThresholds: {
      syncFailureRate: number;
      responseTimeThreshold: number;
      queueBacklogThreshold: number;
    };
  };
}

export interface MasterSyncStatus {
  isInitialized: boolean;
  isOnline: boolean;
  erpnextConnected: boolean;
  lastHealthCheck?: Date;
  masterDataSync: SyncStatus;
  transactionQueue: QueueProcessingStats;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  activeIssues: string[];
  performance: {
    avgResponseTime: number;
    totalOperations: number;
    successRate: number;
    lastOperation?: Date;
  };
}

export interface SyncOperation {
  id: string;
  type: 'master_data' | 'transaction' | 'health_check' | 'full_sync' | 'recovery';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  result?: SyncResult | any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  erpnextAPI: {
    status: 'online' | 'offline' | 'degraded';
    responseTime: number;
    error?: string;
  };
  database: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    connectionCount: number;
    error?: string;
  };
  queue: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    pendingCount: number;
    failedCount: number;
    oldestPending?: Date;
  };
  recommendations: string[];
}

/**
 * MasterSyncService - Central coordinator for all ERPNext synchronization
 */
export class MasterSyncService {
  private db: POSDatabase;
  private erpNextClient: ERPNextClient;
  private deltaSyncManager: DeltaSyncManager;
  private transactionQueueManager: TransactionQueueManager;
  private performanceMonitor: SyncPerformanceMonitor;
  private config: SyncConfiguration;
  private status: MasterSyncStatus;
  private operationHistory: SyncOperation[] = [];
  private healthCheckTimer?: number;
  private cleanupTimer?: number;
  private isInitialized = false;

  constructor(db: POSDatabase, config: SyncConfiguration) {
    this.db = db;
    this.config = config;

    // Initialize ERPNext client
    this.erpNextClient = new ERPNextClient({
      baseUrl: config.erpnext.baseUrl,
      apiVersion: config.erpnext.apiVersion,
      timeout: config.erpnext.timeout,
      maxRetries: config.erpnext.maxRetries,
      retryDelay: config.erpnext.retryDelay,
    });

    // Initialize synchronization managers
    this.deltaSyncManager = new DeltaSyncManager(db, this.erpNextClient, {
      branchId: config.masterData.branchId,
      syncInterval: config.masterData.syncInterval,
      batchSize: config.masterData.batchSize,
      maxRetries: config.erpnext.maxRetries,
      conflictResolution: config.masterData.conflictResolution,
    });

    this.transactionQueueManager = new TransactionQueueManager(db, this.erpNextClient);

    // Initialize performance monitor
    this.performanceMonitor = new SyncPerformanceMonitor(
      {
        maxResponseTime: config.monitoring.alertThresholds.responseTimeThreshold,
        maxQueueSize: config.monitoring.alertThresholds.queueBacklogThreshold,
        maxErrorRate: config.monitoring.alertThresholds.syncFailureRate,
      },
      alert => {
        console.warn(`🚨 Performance Alert: ${alert.message}`);
        toast.error(`Performance Alert: ${alert.message}`);
      }
    );

    // Initialize status
    this.status = {
      isInitialized: false,
      isOnline: navigator.onLine,
      erpnextConnected: false,
      masterDataSync: {
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
      },
      transactionQueue: {
        totalItems: 0,
        pendingItems: 0,
        processingItems: 0,
        failedItems: 0,
        completedItems: 0,
        averageProcessingTime: 0,
        successRate: 0,
        throughputItemsPerMinute: 0,
        totalProcessingTime: 0,
        errorRate: 0,
        retryRate: 0,
      },
      overallHealth: 'unhealthy',
      activeIssues: [],
      performance: {
        avgResponseTime: 0,
        totalOperations: 0,
        successRate: 0,
      },
    };

    this.setupEventListeners();
  }

  /**
   * Initialize the master sync service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ MasterSyncService already initialized');
      return;
    }

    console.log('🚀 Initializing MasterSyncService...');

    try {
      // Load ERPNext authentication from storage
      const authData = this.erpNextClient.loadAuthFromStorage();
      if (authData) {
        this.erpNextClient.setAuth(authData);
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Start cleanup timer
      this.startPeriodicCleanup();

      this.isInitialized = true;
      this.status.isInitialized = true;

      console.log('✅ MasterSyncService initialized successfully');

      // Perform initial health check
      await this.performHealthCheck();
    } catch (error) {
      console.error('❌ Failed to initialize MasterSyncService:', error);
      throw error;
    }
  }

  /**
   * Start master data synchronization
   */
  async startMasterDataSync(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('MasterSyncService not initialized');
    }

    const operation: SyncOperation = {
      id: `sync_master_${Date.now()}`,
      type: 'master_data',
      status: 'running',
      startedAt: new Date(),
      metadata: { branchId: this.config.masterData.branchId },
    };

    this.operationHistory.push(operation);

    try {
      console.log('🔄 Starting master data synchronization...');

      await this.deltaSyncManager.startSync();

      operation.status = 'completed';
      operation.completedAt = new Date();
      operation.result = this.deltaSyncManager.getSyncStatus();

      this.updateMasterDataSyncStatus();
      console.log('✅ Master data sync started successfully');
    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date();
      operation.error = error instanceof Error ? error.message : String(error);

      console.error('❌ Master data sync failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop master data synchronization
   */
  stopMasterDataSync(): void {
    this.deltaSyncManager.stopSync();
    this.updateMasterDataSyncStatus();
    console.log('🛑 Master data synchronization stopped');
  }

  /**
   * Force full synchronization
   */
  async forceFullSync(): Promise<SyncOperation> {
    if (!this.isInitialized) {
      throw new Error('MasterSyncService not initialized');
    }

    const operation: SyncOperation = {
      id: `full_sync_${Date.now()}`,
      type: 'full_sync',
      status: 'running',
      startedAt: new Date(),
      metadata: { type: 'forced_full_sync' },
    };

    this.operationHistory.push(operation);

    try {
      console.log('🔄 Starting full synchronization...');

      // Force master data resync
      const masterDataResult = await this.deltaSyncManager.forceFullSync();

      // Force transaction queue processing
      await this.transactionQueueManager.forceSyncAll();

      operation.status = 'completed';
      operation.completedAt = new Date();
      operation.result = {
        masterData: masterDataResult,
        transactions: 'queued_for_processing',
      };

      console.log('✅ Full synchronization completed');
      toast.success('Full synchronization completed');

      return operation;
    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date();
      operation.error = error instanceof Error ? error.message : String(error);

      console.error('❌ Full synchronization failed:', error);
      toast.error('Full synchronization failed');

      throw error;
    }
  }

  /**
   * Add transaction to sync queue
   */
  async addTransactionToQueue(transaction: any, priority: number = 5): Promise<void> {
    await this.transactionQueueManager.addTransaction(transaction, priority);
    this.updateTransactionQueueStatus();
  }

  /**
   * Get current synchronization status
   */
  getStatus(): MasterSyncStatus {
    return { ...this.status };
  }

  /**
   * Get operation history
   */
  getOperationHistory(limit: number = 50): SyncOperation[] {
    return this.operationHistory
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    console.log('🔍 Performing health check...');

    const result: HealthCheckResult = {
      overall: 'healthy',
      erpnextAPI: { status: 'online', responseTime: 0 },
      database: { status: 'healthy', connectionCount: 1 },
      queue: { status: 'healthy', pendingCount: 0, failedCount: 0 },
      recommendations: [],
    };

    // Check ERPNext API
    try {
      const startTime = Date.now();
      const apiCheck = await this.erpNextClient.healthCheck();
      const responseTime = Date.now() - startTime;

      result.erpnextAPI.responseTime = responseTime;

      if (apiCheck.success) {
        result.erpnextAPI.status = responseTime > 5000 ? 'degraded' : 'online';
        if (responseTime > 5000) {
          result.recommendations.push(
            'ERPNext API response time is slow - check network connectivity'
          );
        }
      } else {
        result.erpnextAPI.status = 'offline';
        result.erpnextAPI.error = apiCheck.error;
        result.recommendations.push(
          'ERPNext API is not accessible - check server status and credentials'
        );
      }
    } catch (error) {
      result.erpnextAPI.status = 'offline';
      result.erpnextAPI.error = error instanceof Error ? error.message : String(error);
      result.recommendations.push(
        'ERPNext API connection failed - verify network and server status'
      );
    }

    // Check database health
    try {
      await this.db.open();
      result.database.status = 'healthy';
    } catch (error) {
      result.database.status = 'unhealthy';
      result.database.error = error instanceof Error ? error.message : String(error);
      result.recommendations.push('Database connection failed - check IndexedDB permissions');
    }

    // Check queue health
    try {
      const queueStats = await this.transactionQueueManager.getQueueStatus();
      result.queue.pendingCount = queueStats.pendingItems;
      result.queue.failedCount = queueStats.failedItems;

      if (queueStats.pendingItems > 100) {
        result.queue.status = 'degraded';
        result.recommendations.push(
          `High queue backlog: ${queueStats.pendingItems} pending transactions`
        );
      }

      if (queueStats.failedItems > 10) {
        result.queue.status = 'degraded';
        result.recommendations.push(
          `Many failed transactions: ${queueStats.failedItems} failed items`
        );
      }

      // Check oldest pending transaction
      const queuedTransactions = await this.transactionQueueManager.getQueuedTransactions();
      if (queuedTransactions.length > 0) {
        const oldest = queuedTransactions.reduce((oldest, current) =>
          current.createdAt < oldest.createdAt ? current : oldest
        );
        result.queue.oldestPending = oldest.createdAt;

        const hoursOld = (Date.now() - oldest.createdAt.getTime()) / (1000 * 60 * 60);
        if (hoursOld > 24) {
          result.recommendations.push(
            `Oldest pending transaction is ${hoursOld.toFixed(1)} hours old`
          );
        }
      }
    } catch (error) {
      result.queue.status = 'unhealthy';
      result.recommendations.push('Queue health check failed');
    }

    // Determine overall health
    const issues = [];
    if (result.erpnextAPI.status === 'offline') issues.push('ERPNext API offline');
    if (result.database.status === 'unhealthy') issues.push('Database unhealthy');
    if (result.queue.status === 'unhealthy') issues.push('Queue unhealthy');

    if (issues.length > 1) {
      result.overall = 'unhealthy';
    } else if (issues.length === 1 || result.erpnextAPI.status === 'degraded') {
      result.overall = 'degraded';
    }

    // Update status
    this.status.lastHealthCheck = new Date();
    this.status.erpnextConnected = result.erpnextAPI.status !== 'offline';
    this.status.overallHealth = result.overall;
    this.status.activeIssues = issues;

    console.log(`🏥 Health check completed: ${result.overall}`);

    return result;
  }

  /**
   * Retry failed operations
   */
  async retryFailedOperations(): Promise<void> {
    console.log('🔄 Retrying failed operations...');

    try {
      // Retry failed transactions
      await this.transactionQueueManager.retryFailedTransactions();

      // Retry failed master data sync if any
      const syncStatus = this.deltaSyncManager.getSyncStatus();
      if (syncStatus.failedItems > 0) {
        await this.deltaSyncManager.forceFullSync();
      }

      console.log('✅ Failed operations retry initiated');
      toast.success('Failed operations retry initiated');
    } catch (error) {
      console.error('❌ Failed to retry operations:', error);
      toast.error('Failed to retry operations');
      throw error;
    }
  }

  /**
   * Clear completed operations from history
   */
  clearOperationHistory(olderThanDays: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const initialCount = this.operationHistory.length;
    this.operationHistory = this.operationHistory.filter(
      op => op.startedAt > cutoffDate || op.status === 'running'
    );

    const clearedCount = initialCount - this.operationHistory.length;
    console.log(`🧹 Cleared ${clearedCount} old operations from history`);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    syncPerformance: any;
    queuePerformance: any;
    apiPerformance: any;
    overallTrends: any;
  } {
    const syncStatus = this.deltaSyncManager.getSyncStatus();
    const queueStats = this.transactionQueueManager.getQueueStatus();
    const apiStatus = this.erpNextClient.getApiStatus();

    return {
      syncPerformance: {
        ...syncStatus.performance,
        lastSync: syncStatus.lastSyncTime,
        nextSync: syncStatus.nextSyncTime,
        successRate:
          syncStatus.totalItems > 0 ? (syncStatus.syncedItems / syncStatus.totalItems) * 100 : 0,
      },
      queuePerformance: {
        ...queueStats,
        oldestPending: this.getOldestPendingTransactionDate(),
      },
      apiPerformance: {
        ...apiStatus,
        averageResponseTime: this.erpNextClient.averageResponseTime,
      },
      overallTrends: this.calculatePerformanceTrends(),
    };
  }

  /**
   * Destroy the service and clean up resources
   */
  destroy(): void {
    console.log('🗑️ Destroying MasterSyncService...');

    // Stop managers
    this.deltaSyncManager.stopSync();
    this.transactionQueueManager.destroy();

    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.isInitialized = false;
    console.log('✅ MasterSyncService destroyed');
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Network status monitoring
    window.addEventListener('online', () => {
      this.status.isOnline = true;
      console.log('🌐 Network online - resuming sync operations');
      this.processPendingOperations();
    });

    window.addEventListener('offline', () => {
      this.status.isOnline = false;
      console.log('📵 Network offline - pausing sync operations');
    });

    // Page visibility handling
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('🕳️ Page hidden - reducing sync activity');
      } else {
        console.log('👁️ Page visible - resuming full sync activity');
        this.performHealthCheck();
      }
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = window.setInterval(() => {
      if (this.isInitialized) {
        this.performHealthCheck();
      }
    }, this.config.monitoring.healthCheckInterval);
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = window.setInterval(() => {
      this.clearOperationHistory(7); // Keep 7 days of history
      this.updateStatus();
    }, this.config.transactions.cleanupInterval);
  }

  /**
   * Process pending operations when coming back online
   */
  private async processPendingOperations(): Promise<void> {
    if (!this.status.isOnline || !this.status.erpnextConnected) {
      return;
    }

    try {
      // Process transaction queue
      await this.transactionQueueManager.processQueue();

      // Check if master data sync is needed
      const syncStatus = this.deltaSyncManager.getSyncStatus();
      if (syncStatus.lastSyncTime) {
        const timeSinceLastSync = Date.now() - syncStatus.lastSyncTime.getTime();
        if (timeSinceLastSync > this.config.masterData.syncInterval) {
          await this.deltaSyncManager.performDeltaSync();
        }
      }
    } catch (error) {
      console.error('❌ Failed to process pending operations:', error);
    }
  }

  /**
   * Update master data sync status
   */
  private updateMasterDataSyncStatus(): void {
    this.status.masterDataSync = this.deltaSyncManager.getSyncStatus();
  }

  /**
   * Update transaction queue status
   */
  private updateTransactionQueueStatus(): void {
    this.transactionQueueManager.getQueueStatus().then(stats => {
      this.status.transactionQueue = stats;
    });
  }

  /**
   * Update overall status
   */
  private updateStatus(): void {
    this.updateMasterDataSyncStatus();
    this.updateTransactionQueueStatus();
  }

  /**
   * Get oldest pending transaction date
   */
  private async getOldestPendingTransactionDate(): Promise<Date | undefined> {
    try {
      const transactions = await this.transactionQueueManager.getQueuedTransactions();
      if (transactions.length === 0) return undefined;

      return transactions.reduce((oldest, current) =>
        current.createdAt < oldest.createdAt ? current : oldest
      ).createdAt;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Calculate performance trends
   */
  private calculatePerformanceTrends(): {
    syncSuccessTrend: 'improving' | 'declining' | 'stable';
    queueSizeTrend: 'growing' | 'shrinking' | 'stable';
    responseTimeTrend: 'improving' | 'declining' | 'stable';
  } {
    // This would analyze historical data to determine trends
    // For now, return stable as placeholder
    return {
      syncSuccessTrend: 'stable',
      queueSizeTrend: 'stable',
      responseTimeTrend: 'stable',
    };
  }
}
