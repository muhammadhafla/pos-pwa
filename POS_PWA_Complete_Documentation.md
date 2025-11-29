# 📚 POS PWA Retail System - Complete Documentation Source

**Master Reference Document - Consolidated from All Project Documentation**

*Version 1.0 - Created: 2025-11-29*  
*System: Offline-first POS PWA with ERPNext Integration*

---

## 📋 Table of Contents

### 1. [Executive Summary & Project Overview](#1-executive-summary--project-overview)
### 2. [Business Requirements & Core Specifications](#2-business-requirements--core-specifications)
### 3. [Technical Architecture & System Design](#3-technical-architecture--system-design)
### 4. [Database Schema & Data Management](#4-database-schema--data-management)
### 5. [ERPNext Integration & API Specifications](#5-erpnext-integration--api-specifications)
### 6. [Development Implementation & Roadmap](#6-development-implementation--roadmap)
### 7. [Testing Strategy & Quality Assurance](#7-testing-strategy--quality-assurance)
### 8. [Deployment Strategy & Operations](#8-deployment-strategy--operations)
### 9. [API Reference & Research Materials](#9-api-reference--research-materials)
### 10. [Appendices & Supporting Documentation](#10-appendices--supporting-documentation)

---

## 1. Executive Summary & Project Overview

### Project Scope
- **System Type**: Offline-first PWA for multi-branch retail
- **Performance Target**: ≤100ms scan time, ≤200ms search response
- **Timeline**: 4-week development cycle
- **Architecture**: React + TypeScript + IndexedDB + Service Workers
- **Integration**: ERPNext for master data and transaction posting

### Key Deliverables
1. **Technical Architecture** - Complete system design and technology choices
2. **Database Schema** - IndexedDB design with 8 core tables
3. **ERPNext Integration** - API specifications and sync mechanisms
4. **Development Phases** - Detailed 4-week implementation roadmap
5. **Testing Strategy** - Comprehensive testing for offline-first scenarios
6. **Deployment Strategy** - Multi-platform deployment and device compatibility
7. **Project Setup** - Complete development environment configuration

### Success Metrics & KPIs

#### Performance Metrics
- **Barcode Scan Time**: <100ms (measured with Performance.now())
- **Search Response**: <200ms for item search
- **App Startup**: <2 seconds to first meaningful paint
- **Crash Recovery**: <3 seconds to restore cart state

#### Business Metrics
- **Transaction Success Rate**: >99.9%
- **Sync Success Rate**: >99%
- **User Adoption**: Track POS usage patterns
- **Audit Compliance**: 100% transaction logging

---

## 2. Business Requirements & Core Specifications

### Core Principles
- **Offline-First**: All POS operations work without internet connection
- **Performance**: <100ms scan-to-display, <200ms search response
- **Reliability**: Crash recovery, data integrity, audit trail
- **Security**: Role-based access, anti-fraud measures, audit logging

### Vision Operasional

Software ini hadir untuk **mempercepat transaksi**, **menjaga akurasi harga**, dan **menghilangkan downtime** di toko retail multi-cabang.

**Kasir harus:**
- cepat (≤100 ms item masuk)
- tidak terhambat internet
- tidak pernah ragu harga mana yang benar

**Owner harus:**
- yakin stok & uang tidak bocor
- punya audit kuat tanpa bullshit

> Kalau POS bikin antrian panjang atau salah harga → mati.

### Scope & Release Rules

#### Termasuk di Fase 1:
- POS PWA offline-first
- Multi-cabang (1 database ERPNext)
- Barcode scan & search cepat
- Hold & recall multiple baskets
- Split payment (Cash + QRIS manual input)
- Return full cash < 7 hari
- Price override dengan SPV approval
- Detailed receipt promo breakdown
- Local transaction queue + background sync
- Local audit log anti-hapus

#### Tidak Termasuk di Fase 1:
- Integrasi otomatis QRIS atau EDC
- Loyalty point & voucher pusat
- Promo bundling komplisitif campuran kategori
- Self-checkout

> Kalau kamu coba masukin semua ini di fase 1 → proyek kamu **tidak akan pernah selesai**.

### Roles & Permissions

| Role         | Akses                                       | Catatan                                |
| ------------ | ------------------------------------------- | -------------------------------------- |
| Kasir        | transaksi normal                            | tidak boleh ubah harga                 |
| Supervisor   | override harga, void item, cancel transaksi | require PIN                            |
| Admin Cabang | pengaturan device, laporan lokal            | tidak bisa edit transaksi setelah sync |
| HQ/ERP Admin | pricing master & promo control              | sumber pricing resmi                   |

Override = **selalu** simpan siapa, kapan, dan kenapa.

### Business Feature Specifications

#### Scan & Add Behavior
- Barcode scan → **O(1)** lookup local
- Kalau item sudah di cart → +1 qty auto
- Kalau item tidak ditemukan → alert instant (bukan freeze)

