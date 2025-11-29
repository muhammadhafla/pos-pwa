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
  PerformanceMetrics
} from '@/types';

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

export class POSDatabase extends Dexie {
  // Core tables
  items!: Table<Item>;
  pricingRules!: Table<PricingRule>;
  salesQueue!: Table<SalesTransaction>;
  auditLogs!: Table<AuditLog>;
  syncStatus!: Table<SyncStatus>;
  
  // Additional tables
  cartHold!: Table<CartHold>;
  priceOverrides!: Table<PriceOverrideRecord>;
  performanceRecords!: Table<PerformanceRecord>;
  users!: Table<UserCache>;

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
        isActive, 
        updatedAt, 
        lastSyncedAt,
        &barcode,
        &additionalBarcodes
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
          item.name?.toLowerCase().includes(query.toLowerCase()) ||
          item.barcode.includes(query) ||
          (item.brand && item.brand.toLowerCase().includes(query.toLowerCase()))
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