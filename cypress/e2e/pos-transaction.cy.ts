/// <reference types="cypress" />

describe('POS Transaction Flow', () => {
  beforeEach(() => {
    // Login before each test
    cy.login('testuser', 'testpassword');
  });

  it('should complete a basic cash transaction', () => {
    // Search for and add items
    cy.addItemToCart('Coffee Beans', 2);
    cy.addItemToCart('Espresso Cup', 1);
    
    // Verify items are in cart
    cy.get('[data-testid="cart-item"]').should('have.length', 2);
    cy.get('[data-testid="cart-total"]').should('contain', '$');
    
    // Proceed to checkout
    cy.get('[data-testid="checkout-button"]').click();
    
    // Select cash payment
    cy.get('[data-testid="payment-cash"]').click();
    
    // Complete the sale
    cy.get('[data-testid="complete-sale-button"]').click();
    
    // Verify transaction completion
    cy.get('[data-testid="receipt-modal"]').should('be.visible');
    cy.get('[data-testid="receipt-number"]').should('be.visible');
    
    // Close receipt and return to POS
    cy.get('[data-testid="close-receipt"]').click();
    cy.get('[data-testid="pos-interface"]').should('be.visible');
    cy.get('[data-testid="cart-item"]').should('have.length', 0);
  });

  it('should handle item search and selection', () => {
    cy.get('[data-testid="item-search"]').type('coffee');
    cy.get('[data-testid="item-result"]').should('be.visible');
    cy.get('[data-testid="item-result"]').first().click();
    
    // Should populate item details
    cy.get('[data-testid="selected-item-name"]').should('be.visible');
    cy.get('[data-testid="quantity-input"]').should('be.visible');
    cy.get('[data-testid="unit-price"]').should('be.visible');
  });

  it('should update cart quantities', () => {
    cy.addItemToCart('Coffee Beans', 1);
    
    // Update quantity in cart
    cy.get('[data-testid="cart-item"]').first().within(() => {
      cy.get('[data-testid="quantity-input"]').clear().type('3');
    });
    
    // Verify updated total
    cy.get('[data-testid="cart-total"]').should('contain', '$');
  });

  it('should remove items from cart', () => {
    cy.addItemToCart('Coffee Beans', 1);
    cy.addItemToCart('Espresso Cup', 1);
    
    // Remove first item
    cy.get('[data-testid="cart-item"]').first().within(() => {
      cy.get('[data-testid="remove-item"]').click();
    });
    
    // Verify only one item remains
    cy.get('[data-testid="cart-item"]').should('have.length', 1);
  });

  it('should calculate totals correctly', () => {
    cy.addItemToCart('Coffee Beans', 2); // $10 each = $20
    cy.addItemToCart('Espresso Cup', 3); // $5 each = $15
    
    // Verify total calculation
    cy.get('[data-testid="cart-subtotal"]').should('contain', '$35.00');
    cy.get('[data-testid="cart-tax"]').should('contain', '$');
    cy.get('[data-testid="cart-total"]').should('contain', '$');
  });
});