#### Hold / Recall
- Max 20 baskets
- Visible count indicator
- Stored in IndexedDB
- Tidak sync ke server
- Recoverable setelah crash

#### Return
- Valid 7 hari berdasarkan nomor struk
- Refund **cash only**
- Barcode on receipt → fetch original transaction detail
- Return logged as **negative sale**
- Tidak perlu persetujuan SPV **kecuali**:
  - item berbeda
  - harga beda saat return
  - qty > original

> Return = proses yang paling sering disalahgunakan.
> Audit harus **sejelas mayat di meja otopsi**.

#### Split Payment
- Cash + QRIS (manual nominal)
- Harus balanced 0
- Receipt menjelaskan pembagian

#### Price Override
- Require supervisor PIN
- Harus jelaskan **alasan**
- Simpan harga asli + override delta

### Pricing Engine Business Logic

#### Rule Hierarchy (paku mati)

1. Base Item Price
2. Branch Price Override
3. Member Price
4. Time Limited Promo
5. Quantity Break Discount
6. Spend X Discount
7. Buy X Get Y (free item)
8. Manual Override (with audit)

**Result** = harga **terendah valid**
- keep **all rule contributions** for audit + receipt

> Kalau kamu tidak log penyebab harga akhir → kamu akan kalah dalam perang audit.

---

## 3. Technical Architecture & System Design

### Architecture Pattern
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PWA Frontend  │    │  Local Storage   │    │  ERPNext API    │
│   (React 18+)   │◄──►│   (IndexedDB)    │◄──►│   Integration   │
│                 │    │                  │    │                 │
│ - UI Components │    │ - Items Cache    │    │ - Master Data   │
│ - State Mgmt    │    │ - Pricing Rules  │    │ - Transactions  │
│ - Sync Engine   │    │ - Transaction Q  │    │ - Sync Status   │
│ - Audit Logger  │    │ - Audit Logs     │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Technology Stack

#### Frontend Framework
**Choice: React 18+ with TypeScript**

**Rationale:**
- Excellent PWA support with Create React App or Vite
- Strong ecosystem for IndexedDB (Dexie.js)
- High performance with React 18 concurrent features
- TypeScript for type safety in complex pricing logic
- Large developer community and resources

#### Build Tools & Development
**Primary: Vite + React + TypeScript**
- Fast development server with HMR
- Excellent TypeScript support
- Optimized production builds
- PWA plugin support

**Development Tools:**
- ESLint + Prettier for code quality
- Jest + React Testing Library for testing
- Cypress for E2E testing
- Workbox for PWA service workers

#### Local Storage Solution
**Choice: Dexie.js (IndexedDB Wrapper)**

**Rationale:**
- Promise-based API (easier than raw IndexedDB)
- Built-in versioning and migration support
- Excellent TypeScript definitions
- Active maintenance and large community
- Automatic indexing capabilities

#### State Management
**Choice: Zustand + React Query**

**Rationale:**
- **Zustand**: Lightweight, simple API, excellent TypeScript support
- **React Query**: Server state management, caching, background sync
- **Combined**: Local state + server state separation

### Performance Optimization Strategy

#### Bundle Optimization
- **Code Splitting**: Route-based and feature-based splitting
- **Tree Shaking**: Remove unused code
- **Dynamic Imports**: Load pricing engine and heavy components on demand
- **Bundle Analysis**: webpack-bundle-analyzer to monitor size

#### Runtime Performance
- **Virtual Scrolling**: For large item lists (React Window)
- **Debounced Search**: 200ms delay for search input
- **Memoization**: React.memo for expensive components
- **Web Workers**: For complex pricing calculations

#### IndexedDB Optimization
- **Strategic Indexing**: Barcode, name, category indexes
- **Batch Operations**: Bulk inserts and updates
- **Compression**: Gzip for large datasets
- **Cleanup**: Automatic old transaction purging

### Security Architecture

#### Authentication Flow
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Service Worker
    participant E as ERPNext
    
    C->>S: User login with PIN
    S->>E: Token-based auth (API key/secret)
    E->>S: Authentication response
    S->>C: Store token securely
    
    Note over S: Token refresh every 23 hours
    S->>E: Refresh token
    E->>S: New token
    end
