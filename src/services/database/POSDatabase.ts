import Dexie, { Table } from 'dexie';
import {
  Item,
  PricingRule,
  SalesTransaction,
  AuditLog,
  SyncStatus,
  CartItem,
  PriceOverride,
  User,
  PerformanceMetrics,
  Category,
  Supplier,
  ItemTag,
  TransactionState,
  SplitPayment,
  ReceiptTemplate,
  AdvancedFilters
} from '@/types';
import { ReturnTransaction } from '@/services/transaction/ReturnRefundManager';
import { PrintJob } from '@/services/receipt/PrintQueueManager';

// Cart Hold for suspended transactions
interface CartHold {
  id: string;
  items: CartItem[];
  totalAmount: number;
  createdAt: Date;
  lastAccessed: Date;
}

// Price Override Records
interface PriceOverrideRecord {
  id: string;
  itemId: string;
  originalPrice: number;
  newPrice: number;
  reason: string;
  supervisorId: string;
  timestamp: Date;
}

// Performance Metrics Storage
interface PerformanceRecord {
  id: string;
  type: 'scan' | 'search' | 'startup' | 'recovery';
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Users Cache
interface UserCache {
  id: string;
  user: User;
  lastAccessed: Date;
}

// Return Transaction Records
interface ReturnTransactionRecord {
  id: string;
  originalTransactionId: string;
  returnTransactionNumber: string;
  returnDate: Date;
  returnReason: string;
  processedBy: string;
  approvedBy?: string;
  status: 'pending' | 'approved' | 'processed' | 'rejected';
  refundAmount: number;
  refundMethod: 'cash' | 'original_payment';
  originalPaymentMethod?: string;
  notes?: string;
  requiresApproval: boolean;
  items: any[]; // ReturnItem[]
  validationResults: any[]; // ReturnValidationResult[]
  createdAt: Date;
  updatedAt: Date;
}

// Print Job Records
interface PrintJobRecord {
  id: string;
  transactionId: string;
  receiptData: any;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'retry';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  errorMessage?: string;
  printerName?: string;
}

// Cash Log Records
interface CashLogRecord {
  id: string;
  type: 'cash_disbursement' | 'cash_receipt' | 'cash_adjustment';
  amount: number;
  reason: string;
  referenceId?: string;
  timestamp: Date;
  userId: string;
  notes?: string;
}

export class POSDatabase extends Dexie {
  // Core tables
  items!: Table<Item>;
  pricingRules!: Table<PricingRule>;
  salesQueue!: Table<SalesTransaction>;
  auditLogs!: Table<AuditLog>;
  syncStatus!: Table<SyncStatus>;
  
  // Categorization tables
  categories!: Table<Category>;
  suppliers!: Table<Supplier>;
  itemTags!: Table<ItemTag>;
  
  // Transaction management
  cartHold!: Table<CartHold>;
  priceOverrides!: Table<PriceOverrideRecord>;
  performanceRecords!: Table<PerformanceRecord>;
  users!: Table<UserCache>;
  transactionStates!: Table<TransactionState>;
  splitPayments!: Table<SplitPayment>;
  receiptTemplates!: Table<ReceiptTemplate>;
  
  // Return & Refund tables
  returnTransactions!: Table<ReturnTransactionRecord>;
  printJobs!: Table<PrintJobRecord>;
  cashLogs!: Table<CashLogRecord>;

