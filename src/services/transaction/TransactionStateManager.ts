/**
 * Transaction State Manager
 * Manages transaction lifecycle, validation, and crash recovery
 * Implements comprehensive state management for POS transactions
 */

import {
  TransactionState,
  TransactionStateStatus as _TransactionStateStatus,
  TransactionStep,
  CartItem,
  SalesTransaction,
  PaymentBreakdown,
} from '@/types';
import { db } from '@/services/database/POSDatabase';

export interface TransactionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  canProceed: boolean;
}

export interface TransactionContext {
  transactionId: string;
  step: TransactionStep;
  data: {
    items: CartItem[];
    payment?: PaymentBreakdown;
    customer?: any;
    overrides?: any[];
  };
  metadata: {
    startedAt: Date;
    lastUpdated: Date;
    userId: string;
    branchId: string;
    deviceId: string;
  };
}

export class TransactionStateManager {
  private activeTransactions = new Map<string, TransactionState>();
  private transactionContexts = new Map<string, TransactionContext>();
  private validationRules: Map<
    TransactionStep,
    (context: TransactionContext) => TransactionValidationResult
  > = new Map();

  constructor() {
    this.initializeValidationRules();
  }

  /**
   * Initialize validation rules for each transaction step
   */
  private initializeValidationRules(): void {
    this.validationRules.set('items', this.validateItemsStep.bind(this));
    this.validationRules.set('pricing', this.validatePricingStep.bind(this));
    this.validationRules.set('payment', this.validatePaymentStep.bind(this));
    this.validationRules.set('confirmation', this.validateConfirmationStep.bind(this));
    this.validationRules.set('printing', this.validatePrintingStep.bind(this));
  }

  /**
   * Start a new transaction
   */
  async startTransaction(userId: string, branchId: string, deviceId: string): Promise<string> {
    const transactionId = crypto.randomUUID();
    const now = new Date();

    const transactionState: TransactionState = {
      id: transactionId,
      status: 'active',
      currentStep: 'items',
      stepData: {
        items: {},
        pricing: {},
        payment: {},
        confirmation: {},
        printing: {},
      },
      validationErrors: {},
      lastUpdated: now,
      startedAt: now,
    };

    const context: TransactionContext = {
      transactionId,
      step: 'items',
      data: {
        items: [],
      },
      metadata: {
        startedAt: now,
        lastUpdated: now,
        userId,
        branchId,
        deviceId,
      },
    };

    // Store in memory for fast access
    this.activeTransactions.set(transactionId, transactionState);
    this.transactionContexts.set(transactionId, context);

    // Persist to database
    await db.createTransactionState(transactionState);

    console.log(`✅ Transaction started: ${transactionId}`);
    return transactionId;
  }

  /**
   * Get transaction state
   */
  async getTransaction(transactionId: string): Promise<TransactionState | null> {
    // Check memory first
    let state = this.activeTransactions.get(transactionId);

    if (!state) {
      // Load from database
      state = await db.getTransactionState(transactionId);
      if (state) {
        this.activeTransactions.set(transactionId, state);
      }
    }

    return state ?? null;
  }

  /**
   * Get transaction context
   */
  getTransactionContext(transactionId: string): TransactionContext | null {
    return this.transactionContexts.get(transactionId) ?? null;
  }

  /**
   * Update transaction step
   */
  async updateTransactionStep(
    transactionId: string,
    newStep: TransactionStep,
    stepData?: any
  ): Promise<TransactionState | null> {
    const state = await this.getTransaction(transactionId);
    if (!state) {
      throw new Error('Transaction not found');
    }

    // Validate step transition
    const isValidTransition = this.validateStepTransition(state.currentStep, newStep);
    if (!isValidTransition) {
      throw new Error(`Invalid step transition from ${state.currentStep} to ${newStep}`);
    }

    // Update state
    state.currentStep = newStep;
    state.lastUpdated = new Date();

    if (stepData) {
      state.stepData[newStep] = { ...state.stepData[newStep], ...stepData };
    }

    // Update database
    await db.updateTransactionState(transactionId, {
      currentStep: newStep,
      stepData: state.stepData,
      lastUpdated: state.lastUpdated,
    });

    console.log(`📋 Transaction ${transactionId} moved to step: ${newStep}`);
    return state;
  }

