/**
 * Payment Processing Workflow - Phase 2
 * Enhanced payment processing with validation, confirmation, and error handling
 * Supports multiple payment methods and split payments
 */

import { PaymentBreakdown, CartItem } from '@/types';

export interface PaymentRequest {
  paymentMethod: PaymentBreakdown;
  totalAmount: number;
  items: CartItem[];
  customerInfo?: PaymentCustomerInfo;
  options: PaymentOptions;
}

export interface PaymentCustomerInfo {
  id?: string;
  name?: string;
  memberId?: string;
  loyaltyPoints?: number;
  creditBalance?: number;
}

export interface PaymentOptions {
  allowSplitPayment: boolean;
  maxSplitMethods: number;
  requireApproval: boolean;
  supervisorApproval?: boolean;
  customValidation?: PaymentValidation[];
  timeout: number;
  retryAttempts: number;
}

export interface PaymentValidation {
  rule: string;
  parameters: Record<string, any>;
  message: string;
  severity: 'error' | 'warning';
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  receiptNumber?: string;
  change?: number;
  approvalRequired?: boolean;
  approvalId?: string;
  errors: PaymentError[];
  warnings: PaymentWarning[];
  processingTime: number;
}

export interface PaymentError {
  code: string;
  message: string;
  field?: string;
  recoverable: boolean;
  retryable: boolean;
}

export interface PaymentWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface SplitPaymentCalculation {
  allocation: PaymentBreakdown;
  remainingAmount: number;
  recommendations: PaymentRecommendation[];
}

export interface PaymentRecommendation {
  method: keyof PaymentBreakdown;
  amount: number;
  reason: string;
  benefits: string[];
}

export interface PaymentProcessingStats {
  totalProcessed: number;
  successRate: number;
  averageProcessingTime: number;
  commonErrors: Record<string, number>;
  approvalRate: number;
}

