/// <reference types="cypress" />

describe('Login Flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should display login form when not authenticated', () => {
    cy.get('[data-testid="login-form"]').should('be.visible');
    cy.get('[data-testid="username-input"]').should('be.visible');
    cy.get('[data-testid="password-input"]').should('be.visible');
    cy.get('[data-testid="login-button"]').should('be.visible');
  });

  it('should login successfully with valid credentials', () => {
    cy.get('[data-testid="username-input"]').type('testuser');
    cy.get('[data-testid="password-input"]').type('testpassword');
    cy.get('[data-testid="login-button"]').click();
    
    // Wait for successful login and redirect to POS interface
    cy.url().should('include', '/pos');
    cy.get('[data-testid="pos-interface"]').should('be.visible');
  });

  it('should show error message with invalid credentials', () => {
    cy.get('[data-testid="username-input"]').type('invaliduser');
    cy.get('[data-testid="password-input"]').type('invalidpassword');
    cy.get('[data-testid="login-button"]').click();
    
    cy.get('[data-testid="login-error"]').should('be.visible');
    cy.get('[data-testid="login-error"]').should('contain', 'Invalid credentials');
  });

  it('should validate required fields', () => {
    cy.get('[data-testid="login-button"]').click();
    cy.get('[data-testid="username-error"]').should('contain', 'Username is required');
    cy.get('[data-testid="password-error"]').should('contain', 'Password is required');
  });
});