/**
 * SalesInvoiceMapper - Maps POS transactions to ERPNext Sales Invoice format
 * Handles batch processing and transaction status tracking
 */

import { ERPNextClient } from './ERPNextClient';
import { POSDatabase } from '../database/POSDatabase';

export interface SalesInvoiceItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface SalesInvoiceTax {
  parentfield?: string;
  parenttype?: string;
  idx?: number;
  description: string;
  rate: number;
  account_head: string;
  tax_amount: number;
  charge_type:
    | 'On Net Total'
    | 'On Previous Row Amount'
    | 'On Previous Row Total'
    | 'On Paid Amount';
}

export interface SalesInvoicePayment {
  mode_of_payment: string;
  amount: number;
  account: string;
  reference_no?: string;
  reference_date?: string;
}

export interface SalesInvoiceRequest {
  company: string;
  customer?: string;
  customer_name?: string;
  branch: string;
  posting_date: string;
  posting_time: string;
  due_date?: string;
  items: SalesInvoiceItem[];
  taxes?: SalesInvoiceTax[];
  payments?: SalesInvoicePayment[];
  loyalty_points?: number;
  discounted_amount?: number;
  additional_discount_percentage?: number;
  additional_discount_amount?: number;
  apply_discount_on?: 'Grand Total' | 'Net Total';
  remarks?: string;
  pos_branch_id: string;
  pos_device_id: string;
  pos_transaction_id: string;
  pos_receipt_number: string;
  payment_breakdown?: PaymentBreakdown;
  pricing_rules_applied?: AppliedPricingRule[];
}

export interface SalesInvoiceResponse {
  name: string;
  status: string;
  creation: string;
  modified: string;
  modified_by: string;
  owner: string;
  docstatus: number;
}

export interface PaymentBreakdown {
  cash: number;
  card: number;
  eWallet: number;
  bankTransfer: number;
  qr: number;
  other: number;
}

export interface AppliedPricingRule {
  ruleName: string;
  ruleType: string;
  discountType: 'percentage' | 'fixed' | 'buy_x_get_y';
  discountValue: number;
  appliedItems: string[];
  appliedAt: Date;
}

export interface TransactionStatus {
  transactionId: string;
  receiptNumber: string;
  erpnextInvoiceName?: string;
  status: 'pending' | 'processing' | 'submitted' | 'cancelled' | 'error';
  createdAt: Date;
  syncedAt?: Date;
  errorMessage?: string;
  attempts: number;
  lastAttemptAt?: Date;
}

export interface BatchProcessingResult {
  batchId: string;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  processingTime: number;
  errors: Array<{
    transactionId: string;
    error: string;
    retryAfter?: Date;
  }>;
}

/**
 * SalesInvoiceMapper - Handles ERPNext Sales Invoice creation and tracking
 */
export class SalesInvoiceMapper {
  private erpNextClient: ERPNextClient;
  private db: POSDatabase;
  private statusTracking: Map<string, TransactionStatus> = new Map();
  private batchQueue: Map<string, SalesInvoiceRequest[]> = new Map();

  constructor(erpNextClient: ERPNextClient, db: POSDatabase) {
    this.erpNextClient = erpNextClient;
    this.db = db;
    this.initializeStatusTracking();
  }

  /**
   * Initialize status tracking from database
   */
  private async initializeStatusTracking(): Promise<void> {
    try {
      const auditLogs = await this.db.auditLogs
        .where('action')
        .equals('transaction_sync')
        .toArray();

      for (const log of auditLogs) {
        if (log.details?.posTransactionId && log.details?.syncStatus) {
          this.statusTracking.set(log.details.posTransactionId, {
            transactionId: log.details.posTransactionId,
            receiptNumber: log.details.posReceiptNumber || '',
            erpnextInvoiceName: log.details.erpnextInvoiceName,
            status: log.details.syncStatus as any,
            createdAt: log.timestamp,
            syncedAt: log.details.syncedAt,
            errorMessage: log.details.errors?.[0],
            attempts: log.details.attempts || 0,
            lastAttemptAt: log.timestamp,
          });
        }
      }

      console.log(`📊 Loaded ${this.statusTracking.size} transaction statuses`);
    } catch (error) {
      console.error('Failed to initialize status tracking:', error);
    }
  }