  constructor() {
    super('POSDatabase');
    
    this.version(1).stores({
      // Core operational tables with optimized indexes
      items: `
        id, 
        barcode, 
        name, 
        category, 
        brand, 
        supplierId,
        isActive, 
        updatedAt, 
        lastSyncedAt,
        &barcode,
        &additionalBarcodes,
        [category+brand],
        [supplierId+isActive]
      `,
      
      pricingRules: `
        id, 
        priority, 
        ruleType, 
        isActive, 
        validFrom, 
        validTo, 
        updatedAt,
        [ruleType+priority],
        [isActive+priority]
      `,
      
      salesQueue: `
        id, 
        branchId, 
        cashierId, 
        status, 
        createdAt, 
        updatedAt,
        [status+createdAt],
        [branchId+status]
      `,
      
      auditLogs: `
        id, 
        timestamp, 
        userId, 
        action, 
        resourceType,
        [timestamp+userId],
        [action+timestamp]
      `,
      
      syncStatus: `
        id, 
        lastSyncTime, 
        isOnline
      `,
      
      // Categorization tables
      categories: `
        id, 
        name, 
        parentId, 
        level, 
        displayOrder, 
        isActive,
        [parentId+displayOrder],
        [level+displayOrder]
      `,
      
      suppliers: `
        id, 
        name, 
        code, 
        isActive,
        [name],
        [code]
      `,
      
      itemTags: `
        id, 
        name, 
        category, 
        color,
        [name],
        [category]
      `,
      
      // Supporting tables
      cartHold: `
        id, 
        lastAccessed,
        [lastAccessed]
      `,
      
      priceOverrides: `
        id, 
        itemId, 
        supervisorId, 
        timestamp,
        [itemId+timestamp]
      `,
      
      performanceRecords: `
        id, 
        type, 
        timestamp,
        [type+timestamp]
      `,
      
      users: `
        id, 
        lastAccessed,
        [lastAccessed]
      `,
      
      // Transaction management
      transactionStates: `
        id, 
        status, 
        currentStep, 
        lastUpdated,
        [status+lastUpdated],
        [currentStep+status]
      `,
      
      splitPayments: `
        id, 
        transactionId, 
        status, 
        createdAt,
        [transactionId+status],
        [status+createdAt]
      `,
      
      receiptTemplates: `
        id, 
        name, 
        type, 
        isActive, 
        createdAt,
        [type+isActive],
        [name]
      `,
      
      // Return & Refund tables
      returnTransactions: `
        id, 
        originalTransactionId, 
        returnTransactionNumber, 
        status, 
        processedBy,
        returnDate,
        refundAmount,
        [status+returnDate],
        [originalTransactionId+status]
      `,
      
      printJobs: `
        id, 
        transactionId, 
        status, 
        priority, 
        createdAt,
        [status+createdAt],
        [transactionId+status],
        [priority+createdAt]
      `,
      
      cashLogs: `
        id, 
        type, 
        amount, 
        userId, 
        timestamp,
        [type+timestamp],
        [userId+timestamp]
      `
    });

    // Hooks for audit logging
    this.items.hook('creating', (primKey, obj, trans) => {
      this.logAudit('CREATE_ITEM', 'Item', primKey as string, obj);
    });

    this.items.hook('updating', (modifications, primKey, obj, trans) => {
      this.logAudit('UPDATE_ITEM', 'Item', primKey as string, modifications);
    });

    this.items.hook('deleting', (primKey, obj, trans) => {
      this.logAudit('DELETE_ITEM', 'Item', primKey as string, obj);
    });

    this.salesQueue.hook('creating', (primKey, obj, trans) => {
      this.logAudit('CREATE_TRANSACTION', 'SalesTransaction', primKey as string, obj);
    });

    this.priceOverrides.hook('creating', (primKey, obj, trans) => {
      this.logAudit('PRICE_OVERRIDE', 'PriceOverride', primKey as string, obj);
    });
  }

  private async logAudit(
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, any>
  ): Promise<void> {
    const auditLog: Omit<AuditLog, 'id'> = {
      timestamp: new Date(),
      userId: 'system', // Will be replaced with actual user ID
      userRole: 'system',
      action,
      resourceType,
      resourceId,
      details,
      ipAddress: undefined,
      deviceId: undefined
    };

    await this.auditLogs.add({
      id: crypto.randomUUID(),
      ...auditLog
    } as AuditLog);
  }

