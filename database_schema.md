# Database Schema Design - IndexedDB for POS PWA

## 1. Schema Overview

### Design Principles
- **Performance**: O(1) barcode lookup, fast search indexing
- **Integrity**: Foreign key relationships, data validation
- **Audit**: Immutable logs, change tracking
- **Sync**: Delta sync support, conflict resolution
- **Storage**: Efficient space usage, compression support

### Database Versioning Strategy
```typescript
// Database version management
const DB_VERSION = 1;

interface DatabaseMigration {
  version: number;
  up: (db: IDBDatabase) => Promise<void>;
  down: (db: IDBDatabase) => Promise<void>;
}

const migrations: DatabaseMigration[] = [
  {
    version: 1,
    up: (db) => createVersion1Schema(db),
    down: (db) => dropVersion1Schema(db)
  }
];
```

## 2. Core Schema Definition

### 2.1 Items Table
```typescript
interface Item {
  id: string;              // Unique item ID (SKU)
  name: string;            // Item display name
  description?: string;    // Optional description
  category: string;        // Product category
  unit: string;            // Unit of measurement (pcs, kg, etc.)
  brand?: string;          // Brand name
  barcode: string;         // Primary barcode
  additionalBarcodes: string[]; // Secondary barcodes
  basePrice: number;       // Base price
  cost: number;            // Cost price for margin calculation
  taxRate: number;         // Tax percentage
  isActive: boolean;       // Active flag
  isPerishable: boolean;   // Perishable goods flag
  shelfLifeDays?: number;  // Expiry days if perishable
  weight?: number;         // Weight in grams
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  images: string[];        // Image URLs
  stock?: {
    current: number;
    minimum: number;
    maximum: number;
  };
  branchSpecific: BranchSpecificItem[];
  metadata: Record<string, any>; // Extensible metadata
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

interface BranchSpecificItem {
  branchId: string;
  isActive: boolean;
  customPrice?: number;
  customCost?: number;
  notes?: string;
}

interface ItemIndex {
  'by-barcode': string;
  'by-name': string;
  'by-category': string;
  'by-brand': string;
  'by-updated': Date;
}
```

### 2.2 Pricing Rules Table
```typescript
interface PricingRule {
  id: string;                    // Unique rule ID
  name: string;                  // Rule display name
  priority: number;              // Rule priority (1-8 from blueprint)
  ruleType: PricingRuleType;     // Type of pricing rule
  conditions: PricingCondition[]; // Rule conditions
  discountType: DiscountType;    // How discount is applied
  discountValue: number;         // Discount amount/percentage
  freeItemId?: string;           // Free item for BXGY rules
  applicableBranches: string[];  // Branches where rule applies
  applicableItems: string[];     // Specific items (if item-specific)
  applicableCategories: string[]; // Applicable categories
  minQuantity?: number;          // Minimum quantity for rule
  maxQuantity?: number;          // Maximum quantity for rule
  minSpend?: number;             // Minimum spend amount
  startDate?: Date;              // Rule start date
  endDate?: Date;                // Rule end date
  startTime?: string;            // Daily start time (HH:MM)
  endTime?: string;              // Daily end time (HH:MM)
  daysOfWeek?: number[];         // Days of week (0-6, Sunday=0)
  isStackable: boolean;          // Can be combined with other rules
  isActive: boolean;             // Active flag
  metadata: Record<string, any>; // Extensible metadata
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

type PricingRuleType = 
  | 'BASE_PRICE'           // Rule priority 1
  | 'BRANCH_OVERRIDE'      // Rule priority 2  
  | 'MEMBER_PRICE'         // Rule priority 3
  | 'TIME_LIMITED_PROMO'   // Rule priority 4
  | 'QUANTITY_BREAK'       // Rule priority 5
  | 'SPEND_X_DISCOUNT'     // Rule priority 6
  | 'BUY_X_GET_Y'          // Rule priority 7
  | 'MANUAL_OVERRIDE';     // Rule priority 8

type DiscountType = 
  | 'PERCENTAGE'           // Percentage discount
  | 'FIXED_AMOUNT'         // Fixed amount discount
  | 'FREE_ITEM';           // Free item (BXGY)

interface PricingCondition {
  field: string;           // Field to check
  operator: ComparisonOperator; // Comparison operator
  value: any;              // Condition value
}

type ComparisonOperator = 
  | 'EQUALS' 
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'IN'
  | 'NOT_IN'
  | 'BETWEEN';
```

