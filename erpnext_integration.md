# ERPNext Integration & Synchronization

## 1. Synchronization Architecture

### 1.1 Sync Principles
- **Never Block UI**: All POS operations work instantly without network dependency
- **Eventual Consistency**: Data converges to correct state over time
- **Idempotent Operations**: Same operation can be safely retried
- **Conflict Resolution**: Clear rules for handling data conflicts
- **Audit Trail**: Every sync operation is logged for compliance

### 1.2 Sync Types

#### Master Data Sync (Pull)
```typescript
interface MasterDataSync {
  items: SyncOperation;
  pricingRules: SyncOperation;
  users: SyncOperation;
  branches: SyncOperation;
  settings: SyncOperation;
}

type SyncDirection = 'PULL' | 'PUSH' | 'BOTH';
type SyncFrequency = 'REALTIME' | 'SCHEDULED' | 'MANUAL';

interface SyncOperation {
  direction: SyncDirection;
  frequency: SyncFrequency;
  interval?: number; // seconds for scheduled sync
  triggers: SyncTrigger[];
  conflictStrategy: ConflictStrategy;
}

type SyncTrigger = 
  | 'APP_START'
  | 'USER_LOGIN'
  | 'NETWORK_RECONNECT'
  | 'SCHEDULED'
  | 'MANUAL_TRIGGER'
  | 'DATA_STALE';

type ConflictStrategy = 
  | 'USE_SERVER_WINS'
  | 'USE_LOCAL_WINS'
  | 'MERGE_AUTO'
  | 'MERGE_MANUAL';
```

#### Transaction Sync (Push)
```typescript
interface TransactionSync {
  salesTransactions: SyncOperation;
  returns: SyncOperation;
  voidTransactions: SyncOperation;
  paymentAdjustments: SyncOperation;
}
```

## 2. API Specification

### 2.1 Authentication
```typescript
// Token-based authentication for offline-first
interface AuthConfig {
  apiKey: string;
  apiSecret: string;
  tokenExpiry?: number; // Auto-refresh threshold
}

class ERPNextAuth {
  private token: string | null = null;
  private tokenExpiry: number = 0;
  
  async authenticate(config: AuthConfig): Promise<AuthResult> {
    try {
      const response = await fetch(`${BASE_URL}/api/method/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${config.apiKey}:${config.apiSecret}`
        },
        body: JSON.stringify({
          usr: config.apiKey,
          pwd: config.apiSecret
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        this.token = data.sid; // Session ID
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // 23 hours
        
        return { success: true, token: this.token };
      }
      
      throw new Error(`Authentication failed: ${response.statusText}`);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.token || this.isTokenExpired()) {
      throw new Error('Authentication required');
    }
    
    return {
      'Authorization': `token ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }
  
  private isTokenExpired(): boolean {
    return Date.now() >= this.tokenExpiry;
  }
}
```

### 2.2 Master Data APIs

#### Item Management
```typescript
interface ItemSyncAPI {
  // Get all items with delta sync
  getItems(params: {
    branchId: string;
    lastSyncAt?: Date;
    limit?: number;
  }): Promise<PaginatedResult<Item>>;
  
  // Get single item by SKU
  getItem(sku: string): Promise<Item>;
  
  // Bulk update items
  bulkUpdateItems(items: Item[]): Promise<BulkResult>;
  
  // Search items
  searchItems(query: {
    searchTerm: string;
    branchId: string;
    category?: string;
  }): Promise<ItemSearchResult>;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface Item {
  name: string;                    // SKU
  item_name: string;               // Display name
  description?: string;
  item_group: string;              // Category
  stock_uom: string;               // Unit
  brand?: string;
  barcodes?: string[];             // Additional barcodes
  has_batch_no: boolean;           // Batch tracking
  has_serial_no: boolean;          // Serial tracking
  is_sales_item: boolean;          // Can be sold
  disabled: boolean;               // Active flag
  // Pricing information
  valuation_rate?: number;         // Cost price
  standard_rate?: number;          // Base price
  // Branch-specific pricing
  branch_prices?: BranchPrice[];
}

interface BranchPrice {
  branch: string;
  price_list_rate?: number;
  custom_rate?: number;
  is_active: boolean;
}

interface ItemSearchResult {
  items: Item[];
  suggestions: string[];           // Search suggestions
  totalFound: number;
}
```

#### Pricing Rules Management
```typescript
interface PricingRulesAPI {
  // Get active pricing rules
  getPricingRules(params: {
    branchId: string;
    lastSyncAt?: Date;
    activeOnly?: boolean;
  }): Promise<PaginatedResult<PricingRule>>;
  