```

#### Data Security
- **Local Encryption**: Sensitive data encrypted in IndexedDB
- **API Security**: HTTPS only, token rotation
- **Audit Trail**: Immutable log entries
- **Role Validation**: Server-side permission checks

#### Anti-Fraud Measures
- **Device Binding**: Each device registered to specific branch
- **Transaction Integrity**: Digital signatures for offline transactions
- **Override Logging**: All price changes require PIN + reason
- **Duplicate Prevention**: Server-side idempotency checks

---

## 4. Database Schema & Data Management

### Database Schema Design

#### Design Principles
- **Performance**: O(1) barcode lookup, fast search indexing
- **Integrity**: Foreign key relationships, data validation
- **Audit**: Immutable logs, change tracking
- **Sync**: Delta sync support, conflict resolution
- **Storage**: Efficient space usage, compression support

### Core Tables

#### Items Table
```typescript
interface Item {
  id: string;                    // Unique item ID (SKU)
  name: string;                  // Item display name
  description?: string;          // Optional description
  category: string;              // Product category
  unit: string;                  // Unit of measurement (pcs, kg, etc.)
  brand?: string;                // Brand name
  barcode: string;               // Primary barcode
  additionalBarcodes: string[];  // Secondary barcodes
  basePrice: number;             // Base price
  cost: number;                  // Cost price for margin calculation
  taxRate: number;               // Tax percentage
  isActive: boolean;             // Active flag
  isPerishable: boolean;         // Perishable goods flag
  shelfLifeDays?: number;        // Expiry days if perishable
  weight?: number;               // Weight in grams
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  images: string[];              // Image URLs
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
```

#### Pricing Rules Table
```typescript
interface PricingRule {
  id: string;                     // Unique rule ID
  name: string;                   // Rule display name
  priority: number;               // Rule priority (1-8 from blueprint)
  ruleType: PricingRuleType;      // Type of pricing rule
  conditions: PricingCondition[]; // Rule conditions
  discountType: DiscountType;     // How discount is applied
  discountValue: number;          // Discount amount/percentage
  freeItemId?: string;            // Free item for BXGY rules
  applicableBranches: string[];   // Branches where rule applies
  applicableItems: string[];      // Specific items (if item-specific)
  applicableCategories: string[]; // Applicable categories
  minQuantity?: number;           // Minimum quantity for rule
  maxQuantity?: number;           // Maximum quantity for rule
  minSpend?: number;              // Minimum spend amount
  startDate?: Date;               // Rule start date
  endDate?: Date;                 // Rule end date
  startTime?: string;             // Daily start time (HH:MM)
  endTime?: string;               // Daily end time (HH:MM)
  daysOfWeek?: number[];          // Days of week (0-6, Sunday=0)
  isStackable: boolean;           // Can be combined with other rules
  isActive: boolean;              // Active flag
  metadata: Record<string, any>;  // Extensible metadata
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}
```

#### Sales Queue Table
```typescript
interface SalesTransaction {
  id: string;                         // Unique transaction ID
  branchId: string;                   // Branch ID
  cashierId: string;                  // Cashier user ID
  cashierName: string;                // Cashier display name
  customerId?: string;                // Customer ID (optional)
  customerName?: string;              // Customer name
  items: CartItem[];                  // Transaction items
  paymentBreakdown: PaymentBreakdown; // Payment method details
  subtotal: number;                   // Subtotal
  taxAmount: number;                  // Total tax
  discountTotal: number;              // Total discounts
  totalAmount: number;                // Final total
  changeGiven: number;                // Change amount
  receiptNumber: string;              // Generated receipt number
  status: TransactionStatus;          // Current status
  priority: number;                   // Sync priority
  attempts: number;                   // Sync attempt count
  lastAttemptAt?: Date;               // Last sync attempt
  errorMessage?: string;              // Last error message
  syncedAt?: Date;                    // Successful sync timestamp
  erpNextSalesId?: string;            // ERPNext sales invoice ID
  deviceId: string;                   // Device identifier
  metadata: Record<string, any>;      // Additional metadata
  createdAt: Date;
  updatedAt: Date;
}
```

#### Audit Logs Table
```typescript
interface AuditLog {
  id: string;                       // Unique log ID
  action: AuditAction;              // Type of action
  entityType: string;               // Entity being acted upon
  entityId: string;                 // Entity ID
  userId: string;                   // User performing action
  userRole: string;                 // User role at time of action
  branchId: string;                 // Branch where action occurred
  timestamp: Date;                  // Action timestamp
  oldValues?: Record<string, any>;  // Previous values
  newValues?: Record<string, any>;  // New values
  reason?: string;                  // Reason for action (for overrides)
  pinRequired?: boolean;            // Whether PIN was required
  ipAddress?: string;               // Device IP (if available)
  deviceId: string;                 // Device identifier
  sessionId: string;                // Session identifier
  metadata: Record<string, any>;    // Additional context
  isImmutable: boolean;             // Cannot be deleted/modified
}
```

### Indexing Strategy

#### Performance Indexes
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

---

## 5. ERPNext Integration & API Specifications

### Synchronization Architecture

#### Sync Principles
- **Never Block UI**: All POS operations work instantly without network dependency
- **Eventual Consistency**: Data converges to correct state over time
- **Idempotent Operations**: Same operation can be safely retried
- **Conflict Resolution**: Clear rules for handling data conflicts
- **Audit Trail**: Every sync operation is logged for compliance

### API Specification

#### Authentication
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
}
```

#### Master Data APIs

##### Item Management
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
```

#### Transaction APIs

##### Sales Invoice Creation
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
```

### Synchronization Mechanisms

#### Delta Sync Algorithm
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
}
```

#### Transaction Queue Management
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
}
```