  // Database utility methods
  async clearExpiredData(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Clean up old performance records (30 days)
    await this.performanceRecords
      .where('timestamp')
      .below(thirtyDaysAgo)
      .delete();

    // Clean up old held carts (7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    await this.cartHold
      .where('lastAccessed')
      .below(sevenDaysAgo)
      .delete();

    // Clean up old audit logs (1 year, but keep critical ones)
    await this.auditLogs
      .where('timestamp')
      .below(oneYearAgo)
      .and(log => !['CRITICAL_ERROR', 'SECURITY_BREACH'].includes(log.action))
      .delete();
  }

  async getItemByBarcode(barcode: string): Promise<Item | undefined> {
    const startTime = performance.now();
    
    // First try primary barcode index
    let item = await this.items.where('barcode').equals(barcode).first();
    
    // If not found, check additional barcodes
    if (!item) {
      item = await this.items
        .where('additionalBarcodes')
        .anyOf([barcode])
        .first();
    }

    const duration = performance.now() - startTime;
    await this.recordPerformance('scan', duration, { barcode });
    
    return item;
  }

  async searchItems(query: string, limit = 50): Promise<Item[]> {
    const startTime = performance.now();
    
    // Use name index for search
    let items = await this.items
      .where('name')
      .startsWithIgnoreCase(query)
      .limit(limit)
      .toArray();

    // If no results, try partial match
    if (items.length === 0) {
      items = await this.items
        .filter(item =>
          (item.name?.toLowerCase().includes(query.toLowerCase()) ?? false) ||
          item.barcode.includes(query) ||
          (item.brand?.toLowerCase().includes(query.toLowerCase()) ?? false)
        )
        .limit(limit)
        .toArray();
    }

    const duration = performance.now() - startTime;
    await this.recordPerformance('search', duration, { query, resultCount: items.length });
    
    return items;
  }

  private async recordPerformance(
    type: PerformanceRecord['type'],
    duration: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.performanceRecords.add({
      id: crypto.randomUUID(),
      type,
      duration,
      timestamp: new Date(),
      metadata
    });
  }

  async getPerformanceMetrics(days = 7): Promise<PerformanceMetrics> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const records = await this.performanceRecords
      .where('timestamp')
      .above(since)
      .toArray();

    const scanTimes = records
      .filter(r => r.type === 'scan')
      .map(r => r.duration);
    
    const searchTimes = records
      .filter(r => r.type === 'search')
      .map(r => r.duration);

    return {
      scanTimes,
      searchTimes,
      lastUpdate: new Date()
    };
  }

  async addToCartHold(cartId: string, items: CartItem[], totalAmount: number): Promise<void> {
    const existing = await this.cartHold.get(cartId);
    
    await this.cartHold.put({
      id: cartId,
      items,
      totalAmount,
      createdAt: existing?.createdAt || new Date(),
      lastAccessed: new Date()
    });
  }

  async getCartHold(cartId: string): Promise<CartHold | undefined> {
    const cart = await this.cartHold.get(cartId);
    
    if (cart) {
      // Update last accessed time
      cart.lastAccessed = new Date();
      await this.cartHold.put(cart);
    }
    
    return cart;
  }

  async getAllCartHolds(): Promise<CartHold[]> {
    return await this.cartHold.orderBy('lastAccessed').reverse().toArray();
  }

  async deleteCartHold(cartId: string): Promise<void> {
    await this.cartHold.delete(cartId);
  }

  async getActivePricingRules(): Promise<PricingRule[]> {
    const now = new Date();
    
    return await this.pricingRules
      .where('isActive')
      .equals(1) // Dexie uses 1 for true in boolean indexes
      .and(rule => rule.validFrom <= now && rule.validTo >= now)
      .reverse()
      .sortBy('priority');
  }

  async getBranchSyncStatus(branchId: string): Promise<SyncStatus | undefined> {
    return await this.syncStatus.get(branchId);
  }

