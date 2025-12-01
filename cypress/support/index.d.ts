/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to login to the application
       * @example cy.login('username', 'password')
       */
      login(username: string, password: string): Chainable<void>;
      
      /**
       * Custom command to add item to cart
       * @example cy.addItemToCart('Coffee Beans', 2)
       */
      addItemToCart(itemName: string, quantity?: number): Chainable<void>;
      
      /**
       * Custom command to complete a sale
       * @example cy.completeSale('cash')
       */
      completeSale(paymentMethod?: string): Chainable<void>;
      
      /**
       * Custom command to simulate offline mode
       * @example cy.simulateOffline()
       */
      simulateOffline(): Chainable<void>;
      
      /**
       * Custom command to wait for sync to complete
       * @example cy.waitForSync()
       */
      waitForSync(): Chainable<void>;
    }
  }
}

export {};