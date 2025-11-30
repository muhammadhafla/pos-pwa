/**
 * ESC/POS Command Generator
 * Generates ESC/POS commands for thermal receipt printers
 */

export interface ESCPosCommand {
  command: number[];
  description?: string;
}

export interface ReceiptData {
  header: {
    storeName: string;
    storeAddress: string;
    storePhone?: string;
    storeTaxId?: string;
  };
  transaction: {
    receiptNumber: string;
    cashierName: string;
    timestamp: Date;
    branchId: string;
  };
  customer?: {
    name?: string;
    phone?: string;
    memberId?: string;
  };
  items: ReceiptItem[];
  discounts: ReceiptDiscount[];
  payments: ReceiptPayment[];
  totals: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
    changeGiven: number;
  };
  footer: {
    thankYouMessage?: string;
    returnPolicy?: string;
    website?: string;
    socialMedia?: string[];
  };
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount?: number;
  barcode?: string;
}

export interface ReceiptDiscount {
  name: string;
  amount: number;
  type: 'percentage' | 'fixed';
  appliedTo?: string; // item name or 'total'
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  reference?: string;
}

export class ESCPosCommandGenerator {
  private readonly ESC = 0x1B;
  private readonly GS = 0x1D;

  /**
   * Initialize printer
   */
  initializePrinter(): ESCPosCommand {
    return {
      command: [this.ESC, 0x40], // ESC @
      description: 'Initialize printer'
    };
  }

  /**
   * Set character size
   */
  setCharacterSize(width: number = 1, height: number = 1): ESCPosCommand {
    const widthBit = Math.max(0, Math.min(7, width - 1)) << 4;
    const heightBit = Math.max(0, Math.min(7, height - 1));
    return {
      command: [this.GS, 0x21, widthBit | heightBit], // GS ! n
      description: `Set character size: ${width}x${height}`
    };
  }

  /**
   * Set alignment
   */
  setAlignment(alignment: 'left' | 'center' | 'right'): ESCPosCommand {
    const alignMap = { left: 0, center: 1, right: 2 };
    return {
      command: [this.ESC, 0x61, alignMap[alignment]], // ESC a n
      description: `Set alignment: ${alignment}`
    };
  }

  /**
   * Set font emphasis
   */
  setEmphasis(enabled: boolean): ESCPosCommand {
    return {
      command: [this.ESC, 0x45, enabled ? 1 : 0], // ESC E n
      description: `Set emphasis: ${enabled ? 'on' : 'off'}`
    };
  }

  /**
   * Set double strike
   */
  setDoubleStrike(enabled: boolean): ESCPosCommand {
    return {
      command: [this.ESC, 0x47, enabled ? 1 : 0], // ESC G n
      description: `Set double strike: ${enabled ? 'on' : 'off'}`
    };
  }

  /**
   * Feed lines
   */
  feedLines(lines: number = 1): ESCPosCommand {
    return {
      command: [this.ESC, 0x64, lines], // ESC d n
      description: `Feed ${lines} line(s)`
    };
  }

  /**
   * Cut paper
   */
  cutPaper(): ESCPosCommand {
    return {
      command: [this.GS, 0x56, 0x42, 0x00], // GS V B n
      description: 'Cut paper'
    };
  }

  /**
   * Generate barcode command
   */
  generateBarcode(type: 'code128' | 'ean13' | 'code39', data: string): ESCPosCommand {
    let command: number[];
    
    switch (type) {
      case 'code128':
        command = [this.GS, 0x6B, 0x49]; // GS k m n
        break;
      case 'ean13':
        command = [this.GS, 0x6B, 0x02]; // GS k m n
        break;
      case 'code39':
        command = [this.GS, 0x6B, 0x04]; // GS k m n
        break;
      default:
        throw new Error(`Unsupported barcode type: ${type}`);
    }
    
    // Add data length and data
    command.push(data.length, ...data.split('').map(char => char.charCodeAt(0)));
    
    return {
      command,
      description: `Generate ${type} barcode: ${data}`
    };
  }