### 2.3 Cart Hold Table
```typescript
interface CartHold {
  id: string;              // Unique basket ID
  name: string;            // Basket name/label
  items: CartItem[];       // Basket items
  subtotal: number;        // Subtotal before tax
  taxAmount: number;       // Tax amount
  total: number;           // Total amount
  discountTotal: number;   // Total discounts applied
  holdReason?: string;     // Reason for holding
  createdBy: string;       // User who held the cart
  branchId: string;        // Branch where cart was held
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt?: Date;        // Optional expiry time
  isRecovered: boolean;    // Marked as recovered after crash
}

interface CartItem {
  itemId: string;          // Item reference
  barcode: string;         // Barcode at time of add
  name: string;            // Item name at time of add
  unitPrice: number;       // Unit price at time of add
  quantity: number;        // Quantity
  discountApplied: number; // Discount amount per item
  taxRate: number;         // Tax rate at time of add
  taxAmount: number;       // Tax amount per item
  totalPrice: number;      // Total price for this line
  pricingRuleApplied?: string[]; // Applied pricing rules
  notes?: string;          // Item-level notes
}
```

### 2.4 Sales Queue Table
```typescript
interface SalesTransaction {
  id: string;                    // Unique transaction ID
  branchId: string;              // Branch ID
  cashierId: string;             // Cashier user ID
  cashierName: string;           // Cashier display name
  customerId?: string;           // Customer ID (optional)
  customerName?: string;         // Customer name
  items: CartItem[];             // Transaction items
  paymentBreakdown: PaymentBreakdown; // Payment method details
  subtotal: number;              // Subtotal
  taxAmount: number;             // Total tax
  discountTotal: number;         // Total discounts
  totalAmount: number;           // Final total
  changeGiven: number;           // Change amount
  receiptNumber: string;         // Generated receipt number
  status: TransactionStatus;     // Current status
  priority: number;              // Sync priority
  attempts: number;              // Sync attempt count
  lastAttemptAt?: Date;          // Last sync attempt
  errorMessage?: string;         // Last error message
  syncedAt?: Date;               // Successful sync timestamp
  erpNextSalesId?: string;       // ERPNext sales invoice ID
  deviceId: string;              // Device identifier
  metadata: Record<string, any>; // Additional metadata
  createdAt: Date;
  updatedAt: Date;
}

type TransactionStatus = 
  | 'PENDING'          // Created, waiting for sync
  | 'RETRYING'         // Failed, will retry
  | 'SYNCED'           // Successfully synced
  | 'FAILED'           // Permanent failure
  | 'CONFLICT';        // Data conflict detected

interface PaymentBreakdown {
  cash?: number;               // Cash payment amount
  card?: number;               // Card payment amount
  qris?: number;               // QRIS payment amount
  bankTransfer?: number;       // Bank transfer amount
  credit?: number;             // Store credit used
  loyaltyPoints?: number;      // Loyalty points used
  other?: number;              // Other payment method
  splitDetails?: SplitPaymentDetail[]; // For split payments
}

interface SplitPaymentDetail {
  method: string;              // Payment method
  amount: number;              // Amount for this split
  reference?: string;          // Reference/transaction ID
}
```

### 2.5 Returns Table
```typescript
interface ReturnTransaction {
  id: string;                  // Unique return ID
  originalSaleId: string;      // Original sale transaction ID
  returnItems: ReturnItem[];   // Returned items
  totalReturnAmount: number;   // Total return amount
  refundMethod: RefundMethod;  // How refund is processed
  reason: string;              // Return reason
  isApproved: boolean;         // Supervisor approval
  approvedBy?: string;         // Supervisor who approved
  approvedAt?: Date;           // Approval timestamp
  receiptNumber: string;       // Return receipt number
  status: ReturnStatus;        // Return status
  syncedAt?: Date;             // Sync timestamp
  erpNextReturnId?: string;    // ERPNext return ID
  branchId: string;            // Branch ID
  processedBy: string;         // User who processed return
  createdAt: Date;
  updatedAt: Date;
}

interface ReturnItem {
  itemId: string;              // Item reference
  originalQuantity: number;    // Original sale quantity
  returnQuantity: number;      // Quantity being returned
  unitPrice: number;           // Unit price at sale
  reason: string;              // Return reason for this item
}

type RefundMethod = 
  | 'CASH'             // Cash refund
  | 'ORIGINAL_PAYMENT' // Refund to original payment method
  | 'STORE_CREDIT';    // Store credit

type ReturnStatus = 
  | 'PENDING'          // Created, awaiting approval
  | 'APPROVED'         // Supervisor approved
  | 'PROCESSED'        // Return processed
  | 'SYNCED'           // Synced to ERPNext
  | 'REJECTED';        // Return rejected
```

