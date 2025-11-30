import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/index.css';
import { initializeDatabase } from '@/services/database/POSDatabase';

// Initialize React Query with optimized settings for POS
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes - reasonable for POS data
      cacheTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      refetchOnReconnect: true
    },
    mutations: {
      retry: 1,
      retryDelay: 1000
    }
  },
});

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('✅ Service Worker registered successfully:', registration.scope);
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              console.log('🔄 New version available. Will update on next refresh.');
            }
          });
        }
      });
      
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  });
}

// Initialize database and performance monitoring
const initializeApp = async () => {
  try {
    // Initialize IndexedDB
    await initializeDatabase();
    
    // Start performance monitoring
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('app-start');
    }
    
    console.log('🚀 POS PWA Retail System initialized successfully');
    
  } catch (error) {
    console.error('❌ App initialization failed:', error);
    // Show user-friendly error message
    document.body.innerHTML = `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        background: #f5f5f5;
      ">
        <div style="
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          text-align: center;
        ">
          <h2 style="color: #d32f2f; margin-bottom: 1rem;">System Error</h2>
          <p style="color: #666; margin-bottom: 1rem;">
            Failed to initialize the POS system. Please refresh the page.
          </p>
          <button onclick="window.location.reload()" style="
            background: #1976d2;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
          ">Refresh Page</button>
        </div>
      </div>
    `;
  }
};

// Handle online/offline status
const handleNetworkChange = () => {
  const isOnline = navigator.onLine;
  console.log(`🌐 Network status: ${isOnline ? 'Online' : 'Offline'}`);
  
  // Notify components about network status
  window.dispatchEvent(new CustomEvent('network-status-changed', { 
    detail: { isOnline } 
  }));
};

window.addEventListener('online', handleNetworkChange);
window.addEventListener('offline', handleNetworkChange);

// Render the application
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.Fragment>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '14px'
            },
            success: {
              style: {
                background: '#4caf50',
              },
              duration: 3000
            },
            error: {
              style: {
                background: '#f44336',
              },
              duration: 5000
            }
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.Fragment>
);

// Initialize the application
initializeApp();

// Performance monitoring for app startup
window.addEventListener('load', () => {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark('app-loaded');
    performance.measure('app-startup', 'app-start', 'app-loaded');
    
    const measure = performance.getEntriesByName('app-startup')[0];
    console.log(`⚡ App startup time: ${measure.duration.toFixed(2)}ms`);
    
    // Alert if startup is too slow (>2s target)
    if (measure.duration > 2000) {
      console.warn('⚠️ App startup time exceeded 2s target');
    }
  }
});