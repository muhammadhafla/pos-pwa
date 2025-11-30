/**
 * Custom hook for receipt printing functionality
 * Integrates print queue manager with transaction completion
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { printQueueManager } from '@/services/receipt/PrintQueueManager';
import { ReceiptData } from '@/services/receipt/ESCPosCommandGenerator';

interface UseReceiptPrintingOptions {
  autoPrint?: boolean;
  showPreview?: boolean;
  onPrintComplete?: (jobId: string) => void;
  onPrintError?: (error: string) => void;
}

interface UseReceiptPrintingReturn {
  printReceipt: (transactionId: string, receiptData: ReceiptData, options?: UseReceiptPrintingOptions) => Promise<string | null>;
  queueStatus: any;
  isLoading: boolean;
  lastJobId: string | null;
  printers: string[];
  refreshPrinters: () => Promise<void>;
}

export const useReceiptPrinting = (
  initialOptions: UseReceiptPrintingOptions = {}
): UseReceiptPrintingReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);

  const printReceipt = useCallback(async (
    transactionId: string,
    receiptData: ReceiptData,
    options: UseReceiptPrintingOptions = {}
  ): Promise<string | null> => {
    setIsLoading(true);

    try {
      // Merge options with initial options
      const printOptions = { ...initialOptions, ...options };

      // Add job to print queue
      const jobId = await printQueueManager.addPrintJob(transactionId, receiptData, {
        priority: printOptions.autoPrint ? 'high' : 'normal',
        retryOnFailure: true,
        previewBeforePrint: printOptions.showPreview
      });

      setLastJobId(jobId);

      // Show success message
      toast.success('Receipt sent to printer queue');

      // Trigger callback
      if (printOptions.onPrintComplete) {
        printOptions.onPrintComplete(jobId);
      }

      return jobId;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      toast.error(`Print failed: ${errorMessage}`);
      
      if (options.onPrintError) {
        options.onPrintError(errorMessage);
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [initialOptions]);

  const queueStatus = printQueueManager.getQueueStatus();

  const refreshPrinters = useCallback(async () => {
    try {
      const printerList = await printQueueManager.refreshPrinterList();
      setPrinters(printerList);
    } catch (error) {
      console.error('Failed to refresh printers:', error);
      toast.error('Failed to load printers');
    }
  }, []);

  return {
    printReceipt,
    queueStatus,
    isLoading,
    lastJobId,
    printers,
    refreshPrinters
  };
};

// Utility function to generate receipt data from transaction
export const generateReceiptDataFromTransaction = (
  transaction: any,
  storeInfo: any,
  customerInfo?: any
): ReceiptData => {
  return {
    header: {
      storeName: storeInfo.name,
      storeAddress: storeInfo.address,
      storePhone: storeInfo.phone,
      storeTaxId: storeInfo.taxId
    },
    transaction: {
      receiptNumber: transaction.receiptNumber,
      cashierName: transaction.cashierName,
      timestamp: new Date(transaction.timestamp),
      branchId: transaction.branchId
    },
    customer: customerInfo,
    items: transaction.items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      discount: item.discount,
      barcode: item.barcode
    })),
    discounts: transaction.discounts || [],
    payments: transaction.payments.map((payment: any) => ({
      method: payment.method,
      amount: payment.amount,
      reference: payment.reference
    })),
    totals: {
      subtotal: transaction.subtotal,
      discountTotal: transaction.discountTotal,
      taxTotal: transaction.taxTotal,
      grandTotal: transaction.grandTotal,
      changeGiven: transaction.changeGiven
    },
    footer: {
      thankYouMessage: 'Terima kasih telah berbelanja!',
      returnPolicy: 'Barang dapat dikembalikan dalam 7 hari dengan struk asli',
      website: storeInfo.website,
      socialMedia: storeInfo.socialMedia
    }
  };
};

// Utility function to handle transaction completion with printing
export const handleTransactionCompletion = async (
  transaction: any,
  storeInfo: any,
  options: {
    printReceipt?: boolean;
    showPreview?: boolean;
    onComplete?: (jobId: string) => void;
    onError?: (error: string) => void;
  } = {}
) => {
  const { printReceipt: shouldPrint = true, showPreview = false, onComplete, onError } = options;

  try {
    if (shouldPrint) {
      // Generate receipt data
      const receiptData = generateReceiptDataFromTransaction(transaction, storeInfo);
      
      // Print receipt using the hook
      const { printReceipt } = useReceiptPrinting({
        autoPrint: true,
        showPreview,
        onPrintComplete: onComplete,
        onPrintError: onError
      });

      const jobId = await printReceipt(transaction.id, receiptData);
      return jobId;
    }

    return null;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Transaction completion failed';
    
    if (onError) {
      onError(errorMessage);
    }
    
    throw error;
  }
};

export default useReceiptPrinting;