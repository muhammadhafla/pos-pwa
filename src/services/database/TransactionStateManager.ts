/**
 * Transaction State Manager - Phase 2
 * Comprehensive transaction lifecycle management with persistence and recovery
 * Performance target: <3 seconds crash recovery
 */

import { SalesTransaction, TransactionStatus, PaymentBreakdown, CartItem, User } from '@/types';
import { db } from './POSDatabase';

export interface TransactionState {
  id: string;
  status: TransactionStatus;
  currentStep: TransactionStep;
  data: TransactionData;
  metadata: TransactionMetadata;
  validationErrors: ValidationError[];
  lastUpdate: Date;
  retryCount: number;
  maxRetries: number;
}

export interface TransactionData {
  items: CartItem[];
  customerId?: string;
  customerInfo?: any;
  pricingDetails: any;
  paymentMethod?: PaymentBreakdown;
  totalAmount: number;
  subtotalAmount: number;
  taxAmount: number;
  discountAmount: number;
  receiptNumber?: string;
}

export interface TransactionMetadata {
  branchId: string;
  cashierId: string;
  deviceId?: string;
  startedAt: Date;
  expectedCompletionAt?: Date;
  processingTime?: number;
  syncAttempts: number;
  lastSyncAttempt?: Date;
  errorHistory: TransactionError[];
}

export interface TransactionError {
  step: TransactionStep;
  error: string;
  timestamp: Date;
  recoverable: boolean;
  retryable: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export type TransactionStep =
  | 'init'
  | 'item_selection'
  | 'payment_processing'
  | 'validation'
  | 'completion'
  | 'syncing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TransactionContext {
  user: User;
  branchId: string;
  deviceId?: string;
}

export interface RecoveryOptions {
  autoRecovery?: boolean;
  maxRecoveryTime?: number;
  skipValidation?: boolean;
  forceCompletion?: boolean;
}

export interface TransactionStatistics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageProcessingTime: number;
  errorRate: number;
  commonErrors: Record<string, number>;
}

export class TransactionStateManager {
  private static instance: TransactionStateManager;
  private currentTransaction: TransactionState | null = null;
  private transactionHistory: TransactionState[] = [];
  private recoveryQueue: TransactionState[] = [];
  private context: TransactionContext | null = null;

  // Transaction lifecycle listeners
  private onStateChangeCallbacks: ((state: TransactionState) => void)[] = [];
  private onErrorCallbacks: ((error: TransactionError) => void)[] = [];
  private onRecoveryCallbacks: ((transaction: TransactionState) => void)[] = [];

  constructor() {
    this.initializeStateManager();
  }

  static getInstance(): TransactionStateManager {
    if (!TransactionStateManager.instance) {
      TransactionStateManager.instance = new TransactionStateManager();
    }
    return TransactionStateManager.instance;
  }

  /**
   * Initialize transaction state manager
   */
  private async initializeStateManager(): Promise<void> {
    try {
      console.log('💼 Initializing Transaction State Manager...');

      // Load any pending transactions from database
      await this.loadPendingTransactions();

      // Start background recovery process
      this.startRecoveryProcess();

      // Register for app state changes (beforeunload, etc.)
      this.registerEventListeners();

      console.log('✅ Transaction State Manager initialized');
    } catch (error) {
      console.error('❌ Transaction State Manager initialization failed:', error);
    }
  }

  /**
   * Start a new transaction
   */
  async startTransaction(context: TransactionContext): Promise<TransactionState> {
    const transactionId = crypto.randomUUID();

    const transaction: TransactionState = {
      id: transactionId,
      status: 'pending',
      currentStep: 'init',
      data: {
        items: [],
        totalAmount: 0,
        subtotalAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        pricingDetails: {},
      },
      metadata: {
        branchId: context.branchId,
        cashierId: context.user.id,
        deviceId: context.deviceId,
        startedAt: new Date(),
        syncAttempts: 0,
        errorHistory: [],
      },
      validationErrors: [],
      lastUpdate: new Date(),
      retryCount: 0,
      maxRetries: 3,
    };

    // Store in database for persistence
    await this.saveTransaction(transaction);

    // Set as current transaction
    this.currentTransaction = transaction;
    this.context = context;

    // Notify listeners
    this.notifyStateChange(transaction);

    console.log(`🚀 Started transaction: ${transactionId}`);

    return transaction;
  }