---

## 6. Development Implementation & Roadmap

### Implementation Roadmap

#### Phase 1: Foundation (Week 1)
**Day 1-3**: Project Setup
- [x] Development environment configuration
- [x] Project structure creation
- [x] Database schema implementation
- [x] Basic PWA setup

**Day 4-7**: Core POS Functionality
- [ ] Item management with barcode lookup
- [ ] Shopping cart operations
- [ ] User authentication with roles
- [ ] Performance optimization (<100ms scan target)

#### Phase 2: Business Logic (Week 2)
**Day 8-14**: Pricing Engine
- [ ] 8-level pricing rule hierarchy implementation
- [ ] Receipt generation with discount breakdown
- [ ] Price override system with supervisor approval
- [ ] Split payment and return processing

#### Phase 3: Integration (Week 3)
**Day 15-21**: ERPNext Integration
- [ ] Master data synchronization
- [ ] Transaction queue with offline support
- [ ] Crash recovery system
- [ ] Sales invoice posting to ERPNext

#### Phase 4: Testing & Deployment (Week 4)
**Day 22-28**: Quality Assurance
- [ ] Stress testing (400 consecutive scans)
- [ ] Network interruption testing
- [ ] Crash recovery validation
- [ ] Production deployment

### Project Structure
```
pos-pwa/
├── public/
│   ├── icons/
│   ├── sw.js
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── pos/
│   │   └── auth/
│   ├── hooks/
│   ├── stores/
│   ├── services/
│   │   ├── database/
│   │   ├── erpnext/
│   │   └── sync/
│   ├── utils/
│   ├── types/
│   └── App.tsx
├── tests/
├── cypress/
└── docs/
```

### Environment Configuration
```typescript
// TypeScript Configuration (tsconfig.json)
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES2020", "WebWorker"],
    "types": ["vite/client", "jest", "cypress"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Package Configuration
```json
{
  "name": "pos-pwa-retail",
  "version": "1.0.0",
  "description": "Offline-first POS system with ERPNext integration",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "cypress run",
    "test:e2e:open": "cypress open",
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "type-check": "tsc --noEmit",
    "pwa:generate": "workbox generateSW workbox-config.js"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "dexie": "^3.2.4",
    "zustand": "^4.3.2",
    "@tanstack/react-query": "^4.24.4",
    "workbox-window": "^6.5.4",
    "frappe-js-sdk": "^2.4.5",
    "zod": "^3.20.2",
    "date-fns": "^2.29.3",
    "react-window": "^1.8.8",
    "react-hot-toast": "^2.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.27",
    "@types/react-dom": "^18.0.10",
    "@vitejs/plugin-react": "^3.1.0",
    "cypress": "^12.6.0",
    "eslint": "^8.34.0",
    "jest": "^29.4.2",
    "typescript": "^4.9.5",
    "vite": "^4.1.1",
    "vite-plugin-pwa": "^0.14.4"
  }
}
```

---

## 7. Testing Strategy & Quality Assurance

### Testing Philosophy & Principles

#### Core Testing Principles
- **Performance First**: Every test must validate <100ms scan time, <200ms search response
- **Reliability Under Failure**: System must work correctly when everything goes wrong
- **Data Integrity**: No data loss or corruption under any scenario
- **User Experience**: Cashier workflow must remain smooth under stress
- **Compliance**: All business-critical actions must be auditable

#### Testing Pyramid
```
                    /\
                   /  \
                  / E2E \
                 /______\
                /        \
               / Integration \
              /______________\
             /                \
            /     Unit Tests   \
           /____________________\
