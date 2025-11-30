/**
 * Return Processing Interface Component
 * Handles receipt lookup and return validation with 7-day policy
 */

import React, { useState } from 'react';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  UserIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

interface ReturnItem {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  maxReturnable: number;
  selectedQuantity: number;
  returnReason: string;
  condition: 'new' | 'good' | 'damaged' | 'defective';
}

interface TransactionLookupResult {
  id: string;
  receiptNumber: string;
  timestamp: Date;
  cashierName: string;
  customerName?: string;
  totalAmount: number;
  items: ReturnItem[];
  paymentMethod: string;
  daysSincePurchase: number;
  isWithinReturnPeriod: boolean;
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

const ReturnProcessingInterface: React.FC = () => {
  const [lookupType, setLookupType] = useState<'receipt' | 'barcode' | 'phone'>('receipt');
  const [lookupValue, setLookupValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transaction, setTransaction] = useState<TransactionLookupResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [supervisorPin, setSupervisorPin] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  // Return reasons
  const returnReasons = [
    { value: 'wrong_item', label: 'Wrong Item' },
    { value: 'damaged', label: 'Damaged' },
    { value: 'defective', label: 'Defective' },
    { value: 'changed_mind', label: 'Changed Mind' },
    { value: 'duplicate_purchase', label: 'Duplicate Purchase' },
    { value: 'other', label: 'Other' }
  ];

  // Condition options
  const conditionOptions = [
    { value: 'new', label: 'New/Unused' },
    { value: 'good', label: 'Good Condition' },
    { value: 'damaged', label: 'Damaged' },
    { value: 'defective', label: 'Defective' }
  ];

  const handleLookup = async () => {
    if (!lookupValue.trim()) {
      toast.error('Please enter a search value');
      return;
    }

    setIsLoading(true);
    setValidationErrors([]);

    try {
      // Simulate API call to lookup transaction
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock transaction data for demo
      const mockTransaction: TransactionLookupResult = {
        id: `tx-${Date.now()}`,
        receiptNumber: lookupValue,
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        cashierName: 'John Doe',
        customerName: 'Jane Smith',
        totalAmount: 250000,
        items: [
          {
            id: 'item1',
            name: 'Samsung Galaxy S24',
            barcode: '1234567890123',
            quantity: 1,
            unitPrice: 150000,
            totalPrice: 150000,
            maxReturnable: 150000,
            selectedQuantity: 0,
            returnReason: '',
            condition: 'new'
          },
          {
            id: 'item2',
            name: 'iPhone 15 Case',
            barcode: '9876543210987',
            quantity: 2,
            unitPrice: 50000,
            totalPrice: 100000,
            maxReturnable: 100000,
            selectedQuantity: 0,
            returnReason: '',
            condition: 'new'
          }
        ],
        paymentMethod: 'credit_card',
        daysSincePurchase: 2,
        isWithinReturnPeriod: true
      };

      setTransaction(mockTransaction);
      toast.success('Transaction found successfully');

    } catch (error) {
      console.error('Transaction lookup failed:', error);
      toast.error('Transaction not found');
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemQuantityChange = (itemId: string, quantity: number) => {
    if (!transaction) return;

    const updatedItems = transaction.items.map(item => {
      if (item.id === itemId) {
        const maxQty = Math.min(quantity, item.quantity);
        return { ...item, selectedQuantity: maxQty };
      }
      return item;
    });

    setTransaction({ ...transaction, items: updatedItems });
    validateReturnRequest(updatedItems);
  };

  const handleItemReasonChange = (itemId: string, reason: string) => {
    if (!transaction) return;

    const updatedItems = transaction.items.map(item => {
      if (item.id === itemId) {
        return { ...item, returnReason: reason };
      }
      return item;
    });

    setTransaction({ ...transaction, items: updatedItems });
    validateReturnRequest(updatedItems);
  };

  const handleItemConditionChange = (itemId: string, condition: ReturnItem['condition']) => {
    if (!transaction) return;

    const updatedItems = transaction.items.map(item => {
      if (item.id === itemId) {
        return { ...item, condition };
      }
      return item;
    });

    setTransaction({ ...transaction, items: updatedItems });
    validateReturnRequest(updatedItems);
  };

  const validateReturnRequest = (items: ReturnItem[]) => {
    const errors: ValidationError[] = [];

    // Check if any items are selected for return
    const selectedItems = items.filter(item => item.selectedQuantity > 0);
    if (selectedItems.length === 0) {
      errors.push({
        field: 'items',
        message: 'Please select at least one item to return',
        severity: 'error'
      });
    }

    // Validate each selected item
    selectedItems.forEach(item => {
      if (!item.returnReason) {
        errors.push({
          field: `reason_${item.id}`,
          message: `Return reason required for ${item.name}`,
          severity: 'error'
        });
      }

      if (!item.condition) {
        errors.push({
          field: `condition_${item.id}`,
          message: `Condition assessment required for ${item.name}`,
          severity: 'error'
        });
      }

      if (item.selectedQuantity > item.quantity) {
        errors.push({
          field: `quantity_${item.id}`,
          message: `Cannot return more than purchased quantity for ${item.name}`,
          severity: 'error'
        });
      }
    });

    // Check return period
    if (transaction && !transaction.isWithinReturnPeriod) {
      errors.push({
        field: 'return_period',
        message: 'Return period has expired (7 days)',
        severity: 'error'
      });
    }

    // Check if supervisor approval is needed
    const totalReturnAmount = selectedItems.reduce(
      (sum, item) => sum + (item.unitPrice * item.selectedQuantity), 
      0
    );

    const needsApproval = totalReturnAmount > 100000 || 
                         selectedItems.some(item => item.condition === 'damaged' || item.condition === 'defective') ||
                         selectedItems.length > 5;

    setRequiresApproval(needsApproval);

    setValidationErrors(errors);
  };

  const processReturn = async () => {
    if (!transaction) return;

    const selectedItems = transaction.items.filter(item => item.selectedQuantity > 0);
    
    if (selectedItems.length === 0) {
      toast.error('Please select items to return');
      return;
    }

    if (validationErrors.length > 0) {
      toast.error('Please fix validation errors before processing');
      return;
    }

    if (requiresApproval && !supervisorPin) {
      setShowApprovalModal(true);
      return;
    }

    await completeReturn();
  };

  const completeReturn = async () => {
    if (!transaction) return;

    try {
      setIsLoading(true);
      
      // Simulate return processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      const selectedItems = transaction.items.filter(item => item.selectedQuantity > 0);
      const refundAmount = selectedItems.reduce(
        (sum, item) => sum + (item.unitPrice * item.selectedQuantity), 
        0
      );

      toast.success(`Return processed successfully. Refund: Rp ${refundAmount.toLocaleString('id-ID')}`);
      
      // Reset form
      setTransaction(null);
      setLookupValue('');
      setValidationErrors([]);
      setRequiresApproval(false);
      setSupervisorPin('');
      setShowApprovalModal(false);

    } catch (error) {
      console.error('Return processing failed:', error);
      toast.error('Return processing failed');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTransaction(null);
    setLookupValue('');
    setValidationErrors([]);
    setRequiresApproval(false);
    setSupervisorPin('');
    setShowApprovalModal(false);
  };

  const getTotalReturnAmount = () => {
    if (!transaction) return 0;
    
    return transaction.items
      .filter(item => item.selectedQuantity > 0)
      .reduce((sum, item) => sum + (item.unitPrice * item.selectedQuantity), 0);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-900">Return & Refund Processing</h2>
        </div>
        
        <div className="text-sm text-gray-500">
          7-day return policy
        </div>
      </div>

      {/* Transaction Lookup */}
      {!transaction && (
        <div className="mb-6 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Lookup Transaction</h3>
          
          {/* Lookup Type Selection */}
          <div className="mb-4">
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="receipt"
                  checked={lookupType === 'receipt'}
                  onChange={(e) => setLookupType(e.target.value as any)}
                  className="mr-2"
                />
                Receipt Number
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="barcode"
                  checked={lookupType === 'barcode'}
                  onChange={(e) => setLookupType(e.target.value as any)}
                  className="mr-2"
                />
                Item Barcode
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="phone"
                  checked={lookupType === 'phone'}
                  onChange={(e) => setLookupType(e.target.value as any)}
                  className="mr-2"
                />
                Phone Number
              </label>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex space-x-3">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                placeholder={
                  lookupType === 'receipt' ? 'Enter receipt number' :
                  lookupType === 'barcode' ? 'Scan or enter barcode' :
                  'Enter customer phone number'
                }
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={isLoading || !lookupValue.trim()}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Searching...' : 'Lookup'}
            </button>
          </div>
        </div>
      )}

      {/* Transaction Details */}
      {transaction && (
        <div className="space-y-6">
          {/* Transaction Summary */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600">Receipt Number</div>
                <div className="font-medium">{transaction.receiptNumber}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Purchase Date</div>
                <div className="font-medium">
                  {transaction.timestamp.toLocaleDateString('id-ID')} ({transaction.daysSincePurchase} days ago)
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Cashier</div>
                <div className="font-medium">{transaction.cashierName}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Customer</div>
                <div className="font-medium">{transaction.customerName || 'Guest'}</div>
              </div>
            </div>
            
            {/* Return Period Status */}
            <div className="mt-4 flex items-center">
              {transaction.isWithinReturnPeriod ? (
                <div className="flex items-center text-green-600">
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  <span className="text-sm font-medium">Within return period</span>
                </div>
              ) : (
                <div className="flex items-center text-red-600">
                  <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                  <span className="text-sm font-medium">Return period expired</span>
                </div>
              )}
            </div>
          </div>

          {/* Items Selection */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Select Items to Return</h3>
            
            <div className="space-y-4">
              {transaction.items.map(item => (
                <div key={item.id} className="p-4 border border-gray-200 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Item Info */}
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-600">{item.barcode}</div>
                      <div className="text-sm text-gray-600">
                        Rp {item.unitPrice.toLocaleString('id-ID')} x {item.quantity}
                      </div>
                    </div>

                    {/* Quantity Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Return Quantity
                      </label>
                      <select
                        value={item.selectedQuantity}
                        onChange={(e) => handleItemQuantityChange(item.id, parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value={0}>Don't return</option>
                        {Array.from({ length: item.quantity }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1} {i === 0 ? 'item' : 'items'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Return Reason */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Return Reason
                      </label>
                      <select
                        value={item.returnReason}
                        onChange={(e) => handleItemReasonChange(item.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select reason</option>
                        {returnReasons.map(reason => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Condition */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Item Condition
                      </label>
                      <select
                        value={item.condition}
                        onChange={(e) => handleItemConditionChange(item.id, e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {conditionOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Return Amount */}
                  {item.selectedQuantity > 0 && (
                    <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                      <span className="font-medium">Return Amount: </span>
                      <span className="text-blue-600">
                        Rp {(item.unitPrice * item.selectedQuantity).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-sm font-medium text-red-800 mb-2">Validation Errors</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>• {error.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Return Summary */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-medium">Return Summary</div>
              <div className="text-xl font-bold text-green-600">
                Rp {getTotalReturnAmount().toLocaleString('id-ID')}
              </div>
            </div>
            
            {requiresApproval && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                Supervisor approval required for this return
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={resetForm}
              className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50"
            >
              New Lookup
            </button>
            
            <button
              onClick={processReturn}
              disabled={isLoading || getTotalReturnAmount() === 0 || validationErrors.length > 0}
              className="px-8 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Process Return'}
            </button>
          </div>
        </div>
      )}

      {/* Supervisor Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Supervisor Approval Required</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supervisor PIN
              </label>
              <input
                type="password"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter supervisor PIN"
                maxLength={4}
              />
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={completeReturn}
                disabled={!supervisorPin}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnProcessingInterface;