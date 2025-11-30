/**
 * Print Queue Manager
 * Handles print jobs with retry logic and queue management
 * Integrates with QZ Tray for cross-browser printing
 */

import { escPosCommandGenerator, ReceiptData } from './ESCPosCommandGenerator';
import { db } from '@/services/database/POSDatabase';
import { toast } from 'react-hot-toast';

export interface PrintJob {
  id: string;
  transactionId: string;
  receiptData: ReceiptData;
  priority: 'high' | 'normal' | 'low';
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'retry';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  errorMessage?: string;
  printerName?: string;
}

export interface PrintQueueStatus {
  totalJobs: number;
  pendingJobs: number;
  printingJobs: number;
  failedJobs: number;
  completedJobs: number;
  averagePrintTime: number;
}

export interface PrintConfiguration {
  printerName?: string;
  copies?: number;
  previewBeforePrint?: boolean;
  autoCut?: boolean;
  soundOnPrint?: boolean;
  retryOnFailure?: boolean;
  priority?: 'high' | 'normal' | 'low';
}

export class PrintQueueManager {
  private printQueue: Map<string, PrintJob> = new Map();
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly RETRY_DELAYS = [1000, 5000, 15000, 30000]; // 1s, 5s, 15s, 30s
  private readonly MAX_CONCURRENT_JOBS = 2;

  constructor() {
    this.initializeQZTray();
    this.startProcessing();
  }

  /**
   * Initialize QZ Tray connection
   */
  private async initializeQZTray(): Promise<void> {
    try {
      // Check if QZ Tray is available
      if (typeof window !== 'undefined' && window.qz) {
        console.log('✅ QZ Tray initialized successfully');
        
        // Set up QZ Tray event listeners
        window.qz.websocket.connect().then(() => {
          console.log('🔗 QZ Tray WebSocket connected');
          this.refreshPrinterList();
        }).catch((error: any) => {
          console.warn('⚠️ QZ Tray connection failed:', error);
          toast.error('QZ Tray not available - printing will use browser fallback');
        });

        // Listen for QZ Tray events
        if (window.qz.websocket.getConnection()) {
          window.qz.websocket.getConnection().on('connection', (event: any) => {
            console.log('🔗 QZ Tray connection event:', event);
            this.refreshPrinterList();
          });
        }
      } else {
        console.warn('⚠️ QZ Tray not found in window object');
        toast.error('QZ Tray not installed - please install for better printing experience');
      }
    } catch (error) {
      console.error('❌ Failed to initialize QZ Tray:', error);
    }
  }

  /**
   * Add print job to queue
   */
  async addPrintJob(
    transactionId: string,
    receiptData: ReceiptData,
    config: Partial<PrintConfiguration> = {}
  ): Promise<string> {
    const jobId = `print-${transactionId}-${Date.now()}`;
    
    const job: PrintJob = {
      id: jobId,
      transactionId,
      receiptData,
      priority: config.priority || 'normal',
      status: 'pending',
      attempts: 0,
      maxAttempts: config.retryOnFailure !== false ? 4 : 1,
      createdAt: new Date(),
      printerName: config.printerName
    };

    // Store in queue and database
    this.printQueue.set(jobId, job);
    await this.savePrintJobToDatabase(job);

    console.log(`📄 Print job added to queue: ${jobId}`);
    
    // Show user feedback
    toast.success('Receipt queued for printing');
    
    return jobId;
  }