  /**
   * Add items to transaction
   */
  async addItemsToTransaction(
    transactionId: string,
    items: CartItem[]
  ): Promise<TransactionState | null> {
    const context = this.getTransactionContext(transactionId);
    if (!context) {
      throw new Error('Transaction context not found');
    }

    // Merge items (add quantities if item already exists)
    const existingItems = context.data.items;
    const updatedItems = [...existingItems];

    items.forEach(newItem => {
      const existingIndex = updatedItems.findIndex(item => item.itemId === newItem.itemId);
      if (existingIndex >= 0) {
        updatedItems[existingIndex].quantity += newItem.quantity;
        updatedItems[existingIndex].totalPrice =
          updatedItems[existingIndex].quantity * updatedItems[existingIndex].unitPrice;
      } else {
        updatedItems.push(newItem);
      }
    });

    context.data.items = updatedItems;
    context.metadata.lastUpdated = new Date();

    // Update step data
    return await this.updateTransactionStep(transactionId, context.step, {
      items: updatedItems,
    });
  }

  /**
   * Remove item from transaction
   */
  async removeItemFromTransaction(
    transactionId: string,
    itemId: string
  ): Promise<TransactionState | null> {
    const context = this.getTransactionContext(transactionId);
    if (!context) {
      throw new Error('Transaction context not found');
    }

    context.data.items = context.data.items.filter(item => item.itemId !== itemId);
    context.metadata.lastUpdated = new Date();

    return await this.updateTransactionStep(transactionId, context.step, {
      items: context.data.items,
    });
  }

  /**
   * Update item quantity in transaction
   */
  async updateItemQuantity(
    transactionId: string,
    itemId: string,
    quantity: number
  ): Promise<TransactionState | null> {
    const context = this.getTransactionContext(transactionId);
    if (!context) {
      throw new Error('Transaction context not found');
    }

    const itemIndex = context.data.items.findIndex(item => item.itemId === itemId);
    if (itemIndex === -1) {
      throw new Error('Item not found in transaction');
    }

    if (quantity <= 0) {
      context.data.items.splice(itemIndex, 1);
    } else {
      context.data.items[itemIndex].quantity = quantity;
      context.data.items[itemIndex].totalPrice = quantity * context.data.items[itemIndex].unitPrice;
    }

    context.metadata.lastUpdated = new Date();

    return await this.updateTransactionStep(transactionId, context.step, {
      items: context.data.items,
    });
  }

  /**
   * Set payment information
   */
  async setPayment(
    transactionId: string,
    payment: PaymentBreakdown
  ): Promise<TransactionState | null> {
    const context = this.getTransactionContext(transactionId);
    if (!context) {
      throw new Error('Transaction context not found');
    }

    context.data.payment = payment;
    context.metadata.lastUpdated = new Date();

    return await this.updateTransactionStep(transactionId, 'payment', {
      payment,
    });
  }

  /**
   * Validate current transaction step
   */
  async validateTransaction(transactionId: string): Promise<TransactionValidationResult> {
    const context = this.getTransactionContext(transactionId);
    const state = await this.getTransaction(transactionId);

    if (!context || !state) {
      return {
        isValid: false,
        errors: ['Transaction not found'],
        warnings: [],
        canProceed: false,
      };
    }

    const validator = this.validationRules.get(state.currentStep);
    if (!validator) {
      return {
        isValid: false,
        errors: [`No validator for step: ${state.currentStep}`],
        warnings: [],
        canProceed: false,
      };
    }

    return validator(context);
  }

