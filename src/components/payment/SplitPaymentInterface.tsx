/**
 * Split Payment Interface Component
 * Handles multiple payment methods with allocation and validation
 */

import React, { useState, useEffect } from 'react';
import { PaymentMethod } from '@/types';
import {
  splitPaymentManager,
  SplitPaymentValidation,
  PaymentAllocation,
} from '@/services/payment/SplitPaymentManager';
import {
  CurrencyDollarIcon,
  CreditCardIcon,
  QrCodeIcon,
  DevicePhoneMobileIcon,
  BuildingLibraryIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';

interface SplitPaymentInterfaceProps {
  totalAmount: number;
  transactionId: string;
  onPaymentComplete: (paymentBreakdown: Record<PaymentMethod, number> & { change?: number }) => void;
  onPaymentCancel: () => void;
  availableMethods?: PaymentMethod[];
  customerPreference?: PaymentMethod;
}

interface PaymentMethodState {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  processing: boolean;
  completed: boolean;
}

const SplitPaymentInterface: React.FC<SplitPaymentInterfaceProps> = ({
  totalAmount,
  transactionId,
  onPaymentComplete,
  onPaymentCancel,
  availableMethods = ['cash', 'card', 'qris', 'ewallet', 'bank_transfer', 'credit'],
  customerPreference,
}) => {
  const [payments, setPayments] = useState<PaymentMethodState[]>([]);
  const [validation, setValidation] = useState<SplitPaymentValidation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [newMethodAmount, setNewMethodAmount] = useState('');

  // Initialize with suggestions
  useEffect(() => {
    const suggestions = splitPaymentManager.generateAllocationSuggestions(
      totalAmount,
      availableMethods,
      customerPreference
    );

    const initialPayments: PaymentMethodState[] = suggestions.map(suggestion => ({
      method: suggestion.method,
      amount: suggestion.amount,
      processing: false,
      completed: false,
    }));

    setPayments(initialPayments);
  }, [totalAmount, availableMethods, customerPreference]);

  // Calculate totals
  const totalAllocated = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remainingAmount = Math.max(0, totalAmount - totalAllocated);
  const overpayment = Math.max(0, totalAllocated - totalAmount);
  const change = splitPaymentManager.calculateChange(totalAllocated, totalAmount);

  // Validation
  useEffect(() => {
    const allocations: PaymentAllocation[] = payments
      .filter(p => p.amount > 0)
      .map(p => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
      }));

    const request = {
      transactionId,
      totalAmount,
      allocations,
    };

    const newValidation = splitPaymentManager.validateSplitPayment(request);
    setValidation(newValidation);
  }, [payments, totalAmount, transactionId]);

  const handleAmountChange = (index: number, amount: number) => {
    const newPayments = [...payments];
    newPayments[index].amount = Math.max(0, amount);
    setPayments(newPayments);
  };

  const handleReferenceChange = (index: number, reference: string) => {
    const newPayments = [...payments];
    newPayments[index].reference = reference;
    setPayments(newPayments);
  };

  const addPaymentMethod = () => {
    if (!newMethodAmount || parseFloat(newMethodAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Find first available method not already used
    const usedMethods = payments.map(p => p.method);
    const availableMethod = availableMethods.find(method => !usedMethods.includes(method));

    if (!availableMethod) {
      toast.error('All payment methods are already in use');
      return;
    }

    const newPayment: PaymentMethodState = {
      method: availableMethod,
      amount: parseFloat(newMethodAmount),
      processing: false,
      completed: false,
    };

    setPayments([...payments, newPayment]);
    setNewMethodAmount('');
    setShowAddMethod(false);
  };

  const removePaymentMethod = (index: number) => {
    const newPayments = payments.filter((_, i) => i !== index);
    setPayments(newPayments);
  };

  const processPayment = async (index: number) => {
    const payment = payments[index];

    setPayments(prev => prev.map((p, i) => (i === index ? { ...p, processing: true } : p)));

    try {
      const result = await splitPaymentManager.processPaymentMethod(
        payment.method,
        payment.amount,
        payment.reference
      );

      if (result.success) {
        setPayments(prev =>
          prev.map((p, i) =>
            i === index
              ? {
                  ...p,
                  processing: false,
                  completed: true,
                  reference: result.transactionId ?? p.reference,
                }
              : p
          )
        );

        toast.success(`${getMethodDisplayName(payment.method)} payment successful`);
      } else {
        setPayments(prev =>
          prev.map((p, i) => (i === index ? { ...p, processing: false, completed: false } : p))
        );

        toast.error(`${payment.method} payment failed: ${result.error}`);
      }
    } catch (error) {
      setPayments(prev =>
        prev.map((p, i) => (i === index ? { ...p, processing: false, completed: false } : p))
      );

      toast.error(`Payment processing failed: ${error}`);
    }
  };

  const completeSplitPayment = () => {
    if (!validation?.canProcess) {
      toast.error('Please fix validation errors before proceeding');
      return;
    }

    setIsProcessing(true);

    try {
      // Create payment breakdown for completion
      const paymentBreakdown = payments.reduce((breakdown, payment) => {
        if (payment.amount > 0) {
          breakdown[payment.method] = payment.amount;
        }
        return breakdown;
      }, {} as Record<PaymentMethod, number> & { change?: number });

      // Add change calculation
      if (change > 0) {
        paymentBreakdown.change = change;
      }

      onPaymentComplete(paymentBreakdown);
      toast.success('Payment completed successfully');
    } catch (error) {
      console.error('Failed to complete payment:', error);
      toast.error('Failed to complete payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const getMethodDisplayName = (method: PaymentMethod): string => {
    const info = splitPaymentManager.getPaymentMethodInfo(method);
    return info.name;
  };

  const getMethodIcon = (method: PaymentMethod) => {
    const icons = {
      cash: BanknotesIcon,
      card: CreditCardIcon,
      qris: QrCodeIcon,
      ewallet: DevicePhoneMobileIcon,
      bank_transfer: BuildingLibraryIcon,
      credit: CurrencyDollarIcon,
    };

    const IconComponent = icons[method] || CreditCardIcon;
    return <IconComponent className="h-5 w-5" />;
  };

  const getMethodColor = (method: PaymentMethod): string => {
    const info = splitPaymentManager.getPaymentMethodInfo(method);
    const colors = {
      green: 'text-green-600 bg-green-50 border-green-200',
      blue: 'text-blue-600 bg-blue-50 border-blue-200',
      purple: 'text-purple-600 bg-purple-50 border-purple-200',
      orange: 'text-orange-600 bg-orange-50 border-orange-200',
      indigo: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      yellow: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    };

    return colors[info.color as keyof typeof colors] || 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Split Payment</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900">
              Rp {totalAmount.toLocaleString('id-ID')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Allocated</p>
            <p
              className={`text-xl font-semibold ${
                totalAllocated >= totalAmount ? 'text-green-600' : 'text-orange-600'
              }`}
            >
              Rp {totalAllocated.toLocaleString('id-ID')}
            </p>
          </div>
        </div>

        {remainingAmount > 0 && (
          <div className="mt-2 text-right">
            <p className="text-sm text-red-600">
              Remaining: Rp {remainingAmount.toLocaleString('id-ID')}
            </p>
          </div>
        )}

        {overpayment > 0 && (
          <div className="mt-2 text-right">
            <p className="text-sm text-blue-600">
              Overpayment: Rp {overpayment.toLocaleString('id-ID')}
            </p>
            {change > 0 && (
              <p className="text-sm font-medium text-green-600">
                Change: Rp {change.toLocaleString('id-ID')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {validation && (
        <div className="mb-6">
          {validation.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                <div>
                  <h4 className="text-sm font-medium text-red-800">Validation Errors</h4>
                  <ul className="text-sm text-red-700 mt-1">
                    {validation.errors.map((error: string, index: number) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-2" />
                <div>
                  <h4 className="text-sm font-medium text-yellow-800">Warnings</h4>
                  <ul className="text-sm text-yellow-700 mt-1">
                    {validation.warnings.map((warning: string, index: number) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment Methods */}
      <div className="space-y-4 mb-6">
        {payments.map((payment, index) => (
          <div
            key={`${payment.method}-${index}`}
            className={`border rounded-lg p-4 ${getMethodColor(payment.method)}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                {getMethodIcon(payment.method)}
                <span className="ml-2 font-medium">{getMethodDisplayName(payment.method)}</span>
                {payment.completed && <CheckCircleIcon className="h-5 w-5 text-green-500 ml-2" />}
              </div>

              {!payment.completed && (
                <button
                  onClick={() => removePaymentMethod(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Amount Input */}
              <div>
                <label htmlFor={`amount-${index}`} className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                <div className="relative">
                  <CurrencyDollarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id={`amount-${index}`}
                    type="number"
                    value={payment.amount ?? ''}
                    onChange={e => handleAmountChange(index, parseFloat(e.target.value) || 0)}
                    disabled={payment.completed}
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="0"
                    min="0"
                    step="100"
                  />
                </div>
              </div>

              {/* Reference Input (for card, QRIS, etc.) */}
              {(payment.method === 'card' ||
                payment.method === 'qris' ||
                payment.method === 'ewallet') && (
                <div>
                  <label htmlFor={`reference-${index}`} className="block text-xs font-medium text-gray-700 mb-1">
                    Reference {payment.method === 'qris' ? '(QR Code)' : '(Transaction ID)'}
                  </label>
                  <input
                    id={`reference-${index}`}
                    type="text"
                    value={payment.reference ?? ''}
                    onChange={e => handleReferenceChange(index, e.target.value)}
                    disabled={payment.completed}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder={payment.method === 'qris' ? 'Scan QR code' : 'Enter reference'}
                  />
                </div>
              )}

              {/* Process Button */}
              <div className="flex items-end">
                {payment.completed ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircleIcon className="h-5 w-5 mr-1" />
                    <span className="text-sm font-medium">Completed</span>
                  </div>
                ) : (
                  <button
                    onClick={() => void processPayment(index)}
                    disabled={payment.amount <= 0 || payment.processing}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {payment.processing ? 'Processing...' : 'Process Payment'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Payment Method */}
      {showAddMethod ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Add Payment Method</h4>
          <div className="flex items-center space-x-3">
            <select className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">Select payment method</option>
              {availableMethods
                .filter(method => !payments.some(p => p.method === method))
                .map(method => (
                  <option key={method} value={method}>
                    {getMethodDisplayName(method)}
                  </option>
                ))}
            </select>
            <input
              type="number"
              value={newMethodAmount}
              onChange={e => setNewMethodAmount(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Amount"
              min="0"
              step="100"
            />
            <button
              onClick={addPaymentMethod}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddMethod(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <button
            onClick={() => setShowAddMethod(true)}
            className="flex items-center px-4 py-2 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-800"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Payment Method
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <button
          onClick={onPaymentCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded hover:bg-gray-50"
        >
          Cancel
        </button>

        <button
          onClick={() => void completeSplitPayment()}
          disabled={!validation?.canProcess || isProcessing}
          className="px-8 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Processing...' : 'Complete Payment'}
        </button>
      </div>
    </div>
  );
};

export default SplitPaymentInterface;
