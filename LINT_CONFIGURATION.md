# Lint Configuration Documentation

This document describes the linting and code formatting setup for the POS PWA project.

## Overview

The project uses a comprehensive linting setup with:
- **ESLint**: For code quality and TypeScript/React specific rules
- **Prettier**: For consistent code formatting
- **Accessibility linting**: For WCAG compliance

## Configuration Files

### ESLint Configuration (`eslint.config.cjs`)
- Modern flat config format (ESLint 8.21+) using CommonJS format
- TypeScript support via `@typescript-eslint`
- React specific rules via `eslint-plugin-react` and `eslint-plugin-react-hooks`
- Accessibility rules via `eslint-plugin-jsx-a11y`
- Separate configurations for tests and Cypress files
- **Note**: Uses `.cjs` extension due to ES module configuration in package.json

### Prettier Configuration (`.prettierrc`)
- Consistent code formatting
- 100 character line width
- Single quotes preferred
- Trailing commas for arrays/objects
- JSX formatting rules

### Prettier Ignore (`.prettierignore`)
- Excludes build files, dependencies, and generated content
- Includes typical ignore patterns for Node.js projects

## Available Scripts

### Linting
```bash
npm run lint          # Run ESLint on source code
npm run lint:fix      # Auto-fix ESLint issues
```

### Formatting
```bash
npm run format        # Format code with Prettier
npm run format:check  # Check if code is properly formatted
npm run format:lint   # Run Prettier and fix lint issues together
```

### Type Checking
```bash
npm run type-check    # TypeScript type checking without emitting files
```

### Combined Commands
```bash
# Format and lint fix
npm run format:lint

# Type check and lint
npm run type-check && npm run lint
```

## Key Rules and Guidelines

### Code Quality Rules
- **No console.log**: Console statements in production code
- **No debugger**: Debugger statements are prohibited
- **Unused variables**: Strict checking with exceptions for `_` prefix
- **Prefer const/let**: No `var` declarations
- **Arrow functions**: Prefer arrow functions and template literals

### React Specific Rules
- **JSX conventions**: Proper naming conventions and structure
- **Prop validation**: TypeScript handles prop types
- **Component optimization**: Rules for state and props management
- **Hook rules**: Proper React Hooks usage

### TypeScript Rules
- **No `any` type**: Warns against `any` usage
- **Nullish coalescing**: Prefer `??` over `||` for nullish values
- **Optional chaining**: Prefer `?.` over manual null checking
- **Async/await**: Proper promise handling

### Accessibility Rules
- **Alt text**: Images must have descriptive alt attributes
- **ARIA attributes**: Proper ARIA usage
- **Keyboard navigation**: Tab index and focus management
- **Color contrast**: Visual accessibility considerations
- **Semantic HTML**: Proper heading structure and landmarks

## File-Specific Configurations

### Test Files (`.test.ts`, `.test.tsx`, `__tests__/`)
- Relaxed rules for development/testing code
- Disabled `no-explicit-any` rule
- Disabled `exhaustive-deps` for testing scenarios

### Cypress Files (`cypress/**/*`)
- Extended with Cypress-specific rules
- Disabled `no-unnecessary-waiting` rule

## IDE Integration

### VS Code Setup
Recommended VS Code extensions:
- ESLint extension
- Prettier extension
- TypeScript Hero (optional)

### VS Code Settings (`.vscode/settings.json`)
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnPaste": true
}
```

## Git Hooks (Optional)

For pre-commit linting, consider adding:
```bash
# Install husky
npm install --save-dev husky

# Setup pre-commit hook
npx husky add .husky/pre-commit "npm run format:lint"
```

## Troubleshooting

### Common Issues

1. **ESLint not detecting TypeScript files**
   - Ensure `eslint.config.js` includes TypeScript parser
   - Check that `tsconfig.json` is properly configured

2. **Prettier conflicts with ESLint**
   - The configuration is designed to work together
   - ESLint handles code quality, Prettier handles formatting

3. **Accessibility warnings**
   - Review WCAG guidelines for React components
   - Use semantic HTML elements when possible

### Performance Tips
- Use `npm run lint:fix` for auto-fixing common issues
- Run format check before committing: `npm run format:lint`
- Use TypeScript strict mode for better type checking

## Implementation Status ✅

### Completed Features
- **ESLint Configuration**: Fully configured with TypeScript, React, and accessibility rules
- **Prettier Configuration**: Code formatting rules implemented
- **Package Scripts**: Added comprehensive lint and format scripts
- **Documentation**: Complete usage guide and troubleshooting
- **Ignore Files**: Proper ignore patterns for both ESLint and Prettier
- **File Extensions**: Correct `.cjs` extension for ESLint config (due to ES module setup)

### Test Results
- **Lint Check**: ✅ Working (found 647 issues in existing codebase)
- **Format Check**: ✅ Working (found formatting issues in 40 files)
- **TypeScript Integration**: ✅ Working with project references

### Quick Start
1. **Check linting**: `npm run lint`
2. **Fix linting issues**: `npm run lint:fix`
3. **Format code**: `npm run format`
4. **Format and lint**: `npm run format:lint`

### Next Steps
1. Run `npm run format` to apply consistent formatting
2. Use `npm run format:lint` in development workflow
3. Add pre-commit hooks for automated quality checks
4. Consider incrementally fixing high-priority linting issues

## Continuous Integration

Add to your CI/CD pipeline:
```bash
npm run type-check
npm run lint
npm run format:check
npm test
```

This ensures code quality standards are maintained across all commits and deployments.