  /**
   * Complete transaction
   */
  async completeTransaction(transactionId: string): Promise<SalesTransaction | null> {
    const context = this.getTransactionContext(transactionId);
    const state = await this.getTransaction(transactionId);

    if (!context || !state) {
      throw new Error('Transaction not found');
    }

    // Final validation
    const validation = await this.validateTransaction(transactionId);
    if (!validation.canProceed) {
      throw new Error(`Cannot complete transaction: ${validation.errors.join(', ')}`);
    }

    // Create final sales transaction
    const transaction: SalesTransaction = {
      id: transactionId,
      branchId: context.metadata.branchId,
      cashierId: context.metadata.userId,
      items: context.data.items,
      subtotalAmount: this.calculateSubtotal(context.data.items),
      discountAmount: this.calculateDiscount(context.data.items),
      taxAmount: this.calculateTax(context.data.items),
      totalAmount: this.calculateTotal(context.data.items),
      paymentMethod: context.data.payment!,
      status: 'completed',
      receiptNumber: this.generateReceiptNumber(),
      createdAt: context.metadata.startedAt,
      updatedAt: new Date(),
    };

    // Save to sales queue
    await db.salesQueue.add(transaction);

    // Mark transaction as completed
    await db.updateTransactionState(transactionId, {
      status: 'completed',
      lastUpdated: new Date(),
    });

    // Clean up from memory
    this.activeTransactions.delete(transactionId);
    this.transactionContexts.delete(transactionId);

    console.log(`✅ Transaction completed: ${transactionId}`);
    return transaction;
  }

  /**
   * Suspend transaction (hold)
   */
  async suspendTransaction(transactionId: string): Promise<void> {
    const state = await this.getTransaction(transactionId);
    if (!state) {
      throw new Error('Transaction not found');
    }

    await db.updateTransactionState(transactionId, {
      status: 'suspended',
      lastUpdated: new Date(),
    });

    this.activeTransactions.delete(transactionId);
    console.log(`⏸️ Transaction suspended: ${transactionId}`);
  }

  /**
   * Resume suspended transaction
   */
  async resumeTransaction(transactionId: string): Promise<TransactionState | null> {
    const state = await this.getTransaction(transactionId);
    if (!state || state.status !== 'suspended') {
      throw new Error('Suspended transaction not found');
    }

    await db.updateTransactionState(transactionId, {
      status: 'active',
      lastUpdated: new Date(),
    });

    // Reload into memory
    const updatedState = await db.getTransactionState(transactionId);
    if (updatedState) {
      this.activeTransactions.set(transactionId, updatedState);
    }

    console.log(`▶️ Transaction resumed: ${transactionId}`);
    return updatedState ?? null;
  }

  /**
   * Cancel transaction
   */
  async cancelTransaction(transactionId: string, reason: string): Promise<void> {
    await db.updateTransactionState(transactionId, {
      status: 'cancelled',
      lastUpdated: new Date(),
    });

    this.activeTransactions.delete(transactionId);
    this.transactionContexts.delete(transactionId);

    console.log(`❌ Transaction cancelled: ${transactionId} (${reason})`);
  }

  /**
   * Recover transaction after crash
   */
  async recoverTransaction(transactionId: string): Promise<TransactionState | null> {
    const state = await this.getTransaction(transactionId);
    if (!state) {
      return null;
    }

    // Check if transaction is expired (24 hours)
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - state.lastUpdated.getTime()) / (1000 * 60 * 60);

    if (hoursSinceUpdate > 24) {
      console.warn(`⏰ Transaction expired: ${transactionId}`);
      await this.cancelTransaction(transactionId, 'Expired due to inactivity');
      return null;
    }

    // Reload into memory for active transactions
    if (state.status === 'active') {
      this.activeTransactions.set(transactionId, state);
    }

