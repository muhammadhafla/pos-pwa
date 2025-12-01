/// <reference types="cypress" />

import React from 'react';
import LoginPage from '../../src/components/auth/LoginPage';

describe('LoginPage Component', () => {
  it('renders login form correctly', () => {
    cy.mount(<LoginPage />);
    
    // Check form elements are rendered
    cy.get('[data-testid="login-form"]').should('be.visible');
    cy.get('[data-testid="username-input"]').should('be.visible');
    cy.get('[data-testid="password-input"]').should('be.visible');
    cy.get('[data-testid="login-button"]').should('be.visible');
    
    // Check form labels
    cy.get('[data-testid="username-label"]').should('contain', 'Username');
    cy.get('[data-testid="password-label"]').should('contain', 'Password');
  });

  it('handles input changes correctly', () => {
    cy.mount(<LoginPage />);
    
    // Test username input
    cy.get('[data-testid="username-input"]').type('testuser');
    cy.get('[data-testid="username-input"]').should('have.value', 'testuser');
    
    // Test password input
    cy.get('[data-testid="password-input"]').type('testpassword');
    cy.get('[data-testid="password-input"]').should('have.value', 'testpassword');
  });
});