  async updateSyncStatus(
    branchId: string,
    status: Partial<Omit<SyncStatus, 'id'>>
  ): Promise<void> {
    await this.syncStatus.put({
      id: branchId,
      lastSyncTime: new Date(),
      pendingTransactions: 0,
      pendingItems: 0,
      isOnline: navigator.onLine,
      ...status
    });
  }

  async getRecentAuditLogs(limit = 100): Promise<AuditLog[]> {
    return await this.auditLogs
      .orderBy('timestamp')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async logSecurityIncident(
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    await this.auditLogs.add({
      id: crypto.randomUUID(),
      timestamp: new Date(),
      userId: 'security',
      userRole: 'security',
      action: `SECURITY_${action}`,
      resourceType: 'Security',
      resourceId: details.resourceId || 'unknown',
      details: {
        ...details,
        severity: 'HIGH',
        requiresInvestigation: true
      }
    });
  }

  // Categorization System Methods
  
  /**
   * Get hierarchical category tree
   */
  async getCategoryTree(): Promise<Category[]> {
    const categories = await this.categories
      .where('isActive')
      .equals(1)
      .sortBy('displayOrder');
    
    return this.buildCategoryTree(categories);
  }

  /**
   * Build hierarchical category tree from flat array
   */
  private buildCategoryTree(categories: Category[]): Category[] {
    const categoryMap = new Map<string, Category>();
    const rootCategories: Category[] = [];

    // Create map for quick lookup
    categories.forEach(category => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    // Build tree structure
    categories.forEach(category => {
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(categoryMap.get(category.id)!);
        }
      } else {
        rootCategories.push(categoryMap.get(category.id)!);
      }
    });

    return rootCategories;
  }

  /**
   * Search items with advanced filters
   */
  async searchItemsAdvanced(
    query: string, 
    filters: AdvancedFilters, 
    limit = 50
  ): Promise<Item[]> {
    const startTime = performance.now();

    try {
      // Start with basic search
      let results = await this.searchItems(query, limit * 2); // Get more results for filtering

      // Apply category filters
      if (filters.categories && filters.categories.length > 0) {
        results = results.filter(item => 
          filters.categories!.includes(item.category)
        );
      }

      // Apply brand filters
      if (filters.brands && filters.brands.length > 0) {
        results = results.filter(item => 
          item.brand && filters.brands!.includes(item.brand)
        );
      }

      // Apply supplier filters
      if (filters.suppliers && filters.suppliers.length > 0) {
        results = results.filter(item => 
          item.supplierId && filters.suppliers!.includes(item.supplierId)
        );
      }

      // Apply tag filters
      if (filters.tags && filters.tags.length > 0) {
        results = results.filter(item => 
          filters.tags!.some(tagId => item.tags.includes(tagId))
        );
      }

      // Apply price range filter
      if (filters.priceRange) {
        const { min, max } = filters.priceRange;
        results = results.filter(item => 
          item.basePrice >= min && item.basePrice <= max
        );
      }

      // Apply stock status filter
      if (filters.stockStatus && filters.stockStatus !== 'all') {
        results = results.filter(item => {
          if (!item.stock) return filters.stockStatus === 'in-stock';
          
          const { current, minimum } = item.stock;
          switch (filters.stockStatus) {
            case 'in-stock':
              return current > minimum;
            case 'low-stock':
              return current > 0 && current <= minimum;
            case 'out-of-stock':
              return current === 0;
            default:
              return true;
          }
        });
      }

      // Apply active filter
      if (filters.isActive !== undefined) {
        results = results.filter(item => item.isActive === filters.isActive);
      }

      // Apply barcode requirement
      if (filters.hasBarcode !== undefined) {
        results = results.filter(item => 
          filters.hasBarcode ? !!item.barcode : true
        );
      }

      const searchDuration = performance.now() - startTime;
      await this.recordPerformance('search', searchDuration, { 
        query, 
        resultCount: results.length,
        filterCount: Object.keys(filters).length
      });

      return results.slice(0, limit);
    } catch (error) {
      console.error('Advanced search failed:', error);
      throw error;
    }
  }