### 2.6 Audit Logs Table
```typescript
interface AuditLog {
  id: string;                  // Unique log ID
  action: AuditAction;         // Type of action
  entityType: string;          // Entity being acted upon
  entityId: string;            // Entity ID
  userId: string;              // User performing action
  userRole: string;            // User role at time of action
  branchId: string;            // Branch where action occurred
  timestamp: Date;             // Action timestamp
  oldValues?: Record<string, any>; // Previous values
  newValues?: Record<string, any>; // New values
  reason?: string;             // Reason for action (for overrides)
  pinRequired?: boolean;       // Whether PIN was required
  ipAddress?: string;          // Device IP (if available)
  deviceId: string;            // Device identifier
  sessionId: string;           // Session identifier
  metadata: Record<string, any>; // Additional context
  isImmutable: boolean;        // Cannot be deleted/modified
}

type AuditAction = 
  | 'CREATE'                   // Entity creation
  | 'UPDATE'                   // Entity update
  | 'DELETE'                   // Entity deletion
  | 'LOGIN'                    // User login
  | 'LOGOUT'                   // User logout
  | 'PRICE_OVERRIDE'           // Manual price override
  | 'VOID_ITEM'                // Item voiding
  | 'CANCEL_SALE'              // Sale cancellation
  | 'PROCESS_RETURN'           // Return processing
  | 'APPROVE_RETURN'           // Return approval
  | 'SYNC_ATTEMPT'             // Sync attempt
  | 'SYNC_SUCCESS'             // Successful sync
  | 'SYNC_FAILURE';            // Failed sync
```

### 2.7 User Management Table
```typescript
interface User {
  id: string;                  // User ID
  username: string;            // Username
  fullName: string;            // Display name
  role: UserRole;              // User role
  branchId: string;            // Assigned branch
  isActive: boolean;           // Active flag
  lastLoginAt?: Date;          // Last login timestamp
  loginCount: number;          // Total login count
  permissions: UserPermission[]; // Granular permissions
  settings: UserSettings;      // User preferences
  pinHash?: string;            // Hashed PIN
  deviceBindings: DeviceBinding[]; // Allowed devices
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

type UserRole = 
  | 'KASIR'                    // Cashier
  | 'SUPERVISOR'               // Supervisor
  | 'ADMIN_CABANG'             // Branch Admin
  | 'HQ_ADMIN';                // HQ Administrator

interface UserPermission {
  resource: string;            // Resource name
  actions: string[];           // Allowed actions
}

interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  receiptPrinter?: string;
  barcodeScanner?: string;
  autoSync: boolean;
  soundEnabled: boolean;
  defaultPaymentMethod: string;
}

interface DeviceBinding {
  deviceId: string;            // Device identifier
  deviceName: string;          // Device display name
  boundAt: Date;               // Binding timestamp
  lastUsedAt: Date;            // Last usage timestamp
  isActive: boolean;           // Binding active flag
}
```