  // Get specific pricing rule
  getPricingRule(ruleId: string): Promise<PricingRule>;
  
  // Validate pricing rule
  validatePricingRule(rule: PricingRule): Promise<ValidationResult>;
}

interface PricingRule {
  name: string;
  title: string;                   // Display name
  priority: number;                // 1-8 hierarchy
  price_or_discount: 'Price' | 'Discount';
  pricing_rule_type: 'Based On Quantity' | 'Based On Another Item' | 'Bulk';
  applied_on: 'Item' | 'Item Group' | 'Brand';
  items?: string[];                // Specific items
  item_groups?: string[];          // Applicable groups
  brands?: string[];               // Applicable brands
  min_qty?: number;                // Minimum quantity
  max_qty?: number;                // Maximum quantity
  discount_percentage?: number;    // Percentage discount
  discount_amount?: number;        // Fixed discount
  rate?: number;                   // Fixed rate
  free_item?: string;              // Free item for BXGY
  free_item_qty?: number;          // Free quantity
  free_item_rate?: number;         // Free item rate
  branch_conditions?: BranchCondition[];
  validity?: {
    valid_from?: string;
    valid_upto?: string;
    days?: string[];               // Days of week
    from_time?: string;            // Start time
    to_time?: string;              // End time
  };
  is_cumulative?: boolean;         // Can be combined
  mixed_conditions?: boolean;      // Mixed cart conditions
  apply_multiple_pricing_rules?: boolean;
  stop_applying_other_rule?: boolean;
}
```

### 2.3 Transaction APIs

#### Sales Invoice Creation
```typescript
interface SalesTransactionAPI {
  // Create sales invoice
  createSalesInvoice(invoice: SalesInvoiceRequest): Promise<SalesInvoiceResponse>;
  
  // Get sales invoice by receipt number
  getSalesInvoice(receiptNumber: string): Promise<SalesInvoice>;
  
  // Update sales invoice status
  updateInvoiceStatus(params: {
    invoiceId: string;
    status: 'Submitted' | 'Cancelled';
    reason?: string;
  }): Promise<UpdateResult>;
  
  // Get invoice by criteria
  searchInvoices(params: InvoiceSearchParams): Promise<PaginatedResult<SalesInvoice>>;
}

interface SalesInvoiceRequest {
  company: string;                 // Company code
  customer?: string;               // Customer ID (optional for retail)
  branch: string;                  // Branch ID
  posting_date: string;            // Transaction date
  posting_time: string;            // Transaction time
  due_date?: string;               // Due date
  items: SalesInvoiceItem[];
  taxes?: InvoiceTax[];
  payments?: InvoicePayment[];
  loyalty_points?: number;         // Loyalty points used
  discounted_amount?: number;      // Total discount
  additional_discount_percentage?: number;
  additional_discount_amount?: number;
  apply_discount_on?: 'Grand Total' | 'Net Total';
  remarks?: string;                // Transaction notes
  // Custom fields for POS
  pos_branch_id: string;           // Original branch
  pos_device_id: string;           // Device identifier
  pos_transaction_id: string;      // Local transaction ID
  pos_receipt_number: string;      // Generated receipt number
  payment_breakdown?: PaymentBreakdown;
  pricing_rules_applied?: AppliedPricingRule[];
}

interface SalesInvoiceItem {
  item_code: string;               // SKU
  item_name?: string;              // Item name at time of sale
  qty: number;                     // Quantity
  uom: string;                     // Unit of measure
  rate: number;                    // Unit price
  amount: number;                  // Total amount (qty * rate)
  discount_percentage?: number;    // Item discount
  discount_amount?: number;        // Item discount amount
  taxable_value?: number;          // Taxable amount
  net_rate?: number;               // Net rate after discount
  net_amount?: number;             // Net amount
  batch_no?: string;               // Batch number
  serial_no?: string;              // Serial number
  // Custom fields
  pos_unit_price: number;          // Original unit price
  pos_discount_applied: number;    // Discount amount
  pricing_rules_applied?: string[]; // Applied rule IDs
}

interface SalesInvoiceResponse {
  name: string;                    // Invoice ID
  owner: string;
  modified: string;
  creation: string;
  company: string;
  customer?: string;
  branch: string;
  posting_date: string;
  posting_time: string;
  due_date?: string;
  status: string;
  total: number;
  total_qty: number;
  total_net_weight: number;
  grand_total: number;
  total_taxes_and_charges: number;
  discounts_and_promotions: number;
  rounded_total: number;
  outstanding_amount: number;
  against_income_account: string;
  account_for_change_amount: string;
  total_advance: number;
  apply_advisory_on: string;
  redeem_loyalty_points?: number;
  // Custom POS fields
  pos_branch_id: string;
  pos_device_id: string;
  pos_transaction_id: string;
  pos_receipt_number: string;
}
```

#### Returns & Refunds
```typescript
interface ReturnsAPI {
  // Create sales return
  createSalesReturn(returnRequest: SalesReturnRequest): Promise<SalesReturnResponse>;
  
