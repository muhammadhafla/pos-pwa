# Project Setup & Development Environment

## 1. Initial Project Structure Creation

### 1.1 Create Directory Structure
```bash
# Base project directory
pos-pwa-retail/
├── public/                    # Static assets
│   ├── icons/                # PWA icons
│   ├── sw.js                # Service worker
│   └── manifest.json         # PWA manifest
├── src/                      # Source code
│   ├── components/          # React components
│   │   ├── common/         # Shared components
│   │   ├── pos/            # POS-specific components
│   │   └── auth/           # Authentication components
│   ├── hooks/               # Custom React hooks
│   ├── stores/              # Zustand state stores
│   ├── services/            # API and business logic
│   │   ├── database/        # IndexedDB operations
│   │   ├── erpnext/         # ERPNext API client
│   │   └── sync/            # Synchronization logic
│   ├── utils/               # Utility functions
│   ├── types/               # TypeScript type definitions
│   └── styles/              # CSS/SCSS files
├── tests/                    # Unit tests
├── cypress/                  # E2E tests
├── docs/                     # Documentation
└── scripts/                  # Build and deployment scripts
```

### 1.2 Package.json Configuration
```json
{
  "name": "pos-pwa-retail",
  "version": "1.0.0",
  "description": "Offline-first POS system with ERPNext integration",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "cypress run",
    "test:e2e:open": "cypress open",
    "lint": "eslint src --ext .ts,.tsx --max-warnings 0",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "type-check": "tsc --noEmit",
    "pwa:generate": "workbox generateSW workbox-config.js",
    "pwa:analyze": "workbox wizard",
    "analyze": "npm run build && npx vite-bundle-analyzer dist"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "dexie": "^3.2.4",
    "zustand": "^4.3.2",
    "@tanstack/react-query": "^4.24.4",
    "workbox-window": "^6.5.4",
    "frappe-js-sdk": "^2.4.5",
    "zod": "^3.20.2",
    "date-fns": "^2.29.3",
    "react-window": "^1.8.8",
    "react-hot-toast": "^2.4.0",
    "react-hook-form": "^7.43.1",
    "react-select": "^5.7.0",
    "@headlessui/react": "^1.7.10",
    "@heroicons/react": "^2.0.14"
  },
  "devDependencies": {
    "@types/react": "^18.0.27",
    "@types/react-dom": "^18.0.10",
    "@types/react-window": "^1.8.5",
    "@typescript-eslint/eslint-plugin": "^5.52.0",
    "@typescript-eslint/parser": "^5.52.0",
    "@vitejs/plugin-react": "^3.1.0",
    "cypress": "^12.6.0",
    "eslint": "^8.34.0",
    "eslint-plugin-cypress": "^2.12.1",
    "eslint-plugin-react": "^7.32.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "jest": "^29.4.2",
    "jest-environment-jsdom": "^29.4.2",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^5.16.5",
    "@testing-library/user-event": "^14.4.3",
    "msw": "^1.0.1",
    "prettier": "^2.8.4",
    "typescript": "^4.9.5",
    "vite": "^4.1.1",
    "vite-plugin-pwa": "^0.14.4",
    "workbox-build": "^6.5.4"
  },
  "engines": {
    "node": ">=16.0.0",
    "npm": ">=8.0.0"
  }
}
```

