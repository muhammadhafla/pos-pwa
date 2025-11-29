// Core Types for POS PWA Retail System

export interface Item {
  id: string;
  name: string;
  barcode: string;
  additionalBarcodes: string[];
  basePrice: number;
  cost: number;
  category: string;
  unit: string;
  brand?: string;
  isActive: boolean;
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