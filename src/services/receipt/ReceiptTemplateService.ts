/**
 * Receipt Template Service
 * Manages receipt templates with promotional breakdown and customization
 */

import {
  ReceiptTemplate,
  ReceiptLayout as _ReceiptLayout,
  ReceiptContent as _ReceiptContent,
  ReceiptCustomization as _ReceiptCustomization,
  ReceiptSection,
  TextFormatting,
  SalesTransaction,
  CartItem,
  Item as _Item,
  PricingRule,
} from '@/types';
import { db } from '@/services/database/POSDatabase';
import { pricingEngine as _pricingEngine } from '@/services/pricing/PricingEngine';

export class ReceiptTemplateService {
  /**
   * Get active receipt template by type
   */
  async getActiveTemplate(type: ReceiptTemplate['type']): Promise<ReceiptTemplate | null> {
    try {
      const template = await db.getActiveReceiptTemplate(type);
      return template ?? null;
    } catch (error) {
      console.error('Failed to get active template:', error);
      return null;
    }
  }

  /**
   * Generate receipt content with promotional breakdown
   */
  async generateReceipt(
    transaction: SalesTransaction,
    template?: ReceiptTemplate
  ): Promise<string> {
    try {
      const activeTemplate = template ?? (await this.getActiveTemplate('thermal'));
      if (!activeTemplate) {
        return this.generateDefaultReceipt(transaction);
      }

      return this.processTemplate(activeTemplate, transaction);
    } catch (error) {
      console.error('Failed to generate receipt:', error);
      return this.generateDefaultReceipt(transaction);
    }
  }