### 1.3 TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES2020", "WebWorker"],
    "types": ["vite/client", "jest", "cypress"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/components/*": ["src/components/*"],
      "@/hooks/*": ["src/hooks/*"],
      "@/stores/*": ["src/stores/*"],
      "@/services/*": ["src/services/*"],
      "@/utils/*": ["src/utils/*"],
      "@/types/*": ["src/types/*"]
    }
  },
  "include": [
    "src",
    "tests",
    "cypress",
    "vite.config.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
```

### 1.4 Vite Configuration
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'POS PWA Retail',
        short_name: 'POS',
        description: 'Offline-first POS system with ERPNext integration',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.erpnext\.com\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'erp-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/stores': path.resolve(__dirname, './src/stores'),
      '@/services': path.resolve(__dirname, './src/services'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@/types': path.resolve(__dirname, './src/types')
    }
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          query: ['@tanstack/react-query'],
          db: ['dexie']
        }
      }
    }
  }
});
```

### 1.5 ESLint Configuration
```json
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true,
    "jest": true,
    "cypress/globals": true
  },
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:cypress/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaFeatures": {
      "jsx": true
    },
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": [
    "react",
    "react-hooks",
    "@typescript-eslint",
    "cypress"
  ],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "react-hooks/exhaustive-deps": "warn",
    "cypress/no-unnecessary-waiting": "off"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  },
  "ignorePatterns": ["dist/", "node_modules/", "*.config.js"]
}
```

### 1.6 Environment Configuration
```bash
# .env.development
VITE_ERPNEXT_URL=https://erp.example.com
VITE_ERPNEXT_API_VERSION=v2
VITE_BRANCH_ID=default
VITE_DEBUG=true
VITE_MOCK_ERPNEXT=true

# .env.production
VITE_ERPNEXT_URL=https://erp.yourcompany.com
VITE_ERPNEXT_API_VERSION=v2
VITE_BRANCH_ID=${BRANCH_ID}
VITE_DEBUG=false
VITE_MOCK_ERPNEXT=false
```

## 2. Core File Templates

### 2.1 Basic React App Entry Point
```typescript
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/index.css';

// Initialize React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: 1000,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-center" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

### 2.2 Basic App Component
```typescript
// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/components/auth/LoginPage';
import POSInterface from '@/components/pos/POSInterface';
import LoadingScreen from '@/components/common/LoadingScreen';

function App() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="App h-screen bg-gray-50">
      <Routes>
        <Route 
          path="/login" 
          element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} 
        />
        <Route 
          path="/*" 
          element={isAuthenticated ? <POSInterface /> : <Navigate to="/login" />} 
        />
      </Routes>
    </div>
  );
}

export default App;
```

### 2.3 Jest Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/stores/(.*)$': '<rootDir>/src/stores/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1'
  }
};
```

### 2.4 Cypress Configuration
```javascript
// cypress.config.js
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: 1024,
    viewportHeight: 768,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000
  },
  component: {
    devServer: {
      framework: 'create-react-app',
      bundler: 'webpack'
    },
    specPattern: 'src/**/*.cy.{ts,tsx}',
    supportFile: 'cypress/support/component.ts'
  }
});
```

## 3. Development Scripts

### 3.1 Setup Script
```bash
#!/bin/bash
# scripts/setup.sh

echo "🚀 Setting up POS PWA Retail development environment..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ $NODE_VERSION -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current: $(node -v)"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate PWA icons if they don't exist
if [ ! -f "public/pwa-192x192.png" ]; then
    echo "🎨 Generating PWA icons..."
    # Note: In real setup, you'd use a tool like pwa-asset-generator
    # For now, create placeholder icons
    touch public/pwa-192x192.png
    touch public/pwa-512x512.png
fi

# Create necessary directories
echo "📁 Creating directory structure..."
mkdir -p src/components/common src/components/pos src/components/auth
mkdir -p src/hooks src/stores src/services/{database,erpnext,sync}
mkdir -p src/utils src/types src/styles
mkdir -p tests/unit tests/integration
mkdir -p cypress/{e2e,support,fixtures}

# Copy environment files
if [ ! -f ".env.development" ]; then
    cp .env.development.example .env.development
fi

if [ ! -f ".env.production" ]; then
    cp .env.production.example .env.production
fi

# Build initial structure
echo "🔨 Building initial project structure..."
npm run type-check
npm run lint

echo "✅ Setup complete! Run 'npm run dev' to start development server."
echo "📚 Documentation: https://your-docs-url.com"
echo "🐛 Issues: https://your-repo-url/issues"
```

### 3.2 Build Script
```bash
#!/bin/bash
# scripts/build.sh

set -e

echo "🔨 Building POS PWA Retail for production..."

# Clean previous build
rm -rf dist

# Type checking
echo "🔍 Running type checking..."
npm run type-check

# Linting
echo "🧹 Running linter..."
npm run lint

# Unit tests
echo "🧪 Running unit tests..."
npm run test -- --coverage

# Build application
echo "🏗️ Building application..."
npm run build

# PWA generation
echo "📱 Generating PWA files..."
npm run pwa:generate

# Analyze bundle
echo "📊 Analyzing bundle size..."
npm run analyze

echo "✅ Build complete! Files are in the 'dist' directory."
```

This project setup provides a solid foundation with:
- Modern React + TypeScript + Vite stack
- Comprehensive PWA configuration
- Proper testing setup with Jest and Cypress
- Development tools and scripts
- Code quality enforcement
- Performance optimization

The structure follows the technical architecture decisions and supports the offline-first requirements while maintaining development velocity.