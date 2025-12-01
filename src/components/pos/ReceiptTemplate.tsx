/**
 * Receipt Template with Promo Breakdown - Phase 2
 * Detailed receipt layout with itemized discount breakdown
 * Includes tax calculations and receipt customization options
 */

import React, { useRef } from 'react';
import { CartItem, PaymentBreakdown, PricingRule as _PricingRule, SalesTransaction as _SalesTransaction } from '@/types';
import { pricingEngine as _pricingEngine, PriceCalculation as _PriceCalculation } from '@/services/pricing/PricingEngine';
import { receiptTemplateService as _receiptTemplateService } from '@/services/receipt/ReceiptTemplateService';
import { escPosPrinter } from '@/services/receipt/ESCPosPrinter';

export interface ReceiptData {
  transactionId: string;
  receiptNumber: string;
  date: Date;
  cashier: {
    id: string;
    name: string;
    branch: string;
  };
  customer?: {
    name?: string;
    memberId?: string;
    tier?: string;
  };
  items: ReceiptItem[];
  pricingDetails: ReceiptPricingDetails;
  payments: PaymentBreakdown;
  totals: ReceiptTotals;
}

export interface ReceiptItem extends CartItem {
  pricingCalculation?: _PriceCalculation;
  originalPrice?: number;
  appliedDiscounts: AppliedDiscountDetail[];
}

export interface AppliedDiscountDetail {
  ruleId: string;
  ruleName: string;
  discountType: 'percentage' | 'fixed_amount' | 'free_item';
  discountValue: number;
  discountAmount: number;
  appliedOn: number; // Base amount the discount was applied to
}

export interface ReceiptPricingDetails {
  baseSubtotal: number;
  discountBreakdown: DiscountBreakdown[];
  taxBreakdown: TaxBreakdown[];
  promoSavings: number;
}

export interface DiscountBreakdown {
  category: string;
  items: string[];
  totalDiscount: number;
  rules: AppliedDiscountDetail[];
}

export interface TaxBreakdown {
  name: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
}

export interface ReceiptTotals {
  subtotal: number;
  totalDiscounts: number;
  totalTax: number;
  totalAmount: number;
  totalSavings: number;
}

export interface ReceiptTemplateProps {
  data: ReceiptData;
  template: ReceiptTemplateType;
  options?: ReceiptOptions;
  onPrint?: () => void;
}

export type ReceiptTemplateType =
  | 'standard'
  | 'detailed'
  | 'minimal'
  | 'customer-copy'
  | 'merchant-copy';

export interface ReceiptOptions {
  showBarcode?: boolean;
  showLogo?: boolean;
  showCashier?: boolean;
  showCustomer?: boolean;
  showPromoBreakdown?: boolean;
  showPricingDetails?: boolean;
  fontSize?: 'small' | 'medium' | 'large';
  paperSize?: '58mm' | '80mm' | 'a4';
  includePromoSavings?: boolean;
}