    console.log(`🔄 Transaction recovered: ${transactionId}`);
    return state || null;
  }

  /**
   * Clean up expired transactions
   */
  async cleanupExpiredTransactions(): Promise<void> {
    const expiredTransactions = await db.transactionStates
      .where('status')
      .equals('active')
      .and(state => {
        const hoursSinceUpdate = (Date.now() - state.lastUpdated.getTime()) / (1000 * 60 * 60);
        return hoursSinceUpdate > 24; // 24 hours
      })
      .toArray();

    for (const transaction of expiredTransactions) {
      await this.cancelTransaction(transaction.id, 'Expired during cleanup');
    }

    console.log(`🧹 Cleaned up ${expiredTransactions.length} expired transactions`);
  }

  /**
   * Get all active transactions for user
   */
  async getActiveTransactions(userId: string): Promise<TransactionState[]> {
    const allTransactions = await db.transactionStates.where('status').equals('active').toArray();

    return allTransactions.filter(transaction => {
      const context = this.transactionContexts.get(transaction.id);
      return context?.metadata.userId === userId;
    });
  }

  // Private validation methods
  private validateItemsStep(context: TransactionContext): TransactionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.data.items || context.data.items.length === 0) {
      errors.push('No items in transaction');
    }

    if (context.data.items.some(item => item.quantity <= 0)) {
      errors.push('Invalid item quantities found');
    }

    if (context.data.items.length > 100) {
      warnings.push('Large number of items may affect performance');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0 && context.data.items.length > 0,
    };
  }

  private validatePricingStep(context: TransactionContext): TransactionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if pricing calculations are valid
    for (const item of context.data.items) {
      if (item.totalPrice !== item.quantity * item.unitPrice) {
        errors.push(`Pricing mismatch for item: ${item.itemName}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0,
    };
  }

  private validatePaymentStep(context: TransactionContext): TransactionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.data.payment) {
      errors.push('Payment information not set');
      return {
        isValid: false,
        errors,
        warnings,
        canProceed: false,
      };
    }

    const totalPayment =
      context.data.payment.cash +
      context.data.payment.card +
      context.data.payment.ewallet +
      context.data.payment.bankTransfer +
      context.data.payment.credit;

    const totalAmount = this.calculateTotal(context.data.items);

    if (totalPayment < totalAmount) {
      errors.push('Insufficient payment amount');
    }

    if (totalPayment > totalAmount * 2) {
      warnings.push('Payment amount seems unusually high');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0,
    };
  }

  private validateConfirmationStep(context: TransactionContext): TransactionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const totalAmount = this.calculateTotal(context.data.items);
    if (totalAmount <= 0) {
      errors.push('Transaction total must be greater than zero');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0,
    };
  }

  private validatePrintingStep(_context: TransactionContext): TransactionValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      canProceed: true,
    };
  }

  // Helper methods
  private validateStepTransition(fromStep: TransactionStep, toStep: TransactionStep): boolean {
    const validTransitions: Record<TransactionStep, TransactionStep[]> = {
      items: ['pricing'],
      pricing: ['items', 'payment'],
      payment: ['pricing', 'confirmation'],
      confirmation: ['payment', 'printing'],
      printing: ['confirmation'],
    };

    return validTransitions[fromStep]?.includes(toStep) || false;
  }

  private calculateSubtotal(items: CartItem[]): number {
    return items.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  private calculateDiscount(items: CartItem[]): number {
    return items.reduce((sum, item) => sum + item.discount, 0);
  }

  private calculateTax(items: CartItem[]): number {
    return items.reduce((sum, item) => sum + item.taxAmount, 0);
  }

  private calculateTotal(items: CartItem[]): number {
    const subtotal = this.calculateSubtotal(items);
    const tax = this.calculateTax(items);
    return subtotal + tax;
  }

  private generateReceiptNumber(): string {
    const now = new Date();
    return `RCP-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now
      .getDate()
      .toString()
      .padStart(2, '0')}-${now.getTime().toString().slice(-6)}`;
  }
}

// Export singleton instance
export const transactionStateManager = new TransactionStateManager();