```

**Unit Tests (70%)**: Business logic, pricing engine, data validation  
**Integration Tests (20%)**: Database operations, API integration, sync mechanisms  
**E2E Tests (10%)**: Complete POS workflows, failure scenarios, stress testing

### Performance Testing

#### Scan Performance Testing
```typescript
class PerformanceTester {
  async runScanPerformanceTest(test: ScanPerformanceTest): Promise<TestResult> {
    const results: PerformanceResult[] = [];
    
    for (const scenario of test.testScenarios) {
      // Setup test database with items
      await this.setupTestData(scenario.itemCount);
      
      // Measure scan performance
      const scanResults = await this.measureScanPerformance(scenario);
      
      // Validate results
      const validation = this.validatePerformance(scanResults, scenario.expectedResult);
      
      results.push(scanResults);
    }
    
    return {
      testName: test.testName,
      results,
      overallPass: results.every(r => this.isPerformanceValid(r, test.expectedMaxTime))
    };
  }
}
```

#### Network Interruption Testing
```typescript
class NetworkTester {
  async runNetworkInterruptionTest(test: NetworkInterruptionTest): Promise<TestResult> {
    // Backup original fetch
    this.originalFetch = globalThis.fetch;
    
    try {
      // Setup network simulation
      await this.setupNetworkSimulation();
      
      const results: TestResult[] = [];
      
      for (const pattern of test.interruptionPatterns) {
        const result = await this.testInterruptionPattern(pattern);
        results.push(result);
      }
      
      return {
        testName: test.testName,
        results,
        overallPass: results.every(r => r.passed)
      };
    } finally {
      // Restore original fetch
      globalThis.fetch = this.originalFetch;
    }
  }
}
```

### Blueprint Stress Tests

#### POS Stress Test (Blueprint Requirement)
```typescript
const blueprintStressTests: StressTest[] = [
  {
    testName: 'Blueprint Required Stress Tests',
    blueprintRequirement: '400 scanning beruntun, network on/off setiap 3 transaksi, shutdown browser saat transaksi 80% selesai',
    testScenarios: [
      {
        name: '400 Consecutive Barcode Scans',
        duration: 2,
        concurrentUsers: 1,
        transactionsPerUser: 400,
        networkConditions: 'intermittent',
        performanceTargets: {
          maxScanTime: 100, // ms
          maxSearchTime: 200, // ms
          successRate: 99.9,
          memoryStability: 'no_leaks'
        }
      },
      {
        name: 'Network Interruption Every 3 Transactions',
        duration: 10,
        concurrentUsers: 2,
        transactionsPerUser: 50,
        networkConditions: 'intermittent',
        performanceTargets: {
          maxScanTime: 100,
          maxSearchTime: 200,
          successRate: 99.0,
          dataIntegrity: 100
        }
      },
      {
        name: 'Crash Recovery at 80% Completion',
        duration: 5,
        concurrentUsers: 1,
        transactionsPerUser: 100,
        networkConditions: 'normal',
        performanceTargets: {
          crashRecoveryTime: 3000, // 3 seconds max
          dataRecoveryRate: 100,
          transactionIntegrity: 100
        }
      }
    ]
  }
];
```

### Security Testing

#### Anti-Fraud Testing
```typescript
class SecurityTester {
  async runSecurityTests(test: SecurityTest): Promise<SecurityResult> {
    const results: AttackTestResult[] = [];
    
    for (const vector of test.attackVectors) {
      const result = await this.testAttackVector(vector);
      results.push(result);
    }
    
    return {
      testName: test.testName,
      results,
      overallSecurity: this.calculateOverallSecurity(results)
    };
  }
  
  private async testPriceOverrideAbuse(): Promise<void> {
    // Attempt multiple price overrides without approval
    const attempts = [
      { itemId: 'ITEM001', overridePrice: 1, reason: 'Test' },
      { itemId: 'ITEM001', overridePrice: 0.5, reason: 'Test' },
      { itemId: 'ITEM001', overridePrice: 0.01, reason: 'Test' }
    ];
    
    for (const attempt of attempts) {
      const result = await this.attemptPriceOverride(attempt);
      
      // Should be blocked or require supervisor approval
      if (result.requiresAuth && !result.authenticated) {
        console.log(`✅ Override blocked: ${attempt.overridePrice}`);
      } else if (result.logged) {
        console.log(`⚠️ Override logged but not blocked`);
      }
    }
  }
}
```

### Automated Testing Pipeline
```yaml
# .github/workflows/pos-testing.yml
name: POS PWA Testing Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test -- --coverage

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      - name: Start test server
        run: npm run preview &
      
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true

  stress-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      - run: npm run build
      - name: Run blueprint stress tests
        run: npm run test:stress
        env:
          STRESS_TEST_MODE: blueprint
          PERFORMANCE_THRESHOLD: strict
```

---

## 8. Deployment Strategy & Operations

### Deployment Architecture

#### PWA Deployment Model
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Static CDN    │    │   Edge Servers   │    │   Client Devices │
│                 │◄──►│                 │◄──►│                 │
│ - CloudFlare    │    │ - Geographic     │    │ - Chrome-based  │
│ - AWS CloudFront│    │   Distribution   │    │ - PWA Install   │
│ - Azure CDN     │    │ - Auto Failover  │    │ - Service Worker│
│ - Vercel        │    │ - Load Balancing │    │ - Offline Cache │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Device Compatibility Strategy

#### Minimum Hardware Requirements
```typescript
interface DeviceRequirements {
  minimum: {
    ram: '4GB';              // From blueprint
    storage: '2GB_free';     // For offline data
    cpu: 'Dual_core_1.5GHz'; // Modern x64/ARM64
    network: 'WiFi_802.11n'; // Stable connection
    display: '1024x768';     // Minimum resolution
    os: {
      windows: '10_or_later';
      android: '8_or_later';
      chromeos: 'any_version';
      macos: '10.14_or_later';
    };
  };
  recommended: {
    ram: '8GB';
    storage: '5GB_free';
    cpu: 'Quad_core_2.0GHz';
    network: 'Gigabit_Ethernet_or_WiFi_6';
    display: '1920x1080';
  };
  optimal: {
    ram: '16GB';
    storage: '10GB_free';
    cpu: 'Modern_multi_core';
    network: 'Wired_connection';
    display: '1920x1080_or_higher';
    barcode_scanner: 'USB_HID_scanner';
    receipt_printer: 'ESC/POS_compatible';
  };
}
```

#### Browser Compatibility Matrix
```typescript
interface BrowserSupport {
  chrome: {
    versions: '90+';         // Latest 2 major versions
    platforms: ['windows', 'macos', 'linux', 'chromeos', 'android'];
    features: {
      service_worker: true;
      indexeddb: true;
      webauthn: true;
      barcode_scanner: true;
      camera_api: true;
      web_audio: true;
    };
    limitations: ['no_internet_explorer_support'];
  };
  
