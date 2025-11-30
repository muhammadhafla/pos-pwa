// Core Types for POS PWA Retail System

// Hierarchical Category System
export interface Category {
  id: string;
  name: string;
  parentId?: string;
  level: number;
  displayOrder: number;
  isActive: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  children?: Category[]; // For tree structure
}

// Supplier Management
export interface Supplier {
  id: string;
  name: string;
  code?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Tag System
export interface ItemTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  category?: string; // For grouping related tags
  createdAt: Date;
  updatedAt: Date;
}

export interface Item {
  id: string;
  name: string;
  barcode: string;
  additionalBarcodes: string[];
  basePrice: number;
  cost: number;
  category: string; // Category ID
  categoryName?: string; // Denormalized category name for display
  unit: string;
  brand?: string;
  supplierId?: string; // Supplier ID
  supplierName?: string; // Denormalized supplier name for display
  tags: string[]; // Array of tag IDs
  isActive: boolean;
  stock?: {
    current: number;
    minimum: number;
    maximum: number;
  };
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

export interface PricingRule {
  id: string;
  name: string;
  priority: number;
  ruleType: PricingRuleType;
  discountType: DiscountType;
  discountValue: number;
  applicableBranches: string[];
  conditions: PricingCondition[];
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingCondition {
  field: string;
  operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | number;
}

export type PricingRuleType = 'item' | 'category' | 'brand' | 'customer' | 'quantity' | 'time' | 'branch' | 'global';
export type DiscountType = 'percentage' | 'fixed_amount' | 'free_item';

export interface CartItem {
  id: string;
  itemId: string;
  itemName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  finalPrice: number;
  metadata?: Record<string, any>; // For storing pricing rules and other data
}

export interface SalesTransaction {
  id: string;
  branchId: string;
  cashierId: string;
  customerId?: string;
  items: CartItem[];
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: PaymentBreakdown;
  status: TransactionStatus;
  receiptNumber: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
  erpnextDocType?: string;
  erpnextDocName?: string;
}

export interface PaymentBreakdown {
  cash: number;
  card: number;
  ewallet: number;
  bankTransfer: number;
  credit: number;
  totalPayment?: number;
  change?: number;
}

export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'synced';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  branchId: string;
  isActive: boolean;
  lastLoginAt?: Date;
  permissions: Permission[];
}

export type UserRole = 'admin' | 'manager' | 'cashier' | 'supervisor';

export interface Permission {
  resource: string;
  actions: string[];
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  userRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress?: string;
  deviceId?: string;
}

export interface SyncStatus {
  id: string;
  lastSyncTime: Date;
  pendingTransactions: number;
  pendingItems: number;
  lastError?: string;
  isOnline: boolean;
}

export interface NetworkStatus {
  isOnline: boolean;
  connectionType: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  effectiveType?: '2g' | '3g' | '4g' | '5g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
}

export interface PerformanceMetrics {
  scanTimes: number[];
  searchTimes: number[];
  appStartupTime?: number;
  lastUpdate: Date;
}

export interface PriceOverride {
  id: string;
  itemId: string;
  originalPrice: number;
  newPrice: number;
  reason: string;
  supervisorId: string;
  timestamp: Date;
}

export interface ReturnTransaction {
  id: string;
  originalTransactionId: string;
  items: CartItem[];
  totalRefundAmount: number;
  reason: string;
  approvedBy: string;
  createdAt: Date;
}

// Advanced Filtering System
export interface AdvancedFilters {
  categories?: string[]; // Category IDs
  brands?: string[];
  suppliers?: string[];
  tags?: string[]; // Tag IDs
  priceRange?: { min: number; max: number };
  stockStatus?: 'in-stock' | 'low-stock' | 'out-of-stock' | 'all';
  hasBarcode?: boolean;
  isActive?: boolean;
  searchText?: string;
}

export interface FilterOptions {
  categories: Category[];
  brands: string[];
  suppliers: Supplier[];
  tags: ItemTag[];
  priceRange: { min: number; max: number };
  stockCounts: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
}

// Transaction State Management
export interface TransactionState {
  id: string;
  status: TransactionStateStatus;
  currentStep: TransactionStep;
  stepData: Record<TransactionStep, any>;
  validationErrors: Record<string, string[]>;
  lastUpdated: Date;
  startedAt: Date;
  expiresAt?: Date;
}

export type TransactionStateStatus = 'active' | 'suspended' | 'completed' | 'cancelled' | 'error';
export type TransactionStep = 'items' | 'pricing' | 'payment' | 'confirmation' | 'printing';

// Split Payment System
export interface SplitPayment {
  id: string;
  transactionId: string;
  paymentMethods: PaymentMethodAllocation[];
  totalAmount: number;
  totalAllocated: number;
  status: SplitPaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethodAllocation {
  method: PaymentMethod;
  amount: number;
  reference?: string; // For card transactions, QR codes, etc.
  processingFee?: number;
}

export type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'bank_transfer' | 'credit' | 'qris';
export type SplitPaymentStatus = 'pending' | 'partial' | 'complete' | 'failed';

// Receipt Template System
export interface ReceiptTemplate {
  id: string;
  name: string;
  type: ReceiptTemplateType;
  layout: ReceiptLayout;
  content: ReceiptContent;
  customizations: ReceiptCustomization;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ReceiptTemplateType = 'standard' | 'thermal' | 'a4' | 'custom';

export interface ReceiptLayout {
  width: number; // in characters for thermal, mm for others
  height?: number;
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface ReceiptContent {
  header: ReceiptSection;
  items: ReceiptSection;
  totals: ReceiptSection;
  footer: ReceiptSection;
  customSections: ReceiptSection[];
}

export interface ReceiptSection {
  enabled: boolean;
  content: string;
  formatting: TextFormatting;
  alignment: 'left' | 'center' | 'right';
}

export interface ReceiptCustomization {
  logo?: {
    enabled: boolean;
    url: string;
    position: 'center' | 'left' | 'right';
    size: number; // percentage of width
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  fonts: {
    header: string;
    body: string;
    footer: string;
  };
}

export interface TextFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  color?: string;
}

// Return/Refund Processing
export interface ReturnValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  refundableAmount: number;
  refundableItems: CartItem[];
  maxReturnDate: Date;
}

export interface ReceiptLookup {
  receiptNumber: string;
  barcode?: string;
  amount?: number;
  date?: Date;
}