  // Get original sales invoice for return validation
  getOriginalInvoice(invoiceId: string): Promise<SalesInvoice>;
  
  // Validate return eligibility
  validateReturn(params: {
    originalInvoiceId: string;
    items: ReturnItem[];
  }): Promise<ReturnValidationResult>;
  
  // Process return authorization
  authorizeReturn(params: {
    returnId: string;
    supervisorId: string;
    supervisorPin: string;
    reason: string;
  }): Promise<AuthorizationResult>;
}

interface SalesReturnRequest {
  company: string;
  customer?: string;
  branch: string;
  posting_date: string;
  posting_time: string;
  items: SalesReturnItem[];
  taxes?: InvoiceTax[];
  payments?: InvoicePayment[];
  is_return: boolean;              // Flag for return
  return_against?: string;         // Original invoice ID
  reasons: string[];               // Return reasons
  remarks?: string;
  // Custom POS fields
  pos_return_id: string;           // Local return ID
  pos_original_transaction_id: string; // Original transaction
  pos_device_id: string;
  pos_supervisor_approval?: boolean;
  pos_approval_details?: ApprovalDetails;
}

interface SalesReturnItem {
  item_code: string;
  qty: number;                     // Return quantity (negative)
  rate: number;                    // Original rate
  amount: number;                  // Original amount
  discount_percentage?: number;
  discount_amount?: number;
  taxable_value?: number;
  net_rate?: number;
  net_amount?: number;
  batch_no?: string;
  serial_no?: string;
  // Return-specific
  original_item_code?: string;     // For item replacements
  return_reason?: string;
}

interface ApprovalDetails {
  supervisorId: string;
  supervisorName: string;
  approvedAt: string;
  reason: string;
  pinVerified: boolean;
}
```

### 2.4 Sync Status & Monitoring APIs

```typescript
interface SyncStatusAPI {
  // Get sync status for branch
  getSyncStatus(branchId: string): Promise<BranchSyncStatus>;
  
  // Get pending transactions
  getPendingTransactions(params: {
    branchId: string;
    status?: TransactionStatus[];
    limit?: number;
  }): Promise<PaginatedResult<Transaction>>;
  
  // Get sync conflicts
  getSyncConflicts(params: {
    branchId: string;
    unresolved?: boolean;
  }): Promise<SyncConflict[]>;
  
  // Trigger manual sync
  triggerSync(params: {
    branchId: string;
    syncType: SyncType[];
    priority?: 'HIGH' | 'NORMAL' | 'LOW';
  }): Promise<SyncTriggerResult>;
  
