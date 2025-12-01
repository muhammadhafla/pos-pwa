/**
 * TransactionQueueManager - Robust transaction storage and sync to ERPNext
 * Enhanced version with comprehensive error handling, recovery, and monitoring
 */

import { SalesTransaction, TransactionStatus } from '../../types';
import { ERPNextClient, ERPNextSalesInvoice } from '../erpnext/ERPNextClient';
import { POSDatabase } from '../database/POSDatabase';

export interface QueueProcessingStats {
  totalItems: number;
  pendingItems: number;
  processingItems: number;
  failedItems: number;
  completedItems: number;
  averageProcessingTime: number;
  successRate: number;
  lastSyncTime?: Date;
  throughputItemsPerMinute: number;
  totalProcessingTime: number;
  errorRate: number;
  retryRate: number;
}

export interface TransactionMapping {
  posTransactionId: string;
  erpnextInvoiceName: string;
  syncedAt: Date;
  syncStatus: 'success' | 'failed' | 'partial';
  errors?: string[];
  processingTime?: number;
  networkRequests?: number;
  dataTransferred?: number;
}

// Enhanced queue metadata with comprehensive tracking
interface TransactionQueueMetadata {
  id: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  errorMessage?: string;
  queueStatus: 'pending' | 'processing' | 'failed' | 'completed' | 'cancelled' | 'stuck';
  erpnextDocName?: string;
  processingStartTime?: Date;
  estimatedProcessingTime?: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  circuitBreakerFailures: number;
  lastError?: string;
  errorType?: string;
  validationErrors?: string[];
  networkRetryCount: number;
  timeoutCount: number;
  integrityCheckFailed?: boolean;
}

// Transaction processing configuration
interface ProcessingConfig {
  maxConcurrent: number;
  batchSize: number;
  retryDelay: number;
  maxRetryDelay: number;
  timeoutDuration: number;
  healthCheckInterval: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerResetTimeout: number;
  memoryLimit: number;
  maxProcessingTime: number;
}

// Circuit breaker pattern for handling API failures
interface CircuitBreaker {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

// Processing performance metrics
interface ProcessingMetrics {
  totalProcessed: number;
  totalSuccess: number;
  totalFailures: number;
  totalRetries: number;
  totalTimeout: number;
  averageProcessingTime: number;
  slowestProcessingTime: number;
  fastestProcessingTime: number;
  startTime: Date;
  lastActivityTime: Date;
  memoryUsage: number;
  networkRequests: number;
  dataTransferred: number;
}

/**
 * TransactionQueueManager - Enhanced robust transaction queue management
 */
export class TransactionQueueManager {
  private db: POSDatabase;
  private erpNextClient: ERPNextClient;
  private config: ProcessingConfig;
  private stats: QueueProcessingStats;
  private processingQueue: Set<string> = new Set();
  private isProcessing = false;
  private processingTimer?: number;
  private healthCheckTimer?: number;
  private metrics: ProcessingMetrics;
  private circuitBreaker: CircuitBreaker;
  private transactionStore: Map<string, SalesTransaction> = new Map();
  private metadataStore: Map<string, TransactionQueueMetadata> = new Map();
  private performanceThreshold = {
    slowProcessing: 5000, // 5 seconds
    verySlowProcessing: 15000, // 15 seconds
    highMemoryUsage: 50 * 1024 * 1024, // 50MB
    highErrorRate: 20, // 20%
  };

  constructor(db: POSDatabase, erpNextClient: ERPNextClient, config?: Partial<ProcessingConfig>) {
    this.db = db;
    this.erpNextClient = erpNextClient;
    this.config = {
      maxConcurrent: 3,
      batchSize: 10,
      retryDelay: 1000,
      maxRetryDelay: 30000,
      timeoutDuration: 30000, // 30 seconds
      healthCheckInterval: 60000, // 1 minute
      circuitBreakerFailureThreshold: 5,
      circuitBreakerResetTimeout: 60000, // 1 minute
      memoryLimit: 100 * 1024 * 1024, // 100MB
      maxProcessingTime: 60000, // 1 minute
      ...config,
    };

    // Initialize metrics
    this.metrics = {
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailures: 0,
      totalRetries: 0,
      totalTimeout: 0,
      averageProcessingTime: 0,
      slowestProcessingTime: 0,
      fastestProcessingTime: Infinity,
      startTime: new Date(),
      lastActivityTime: new Date(),
      memoryUsage: 0,
      networkRequests: 0,
      dataTransferred: 0,
    };

    // Initialize circuit breaker
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };

    // Initialize stats
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      failedItems: 0,
      completedItems: 0,
      averageProcessingTime: 0,
      successRate: 0,
      throughputItemsPerMinute: 0,
      totalProcessingTime: 0,
      errorRate: 0,
      retryRate: 0,
    };

