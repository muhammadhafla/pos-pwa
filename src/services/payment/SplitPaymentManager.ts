/**
 * Split Payment Manager
 * Handles multiple payment methods with allocation logic and validation
 * Supports Cash + QRIS and other payment combinations
 */

import { 
  SplitPayment, 
  PaymentMethod, 
  PaymentMethodAllocation, 
  SplitPaymentStatus,
  CartItem,
  PaymentBreakdown 
} from '@/types';
import { db } from '@/services/database/POSDatabase';
import { toast } from 'react-hot-toast';

export interface SplitPaymentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canProcess: boolean;
}

export interface PaymentAllocation {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  processingFee?: number;
}

export interface SplitPaymentRequest {
  transactionId: string;
  totalAmount: number;
  allocations: PaymentAllocation[];
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

export class SplitPaymentManager {
  
  /**
   * Create new split payment
   */
  async createSplitPayment(request: SplitPaymentRequest): Promise<string> {
    const validation = this.validateSplitPayment(request);
    if (!validation.isValid) {
      throw new Error(`Invalid split payment: ${validation.errors.join(', ')}`);
    }

    const allocations: PaymentMethodAllocation[] = request.allocations.map(alloc => ({
      method: alloc.method,
      amount: alloc.amount,
      reference: alloc.reference,
      processingFee: alloc.processingFee || 0
    }));

    const splitPayment: Omit<SplitPayment, 'id'> = {
      transactionId: request.transactionId,
      paymentMethods: allocations,
      totalAmount: request.totalAmount,
      totalAllocated: this.calculateTotalAllocated(allocations),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const id = await db.createSplitPayment(splitPayment);
    
    console.log(`💳 Split payment created: ${id}`);
    return id;
  }

  /**
   * Get split payment by transaction ID
   */
  async getSplitPayment(transactionId: string): Promise<SplitPayment | null> {
    const payment = await db.getSplitPayment(transactionId);
    return payment || null;
  }

  /**
   * Update split payment allocation
   */
  async updateAllocation(
    splitPaymentId: string,
    method: PaymentMethod,
    amount: number,
    reference?: string
  ): Promise<void> {
    const splitPayment = await db.splitPayments.get(splitPaymentId);
    if (!splitPayment) {
      throw new Error('Split payment not found');
    }

    const updatedAllocations = [...splitPayment.paymentMethods];
    const existingIndex = updatedAllocations.findIndex(alloc => alloc.method === method);

    if (existingIndex >= 0) {
      if (amount <= 0) {
        updatedAllocations.splice(existingIndex, 1);
      } else {
        updatedAllocations[existingIndex] = {
          ...updatedAllocations[existingIndex],
          amount,
          reference
        };
      }
    } else if (amount > 0) {
      updatedAllocations.push({
        method,
        amount,
        reference
      });
    }

    const totalAllocated = this.calculateTotalAllocated(updatedAllocations);
    const newStatus = this.determinePaymentStatus(totalAllocated, splitPayment.totalAmount);

    await db.updateSplitPayment(splitPaymentId, {
      paymentMethods: updatedAllocations,
      totalAllocated,
      status: newStatus
    });

    console.log(`💳 Split payment updated: ${splitPaymentId}`);
  }

  /**
   * Complete split payment
   */
  async completeSplitPayment(splitPaymentId: string): Promise<void> {
    const splitPayment = await db.splitPayments.get(splitPaymentId);
    if (!splitPayment) {
      throw new Error('Split payment not found');
    }

    const validation = this.validateForCompletion(splitPayment);
    if (!validation.canProcess) {
      throw new Error(`Cannot complete payment: ${validation.errors.join(', ')}`);
    }

    await db.updateSplitPayment(splitPaymentId, {
      status: 'complete',
      updatedAt: new Date()
    });

    console.log(`✅ Split payment completed: ${splitPaymentId}`);
  }

  /**
   * Process payment method specific logic
   */
  async processPaymentMethod(
    method: PaymentMethod,
    amount: number,
    reference?: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    switch (method) {
      case 'cash':
        return this.processCashPayment(amount);
      
      case 'card':
        return this.processCardPayment(amount, reference);
      
      case 'qris':
        return this.processQRISPayment(amount, reference);
      
      case 'ewallet':
        return this.processEWalletPayment(amount, reference);
      
      case 'bank_transfer':
        return this.processBankTransfer(amount, reference);
      
      case 'credit':
        return this.processCreditPayment(amount, reference);
      
      default:
        return { success: false, error: `Unsupported payment method: ${method}` };
    }
  }

  /**
   * Generate payment allocation suggestions
   */
  generateAllocationSuggestions(
    totalAmount: number,
    availableMethods: PaymentMethod[],
    customerPreference?: PaymentMethod
  ): PaymentAllocation[] {
    const suggestions: PaymentAllocation[] = [];

    if (customerPreference && availableMethods.includes(customerPreference)) {
      suggestions.push({
        method: customerPreference,
        amount: totalAmount
      });
      return suggestions;
    }

    // Default suggestions based on common patterns
    if (availableMethods.includes('cash') && availableMethods.includes('qris')) {
      // Suggest split between cash and QRIS
      const cashAmount = Math.floor(totalAmount * 0.3); // 30% cash
      const qrisAmount = totalAmount - cashAmount;
      
      suggestions.push(
        { method: 'cash', amount: cashAmount },
        { method: 'qris', amount: qrisAmount }
      );
    } else if (availableMethods.includes('cash')) {
      suggestions.push({ method: 'cash', amount: totalAmount });
    } else if (availableMethods.includes('card')) {
      suggestions.push({ method: 'card', amount: totalAmount });
    }

    return suggestions;
  }

  /**
   * Calculate change for cash payments
   */
  calculateChange(totalPayment: number, totalAmount: number): number {
    return Math.max(0, totalPayment - totalAmount);
  }

  /**
   * Validate split payment request
   */
  validateSplitPayment(request: SplitPaymentRequest): SplitPaymentValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!request.transactionId) {
      errors.push('Transaction ID is required');
    }

