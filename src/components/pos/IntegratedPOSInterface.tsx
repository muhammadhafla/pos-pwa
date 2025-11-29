/**
 * Integrated POS Interface - Phase 2 Core POS Features
 * Combines barcode scanner, item search, pricing engine, and cart management
 */

import React, { useState, useEffect } from 'react';
import { 
  ShoppingCartIcon, 
  UserIcon, 
  CurrencyDollarIcon,
  ClockIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  PencilIcon,
  CreditCardIcon,
  BanknotesIcon,
  DevicePhoneMobileIcon,
  QrCodeIcon
} from '@heroicons/react/24/outline';
import { Item, CartItem, PaymentBreakdown } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { barcodeScanner, ScanResult } from '@/services/barcode/BarcodeScannerManager';
import { pricingEngine, PricingContext } from '@/services/pricing/PricingEngine';
import ItemSearchInterface from './ItemSearchInterface';

// Enhanced Cart Interface Component
const CartInterface: React.FC<{
  items: CartItem[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onUpdatePrice: (itemId: string, newPrice: number) => void;
  onRemoveItem: (itemId: string) => void;
  onShowPriceOverride: (item: CartItem) => void;
}> = ({ items, onUpdateQuantity, onUpdatePrice, onRemoveItem, onShowPriceOverride }) => {
  const [editingPrices, setEditingPrices] = useState<Set<string>>(new Set());

  const handlePriceEdit = (itemId: string, price: number) => {
    setEditingPrices(prev => new Set(prev).add(itemId));
  };

  const handlePriceSave = (itemId: string, newPrice: number) => {
    onUpdatePrice(itemId, newPrice);
    setEditingPrices(prev => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  if (items.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg h-64 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCartIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No items in cart</p>
          <p className="text-sm text-gray-400">Scan items or search to add to cart</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-64 overflow-hidden flex flex-col">
      {/* Cart Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-900">Cart Items ({items.length})</h3>
      </div>
      
      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">{item.itemName}</h4>
                  <p className="text-sm text-gray-500">{item.barcode}</p>
                  
                  {/* Quantity Controls */}
                  <div className="flex items-center space-x-2 mt-2">
                    <button
                      onClick={() => onUpdateQuantity(item.itemId, item.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center"
                      disabled={item.quantity <= 1}
                    >
                      <MinusIcon className="w-4 h-4 text-red-600" />
                    </button>
                    
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    
                    <button
                      onClick={() => onUpdateQuantity(item.itemId, item.quantity + 1)}
                      className="w-7 h-7 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center"
                    >
                      <PlusIcon className="w-4 h-4 text-green-600" />
                    </button>
                    
                    <span className="text-xs text-gray-500 ml-2">
                      {item.unitPrice.toFixed(2)} each
                    </span>
                  </div>
                </div>
                
                <div className="text-right ml-3">
                  {/* Price Display/Edit */}
                  {editingPrices.has(item.itemId) ? (
                    <PriceEditInput
                      currentPrice={item.unitPrice}
                      onSave={(newPrice) => handlePriceSave(item.itemId, newPrice)}
                      onCancel={() => setEditingPrices(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(item.itemId);
                        return newSet;
                      })}
                    />
                  ) : (
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-900">
                          ${item.finalPrice.toFixed(2)}
                        </span>
                        <button
                          onClick={() => handlePriceEdit(item.itemId, item.unitPrice)}
                          className="text-gray-400 hover:text-blue-600"
                          title="Edit Price"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {item.discount > 0 && (
                        <p className="text-xs text-green-600">
                          Saved ${item.discount.toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* Remove Button */}
                  <button
                    onClick={() => onRemoveItem(item.itemId)}
                    className="mt-2 text-red-400 hover:text-red-600"
                    title="Remove Item"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Price Edit Input Component
const PriceEditInput: React.FC<{
  currentPrice: number;
  onSave: (price: number) => void;
  onCancel: () => void;
}> = ({ currentPrice, onSave, onCancel }) => {
  const [price, setPrice] = useState(currentPrice.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newPrice = parseFloat(price);
    if (!isNaN(newPrice) && newPrice > 0) {
      onSave(newPrice);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center space-x-1">
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-16 px-1 py-1 text-xs border border-gray-300 rounded"
        step="0.01"
        min="0"
        autoFocus
      />
      <button
        type="submit"
        className="text-green-600 hover:text-green-800"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-red-600 hover:text-red-800"
      >
        ✕
      </button>
    </form>
  );
};

// Enhanced Payment Interface Component
const PaymentInterface: React.FC<{
  total: number;
  items: CartItem[];
  onPaymentComplete: (payment: PaymentBreakdown & { change: number }) => void;
  onCancel: () => void;
  onPriceOverride?: (itemId: string, newPrice: number, reason: string) => void;
}> = ({ total, items, onPaymentComplete, onCancel, onPriceOverride }) => {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'ewallet' | 'bank_transfer'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [showChange, setShowChange] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);
  const [showPriceOverride, setShowPriceOverride] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
  const [overridePrice, setOverridePrice] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const cashAmount = parseFloat(cashReceived) || 0;
  const change = Math.max(0, cashAmount - total);

  const handlePayment = () => {
    const payment: PaymentBreakdown & { change: number } = {
      cash: paymentMethod === 'cash' ? total : 0,
      card: paymentMethod === 'card' ? total : 0,
      ewallet: paymentMethod === 'ewallet' ? total : 0,
      bankTransfer: paymentMethod === 'bank_transfer' ? total : 0,
      credit: 0,
      change
    };
    
    onPaymentComplete(payment);
  };

  const handlePriceOverride = () => {
    if (selectedItem && overridePrice && overrideReason && onPriceOverride) {
      onPriceOverride(selectedItem.itemId, parseFloat(overridePrice), overrideReason);
      setShowPriceOverride(false);
      setSelectedItem(null);
      setOverridePrice('');
      setOverrideReason('');
    }
  };

  const paymentMethods = [
    { id: 'cash', name: 'Cash', icon: BanknotesIcon, color: 'green' },
    { id: 'card', name: 'Card', icon: CreditCardIcon, color: 'blue' },
    { id: 'ewallet', name: 'E-Wallet', icon: DevicePhoneMobileIcon, color: 'purple' },
    { id: 'bank_transfer', name: 'Bank Transfer', icon: QrCodeIcon, color: 'indigo' }
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-gray-900">💳 Complete Payment</h3>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>

      {/* Order Summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h4 className="font-semibold mb-3">Order Summary</h4>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.quantity}x {item.itemName}</span>
              <span>${item.finalPrice.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 pt-2 mt-3">
          <div className="flex justify-between font-bold text-lg">
            <span>Total:</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment Method Selection */}
      <div className="mb-6">
        <h4 className="font-semibold mb-3">Select Payment Method</h4>
        <div className="grid grid-cols-2 gap-3">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            return (
              <button
                key={method.id}
                onClick={() => setPaymentMethod(method.id as any)}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  paymentMethod === method.id
                    ? `border-${method.color}-500 bg-${method.color}-50`
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Icon className={`w-6 h-6 mx-auto mb-2 ${
                  paymentMethod === method.id ? `text-${method.color}-600` : 'text-gray-400'
                }`} />
                <p className={`text-sm font-medium ${
                  paymentMethod === method.id ? `text-${method.color}-900` : 'text-gray-600'
                }`}>
                  {method.name}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cash Payment Details */}
      {paymentMethod === 'cash' && (
        <div className="mb-6">
          <h4 className="font-semibold mb-3">Cash Payment</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount Received
              </label>
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>
            
            {cashAmount >= total && (
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-green-800">Change:</span>
                  <span className="font-bold text-green-800 text-lg">
                    ${change.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            
            {cashAmount < total && (
              <div className="bg-red-50 p-3 rounded-lg">
                <p className="text-red-800 text-sm">
                  Insufficient amount. Need ${(total - cashAmount).toFixed(2)} more.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Cash Amounts */}
      {paymentMethod === 'cash' && (
        <div className="mb-6">
          <h4 className="font-semibold mb-2">Quick Amounts</h4>
          <div className="grid grid-cols-4 gap-2">
            {[10, 20, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setCashReceived(amount.toString())}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <button
          onClick={handlePayment}
          disabled={
            (paymentMethod === 'cash' && cashAmount < total) ||
            total <= 0
          }
          className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          ✅ Complete Payment
        </button>
      </div>
    </div>
  );
};

interface IntegratedPOSInterfaceProps {
  onTransactionComplete?: (transaction: any) => void;
}

const IntegratedPOSInterface: React.FC<IntegratedPOSInterfaceProps> = ({
  onTransactionComplete
}) => {
  // State management
  const [activeView, setActiveView] = useState<'pos' | 'payment'>('pos');
  const [scannerStatus, setScannerStatus] = useState('Ready');
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    avgScanTime: 0,
    avgSearchTime: 0,
    totalTransactions: 0
  });
  const [showScannerTest, setShowScannerTest] = useState(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<any[]>([]);

  // Store hooks
  const { user, logout } = useAuthStore();
  const { 
    items, 
    totalItems, 
    subtotal, 
    tax, 
    total, 
    discount,
    addItem,
    updateQuantity,
    updatePrice,
    removeItem,
    clearCart,
    applyDiscount,
    holdCart
  } = useCartStore();

  // Additional state for enhanced functionality
  const [showPriceOverride, setShowPriceOverride] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CartItem | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  // Initialize component
  useEffect(() => {
    initializePOS();
    setupEventHandlers();
    
    // Cleanup on unmount
    return () => {
      barcodeScanner.destroy();
    };
  }, []);

  /**
   * Initialize POS system
   */
  const initializePOS = async () => {
    try {
      console.log('🚀 Initializing Integrated POS Interface...');
      
      // Get pricing engine status
      const pricingStatus = pricingEngine.getStatus();
      console.log('💰 Pricing engine status:', pricingStatus);
      
      // Get scanner status
      const scanner = barcodeScanner.getStatus();
      console.log('🔍 Scanner status:', scanner);
      
    } catch (error) {
      console.error('❌ POS initialization failed:', error);
    }
  };

  /**
   * Setup event handlers for barcode scanner
   */
  const setupEventHandlers = () => {
    // Handle scan results
    barcodeScanner.onScan(async (result: ScanResult) => {
      setScannerStatus('Scanned');
      setLastScanResult(result);
      
      if (result.success && result.item) {
        // Add scanned item to cart with pricing calculation
        await addScannedItemToCart(result.item);
      }
      
      // Reset scanner status after delay
      setTimeout(() => setScannerStatus('Ready'), 1000);
    });

    // Handle scanner errors
    barcodeScanner.onError((error: string) => {
      setScannerStatus(`Error: ${error}`);
      console.error('Scanner error:', error);
    });
  };

  /**
   * Add scanned item to cart with pricing calculation
   */
  const addScannedItemToCart = async (item: Item) => {
    try {
      // Add item to cart using store
      await addItem(item, 1);
      
      // Calculate price using pricing engine for monitoring
      const pricingContext: PricingContext = {
        item,
        quantity: 1,
        branchId: user?.branchId || 'branch-001',
        transactionDate: new Date(),
        customerId: undefined,
        customerType: 'regular',
        cartTotal: total + item.basePrice
      };
      
      const priceCalculation = await pricingEngine.calculatePrice(pricingContext);
      
      console.log(`💰 Calculated price for ${item.name}: ${priceCalculation.finalPrice.toFixed(2)}`);
      
    } catch (error) {
      console.error('Failed to add scanned item to cart:', error);
    }
  };

  /**
   * Handle price override with supervisor approval
   */
  const handlePriceOverride = async (itemId: string, newPrice: number, reason: string) => {
    if (user?.role !== 'supervisor' && user?.role !== 'manager' && user?.role !== 'admin') {
      alert('Price override requires supervisor authorization');
      return;
    }

    try {
      await updatePrice(itemId, newPrice, reason);
      console.log(`💰 Price override applied: ${itemId} -> ${newPrice} (${reason})`);
    } catch (error) {
      console.error('Failed to apply price override:', error);
      alert('Failed to apply price override');
    }
  };

  /**
   * Clear current cart
   */
  const handleClearCart = () => {
    if (items.length === 0) return;
    
    if (confirm('Are you sure you want to clear the cart?')) {
      clearCart();
    }
  };

  /**
   * Hold current cart
   */
  const handleHoldCart = async () => {
    if (items.length === 0) return;
    
    const cartId = prompt('Enter cart ID to hold:', `cart-${Date.now()}`);
    if (cartId) {
      try {
        await holdCart(cartId);
        alert(`Cart ${cartId} held successfully`);
      } catch (error) {
        console.error('Failed to hold cart:', error);
        alert('Failed to hold cart');
      }
    }
  };

  /**
   * Handle item selection from search
   */
  const handleItemSelect = async (item: Item) => {
    console.log('📦 Item selected:', item.name);
    await addScannedItemToCart(item);
  };

  /**
   * Handle scan result from external barcode scanner
   */
  const handleScanResult = (result: ScanResult) => {
    setLastScanResult(result);
    if (result.success) {
      console.log(`⚡ Fast scan completed: ${result.scanTime.toFixed(2)}ms`);
    }
  };

  /**
   * Load transaction history
   */
  const loadTransactionHistory = async () => {
    try {
      // This would load from database in real implementation
      // For now, using mock data
      const mockTransactions = [
        {
          id: 'txn-001',
          timestamp: new Date(Date.now() - 3600000),
          items: 3,
          total: 45.99,
          cashier: user?.fullName || 'Unknown',
          status: 'completed'
        },
        {
          id: 'txn-002', 
          timestamp: new Date(Date.now() - 7200000),
          items: 1,
          total: 12.50,
          cashier: user?.fullName || 'Unknown',
          status: 'completed'
        }
      ];
      setTransactionHistory(mockTransactions);
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  };

  /**
   * Handle payment processing
   */
  const handlePayment = (paymentData: any) => {
    console.log('💳 Processing payment:', paymentData);
    
    // Create transaction record
    const transaction = {
      id: `txn-${Date.now()}`,
      items: items,
      subtotal,
      tax,
      discount,
      total,
      payment: paymentData,
      cashierId: user?.id,
      timestamp: new Date()
    };
    
    // Add to local history
    setTransactionHistory(prev => [transaction, ...prev]);
    
    // Clear cart after successful payment
    clearCart();
    
    onTransactionComplete?.(transaction);
  };

  /**
   * Get current time for display
   */
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* Main POS Interface */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left side - Title and Status */}
            <div className="flex items-center space-x-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">POS PWA Retail</h1>
                <p className="text-sm text-gray-500">Phase 2 - Core Features Integration</p>
              </div>
              
              {/* System Status */}
              <div className="flex items-center space-x-4">
                {/* Scanner Status */}
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    scannerStatus === 'Ready' ? 'bg-green-400' :
                    scannerStatus === 'Scanned' ? 'bg-blue-400' :
                    'bg-red-400'
                  }`} />
                  <span className="text-sm text-gray-600">Scanner: {scannerStatus}</span>
                </div>
                
                {/* Pricing Engine Status */}
                <div className="flex items-center space-x-2">
                  <CurrencyDollarIcon className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600">8-Level Pricing Active</span>
                </div>
                
                {/* Network Status */}
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-600">Offline Ready</span>
                </div>
              </div>
            </div>

            {/* Right side - User and Controls */}
            <div className="flex items-center space-x-4">
              {/* Current Time */}
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <ClockIcon className="w-4 h-4" />
                <span>{getCurrentTime()}</span>
              </div>
              
              {/* Performance Metrics */}
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <span>Avg Scan: {performanceMetrics.avgScanTime.toFixed(0)}ms</span>
                <span>Avg Search: {performanceMetrics.avgSearchTime.toFixed(0)}ms</span>
              </div>
              
              {/* User Info */}
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
                  <p className="text-xs text-gray-500">{user?.role} • {user?.branchId}</p>
                </div>
                <UserIcon className="w-8 h-8 text-gray-400" />
              </div>
              
              {/* Control Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowScannerTest(true)}
                  className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Test Scanner
                </button>
                <button
                  onClick={() => {
                    loadTransactionHistory();
                    setShowTransactionHistory(true);
                  }}
                  className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                >
                  📊 History
                </button>
                <button
                  onClick={logout}
                  className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Item Search and Scanner */}
          <div className="w-1/2 p-6 border-r border-gray-200">
            <div className="h-full flex flex-col">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Item Search & Scanner</h2>
                <p className="text-sm text-gray-600">
                  Use barcode scanner or search to add items. Performance target: 200ms search, 100ms scan
                </p>
              </div>
              
              <div className="flex-1">
                <ItemSearchInterface
                  onItemSelect={handleItemSelect}
                  onScanResult={handleScanResult}
                  className="h-full"
                />
              </div>
            </div>
          </div>

          {/* Right Panel - Cart and Payment */}
          <div className="w-1/2 p-6">
            <div className="h-full flex flex-col">
              {/* Cart Summary */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <ShoppingCartIcon className="w-5 h-5 mr-2" />
                    Current Transaction
                  </h2>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">${total.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">{totalItems} items</p>
                  </div>
                </div>
                
                {/* Cart Metrics */}
                <div className="grid grid-cols-4 gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Subtotal</p>
                    <p className="font-semibold">${subtotal.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Tax</p>
                    <p className="font-semibold">${tax.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Discount</p>
                    <p className="font-semibold text-green-600">-${discount.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="font-bold text-lg">${total.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Cart Items */}
              <div className="flex-1 mb-6">
                <CartInterface
                  items={items}
                  onUpdateQuantity={updateQuantity}
                  onUpdatePrice={updatePrice}
                  onRemoveItem={removeItem}
                  onShowPriceOverride={(item) => {
                    setSelectedItem(item);
                    setShowPriceOverride(true);
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setActiveView('payment')}
                  disabled={totalItems === 0}
                  className="px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  💳 Payment
                </button>
                <button
                  onClick={handleHoldCart}
                  disabled={totalItems === 0}
                  className="px-4 py-3 bg-yellow-600 text-white font-semibold rounded-lg hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  📦 Hold Cart
                </button>
                <button
                  onClick={handleClearCart}
                  disabled={totalItems === 0}
                  className="px-4 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  🗑️ Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scanner Test Modal */}
      {showScannerTest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">🧪 Scanner Performance Test</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will test barcode scanning speed and accuracy. The target is 100ms per scan.
            </p>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Scanner Status</span>
                <span className="text-sm font-medium">{scannerStatus}</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Supported Types</span>
                <span className="text-sm font-medium">HID, WebUSB, Camera</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">Performance Target</span>
                <span className="text-sm font-medium text-green-600">100ms</span>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowScannerTest(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Close
              </button>
              <button
                onClick={() => {
                  console.log('🔍 Testing scanner functionality...');
                  setShowScannerTest(false);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Run Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {showTransactionHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">📊 Transaction History</h3>
                <button
                  onClick={() => setShowTransactionHistory(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>

              {/* Today's Summary */}
              <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-blue-50 rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-blue-600">Total Transactions</p>
                  <p className="text-xl font-bold text-blue-800">{transactionHistory.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-blue-600">Total Sales</p>
                  <p className="text-xl font-bold text-blue-800">
                    ${transactionHistory.reduce((sum, txn) => sum + txn.total, 0).toFixed(2)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-blue-600">Avg Transaction</p>
                  <p className="text-xl font-bold text-blue-800">
                    ${transactionHistory.length > 0 
                      ? (transactionHistory.reduce((sum, txn) => sum + txn.total, 0) / transactionHistory.length).toFixed(2)
                      : '0.00'
                    }
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-blue-600">Items Sold</p>
                  <p className="text-xl font-bold text-blue-800">
                    {transactionHistory.reduce((sum, txn) => sum + txn.items, 0)}
                  </p>
                </div>
              </div>

              {/* Transaction List */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900">Recent Transactions</h4>
                {transactionHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No transactions found</p>
                    <p className="text-sm">Complete a sale to see transaction history</p>
                  </div>
                ) : (
                  transactionHistory.map((transaction) => (
                    <div key={transaction.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div>
                            <p className="font-semibold text-gray-900">#{transaction.id}</p>
                            <p className="text-sm text-gray-500">
                              {transaction.timestamp.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">
                              {transaction.items} items
                            </p>
                            <p className="text-sm text-gray-500">
                              by {transaction.cashier}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-gray-900">
                            ${transaction.total.toFixed(2)}
                          </p>
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                            transaction.status === 'completed' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {transaction.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Interface Overlay */}
      {activeView === 'payment' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <PaymentInterface
              total={total}
              items={items}
              onPaymentComplete={(paymentData: any) => {
                handlePayment(paymentData);
                setActiveView('pos');
              }}
              onCancel={() => setActiveView('pos')}
              onPriceOverride={handlePriceOverride}
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default IntegratedPOSInterface;