  /**
   * Get filter options for the current item catalog
   */
  async getFilterOptions(): Promise<{
    categories: Category[];
    brands: string[];
    suppliers: Supplier[];
    tags: ItemTag[];
    priceRange: { min: number; max: number };
    stockCounts: { inStock: number; lowStock: number; outOfStock: number };
  }> {
    try {
      const [categories, brands, suppliers, tags, items] = await Promise.all([
        this.getCategoryTree(),
        this.items.where('brand').notEqual('').uniqueKeys(),
        this.suppliers.where('isActive').equals(1).toArray(),
        this.itemTags.orderBy('name').toArray(),
        this.items.where('isActive').equals(1).toArray()
      ]);

      // Calculate price range
      const prices = items.map(item => item.basePrice);
      const priceRange = {
        min: Math.min(...prices, 0),
        max: Math.max(...prices, 0)
      };

      // Calculate stock counts
      const stockCounts = items.reduce((acc, item) => {
        if (!item.stock) {
          acc.inStock++;
        } else {
          const { current, minimum } = item.stock;
          if (current === 0) {
            acc.outOfStock++;
          } else if (current <= minimum) {
            acc.lowStock++;
          } else {
            acc.inStock++;
          }
        }
        return acc;
      }, { inStock: 0, lowStock: 0, outOfStock: 0 });

      return {
        categories,
        brands: brands.filter(Boolean) as string[],
        suppliers,
        tags,
        priceRange,
        stockCounts
      };
    } catch (error) {
      console.error('Failed to get filter options:', error);
      throw error;
    }
  }

  /**
   * Transaction State Management
   */
  async createTransactionState(state: Omit<TransactionState, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const transactionState: TransactionState = {
      id,
      ...state,
      lastUpdated: new Date()
    };

    await this.transactionStates.add(transactionState);
    return id;
  }

  async getTransactionState(id: string): Promise<TransactionState | undefined> {
    return await this.transactionStates.get(id);
  }

  async updateTransactionState(
    id: string, 
    updates: Partial<TransactionState>
  ): Promise<void> {
    await this.transactionStates.update(id, {
      ...updates,
      lastUpdated: new Date()
    });
  }

  /**
   * Split Payment Management
   */
  async createSplitPayment(payment: Omit<SplitPayment, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const splitPayment: SplitPayment = {
      id,
      ...payment,
      updatedAt: new Date()
    };

    await this.splitPayments.add(splitPayment);
    return id;
  }

  async getSplitPayment(transactionId: string): Promise<SplitPayment | undefined> {
    return await this.splitPayments
      .where('transactionId')
      .equals(transactionId)
      .first();
  }

  async updateSplitPayment(
    id: string, 
    updates: Partial<SplitPayment>
  ): Promise<void> {
    await this.splitPayments.update(id, {
      ...updates,
      updatedAt: new Date()
    });
  }

  /**
   * Receipt Template Management
   */
  async getActiveReceiptTemplate(type: ReceiptTemplate['type']): Promise<ReceiptTemplate | undefined> {
    return await this.receiptTemplates
      .where('[type+isActive]')
      .equals([type, 1])
      .first();
  }

  async createReceiptTemplate(template: Omit<ReceiptTemplate, 'id'>): Promise<string> {
    const id = crypto.randomUUID();
    const receiptTemplate: ReceiptTemplate = {
      id,
      ...template
    };

    await this.receiptTemplates.add(receiptTemplate);
    return id;
  }

  /**
   * Return Transaction Database Methods
   */