### 2.8 Sync Status Table
```typescript
interface SyncStatus {
  id: string;                  // Sync status ID
  branchId: string;            // Branch ID
  lastMasterDataSync: Date;    // Last master data sync
  lastTransactionSync: Date;   // Last transaction sync
  pendingTransactions: number; // Count of pending transactions
  failedTransactions: number;  // Count of failed transactions
  lastSyncAttempt?: Date;      // Last sync attempt
  lastSyncResult: SyncResult;  // Last sync result
  networkStatus: NetworkStatus; // Current network status
  serverReachable: boolean;    // Server connectivity
  queueLength: number;         // Current queue length
  estimatedSyncTime?: number;  // Estimated time to clear queue
  conflicts: SyncConflict[];   // Data conflicts detected
  settings: SyncSettings;      // Sync configuration
  createdAt: Date;
  updatedAt: Date;
}

type SyncResult = 
  | 'SUCCESS'                  // Successful sync
  | 'PARTIAL'                  // Partial success
  | 'FAILED'                   // Failed sync
  | 'NETWORK_ERROR';           // Network connectivity issue

type NetworkStatus = 
  | 'ONLINE'                   // Fully online
  | 'SLOW'                     // Slow connection
  | 'INTERMITTENT'             // Intermittent connectivity
  | 'OFFLINE';                 // No connectivity

interface SyncConflict {
  id: string;                  // Conflict ID
  type: ConflictType;          // Type of conflict
  localData: any;              // Local version
  serverData: any;             // Server version
  resolutionStrategy: ResolutionStrategy; // How to resolve
  resolved: boolean;           // Whether resolved
  resolvedBy?: string;         // Who resolved it
  resolvedAt?: Date;           // When resolved
  notes?: string;              // Resolution notes
}

type ConflictType = 
  | 'ITEM_UPDATE'              // Item data conflict
  | 'PRICING_UPDATE'           // Pricing rule conflict
  | 'TRANSACTION_CONFLICT'     // Transaction data conflict
  | 'USER_UPDATE';             // User data conflict

type ResolutionStrategy = 
  | 'USE_LOCAL'                // Keep local data
  | 'USE_SERVER'               // Use server data
  | 'MERGE'                    // Merge both versions
  | 'MANUAL';                  // Manual resolution required

interface SyncSettings {
  syncInterval: number;        // Sync interval in seconds
  maxRetries: number;          // Maximum retry attempts
  batchSize: number;           // Transactions per batch
  conflictResolution: ResolutionStrategy; // Default conflict resolution
  enableRealTimeSync: boolean; // Real-time sync enabled
}
```

## 3. Indexing Strategy

### 3.1 Performance Indexes
```typescript
const INDEX_DEFINITIONS = {
  // Item indexes for fast lookups
  items: [
    'by-barcode',              // Primary lookup index
    'by-name',                 // Search by name
    'by-category',             // Filter by category
    'by-brand',                // Filter by brand
    'by-updated',              // Delta sync index
    'by-branch-active'         // Branch-specific lookup
  ],
  
  // Pricing rule indexes for rule evaluation
  pricingRules: [
    'by-priority',             // Rule priority order
    'by-validity',             // Time-based filtering
    'by-branch',               // Branch-specific rules
    'by-type',                 // Rule type filtering
    'by-active',               // Active rules only
    'by-updated'               // Delta sync index
  ],
  
  // Transaction indexes for sync operations
  salesQueue: [
    'by-status',               // Filter by sync status
    'by-priority',             // Sync priority order
    'by-created',              // Time-based processing
    'by-branch',               // Branch filtering
    'by-cashier',              // Cashier filtering
    'by-attempts'              // Retry logic
  ],
  
  // Audit log indexes for compliance
  auditLogs: [
    'by-timestamp',            // Time-based queries
    'by-user',                 // User activity tracking
    'by-action',               // Action type filtering
    'by-entity',               // Entity-based queries
    'by-branch',               // Branch auditing
    'by-immutable'             // Immutable logs only
  ]
};
```

### 3.2 Search Indexes
```typescript
// Full-text search support using Dexie
interface SearchIndexes {
  // Generate search tokens for items
  generateItemSearchTokens(item: Item): string[] {
    const tokens: string[] = [];
    
    // Name tokens (individual words + phrases)
    tokens.push(...item.name.toLowerCase().split(' '));
    tokens.push(item.name.toLowerCase());
    
    // Barcode tokens
    item.additionalBarcodes.forEach(barcode => {
      tokens.push(barcode.toLowerCase());
    });
    
    // Category and brand
    tokens.push(item.category.toLowerCase());
    if (item.brand) {
      tokens.push(item.brand.toLowerCase());
    }
    
    // Remove duplicates and short tokens
    return [...new Set(tokens)].filter(token => token.length > 1);
  }
  
  // Search function with fuzzy matching
  async searchItems(query: string, limit: number = 20): Promise<Item[]> {
    const searchTokens = query.toLowerCase().split(' ');
    
    return await db.items
      .filter(item => {
        const itemTokens = this.generateItemSearchTokens(item);
        return searchTokens.every(token => 
          itemTokens.some(itemToken => itemToken.includes(token))
        );
      })
      .limit(limit)
      .toArray();
  }
}
```

## 4. Data Integrity Rules

