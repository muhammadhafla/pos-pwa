/// <reference types="cypress" />

describe('Return Processing', () => {
  beforeEach(() => {
    cy.login('testuser', 'testpassword');
  });

  it('should process a full item return', () => {
    // First complete a sale
    cy.addItemToCart('Coffee Beans', 1);
    cy.completeSale('cash');
    
    // Get receipt number for return reference
    cy.get('[data-testid="receipt-number"]').invoke('text').as('receiptNumber');
    
    // Start return process
    cy.get('[data-testid="start-return"]').click();
    
    // Enter receipt number
    cy.get('@receiptNumber').then((receiptNum) => {
      const receiptText = typeof receiptNum === 'string' ? receiptNum : receiptNum?.text() || '';
      cy.get('[data-testid="receipt-search"]').type(receiptText);
    });
    
    // Select items to return
    cy.get('[data-testid="returnable-item"]').should('be.visible');
    cy.get('[data-testid="returnable-item"]').first().within(() => {
      cy.get('[data-testid="select-return-item"]').click();
      cy.get('[data-testid="return-quantity"]').type('1');
    });
    
    // Process return
    cy.get('[data-testid="process-return"]').click();
    
    // Verify return completion
    cy.get('[data-testid="return-receipt"]').should('be.visible');
    cy.get('[data-testid="return-amount"]').should('contain', '$');
  });

  it('should process partial return with refund method selection', () => {
    // Complete a multi-item sale
    cy.addItemToCart('Coffee Beans', 2);
    cy.addItemToCart('Espresso Cup', 2);
    cy.completeSale('cash');
    
    // Start return
    cy.get('[data-testid="start-return"]').click();
    cy.get('[data-testid="receipt-search"]').type('TEST-123');
    
    // Return only some items
    cy.get('[data-testid="returnable-item"]').first().within(() => {
      cy.get('[data-testid="select-return-item"]').click();
      cy.get('[data-testid="return-quantity"]').type('1'); // Return only 1 of 2
    });
    
    // Select refund method
    cy.get('[data-testid="refund-method"]').select('store-credit');
    cy.get('[data-testid="process-return"]').click();
    
    // Verify partial return
    cy.get('[data-testid="return-summary"]').should('contain', 'Partial Return');
    cy.get('[data-testid="refund-method-display"]').should('contain', 'Store Credit');
  });

  it('should validate return quantities', () => {
    cy.addItemToCart('Coffee Beans', 1);
    cy.completeSale('cash');
    
    cy.get('[data-testid="start-return"]').click();
    cy.get('[data-testid="receipt-search"]').type('TEST-123');
    
    cy.get('[data-testid="returnable-item"]').first().within(() => {
      cy.get('[data-testid="select-return-item"]').click();
      cy.get('[data-testid="return-quantity"]').type('5'); // Try to return more than purchased
    });
    
    // Should show validation error
    cy.get('[data-testid="quantity-error"]').should('be.visible');
    cy.get('[data-testid="process-return"]').should('be.disabled');
  });

  it('should show return history', () => {
    // Complete a return first
    cy.addItemToCart('Coffee Beans', 1);
    cy.completeSale('cash');
    cy.get('[data-testid="start-return"]').click();
    cy.get('[data-testid="receipt-search"]').type('TEST-123');
    cy.get('[data-testid="returnable-item"]').first().within(() => {
      cy.get('[data-testid="select-return-item"]').click();
      cy.get('[data-testid="return-quantity"]').type('1');
    });
    cy.get('[data-testid="process-return"]').click();
    cy.get('[data-testid="close-return-receipt"]').click();
    
    // View return history
    cy.get('[data-testid="return-history"]').click();
    
    cy.get('[data-testid="return-history-list"]').should('be.visible');
    cy.get('[data-testid="return-history-item"]').should('have.length.at.least', 1);
  });
});