  /**
   * Update transaction state
   */
  async updateTransaction(updates: Partial<TransactionState>): Promise<TransactionState> {
    if (!this.currentTransaction) {
      throw new Error('No active transaction to update');
    }

    const updatedTransaction: TransactionState = {
      ...this.currentTransaction,
      ...updates,
      lastUpdate: new Date(),
    };

    // Validate state transition
    const validationResult = this.validateStateTransition(
      this.currentTransaction,
      updatedTransaction
    );

    if (!validationResult.isValid) {
      throw new Error(`Invalid state transition: ${validationResult.error}`);
    }

    // Update in database
    await this.saveTransaction(updatedTransaction);

    // Update current transaction
    this.currentTransaction = updatedTransaction;

    // Notify listeners
    this.notifyStateChange(updatedTransaction);

    console.log(
      `🔄 Updated transaction: ${updatedTransaction.id} → ${updatedTransaction.currentStep}`
    );

    return updatedTransaction;
  }

  /**
   * Add items to transaction
   */
  async addItems(items: CartItem[]): Promise<TransactionState> {
    if (!this.currentTransaction) {
      throw new Error('No active transaction');
    }

    const updatedItems = [...this.currentTransaction.data.items, ...items];

    // Recalculate totals
    const totals = this.calculateTransactionTotals(updatedItems);

    return await this.updateTransaction({
      data: {
        ...this.currentTransaction.data,
        items: updatedItems,
        ...totals,
      },
      currentStep: 'item_selection',
    });
  }

  /**
   * Set payment method for transaction
   */
  async setPaymentMethod(paymentMethod: PaymentBreakdown): Promise<TransactionState> {
    if (!this.currentTransaction) {
      throw new Error('No active transaction');
    }

    // Validate payment method
    const validation = this.validatePaymentMethod(
      paymentMethod,
      this.currentTransaction.data.totalAmount
    );

    if (!validation.isValid) {
      throw new Error(`Invalid payment method: ${validation.error}`);
    }

    return await this.updateTransaction({
      data: {
        ...this.currentTransaction.data,
        paymentMethod,
      },
      currentStep: 'payment_processing',
    });
  }