  // Retry failed transactions
  retryFailedTransactions(params: {
    branchId: string;
    transactionIds: string[];
  }): Promise<RetryResult>;
}

type TransactionStatus = 
  | 'Draft'
  | 'Submitted'
  | 'Cancelled'
  | 'Amended'
  | 'Paid'
  | 'Unpaid'
  | 'Overdue'
  | 'Partly Paid';

type SyncType = 
  | 'MASTER_DATA'
  | 'SALES_TRANSACTIONS'
  | 'RETURNS'
  | 'PAYMENT_ADJUSTMENTS'
  | 'USER_SYNCHRONIZATION';

interface BranchSyncStatus {
  branch: string;
  last_master_data_sync: string;
  last_transaction_sync: string;
  pending_transactions: number;
  failed_transactions: number;
  sync_conflicts: number;
  network_status: 'ONLINE' | 'OFFLINE' | 'SLOW';
  last_error?: string;
  sync_performance: {
    average_response_time: number;
    success_rate: number;
    throughput_per_hour: number;
  };
}

interface Transaction {
  name: string;                    // Invoice/Sales Return ID
  company: string;
  branch: string;
  customer?: string;
  posting_date: string;
  status: TransactionStatus;
  total: number;
  grand_total: number;
  outstanding_amount: number;
  modified: string;
  // Custom POS fields
  pos_transaction_id?: string;
  pos_device_id?: string;
  pos_sync_status?: 'PENDING' | 'SYNCED' | 'FAILED';
  pos_sync_attempts?: number;
  pos_last_sync_attempt?: string;
}
```

## 3. Synchronization Mechanisms

### 3.1 Delta Sync Algorithm
```typescript
class DeltaSyncManager {
  private lastSyncTimestamp: Date = new Date(0);
  private isSyncing = false;
  
  async performDeltaSync(branchId: string): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }
    
    this.isSyncing = true;
    const startTime = Date.now();
    
    try {
      // 1. Master Data Sync
      const masterDataResult = await this.syncMasterData(branchId, this.lastSyncTimestamp);
      
      // 2. Transaction Sync
      const transactionResult = await this.syncTransactions(branchId, this.lastSyncTimestamp);
      
      // 3. Update sync timestamp
      this.lastSyncTimestamp = new Date();
      
      // 4. Log sync performance
      const syncTime = Date.now() - startTime;
      await this.logSyncPerformance(branchId, syncTime, masterDataResult, transactionResult);
      
      return {
        success: true,
        syncTime,
        masterDataResult,
        transactionResult,
        nextSyncTime: this.calculateNextSyncTime()
      };
      
    } catch (error) {
      await this.logSyncError(branchId, error);
      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }
  
  private async syncMasterData(branchId: string, since: Date): Promise<MasterDataResult> {
    const result: MasterDataResult = {
      items: { synced: 0, failed: 0 },
      pricingRules: { synced: 0, failed: 0 },
      users: { synced: 0, failed: 0 },
      conflicts: 0
    };
    
    // Sync items
    const itemsResult = await this.syncItems(branchId, since);
    result.items = itemsResult;
    
    // Sync pricing rules
    const pricingResult = await this.syncPricingRules(branchId, since);
    result.pricingRules = pricingResult;
    
    // Sync users
    const usersResult = await this.syncUsers(branchId, since);
    result.users = usersResult;
    
    return result;
  }
  
  private async syncItems(branchId: string, since: Date): Promise<SyncStats> {
    try {
      const items = await erpNextAPI.getItems({
        branchId,
        lastSyncAt: since,
        limit: 1000 // Batch size
      });
      
      let synced = 0;
      let failed = 0;
      
      for (const item of items.data) {
        try {
          // Validate item data
          const validation = this.validateItem(item);
          if (!validation.isValid) {
            failed++;
            continue;
          }
          
          // Check for conflicts
          const existingItem = await db.items.get(item.name);
          if (existingItem && existingItem.updatedAt > since) {
            const conflict = await this.handleDataConflict('ITEM', existingItem, item);
            if (conflict.strategy === 'MERGE_MANUAL') {
              failed++; // Requires manual resolution
              continue;
            }
          }
          
          // Update local database
          await this.updateLocalItem(item, branchId);
          synced++;
          
        } catch (error) {
          failed++;
          console.error(`Failed to sync item ${item.name}:`, error);
        }
      }
      
      return { synced, failed };
    } catch (error) {
      throw new Error(`Items sync failed: ${error.message}`);
    }
  }
}
```

### 3.2 Transaction Queue Management
```typescript
class TransactionQueue {
  private queue: TransactionQueueItem[] = [];
  private isProcessing = false;
  private retryConfig = {
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    backoffMultiplier: 2
  };
  
