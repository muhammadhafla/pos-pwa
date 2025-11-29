import { useAuthStore } from '@/stores/authStore';
import { toast } from 'react-hot-toast';

const POSInterface: React.FC = () => {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <div className="h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-900">
              POS PWA Retail
            </h1>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Offline Ready</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
              <p className="text-xs text-gray-500">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="pos-button pos-button-secondary"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                🚀 POS System Development
              </h2>
              <p className="text-gray-600 mb-6">
                The offline-first POS system is being built according to the comprehensive 4-week development roadmap.
              </p>
              
              {/* Development Progress */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-2">✅ Phase 1 Complete</h3>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• Project setup with Vite + React + TypeScript</li>
                    <li>• PWA configuration with Workbox</li>
                    <li>• IndexedDB schema with Dexie.js</li>
                    <li>• Authentication system</li>
                    <li>• Cart management</li>
                  </ul>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">🔄 Next: Core POS Features</h3>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Item management with barcode lookup</li>
                    <li>• 8-level pricing engine</li>
                    <li>• Receipt generation</li>
                    <li>• Price override system</li>
                    <li>• Payment processing</li>
                  </ul>
                </div>
              </div>

              {/* Performance Targets */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Performance Targets</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{"<100ms"}</div>
                    <div className="text-sm text-gray-600">Barcode Scan</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{"<200ms"}</div>
                    <div className="text-sm text-gray-600">Search Response</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{"<2s"}</div>
                    <div className="text-sm text-gray-600">App Startup</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{"<3s"}</div>
                    <div className="text-sm text-gray-600">Crash Recovery</div>
                  </div>
                </div>
              </div>

              {/* Feature Roadmap */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Week 2: Business Logic</h4>
                  <p className="text-sm text-gray-600">
                    Pricing engine, receipt generation, price overrides, returns processing
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Week 3: ERPNext Integration</h4>
                  <p className="text-sm text-gray-600">
                    Master data sync, transaction queue, crash recovery, invoice posting
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Week 4: Testing & Deployment</h4>
                  <p className="text-sm text-gray-600">
                    Stress testing, performance validation, production deployment
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default POSInterface;