    this.setupNetworkMonitoring();
    this.startPeriodicProcessing();
    this.startHealthMonitoring();
    this.loadStoredData();
  }

  /**
   * Add transaction to queue with comprehensive validation
   */
  async addTransaction(
    transaction: SalesTransaction,
    priority: number = 5
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate transaction data
      const validationResult = this.validateTransaction(transaction);
      if (!validationResult.isValid) {
        return {
          success: false,
          error: `Transaction validation failed: ${validationResult.errors.join(', ')}`,
        };
      }

      // Store transaction in memory map for fast access
      this.transactionStore.set(transaction.id, { ...transaction });

      // First save the transaction to salesQueue
      await this.db.salesQueue.put(transaction);

      // Create comprehensive queue metadata
      const metadata: TransactionQueueMetadata = {
        id: transaction.id,
        priority: Math.max(1, Math.min(10, priority)), // Clamp priority between 1-10
        attempts: 0,
        maxAttempts: 5, // Increased retry attempts
        createdAt: new Date(),
        queueStatus: 'pending',
        errorMessage: undefined,
        nextRetryAt: undefined,
        circuitBreakerState: 'closed',
        circuitBreakerFailures: 0,
        networkRetryCount: 0,
        timeoutCount: 0,
        integrityCheckFailed: false,
      };

      // Store metadata
      this.metadataStore.set(transaction.id, metadata);
      await this.saveQueueMetadata(metadata);

      // Update stats
      this.stats.totalItems++;
      this.stats.pendingItems++;

      // Memory management
      await this.performMemoryCleanup();

      console.log(
        `📥 Added transaction ${transaction.id} to sync queue (priority: ${priority}, validation: passed)`
      );

      // If online and not processing, trigger immediate processing
      if (navigator.onLine && !this.isProcessing) {
        this.processQueue();
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to add transaction ${transaction.id} to queue:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Enhanced queue processing with circuit breaker and comprehensive monitoring
   */
  async processQueue(): Promise<{ success: boolean; processed: number; failed: number }> {
    if (this.isProcessing) {
      console.log('⚠️ Queue processing already in progress');
      return { success: true, processed: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.log('📵 Network offline - skipping queue processing');
      return { success: false, processed: 0, failed: 0 };
    }

    // Check circuit breaker
    if (!this.canProcessRequests()) {
      console.log(`🚫 Circuit breaker ${this.circuitBreaker.state} - skipping queue processing`);
      return { success: false, processed: 0, failed: 0 };
    }

    // Memory check
    if (!this.hasAvailableMemory()) {
      await this.performMemoryCleanup();
      if (!this.hasAvailableMemory()) {
        console.error('❌ Insufficient memory for queue processing');
        return { success: false, processed: 0, failed: 0 };
      }
    }

    this.isProcessing = true;
    this.metrics.lastActivityTime = new Date();

    let processed = 0;
    let failed = 0;

    console.log(`🔄 Starting enhanced queue processing...`);

    try {
      // Get eligible transactions
      const eligibleTransactions = await this.getEligibleTransactions();

      if (eligibleTransactions.length === 0) {
        console.log('✅ No eligible transactions to process');
        return { success: true, processed: 0, failed: 0 };
      }

      console.log(`📊 Processing ${eligibleTransactions.length} eligible transactions`);

      // Sort by priority and creation time
      eligibleTransactions.sort((a, b) => {
        const metaA = this.metadataStore.get(a.id)!;
        const metaB = this.metadataStore.get(b.id)!;

        // Higher priority first
        if (metaA.priority !== metaB.priority) {
          return metaB.priority - metaA.priority;
        }

        // Earlier creation time first
        return metaA.createdAt.getTime() - metaB.createdAt.getTime();
      });

      // Process in controlled batches
      const batches: SalesTransaction[][] = [];
      for (let i = 0; i < eligibleTransactions.length; i += this.config.batchSize) {
        batches.push(eligibleTransactions.slice(i, i + this.config.batchSize));
      }

      for (const batch of batches) {
        // Check conditions before processing each batch
        if (!navigator.onLine || !this.canProcessRequests()) {
          console.log('📵 Stopping batch processing - conditions changed');
          break;
        }

        const batchStartTime = Date.now();

        const batchPromises = batch.map(item =>
          this.processTransactionWithRetry(item, this.config.timeoutDuration)
        );

        const results = await Promise.allSettled(batchPromises);

        const batchSuccess = results.filter(r => r.status === 'fulfilled').length;
        const batchFailed = results.filter(r => r.status === 'rejected').length;

        processed += batchSuccess;
        failed += batchFailed;

        // Update circuit breaker based on batch results
        this.updateCircuitBreaker(batchFailed > 0);

        console.log(
          `📦 Batch processed: ${batchSuccess} success, ${batchFailed} failed (${
            Date.now() - batchStartTime
          }ms)`
        );

        // Adaptive delay between batches
        const adaptiveDelay = this.calculateAdaptiveDelay(batchFailed, batchSuccess);
        if (adaptiveDelay > 0) {
          await this.delay(adaptiveDelay);
        }

        // Memory check after each batch
        if (!this.hasAvailableMemory()) {
          await this.performMemoryCleanup();
        }
      }

      this.stats.lastSyncTime = new Date();
      this.updateMetrics();

      console.log(`✅ Queue processing completed: ${processed} success, ${failed} failed`);

      return { success: true, processed, failed };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Queue processing failed:', errorMessage);

      // Record circuit breaker failure
      this.recordCircuitBreakerFailure();

      return { success: false, processed, failed };
    } finally {
      this.isProcessing = false;
      this.stats.processingItems = 0;
    }
  }

  /**
   * Process single transaction with comprehensive retry logic
   */
  private async processTransactionWithRetry(
    transaction: SalesTransaction,
    timeoutDuration: number
  ): Promise<void> {
    const { id } = transaction;

    if (this.processingQueue.has(id)) {
      console.log(`⚠️ Transaction ${id} already being processed`);
      return;
    }

    // Set processing timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), timeoutDuration);
    });

    const processingPromise = this.processTransaction(transaction);

    try {
      await Promise.race([processingPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'Processing timeout') {
        this.handleTimeout(transaction.id);
      }
      throw error;
    }
  }

  /**
   * Enhanced single transaction processing with comprehensive error handling
   */
  private async processTransaction(transaction: SalesTransaction): Promise<void> {
    const { id } = transaction;

    if (this.processingQueue.has(id)) {
      console.log(`⚠️ Transaction ${id} already being processed`);
      return;
    }

    this.processingQueue.add(id);
    this.stats.processingItems++;

    const processingStartTime = Date.now();

    try {
      const metadata = await this.getQueueMetadata(id);
      if (!metadata) {
        console.warn(`⚠️ No metadata found for transaction ${id}`);
        return;
      }

      // Update metadata with processing start time
      await this.updateQueueMetadata(id, {
        processingStartTime: new Date(),
      });

      console.log(
        `🔄 Processing transaction ${id} (attempt ${metadata.attempts + 1}/${metadata.maxAttempts})`
      );

      // Update status to processing
      await this.updateTransactionStatus(id, 'processing');

      // Pre-processing validation
      const preValidation = await this.performPreProcessingValidation(transaction);
      if (!preValidation.isValid) {
        throw new Error(`Pre-processing validation failed: ${preValidation.errors.join(', ')}`);
      }

      // Convert transaction to ERPNext format with error handling
      const erpInvoice = await this.convertToERPNextInvoiceWithRetry(transaction);

      // Create sales invoice in ERPNext with retry logic
      const createResponse = await this.callERPNextWithRetry(
        () => this.erpNextClient.createSalesInvoice(erpInvoice),
        'createSalesInvoice'
      );

      if (!createResponse.success) {
        throw new Error(`Failed to create sales invoice: ${createResponse.error}`);
      }

      const invoiceName = createResponse.data?.name;
      if (!invoiceName) {
        throw new Error('No invoice name returned from ERPNext');
      }

      // Submit the invoice with retry logic
      const submitResponse = await this.callERPNextWithRetry(
        () => this.erpNextClient.submitDocument('Sales Invoice', invoiceName),
        'submitDocument'
      );

      if (!submitResponse.success) {
        throw new Error(`Failed to submit invoice: ${submitResponse.error}`);
      }

      // Post-processing validation
      const postValidation = await this.performPostProcessingValidation(transaction, invoiceName);
      if (!postValidation.isValid) {
        throw new Error(`Post-processing validation failed: ${postValidation.errors.join(', ')}`);
      }

      // Update transaction with ERPNext references
      transaction.erpnextDocType = 'Sales Invoice';
      transaction.erpnextDocName = invoiceName;
      transaction.syncedAt = new Date();
      transaction.status = 'synced';

      // Save updated transaction
      await this.db.salesQueue.put(transaction);
      this.transactionStore.set(transaction.id, transaction);

      // Save mapping for future reference
      await this.saveTransactionMapping({
        posTransactionId: transaction.id,
        erpnextInvoiceName: invoiceName,
        syncedAt: new Date(),
        syncStatus: 'success',
        processingTime: Date.now() - processingStartTime,
      });

      // Update metadata as completed
      await this.updateQueueMetadata(id, {
        queueStatus: 'completed',
        errorMessage: undefined,
        attempts: metadata.attempts + 1,
        lastAttemptAt: new Date(),
        erpnextDocName: invoiceName,
      });

      this.stats.pendingItems--;
      this.stats.completedItems++;

      console.log(
        `✅ Transaction ${id} synced successfully as ${invoiceName} (${
          Date.now() - processingStartTime
        }ms)`
      );
    } catch (error) {
      await this.handleProcessingError(id, error, processingStartTime);
    } finally {
      this.processingQueue.delete(id);
      this.stats.processingItems = Math.max(0, this.stats.processingItems - 1);
    }
  }

  /**
   * Enhanced error handling with comprehensive retry logic
   */
  private async handleProcessingError(
    transactionId: string,
    error: any,
    processingStartTime: number
  ): Promise<void> {
    const metadata = await this.getQueueMetadata(transactionId);
    if (!metadata) {
      console.error(`❌ No metadata found for transaction ${transactionId} during error handling`);
      return;
    }
    console.error(`❌ Failed to process transaction ${transactionId}:`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = this.categorizeError(error);
    const processingTime = Date.now() - processingStartTime;

    const attempts = metadata.attempts + 1;
    const shouldRetry =
      attempts < metadata.maxAttempts &&
      !this.isNonRetryableError(error) &&
      this.circuitBreaker.state === 'closed';

    // Record error metrics
    this.metrics.totalFailures++;
    this.updateErrorMetrics(errorType, processingTime);

    if (shouldRetry) {
      // Enhanced retry logic with exponential backoff and jitter
      const baseDelay = this.config.retryDelay;
      const exponentialDelay = baseDelay * Math.pow(2, attempts - 1);
      const maxDelay = this.config.maxRetryDelay;
      const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
      const retryDelay = Math.min(exponentialDelay + jitter, maxDelay);

      const nextRetryAt = new Date(Date.now() + retryDelay);

      await this.updateQueueMetadata(transactionId, {
        queueStatus: 'failed',
        errorMessage,
        errorType,
        attempts,
        lastAttemptAt: new Date(),
        nextRetryAt,
        circuitBreakerFailures:
          this.circuitBreaker.state === 'open' ? metadata.circuitBreakerFailures + 1 : 0,
      });

      this.stats.failedItems++;
      this.stats.pendingItems--;
      this.metrics.totalRetries++;

      // Update circuit breaker for non-retryable errors
      if (this.isNetworkError(error) || this.isTimeoutError(error)) {
        this.updateCircuitBreaker(true);
      }

      console.log(
        `⏰ Transaction ${transactionId} failed (${errorType}), retrying at ${nextRetryAt.toISOString()}`
      );
    } else {
      // Max attempts reached or non-retryable error
      const finalStatus = this.isNonRetryableError(error) ? 'cancelled' : 'failed';

      await this.updateQueueMetadata(transactionId, {
        queueStatus: finalStatus,
        errorMessage: `Failed after ${attempts} attempts: ${errorMessage}`,
        errorType,
        attempts,
        lastAttemptAt: new Date(),
        circuitBreakerFailures: metadata.circuitBreakerFailures + 1,
      });

      this.stats.pendingItems--;
      this.stats.failedItems++;

      console.error(
        `❌ Transaction ${transactionId} permanently ${finalStatus} after ${attempts} attempts (${errorType})`
      );
    }
  }

  /**
   * Get eligible transactions for processing
   */
  private async getEligibleTransactions(): Promise<SalesTransaction[]> {
    const eligibleTransactions: SalesTransaction[] = [];

    // Check memory store first for faster access
    for (const [id, metadata] of this.metadataStore.entries()) {
      if (
        metadata.queueStatus === 'pending' &&
        (!metadata.nextRetryAt || metadata.nextRetryAt <= new Date()) &&
        metadata.circuitBreakerState !== 'open'
      ) {
        const transaction = this.transactionStore.get(id);
        if (transaction) {
          eligibleTransactions.push(transaction);
        }
      }
    }

    // Also check database for any transactions not in memory
    const dbTransactions = await this.db.salesQueue.where('status').anyOf(['pending']).toArray();

    for (const transaction of dbTransactions) {
      const metadata = this.metadataStore.get(transaction.id);
      if (
        metadata &&
        metadata.queueStatus === 'pending' &&
        (!metadata.nextRetryAt || metadata.nextRetryAt <= new Date()) &&
        metadata.circuitBreakerState !== 'open' &&
        !this.transactionStore.has(transaction.id)
      ) {
        this.transactionStore.set(transaction.id, transaction);
        eligibleTransactions.push(transaction);
      }
    }

    // Filter out transactions that are already being processed
    return eligibleTransactions.filter(t => !this.processingQueue.has(t.id));
  }

  /**
   * Validate transaction data comprehensively
   */
  private validateTransaction(transaction: SalesTransaction): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required fields validation
    if (!transaction.id || transaction.id.trim() === '') {
      errors.push('Transaction ID is required');
    }

    if (!transaction.receiptNumber || transaction.receiptNumber.trim() === '') {
      errors.push('Receipt number is required');
    }

    if (!transaction.items || transaction.items.length === 0) {
      errors.push('Transaction must have at least one item');
    }

    if (!transaction.branchId || transaction.branchId.trim() === '') {
      errors.push('Branch ID is required');
    }

    // Items validation
    if (transaction.items) {
      for (let i = 0; i < transaction.items.length; i++) {
        const item = transaction.items[i];
        if (!item.itemId || item.itemId.trim() === '') {
          errors.push(`Item ${i + 1}: Item ID is required`);
        }
        if (!item.itemName || item.itemName.trim() === '') {
          errors.push(`Item ${i + 1}: Item name is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${i + 1}: Quantity must be greater than 0`);
        }
        if (!item.unitPrice || item.unitPrice < 0) {
          errors.push(`Item ${i + 1}: Unit price must be greater than or equal to 0`);
        }
      }
    }

    // Financial validation
    if (transaction.totalAmount < 0) {
      errors.push('Total amount cannot be negative');
    }

    if (transaction.subtotalAmount < 0) {
      errors.push('Subtotal amount cannot be negative');
    }

    if (transaction.discountAmount < 0) {
      errors.push('Discount amount cannot be negative');
    }

    if (transaction.discountAmount > transaction.subtotalAmount) {
      errors.push('Discount amount cannot exceed subtotal amount');
    }

    // Date validation
    if (!transaction.createdAt || transaction.createdAt > new Date()) {
      errors.push('Created date is invalid');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Pre-processing validation
   */
  private async performPreProcessingValidation(
    transaction: SalesTransaction
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if transaction already exists in ERPNext
    if (transaction.erpnextDocName) {
      try {
        const existing = await this.erpNextClient.getSalesInvoice(transaction.erpnextDocName);
        if (existing.success) {
          errors.push('Transaction already exists in ERPNext');
        }
      } catch (error) {
        // Ignore validation errors for existing invoice check
      }
    }

    // Check for duplicate transactions
    const existingTransactions = await this.db.salesQueue
      .where('receiptNumber')
      .equals(transaction.receiptNumber)
      .toArray();

    const duplicates = existingTransactions.filter(
      t => t.id !== transaction.id && t.status !== 'synced' && t.status !== 'failed'
    );

    if (duplicates.length > 0) {
      errors.push('Duplicate transaction detected');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Post-processing validation
   */
  private async performPostProcessingValidation(
    transaction: SalesTransaction,
    invoiceName: string
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Verify invoice was created correctly
    try {
      const invoice = await this.erpNextClient.getSalesInvoice(invoiceName);
      if (!invoice.success) {
        errors.push('Created invoice not found in ERPNext');
      } else {
        // Validate invoice data matches transaction
        const invoiceData = invoice.data!;
        if (
          invoiceData.discount_amount !== undefined &&
          Math.abs(invoiceData.discount_amount - transaction.totalAmount) > 0.01
        ) {
          errors.push('Invoice amount does not match transaction amount');
        }
      }
    } catch (error) {
      errors.push('Unable to verify created invoice');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Enhanced ERPNext API call with retry logic
   */
  private async callERPNextWithRetry<T>(
    apiCall: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall();
        this.metrics.networkRequests++;
        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Convert transaction to ERPNext invoice with retry
   */
  private async convertToERPNextInvoiceWithRetry(
    transaction: SalesTransaction
  ): Promise<ERPNextSalesInvoice> {
    return {
      company: 'POS Company', // This should come from configuration
      customer: undefined, // Retail transactions typically don't have specific customers
      posting_date: transaction.createdAt.toISOString().split('T')[0],
      posting_time: transaction.createdAt.toTimeString().split(' ')[0],
      items: transaction.items.map(item => ({
        item_code: item.itemId,
        item_name: item.itemName,
        qty: item.quantity,
        rate: item.unitPrice,
        amount: item.totalPrice,
      })),
      discount_amount: transaction.discountAmount,
      additional_discount_percentage:
        transaction.discountAmount > 0
          ? (transaction.discountAmount / transaction.subtotalAmount) * 100
          : 0,
      apply_discount_on: 'Grand Total',
      remarks: `POS Transaction: ${transaction.receiptNumber}`,
      // Custom POS fields
      pos_branch_id: transaction.branchId,
      pos_device_id: 'device-001', // This should be configurable
      pos_transaction_id: transaction.id,
      pos_receipt_number: transaction.receiptNumber,
    };
  }

  /**
   * Error categorization for better handling
   */
  private categorizeError(error: any): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('timeout') || message.includes('network')) {
        return 'network';
      }
      if (message.includes('authentication') || message.includes('unauthorized')) {
        return 'auth';
      }
      if (message.includes('validation') || message.includes('invalid')) {
        return 'validation';
      }
      if (message.includes('conflict') || message.includes('duplicate')) {
        return 'conflict';
      }
      if (message.includes('rate limit') || message.includes('too many requests')) {
        return 'rate_limit';
      }
      if (message.includes('server error') || message.includes('500')) {
        return 'server';
      }
    }

    return 'unknown';
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const errorType = this.categorizeError(error);
    return ['network', 'server', 'rate_limit'].includes(errorType);
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any): boolean {
    return this.categorizeError(error) === 'network';
  }

  /**
   * Check if error is timeout
   */
  private isTimeoutError(error: any): boolean {
    return error instanceof Error && error.message.toLowerCase().includes('timeout');
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: any): boolean {
    const errorType = this.categorizeError(error);
    return ['validation', 'auth', 'conflict'].includes(errorType);
  }

  /**
   * Handle timeout for transactions
   */
  private handleTimeout(transactionId: string): void {
    console.warn(`⏰ Transaction ${transactionId} timed out`);

    const metadata = this.metadataStore.get(transactionId);
    if (metadata) {
      this.metrics.totalTimeout++;

      this.updateQueueMetadata(transactionId, {
        queueStatus: 'failed',
        timeoutCount: metadata.timeoutCount + 1,
        errorMessage: 'Transaction processing timed out',
        errorType: 'timeout',
        lastAttemptAt: new Date(),
      });
    }
  }

  /**
   * Circuit breaker management
   */
  private canProcessRequests(): boolean {
    switch (this.circuitBreaker.state) {
      case 'closed':
        return true;
      case 'open':
        return Date.now() >= this.circuitBreaker.nextAttemptTime;
      case 'half-open':
        return true;
      default:
        return false;
    }
  }

  private updateCircuitBreaker(hasFailure: boolean): void {
    if (hasFailure) {
      this.circuitBreaker.failures++;

      if (this.circuitBreaker.failures >= this.config.circuitBreakerFailureThreshold) {
        this.circuitBreaker.state = 'open';
        this.circuitBreaker.lastFailureTime = Date.now();
        this.circuitBreaker.nextAttemptTime = Date.now() + this.config.circuitBreakerResetTimeout;

        console.warn(`🚫 Circuit breaker opened after ${this.circuitBreaker.failures} failures`);
      }
    } else {
      // Reset failures on success
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed';
        console.log('✅ Circuit breaker closed - service recovered');
      }

      this.circuitBreaker.failures = 0;
    }
  }

  private recordCircuitBreakerFailure(): void {
    this.updateCircuitBreaker(true);
  }

  /**
   * Memory management
   */
  private hasAvailableMemory(): boolean {
    const memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;
    this.metrics.memoryUsage = memoryUsage;

    return memoryUsage < this.config.memoryLimit;
  }

  private async performMemoryCleanup(): Promise<void> {
    console.log('🧹 Performing memory cleanup...');

    // Remove old completed transactions from memory
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleaned = 0;

    for (const [id, metadata] of this.metadataStore.entries()) {
      if (
        metadata.queueStatus === 'completed' &&
        metadata.lastAttemptAt &&
        metadata.lastAttemptAt < cutoffTime
      ) {
        this.transactionStore.delete(id);
        this.metadataStore.delete(id);
        cleaned++;
      }
    }

    // Cleanup localStorage metadata for old transactions
    await this.cleanupOldMetadata();

    // Force garbage collection if available
    if ((window as any).gc) {
      (window as any).gc();
    }

    console.log(`🧹 Memory cleanup completed: ${cleaned} transactions removed`);
  }

  private async cleanupOldMetadata(): Promise<void> {
    const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('queue_meta_')) {
        try {
          const metadata = JSON.parse(localStorage.getItem(key) ?? '{}');
          if (metadata.lastAttemptAt && new Date(metadata.lastAttemptAt) < cutoffTime) {
            localStorage.removeItem(key);
          }
        } catch (error) {
          // Remove corrupted metadata
          localStorage.removeItem(key);
        }
      }
    }
  }

  /**
   * Adaptive delay calculation
   */
  private calculateAdaptiveDelay(failedCount: number, successCount: number): number {
    const total = failedCount + successCount;
    const failureRate = total > 0 ? failedCount / total : 0;

    if (failureRate > 0.5) {
      return 2000; // High failure rate - longer delay
    } else if (failureRate > 0.2) {
      return 1000; // Medium failure rate
    } else {
      return 500; // Low failure rate - shorter delay
    }
  }

  /**
   * Error metrics tracking
   */
  private updateErrorMetrics(errorType: string, processingTime: number): void {
    // Update metrics for performance thresholds
    if (processingTime > this.performanceThreshold.verySlowProcessing) {
      console.warn(`⚠️ Very slow processing detected: ${processingTime}ms`);
    }

    if ((performance as any).memory?.usedJSHeapSize > this.performanceThreshold.highMemoryUsage) {
      console.warn(`⚠️ High memory usage detected`);
    }
  }

  /**
   * Load stored data on initialization
   */
  private async loadStoredData(): Promise<void> {
    console.log('📥 Loading stored queue data...');

    try {
      // Load transactions from database
      const dbTransactions = await this.db.salesQueue.toArray();
      for (const transaction of dbTransactions) {
        this.transactionStore.set(transaction.id, transaction);
      }

      // Load metadata from localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('queue_meta_')) {
          const metadata = await this.getQueueMetadataFromStorage(key);
          if (metadata) {
            this.metadataStore.set(metadata.id, metadata);
          }
        }
      }

      console.log(
        `📥 Loaded ${this.transactionStore.size} transactions and ${this.metadataStore.size} metadata entries`
      );
    } catch (error) {
      console.error('❌ Failed to load stored data:', error);
    }
  }

  /**
   * Enhanced stats update
   */
  private updateMetrics(): void {
    const now = Date.now();
    const timeSinceStart = now - this.metrics.startTime.getTime();
    const throughput =
      timeSinceStart > 0 ? this.metrics.totalProcessed / (timeSinceStart / 60000) : 0;

    this.stats.throughputItemsPerMinute = throughput;
    this.stats.averageProcessingTime = this.metrics.averageProcessingTime;
    this.stats.errorRate =
      this.metrics.totalProcessed > 0
        ? (this.metrics.totalFailures / this.metrics.totalProcessed) * 100
        : 0;
    this.stats.retryRate =
      this.metrics.totalProcessed > 0
        ? (this.metrics.totalRetries / this.metrics.totalProcessed) * 100
        : 0;
  }

  /**
   * Setup network monitoring
   */
  private setupNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Network connection restored - processing queue');
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failures = 0;
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📵 Network connection lost - queuing transactions');
      this.circuitBreaker.state = 'open';
    });
  }

  /**
   * Start periodic processing
   */
  private startPeriodicProcessing(): void {
    this.processingTimer = window.setInterval(() => {
      if (navigator.onLine && !this.isProcessing) {
        this.retryFailedTransactions().then(() => this.processQueue());
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = window.setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    // Check memory usage
    if (!this.hasAvailableMemory()) {
      console.warn('⚠️ Memory usage is high');
    }

    // Check circuit breaker state
    if (this.circuitBreaker.state === 'open') {
      console.warn(`🚫 Circuit breaker is open - service may be unavailable`);
    }

    // Check for stuck transactions
    const stuckTransactions = Array.from(this.metadataStore.values()).filter(
      meta =>
        meta.queueStatus === 'processing' &&
        meta.processingStartTime &&
        Date.now() - meta.processingStartTime.getTime() > this.config.maxProcessingTime
    );

    if (stuckTransactions.length > 0) {
      console.warn(`⚠️ Found ${stuckTransactions.length} stuck transactions`);

      // Reset stuck transactions
      for (const metadata of stuckTransactions) {
        await this.updateQueueMetadata(metadata.id, {
          queueStatus: 'failed',
          errorMessage: 'Transaction was stuck and reset',
          lastAttemptAt: new Date(),
        });
      }
    }

    // Update activity time
    this.metrics.lastActivityTime = new Date();
  }

  /**
   * Get queue status and statistics
   */
  async getQueueStatus(): Promise<QueueProcessingStats> {
    await this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get all queued transactions
   */
  async getQueuedTransactions(): Promise<SalesTransaction[]> {
    try {
      // Also check database for any missing transactions
      const dbTransactions = await this.db.salesQueue
        .where('status')
        .anyOf(['pending', 'processing', 'failed'])
        .toArray();

      // Merge database transactions with memory store
      for (const transaction of dbTransactions) {
        if (!this.transactionStore.has(transaction.id)) {
          this.transactionStore.set(transaction.id, transaction);
        }
      }

      return Array.from(this.transactionStore.values()).filter(item => item.status !== 'synced');
    } catch (error) {
      console.error('Failed to get queued transactions:', error);
      return [];
    }
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(id: string, status: TransactionStatus): Promise<void> {
    try {
      const transaction = this.transactionStore.get(id) ?? (await this.db.salesQueue.get(id));
      if (transaction) {
        transaction.status = status;
        await this.db.salesQueue.put(transaction);
        this.transactionStore.set(id, transaction);
      }
    } catch (error) {
      console.error(`Failed to update transaction status ${id}:`, error);
    }
  }

  /**
   * Save transaction mapping for reference
   */
  private async saveTransactionMapping(mapping: TransactionMapping): Promise<void> {
    try {
      await this.db.auditLogs.add({
        id: `mapping-${mapping.posTransactionId}`,
        timestamp: new Date(),
        userId: 'system',
        userRole: 'system',
        action: 'transaction_sync',
        resourceType: 'SalesTransaction',
        resourceId: mapping.posTransactionId,
        details: {
          erpnextInvoiceName: mapping.erpnextInvoiceName,
          syncedAt: mapping.syncedAt,
          syncStatus: mapping.syncStatus,
          errors: mapping.errors,
          processingTime: mapping.processingTime,
          networkRequests: mapping.networkRequests,
          dataTransferred: mapping.dataTransferred,
        },
        ipAddress: undefined,
        deviceId: 'system',
      });
    } catch (error) {
      console.error('Failed to save transaction mapping:', error);
    }
  }

  /**
   * Retry failed transactions
   */
  async retryFailedTransactions(): Promise<void> {
    try {
      const failedItems = await this.getFailedTransactionsForRetry();

      if (failedItems.length === 0) {
        console.log('ℹ️ No failed transactions ready for retry');
        return;
      }

      console.log(`🔄 Retrying ${failedItems.length} failed transactions`);

      // Reset status to pending for retry
      for (const item of failedItems) {
        await this.updateQueueMetadata(item.id, {
          queueStatus: 'pending',
          errorMessage: undefined,
          nextRetryAt: undefined,
        });
      }

      // Trigger queue processing
      this.processQueue();
    } catch (error) {
      console.error('Failed to retry failed transactions:', error);
    }
  }

  /**
   * Get failed transactions ready for retry
   */
  private async getFailedTransactionsForRetry(): Promise<SalesTransaction[]> {
    const retryTransactions: SalesTransaction[] = [];

    for (const [id, metadata] of this.metadataStore.entries()) {
      if (
        metadata.queueStatus === 'failed' &&
        metadata.nextRetryAt &&
        metadata.nextRetryAt <= new Date() &&
        metadata.attempts < metadata.maxAttempts
      ) {
        const transaction = this.transactionStore.get(id);
        if (transaction) {
          retryTransactions.push(transaction);
        }
      }
    }

    return retryTransactions;
  }

  /**
   * Force sync all pending transactions
   */
  async forceSyncAll(): Promise<void> {
    console.log('🔄 Forcing sync of all pending transactions...');

    // Reset all failed transactions to pending
    for (const [id, metadata] of this.metadataStore.entries()) {
      if (metadata.queueStatus === 'failed' || metadata.queueStatus === 'stuck') {
        await this.updateQueueMetadata(id, {
          queueStatus: 'pending',
          errorMessage: undefined,
          nextRetryAt: undefined,
          attempts: 0,
        });
      }
    }

    // Trigger processing
    await this.processQueue();
  }

  /**
   * Cancel specific transaction from queue
   */
  async cancelTransaction(transactionId: string, reason?: string): Promise<void> {
    try {
      await this.updateQueueMetadata(transactionId, {
        queueStatus: 'cancelled',
        errorMessage: reason ?? 'Cancelled by user',
        attempts: 0,
        lastAttemptAt: new Date(),
      });

      await this.updateTransactionStatus(transactionId, 'failed');

      this.stats.pendingItems = Math.max(0, this.stats.pendingItems - 1);
      this.stats.failedItems++;

      // Remove from memory stores
      this.transactionStore.delete(transactionId);
      this.metadataStore.delete(transactionId);

      console.log(`🗑️ Transaction ${transactionId} cancelled from queue`);
    } catch (error) {
      console.error(`Failed to cancel transaction ${transactionId}:`, error);
    }
  }

  /**
   * Clear completed transactions from queue
   */
  async clearCompleted(): Promise<void> {
    try {
      const completedTransactions: string[] = [];

      // Identify completed transactions
      for (const [id, metadata] of this.metadataStore.entries()) {
        if (metadata.queueStatus === 'completed' || metadata.queueStatus === 'cancelled') {
          completedTransactions.push(id);
        }
      }

      // Remove from database
      for (const transactionId of completedTransactions) {
        await this.db.salesQueue.delete(transactionId);
        await this.removeQueueMetadata(transactionId);
        this.transactionStore.delete(transactionId);
        this.metadataStore.delete(transactionId);
      }

      console.log(
        `🧹 Cleared ${completedTransactions.length} completed/cancelled transactions from queue`
      );
    } catch (error) {
      console.error('Failed to clear completed transactions:', error);
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<SalesTransaction | null> {
    try {
      return (
        this.transactionStore.get(transactionId) ??
        (await this.db.salesQueue.get(transactionId)) ??
        null
      );
    } catch (error) {
      console.error(`Failed to get transaction ${transactionId}:`, error);
      return null;
    }
  }

  /**
   * Queue metadata storage methods
   */
  private async saveQueueMetadata(metadata: TransactionQueueMetadata): Promise<void> {
    try {
      const key = `queue_meta_${metadata.id}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          ...metadata,
          // Convert dates to strings for storage
          lastAttemptAt: metadata.lastAttemptAt?.toISOString(),
          nextRetryAt: metadata.nextRetryAt?.toISOString(),
          createdAt: metadata.createdAt.toISOString(),
          processingStartTime: metadata.processingStartTime?.toISOString(),
        })
      );
    } catch (error) {
      console.error('Failed to save queue metadata:', error);
    }
  }

  private async getQueueMetadata(id: string): Promise<TransactionQueueMetadata | null> {
    // Check memory store first for faster access
    const memoryMetadata = this.metadataStore.get(id);
    if (memoryMetadata) {
      return memoryMetadata;
    }

    // Fallback to localStorage
    return this.getQueueMetadataFromStorage(`queue_meta_${id}`);
  }

  private async getQueueMetadataFromStorage(key: string): Promise<TransactionQueueMetadata | null> {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const data = JSON.parse(stored);
      const metadata: TransactionQueueMetadata = {
        ...data,
        lastAttemptAt: data.lastAttemptAt ? new Date(data.lastAttemptAt) : undefined,
        nextRetryAt: data.nextRetryAt ? new Date(data.nextRetryAt) : undefined,
        createdAt: new Date(data.createdAt),
        processingStartTime: data.processingStartTime
          ? new Date(data.processingStartTime)
          : undefined,
      };

      // Store in memory for faster future access
      this.metadataStore.set(metadata.id, metadata);
      return metadata;
    } catch (error) {
      console.error('Failed to get queue metadata:', error);
      return null;
    }
  }

  private async updateQueueMetadata(
    id: string,
    updates: Partial<TransactionQueueMetadata>
  ): Promise<void> {
    const existing = await this.getQueueMetadata(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.metadataStore.set(id, updated);
      await this.saveQueueMetadata(updated);
    }
  }

  private async removeQueueMetadata(id: string): Promise<void> {
    try {
      const key = `queue_meta_${id}`;
      localStorage.removeItem(key);
      this.metadataStore.delete(id);
    } catch (error) {
      console.error('Failed to remove queue metadata:', error);
    }
  }

  /**
   * Update statistics
   */
  private async updateStats(): Promise<void> {
    try {
      const allItems = Array.from(this.transactionStore.values());

      this.stats.totalItems = allItems.length;
      this.stats.pendingItems = allItems.filter(item => item.status === 'pending').length;
      this.stats.processingItems = allItems.filter(item => item.status === 'processing').length;
      this.stats.failedItems = allItems.filter(item => item.status === 'failed').length;
      this.stats.completedItems = allItems.filter(item => item.status === 'synced').length;

      // Calculate success rate
      const totalProcessed = this.stats.completedItems + this.stats.failedItems;
      this.stats.successRate =
        totalProcessed > 0 ? (this.stats.completedItems / totalProcessed) * 100 : 0;
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.processingQueue.clear();
    this.transactionStore.clear();
    this.metadataStore.clear();

    console.log('🗑️ TransactionQueueManager destroyed');
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
