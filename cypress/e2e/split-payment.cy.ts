/// <reference types="cypress" />

describe('Split Payment Scenarios', () => {
  beforeEach(() => {
    cy.login('testuser', 'testpassword');
    cy.addItemToCart('Coffee Beans', 2);
    cy.addItemToCart('Espresso Cup', 1);
  });

  it('should split payment between cash and card', () => {
    // Navigate to checkout
    cy.get('[data-testid="checkout-button"]').click();
    
    // Select split payment option
    cy.get('[data-testid="split-payment-option"]').click();
    
    // Set amounts for each payment method
    cy.get('[data-testid="cash-amount"]').type('15.00');
    cy.get('[data-testid="card-amount"]').type('20.00');
    
    // Process split payment
    cy.get('[data-testid="process-split-payment"]').click();
    
    // Verify both payments are processed
    cy.get('[data-testid="payment-status-cash"]').should('contain', 'Completed');
    cy.get('[data-testid="payment-status-card"]').should('contain', 'Completed');
    
    // Complete the sale
    cy.get('[data-testid="complete-sale-button"]').click();
    cy.get('[data-testid="receipt-modal"]').should('be.visible');
  });

  it('should validate split payment amounts', () => {
    cy.get('[data-testid="checkout-button"]').click();
    cy.get('[data-testid="split-payment-option"]').click();
    
    // Set total amount in cash first
    cy.get('[data-testid="cash-amount"]').type('50.00');
    cy.get('[data-testid="card-amount"]').type('10.00');
    
    // Should show error for overpayment
    cy.get('[data-testid="process-split-payment"]').click();
    cy.get('[data-testid="amount-error"]').should('be.visible');
    cy.get('[data-testid="amount-error"]').should('contain', 'Total exceeds sale amount');
  });

  it('should allow partial payment completion', () => {
    cy.get('[data-testid="checkout-button"]').click();
    cy.get('[data-testid="split-payment-option"]').click();
    
    // Pay partial amount with cash
    cy.get('[data-testid="cash-amount"]').type('15.00');
    cy.get('[data-testid="process-split-payment"]').click();
    cy.get('[data-testid="payment-status-cash"]').should('contain', 'Completed');
    
    // Complete remaining with card
    cy.get('[data-testid="card-amount"]').clear().type('20.00');
    cy.get('[data-testid="process-split-payment"]').click();
    cy.get('[data-testid="payment-status-card"]').should('contain', 'Completed');
    
    cy.get('[data-testid="complete-sale-button"]').click();
  });
});