  /**
   * Generate complete receipt
   */
  generateReceipt(receiptData: ReceiptData): number[] {
    const commands: number[] = [];

    // Initialize
    commands.push(...this.initializePrinter().command);
    
    // Store header
    commands.push(...this.setAlignment('center').command);
    commands.push(...this.setCharacterSize(2, 2).command);
    commands.push(...this.setEmphasis(true).command);
    commands.push(...this.encodeText(`${receiptData.header.storeName}\n`));
    commands.push(...this.setCharacterSize(1, 1).command);
    commands.push(...this.setEmphasis(false).command);
    
    commands.push(...this.encodeText(`${receiptData.header.storeAddress}\n`));
    if (receiptData.header.storePhone) {
      commands.push(...this.encodeText(`Tel: ${receiptData.header.storePhone}\n`));
    }
    if (receiptData.header.storeTaxId) {
      commands.push(...this.encodeText(`NPWP: ${receiptData.header.storeTaxId}\n`));
    }
    
    commands.push(...this.feedLines(1).command);
    
    // Transaction info
    commands.push(...this.setAlignment('left').command);
    commands.push(...this.encodeText(`No Struk: ${receiptData.transaction.receiptNumber}\n`));
    commands.push(...this.encodeText(`Kasir: ${receiptData.transaction.cashierName}\n`));
    commands.push(...this.encodeText(`Tanggal: ${this.formatDate(receiptData.transaction.timestamp)}\n`));
    commands.push(...this.encodeText(`Cabang: ${receiptData.transaction.branchId}\n`));
    
    // Customer info
    if (receiptData.customer) {
      commands.push(...this.encodeText(`Customer: ${receiptData.customer.name || 'Guest'}\n`));
      if (receiptData.customer.memberId) {
        commands.push(...this.encodeText(`Member ID: ${receiptData.customer.memberId}\n`));
      }
    }
    
    commands.push(...this.encodeText('='.repeat(32) + '\n'));
    
    // Items header
    commands.push(...this.encodeText('ITEM                 QTY    HARGA\n'));
    commands.push(...this.encodeText('-'.repeat(32) + '\n'));
    
    // Items
    receiptData.items.forEach(item => {
      const itemLine = this.formatItemLine(item);
      commands.push(...this.encodeText(itemLine + '\n'));
      
      // Item discount line
      if (item.discount && item.discount > 0) {
        commands.push(...this.encodeText(`  Diskon: -${this.formatCurrency(item.discount)}\n`));
      }
      
      // Barcode line
      if (item.barcode) {
        commands.push(...this.encodeText(`  ${item.barcode}\n`));
      }
    });
    
    commands.push(...this.encodeText('-'.repeat(32) + '\n'));
    
    // Discounts
    if (receiptData.discounts.length > 0) {
      commands.push(...this.encodeText('DISKON:\n'));
      receiptData.discounts.forEach(discount => {
        const discountText = `${discount.name}: -${this.formatCurrency(discount.amount)}`;
        commands.push(...this.encodeText(`  ${discountText}\n`));
      });
    }
    
    // Totals
    commands.push(...this.encodeText('-'.repeat(32) + '\n'));
    commands.push(...this.encodeText(`Subtotal:            ${this.formatCurrency(receiptData.totals.subtotal)}\n`));
    
    if (receiptData.totals.discountTotal > 0) {
      commands.push(...this.encodeText(`Total Diskon:        -${this.formatCurrency(receiptData.totals.discountTotal)}\n`));
    }
    
    commands.push(...this.encodeText(`Pajak:               ${this.formatCurrency(receiptData.totals.taxTotal)}\n`));
    commands.push(...this.setEmphasis(true).command);
    commands.push(...this.encodeText(`TOTAL:               ${this.formatCurrency(receiptData.totals.grandTotal)}\n`));
    commands.push(...this.setEmphasis(false).command);
    
    // Payment methods
    commands.push(...this.encodeText('-'.repeat(32) + '\n'));
    commands.push(...this.encodeText('PEMBAYARAN:\n'));
    receiptData.payments.forEach(payment => {
      const paymentText = `${this.formatPaymentMethod(payment.method)}: ${this.formatCurrency(payment.amount)}`;
      if (payment.reference) {
        commands.push(...this.encodeText(`  ${paymentText}\n`));
        commands.push(...this.encodeText(`  Ref: ${payment.reference}\n`));
      } else {
        commands.push(...this.encodeText(`  ${paymentText}\n`));
      }
    });
    
    if (receiptData.totals.changeGiven > 0) {
      commands.push(...this.encodeText(`  Kembalian: ${this.formatCurrency(receiptData.totals.changeGiven)}\n`));
    }
    
    commands.push(...this.feedLines(2).command);
    
    // Footer
    commands.push(...this.setAlignment('center').command);
    if (receiptData.footer.thankYouMessage) {
      commands.push(...this.setEmphasis(true).command);
      commands.push(...this.encodeText(`${receiptData.footer.thankYouMessage}\n`));
      commands.push(...this.setEmphasis(false).command);
    }
    
    if (receiptData.footer.returnPolicy) {
      commands.push(...this.encodeText(`${receiptData.footer.returnPolicy}\n`));
    }
    
    if (receiptData.footer.website) {
      commands.push(...this.encodeText(`${receiptData.footer.website}\n`));
    }
    
    // Cashier signature
    commands.push(...this.feedLines(2).command);
    commands.push(...this.encodeText(`Kasir: ________________________\n`));
    
    // Cut paper
    commands.push(...this.feedLines(3).command);
    commands.push(...this.cutPaper().command);
    
    return commands;
  }

  /**
   * Encode text to bytes
   */
  private encodeText(text: string): number[] {
    return text.split('').map(char => char.charCodeAt(0));
  }

  /**
   * Format currency
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Format date
   */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  /**
   * Format item line
   */
  private formatItemLine(item: ReceiptItem): string {
    const name = item.name.length > 16 ? item.name.substring(0, 16) : item.name;
    const quantity = item.quantity.toString().padStart(3);
    const price = this.formatCurrency(item.totalPrice);
    
    // Align to 32 character width
    const line = `${name.padEnd(20)}${quantity}   ${price}`;
    return line.length > 32 ? line.substring(0, 32) : line;
  }

  /**
   * Format payment method
   */
  private formatPaymentMethod(method: string): string {
    const methodMap: Record<string, string> = {
      'cash': 'TUNAI',
      'card': 'KARTU',
      'qris': 'QRIS',
      'ewallet': 'E-WALLET',
      'bank_transfer': 'TRANSFER',
      'credit': 'KREDIT'
    };
    
    return methodMap[method] || method.toUpperCase();
  }
}

// Export singleton instance
export const escPosCommandGenerator = new ESCPosCommandGenerator();