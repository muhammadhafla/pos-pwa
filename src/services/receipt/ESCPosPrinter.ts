/**
 * ESC/POS Printer Service
 * Generates ESC/POS commands for thermal receipt printing
 * Integrates with QZ Tray for cross-browser printing support
 */

import { SalesTransaction, CartItem } from '@/types';
import { receiptTemplateService } from './ReceiptTemplateService';

export interface PrinterConfig {
  width: number; // characters for thermal printers
  encoding: 'utf8' | 'cp437' | 'cp850' | 'cp852';
  cutPaper: boolean;
  openCashDrawer: boolean;
}

export interface PrintJob {
  id: string;
  printerName: string;
  commands: string[];
  config: PrinterConfig;
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
}

export class ESCPosPrinter {
  private config: PrinterConfig;
  private printQueue: PrintJob[] = [];
  private isProcessing = false;
  private qzTray: WebSocket | null = null;
  private isConnected = false;

  constructor(config: Partial<PrinterConfig> = {}) {
    this.config = {
      width: 32,
      encoding: 'utf8',
      cutPaper: true,
      openCashDrawer: false,
      ...config
    };
  }

  /**
   * Initialize QZ Tray connection
   */
  async initializeQZTray(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.qzTray = new WebSocket('ws://localhost:8181');
        
        this.qzTray.onopen = () => {
          console.log('✅ Connected to QZ Tray');
          this.isConnected = true;
          this.startPrintQueueProcessor();
          resolve();
        };

        this.qzTray.onerror = (error) => {
          console.error('❌ QZ Tray connection error:', error);
          this.isConnected = false;
          reject(new Error('Failed to connect to QZ Tray'));
        };

        this.qzTray.onclose = () => {
          console.log('🔌 QZ Tray connection closed');
          this.isConnected = false;
        };

        this.qzTray.onmessage = (event) => {
          this.handleQZTrayMessage(event);
        };

        // Timeout if connection takes too long
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('QZ Tray connection timeout'));
          }
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle messages from QZ Tray
   */
  private handleQZTrayMessage(event: MessageEvent): void {
    try {
      const response = JSON.parse(event.data);
      
      if (response.result) {
        console.log('✅ Print job completed:', response.result);
      } else if (response.error) {
        console.error('❌ Print job failed:', response.error);
      }
    } catch (error) {
      console.error('Failed to parse QZ Tray response:', error);
    }
  }

  /**
   * Get available printers
   */
  async getAvailablePrinters(): Promise<string[]> {
    if (!this.isConnected) {
      throw new Error('QZ Tray not connected');
    }

    return new Promise((resolve, reject) => {
      const message = { method: 'printers', params: {} };
      
      this.qzTray!.send(JSON.stringify(message));

      const timeout = setTimeout(() => {
        reject(new Error('QZ Tray request timeout'));
      }, 5000);

      this.qzTray!.onmessage = (event: MessageEvent) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(event.data);
          if (response.result) {
            const printers = response.result.map((p: any) => p.name);
            resolve(printers);
          } else {
            reject(new Error('Invalid QZ Tray response'));
          }
        } catch (error) {
          reject(error);
        }
      };
    });
  }

  /**
   * Add print job to queue
   */
  async printReceipt(
    transaction: SalesTransaction,
    printerName?: string
  ): Promise<string> {
    try {
      // Generate ESC/POS commands
      const commands = this.generateReceiptCommands(transaction);
      
      // Create print job
      const job: PrintJob = {
        id: crypto.randomUUID(),
        printerName: printerName || 'default',
        commands,
        config: this.config,
        priority: 1,
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date()
      };

      this.printQueue.push(job);
      
      // Process immediately if not busy
      if (!this.isProcessing) {
        this.startPrintQueueProcessor();
      }

      return job.id;
    } catch (error) {
      console.error('Failed to add print job:', error);
      throw error;
    }
  }

  /**
   * Generate ESC/POS commands for receipt
   */
  private generateReceiptCommands(transaction: SalesTransaction): string[] {
    const commands: string[] = [];

    // Initialize printer
    commands.push('\x1B\x40'); // ESC @

    // Set character size and font
    commands.push('\x1B\x21\x00'); // Normal size
    commands.push('\x1D\x21\x00'); // Normal character width

    // Store header
    commands.push(...this.generateHeaderCommands());

    // Transaction info
    commands.push(...this.generateTransactionInfoCommands(transaction));

    // Items section
    commands.push(...this.generateItemsCommands(transaction.items));

    // Totals section
    commands.push(...this.generateTotalsCommands(transaction));

    // Payment info
    commands.push(...this.generatePaymentCommands(transaction));

    // Footer
    commands.push(...this.generateFooterCommands());

    // Cut paper if enabled
    if (this.config.cutPaper) {
      commands.push('\x1D\x56\x00'); // GS V 0 (partial cut)
    }

    // Open cash drawer if enabled
    if (this.config.openCashDrawer) {
      commands.push('\x1B\x70\x00\x19\xFA'); // ESC p 0 25*250us
    }

    return commands;
  }

  /**
   * Generate header commands
   */
  private generateHeaderCommands(): string[] {
    const commands: string[] = [];
    
    commands.push('\x1B\x61\x01'); // Center align
    commands.push('\x1B\x21\x10'); // Double height
    commands.push('YOUR STORE NAME\n');
    
    commands.push('\x1B\x21\x00'); // Normal size
    commands.push('123 Main St, City, State\n');
    commands.push('Tel: (555) 123-4567\n');
    commands.push('\n');
    
    return commands;
  }

  /**
   * Generate transaction info commands
   */
  private generateTransactionInfoCommands(transaction: SalesTransaction): string[] {
    const commands: string[] = [];
    
    commands.push('\x1B\x61\x00'); // Left align
    commands.push('='.repeat(this.config.width) + '\n');
    commands.push(`Receipt: ${transaction.receiptNumber}\n`);
    commands.push(`Date: ${transaction.createdAt.toLocaleDateString()}\n`);
    commands.push(`Time: ${transaction.createdAt.toLocaleTimeString()}\n`);
    commands.push(`Cashier: Cashier Name\n`);
    commands.push('='.repeat(this.config.width) + '\n');
    commands.push('\n');
    
    return commands;
  }

  /**
   * Generate items commands with pricing breakdown
   */
  private generateItemsCommands(items: CartItem[]): string[] {
    const commands: string[] = [];
    
    commands.push('ITEMS PURCHASED\n');
    commands.push('-'.repeat(this.config.width) + '\n');
    
    items.forEach((item, index) => {
      // Item name and quantity
      const nameLine = `${item.quantity.toString().padStart(3)} x ${item.itemName}`;
      commands.push(this.wrapText(nameLine, this.config.width) + '\n');
      
      // Unit price
      const priceLine = `  @ ${item.unitPrice.toFixed(2)} ea`;
      const totalPrice = item.totalPrice.toFixed(2).padStart(10);
      commands.push(priceLine + totalPrice + '\n');
      
      // Discount information
      if (item.discount > 0) {
        const discountLine = `  Discount: -${item.discount.toFixed(2)}`;
        commands.push(discountLine + '\n');
      }
      
      // Applied pricing rules breakdown
      if (item.metadata?.appliedRules) {
        const rules = item.metadata.appliedRules as any[];
        rules.forEach(rule => {
          const ruleDiscount = this.calculateRuleDiscount(item, rule);
          const ruleLine = `  * ${rule.name}: -${ruleDiscount.toFixed(2)}`;
          commands.push(this.wrapText(ruleLine, this.config.width) + '\n');
        });
      }
      
      commands.push('\n'); // Empty line between items
    });
    
    return commands;
  }

  /**
   * Generate totals commands
   */
  private generateTotalsCommands(transaction: SalesTransaction): string[] {
    const commands: string[] = [];
    
    commands.push('-'.repeat(this.config.width) + '\n');
    
    // Subtotal
    commands.push('Subtotal:'.padEnd(this.config.width - 10) + transaction.subtotalAmount.toFixed(2) + '\n');
    
    // Discount breakdown
    if (transaction.discountAmount > 0) {
      commands.push('DISCOUNTS:\n');
      
      const discountBreakdown = this.getDiscountBreakdown(transaction.items);
      discountBreakdown.forEach(discount => {
        const discountLine = `  ${discount.type}: -${discount.amount.toFixed(2)}`;
        commands.push(discountLine + '\n');
      });
      
      commands.push('-'.repeat(this.config.width) + '\n');
      commands.push('Total Discount:'.padEnd(this.config.width - 10) + `-${transaction.discountAmount.toFixed(2)}\n`);
    }
    
    // Tax
    if (transaction.taxAmount > 0) {
      commands.push('Tax:'.padEnd(this.config.width - 10) + transaction.taxAmount.toFixed(2) + '\n');
    }
    
    commands.push('='.repeat(this.config.width) + '\n');
    
    // Final total
    commands.push('\x1B\x21\x10'); // Double height
    commands.push('TOTAL:'.padEnd(this.config.width - 10) + transaction.totalAmount.toFixed(2) + '\n');
    commands.push('\x1B\x21\x00'); // Normal size
    
    return commands;
  }

  /**
   * Generate payment commands
   */
  private generatePaymentCommands(transaction: SalesTransaction): string[] {
    const commands: string[] = [];
    
    if (transaction.paymentMethod) {
      commands.push('\nPAYMENT:\n');
      commands.push('-'.repeat(this.config.width) + '\n');
      
      const paymentLines = this.formatPaymentLines(transaction.paymentMethod);
      paymentLines.forEach(line => {
        commands.push(line + '\n');
      });
      
      if (transaction.paymentMethod.change && transaction.paymentMethod.change > 0) {
        commands.push('Change:'.padEnd(this.config.width - 10) + transaction.paymentMethod.change.toFixed(2) + '\n');
      }
    }
    
    return commands;
  }

  /**
   * Generate footer commands
   */
  private generateFooterCommands(): string[] {
    const commands: string[] = [];
    
    commands.push('\n' + '='.repeat(this.config.width) + '\n');
    commands.push('\x1B\x61\x01'); // Center align
    commands.push('Thank you for your business!\n');
    commands.push('Please come again.\n');
    commands.push('\n');
    commands.push('\x1B\x61\x00'); // Left align
    
    return commands;
  }

  /**
   * Wrap text to fit printer width
   */
  private wrapText(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) {
      return text;
    }
    
    // Simple word wrap
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.join('\n');
  }

  /**
   * Calculate discount amount for pricing rule
   */
  private calculateRuleDiscount(item: CartItem, rule: any): number {
    switch (rule.discountType) {
      case 'percentage':
        return (item.totalPrice * rule.discountValue) / 100;
      case 'fixed_amount':
        return rule.discountValue;
      case 'free_item':
        return item.unitPrice;
      default:
        return 0;
    }
  }

  /**
   * Get discount breakdown from items
   */
  private getDiscountBreakdown(items: CartItem[]): Array<{ type: string; amount: number }> {
    const breakdown: Array<{ type: string; amount: number }> = [];
    
    items.forEach(item => {
      if (item.discount > 0) {
        breakdown.push({
          type: 'Item Discount',
          amount: item.discount
        });
      }
    });
    
    return breakdown;
  }

  /**
   * Format payment lines
   */
  private formatPaymentLines(paymentMethod: any): string[] {
    const lines: string[] = [];
    
    if (paymentMethod.cash > 0) {
      lines.push(`  Cash: ${paymentMethod.cash.toFixed(2)}`);
    }
    
    if (paymentMethod.card > 0) {
      lines.push(`  Card: ${paymentMethod.card.toFixed(2)}`);
    }
    
    if (paymentMethod.ewallet > 0) {
      lines.push(`  E-Wallet: ${paymentMethod.ewallet.toFixed(2)}`);
    }
    
    if (paymentMethod.bankTransfer > 0) {
      lines.push(`  Bank Transfer: ${paymentMethod.bankTransfer.toFixed(2)}`);
    }
    
    if (paymentMethod.credit > 0) {
      lines.push(`  Credit: ${paymentMethod.credit.toFixed(2)}`);
    }
    
    return lines;
  }

  /**
   * Start print queue processor
   */
  private startPrintQueueProcessor(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    const processNext = async () => {
      if (this.printQueue.length === 0) {
        this.isProcessing = false;
        return;
      }
      
      const job = this.printQueue.shift()!;
      
      try {
        await this.sendPrintJob(job);
        console.log(`✅ Print job ${job.id} completed`);
      } catch (error) {
        console.error(`❌ Print job ${job.id} failed:`, error);
        
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
          this.printQueue.push(job); // Re-add to queue for retry
        } else {
          console.error(`Print job ${job.id} failed after ${job.maxRetries} retries`);
        }
      }
      
      // Process next job after a short delay
      setTimeout(processNext, 100);
    };
    
    processNext();
  }

  /**
   * Send print job to QZ Tray
   */
  private async sendPrintJob(job: PrintJob): Promise<void> {
    if (!this.isConnected) {
      throw new Error('QZ Tray not connected');
    }

    return new Promise((resolve, reject) => {
      const message = {
        method: 'print',
        params: {
          printer: job.printerName,
          data: job.commands,
          options: {
            encoding: this.config.encoding,
            copies: 1,
            margin: 'none'
          }
        }
      };

      this.qzTray!.send(JSON.stringify(message));

      const timeout = setTimeout(() => {
        reject(new Error('Print job timeout'));
      }, 30000);

      this.qzTray!.onmessage = (event: MessageEvent) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(event.data);
          if (response.result) {
            resolve();
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            reject(new Error('Invalid print response'));
          }
        } catch (error) {
          reject(error);
        }
      };
    });
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    isConnected: boolean;
  } {
    return {
      queueLength: this.printQueue.length,
      isProcessing: this.isProcessing,
      isConnected: this.isConnected
    };
  }

  /**
   * Clear print queue
   */
  clearQueue(): void {
    this.printQueue = [];
    console.log('Print queue cleared');
  }

  /**
   * Disconnect from QZ Tray
   */
  disconnect(): void {
    if (this.qzTray) {
      this.qzTray.close();
      this.qzTray = null;
      this.isConnected = false;
    }
    this.clearQueue();
  }
}

// Export singleton instance with default config
export const escPosPrinter = new ESCPosPrinter({
  width: 32,
  encoding: 'utf8',
  cutPaper: true,
  openCashDrawer: false
});