  /**
   * Map POS transaction to ERPNext Sales Invoice
   */
  mapToSalesInvoice(
    transaction: any,
    config: {
      company: string;
      branch: string;
      deviceId: string;
      customer?: string;
    }
  ): SalesInvoiceRequest {
    const { company, branch, deviceId, customer } = config;

    // Map items
    const items: SalesInvoiceItem[] = transaction.items.map((item: any) => ({
      item_code: item.itemId,
      item_name: item.itemName,
      qty: item.quantity,
      rate: item.unitPrice,
      amount: item.totalPrice,
    }));

    // Calculate taxes (simplified - should use actual tax rules)
    const taxes: SalesInvoiceTax[] = this.calculateTaxes(transaction);

    // Map payments
    const payments: SalesInvoicePayment[] = this.mapPayments(transaction.paymentBreakdown);

    // Build invoice request
    const invoiceRequest: SalesInvoiceRequest = {
      company,
      customer: customer,
      customer_name: transaction.customerName,
      branch,
      posting_date: transaction.createdAt.toISOString().split('T')[0],
      posting_time: transaction.createdAt.toTimeString().split(' ')[0],
      due_date: transaction.dueDate?.toISOString().split('T')[0],
      items,
      taxes,
      payments,
      loyalty_points: transaction.loyaltyPoints,
      discounted_amount: transaction.discountAmount,
      additional_discount_percentage:
        transaction.discountAmount > 0
          ? (transaction.discountAmount / transaction.subtotalAmount) * 100
          : 0,
      additional_discount_amount: transaction.discountAmount,
      apply_discount_on: 'Grand Total',
      remarks: `POS Transaction: ${transaction.receiptNumber} - ${transaction.items.length} items`,
      pos_branch_id: branch,
      pos_device_id: deviceId,
      pos_transaction_id: transaction.id,
      pos_receipt_number: transaction.receiptNumber,
      payment_breakdown: transaction.paymentBreakdown,
      pricing_rules_applied: transaction.appliedPricingRules,
    };

    return invoiceRequest;
  }