  async enqueueTransaction(transaction: SalesTransaction): Promise<void> {
    const queueItem: TransactionQueueItem = {
      id: transaction.id,
      transaction,
      priority: this.calculatePriority(transaction),
      attempts: 0,
      createdAt: new Date(),
      lastAttemptAt: undefined
    };
    
    await db.salesQueue.add(queueItem);
    
    // Trigger immediate sync if online
    if (navigator.onLine) {
      this.processQueue();
    }
  }
  
  async processQueue(): Promise<void> {
    if (this.isProcessing || !navigator.onLine) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Get pending transactions sorted by priority
      const pendingItems = await db.salesQueue
        .where('status')
        .equals('PENDING')
        .orderBy('priority')
        .toArray();
      
      for (const item of pendingItems) {
        if (!navigator.onLine) {
          break; // Stop if offline
        }
        
        try {
          await this.processTransaction(item);
        } catch (error) {
          await this.handleTransactionFailure(item, error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  private async processTransaction(item: TransactionQueueItem): Promise<void> {
    // Update attempt count
    item.attempts++;
    item.lastAttemptAt = new Date();
    
    try {
      // Create sales invoice in ERPNext
      const response = await erpNextAPI.createSalesInvoice(
        this.convertToERPInvoice(item.transaction)
      );
      
      // Update transaction with ERPNext ID
      await db.salesQueue.update(item.id, {
        status: 'SYNCED',
        erpNextSalesId: response.name,
        syncedAt: new Date(),
        attempts: item.attempts
      });
      
      // Log successful sync
      await this.logTransactionSync(item, 'SUCCESS', response);
      
    } catch (error) {
      // Handle specific ERPNext errors
      if (this.isRetryableError(error)) {
        if (item.attempts < this.retryConfig.maxRetries) {
          await this.scheduleRetry(item);
        } else {
          await this.markAsFailed(item, error);
        }
      } else {
        await this.markAsFailed(item, error);
      }
    }
  }
  
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'NETWORK_ERROR',
      'TIMEOUT',
      'SERVER_TEMPORARY_UNAVAILABLE',
      'RATE_LIMIT_EXCEEDED'
    ];
    
    return retryableErrors.some(code => error.message.includes(code));
  }
  
  private async handleTransactionFailure(item: TransactionQueueItem, error: Error): Promise<void> {
    // Log failure
    await this.logTransactionSync(item, 'FAILED', null, error);
    
    // Update attempt count
    await db.salesQueue.update(item.id, {
      lastError: error.message,
      attempts: item.attempts,
      status: item.attempts >= this.retryConfig.maxRetries ? 'FAILED' : 'RETRYING'
    });
    
    // Schedule retry if attempts remaining
    if (item.attempts < this.retryConfig.maxRetries) {
      const delay = this.calculateRetryDelay(item.attempts);
      setTimeout(() => this.processQueue(), delay);
    }
  }
}
```

### 3.3 Conflict Resolution
```typescript
class ConflictResolver {
  async handleDataConflict(
    entityType: string,
    localData: any,
    serverData: any
  ): Promise<ConflictResolution> {
    const conflict: DataConflict = {
      id: generateId(),
      entityType,
      localData,
      serverData,
      detectedAt: new Date(),
      strategy: this.determineResolutionStrategy(entityType, localData, serverData)
    };
    
    // Store conflict for manual resolution
    await db.syncConflicts.add(conflict);
    
    return {
      canAutoResolve: conflict.strategy !== 'MERGE_MANUAL',
      resolution: conflict.strategy,
      resolvedData: conflict.strategy !== 'MERGE_MANUAL' 
        ? this.autoResolve(conflict)
        : null
    };
  }
  
  private determineResolutionStrategy(
    entityType: string,
    localData: any,
    serverData: any
  ): ConflictStrategy {
    switch (entityType) {
      case 'ITEM':
        // Server wins for master data
        return 'USE_SERVER_WINS';
        
      case 'PRICING_RULE':
        // Server wins for pricing rules
        return 'USE_SERVER_WINS';
        
      case 'SALES_TRANSACTION':
        // Manual resolution for financial data
        return 'MERGE_MANUAL';
        
      case 'USER':
        // Server wins for user data
        return 'USE_SERVER_WINS';
        
      default:
        return 'USE_SERVER_WINS';
    }
  }
  
  private autoResolve(conflict: DataConflict): any {
    switch (conflict.strategy) {
      case 'USE_SERVER_WINS':
        return conflict.serverData;
        
      case 'USE_LOCAL_WINS':
        return conflict.localData;
        
      case 'MERGE_AUTO':
        return this.mergeData(conflict.localData, conflict.serverData);
        
      default:
        throw new Error('Cannot auto resolve manual conflict');
    }
  }
}
```

## 4. Performance & Reliability

### 4.1 Sync Optimization
```typescript
class SyncOptimizer {
  // Batch operations for better performance
  async batchSync(operations: SyncOperation[]): Promise<BatchResult> {
    const batchSize = 100;
    const batches = this.chunkArray(operations, batchSize);
    const results: BatchResult = { success: 0, failed: 0 };
    
    for (const batch of batches) {
      try {
        const batchResult = await this.processBatch(batch);
        results.success += batchResult.success;
        results.failed += batchResult.failed;
      } catch (error) {
        results.failed += batch.length;
      }
    }
    
    return results;
  }
  
  // Network-aware sync scheduling
  scheduleSyncBasedOnNetwork(): void {
    const connection = navigator.connection;
    
    if (!navigator.onLine) {
      this.schedulePeriodicSync(300); // 5 minutes when offline
    } else if (connection?.effectiveType === '4g') {
      this.schedulePeriodicSync(30); // 30 seconds on fast connection
    } else {
      this.schedulePeriodicSync(60); // 1 minute on slow connection
    }
  }
}
```

### 4.2 Monitoring & Analytics
```typescript
class SyncMonitor {
  // Track sync performance metrics
  async trackSyncMetrics(syncResult: SyncResult): Promise<void> {
    const metrics: SyncMetrics = {
      timestamp: new Date(),
      duration: syncResult.syncTime,
      successRate: this.calculateSuccessRate(),
      networkLatency: await this.measureNetworkLatency(),
      dataTransferred: syncResult.dataTransferred,
      conflictsDetected: syncResult.conflicts,
      retryCount: syncResult.retryCount
    };
    
    await this.storeMetrics(metrics);
  }
  
  // Generate sync health report
  async generateHealthReport(branchId: string): Promise<HealthReport> {
    const [recentSyncs, pendingTransactions, conflicts] = await Promise.all([
      this.getRecentSyncHistory(branchId, 24), // Last 24 hours
      this.getPendingTransactionCount(branchId),
      this.getUnresolvedConflicts(branchId)
    ]);
    
    return {
      branchId,
      overallHealth: this.calculateOverallHealth(recentSyncs, pendingTransactions, conflicts),
      syncFrequency: this.calculateAverageSyncFrequency(recentSyncs),
      averageSyncTime: this.calculateAverageSyncTime(recentSyncs),
      successRate: this.calculateSuccessRate(recentSyncs),
      pendingBacklog: pendingTransactions,
      unresolvedConflicts: conflicts.length,
      recommendations: this.generateRecommendations(recentSyncs, conflicts)
    };
  }
}
```

This comprehensive ERPNext integration and synchronization design provides:

- Complete offline-first architecture
- Robust conflict resolution
- Performance optimization
- Comprehensive monitoring
- Audit trail compliance
- Scalable sync mechanisms

The design ensures reliable data synchronization while maintaining the offline-first principle and meeting all blueprint requirements.