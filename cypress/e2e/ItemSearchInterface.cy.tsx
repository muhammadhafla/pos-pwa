/// <reference types="cypress" />

import React from 'react';
import ItemSearchInterface from '../../src/components/pos/ItemSearchInterface';

describe('ItemSearchInterface Component', () => {
  it('renders search input correctly', () => {
    cy.mount(<ItemSearchInterface onItemSelect={cy.stub()} />);
    
    // Check search input is rendered
    cy.get('[data-testid="item-search"]').should('be.visible');
    cy.get('[data-testid="item-search"]').should('have.attr', 'placeholder', 'Search items...');
  });

  it('handles search input changes', () => {
    cy.mount(<ItemSearchInterface onItemSelect={cy.stub()} />);
    
    // Type in search input
    cy.get('[data-testid="item-search"]').type('coffee');
    
    // Verify input value
    cy.get('[data-testid="item-search"]').should('have.value', 'coffee');
  });

  it('shows search results when typing', () => {
    cy.intercept('GET', '/api/items/search*', {
      statusCode: 200,
      body: {
        items: [
          { id: '1', name: 'Coffee Beans', price: 10.99 },
          { id: '2', name: 'Instant Coffee', price: 5.99 }
        ]
      }
    });
    
    cy.mount(<ItemSearchInterface onItemSelect={cy.stub()} />);
    
    // Search for items
    cy.get('[data-testid="item-search"]').type('coffee');
    
    // Wait for results and verify they appear
    cy.get('[data-testid="item-result"]').should('have.length', 2);
    cy.get('[data-testid="item-result"]').first().should('contain', 'Coffee Beans');
  });

  it('calls onItemSelect when item is clicked', () => {
    const onItemSelectSpy = cy.stub().as('onItemSelectSpy');
    
    cy.intercept('GET', '/api/items/search*', {
      statusCode: 200,
      body: {
        items: [
          { id: '1', name: 'Coffee Beans', price: 10.99 }
        ]
      }
    });
    
    cy.mount(<ItemSearchInterface onItemSelect={onItemSelectSpy} />);
    
    // Search and select item
    cy.get('[data-testid="item-search"]').type('coffee');
    cy.get('[data-testid="item-result"]').first().click();
    
    // Verify callback was called
    cy.get('@onItemSelectSpy').should('have.been.calledOnce');
  });

  it('shows loading state during search', () => {
    cy.intercept('GET', '/api/items/search*', (req) => {
      req.reply((res) => {
        setTimeout(() => {
          res.send({
            statusCode: 200,
            body: { items: [] }
          });
        }, 1000);
      });
    });
    
    cy.mount(<ItemSearchInterface onItemSelect={cy.stub()} />);
    
    // Start search
    cy.get('[data-testid="item-search"]').type('coffee');
    
    // Should show loading state
    cy.get('[data-testid="search-loading"]').should('be.visible');
    
    // Wait for results
    cy.get('[data-testid="search-loading"]', { timeout: 2000 }).should('not.exist');
  });
});