  /**
   * Create Sales Invoice in ERPNext
   */
  async createSalesInvoice(
    transaction: any,
    config: {
      company: string;
      branch: string;
      deviceId: string;
      customer?: string;
    }
  ): Promise<{ success: boolean; invoiceName?: string; error?: string }> {
    const transactionId = transaction.id;
    const receiptNumber = transaction.receiptNumber;

    try {
      // Update status to processing
      this.updateTransactionStatus(transactionId, {
        status: 'processing',
        attempts: this.getCurrentAttempts(transactionId) + 1,
        lastAttemptAt: new Date(),
      });

      // Map transaction to invoice
      const invoiceRequest = this.mapToSalesInvoice(transaction, config);

      console.log(`📄 Creating Sales Invoice for transaction ${receiptNumber}...`);

      // Create invoice in ERPNext
      const response = await this.erpNextClient.createSalesInvoice(invoiceRequest);

      if (response.success && response.data) {
        const invoiceName = response.data.name;

        // Update status to submitted
        this.updateTransactionStatus(transactionId, {
          status: 'submitted',
          erpnextInvoiceName: invoiceName,
          syncedAt: new Date(),
          errorMessage: undefined,
        });

        // Log to audit trail
        await this.logTransactionSync(transactionId, 'submitted', invoiceName, []);

        console.log(`✅ Sales Invoice created successfully: ${invoiceName}`);
        return { success: true, invoiceName };
      } else {
        throw new Error('Invalid response from ERPNext');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update status to error
      this.updateTransactionStatus(transactionId, {
        status: 'error',
        errorMessage,
        lastAttemptAt: new Date(),
      });

      // Log to audit trail
      await this.logTransactionSync(transactionId, 'error', undefined, [errorMessage]);

      console.error(`❌ Failed to create Sales Invoice for ${receiptNumber}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId: string): TransactionStatus | undefined {
    return this.statusTracking.get(transactionId);
  }

  /**
   * Update transaction status
   */
  private updateTransactionStatus(
    transactionId: string,
    updates: Partial<TransactionStatus>
  ): void {
    const existing = this.statusTracking.get(transactionId) || {
      transactionId,
      receiptNumber: '',
      status: 'pending' as const,
      createdAt: new Date(),
      attempts: 0,
    };

    const updated = { ...existing, ...updates };
    this.statusTracking.set(transactionId, updated);
  }

  /**
   * Get current attempts for transaction
   */
  private getCurrentAttempts(transactionId: string): number {
    return this.statusTracking.get(transactionId)?.attempts ?? 0;
  }

  /**
   * Log transaction sync to audit trail
   */
  private async logTransactionSync(
    transactionId: string,
    status: string,
    erpnextInvoiceName?: string,
    errors: string[] = []
  ): Promise<void> {
    try {
      await this.db.auditLogs.add({
        id: `sync_${transactionId}_${Date.now()}`,
        timestamp: new Date(),
        userId: 'system',
        userRole: 'system',
        action: 'transaction_sync',
        resourceType: 'SalesTransaction',
        resourceId: transactionId,
        details: {
          posTransactionId: transactionId,
          syncStatus: status,
          erpnextInvoiceName,
          errors,
          syncedAt: status === 'submitted' ? new Date() : undefined,
          attempts: this.getCurrentAttempts(transactionId),
        },
        ipAddress: undefined,
        deviceId: 'system',
      });
    } catch (error) {
      console.error('Failed to log transaction sync:', error);
    }
  }

  /**
   * Calculate taxes for transaction
   */
  private calculateTaxes(transaction: any): SalesInvoiceTax[] {
    const taxes: SalesInvoiceTax[] = [];
    const totalTax = transaction.taxAmount || 0;

    if (totalTax > 0) {
      taxes.push({
        description: 'Sales Tax',
        rate: 10, // This should come from tax configuration
        account_head: 'Sales Tax - TC',
        tax_amount: totalTax,
        charge_type: 'On Net Total',
      });
    }

    return taxes;
  }

  /**
   * Map payment breakdown to ERPNext format
   */
  private mapPayments(paymentBreakdown: PaymentBreakdown): SalesInvoicePayment[] {
    const payments: SalesInvoicePayment[] = [];

    if (paymentBreakdown.cash > 0) {
      payments.push({
        mode_of_payment: 'Cash',
        amount: paymentBreakdown.cash,
        account: 'Cash - TC',
      });
    }

    if (paymentBreakdown.card > 0) {
      payments.push({
        mode_of_payment: 'Credit Card',
        amount: paymentBreakdown.card,
        account: 'Bank - TC',
      });
    }

    if (paymentBreakdown.eWallet > 0) {
      payments.push({
        mode_of_payment: 'E-Wallet',
        amount: paymentBreakdown.eWallet,
        account: 'Bank - TC',
      });
    }

    if (paymentBreakdown.bankTransfer > 0) {
      payments.push({
        mode_of_payment: 'Bank Transfer',
        amount: paymentBreakdown.bankTransfer,
        account: 'Bank - TC',
      });
    }

    if (paymentBreakdown.qr > 0) {
      payments.push({
        mode_of_payment: 'QR Payment',
        amount: paymentBreakdown.qr,
        account: 'Bank - TC',
      });
    }

    if (paymentBreakdown.other > 0) {
      payments.push({
        mode_of_payment: 'Other',
        amount: paymentBreakdown.other,
        account: 'Cash - TC',
      });
    }

    return payments;
  }
}