    if (request.totalAmount <= 0) {
      errors.push('Total amount must be greater than zero');
    }

    if (!request.allocations || request.allocations.length === 0) {
      errors.push('At least one payment allocation is required');
    }

    // Validate allocations
    if (request.allocations) {
      const totalAllocated = this.calculateTotalAllocated(
        request.allocations.map(alloc => ({
          method: alloc.method,
          amount: alloc.amount
        }))
      );

      if (totalAllocated < request.totalAmount) {
        errors.push(`Allocated amount (${totalAllocated.toFixed(2)}) is less than total (${request.totalAmount.toFixed(2)})`);
      }

      if (totalAllocated > request.totalAmount * 1.5) {
        warnings.push('Allocated amount seems unusually high');
      }

      // Validate individual allocations
      request.allocations.forEach((alloc, index) => {
        if (alloc.amount <= 0) {
          errors.push(`Allocation ${index + 1}: Amount must be greater than zero`);
        }

        if (!this.isValidPaymentMethod(alloc.method)) {
          errors.push(`Allocation ${index + 1}: Invalid payment method (${alloc.method})`);
        }

        // Method-specific validations
        if (alloc.method === 'cash' && alloc.amount > 1000000) {
          warnings.push(`Allocation ${index + 1}: Large cash amount (${alloc.amount.toLocaleString()})`);
        }

        if ((alloc.method === 'card' || alloc.method === 'qris') && !alloc.reference) {
          warnings.push(`Allocation ${index + 1}: ${alloc.method} payment should have reference number`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProcess: errors.length === 0
    };
  }

  /**
   * Validate split payment for completion
   */
  private validateForCompletion(splitPayment: SplitPayment): SplitPaymentValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (splitPayment.totalAllocated < splitPayment.totalAmount) {
      errors.push('Insufficient payment amount');
    }

    if (splitPayment.status === 'complete') {
      errors.push('Payment already completed');
    }

    if (splitPayment.paymentMethods.length === 0) {
      errors.push('No payment methods configured');
    }

    // Check for completed individual payments
    const incompleteMethods = splitPayment.paymentMethods.filter(
      method => !this.isPaymentMethodCompleted(method.method)
    );

    if (incompleteMethods.length > 0) {
      warnings.push(`${incompleteMethods.length} payment method(s) not yet processed`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProcess: errors.length === 0
    };
  }

  /**
   * Calculate total allocated amount
   */
  private calculateTotalAllocated(allocations: PaymentMethodAllocation[]): number {
    return allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
  }

  /**
   * Determine payment status based on allocation
   */
  private determinePaymentStatus(totalAllocated: number, totalAmount: number): SplitPaymentStatus {
    if (totalAllocated === 0) return 'pending';
    if (totalAllocated < totalAmount) return 'partial';
    if (totalAllocated === totalAmount) return 'complete';
    return 'complete'; // Allow overpayment
  }

  /**
   * Check if payment method is valid
   */
  private isValidPaymentMethod(method: PaymentMethod): boolean {
    const validMethods: PaymentMethod[] = ['cash', 'card', 'ewallet', 'bank_transfer', 'credit', 'qris'];
    return validMethods.includes(method);
  }

  /**
   * Check if payment method is completed (simulated)
   */
  private isPaymentMethodCompleted(method: PaymentMethod): boolean {
    // In real implementation, this would check with payment processors
    // For now, we simulate completion based on method type
    switch (method) {
      case 'cash':
        return true; // Cash is always considered complete
      case 'card':
      case 'qris':
      case 'ewallet':
      case 'bank_transfer':
      case 'credit':
        return Math.random() > 0.1; // 90% success rate simulation
      default:
        return false;
    }
  }

  // Payment processing methods (simulated)
  private async processCashPayment(amount: number): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Simulate cash payment processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      transactionId: `CASH-${Date.now()}`
    };
  }

  private async processCardPayment(amount: number, reference?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Simulate card payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate 95% success rate
    if (Math.random() > 0.05) {
      return {
        success: true,
        transactionId: `CARD-${Date.now()}`,
        error: reference ? `Approved: ${reference}` : undefined
      };
    } else {
      return {
        success: false,
        error: 'Card payment declined'
      };
    }
  }

  private async processQRISPayment(amount: number, reference?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Simulate QRIS payment processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simulate 98% success rate
    if (Math.random() > 0.02) {
      return {
        success: true,
        transactionId: `QRIS-${Date.now()}`,
        error: reference ? `QR Code: ${reference}` : undefined
      };
    } else {
      return {
        success: false,
        error: 'QRIS payment timeout'
      };
    }
  }

  private async processEWalletPayment(amount: number, reference?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Simulate e-wallet payment processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      transactionId: `EWALLET-${Date.now()}`
    };
  }

