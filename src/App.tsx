import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import LoginPage from '@/components/auth/LoginPage';
import IntegratedPOSInterface from '@/components/pos/IntegratedPOSInterface';
import LoadingScreen from '@/components/common/LoadingScreen';
import NetworkStatus from '@/components/common/NetworkStatus';

function App() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  // Initialize user session
  useEffect(() => {
    // Check for stored authentication
    if (user && !isAuthenticated) {
      useAuthStore.setState({ isAuthenticated: true });
    }
  }, [user, isAuthenticated]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="App h-screen bg-gray-50">
      <NetworkStatus />
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} />
        <Route
          path="/*"
          element={isAuthenticated ? <IntegratedPOSInterface /> : <Navigate to="/login" />}
        />
      </Routes>
    </div>
  );
}

export default App;
