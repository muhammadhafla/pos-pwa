/**
 * React Hook for Transaction State Management
 * Provides easy access to transaction state and operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  TransactionState, 
  TransactionStep, 
  CartItem, 
  PaymentBreakdown
} from '@/types';
import { transactionStateManager, TransactionValidationResult } from '@/services/transaction/TransactionStateManager';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'react-hot-toast';

interface UseTransactionStateReturn {
  // Transaction state
  transactionId: string | null;
  transactionState: TransactionState | null;
  currentStep: TransactionStep;
  items: CartItem[];
  payment: PaymentBreakdown | null;
  isLoading: boolean;
  validation: TransactionValidationResult | null;
  
  // Actions
  startTransaction: () => Promise<string>;
  addItems: (items: CartItem[]) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateItemQuantity: (itemId: string, quantity: number) => Promise<void>;
  setPayment: (payment: PaymentBreakdown) => Promise<void>;
  nextStep: () => Promise<void>;
  previousStep: () => Promise<void>;
  validateTransaction: () => Promise<TransactionValidationResult>;
  completeTransaction: () => Promise<string | null>;
  suspendTransaction: () => Promise<void>;
  resumeTransaction: (transactionId: string) => Promise<void>;
  cancelTransaction: (reason: string) => Promise<void>;
  
  // Utilities
  canProceedToNext: boolean;
  canGoBack: boolean;
  totalAmount: number;
  subtotal: number;
  tax: number;
  discount: number;
}

export const useTransactionState = (): UseTransactionStateReturn => {
  // Transaction state
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [transactionState, setTransactionState] = useState<TransactionState | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [validation, setValidation] = useState<TransactionValidationResult | null>(null);
  
  // Auth store for user context
  const { user } = useAuthStore();
  
  // Refs for cleanup
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save functionality
  const autoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (transactionId && items.length > 0) {
        try {
          await transactionStateManager.addItemsToTransaction(transactionId, items);
          console.log('💾 Transaction auto-saved');
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }
    }, 2000); // Auto-save after 2 seconds of inactivity
  }, [transactionId, items]);

  // Auto-validate functionality
  const autoValidate = useCallback(() => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    validationTimeoutRef.current = setTimeout(async () => {
      if (transactionId) {
        try {
          const result = await transactionStateManager.validateTransaction(transactionId);
          setValidation(result);
        } catch (error) {
          console.error('Validation failed:', error);
        }
      }
    }, 1000); // Validate after 1 second of changes
  }, [transactionId]);

  // Load transaction state
  const loadTransaction = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const state = await transactionStateManager.getTransaction(id);
      const context = transactionStateManager.getTransactionContext(id);
      
      if (state && context) {
        setTransactionState(state);
        setTransactionId(id);
        setItems(context.data.items || []);
        setPayment(context.data.payment || null);
      } else {
        toast.error('Transaction not found');
      }
    } catch (error) {
      console.error('Failed to load transaction:', error);
      toast.error('Failed to load transaction');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start new transaction
  const startTransaction = useCallback(async (): Promise<string> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    try {
      const id = await transactionStateManager.startTransaction(
        user.id,
        user.branchId,
        'device-' + Date.now() // Simple device ID for now
      );
      
      setTransactionId(id);
      setTransactionState(await transactionStateManager.getTransaction(id));
      setItems([]);
      setPayment(null);
      setValidation(null);
      
      toast.success('New transaction started');
      return id;
    } catch (error) {
      console.error('Failed to start transaction:', error);
      toast.error('Failed to start transaction');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Add items to transaction
  const addItems = useCallback(async (newItems: CartItem[]) => {
    if (!transactionId) return;

    setIsLoading(true);
    try {
      await transactionStateManager.addItemsToTransaction(transactionId, newItems);
      setItems(prev => {
        const updated = [...prev];
        newItems.forEach(newItem => {
          const existingIndex = updated.findIndex(item => item.itemId === newItem.itemId);
          if (existingIndex >= 0) {
            updated[existingIndex].quantity += newItem.quantity;
            updated[existingIndex].totalPrice = updated[existingIndex].quantity * updated[existingIndex].unitPrice;
          } else {
            updated.push(newItem);
          }
        });
        return updated;
      });
      
      autoSave();
      autoValidate();
    } catch (error) {
      console.error('Failed to add items:', error);
      toast.error('Failed to add items');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId, autoSave, autoValidate]);

  // Remove item from transaction
  const removeItem = useCallback(async (itemId: string) => {
    if (!transactionId) return;

    setIsLoading(true);
    try {
      await transactionStateManager.removeItemFromTransaction(transactionId, itemId);
      setItems(prev => prev.filter(item => item.itemId !== itemId));
      
      autoSave();
      autoValidate();
    } catch (error) {
      console.error('Failed to remove item:', error);
      toast.error('Failed to remove item');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId, autoSave, autoValidate]);

  // Update item quantity
  const updateItemQuantity = useCallback(async (itemId: string, quantity: number) => {
    if (!transactionId) return;

    setIsLoading(true);
    try {
      await transactionStateManager.updateItemQuantity(transactionId, itemId, quantity);
      setItems(prev => {
        const updated = [...prev];
        const itemIndex = updated.findIndex(item => item.itemId === itemId);
        if (itemIndex >= 0) {
          if (quantity <= 0) {
            updated.splice(itemIndex, 1);
          } else {
            updated[itemIndex].quantity = quantity;
            updated[itemIndex].totalPrice = quantity * updated[itemIndex].unitPrice;
          }
        }
        return updated;
      });
      
      autoSave();
      autoValidate();
    } catch (error) {
      console.error('Failed to update item quantity:', error);
      toast.error('Failed to update item quantity');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId, autoSave, autoValidate]);

  // Set payment information
  const setPaymentInfo = useCallback(async (newPayment: PaymentBreakdown) => {
    if (!transactionId) return;

    setIsLoading(true);
    try {
      await transactionStateManager.setPayment(transactionId, newPayment);
      setPayment(newPayment);
      
      autoSave();
      autoValidate();
    } catch (error) {
      console.error('Failed to set payment:', error);
      toast.error('Failed to set payment');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId, autoSave, autoValidate]);

  // Move to next step
  const nextStep = useCallback(async () => {
    if (!transactionId || !transactionState) return;

    setIsLoading(true);
    try {
      const stepOrder: TransactionStep[] = ['items', 'pricing', 'payment', 'confirmation', 'printing'];
      const currentIndex = stepOrder.indexOf(transactionState.currentStep);
      
      if (currentIndex < stepOrder.length - 1) {
        const nextStep = stepOrder[currentIndex + 1];
        await transactionStateManager.updateTransactionStep(transactionId, nextStep);
        
        const updatedState = await transactionStateManager.getTransaction(transactionId);
        setTransactionState(updatedState);
        
        toast.success(`Moved to ${nextStep} step`);
      }
    } catch (error) {
      console.error('Failed to move to next step:', error);
      toast.error('Cannot proceed to next step');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId, transactionState]);

  // Move to previous step
  const previousStep = useCallback(async () => {
    if (!transactionId || !transactionState) return;

    setIsLoading(true);
    try {
      const stepOrder: TransactionStep[] = ['items', 'pricing', 'payment', 'confirmation', 'printing'];
      const currentIndex = stepOrder.indexOf(transactionState.currentStep);
      
      if (currentIndex > 0) {
        const prevStep = stepOrder[currentIndex - 1];
        await transactionStateManager.updateTransactionStep(transactionId, prevStep);
        
        const updatedState = await transactionStateManager.getTransaction(transactionId);
        setTransactionState(updatedState);
        
        toast.success(`Moved to ${prevStep} step`);
      }
    } catch (error) {
      console.error('Failed to move to previous step:', error);
      toast.error('Cannot go back to previous step');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId, transactionState]);

  // Validate transaction
  const validateTransaction = useCallback(async (): Promise<TransactionValidationResult> => {
    if (!transactionId) {
      return {
        isValid: false,
        errors: ['No active transaction'],
        warnings: [],
        canProceed: false
      };
    }

    try {
      const result = await transactionStateManager.validateTransaction(transactionId);
      setValidation(result);
      return result;
    } catch (error) {
      console.error('Validation failed:', error);
      const errorResult: TransactionValidationResult = {
        isValid: false,
        errors: ['Validation failed'],
        warnings: [],
        canProceed: false
      };
      setValidation(errorResult);
      return errorResult;
    }
  }, [transactionId]);

  // Complete transaction
  const completeTransaction = useCallback(async (): Promise<string | null> => {
    if (!transactionId) return null;

    setIsLoading(true);
    try {
      const result = await transactionStateManager.completeTransaction(transactionId);
      
      if (result) {
        toast.success(`Transaction completed: ${result.receiptNumber}`);
        
        // Reset state
        setTransactionId(null);
        setTransactionState(null);
        setItems([]);
        setPayment(null);
        setValidation(null);
        
        return result.id;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to complete transaction:', error);
      toast.error('Failed to complete transaction');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [transactionId]);

  // Suspend transaction
  const suspendTransaction = useCallback(async () => {
    if (!transactionId) return;

    setIsLoading(true);
    try {
      await transactionStateManager.suspendTransaction(transactionId);
      
      toast.success('Transaction suspended');
      
      // Reset state
      setTransactionId(null);
      setTransactionState(null);
      setItems([]);
      setPayment(null);
      setValidation(null);
    } catch (error) {
      console.error('Failed to suspend transaction:', error);
      toast.error('Failed to suspend transaction');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId]);

  // Resume transaction
  const resumeTransaction = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const state = await transactionStateManager.resumeTransaction(id);
      
      if (state) {
        await loadTransaction(id);
        toast.success('Transaction resumed');
      } else {
        toast.error('Could not resume transaction');
      }
    } catch (error) {
      console.error('Failed to resume transaction:', error);
      toast.error('Failed to resume transaction');
    } finally {
      setIsLoading(false);
    }
  }, [loadTransaction]);

  // Cancel transaction
  const cancelTransaction = useCallback(async (reason: string) => {
    if (!transactionId) return;

    setIsLoading(true);
    try {
      await transactionStateManager.cancelTransaction(transactionId, reason);
      
      toast.success('Transaction cancelled');
      
      // Reset state
      setTransactionId(null);
      setTransactionState(null);
      setItems([]);
      setPayment(null);
      setValidation(null);
    } catch (error) {
      console.error('Failed to cancel transaction:', error);
      toast.error('Failed to cancel transaction');
    } finally {
      setIsLoading(false);
    }
  }, [transactionId]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0);
  const tax = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const totalAmount = subtotal + tax;

  // Navigation helpers
  const canProceedToNext = validation?.canProceed || false;
  const canGoBack = transactionState?.currentStep !== 'items';

  return {
    // State
    transactionId,
    transactionState,
    currentStep: transactionState?.currentStep || 'items',
    items,
    payment,
    isLoading,
    validation,
    
    // Actions
    startTransaction,
    addItems,
    removeItem,
    updateItemQuantity,
    setPayment: setPaymentInfo,
    nextStep,
    previousStep,
    validateTransaction,
    completeTransaction,
    suspendTransaction,
    resumeTransaction,
    cancelTransaction,
    
    // Utilities
    canProceedToNext,
    canGoBack,
    totalAmount,
    subtotal,
    tax,
    discount
  };
};