  /**
   * Complete transaction
   */
  async completeTransaction(): Promise<SalesTransaction> {
    if (!this.currentTransaction) {
      throw new Error('No active transaction to complete');
    }

    try {
      // Validate transaction before completion
      const validationResult = this.validateTransaction(this.currentTransaction);

      if (!validationResult.isValid) {
        throw new Error(`Transaction validation failed: ${validationResult.error}`);
      }

      // Generate receipt number
      const receiptNumber = await this.generateReceiptNumber();

      // Update transaction state
      const updatedTransaction = await this.updateTransaction({
        data: {
          ...this.currentTransaction.data,
          receiptNumber,
        },
        status: 'completed',
        currentStep: 'completed',
      });

      // Create final SalesTransaction
      const salesTransaction: SalesTransaction = {
        id: updatedTransaction.id,
        branchId: updatedTransaction.metadata.branchId,
        cashierId: updatedTransaction.metadata.cashierId,
        customerId: updatedTransaction.data.customerId,
        items: updatedTransaction.data.items,
        subtotalAmount: updatedTransaction.data.subtotalAmount,
        discountAmount: updatedTransaction.data.discountAmount,
        taxAmount: updatedTransaction.data.taxAmount,
        totalAmount: updatedTransaction.data.totalAmount,
        paymentMethod: updatedTransaction.data.paymentMethod!,
        status: 'completed',
        receiptNumber: receiptNumber,
        createdAt: updatedTransaction.metadata.startedAt,
        updatedAt: updatedTransaction.lastUpdate,
        syncedAt: undefined,
        erpnextDocType: undefined,
        erpnextDocName: undefined,
      };

      // Save to sales queue for ERPNext sync
      await db.salesQueue.add(salesTransaction);

      // Clear current transaction
      this.currentTransaction = null;

      // Add to history
      this.transactionHistory.push(updatedTransaction);

      console.log(`✅ Completed transaction: ${updatedTransaction.id}`);

      return salesTransaction;
    } catch (error) {
      // Mark transaction as failed
      if (this.currentTransaction) {
        await this.markTransactionAsFailed(
          this.currentTransaction.id,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      throw error;
    }
  }

  /**
   * Cancel current transaction
   */
  async cancelTransaction(reason?: string): Promise<void> {
    if (!this.currentTransaction) {
      return;
    }

    await this.updateTransaction({
      status: 'failed',
      currentStep: 'cancelled',
    });

    this.currentTransaction = null;

    console.log(`❌ Cancelled transaction: ${reason ?? 'No reason provided'}`);
  }

  /**
   * Recover from failed transaction
   */
  async recoverTransaction(
    transactionId: string,
    options: RecoveryOptions = {
      autoRecovery: false,
      maxRecoveryTime: 30000,
      skipValidation: false,
    }
  ): Promise<boolean> {
    try {
      // Load transaction from database
      const transaction = await this.getTransaction(transactionId);

      if (!transaction) {
        throw new Error('Transaction not found for recovery');
      }

      // Check if transaction is recoverable
      if (!this.isRecoverable(transaction)) {
        throw new Error('Transaction is not recoverable');
      }

      // Attempt recovery
      const startTime = Date.now();

      if (options.skipValidation) {
        // Force complete the transaction
        await this.forceCompleteTransaction(transaction);
      } else {
        // Validate and complete normally
        const validationResult = this.validateTransaction(transaction);

        if (!validationResult.isValid) {
          throw new Error(`Recovery validation failed: ${validationResult.error}`);
        }

        await this.completeTransaction();
      }

      const recoveryTime = Date.now() - startTime;

      console.log(`🔧 Recovered transaction: ${transactionId} in ${recoveryTime}ms`);

      // Notify recovery listeners
      this.notifyRecovery(transaction);

      return true;
    } catch (error) {
      console.error(`❌ Failed to recover transaction ${transactionId}:`, error);
      return false;
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(id: string): Promise<TransactionState | null> {
    try {
      // First check current transaction
      if (this.currentTransaction?.id === id) {
        return this.currentTransaction;
      }

      // Check transaction history
      const historyTransaction = this.transactionHistory.find(t => t.id === id);
      if (historyTransaction) {
        return historyTransaction;
      }

      // Load from database
      // This would load from a transaction_states table if it existed
      return null;
    } catch (error) {
      console.error('Failed to get transaction:', error);
      return null;
    }
  }

  /**
   * Get all pending transactions for recovery
   */
  async getPendingTransactions(): Promise<TransactionState[]> {
    try {
      // This would query pending transactions from database
      // For now, return the recovery queue
      return [...this.recoveryQueue];
    } catch (error) {
      console.error('Failed to get pending transactions:', error);
      return [];
    }
  }

  /**
   * Get transaction statistics
   */
  async getStatistics(): Promise<TransactionStatistics> {
    try {
      // This would query transaction statistics from database
      const totalTransactions = this.transactionHistory.length;
      const successfulTransactions = this.transactionHistory.filter(
        t => t.status === 'completed'
      ).length;
      const failedTransactions = this.transactionHistory.filter(t => t.status === 'failed').length;

      // Calculate average processing time
      const processingTimes = this.transactionHistory
        .filter(t => t.metadata.processingTime)
        .map(t => t.metadata.processingTime!);

      const averageProcessingTime =
        processingTimes.length > 0
          ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
          : 0;

      const errorRate = totalTransactions > 0 ? (failedTransactions / totalTransactions) * 100 : 0;

      // Count common errors
      const commonErrors: Record<string, number> = {};
      this.transactionHistory.forEach(transaction => {
        transaction.metadata.errorHistory.forEach(error => {
          commonErrors[error.error] = (commonErrors[error.error] || 0) + 1;
        });
      });

      return {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        averageProcessingTime,
        errorRate,
        commonErrors,
      };
    } catch (error) {
      console.error('Failed to get transaction statistics:', error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Calculate transaction totals
   */
  private calculateTransactionTotals(items: CartItem[]): Partial<TransactionData> {
    const subtotalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const discountAmount = items.reduce((sum, item) => sum + item.discount, 0);
    const taxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalAmount = subtotalAmount + taxAmount;

    return {
      subtotalAmount,
      discountAmount,
      taxAmount,
      totalAmount,
    };
  }

  /**
   * Validate state transition
   */
  private validateStateTransition(
    from: TransactionState,
    to: TransactionState
  ): { isValid: boolean; error?: string } {
    // Define valid state transitions
    const validTransitions: Record<TransactionStep, TransactionStep[]> = {
      init: ['item_selection', 'cancelled'],
      item_selection: ['payment_processing', 'cancelled'],
      payment_processing: ['validation', 'item_selection', 'cancelled'],
      validation: ['completion', 'payment_processing'],
      completion: ['syncing'],
      syncing: ['completed', 'failed'],
      completed: [],
      failed: [],
      cancelled: [],
    };

    const allowed = validTransitions[from.currentStep];

    if (!allowed.includes(to.currentStep)) {
      return {
        isValid: false,
        error: `Invalid transition from ${from.currentStep} to ${to.currentStep}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validate payment method
   */
  private validatePaymentMethod(
    payment: PaymentBreakdown,
    totalAmount: number
  ): { isValid: boolean; error?: string } {
    const totalPayment =
      payment.cash + payment.card + payment.ewallet + payment.bankTransfer + payment.credit;

    if (totalPayment <= 0) {
      return { isValid: false, error: 'Total payment must be greater than zero' };
    }

    if (totalPayment < totalAmount) {
      return { isValid: false, error: 'Insufficient payment amount' };
    }

    return { isValid: true };
  }

  /**
   * Validate transaction before completion
   */
  private validateTransaction(transaction: TransactionState): { isValid: boolean; error?: string } {
    const validationErrors: ValidationError[] = [];

    // Check if transaction has items
    if (transaction.data.items.length === 0) {
      validationErrors.push({
        field: 'items',
        message: 'Transaction must have at least one item',
        code: 'NO_ITEMS',
        severity: 'error',
      });
    }

    // Check if payment method is set
    if (!transaction.data.paymentMethod) {
      validationErrors.push({
        field: 'payment',
        message: 'Payment method is required',
        code: 'NO_PAYMENT_METHOD',
        severity: 'error',
      });
    }

    // Check if amounts are positive
    if (transaction.data.totalAmount <= 0) {
      validationErrors.push({
        field: 'total',
        message: 'Total amount must be positive',
        code: 'INVALID_AMOUNT',
        severity: 'error',
      });
    }

    if (validationErrors.length > 0) {
      return {
        isValid: false,
        error: `Validation failed: ${validationErrors.map(e => e.message).join(', ')}`,
      };
    }

    return { isValid: true };
  }

  /**
   * Check if transaction is recoverable
   */
  private isRecoverable(transaction: TransactionState): boolean {
    // Transaction is recoverable if:
    // 1. It's not already completed
    // 2. It's not cancelled
    // 3. It's not too old (within recovery window)

    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const age = Date.now() - transaction.metadata.startedAt.getTime();

    return (
      transaction.status !== 'completed' && transaction.currentStep !== 'cancelled' && age < maxAge
    );
  }

  /**
   * Force complete transaction (for recovery)
   */
  private async forceCompleteTransaction(transaction: TransactionState): Promise<void> {
    // Create minimal sales transaction for recovery
    const salesTransaction: SalesTransaction = {
      id: transaction.id,
      branchId: transaction.metadata.branchId,
      cashierId: transaction.metadata.cashierId,
      customerId: transaction.data.customerId,
      items: transaction.data.items,
      subtotalAmount: transaction.data.subtotalAmount,
      discountAmount: transaction.data.discountAmount,
      taxAmount: transaction.data.taxAmount,
      totalAmount: transaction.data.totalAmount,
      paymentMethod: transaction.data.paymentMethod ?? {
        cash: transaction.data.totalAmount,
        card: 0,
        ewallet: 0,
        bankTransfer: 0,
        credit: 0,
      },
      status: 'completed',
      receiptNumber: transaction.data.receiptNumber ?? (await this.generateReceiptNumber()),
      createdAt: transaction.metadata.startedAt,
      updatedAt: new Date(),
      syncedAt: undefined,
      erpnextDocType: undefined,
      erpnextDocName: undefined,
    };

    await db.salesQueue.add(salesTransaction);
  }

  /**
   * Generate receipt number
   */
  private async generateReceiptNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.getTime().toString().slice(-6);
    return `RCP-${dateStr}-${timeStr}`;
  }

  /**
   * Save transaction to database
   */
  private async saveTransaction(transaction: TransactionState): Promise<void> {
    // This would save to a transaction_states table
    // For now, just add to recovery queue if needed
    if (transaction.status === 'failed' && this.isRecoverable(transaction)) {
      if (!this.recoveryQueue.find(t => t.id === transaction.id)) {
        this.recoveryQueue.push(transaction);
      }
    }
  }

  /**
   * Mark transaction as failed
   */
  private async markTransactionAsFailed(transactionId: string, error: string): Promise<void> {
    const currentTransaction = this.currentTransaction;
    if (!currentTransaction || currentTransaction.id !== transactionId) {
      return;
    }

    const updatedTransaction: TransactionState = {
      ...currentTransaction,
      status: 'failed',
      metadata: {
        ...currentTransaction.metadata,
        errorHistory: [
          ...currentTransaction.metadata.errorHistory,
          {
            step: currentTransaction.currentStep,
            error,
            timestamp: new Date(),
            recoverable: true,
            retryable: true,
          },
        ],
      },
      lastUpdate: new Date(),
    };

    await this.saveTransaction(updatedTransaction);
    this.currentTransaction = updatedTransaction;
  }

  /**
   * Load pending transactions
   */
  private async loadPendingTransactions(): Promise<void> {
    try {
      // Load pending sales transactions
      const pendingSales = await db.salesQueue.where('status').equals('pending').toArray();

      console.log(`📥 Loaded ${pendingSales.length} pending transactions`);
    } catch (error) {
      console.error('Failed to load pending transactions:', error);
    }
  }

  /**
   * Start recovery process
   */
  private startRecoveryProcess(): void {
    // Periodic recovery check
    setInterval(async () => {
      try {
        const pendingTransactions = await this.getPendingTransactions();

        for (const transaction of pendingTransactions) {
          // Attempt automatic recovery for simple failures
          if (this.isSimpleRecovery(transaction)) {
            await this.recoverTransaction(transaction.id, {
              autoRecovery: true,
              maxRecoveryTime: 30000,
              skipValidation: true,
            });
          }
        }
      } catch (error) {
        console.error('Recovery process error:', error);
      }
    }, 60000); // Check every minute
  }

  /**
   * Check if transaction can be automatically recovered
   */
  private isSimpleRecovery(transaction: TransactionState): boolean {
    // Simple recovery if:
    // 1. No validation errors
    // 2. Has all required data
    // 3. Error is network-related or temporary

    return (
      transaction.validationErrors.length === 0 &&
      transaction.data.items.length > 0 &&
      transaction.data.paymentMethod !== undefined
    );
  }

  /**
   * Register event listeners
   */
  private registerEventListeners(): void {
    // Handle page unload
    window.addEventListener('beforeunload', () => {
      this.persistCurrentTransaction();
    });

    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.persistCurrentTransaction();
      } else {
        this.checkForRecovery();
      }
    });
  }

  /**
   * Persist current transaction to local storage
   */
  private persistCurrentTransaction(): void {
    if (this.currentTransaction) {
      try {
        localStorage.setItem('pos_current_transaction', JSON.stringify(this.currentTransaction));
        console.log('💾 Transaction persisted to localStorage');
      } catch (error) {
        console.error('Failed to persist transaction:', error);
      }
    }
  }

  /**
   * Check for transaction recovery on app resume
   */
  private checkForRecovery(): void {
    try {
      const persisted = localStorage.getItem('pos_current_transaction');

      if (persisted) {
        const transaction: TransactionState = JSON.parse(persisted);

        if (this.isRecoverable(transaction)) {
          console.log('🔄 Found persisted transaction, checking for recovery...');
          // Add to recovery queue
          if (!this.recoveryQueue.find(t => t.id === transaction.id)) {
            this.recoveryQueue.push(transaction);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check for recovery:', error);
    }
  }

  // Event notification methods

  public onStateChange(callback: (state: TransactionState) => void): void {
    this.onStateChangeCallbacks.push(callback);
  }

  public onError(callback: (error: TransactionError) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  public onRecovery(callback: (transaction: TransactionState) => void): void {
    this.onRecoveryCallbacks.push(callback);
  }

  private notifyStateChange(state: TransactionState): void {
    this.onStateChangeCallbacks.forEach(callback => callback(state));
  }

  private notifyError(error: TransactionError): void {
    this.onErrorCallbacks.forEach(callback => callback(error));
  }

  private notifyRecovery(transaction: TransactionState): void {
    this.onRecoveryCallbacks.forEach(callback => callback(transaction));
  }

  // Public getters

  getCurrentTransaction(): TransactionState | null {
    return this.currentTransaction;
  }

  getTransactionHistory(): TransactionState[] {
    return [...this.transactionHistory];
  }
}

// Export singleton instance
export const transactionManager = TransactionStateManager.getInstance();