  /**
   * Save a return transaction to database
   */
  async saveReturnTransaction(returnTransaction: ReturnTransactionRecord): Promise<string> {
    const now = new Date();
    const record: ReturnTransactionRecord = {
      ...returnTransaction,
      createdAt: returnTransaction.createdAt || now,
      updatedAt: now
    };

    await this.returnTransactions.put(record);
    return record.id;
  }

  /**
   * Get return transaction by ID
   */
  async getReturnTransaction(id: string): Promise<ReturnTransactionRecord | undefined> {
    return await this.returnTransactions.get(id);
  }

  /**
   * Get return transaction by original transaction ID
   */
  async getReturnTransactionByOriginal(originalTransactionId: string): Promise<ReturnTransactionRecord[]> {
    return await this.returnTransactions
      .where('originalTransactionId')
      .equals(originalTransactionId)
      .toArray();
  }

  /**
   * Get return transactions with filters
   */
  async getReturnTransactions(filters: {
    status?: ReturnTransactionRecord['status'];
    startDate?: Date;
    endDate?: Date;
    processedBy?: string;
    limit?: number;
  }): Promise<ReturnTransactionRecord[]> {
    let query = this.returnTransactions.orderBy('returnDate').reverse();

    if (filters.status) {
      query = query.and(record => record.status === filters.status);
    }

    if (filters.processedBy) {
      query = query.and(record => record.processedBy === filters.processedBy);
    }

    const records = await query.toArray();

    // Apply date filters
    let filteredRecords = records;
    if (filters.startDate) {
      filteredRecords = filteredRecords.filter(record => record.returnDate >= filters.startDate!);
    }
    if (filters.endDate) {
      filteredRecords = filteredRecords.filter(record => record.returnDate <= filters.endDate!);
    }

    return filteredRecords.slice(0, filters.limit || 100);
  }

  /**
   * Update return transaction status
   */
  async updateReturnTransactionStatus(
    id: string, 
    status: ReturnTransactionRecord['status'],
    approvedBy?: string
  ): Promise<void> {
    const updates: Partial<ReturnTransactionRecord> = {
      status,
      updatedAt: new Date()
    };

    if (approvedBy) {
      updates.approvedBy = approvedBy;
    }

    await this.returnTransactions.update(id, updates);
  }

  /**
   * Get pending return transactions (require approval)
   */
  async getPendingReturnTransactions(): Promise<ReturnTransactionRecord[]> {
    return await this.returnTransactions
      .where('status')
      .equals('pending')
      .and(record => record.requiresApproval)
      .toArray();
  }

  /**
   * Print Job Database Methods
   */

  /**
   * Create print job
   */
  async createPrintJob(printJob: Omit<PrintJobRecord, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
    const id = crypto.randomUUID();
    const job: PrintJobRecord = {
      id,
      ...printJob,
      createdAt: new Date(),
      attempts: 0
    };

    await this.printJobs.add(job);
    return id;
  }

  /**
   * Get pending print jobs by priority
   */
  async getPendingPrintJobs(): Promise<PrintJobRecord[]> {
    return await this.printJobs
      .where('status')
      .anyOf(['pending', 'retry'])
      .sortBy('priority');
  }

  /**
   * Update print job status
   */
  async updatePrintJobStatus(
    id: string,
    status: PrintJobRecord['status'],
    errorMessage?: string
  ): Promise<void> {
    const updates: Partial<PrintJobRecord> = {
      status,
      lastAttemptAt: new Date()
    };

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    if (status === 'pending') {
      updates.attempts = 0;
    }

    await this.printJobs.update(id, updates);
  }

  /**
   * Increment print job attempt count
   */
  async incrementPrintJobAttempts(id: string): Promise<number> {
    const job = await this.printJobs.get(id);
    if (!job) return 0;

    const newAttempts = job.attempts + 1;
    await this.printJobs.update(id, {
      attempts: newAttempts,
      lastAttemptAt: new Date()
    });

    return newAttempts;
  }