  private async processBankTransfer(amount: number, reference?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Simulate bank transfer processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      success: true,
      transactionId: `BANK-${Date.now()}`
    };
  }

  private async processCreditPayment(amount: number, reference?: string): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // Simulate credit payment processing
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    return {
      success: true,
      transactionId: `CREDIT-${Date.now()}`
    };
  }

  /**
   * Get payment method display information
   */
  getPaymentMethodInfo(method: PaymentMethod): {
    name: string;
    icon: string;
    color: string;
    processingTime: string;
    fees: string;
  } {
    const info = {
      cash: {
        name: 'Cash',
        icon: '💵',
        color: 'green',
        processingTime: 'Instant',
        fees: 'None'
      },
      card: {
        name: 'Credit/Debit Card',
        icon: '💳',
        color: 'blue',
        processingTime: '2-5 seconds',
        fees: '1-3%'
      },
      qris: {
        name: 'QRIS',
        icon: '📱',
        color: 'purple',
        processingTime: '1-3 seconds',
        fees: '0.5-1%'
      },
      ewallet: {
        name: 'E-Wallet',
        icon: '📲',
        color: 'orange',
        processingTime: '1-2 seconds',
        fees: '1-2%'
      },
      bank_transfer: {
        name: 'Bank Transfer',
        icon: '🏦',
        color: 'indigo',
        processingTime: 'Instant',
        fees: 'None'
      },
      credit: {
        name: 'Store Credit',
        icon: '🪙',
        color: 'yellow',
        processingTime: 'Instant',
        fees: 'None'
      }
    };

    return info[method] || {
      name: method,
      icon: '💳',
      color: 'gray',
      processingTime: 'Unknown',
      fees: 'Unknown'
    };
  }
}

// Export singleton instance
export const splitPaymentManager = new SplitPaymentManager();