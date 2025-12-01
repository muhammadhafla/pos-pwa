/**
 * Return & Refund Processing Manager
 * Handles return transactions with validation and audit trails
 * Implements 7-day return policy with comprehensive validation
 */

import { toast } from 'react-hot-toast';
import { db } from '@/services/database/POSDatabase';
import { PaymentBreakdown as _PaymentBreakdown } from '@/types';

export interface ReturnItem {
  originalTransactionItemId: string;
  itemId: string;
  name: string;
  barcode: string;
  quantityToReturn: number;
  unitPrice: number;
  totalPrice: number;
  returnReason: string;
  condition: 'new' | 'good' | 'damaged' | 'defective';
}

export interface ReturnTransaction {
  id: string;
  originalTransactionId: string;
  returnTransactionNumber: string;
  returnDate: Date;
  returnReason: string;
  processedBy: string; // cashier user ID
  approvedBy?: string; // supervisor user ID (if approval required)
  status: 'pending' | 'approved' | 'processed' | 'rejected';
  items: ReturnItem[];
  refundAmount: number;
  refundMethod: 'cash' | 'original_payment';
  originalPaymentMethod?: string;
  notes?: string;
  requiresApproval: boolean;
  validationResults: ReturnValidationResult[];
}

export interface ReturnValidationResult {
  rule: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ReceiptLookupResult {
  transaction: any;
  items: any[];
  payments: any[];
  customer?: any;
  validationStatus: {
    canReturn: boolean;
    daysSincePurchase: number;
    isWithinReturnPeriod: boolean;
    totalReturnable: number;
  };
}

export interface RefundRequest {
  transactionId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    reason: string;
    condition: ReturnItem['condition'];
  }>;
  refundMethod: 'cash' | 'original_payment';
  notes?: string;
  requireSupervisorApproval?: boolean;
}

export interface RefundAuthorization {
  supervisorPin: string;
  reason: string;
  authorizedBy: string;
  authorizedAt: Date;
}

export class ReturnRefundManager {
  private readonly RETURN_PERIOD_DAYS = 7;
  private readonly MAX_RETURN_AMOUNT = 1000000; // Rp 1,000,000 maximum return