  /**
   * Get print jobs for transaction
   */
  async getPrintJobsForTransaction(transactionId: string): Promise<PrintJobRecord[]> {
    return await this.printJobs
      .where('transactionId')
      .equals(transactionId)
      .toArray();
  }

  /**
   * Cash Log Database Methods
   */

  /**
   * Log cash transaction
   */
  async logCashTransaction(log: Omit<CashLogRecord, 'id' | 'timestamp'>): Promise<void> {
    const id = crypto.randomUUID();
    const record: CashLogRecord = {
      id,
      ...log,
      timestamp: new Date()
    };

    await this.cashLogs.add(record);
  }

  /**
   * Get cash logs with filters
   */
  async getCashLogs(filters: {
    type?: CashLogRecord['type'];
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    limit?: number;
  }): Promise<CashLogRecord[]> {
    let query = this.cashLogs.orderBy('timestamp').reverse();

    if (filters.type) {
      query = query.and(log => log.type === filters.type);
    }

    if (filters.userId) {
      query = query.and(log => log.userId === filters.userId);
    }

    const logs = await query.toArray();

    // Apply date filters
    let filteredLogs = logs;
    if (filters.startDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endDate!);
    }

    return filteredLogs.slice(0, filters.limit || 100);
  }

  /**
   * Get cash disbursement summary for date range
   */
  async getCashDisbursementSummary(startDate: Date, endDate: Date): Promise<{
    totalDisbursed: number;
    returnRefunds: number;
    totalTransactions: number;
    byUser: Record<string, number>;
  }> {
    const logs = await this.getCashLogs({
      type: 'cash_disbursement',
      startDate,
      endDate
    });

    const summary = {
      totalDisbursed: 0,
      returnRefunds: 0,
      totalTransactions: logs.length,
      byUser: {} as Record<string, number>
    };

    logs.forEach(log => {
      summary.totalDisbursed += log.amount;
      
      if (log.reason === 'return_refund') {
        summary.returnRefunds += log.amount;
      }

      summary.byUser[log.userId] = (summary.byUser[log.userId] || 0) + log.amount;
    });

    return summary;
  }

  /**
   * Transaction Lookup Methods for Return System
   */

  /**
   * Get transaction by receipt number
   */
  async getTransactionByReceiptNumber(receiptNumber: string): Promise<SalesTransaction | undefined> {
    // Try to find in sales queue
    let transaction = await this.salesQueue
      .where('receiptNumber')
      .equals(receiptNumber)
      .first();

    // If not found, try to find by transaction ID (receiptNumber field)
    if (!transaction) {
      transaction = await this.salesQueue
        .where('id')
        .equals(receiptNumber)
        .first();
    }

    return transaction;
  }

  /**
   * Get transactions by customer phone
   */
  async getTransactionsByCustomerPhone(phoneNumber: string): Promise<SalesTransaction[]> {
    // Since we don't have a customer phone field in the schema,
    // we'll need to store this metadata or find alternative approach
    // For now, return empty array
    return [];
  }

  /**
   * Get recent transactions (for barcode lookup)
   */
  async getRecentTransactions(daysBack: number = 30): Promise<SalesTransaction[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    return await this.salesQueue
      .where('createdAt')
      .above(startDate)
      .and(transaction => transaction.status === 'completed')
      .reverse()
      .toArray();
  }

  /**
   * Find transactions containing specific barcode
   */
  async findTransactionsByBarcode(barcode: string): Promise<SalesTransaction[]> {
    const recentTransactions = await this.getRecentTransactions(30);
    
    return recentTransactions.filter(transaction => 
      transaction.items.some(item => 
        item.barcode === barcode || 
        item.id === barcode
      )
    );
  }
}

// Export database instance
export const db = new POSDatabase();

// Initialize database and perform maintenance on startup
export const initializeDatabase = async (): Promise<void> => {
  try {
    await db.open();
    await db.clearExpiredData();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};