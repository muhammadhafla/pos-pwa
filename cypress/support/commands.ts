// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Custom command to login to the application
Cypress.Commands.add('login', (username: string, password: string) => {
  cy.visit('/login');
  cy.get('[data-testid="username-input"]').type(username);
  cy.get('[data-testid="password-input"]').type(password);
  cy.get('[data-testid="login-button"]').click();
});

// Custom command to add item to cart
Cypress.Commands.add('addItemToCart', (itemName: string, quantity = 1) => {
  cy.get('[data-testid="item-search"]').type(itemName);
  cy.get('[data-testid="item-result"]').first().click();
  cy.get('[data-testid="quantity-input"]').clear().type(quantity.toString());
  cy.get('[data-testid="add-to-cart-button"]').click();
});

// Custom command to complete a sale
Cypress.Commands.add('completeSale', (paymentMethod = 'cash') => {
  cy.get('[data-testid="checkout-button"]').click();
  cy.get(`[data-testid="payment-${paymentMethod}"]`).click();
  cy.get('[data-testid="complete-sale-button"]').click();
});

// Custom command to handle offline mode
Cypress.Commands.add('simulateOffline', () => {
  cy.window().then((win) => {
    cy.stub(win.navigator.serviceWorker, 'register').resolves({});
    cy.stub(win, 'fetch').rejects(new Error('Network error'));
  });
});

// Custom command to wait for sync
Cypress.Commands.add('waitForSync', () => {
  cy.get('[data-testid="sync-status"]').should('contain', 'Synced');
});