const ReceiptTemplate: React.FC<ReceiptTemplateProps> = ({
  data,
  template = 'detailed',
  options = {},
  onPrint,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const {
    showBarcode = true,
    showLogo = true,
    showCashier = true,
    showCustomer = true,
    showPromoBreakdown = true,
    showPricingDetails = true,
    fontSize = 'medium',
    paperSize = '80mm',
    includePromoSavings = true,
  } = options;

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small':
        return 'text-xs';
      case 'large':
        return 'text-lg';
      default:
        return 'text-sm';
    }
  };

  const getPaperWidthClass = () => {
    switch (paperSize) {
      case '58mm':
        return 'max-w-[220px]';
      case 'a4':
        return 'max-w-[800px]';
      default:
        return 'max-w-[300px]';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderReceiptHeader = () => (
    <div className="text-center mb-4 border-b border-dashed border-gray-400 pb-3">
      {showLogo && (
        <div className="mb-2">
          <h1 className={`font-bold ${getFontSizeClass()} text-gray-900`}>POS PWA RETAIL</h1>
          <p className={`text-gray-600 ${getFontSizeClass()}`}>Smart Point of Sale System</p>
        </div>
      )}

      <div className={`text-gray-800 ${getFontSizeClass()}`}>
        <p>Jl. Raya POS No. 123</p>
        <p>Jakarta Selatan, 12345</p>
        <p>Telp: (021) 1234-5678</p>
      </div>

      <div className={`mt-3 text-gray-700 ${getFontSizeClass()}`}>
        <p className="font-medium">No. {data.receiptNumber}</p>
        <p>
          {formatDate(data.date)} {formatTime(data.date)}
        </p>
        {showCashier && <p>Cashier: {data.cashier.name}</p>}
      </div>
    </div>
  );

  const renderCustomerInfo = () => {
    if (!showCustomer || !data.customer) return null;

    return (
      <div className={`mb-3 p-2 bg-gray-50 rounded ${getFontSizeClass()}`}>
        <div className="flex justify-between">
          <span className="font-medium">Customer:</span>
          <span>{data.customer.name ?? 'Guest'}</span>
        </div>
        {data.customer.memberId && (
          <div className="flex justify-between">
            <span className="font-medium">Member ID:</span>
            <span>{data.customer.memberId}</span>
          </div>
        )}
        {data.customer.tier && (
          <div className="flex justify-between">
            <span className="font-medium">Tier:</span>
            <span className="capitalize">{data.customer.tier}</span>
          </div>
        )}
      </div>
    );
  };

  const renderItems = () => (
    <div className="mb-4">
      {/* Table Header */}
      <div
        className={`grid grid-cols-12 gap-1 font-bold border-b border-gray-300 pb-1 ${getFontSizeClass()}`}
      >
        <div className="col-span-6">Item</div>
        <div className="col-span-2 text-right">Qty</div>
        <div className="col-span-4 text-right">Total</div>
      </div>

      {/* Items */}
      <div className="space-y-1">
        {data.items.map((item, index) => (
          <div
            key={`${item.itemId}-${index}`}
            className={`grid grid-cols-12 gap-1 py-1 border-b border-gray-100 ${getFontSizeClass()}`}
          >
            <div className="col-span-6">
              <div className="font-medium">{item.itemName}</div>
              {item.originalPrice && item.originalPrice !== item.unitPrice && (
                <div className="text-gray-500 line-through">
                  {formatCurrency(item.originalPrice)}
                </div>
              )}
              <div className="text-gray-700">{formatCurrency(item.unitPrice)} each</div>
            </div>
            <div className="col-span-2 text-right">{item.quantity}</div>
            <div className="col-span-4 text-right">
              <div className="font-medium">{formatCurrency(item.totalPrice)}</div>
            </div>

            {/* Applied Discounts */}
            {showPromoBreakdown && item.appliedDiscounts.length > 0 && (
              <div className="col-span-12 ml-2 mt-1">
                <div className="text-xs text-green-600">
                  <div className="font-medium">Applied Discounts:</div>
                  {item.appliedDiscounts.map((discount, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>- {discount.ruleName}</span>
                      <span>-{formatCurrency(discount.discountAmount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderDiscountBreakdown = () => {
    if (!showPromoBreakdown || data.pricingDetails.discountBreakdown.length === 0) {
      return null;
    }

    return (
      <div className="mb-4 border-t border-dashed border-gray-400 pt-3">
        <h4 className={`font-bold mb-2 ${getFontSizeClass()}`}>Promotional Discounts</h4>

        {data.pricingDetails.discountBreakdown.map((category, index) => (
          <div key={index} className={`mb-2 ${getFontSizeClass()}`}>
            <div className="flex justify-between font-medium text-green-600">
              <span>{category.category}</span>
              <span>-{formatCurrency(category.totalDiscount)}</span>
            </div>

            {showPricingDetails && category.rules.length > 0 && (
              <div className="ml-2 text-xs text-gray-600">
                {category.rules.map((rule, ruleIdx) => (
                  <div key={ruleIdx} className="flex justify-between">
                    <span>- {rule.ruleName}</span>
                    <span>-{formatCurrency(rule.discountAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {includePromoSavings && (
          <div className="border-t border-gray-200 pt-2">
            <div className={`flex justify-between font-bold text-green-600 ${getFontSizeClass()}`}>
              <span>Total Savings:</span>
              <span>-{formatCurrency(data.pricingDetails.promoSavings)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTaxBreakdown = () => (
    <div className="mb-4">
      <h4 className={`font-bold mb-2 ${getFontSizeClass()}`}>Tax Details</h4>

      {data.pricingDetails.taxBreakdown.map((tax, index) => (
        <div key={index} className={`flex justify-between ${getFontSizeClass()}`}>
          <span>
            {tax.name} ({tax.rate}%)
          </span>
          <span>{formatCurrency(tax.taxAmount)}</span>
        </div>
      ))}

      <div
        className={`flex justify-between font-bold border-t border-gray-200 pt-1 mt-1 ${getFontSizeClass()}`}
      >
        <span>Total Tax:</span>
        <span>{formatCurrency(data.totals.totalTax)}</span>
      </div>
    </div>
  );

  const renderPaymentDetails = () => {
    const totalPayment =
      data.payments.cash +
      data.payments.card +
      data.payments.ewallet +
      data.payments.bankTransfer +
      data.payments.credit;
    const change = Math.max(0, totalPayment - data.totals.totalAmount);

    return (
      <div className="mb-4 border-t border-dashed border-gray-400 pt-3">
        <h4 className={`font-bold mb-2 ${getFontSizeClass()}`}>Payment Details</h4>

        {data.payments.cash > 0 && (
          <div className={`flex justify-between ${getFontSizeClass()}`}>
            <span>Cash</span>
            <span>{formatCurrency(data.payments.cash)}</span>
          </div>
        )}

        {data.payments.card > 0 && (
          <div className={`flex justify-between ${getFontSizeClass()}`}>
            <span>Card</span>
            <span>{formatCurrency(data.payments.card)}</span>
          </div>
        )}

        {data.payments.ewallet > 0 && (
          <div className={`flex justify-between ${getFontSizeClass()}`}>
            <span>E-Wallet</span>
            <span>{formatCurrency(data.payments.ewallet)}</span>
          </div>
        )}

        {data.payments.bankTransfer > 0 && (
          <div className={`flex justify-between ${getFontSizeClass()}`}>
            <span>Bank Transfer</span>
            <span>{formatCurrency(data.payments.bankTransfer)}</span>
          </div>
        )}

        {data.payments.credit > 0 && (
          <div className={`flex justify-between ${getFontSizeClass()}`}>
            <span>Credit</span>
            <span>{formatCurrency(data.payments.credit)}</span>
          </div>
        )}

        <div
          className={`flex justify-between font-medium mt-2 pt-2 border-t border-gray-200 ${getFontSizeClass()}`}
        >
          <span>Total Payment:</span>
          <span>{formatCurrency(totalPayment)}</span>
        </div>

        {change > 0 && (
          <div className={`flex justify-between font-bold text-green-600 ${getFontSizeClass()}`}>
            <span>Change:</span>
            <span>{formatCurrency(change)}</span>
          </div>
        )}
      </div>
    );
  };

  const renderTotals = () => (
    <div className="border-t border-dashed border-gray-400 pt-3">
      <div className={`space-y-1 ${getFontSizeClass()}`}>
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(data.totals.subtotal)}</span>
        </div>

        <div className="flex justify-between text-green-600">
          <span>Total Discounts:</span>
          <span>-{formatCurrency(data.totals.totalDiscounts)}</span>
        </div>

        <div className="flex justify-between">
          <span>Total Tax:</span>
          <span>{formatCurrency(data.totals.totalTax)}</span>
        </div>

        <div
          className={`flex justify-between font-bold text-lg border-t border-gray-400 pt-1 ${getFontSizeClass()}`}
        >
          <span>TOTAL:</span>
          <span>{formatCurrency(data.totals.totalAmount)}</span>
        </div>
      </div>
    </div>
  );

  const renderReceiptFooter = () => (
    <div className="text-center mt-6 border-t border-dashed border-gray-400 pt-3">
      <div className={`text-gray-600 ${getFontSizeClass()}`}>
        <p className="mb-2">Thank you for your purchase!</p>

        {includePromoSavings && data.totals.totalSavings > 0 && (
          <p className="text-green-600 font-medium">
            You saved {formatCurrency(data.totals.totalSavings)} today!
          </p>
        )}

        <div className="mt-3">
          <p>Visit us again soon!</p>
          <p>www.pospwaretail.com</p>
        </div>

        {showBarcode && (
          <div className="mt-3">
            <div className="text-xs text-gray-500">Transaction ID: {data.transactionId}</div>
            {/* Barcode would be rendered here using a barcode library */}
            <div className="mt-1 text-xs font-mono bg-gray-100 p-1 rounded">
              {data.receiptNumber}
            </div>
          </div>
        )}

        <div className="mt-3 text-xs text-gray-500">
          <p>Powered by POS PWA Retail System</p>
          <p>Version 2.0.0 - Phase 2</p>
        </div>
      </div>
    </div>
  );

  const renderMinimalTemplate = () => (
    <div className={getPaperWidthClass()}>
      <div className="text-center mb-4">
        <h1 className="font-bold text-lg">POS PWA RETAIL</h1>
        <p className="text-sm">No. {data.receiptNumber}</p>
        <p className="text-sm">{formatDate(data.date)}</p>
      </div>

      <div className="space-y-2">
        {data.items.map((item, index) => (
          <div key={`${item.itemId}-${index}`} className="flex justify-between text-sm">
            <div>
              <div>
                {item.itemName} x{item.quantity}
              </div>
              {item.appliedDiscounts.length > 0 && (
                <div className="text-xs text-green-600">
                  -{formatCurrency(item.discount)} discount
                </div>
              )}
            </div>
            <div className="font-medium">{formatCurrency(item.finalPrice)}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-gray-400 pt-2 mt-4">
        <div className="flex justify-between font-bold">
          <span>TOTAL:</span>
          <span>{formatCurrency(data.totals.totalAmount)}</span>
        </div>
      </div>
    </div>
  );

  const renderStandardTemplate = () => (
    <div className={`${getPaperWidthClass()} ${getFontSizeClass()}`}>
      {renderReceiptHeader()}
      {renderCustomerInfo()}
      {renderItems()}
      {renderDiscountBreakdown()}
      {renderTaxBreakdown()}
      {renderPaymentDetails()}
      {renderTotals()}
      {renderReceiptFooter()}
    </div>
  );

  // Template switching
  const renderTemplate = () => {
    switch (template) {
      case 'minimal':
        return renderMinimalTemplate();
      case 'customer-copy':
      case 'merchant-copy':
      case 'standard':
        return renderStandardTemplate();
      case 'detailed':
      default:
        return renderStandardTemplate();
    }
  };

  const handlePrint = async () => {
    try {
      if (onPrint) {
        onPrint();
        return;
      }

      // Convert receipt data to SalesTransaction format for printing
      const transaction: _SalesTransaction = {
        id: data.transactionId,
        branchId: data.cashier.branch,
        cashierId: data.cashier.id,
        items: data.items.map(item => ({
          ...item,
          metadata: {
            appliedRules: item.appliedDiscounts.map(discount => ({
              id: discount.ruleId,
              name: discount.ruleName,
              discountType: discount.discountType,
              discountValue: discount.discountValue,
            })),
          },
        })),
        subtotalAmount: data.totals.subtotal,
        discountAmount: data.totals.totalDiscounts,
        taxAmount: data.totals.totalTax,
        totalAmount: data.totals.totalAmount,
        paymentMethod: data.payments,
        status: 'completed',
        receiptNumber: data.receiptNumber,
        createdAt: data.date,
        updatedAt: data.date,
      };

      // Try to use ESC/POS printer if available
      try {
        // Initialize QZ Tray connection
        await escPosPrinter.initializeQZTray();

        // Print using thermal printer
        await escPosPrinter.printReceipt(transaction);
        console.log('✅ Receipt sent to thermal printer');
      } catch (printerError) {
        console.warn(
          '⚠️ Thermal printer not available, falling back to browser print:',
          printerError
        );

        // Fallback to browser print
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>Receipt - ${data.receiptNumber}</title>
                <style>
                  body { 
                    font-family: 'Courier New', monospace; 
                    margin: 0; 
                    padding: 20px;
                    background: white;
                  }
                  .receipt {
                    max-width: 300px;
                    margin: 0 auto;
                  }
                  @media print {
                    body { margin: 0; }
                    .receipt { max-width: none; }
                  }
                </style>
              </head>
              <body>
                <div class="receipt">
                  ${receiptRef.current?.innerHTML ?? ''}
                </div>
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      }
    } catch (error) {
      console.error('❌ Print failed:', error);
      alert('Failed to print receipt. Please try again.');
    }
  };

  return (
    <div className="receipt-container">
      <div
        ref={receiptRef}
        className={`receipt-content bg-white p-6 shadow-lg ${getPaperWidthClass()} mx-auto ${getFontSizeClass()}`}
      >
        {renderTemplate()}
      </div>

      {/* Print button for development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-center mt-4">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 print:hidden"
          >
            Print Receipt
          </button>
        </div>
      )}
    </div>
  );
};

export default ReceiptTemplate;

/**
 * Utility function to generate receipt data from cart items
 */
export const generateReceiptData = (
  cartItems: CartItem[],
  payment: PaymentBreakdown,
  cashier: { id: string; name: string; branch: string },
  customer?: { name?: string; memberId?: string; tier?: string }
): ReceiptData => {
  const now = new Date();
  const transactionId = crypto.randomUUID();
  const receiptNumber = `RCP-${now.getFullYear()}${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${now
    .getTime()
    .toString()
    .slice(-6)}`;

  // Calculate totals
  const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalDiscounts = cartItems.reduce((sum, item) => sum + item.discount, 0);
  const totalTax = cartItems.reduce((sum, item) => sum + item.taxAmount, 0);
  const totalAmount = subtotal + totalTax;
  const totalSavings = totalDiscounts;

  // Create payment breakdown with calculated totals
  const paymentBreakdown = {
    ...payment,
    // Add calculated totals for receipt display
    totalPayment:
      payment.cash + payment.card + payment.ewallet + payment.bankTransfer + payment.credit,
  };

  return {
    transactionId,
    receiptNumber,
    date: now,
    cashier,
    customer,
    items: cartItems.map(item => ({
      ...item,
      appliedDiscounts: [], // Would be populated by pricing engine
      originalPrice: item.unitPrice, // Would be populated by pricing engine
    })),
    pricingDetails: {
      baseSubtotal: subtotal,
      discountBreakdown: [],
      taxBreakdown: [
        {
          name: 'PPN',
          rate: 11,
          baseAmount: subtotal,
          taxAmount: totalTax,
        },
      ],
      promoSavings: totalSavings,
    },
    payments: paymentBreakdown,
    totals: {
      subtotal,
      totalDiscounts,
      totalTax,
      totalAmount,
      totalSavings,
    },
  };
};