  /**
   * Lookup transaction by receipt number or barcode
   */
  async lookupTransaction(
    receiptNumber?: string,
    barcode?: string,
    phoneNumber?: string
  ): Promise<ReceiptLookupResult | null> {
    try {
      let transaction: any = null;

      // Try to find transaction by receipt number first
      if (receiptNumber) {
        transaction = await db.getTransactionByReceiptNumber(receiptNumber);
      }

      // If not found and barcode provided, search for transactions containing this barcode
      if (!transaction && barcode) {
        const transactions = await db.findTransactionsByBarcode(barcode);
        if (transactions.length > 0) {
          // Return the most recent transaction with this barcode
          transaction = transactions[0];
        }
      }

      // If still not found and phone number provided, try customer phone lookup
      if (!transaction && phoneNumber) {
        const transactions = await db.getTransactionsByCustomerPhone(phoneNumber);
        if (transactions.length > 0) {
          transaction = transactions[0];
        }
      }

      // If still no transaction found, return null
      if (!transaction) {
        return null;
      }

      // Calculate validation status
      const transactionDate = new Date(transaction.createdAt);
      const currentDate = new Date();
      const daysSincePurchase = Math.floor(
        (currentDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isWithinReturnPeriod = daysSincePurchase <= this.RETURN_PERIOD_DAYS;
      const totalReturnable = transaction.items.reduce(
        (sum: number, item: any) => sum + item.totalPrice,
        0
      );

      const validationStatus = {
        canReturn: isWithinReturnPeriod && totalReturnable > 0,
        daysSincePurchase,
        isWithinReturnPeriod,
        totalReturnable,
      };

      return {
        transaction,
        items: transaction.items,
        payments: transaction.paymentBreakdown || [],
        customer: transaction.customerId
          ? { id: transaction.customerId, name: transaction.customerName }
          : undefined,
        validationStatus,
      };
    } catch (error) {
      console.error('Transaction lookup failed:', error);
      throw new Error(`Failed to lookup transaction: ${error}`);
    }
  }

  /**
   * Validate return request against business rules
   */
  async validateReturnRequest(
    originalTransaction: any,
    returnItems: ReturnItem[]
  ): Promise<ReturnValidationResult[]> {
    const results: ReturnValidationResult[] = [];

    try {
      // Check return period (7 days)
      const transactionDate = new Date(originalTransaction.timestamp);
      const currentDate = new Date();
      const daysSincePurchase = Math.floor(
        (currentDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      results.push({
        rule: 'return_period',
        passed: daysSincePurchase <= this.RETURN_PERIOD_DAYS,
        message:
          daysSincePurchase <= this.RETURN_PERIOD_DAYS
            ? `Return within ${this.RETURN_PERIOD_DAYS}-day period`
            : `Return period expired (${daysSincePurchase} days ago)`,
        severity: daysSincePurchase <= this.RETURN_PERIOD_DAYS ? 'info' : 'error',
      });

      // Check if transaction exists and is completed
      if (!originalTransaction || originalTransaction.status !== 'completed') {
        results.push({
          rule: 'transaction_status',
          passed: false,
          message: 'Original transaction must be completed',
          severity: 'error',
        });
      } else {
        results.push({
          rule: 'transaction_status',
          passed: true,
          message: 'Original transaction is valid',
          severity: 'info',
        });
      }

      // Check if items exist in original transaction
      returnItems.forEach(returnItem => {
        const originalItem = originalTransaction.items.find(
          (item: any) => item.id === returnItem.originalTransactionItemId
        );

        if (!originalItem) {
          results.push({
            rule: 'item_exists',
            passed: false,
            message: `Item "${returnItem.name}" not found in original transaction`,
            severity: 'error',
          });
        } else {
          // Check quantity
          if (returnItem.quantityToReturn > originalItem.quantity) {
            results.push({
              rule: 'quantity_valid',
              passed: false,
              message: `Cannot return ${returnItem.quantityToReturn} of "${returnItem.name}" (only ${originalItem.quantity} purchased)`,
              severity: 'error',
            });
          } else {
            results.push({
              rule: 'quantity_valid',
              passed: true,
              message: `Quantity valid for "${returnItem.name}"`,
              severity: 'info',
            });
          }

          // Check price consistency
          if (Math.abs(returnItem.unitPrice - originalItem.unitPrice) > 0.01) {
            results.push({
              rule: 'price_consistency',
              passed: false,
              message: `Price mismatch for "${returnItem.name}" (original: ${originalItem.unitPrice}, return: ${returnItem.unitPrice})`,
              severity: 'warning',
            });
          } else {
            results.push({
              rule: 'price_consistency',
              passed: true,
              message: `Price consistent for "${returnItem.name}"`,
              severity: 'info',
            });
          }
        }
      });

      // Check total return amount
      const totalReturnAmount = returnItems.reduce(
        (sum, item) => sum + item.totalPrice * item.quantityToReturn,
        0
      );

      if (totalReturnAmount > this.MAX_RETURN_AMOUNT) {
        results.push({
          rule: 'max_amount',
          passed: false,
          message: `Return amount (${totalReturnAmount}) exceeds maximum allowed (${this.MAX_RETURN_AMOUNT})`,
          severity: 'error',
        });
      } else {
        results.push({
          rule: 'max_amount',
          passed: true,
          message: `Return amount within limits`,
          severity: 'info',
        });
      }

      // Check for supervisor approval requirement
      const requiresApproval = this.requiresSupervisorApproval(returnItems, totalReturnAmount);
      results.push({
        rule: 'supervisor_approval',
        passed: !requiresApproval, // Pass if no approval needed
        message: requiresApproval
          ? 'Supervisor approval required for this return'
          : 'No supervisor approval required',
        severity: requiresApproval ? 'warning' : 'info',
      });

      // Check return reason validity
      const validReasons = [
        'wrong_item',
        'damaged',
        'defective',
        'changed_mind',
        'duplicate_purchase',
        'other',
      ];
      returnItems.forEach(item => {
        const isValidReason = validReasons.includes(item.returnReason);
        results.push({
          rule: 'return_reason',
          passed: isValidReason,
          message: isValidReason
            ? `Valid return reason for "${item.name}"`
            : `Invalid return reason for "${item.name}"`,
          severity: isValidReason ? 'info' : 'warning',
        });
      });

      return results;
    } catch (error) {
      console.error('Return validation failed:', error);
      return [
        {
          rule: 'validation_error',
          passed: false,
          message: `Validation error: ${error}`,
          severity: 'error',
        },
      ];
    }
  }

  /**
   * Process return request
   */
  async processReturn(
    request: RefundRequest,
    authorization?: RefundAuthorization
  ): Promise<ReturnTransaction> {
    try {
      // Generate return transaction ID
      const returnTransactionId = `return-${request.transactionId}-${Date.now()}`;
      const returnTransactionNumber = this.generateReturnTransactionNumber();

      // Lookup original transaction
      const originalTransaction = await db.getTransactionByReceiptNumber(request.transactionId);
      if (!originalTransaction) {
        throw new Error('Original transaction not found');
      }

      // Create return items
      const returnItems: ReturnItem[] = request.items.map(item => {
        const originalItem = originalTransaction.items.find((i: any) => i.id === item.itemId);
        if (!originalItem) {
          throw new Error(`Item ${item.itemId} not found in original transaction`);
        }

        return {
          originalTransactionItemId: item.itemId,
          itemId: originalItem.itemId,
          name: originalItem.itemName,
          barcode: originalItem.barcode,
          quantityToReturn: item.quantity,
          unitPrice: originalItem.unitPrice,
          totalPrice: originalItem.totalPrice,
          returnReason: item.reason,
          condition: item.condition,
        };
      });

      // Validate return request
      const validationResults = await this.validateReturnRequest(originalTransaction, returnItems);
      const hasErrors = validationResults.some(
        result => !result.passed && result.severity === 'error'
      );

      if (hasErrors) {
        const errorMessages = validationResults
          .filter(result => !result.passed && result.severity === 'error')
          .map(result => result.message)
          .join('; ');
        throw new Error(`Return validation failed: ${errorMessages}`);
      }

      // Check if supervisor approval is needed
      const totalReturnAmount = returnItems.reduce(
        (sum, item) => sum + item.totalPrice * item.quantityToReturn,
        0
      );
      const requiresApproval = this.requiresSupervisorApproval(returnItems, totalReturnAmount);

      if (requiresApproval && !authorization) {
        throw new Error('Supervisor authorization required for this return');
      }

      // Create return transaction
      const returnTransaction: ReturnTransaction = {
        id: returnTransactionId,
        originalTransactionId: request.transactionId,
        returnTransactionNumber,
        returnDate: new Date(),
        returnReason: request.notes ?? 'Customer return',
        processedBy: 'current-user', // TODO: Get from auth context
        approvedBy: authorization?.authorizedBy,
        status: 'pending',
        items: returnItems,
        refundAmount: totalReturnAmount,
        refundMethod: request.refundMethod,
        originalPaymentMethod: 'cash', // TODO: Extract from paymentMethod breakdown
        notes: request.notes,
        requiresApproval,
        validationResults,
      };

      // Convert to database format and save
      const dbRecord: any = {
        ...returnTransaction,
        refundMethod: returnTransaction.refundMethod as 'cash' | 'original_payment',
      };

      await db.saveReturnTransaction(dbRecord);

      console.log('Return transaction saved to database:', returnTransaction);

      // If supervisor approval is required, mark as pending
      if (requiresApproval) {
        returnTransaction.status = 'pending';
        toast('Return requires supervisor approval');
      } else {
        // Process the return immediately
        await this.approveAndProcessReturn(returnTransaction);
      }

      return returnTransaction;
    } catch (error) {
      console.error('Return processing failed:', error);
      throw new Error(`Failed to process return: ${error}`);
    }
  }

  /**
   * Approve and process return (cash refund)
   */
  async approveAndProcessReturn(returnTransaction: ReturnTransaction): Promise<void> {
    try {
      // Update status to approved and processed
      returnTransaction.status = 'processed';

      // Process refund
      const refundResult = await this.processRefund(returnTransaction);

      if (!refundResult.success) {
        throw new Error(`Refund processing failed: ${refundResult.error}`);
      }

      // Log return transaction (in production, update database)
      console.log('Return transaction updated:', returnTransaction);

      // Log audit event
      await this.logReturnAuditEvent(returnTransaction, 'return_processed');

      toast.success('Return processed successfully');
    } catch (error) {
      console.error('Return approval/processing failed:', error);
      returnTransaction.status = 'rejected';
      await this.logReturnAuditEvent(returnTransaction, 'return_failed', error as Error);
      throw error;
    }
  }

  /**
   * Process refund based on method
   */
  async processRefund(
    returnTransaction: ReturnTransaction
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // For now, only support cash refunds
      if (returnTransaction.refundMethod === 'cash') {
        // Log cash disbursement to database
        await db.logCashTransaction({
          type: 'cash_disbursement',
          amount: returnTransaction.refundAmount,
          reason: 'return_refund',
          referenceId: returnTransaction.id,
          userId: returnTransaction.processedBy,
          notes: `Return transaction ${returnTransaction.returnTransactionNumber}`,
        });

        return { success: true };
      } else if (returnTransaction.refundMethod === 'original_payment') {
        // TODO: Implement refund to original payment method
        return { success: true }; // Placeholder
      }

      return { success: false, error: 'Unsupported refund method' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Generate return transaction number
   */
  private generateReturnTransactionNumber(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');

    return `RT${dateStr}${timeStr}${random}`;
  }

  /**
   * Check if supervisor approval is required
   */
  private requiresSupervisorApproval(returnItems: ReturnItem[], totalAmount: number): boolean {
    // Require approval for:
    // 1. High value returns (> Rp 100,000)
    // 2. Item condition issues (damaged, defective)
    // 3. Quantity > 5 items
    // 4. Multiple items with same reason

    if (totalAmount > 100000) {
      return true;
    }

    const hasConditionIssues = returnItems.some(
      item => item.condition === 'damaged' || item.condition === 'defective'
    );

    if (hasConditionIssues) {
      return true;
    }

    if (returnItems.length > 5) {
      return true;
    }

    const reasonCounts = returnItems.reduce((counts, item) => {
      counts[item.returnReason] = (counts[item.returnReason] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const hasMultipleSameReason = Object.values(reasonCounts).some(count => count > 3);
    if (hasMultipleSameReason) {
      return true;
    }

    return false;
  }

  /**
   * Log return audit event
   */
  private async logReturnAuditEvent(
    returnTransaction: ReturnTransaction,
    eventType: string,
    error?: Error
  ): Promise<void> {
    const auditLog = {
      eventType: `return_${eventType}`,
      transactionId: returnTransaction.id,
      originalTransactionId: returnTransaction.originalTransactionId,
      userId: returnTransaction.processedBy,
      timestamp: new Date(),
      details: {
        returnAmount: returnTransaction.refundAmount,
        itemCount: returnTransaction.items.length,
        requiresApproval: returnTransaction.requiresApproval,
        refundMethod: returnTransaction.refundMethod,
      },
      error: error?.message,
    };

    try {
      // In production, save to database
      console.log('Return audit log:', auditLog);
    } catch (auditError) {
      console.error('Failed to log return audit event:', auditError);
    }
  }

  /**
   * Get return transactions for reporting
   */
  async getReturnTransactions(
    startDate?: Date,
    endDate?: Date,
    status?: ReturnTransaction['status']
  ): Promise<ReturnTransaction[]> {
    try {
      const dbTransactions = await db.getReturnTransactions({
        status: status as any,
        startDate,
        endDate,
        limit: 100,
      });

      // Convert database format to return transaction format
      return dbTransactions.map(dbTx => ({
        id: dbTx.id,
        originalTransactionId: dbTx.originalTransactionId,
        items: dbTx.items,
        totalRefundAmount: dbTx.refundAmount,
        reason: dbTx.returnReason,
        returnReason: dbTx.returnReason,
        approvedBy: dbTx.approvedBy ?? '',
        createdAt: dbTx.createdAt,
        status: dbTx.status,
        // Add additional fields as needed
        returnTransactionNumber: dbTx.returnTransactionNumber,
        returnDate: dbTx.returnDate,
        processedBy: dbTx.processedBy,
        refundAmount: dbTx.refundAmount,
        refundMethod: dbTx.refundMethod,
        originalPaymentMethod: dbTx.originalPaymentMethod,
        notes: dbTx.notes,
        requiresApproval: dbTx.requiresApproval,
        validationResults: dbTx.validationResults,
      }));
    } catch (error) {
      console.error('Failed to get return transactions:', error);
      return [];
    }
  }

  /**
   * Reject return transaction
   */
  async rejectReturn(
    returnTransactionId: string,
    rejectionReason: string,
    rejectedBy: string
  ): Promise<void> {
    try {
      // In production, update database
      console.log('Return rejected:', { returnTransactionId, rejectionReason, rejectedBy });
      toast.success('Return rejected');
    } catch (error) {
      console.error('Failed to reject return:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const returnRefundManager = new ReturnRefundManager();