### 4.1 Validation Rules
```typescript
const VALIDATION_RULES = {
  // Item validation
  validateItem(item: Item): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!item.id?.trim()) {
      errors.push({ field: 'id', message: 'Item ID is required' });
    }
    
    if (!item.name?.trim()) {
      errors.push({ field: 'name', message: 'Item name is required' });
    }
    
    if (!item.barcode?.trim()) {
      errors.push({ field: 'barcode', message: 'Barcode is required' });
    }
    
    if (item.basePrice < 0) {
      errors.push({ field: 'basePrice', message: 'Price cannot be negative' });
    }
    
    if (item.taxRate < 0 || item.taxRate > 100) {
      errors.push({ field: 'taxRate', message: 'Tax rate must be 0-100%' });
    }
    
    return { isValid: errors.length === 0, errors };
  },
  
  // Transaction validation
  validateTransaction(transaction: SalesTransaction): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!transaction.items?.length) {
      errors.push({ field: 'items', message: 'Transaction must have items' });
    }
    
    if (transaction.totalAmount < 0) {
      errors.push({ field: 'totalAmount', message: 'Total cannot be negative' });
    }
    
    // Validate payment breakdown
    const paymentTotal = Object.values(transaction.paymentBreakdown)
      .reduce((sum, amount) => sum + (amount || 0), 0);
    
    if (Math.abs(paymentTotal - transaction.totalAmount) > 0.01) {
      errors.push({ 
        field: 'paymentBreakdown', 
        message: 'Payment breakdown must equal total amount' 
      });
    }
    
    return { isValid: errors.length === 0, errors };
  }
};
```

### 4.2 Referential Integrity
```typescript
// Database relationships and foreign key constraints
const RELATIONSHIP_CONSTRAINTS = {
  // Ensure item references are valid
  validateItemReferences(cartItems: CartItem[]): Promise<boolean> {
    return db.transaction('rw', db.items, async () => {
      for (const cartItem of cartItems) {
        const item = await db.items.get(cartItem.itemId);
        if (!item) {
          throw new Error(`Item ${cartItem.itemId} not found`);
        }
      }
      return true;
    });
  },
  
  // Cascade delete for related records
  async deleteItem(itemId: string): Promise<void> {
    return db.transaction('rw', db.items, db.pricingRules, db.auditLogs, async () => {
      // Check for active sales referencing this item
      const activeSales = await db.salesQueue
        .where('items')
        .anyOf([{ itemId }])
        .count();
      
      if (activeSales > 0) {
        throw new Error('Cannot delete item with active sales');
      }
      
      // Delete item
      await db.items.delete(itemId);
      
      // Delete pricing rules referencing this item
      await db.pricingRules
        .where('applicableItems')
        .anyOf([itemId])
        .delete();
      
      // Log deletion
      await db.auditLogs.add({
        action: 'DELETE',
        entityType: 'Item',
        entityId: itemId,
        // ... other required fields
      });
    });
  }
};
```

## 5. Performance Optimization

### 5.1 Connection Pool Management
```typescript
class DatabaseManager {
  private static instance: DatabaseManager;
  private db: POSDatabase;
  
  private constructor() {
    this.db = new POSDatabase();
  }
  
  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }
  
  // Batch operations for better performance
  async bulkInsertItems(items: Item[]): Promise<void> {
    return this.db.transaction('rw', this.db.items, async () => {
      const chunks = this.chunkArray(items, 100); // Process in chunks
      
      for (const chunk of chunks) {
        await this.db.items.bulkAdd(chunk);
      }
    });
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

### 5.2 Cache Management
```typescript
// Intelligent caching strategy
class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  set(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }
  
  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  // Intelligent cache warming
  async warmCache(): Promise<void> {
    // Pre-load frequently accessed items
    const popularItems = await this.getPopularItems(100);
    this.set('popular-items', popularItems, 60 * 60 * 1000); // 1 hour
    
    // Pre-load active pricing rules
    const activeRules = await this.getActivePricingRules();
    this.set('active-pricing-rules', activeRules, 30 * 60 * 1000); // 30 minutes
  }
}
```

This database schema provides:
- Complete offline-first support
- High-performance indexing
- Data integrity enforcement
- Audit trail compliance
- Efficient sync mechanisms
- Scalable architecture

The design follows the blueprint requirements while ensuring production-ready performance and reliability.