export interface ApprovalRequest {
  id: string;
  transactionId: string;
  requestType: 'supervisor_override' | 'split_payment' | 'large_amount' | 'custom_validation';
  amount: number;
  reason: string;
  requestedBy: string;
  customerInfo?: PaymentCustomerInfo;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export class PaymentProcessor {
  private static instance: PaymentProcessor;
  private pendingApprovals = new Map<string, ApprovalRequest>();
  private processingStats: PaymentProcessingStats = {
    totalProcessed: 0,
    successRate: 0,
    averageProcessingTime: 0,
    commonErrors: {},
    approvalRate: 0
  };

  // Event listeners
  private onPaymentSuccessCallbacks: ((result: PaymentResult) => void)[] = [];
  private onPaymentFailureCallbacks: ((error: PaymentError) => void)[] = [];
  private onApprovalRequiredCallbacks: ((request: ApprovalRequest) => void)[] = [];

  constructor() {
    this.initializePaymentProcessor();
  }

  static getInstance(): PaymentProcessor {
    if (!PaymentProcessor.instance) {
      PaymentProcessor.instance = new PaymentProcessor();
    }
    return PaymentProcessor.instance;
  }

  /**
   * Initialize payment processor
   */
  private initializePaymentProcessor(): void {
    console.log('💳 Initializing Payment Processor...');
    
    // Set up cleanup for expired approvals
    this.startApprovalCleanup();
    
    console.log('✅ Payment Processor initialized');
  }

  /**
   * Process payment with comprehensive validation and workflow
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const startTime = performance.now();
    const transactionId = crypto.randomUUID();
    
    console.log(`💳 Starting payment processing: ${transactionId}`);
    
    try {
      // Step 1: Validate payment request
      const validationResult = await this.validatePaymentRequest(request);
      
      if (!validationResult.isValid) {
        return this.createErrorResult(
          transactionId,
          validationResult.errors,
          performance.now() - startTime
        );
      }

      // Step 2: Check if approval is required
      const approvalRequirement = await this.checkApprovalRequirement(request);
      
      if (approvalRequirement.required) {
        const approvalRequest = await this.requestApproval(approvalRequirement);
        
        if (approvalRequest) {
          return {
            success: false,
            transactionId,
            approvalRequired: true,
            approvalId: approvalRequest.id,
            errors: [{
              code: 'APPROVAL_REQUIRED',
              message: approvalRequirement.reason || 'Approval required',
              recoverable: false,
              retryable: false
            }],
            warnings: [],
            processingTime: performance.now() - startTime
          };
        }
      }

      // Step 3: Process split payment if applicable
      const splitPaymentResult = await this.processSplitPayment(request);
      
      if (splitPaymentResult && !splitPaymentResult.success) {
        return splitPaymentResult;
      }

      // Step 4: Execute payment processing
      const paymentResult = await this.executePayment(splitPaymentResult);
      
      // Step 5: Handle payment result
      return this.handlePaymentResult(paymentResult, performance.now() - startTime);
      
    } catch (error) {
      console.error('❌ Payment processing failed:', error);
      
      return {
        success: false,
        transactionId,
        errors: [{
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          recoverable: false,
          retryable: true
        }],
        warnings: [],
        processingTime: performance.now() - startTime
      };
    }
  }

  /**
   * Validate payment request comprehensively
   */
  private async validatePaymentRequest(request: PaymentRequest): Promise<{
    isValid: boolean;
    errors: PaymentError[];
    warnings: PaymentWarning[];
  }> {
    const errors: PaymentError[] = [];
    const warnings: PaymentWarning[] = [];

    // Basic validation
    if (request.totalAmount <= 0) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Total amount must be greater than zero',
        field: 'totalAmount',
        recoverable: false,
        retryable: false
      });
    }

    if (request.items.length === 0) {
      errors.push({
        code: 'NO_ITEMS',
        message: 'Payment cannot be processed without items',
        field: 'items',
        recoverable: false,
        retryable: false
      });
    }

    // Payment method validation
    const paymentValidation = this.validatePaymentMethods(request.paymentMethod, request.totalAmount);
    errors.push(...paymentValidation.errors);
    warnings.push(...paymentValidation.warnings);

    // Custom validation rules
    for (const validation of request.options.customValidation || []) {
      const customValidation = await this.applyCustomValidation(validation, request);
      errors.push(...customValidation.errors);
      warnings.push(...customValidation.warnings);
    }

    // Split payment validation
    if (request.options.allowSplitPayment) {
      const splitValidation = this.validateSplitPayment(request);
      errors.push(...splitValidation.errors);
      warnings.push(...splitValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate individual payment methods
   */
  private validatePaymentMethods(payment: PaymentBreakdown, totalAmount: number): {
    errors: PaymentError[];
    warnings: PaymentWarning[];
  } {
    const errors: PaymentError[] = [];
    const warnings: PaymentWarning[] = [];

    const totalPayment = payment.cash + payment.card + payment.ewallet + payment.bankTransfer + payment.credit;

    if (totalPayment <= 0) {
      errors.push({
        code: 'NO_PAYMENT',
        message: 'At least one payment method must be selected',
        recoverable: false,
        retryable: false
      });
    }

    if (totalPayment < totalAmount) {
      errors.push({
        code: 'INSUFFICIENT_PAYMENT',
        message: `Payment amount (${totalPayment.toFixed(2)}) is less than total amount (${totalAmount.toFixed(2)})`,
        recoverable: true,
        retryable: true
      });
    }

    // Validate individual payment amounts
    for (const [method, amount] of Object.entries(payment)) {
      if (amount < 0) {
        errors.push({
          code: 'NEGATIVE_AMOUNT',
          message: `Payment amount for ${method} cannot be negative`,
          field: method,
          recoverable: false,
          retryable: false
        });
      }
    }

    // Warning for large cash payment
    if (payment.cash > totalAmount * 0.8 && payment.cash > 1000000) {
      warnings.push({
        code: 'LARGE_CASH_PAYMENT',
        message: 'Large cash payment detected',
        suggestion: 'Consider processing additional payment methods for large amounts'
      });
    }

    return { errors, warnings };
  }

  /**
   * Check if approval is required for this payment
   */
  private async checkApprovalRequirement(request: PaymentRequest): Promise<{
    required: boolean;
    reason?: string;
    type?: ApprovalRequest['requestType'];
  }> {
    // Check for large amount (over 10 million IDR)
    if (request.totalAmount > 10000000) {
      return {
        required: true,
        reason: 'Large amount transaction requires supervisor approval',
        type: 'large_amount'
      };
    }

    // Check for split payment with too many methods
    const activeMethods = this.getActivePaymentMethods(request.paymentMethod);
    if (activeMethods.length > request.options.maxSplitMethods) {
      return {
        required: true,
        reason: `Split payment with ${activeMethods.length} methods requires approval`,
        type: 'split_payment'
      };
    }

    // Check if custom validation requires approval
    for (const validation of request.options.customValidation || []) {
      if (validation.rule === 'supervisor_override') {
        return {
          required: true,
          reason: 'Supervisor override requires approval',
          type: 'supervisor_override'
        };
      }
    }

    return { required: false };
  }

  /**
   * Process split payment calculation and optimization
   */
  private async processSplitPayment(request: PaymentRequest): Promise<PaymentResult | null> {
    if (!request.options.allowSplitPayment) {
      return null;
    }

    const activeMethods = this.getActivePaymentMethods(request.paymentMethod);
    
    if (activeMethods.length <= 1) {
      return null; // Not a split payment
    }

    try {
      // Calculate optimal split
      const splitCalculation = await this.calculateOptimalSplit(request);
      
      // Recommend improvements
      const recommendations = this.generatePaymentRecommendations(request);
      
      // Apply recommendations if beneficial
      if (recommendations.length > 0) {
        const improvedPayment = await this.applyPaymentRecommendations(
          request.paymentMethod, 
          recommendations
        );
        
        console.log('💡 Applied payment recommendations for better efficiency');
        
        return {
          success: true,
          transactionId: '',
          errors: [],
          warnings: recommendations.map(rec => ({
            code: 'PAYMENT_RECOMMENDATION',
            message: `Recommended: ${rec.method} - ${rec.reason}`,
            suggestion: rec.benefits.join(', ')
          })),
          processingTime: 0
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Split payment processing failed:', error);
      
      return {
        success: false,
        transactionId: '',
        errors: [{
          code: 'SPLIT_PAYMENT_ERROR',
          message: 'Failed to process split payment',
          recoverable: true,
          retryable: true
        }],
        warnings: [],
        processingTime: 0
      };
    }
  }

  /**
   * Calculate optimal payment split
   */
  private async calculateOptimalSplit(request: PaymentRequest): Promise<SplitPaymentCalculation> {
    const payment = request.paymentMethod;
    const totalAmount = request.totalAmount;
    
    // Calculate remaining amount after initial allocation
    const currentTotal = payment.cash + payment.card + payment.ewallet + payment.bankTransfer + payment.credit;
    const remainingAmount = Math.max(0, totalAmount - currentTotal);
    
    // Generate recommendations for better allocation
    const recommendations: PaymentRecommendation[] = [];
    
    // Recommend reducing cash if it's too large
    if (payment.cash > totalAmount * 0.7) {
      recommendations.push({
        method: 'ewallet',
        amount: Math.min(payment.cash * 0.3, remainingAmount),
        reason: 'Reduce cash handling by using e-wallet',
        benefits: ['Faster checkout', 'Reduced cash handling', 'Better tracking']
      });
    }
    
    // Recommend card for larger amounts
    if (totalAmount > 500000 && payment.card < totalAmount * 0.5) {
      recommendations.push({
        method: 'card',
        amount: Math.min(totalAmount * 0.3, remainingAmount),
        reason: 'Use card for larger transaction amounts',
        benefits: ['Lower transaction costs', 'Better security', 'Detailed tracking']
      });
    }
    
    return {
      allocation: payment,
      remainingAmount,
      recommendations
    };
  }

  /**
   * Generate payment method recommendations
   */
  private generatePaymentRecommendations(request: PaymentRequest): PaymentRecommendation[] {
    const recommendations: PaymentRecommendation[] = [];
    const payment = request.paymentMethod;
    const totalAmount = request.totalAmount;
    
    // E-wallet recommendations
    if (payment.ewallet === 0 && totalAmount < 200000) {
      recommendations.push({
        method: 'ewallet',
        amount: totalAmount * 0.3,
        reason: 'E-wallet provides faster checkout for small amounts',
        benefits: ['Contactless', 'Instant confirmation', 'Loyalty points']
      });
    }
    
    // Card recommendations for specific amounts
    if ([50000, 100000, 500000].includes(Math.round(totalAmount)) && payment.card === 0) {
      recommendations.push({
        method: 'card',
        amount: totalAmount,
        reason: 'Round amounts processed efficiently with card',
        benefits: ['Fast processing', 'Low fees', 'Secure transaction']
      });
    }
    
    return recommendations;
  }

  /**
   * Apply payment recommendations
   */
  private async applyPaymentRecommendations(
    payment: PaymentBreakdown, 
    recommendations: PaymentRecommendation[]
  ): Promise<PaymentBreakdown> {
    const optimized = { ...payment };
    
    for (const recommendation of recommendations) {
      if (optimized[recommendation.method] === 0) {
        optimized[recommendation.method] = recommendation.amount;
        console.log(`💡 Applied recommendation: ${recommendation.method} - ${recommendation.amount.toFixed(2)}`);
      }
    }
    
    return optimized;
  }

  /**
   * Execute actual payment processing
   */
  private async executePayment(splitResult: PaymentResult | null): Promise<PaymentResult> {
    if (splitResult && !splitResult.success) {
      return splitResult;
    }

    // For now, simulate payment processing
    // In a real implementation, this would integrate with actual payment gateways
    
    const paymentId = crypto.randomUUID();
    const change = Math.max(0, 1000000 - 500000); // Mock calculation
    
    return {
      success: true,
      transactionId: paymentId,
      receiptNumber: `RCP-${Date.now()}`,
      change,
      errors: [],
      warnings: [],
      processingTime: 1500 // Mock processing time
    };
  }

  /**
   * Handle payment result and update statistics
   */
  private handlePaymentResult(result: PaymentResult, processingTime: number): PaymentResult {
    // Update statistics
    this.processingStats.totalProcessed++;
    
    if (result.success) {
      this.processingStats.successRate = (
        (this.processingStats.successRate * (this.processingStats.totalProcessed - 1) + 100) / 
        this.processingStats.totalProcessed
      );
    } else {
      this.processingStats.successRate = (
        (this.processingStats.successRate * (this.processingStats.totalProcessed - 1)) / 
        this.processingStats.totalProcessed
      );
      
      // Count common errors
      for (const error of result.errors) {
        this.processingStats.commonErrors[error.code] = 
          (this.processingStats.commonErrors[error.code] || 0) + 1;
      }
    }
    
    // Update average processing time
    this.processingStats.averageProcessingTime = (
      (this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) + processingTime) / 
      this.processingStats.totalProcessed
    );
    
    // Notify success callbacks
    if (result.success) {
      this.onPaymentSuccessCallbacks.forEach(callback => callback(result));
    } else {
      this.onPaymentFailureCallbacks.forEach(callback => {
        if (result.errors.length > 0) {
          callback(result.errors[0]);
        }
      });
    }
    
    return result;
  }

  /**
   * Request supervisor approval
   */
  private async requestApproval(requirement: {
    required: boolean;
    reason?: string;
    type?: ApprovalRequest['requestType'];
  }): Promise<ApprovalRequest | null> {
    if (!requirement.required || !requirement.type) {
      return null;
    }

    const approvalRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      requestType: requirement.type,
      amount: 0, // This would be set from the payment request
      reason: requirement.reason || 'Approval required',
      requestedBy: 'current_user', // This would be from auth context
      timestamp: new Date(),
      status: 'pending'
    };

    // Store approval request
    this.pendingApprovals.set(approvalRequest.id, approvalRequest);
    
    // Notify approval listeners
    this.onApprovalRequiredCallbacks.forEach(callback => callback(approvalRequest));
    
    console.log(`🔒 Approval requested: ${approvalRequest.id} - ${requirement.reason}`);
    
    return approvalRequest;
  }

  /**
   * Approve a pending approval request
   */
  async approvePayment(approvalId: string, approvedBy: string): Promise<boolean> {
    const approval = this.pendingApprovals.get(approvalId);
    
    if (!approval) {
      return false;
    }
    
    approval.status = 'approved';
    
    console.log(`✅ Payment approved: ${approvalId} by ${approvedBy}`);
    
    return true;
  }

  /**
   * Get active payment methods from payment breakdown
   */
  private getActivePaymentMethods(payment: PaymentBreakdown): string[] {
    return Object.entries(payment)
      .filter(([_, amount]) => amount > 0)
      .map(([method, _]) => method);
  }

  /**
   * Apply custom validation rule
   */
  private async applyCustomValidation(
    validation: PaymentValidation, 
    request: PaymentRequest
  ): Promise<{ errors: PaymentError[]; warnings: PaymentWarning[] }> {
    const errors: PaymentError[] = [];
    const warnings: PaymentWarning[] = [];

    try {
      switch (validation.rule) {
        case 'supervisor_override':
          // Require supervisor approval for price overrides
          if (request.options.supervisorApproval) {
            warnings.push({
              code: 'SUPERVISOR_OVERRIDE',
              message: validation.message,
              suggestion: 'Supervisor approval required for price modifications'
            });
          }
          break;
          
        case 'member_only_payment':
          // Only allow specific payment methods for members
          if (request.customerInfo?.memberId) {
            if (request.paymentMethod.credit > 0) {
              warnings.push({
                code: 'CREDIT_NOT_ALLOWED',
                message: 'Credit payment not allowed for member transactions',
                suggestion: 'Use cash or card payment method'
              });
            }
          }
          break;
          
        case 'max_cash_amount':
          // Limit cash payment amount
          const maxCash = validation.parameters.maxCash || 2000000;
          if (request.paymentMethod.cash > maxCash) {
            errors.push({
              code: 'EXCESSIVE_CASH',
              message: `Cash payment exceeds maximum allowed amount of ${maxCash.toLocaleString()}`,
              field: 'cash',
              recoverable: true,
              retryable: true
            });
          }
          break;
          
        default:
          console.warn(`Unknown validation rule: ${validation.rule}`);
      }
      
    } catch (error) {
      console.error(`Validation rule ${validation.rule} failed:`, error);
      
      errors.push({
        code: 'VALIDATION_ERROR',
        message: `Validation rule ${validation.rule} failed: ${error}`,
        recoverable: false,
        retryable: false
      });
    }

    return { errors, warnings };
  }

  /**
   * Create error result
   */
  private createErrorResult(
    transactionId: string, 
    errors: PaymentError[], 
    processingTime: number
  ): PaymentResult {
    return {
      success: false,
      transactionId,
      errors,
      warnings: [],
      processingTime
    };
  }

  /**
   * Start approval cleanup process
   */
  private startApprovalCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const expiredIds: string[] = [];
      
      for (const [id, approval] of this.pendingApprovals.entries()) {
        // Expire approvals older than 5 minutes
        if (now - approval.timestamp.getTime() > 5 * 60 * 1000) {
          approval.status = 'expired';
          expiredIds.push(id);
        }
      }
      
      if (expiredIds.length > 0) {
        expiredIds.forEach(id => this.pendingApprovals.delete(id));
        console.log(`🧹 Cleaned up ${expiredIds.length} expired approvals`);
      }
    }, 60000); // Check every minute
  }

  /**
   * Get payment processing statistics
   */
  getStatistics(): PaymentProcessingStats {
    return { ...this.processingStats };
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      approval => approval.status === 'pending'
    );
  }

  // Event notification methods

  public onPaymentSuccess(callback: (result: PaymentResult) => void): void {
    this.onPaymentSuccessCallbacks.push(callback);
  }

  public onPaymentFailure(callback: (error: PaymentError) => void): void {
    this.onPaymentFailureCallbacks.push(callback);
  }

  public onApprovalRequired(callback: (request: ApprovalRequest) => void): void {
    this.onApprovalRequiredCallbacks.push(callback);
  }

  // Validation helper methods

  private validateSplitPayment(request: PaymentRequest): { errors: PaymentError[]; warnings: PaymentWarning[] } {
    const errors: PaymentError[] = [];
    const warnings: PaymentWarning[] = [];

    const activeMethods = this.getActivePaymentMethods(request.paymentMethod);
    
    if (activeMethods.length > request.options.maxSplitMethods) {
      errors.push({
        code: 'TOO_MANY_SPLIT_METHODS',
        message: `Cannot use more than ${request.options.maxSplitMethods} payment methods`,
        recoverable: true,
        retryable: true
      });
    }

    // Check for inefficient split combinations
    if (activeMethods.includes('cash') && activeMethods.includes('credit')) {
      warnings.push({
        code: 'INEFFICIENT_SPLIT',
        message: 'Cash and credit combination may slow down processing',
        suggestion: 'Consider using one method or combining with faster methods like card or e-wallet'
      });
    }

    return { errors, warnings };
  }
}

// Export singleton instance
export const paymentProcessor = PaymentProcessor.getInstance();