# Cypress Testing Setup

This document provides a comprehensive guide to the Cypress testing setup for the POS PWA application.

## Overview

Cypress has been configured to provide both end-to-end (e2e) testing and component testing capabilities for the application. The setup includes custom commands tailored for the POS workflow and comprehensive test examples.

## Features

### ✅ Configured Features
- **End-to-End Testing**: Full user journey testing
- **Component Testing**: Individual React component testing
- **Custom Commands**: POS-specific testing commands
- **Vite Integration**: Optimized for Vite development server
- **TypeScript Support**: Full TypeScript configuration
- **Fixtures**: Sample data for testing

## Project Structure

```
cypress/
├── config/
│   └── cypress.config.js          # Cypress configuration
├── support/
│   ├── commands.ts                # Custom commands
│   ├── component.ts               # Component testing setup
│   ├── e2e.ts                     # E2E testing setup
│   └── index.d.ts                 # TypeScript declarations
├── e2e/                           # End-to-end tests
│   ├── login.cy.ts                # Login flow tests
│   ├── pos-transaction.cy.ts      # POS transaction tests
│   ├── split-payment.cy.ts        # Split payment tests
│   ├── offline-sync.cy.ts         # Offline functionality tests
│   └── returns.cy.ts              # Return processing tests
├── fixtures/                      # Test data
│   ├── products.json              # Sample products
│   └── users.json                 # Sample users
└── downloads/                     # Downloaded test artifacts
```

## Installation

The following packages have been installed:

```bash
npm install --save-dev cypress
npm install --save-dev @cypress/react @cypress/react18
npm install --save-dev eslint-plugin-cypress
```

## Configuration

### Cypress Config (`cypress.config.js`)
- **Base URL**: Set to `http://localhost:5173` (Vite default)
- **Vite Integration**: Configured for React with Vite bundler
- **Test Patterns**: 
  - E2E: `cypress/e2e/**/*.cy.{js,jsx,ts,tsx}`
  - Component: `src/**/*.cy.{ts,tsx}`

### Package.json Scripts
```json
{
  "test:e2e": "cypress run",
  "test:e2e:open": "cypress open"
}
```

## Custom Commands

The following custom commands are available:

### `cy.login(username, password)`
Logs in a user for testing
```typescript
cy.login('testuser', 'testpassword');
```

### `cy.addItemToCart(itemName, quantity)`
Adds an item to the cart
```typescript
cy.addItemToCart('Coffee Beans', 2);
```

### `cy.completeSale(paymentMethod)`
Completes a sale transaction
```typescript
cy.completeSale('cash');
```

### `cy.simulateOffline()`
Simulates offline mode
```typescript
cy.simulateOffline();
```

### `cy.waitForSync()`
Waits for synchronization to complete
```typescript
cy.waitForSync();
```

## Test Categories

### 1. End-to-End Tests

#### Login Flow (`cypress/e2e/login.cy.ts`)
- Form rendering validation
- Successful login flow
- Error handling for invalid credentials
- Form validation

#### POS Transactions (`cypress/e2e/pos-transaction.cy.ts`)
- Complete cash transaction flow
- Item search and selection
- Cart management (add, remove, update quantities)
- Total calculation verification

#### Split Payments (`cypress/e2e/split-payment.cy.ts`)
- Split payment between cash and card
- Amount validation
- Partial payment scenarios

#### Offline/Sync (`cypress/e2e/offline-sync.cy.ts`)
- Offline functionality
- Sync queue management
- Network status indicators
- Conflict resolution

#### Returns (`cypress/e2e/returns.cy.ts`)
- Full item returns
- Partial returns
- Refund method selection
- Return history

### 2. Component Tests

#### LoginPage Component (`src/components/auth/LoginPage.cy.tsx`)
- Component rendering
- Input handling
- Form submission

#### ItemSearchInterface Component (`src/components/pos/ItemSearchInterface.cy.tsx`)
- Search functionality
- API integration with interceptors
- Loading states
- Item selection

## Running Tests

### Interactive Mode
```bash
npm run test:e2e:open
```

### Headless Mode
```bash
npm run test:e2e
```

### Component Tests Only
```bash
npx cypress run --component
```

### E2E Tests Only
```bash
npx cypress run --e2e
```

## Development Workflow

### 1. Start Development Server
```bash
npm run dev
```

### 2. Run Tests
```bash
# In another terminal
npm run test:e2e:open
```

### 3. Add New Tests
1. Create test files in appropriate directories
2. Use custom commands when available
3. Add TypeScript types if creating new commands

## Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Keep tests independent and isolated

### Selectors
- Use `data-testid` attributes for stable element selection
- Avoid selecting by CSS classes that may change

### Asynchronous Operations
- Use Cypress commands that handle async automatically
- Use `.should()` for assertions on dynamic content
- Use interceptors (`cy.intercept`) for API testing

### Data Management
- Use fixtures for consistent test data
- Mock external APIs when appropriate
- Clean up test state between tests

## Continuous Integration

Cypress can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Cypress tests
  uses: cypress-io/github-action@v4
  with:
    start: npm run dev
    wait-on: 'http://localhost:5173'
```

## Troubleshooting

### Common Issues

1. **Base URL Mismatch**
   - Ensure development server is running on `http://localhost:5173`
   - Update `baseUrl` in `cypress.config.js` if needed

2. **Component Test Errors**
   - Ensure React components are properly exported
   - Check TypeScript types for custom commands

3. **Test Data Issues**
   - Verify fixture files are properly formatted
   - Ensure API endpoints match test expectations

### Browser Requirements
- Cypress requires Chrome, Chromium, or Edge browser
- Headless mode may have different behavior than interactive mode

## Example Test Scenarios

### Adding Multiple Items to Cart
```typescript
it('should handle multiple cart items', () => {
  cy.login('testuser', 'testpassword');
  cy.addItemToCart('Coffee Beans', 2);
  cy.addItemToCart('Espresso Cup', 1);
  
  cy.get('[data-testid="cart-item"]').should('have.length', 2);
  cy.get('[data-testid="cart-total"]').should('contain', '$');
});
```

### Testing Payment Methods
```typescript
it('should handle different payment methods', () => {
  cy.completeSale('cash');
  // or
  cy.completeSale('card');
  // or
  cy.completeSale('mobile');
});
```

### Offline Transaction Testing
```typescript
it('should queue offline transactions', () => {
  cy.simulateOffline();
  cy.completeSale('cash');
  cy.get('[data-testid="sync-status"]').should('contain', 'Pending Sync');
});
```

## Future Enhancements

1. **Visual Testing**: Add visual regression testing
2. **Performance Testing**: Add performance metrics
3. **Accessibility Testing**: Integrate a11y testing tools
4. **API Testing**: Add dedicated API test suite
5. **Cross-browser Testing**: Test on multiple browsers

## Support

For issues related to:
- **Cypress Configuration**: Check the [official Cypress documentation](https://docs.cypress.io/)
- **Custom Commands**: Refer to `cypress/support/commands.ts`
- **Component Testing**: See [Cypress React documentation](https://github.com/cypress-io/cypress/tree/develop/npm/react)

This setup provides a robust testing foundation for the POS application with comprehensive coverage of user workflows and component functionality.