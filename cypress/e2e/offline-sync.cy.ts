/// <reference types="cypress" />

describe('Offline and Sync Functionality', () => {
  beforeEach(() => {
    cy.login('testuser', 'testpassword');
  });

  it('should work in offline mode', () => {
    // Simulate offline mode
    cy.simulateOffline();
    
    // Add items to cart (should work offline)
    cy.addItemToCart('Coffee Beans', 1);
    cy.addItemToCart('Espresso Cup', 1);
    
    // Checkout should still work
    cy.get('[data-testid="checkout-button"]').click();
    cy.get('[data-testid="payment-cash"]').click();
    cy.get('[data-testid="complete-sale-button"]').click();
    
    // Should show offline transaction stored message
    cy.get('[data-testid="offline-transaction-message"]').should('be.visible');
    cy.get('[data-testid="sync-status"]').should('contain', 'Pending Sync');
  });

  it('should queue transactions for sync when back online', () => {
    // Start in offline mode
    cy.simulateOffline();
    
    // Complete a transaction
    cy.addItemToCart('Coffee Beans', 1);
    cy.get('[data-testid="checkout-button"]').click();
    cy.get('[data-testid="payment-cash"]').click();
    cy.get('[data-testid="complete-sale-button"]').click();
    
    // Mock coming back online
    cy.window().then((win) => {
      cy.stub(win, 'fetch').callsFake((url) => {
        if (url.includes('/api/sync')) {
          return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
        }
        return Promise.reject(new Error('Network error'));
      }).callThrough();
    });
    
    // Trigger sync manually
    cy.get('[data-testid="sync-button"]').click();
    cy.waitForSync();
    
    // Should show synced status
    cy.get('[data-testid="sync-status"]').should('contain', 'Synced');
  });

  it('should display network status indicator', () => {
    cy.get('[data-testid="network-status"]').should('be.visible');
    
    // Initially should show online status
    cy.get('[data-testid="network-status"]').should('contain', 'Online');
    
    // Simulate going offline
    cy.simulateOffline();
    cy.get('[data-testid="network-status"]').should('contain', 'Offline');
  });

  it('should handle sync conflicts gracefully', () => {
    // Mock a sync conflict scenario
    cy.window().then((win) => {
      cy.stub(win, 'fetch').callsFake((url) => {
        if (url.includes('/api/sync')) {
          return Promise.resolve(new Response(JSON.stringify({ 
            conflict: true, 
            message: 'Transaction already exists' 
          }), { status: 409 }));
        }
        return Promise.reject(new Error('Network error'));
      });
    });
    
    cy.simulateOffline();
    cy.addItemToCart('Coffee Beans', 1);
    cy.completeSale('cash');
    
    // Try to sync
    cy.get('[data-testid="sync-button"]').click();
    
    // Should show conflict resolution options
    cy.get('[data-testid="sync-conflict-modal"]').should('be.visible');
    cy.get('[data-testid="conflict-resolution-options"]').should('be.visible');
  });
});