  /**
   * Process template with transaction data
   */
  private processTemplate(template: ReceiptTemplate, transaction: SalesTransaction): string {
    const lines: string[] = [];

    // Process header
    if (template.content.header.enabled) {
      lines.push(...this.processSection(template.content.header, transaction, 'header'));
    }

    // Process items with pricing breakdown
    if (template.content.items.enabled) {
      lines.push(...this.generateItemsSection(transaction));
    }

    // Process totals with discount breakdown
    if (template.content.totals.enabled) {
      lines.push(...this.generateTotalsSection(transaction));
    }

    // Process footer
    if (template.content.footer.enabled) {
      lines.push(...this.processSection(template.content.footer, transaction, 'footer'));
    }

    // Process custom sections
    if (template.content.customSections) {
      for (const section of template.content.customSections) {
        if (section.enabled) {
          lines.push(...this.processSection(section, transaction, 'custom'));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate items section with promotional breakdown
   */
  private generateItemsSection(transaction: SalesTransaction): string[] {
    const lines: string[] = [];

    // Section header
    lines.push('ITEMS PURCHASED');
    lines.push('='.repeat(32));

    transaction.items.forEach((item, _index) => {
      // Item name and quantity
      const itemLine = `${item.quantity.toString().padStart(3)} x ${item.itemName}`;
      lines.push(itemLine);

      // Unit price and total
      const priceLine = `  @ ${item.unitPrice.toFixed(2)} ea`;
      const totalLine = `  ${item.totalPrice.toFixed(2)}`;
      lines.push(priceLine.padEnd(20) + totalLine);

      // Pricing breakdown if available
      if (item.discount > 0) {
        const discountLine = `  Discount: -${item.discount.toFixed(2)}`;
        lines.push(discountLine);
      }

      // Applied pricing rules
      if (item.metadata?.appliedRules) {
        const rules = item.metadata.appliedRules as PricingRule[];
        rules.forEach(rule => {
          const ruleLine = `  * ${rule.name}: -${this.calculateRuleDiscount(item, rule).toFixed(
            2
          )}`;
          lines.push(ruleLine);
        });
      }

      lines.push(''); // Empty line between items
    });

    return lines;
  }

  /**
   * Generate totals section with comprehensive breakdown
   */
  private generateTotalsSection(transaction: SalesTransaction): string[] {
    const lines: string[] = [];

    lines.push('-'.repeat(32));

    // Subtotal
    lines.push('Subtotal:'.padEnd(20) + transaction.subtotalAmount.toFixed(2));

    // Discount breakdown
    if (transaction.discountAmount > 0) {
      lines.push('DISCOUNTS:');

      // Get discount breakdown from items
      const discountBreakdown = this.getDiscountBreakdown(transaction.items);
      discountBreakdown.forEach(discount => {
        const discountLine = `  ${discount.type}: -${discount.amount.toFixed(2)}`;
        lines.push(discountLine);
      });

      lines.push('-'.repeat(32));
      lines.push(`${'Total Discount:'.padEnd(20)}-${transaction.discountAmount.toFixed(2)}`);
    }

    // Tax breakdown
    if (transaction.taxAmount > 0) {
      lines.push('Tax:'.padEnd(20) + transaction.taxAmount.toFixed(2));
    }

    lines.push('='.repeat(32));

    // Final total
    lines.push('TOTAL:'.padEnd(20) + transaction.totalAmount.toFixed(2));

    // Payment breakdown
    if (transaction.paymentMethod) {
      lines.push('');
      lines.push('PAYMENT:');
      this.formatPaymentBreakdown(transaction.paymentMethod).forEach(paymentLine => {
        lines.push(paymentLine);
      });
    }

    return lines;
  }

  /**
   * Process individual template section
   */
  private processSection(
    section: ReceiptSection,
    transaction: SalesTransaction,
    sectionType: string
  ): string[] {
    const lines: string[] = [];
    const content = this.interpolateVariables(section.content, transaction);

    switch (sectionType) {
      case 'header':
        lines.push(...this.formatHeader(content, section.formatting));
        break;
      case 'footer':
        lines.push(...this.formatFooter(content, section.formatting));
        break;
      case 'custom':
        lines.push(content);
        break;
    }

    lines.push(''); // Add spacing
    return lines;
  }

  /**
   * Interpolate variables in template content
   */
  private interpolateVariables(content: string, transaction: SalesTransaction): string {
    return content
      .replace(/\{\{storeName\}\}/g, 'Your Store Name')
      .replace(/\{\{storeAddress\}\}/g, '123 Main St, City, State 12345')
      .replace(/\{\{storePhone\}\}/g, '(555) 123-4567')
      .replace(/\{\{receiptNumber\}\}/g, transaction.receiptNumber)
      .replace(/\{\{transactionDate\}\}/g, transaction.createdAt.toLocaleDateString())
      .replace(/\{\{transactionTime\}\}/g, transaction.createdAt.toLocaleTimeString())
      .replace(/\{\{cashierName\}\}/g, 'Cashier Name')
      .replace(/\{\{totalItems\}\}/g, transaction.items.length.toString())
      .replace(/\{\{subtotal\}\}/g, transaction.subtotalAmount.toFixed(2))
      .replace(/\{\{discount\}\}/g, transaction.discountAmount.toFixed(2))
      .replace(/\{\{tax\}\}/g, transaction.taxAmount.toFixed(2))
      .replace(/\{\{total\}\}/g, transaction.totalAmount.toFixed(2));
  }

  /**
   * Format header section
   */
  private formatHeader(content: string, formatting: TextFormatting): string[] {
    const lines: string[] = [];

    if (formatting.bold) {
      lines.push('='.repeat(32));
    }

    lines.push(content);

    if (formatting.bold) {
      lines.push('='.repeat(32));
    }

    return lines;
  }

  /**
   * Format footer section
   */
  private formatFooter(content: string, _formatting: TextFormatting): string[] {
    const lines: string[] = [];

    lines.push('-'.repeat(32));
    lines.push(content);
    lines.push('-'.repeat(32));

    return lines;
  }

  /**
   * Get discount breakdown from transaction items
   */
  private getDiscountBreakdown(items: CartItem[]): Array<{ type: string; amount: number }> {
    const breakdown: Array<{ type: string; amount: number }> = [];

    items.forEach(item => {
      if (item.discount > 0) {
        breakdown.push({
          type: 'Item Discount',
          amount: item.discount,
        });
      }
    });

    return breakdown;
  }

  /**
   * Calculate discount amount for a pricing rule
   */
  private calculateRuleDiscount(item: CartItem, rule: PricingRule): number {
    switch (rule.discountType) {
      case 'percentage':
        return (item.totalPrice * rule.discountValue) / 100;
      case 'fixed_amount':
        return rule.discountValue;
      case 'free_item':
        return item.unitPrice; // Full item price for free items
      default:
        return 0;
    }
  }

  /**
   * Format payment breakdown
   */
  private formatPaymentBreakdown(paymentMethod: any): string[] {
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

    if (paymentMethod.change && paymentMethod.change > 0) {
      lines.push(`  Change: ${paymentMethod.change.toFixed(2)}`);
    }

    return lines;
  }

  /**
   * Generate default receipt (fallback)
   */
  private generateDefaultReceipt(transaction: SalesTransaction): string {
    const lines: string[] = [];

    // Header
    lines.push('================================');
    lines.push('     YOUR STORE NAME');
    lines.push('  123 Main St, City, State');
    lines.push('     (555) 123-4567');
    lines.push('================================');
    lines.push('');

    // Transaction info
    lines.push(`Receipt #: ${transaction.receiptNumber}`);
    lines.push(`Date: ${transaction.createdAt.toLocaleDateString()}`);
    lines.push(`Time: ${transaction.createdAt.toLocaleTimeString()}`);
    lines.push(`Cashier: Cashier Name`);
    lines.push('--------------------------------');
    lines.push('');

    // Items
    transaction.items.forEach(item => {
      lines.push(`${item.quantity} x ${item.itemName}`);
      lines.push(`  @ ${item.unitPrice.toFixed(2)} = ${item.totalPrice.toFixed(2)}`);
      if (item.discount > 0) {
        lines.push(`  Discount: -${item.discount.toFixed(2)}`);
      }
      lines.push('');
    });

    // Totals
    lines.push('--------------------------------');
    lines.push(`Subtotal: ${transaction.subtotalAmount.toFixed(2)}`);
    if (transaction.discountAmount > 0) {
      lines.push(`Discount: -${transaction.discountAmount.toFixed(2)}`);
    }
    if (transaction.taxAmount > 0) {
      lines.push(`Tax: ${transaction.taxAmount.toFixed(2)}`);
    }
    lines.push('================================');
    lines.push(`TOTAL: ${transaction.totalAmount.toFixed(2)}`);
    lines.push('================================');
    lines.push('');

    // Footer
    lines.push('Thank you for your business!');
    lines.push('Please come again.');
    lines.push('');
    lines.push('================================');

    return lines.join('\n');
  }

  /**
   * Create default thermal receipt template
   */
  async createDefaultThermalTemplate(): Promise<string> {
    const template: Omit<ReceiptTemplate, 'id'> = {
      name: 'Default Thermal Receipt',
      type: 'thermal',
      layout: {
        width: 32, // 32 characters for thermal printer
        orientation: 'portrait',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      content: {
        header: {
          enabled: true,
          content: '{{storeName}}\n{{storeAddress}}\nTel: {{storePhone}}',
          formatting: { bold: true },
          alignment: 'center',
        },
        items: {
          enabled: true,
          content: '',
          formatting: {},
          alignment: 'left',
        },
        totals: {
          enabled: true,
          content: '',
          formatting: {},
          alignment: 'right',
        },
        footer: {
          enabled: true,
          content: 'Thank you for your business!\nPlease come again.',
          formatting: {},
          alignment: 'center',
        },
        customSections: [],
      },
      customizations: {
        colors: {
          primary: '#000000',
          secondary: '#666666',
          accent: '#000000',
        },
        fonts: {
          header: 'Arial',
          body: 'Arial',
          footer: 'Arial',
        },
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return await db.createReceiptTemplate(template);
  }

  /**
   * Validate template configuration
   */
  validateTemplate(template: ReceiptTemplate): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required');
    }

    if (!template.layout.width || template.layout.width < 20) {
      errors.push('Template width must be at least 20 characters');
    }

    if (
      !template.content.header.enabled &&
      !template.content.items.enabled &&
      !template.content.totals.enabled
    ) {
      errors.push('At least one content section must be enabled');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const receiptTemplateService = new ReceiptTemplateService();