  edge: {
    versions: '90+';         // Chromium-based Edge
    platforms: ['windows', 'macos'];
    features: {
      service_worker: true;
      indexeddb: true;
      webauthn: true;
      barcode_scanner: true;
      camera_api: true;
    };
    notes: 'Chromium-based only, legacy Edge not supported';
  };
  
  safari: {
    versions: '14+';
    platforms: ['macos', 'ios'];
    features: {
      service_worker: true;
      indexeddb: true;
      webauthn: false;      // Limited support
      barcode_scanner: true;
      camera_api: true;
    };
    limitations: ['reduced_pwa_features', 'no_push_notifications'];
  };
}
```

### PWA Installation & Updates

#### Installation Strategy
```typescript
class PWAInstaller {
  private deferredPrompt: any = null;
  
  async setupInstallationPrompt(): Promise<void> {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      
      // Show custom install UI after user has used the app
      this.showInstallPromotion();
    });
    
    // Track installation
    window.addEventListener('appinstalled', (evt) => {
      this.trackInstallation('installed');
    });
  }
  
  async promptInstallation(): Promise<InstallResult> {
    if (!this.deferredPrompt) {
      return { success: false, reason: 'install_prompt_not_available' };
    }
    
    try {
      // Show the install prompt
      const result = await this.deferredPrompt.prompt();
      
      const outcome = result.outcome; // accepted or dismissed
      
      return {
        success: outcome === 'accepted',
        reason: outcome === 'accepted' ? 'user_accepted' : 'user_dismissed',
        platform: this.getPlatform()
      };
    } catch (error) {
      return { success: false, reason: 'error', error: error.message };
    } finally {
      this.deferredPrompt = null;
    }
  }
}
```

### Hardware Integration

#### Barcode Scanner Support
```typescript
class BarcodeScannerManager {
  private scanners: BarcodeScanner[] = [];
  private eventListeners: Map<string, EventListener> = new Map();
  
  async initializeScanners(): Promise<void> {
    // WebUSB scanners
    if ('usb' in window) {
      await this.setupWebUSBScanners();
    }
    
    // HID scanners (most common)
    await this.setupHIDScanners();
    
    // Camera-based scanning
    if (this.hasCamera()) {
      await this.setupCameraScanners();
    }
    
    // Keyboard wedge scanners (fallback)
    this.setupKeyboardWedgeScanners();
  }
  
  private async setupHIDScanners(): Promise<void> {
    // HID devices don't require explicit permission
    // They work as keyboard input
    const keyboardScanner = new KeyboardWedgeScanner();
    await keyboardScanner.initialize({
      prefixes: ['[SCAN]'],    // Common scanner prefix
      suffixes: ['[ENTER]'],   // Common scanner suffix
      minLength: 8,           // Minimum barcode length
      timeout: 100            // Timeout between keystrokes
    });
    
    this.scanners.push(keyboardScanner);
  }
}
```

### Monitoring & Maintenance

#### Real-time Monitoring
```typescript
class POSMonitoring {
  private metrics: PerformanceMetrics = {
    scanTimes: [],
    searchTimes: [],
    errorCounts: new Map(),
    syncSuccess: 0,
    syncFailures: 0
  };
  
  trackScan(barcode: string, duration: number): void {
    this.metrics.scanTimes.push(duration);
    
    // Alert if performance degrades
    if (duration > 100) {
      this.alert('Performance degradation detected', { barcode, duration });
    }
    
    // Keep only last 1000 measurements
    if (this.metrics.scanTimes.length > 1000) {
      this.metrics.scanTimes.shift();
    }
  }
  
