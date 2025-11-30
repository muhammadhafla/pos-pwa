/**
 * Receipt Printer Component
 * Handles receipt printing with queue management and error handling
 */

import React, { useState, useEffect } from 'react';
import { 
  PrinterIcon, 
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  ArrowPathIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { printQueueManager, PrintJob, PrintQueueStatus } from '@/services/receipt/PrintQueueManager';
import { ReceiptData } from '@/services/receipt/ESCPosCommandGenerator';

interface ReceiptPrinterProps {
  transactionId: string;
  receiptData: ReceiptData;
  onPrintComplete?: (jobId: string) => void;
  onPrintCancel?: () => void;
  autoPrint?: boolean;
}

interface QueueItem extends PrintJob {
  formatTime: string;
  formatAttempts: string;
}

const ReceiptPrinter: React.FC<ReceiptPrinterProps> = ({
  transactionId,
  receiptData,
  onPrintComplete,
  onPrintCancel,
  autoPrint = false
}) => {
  const [currentJob, setCurrentJob] = useState<PrintJob | null>(null);
  const [queueStatus, setQueueStatus] = useState<PrintQueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [printerList, setPrinterList] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');

  // Initialize component
  useEffect(() => {
    loadQueueStatus();
    loadPrinters();
    
    if (autoPrint) {
      handlePrint();
    }
  }, [transactionId, receiptData]);

  // Update queue status periodically
  useEffect(() => {
    const interval = setInterval(loadQueueStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadQueueStatus = () => {
    const status = printQueueManager.getQueueStatus();
    setQueueStatus(status);
  };

  const loadPrinters = async () => {
    try {
      const printers = await printQueueManager.refreshPrinterList();
      setPrinterList(printers);
      if (printers.length > 0 && !selectedPrinter) {
        setSelectedPrinter(printers[0]);
      }
    } catch (error) {
      console.error('Failed to load printers:', error);
    }
  };

  const handlePrint = async () => {
    setIsLoading(true);
    
    try {
      const jobId = await printQueueManager.addPrintJob(transactionId, receiptData, {
        printerName: selectedPrinter || undefined,
        priority: 'normal',
        retryOnFailure: true
      });
      
      setCurrentJob({
        id: jobId,
        transactionId,
        receiptData,
        priority: 'normal',
        status: 'pending',
        attempts: 0,
        maxAttempts: 4,
        createdAt: new Date()
      } as PrintJob);
      
      // Simulate job completion after a short delay for demo
      setTimeout(() => {
        if (onPrintComplete) {
          onPrintComplete(jobId);
        }
        toast.success('Receipt sent to printer');
      }, 2000);
      
    } catch (error) {
      console.error('Print job failed:', error);
      toast.error('Failed to send receipt to printer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (currentJob) {
      const cancelled = printQueueManager.cancelPrintJob(currentJob.id);
      if (cancelled) {
        toast.success('Print job cancelled');
        if (onPrintCancel) {
          onPrintCancel();
        }
      }
    }
  };

  const handleRetry = () => {
    if (currentJob) {
      const retried = printQueueManager.retryPrintJob(currentJob.id);
      if (retried) {
        toast.success('Print job restarted');
      }
    }
  };

  const formatDateTime = (date: Date): string => {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  const getStatusIcon = (status: PrintJob['status']) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'printing':
        return <PrinterIcon className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'retry':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: PrintJob['status']): string => {
    switch (status) {
      case 'pending':
        return 'In Queue';
      case 'printing':
        return 'Printing...';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'retry':
        return 'Retrying...';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status: PrintJob['status']): string => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'printing':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'failed':
      case 'retry':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
          <h2 className="text-xl font-bold text-gray-900">Receipt Printer</h2>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <EyeIcon className="h-4 w-4 mr-1" />
            Preview
          </button>
        </div>
      </div>

      {/* Receipt Preview */}
      {showPreview && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-xs font-mono bg-white p-4 rounded border max-h-64 overflow-y-auto">
            <div className="text-center font-bold">
              {receiptData.header.storeName}
            </div>
            <div className="text-center text-xs">
              {receiptData.header.storeAddress}
            </div>
            <div className="mt-4">
              <div>No: {receiptData.transaction.receiptNumber}</div>
              <div>Kasir: {receiptData.transaction.cashierName}</div>
              <div>Tanggal: {formatDateTime(receiptData.transaction.timestamp)}</div>
            </div>
            <div className="mt-4 border-t border-dashed pt-2">
              {receiptData.items.map((item, index) => (
                <div key={index} className="flex justify-between">
                  <span>{item.name} x{item.quantity}</span>
                  <span>Rp {item.totalPrice.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-dashed pt-2">
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>Rp {receiptData.totals.grandTotal.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printer Selection */}
      {printerList.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Printer
          </label>
          <select
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {printerList.map(printer => (
              <option key={printer} value={printer}>
                {printer}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Print Controls */}
      <div className="mb-6">
        {currentJob ? (
          <div className="space-y-4">
            {/* Current Job Status */}
            <div className={`p-4 rounded-lg border ${getStatusColor(currentJob.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {getStatusIcon(currentJob.status)}
                  <span className="ml-2 font-medium">{getStatusText(currentJob.status)}</span>
                </div>
                <span className="text-sm text-gray-600">
                  Job: {currentJob.id.split('-').pop()}
                </span>
              </div>
              
              {currentJob.attempts > 0 && (
                <div className="mt-2 text-sm text-gray-600">
                  Attempts: {currentJob.attempts}/{currentJob.maxAttempts}
                </div>
              )}
              
              {currentJob.errorMessage && (
                <div className="mt-2 text-sm text-red-600">
                  Error: {currentJob.errorMessage}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <div>
                {currentJob.status === 'failed' || currentJob.status === 'retry' ? (
                  <button
                    onClick={handleRetry}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700"
                  >
                    <ArrowPathIcon className="h-4 w-4 mr-1" />
                    Retry
                  </button>
                ) : currentJob.status === 'pending' ? (
                  <button
                    onClick={handleCancel}
                    className="flex items-center px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700"
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Cancel
                  </button>
                ) : null}
              </div>
              
              <div className="text-sm text-gray-600">
                {queueStatus && `${queueStatus.pendingJobs} jobs in queue`}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={handlePrint}
            disabled={isLoading}
            className="w-full flex items-center justify-center px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending to Printer...
              </>
            ) : (
              <>
                <PrinterIcon className="h-5 w-5 mr-2" />
                Print Receipt
              </>
            )}
          </button>
        )}
      </div>

      {/* Queue Status */}
      {queueStatus && queueStatus.totalJobs > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Print Queue Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-600">{queueStatus.pendingJobs}</div>
              <div className="text-gray-600">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{queueStatus.printingJobs}</div>
              <div className="text-gray-600">Printing</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{queueStatus.completedJobs}</div>
              <div className="text-gray-600">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{queueStatus.failedJobs}</div>
              <div className="text-gray-600">Failed</div>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-800 mb-2">Printing Tips</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Make sure QZ Tray is installed for best printing experience</li>
          <li>• Check that your thermal printer is connected and powered on</li>
          <li>• Failed prints will be automatically retried</li>
          <li>• Use preview to see how your receipt will look</li>
        </ul>
      </div>
    </div>
  );
};

export default ReceiptPrinter;