  /**
   * Start processing print queue
   */
  private startProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 2000); // Check queue every 2 seconds
  }

  /**
   * Process print queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const activePrintJobs = Array.from(this.printQueue.values())
      .filter(job => job.status === 'printing').length;

    if (activePrintJobs >= this.MAX_CONCURRENT_JOBS) {
      return; // Max concurrent jobs reached
    }

    this.isProcessing = true;

    try {
      // Get next pending job
      const nextJob = this.getNextPrintJob();
      if (!nextJob) {
        return; // No pending jobs
      }

      await this.processPrintJob(nextJob);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get next print job from queue
   */
  private getNextPrintJob(): PrintJob | null {
    const pendingJobs = Array.from(this.printQueue.values())
      .filter(job => job.status === 'pending')
      .sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    return pendingJobs[0] || null;
  }

  /**
   * Process individual print job
   */
  private async processPrintJob(job: PrintJob): Promise<void> {
    console.log(`🖨️ Processing print job: ${job.id}`);
    
    // Update job status
    job.status = 'printing';
    job.lastAttemptAt = new Date();
    this.printQueue.set(job.id, job);

    try {
      const printSuccess = await this.executePrintJob(job);
      
      if (printSuccess) {
        job.status = 'completed';
        console.log(`✅ Print job completed: ${job.id}`);
        toast.success('Receipt printed successfully');
      } else {
        throw new Error('Print execution failed');
      }
    } catch (error) {
      await this.handlePrintFailure(job, error as Error);
    } finally {
      this.printQueue.set(job.id, job);
      await this.savePrintJobToDatabase(job);
    }
  }

  /**
   * Execute print job
   */
  private async executePrintJob(job: PrintJob): Promise<boolean> {
    try {
      // Generate ESC/POS commands
      const commands = escPosCommandGenerator.generateReceipt(job.receiptData);
      
      // Try QZ Tray printing first
      if (await this.printWithQZTray(job, commands)) {
        return true;
      }

      // Fallback to browser printing
      return await this.printWithBrowser(job, commands);
      
    } catch (error) {
      console.error(`❌ Print job execution failed: ${job.id}`, error);
      throw error;
    }
  }

  /**
   * Print using QZ Tray
   */
  private async printWithQZTray(job: PrintJob, commands: number[]): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !window.qz) {
        throw new Error('QZ Tray not available');
      }

      const qz = window.qz;
      
      // Find printer
      const printers = await qz.printers.find();
      const targetPrinter = job.printerName || printers[0];
      
      if (!targetPrinter) {
        throw new Error('No printers available');
      }

      // Create print data
      const printData = [{
        type: 'raw',
        format: 'command',
        data: commands
      }];

      // Send to printer
      await qz.print.print(targetPrinter, printData);

      console.log(`🖨️ QZ Tray print sent: ${job.id} to ${targetPrinter}`);
      return true;

    } catch (error) {
      console.warn(`⚠️ QZ Tray print failed: ${job.id}`, error);
      return false;
    }
  }

  /**
   * Print using browser fallback
   */
  private async printWithBrowser(job: PrintJob, commands: number[]): Promise<boolean> {
    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Failed to open print window');
      }

      // Generate HTML for receipt
      const htmlContent = this.generatePrintableHTML(job.receiptData);
      
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Wait for content to load
      await new Promise(resolve => {
        printWindow.onload = resolve;
        setTimeout(resolve, 1000);
      });

      // Trigger print
      printWindow.print();
      
      // Close window after print
      setTimeout(() => {
        printWindow.close();
      }, 1000);

      console.log(`🖨️ Browser print triggered: ${job.id}`);
      return true;

    } catch (error) {
      console.error(`❌ Browser print failed: ${job.id}`, error);
      return false;
    }
  }

  /**
   * Generate printable HTML from receipt data
   */
  private generatePrintableHTML(receiptData: ReceiptData): string {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(amount);
    };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${receiptData.transaction.receiptNumber}</title>
        <style>
          @page { margin: 0; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 12px; 
            margin: 20px;
            width: 280px;
          }
          .header { text-align: center; font-weight: bold; }
          .item-line { display: flex; justify-content: space-between; }
          .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 5px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${receiptData.header.storeName}</h2>
          <div>${receiptData.header.storeAddress}</div>
          ${receiptData.header.storePhone ? `<div>Tel: ${receiptData.header.storePhone}</div>` : ''}
          ${receiptData.header.storeTaxId ? `<div>NPWP: ${receiptData.header.storeTaxId}</div>` : ''}
        </div>
        
        <div style="margin: 10px 0;">
          <div>No Struk: ${receiptData.transaction.receiptNumber}</div>
          <div>Kasir: ${receiptData.transaction.cashierName}</div>
          <div>Tanggal: ${formatDate(receiptData.transaction.timestamp)}</div>
          <div>Cabang: ${receiptData.transaction.branchId}</div>
        </div>
        
        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
        
        ${receiptData.items.map(item => `
          <div>
            <div>${item.name} x${item.quantity}</div>
            <div class="item-line">
              <span></span>
              <span>${formatCurrency(item.totalPrice)}</span>
            </div>
            ${item.discount && item.discount > 0 ? `<div>Diskon: -${formatCurrency(item.discount)}</div>` : ''}
          </div>
        `).join('')}
        
        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
        
        <div>
          <div class="item-line">
            <span>Subtotal:</span>
            <span>${formatCurrency(receiptData.totals.subtotal)}</span>
          </div>
          ${receiptData.totals.discountTotal > 0 ? `
          <div class="item-line">
            <span>Total Diskon:</span>
            <span>-${formatCurrency(receiptData.totals.discountTotal)}</span>
          </div>
          ` : ''}
          <div class="item-line">
            <span>Pajak:</span>
            <span>${formatCurrency(receiptData.totals.taxTotal)}</span>
          </div>
          <div class="item-line total">
            <span>TOTAL:</span>
            <span>${formatCurrency(receiptData.totals.grandTotal)}</span>
          </div>
        </div>
        
        <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
        
        <div>
          <div style="font-weight: bold;">PEMBAYARAN:</div>
          ${receiptData.payments.map(payment => `
            <div class="item-line">
              <span>${payment.method.toUpperCase()}:</span>
              <span>${formatCurrency(payment.amount)}</span>
            </div>
            ${payment.reference ? `<div>Ref: ${payment.reference}</div>` : ''}
          `).join('')}
          ${receiptData.totals.changeGiven > 0 ? `
          <div class="item-line">
            <span>Kembalian:</span>
            <span>${formatCurrency(receiptData.totals.changeGiven)}</span>
          </div>
          ` : ''}
        </div>
        
        <div style="margin: 20px 0; text-align: center;">
          ${receiptData.footer.thankYouMessage ? `<div style="font-weight: bold;">${receiptData.footer.thankYouMessage}</div>` : ''}
          ${receiptData.footer.returnPolicy ? `<div>${receiptData.footer.returnPolicy}</div>` : ''}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Handle print failure with retry logic
   */
  private async handlePrintFailure(job: PrintJob, error: Error): Promise<void> {
    job.attempts++;
    
    if (job.attempts < job.maxAttempts) {
      // Schedule retry
      const retryDelay = this.RETRY_DELAYS[Math.min(job.attempts - 1, this.RETRY_DELAYS.length - 1)];
      
      setTimeout(() => {
        job.status = 'retry';
        this.printQueue.set(job.id, job);
        console.log(`🔄 Retrying print job: ${job.id} (attempt ${job.attempts})`);
      }, retryDelay);
      
      toast.error(`Print failed, retrying in ${retryDelay / 1000}s...`);
    } else {
      // Max attempts reached
      job.status = 'failed';
      job.errorMessage = error.message;
      
      console.error(`❌ Print job failed permanently: ${job.id}`, error);
      toast.error('Print failed permanently');
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): PrintQueueStatus {
    const jobs = Array.from(this.printQueue.values());
    
    const status: PrintQueueStatus = {
      totalJobs: jobs.length,
      pendingJobs: jobs.filter(j => j.status === 'pending').length,
      printingJobs: jobs.filter(j => j.status === 'printing').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      averagePrintTime: 0
    };

    return status;
  }

  /**
   * Cancel print job
   */
  cancelPrintJob(jobId: string): boolean {
    const job = this.printQueue.get(jobId);
    if (!job) return false;

    if (job.status === 'pending' || job.status === 'retry') {
      job.status = 'failed';
      job.errorMessage = 'Cancelled by user';
      this.printQueue.set(jobId, job);
      this.savePrintJobToDatabase(job);
      return true;
    }

    return false;
  }

  /**
   * Retry failed print job
   */
  retryPrintJob(jobId: string): boolean {
    const job = this.printQueue.get(jobId);
    if (!job || job.status !== 'failed') return false;

    job.status = 'pending';
    job.attempts = 0;
    job.errorMessage = undefined;
    job.lastAttemptAt = undefined;
    this.printQueue.set(jobId, job);
    this.savePrintJobToDatabase(job);
    
    return true;
  }

  /**
   * Get available printers (QZ Tray)
   */
  async refreshPrinterList(): Promise<string[]> {
    try {
      if (typeof window !== 'undefined' && window.qz) {
        const printers = await window.qz.printers.find();
        console.log('🖨️ Available printers:', printers);
        return printers;
      }
    } catch (error) {
      console.error('Failed to get printer list:', error);
    }
    
    return [];
  }

  /**
   * Save print job to database
   */
  private async savePrintJobToDatabase(job: PrintJob): Promise<void> {
    try {
      // TODO: Implement database save
      console.log('Save print job to database:', job.id);
    } catch (error) {
      console.error('Failed to save print job to database:', error);
    }
  }

  /**
   * Load print jobs from database
   */
  async loadPrintJobsFromDatabase(): Promise<void> {
    try {
      // TODO: Implement database load
      console.log('Load print jobs from database');
    } catch (error) {
      console.error('Failed to load print jobs from database:', error);
    }
  }

  /**
   * Cleanup old completed jobs
   */
  async cleanupOldJobs(): Promise<void> {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [jobId, job] of this.printQueue.entries()) {
      if ((job.status === 'completed' || job.status === 'failed') && 
          job.lastAttemptAt && job.lastAttemptAt < cutoffTime) {
        this.printQueue.delete(jobId);
        // TODO: Implement database delete
        console.log('Delete print job from database:', jobId);
      }
    }
  }

  /**
   * Stop processing and cleanup
   */
  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

// Global QZ Tray type declaration
declare global {
  interface Window {
    qz: any;
  }
}

// Export singleton instance
export const printQueueManager = new PrintQueueManager();