  trackSync(success: boolean, error?: string): void {
    if (success) {
      this.metrics.syncSuccess++;
    } else {
      this.metrics.syncFailures++;
      
      if (error) {
        const count = this.metrics.errorCounts.get(error) || 0;
        this.metrics.errorCounts.set(error, count + 1);
      }
    }
  }
}
```

---

## 9. API Reference & Research Materials

### ERPNext REST API Analysis

#### Core REST API Capabilities

##### Authentication Methods

**Token-Based Authentication (Recommended for POS)**
- **Endpoint**: Generate API Key/Secret in User Settings
- **Header**: `Authorization: token api_key:api_secret`
- **Benefits**: Stateless, role-based access, better security
- **Use Case**: Perfect for POS systems that need consistent user context

**Password-Based Authentication**
- **Endpoint**: `POST /api/method/login`
- **Method**: Session-based with cookies
- **Limitations**: Requires session management, less suitable for offline-first

##### CRUD Operations for All DocTypes

**Standard Endpoints**
```http
GET    /api/resource/{doctype}              # List documents
POST   /api/resource/{doctype}              # Create document
GET    /api/resource/{doctype}/{name}       # Get single document
PUT    /api/resource/{doctype}/{name}       # Update document
DELETE /api/resource/{doctype}/{name}       # Delete document
```

**Query Parameters**
- `fields=["field1", "field2"]` - Specify fields to fetch
- `expand=["link_field"]` - Expand linked documents
- `filters=[["field", "operator", "value"]]` - Filter records
- `or_filters=[["field", "operator", "value"]]` - OR filters
- `order_by=fieldname desc` - Sorting
- `limit_start=X&limit_page_length=Y` - Pagination
- `as_dict=False` - Return as arrays instead of objects
- `debug=True` - Query debugging

### DocType System Reference

#### Docstatus
Frappe uses the concept of a "Docstatus" to keep track of the status of transactions. The docstatus will always have one of the following three values:

- **Draft (value: 0)**
- **Submitted (value: 1)**  
- **Cancelled (value: 2)**

Documents that are _not submittable_ will always remain in the "draft" state. Documents that are _submittable_ can optionally proceed from the draft state to the "submitted", and then to the "cancelled" state.

#### Field Types

##### Data
The data field will be a simple text field. It allows you to enter a value of up to 140 characters, making this the most generic field type.

##### Link
Link field is connected to another master from where it fetches data. For example, in the Quotation master, the Customer is a Link field.

##### Check
This will enable you to have a checkbox here. You can set the Default value to 1 and it will be checked by default.

##### Select
Using the field type "Select", you can create a drop-down field. You can specify all selectable values in the Options field, each value separated by a new line.

##### Currency
Currency field holds numeric value, like Item Price, Amount, etc. Currency field can have value up to six decimal places.

##### Date and Time
This field will give you a date and time picker. The current date and time (as provided by your computer) are set by default.

#### Naming

All DocTypes in Frappe have a primary key called name. This is the unique id by which you will be finding records and manipulating them using the ORM.

##### DocType autoname
You can set the name by the autoname property of the DocType.

1. **field:[fieldname]** - The doc name is fetched from the value of the field provided.
2. **[series]** - You can provide a naming pattern which will be incremented automatically.
3. **naming_series:** - The naming pattern is derived from a field in the document.
4. **Prompt** - If you set it as Prompt, the name is required to be filled in manually.
5. **Format** - The most flexible one when it comes to configuring your naming schemes.

### API Integration Examples

#### ERPNext API Client
```typescript
// ERPNext API client with error handling
class ERPNextClient {
  private baseUrl: string;
  private auth: string;
  
  constructor(baseUrl: string, apiKey: string, apiSecret: string) {
    this.baseUrl = baseUrl;
    this.auth = btoa(`${apiKey}:${apiSecret}`);
  }
  
  async getItems(params: ItemQueryParams): Promise<Item[]> {
    try {
      const url = new URL(`${this.baseUrl}/api/resource/Item`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value.toString());
      });
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `token ${this.auth}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`ERPNext API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch items:', error);
      throw error;
    }
  }
  
  async createSalesInvoice(invoice: SalesInvoiceRequest): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/resource/Sales Invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invoice)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create sales invoice: ${error.message}`);
      }
      
      const data = await response.json();
      return data.data.name;
    } catch (error) {
      console.error('Failed to create sales invoice:', error);
      throw error;
    }
  }
}
```

---

## 10. Appendices & Supporting Documentation

### Emergency Procedures

#### Complete System Reset
```typescript
class EmergencyReset {
  async performFullReset(): Promise<void> {
    console.log('Initiating full system reset...');
    
    // 1. Backup current data
    await this.createEmergencyBackup();
    
    // 2. Clear all local data
    await this.clearAllData();
    
    // 3. Reinitialize application
    await this.reinitializeApp();
    
    // 4. Trigger full sync
    await this.triggerFullSync();
    
    console.log('System reset completed');
  }
  
  private async createEmergencyBackup(): Promise<void> {
    const backup = {
      timestamp: new Date(),
      data: await this.exportAllData(),
      metadata: await this.getSystemMetadata()
    };
    
    // Store backup securely
    await this.storeEmergencyBackup(backup);
  }
}
```

### Troubleshooting Guide

#### Common Issues & Solutions

##### 1. Slow Barcode Scanning
**Symptoms**: Scan time >100ms, user complaints about delay

**Solutions**:
- Clear IndexedDB cache and re-sync data
- Check for memory leaks in browser
- Verify barcode scanner configuration
- Restart browser/tab

##### 2. Sync Failures
**Symptoms**: Transactions not appearing in ERPNext, sync queue growing

**Solutions**:
- Check ERPNext API connectivity
- Verify API credentials
- Clear sync queue and retry
- Manual conflict resolution

##### 3. Data Corruption
**Symptoms**: Missing items, incorrect pricing, transaction errors

**Solutions**:
- Restore from ERPNext backup
- Re-sync all master data
- Clear local database and restart
- Contact support for severe corruption

### Performance Testing Scripts

#### Performance Test Runner
```typescript
class PerformanceTestRunner {
  async runScanPerformanceTest(): Promise<PerformanceResult> {
    const results: number[] = [];
    
    // Warm up database
    await this.warmUpDatabase();
    
    // Run 100 scan tests
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      
      // Simulate barcode scan
      const item = await this.simulateBarcodeScan();
      
      const duration = performance.now() - start;
      results.push(duration);
      
      // Validate item was found
      if (!item) {
        throw new Error(`Scan failed at iteration ${i}`);
      }
    }
    
    return {
      avgTime: results.reduce((a, b) => a + b) / results.length,
      maxTime: Math.max(...results),
      minTime: Math.min(...results),
      p95Time: this.calculatePercentile(results, 95),
      successRate: 100
    };
  }
  
  async runStressTest(): Promise<StressTestResult> {
    console.log('Starting stress test...');
    
    const startTime = Date.now();
    let transactions = 0;
    let errors = 0;
    
    // Run for 2 minutes
    while (Date.now() - startTime < 120000) {
      try {
        await this.simulateCompleteTransaction();
        transactions++;
      } catch (error) {
        errors++;
      }
      
      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      duration: Date.now() - startTime,
      transactions,
      errors,
      successRate: transactions / (transactions + errors) * 100
    };
  }
}
```

### Environment Configuration

#### Development Environment (.env.development)
```bash
VITE_ERPNEXT_URL=https://erp-dev.yourcompany.com
VITE_ERPNEXT_API_VERSION=v2
VITE_BRANCH_ID=dev-branch
VITE_DEBUG=true
VITE_MOCK_ERPNEXT=false
```

#### Production Environment (.env.production)
```bash
VITE_ERPNEXT_URL=https://erp.yourcompany.com
VITE_ERPNEXT_API_VERSION=v2
VITE_BRANCH_ID=${BRANCH_ID}
VITE_DEBUG=false
VITE_MOCK_ERPNEXT=false
```

### Database Schema Reference

#### Complete Database Schema
```typescript
const DATABASE_CONFIG = {
  version: SCHEMA_VERSION,
  stores: {
    items: {
      keyPath: 'id',
      indexes: [
        { name: 'by-barcode', keyPath: 'barcode', unique: true },
        { name: 'by-name', keyPath: 'name' },
        { name: 'by-category', keyPath: 'category' },
        { name: 'by-brand', keyPath: 'brand' },
        { name: 'by-updated', keyPath: 'updatedAt' }
      ]
    },
    pricingRules: {
      keyPath: 'id',
      indexes: [
        { name: 'by-priority', keyPath: 'priority' },
        { name: 'by-type', keyPath: 'ruleType' },
        { name: 'by-active', keyPath: 'isActive' },
        { name: 'by-updated', keyPath: 'updatedAt' }
      ]
    },
    salesQueue: {
      keyPath: 'id',
      indexes: [
        { name: 'by-status', keyPath: 'status' },
        { name: 'by-created', keyPath: 'createdAt' },
        { name: 'by-branch', keyPath: 'branchId' },
        { name: 'by-priority', keyPath: 'priority' }
      ]
    },
    auditLogs: {
      keyPath: 'id',
      indexes: [
        { name: 'by-timestamp', keyPath: 'timestamp' },
        { name: 'by-user', keyPath: 'userId' },
        { name: 'by-action', keyPath: 'action' },
        { name: 'by-branch', keyPath: 'branchId' }
      ]
    },
    syncStatus: {
      keyPath: 'id',
      indexes: [
        { name: 'by-last-sync', keyPath: 'lastSyncTime' }
      ]
    }
  }
};
```

---

## 📞 Contact & Support

### Development Team
- **Technical Lead**: [Contact Information]
- **Project Manager**: [Contact Information]
- **ERPNext Integration Specialist**: [Contact Information]
- **QA Lead**: [Contact Information]

### Emergency Contacts
- **24/7 Technical Support**: [Emergency Contact]
- **Business Hours Support**: [Business Contact]
- **Critical Issue Escalation**: [Escalation Contact]

### Resources
- **Development Documentation**: [Internal Wiki/Confluence]
- **API Documentation**: [ERPNext API Docs]
- **PWA Best Practices**: [Web.dev PWA Guide]
- **Browser Support**: [CanIUse.com]

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-29  
**Status**: Master Reference Document  
**Total Pages**: Comprehensive Implementation Guide

This consolidated document serves as the single source of truth for the entire POS PWA Retail System project, combining all technical specifications, implementation guides, and operational procedures into one comprehensive reference.