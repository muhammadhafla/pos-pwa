/**
 * ManualSyncOverrideInterface - Provides UI for manual sync operations
 * Allows users to force sync, view status, and override sync settings
 */

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { MasterSyncService } from '../../services/sync/MasterSyncService';
import { SyncPerformanceMonitor } from '../../services/sync/SyncPerformanceMonitor';

interface ManualSyncOverrideInterfaceProps {
  masterSyncService: MasterSyncService;
  performanceMonitor: SyncPerformanceMonitor;
}

export const ManualSyncOverrideInterface: React.FC<ManualSyncOverrideInterfaceProps> = ({
  masterSyncService,
  performanceMonitor,
}) => {
  const [syncStatus, setSyncStatus] = useState(masterSyncService.getStatus());
  const [isLoading, setIsLoading] = useState(false);
  const [_selectedOperation, _setSelectedOperation] = useState<string>('');
  const [healthCheck, setHealthCheck] = useState<any>(null);
  const [operationHistory, setOperationHistory] = useState<any[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);

  // Refresh status
  const refreshStatus = () => {
    setSyncStatus(masterSyncService.getStatus());
    setOperationHistory(masterSyncService.getOperationHistory(20));
    setActiveAlerts(performanceMonitor.getActiveAlerts());
  };

  // Force full sync
  const handleForceFullSync = async () => {
    setIsLoading(true);
    try {
      const _result = await masterSyncService.forceFullSync();
      toast.success('Full synchronization completed successfully');
      refreshStatus();
    } catch (error) {
      toast.error('Full synchronization failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Start master data sync
  const handleStartMasterDataSync = async () => {
    setIsLoading(true);
    try {
      await masterSyncService.startMasterDataSync();
      toast.success('Master data synchronization started');
      refreshStatus();
    } catch (error) {
      toast.error('Failed to start master data synchronization');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop master data sync
  const handleStopMasterDataSync = () => {
    masterSyncService.stopMasterDataSync();
    toast('Master data synchronization stopped', { icon: 'ℹ️' });
    refreshStatus();
  };

  // Perform health check
  const handleHealthCheck = async () => {
    setIsLoading(true);
    try {
      const _result = await masterSyncService.performHealthCheck();
      setHealthCheck(_result);
      toast.success('Health check completed');
    } catch (error) {
      toast.error('Health check failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Retry failed operations
  const handleRetryFailedOperations = async () => {
    setIsLoading(true);
    try {
      await masterSyncService.retryFailedOperations();
      toast.success('Failed operations retry initiated');
      refreshStatus();
    } catch (error) {
      toast.error('Failed to retry operations');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear operation history
  const handleClearHistory = () => {
    masterSyncService.clearOperationHistory();
    toast('Operation history cleared', { icon: '🧹' });
    refreshStatus();
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="manual-sync-override-interface">
      <h2>🔧 Manual Sync Override</h2>

      {/* Overall Status */}
      <div className="status-card">
        <h3>📊 Sync Status</h3>
        <div className="status-grid">
          <div className="status-item">
            <label>Overall Health:</label>
            <span className={`status-badge ${syncStatus.overallHealth}`}>
              {syncStatus.overallHealth}
            </span>
          </div>
          <div className="status-item">
            <label>ERPNext Connected:</label>
            <span
              className={syncStatus.erpnextConnected ? 'status-connected' : 'status-disconnected'}
            >
              {syncStatus.erpnextConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="status-item">
            <label>Network Status:</label>
            <span className={syncStatus.isOnline ? 'status-online' : 'status-offline'}>
              {syncStatus.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="status-item">
            <label>Last Health Check:</label>
            <span>{syncStatus.lastHealthCheck?.toLocaleTimeString() ?? 'Never'}</span>
          </div>
        </div>
      </div>

      {/* Manual Operations */}
      <div className="operations-card">
        <h3>⚡ Manual Operations</h3>
        <div className="operations-grid">
          <button
            onClick={handleForceFullSync}
            disabled={isLoading}
            className="operation-button primary"
          >
            🔄 Force Full Sync
          </button>

          <button
            onClick={handleStartMasterDataSync}
            disabled={isLoading}
            className="operation-button success"
          >
            📦 Start Master Data Sync
          </button>

          <button
            onClick={handleStopMasterDataSync}
            disabled={isLoading}
            className="operation-button warning"
          >
            🛑 Stop Master Data Sync
          </button>

          <button
            onClick={handleHealthCheck}
            disabled={isLoading}
            className="operation-button info"
          >
            🏥 Health Check
          </button>

          <button
            onClick={handleRetryFailedOperations}
            disabled={isLoading}
            className="operation-button secondary"
          >
            🔄 Retry Failed Operations
          </button>

          <button
            onClick={handleClearHistory}
            disabled={isLoading}
            className="operation-button danger"
          >
            🧹 Clear History
          </button>
        </div>
      </div>

      {/* Master Data Sync Status */}
      <div className="sync-status-card">
        <h3>📋 Master Data Sync Status</h3>
        <div className="sync-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width:
                  syncStatus.masterDataSync.totalItems > 0
                    ? `${
                        (syncStatus.masterDataSync.syncedItems /
                          syncStatus.masterDataSync.totalItems) *
                        100
                      }%`
                    : '0%',
              }}
            />
          </div>
          <div className="progress-text">
            {syncStatus.masterDataSync.syncedItems} / {syncStatus.masterDataSync.totalItems} items
          </div>
        </div>
        <div className="sync-stats">
          <div>Synced: {syncStatus.masterDataSync.syncedItems}</div>
          <div>Failed: {syncStatus.masterDataSync.failedItems}</div>
          <div>Status: {syncStatus.masterDataSync.isRunning ? 'Running' : 'Stopped'}</div>
        </div>
      </div>

      {/* Transaction Queue Status */}
      <div className="queue-status-card">
        <h3>📋 Transaction Queue Status</h3>
        <div className="queue-stats">
          <div>Total Items: {syncStatus.transactionQueue.totalItems}</div>
          <div>Pending: {syncStatus.transactionQueue.pendingItems}</div>
          <div>Processing: {syncStatus.transactionQueue.processingItems}</div>
          <div>Failed: {syncStatus.transactionQueue.failedItems}</div>
          <div>Success Rate: {syncStatus.transactionQueue.successRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* Health Check Results */}
      {healthCheck && (
        <div className="health-check-card">
          <h3>🏥 Health Check Results</h3>
          <div className="health-status">
            <div className="health-item">
              <label>Overall Status:</label>
              <span className={`health-badge ${healthCheck.overall}`}>{healthCheck.overall}</span>
            </div>
            <div className="health-item">
              <label>ERPNext API:</label>
              <span className={`health-status ${healthCheck.erpnextAPI.status}`}>
                {healthCheck.erpnextAPI.status} ({healthCheck.erpnextAPI.responseTime}ms)
              </span>
            </div>
            <div className="health-item">
              <label>Database:</label>
              <span className={`health-status ${healthCheck.database.status}`}>
                {healthCheck.database.status}
              </span>
            </div>
            <div className="health-item">
              <label>Queue:</label>
              <span className={`health-status ${healthCheck.queue.status}`}>
                {healthCheck.queue.status} ({healthCheck.queue.pendingCount} pending)
              </span>
            </div>
          </div>
          {healthCheck.recommendations.length > 0 && (
            <div className="recommendations">
              <h4>💡 Recommendations</h4>
              <ul>
                {healthCheck.recommendations.map((rec: string, index: number) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="alerts-card">
          <h3>⚠️ Active Alerts</h3>
          <div className="alerts-list">
            {activeAlerts.map((alert, index) => (
              <div key={index} className={`alert-item ${alert.severity}`}>
                <div className="alert-header">
                  <span className="alert-type">{alert.type.replace('_', ' ')}</span>
                  <span className="alert-severity">{alert.severity}</span>
                </div>
                <div className="alert-message">{alert.message}</div>
                <div className="alert-time">{alert.timestamp.toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operation History */}
      <div className="history-card">
        <h3>📋 Operation History</h3>
        <div className="history-list">
          {operationHistory.slice(0, 10).map((operation, index) => (
            <div key={index} className={`history-item ${operation.status}`}>
              <div className="history-header">
                <span className="operation-type">{operation.type}</span>
                <span className={`status-badge ${operation.status}`}>{operation.status}</span>
              </div>
              <div className="history-details">
                <span>Started: {operation.startedAt.toLocaleTimeString()}</span>
                {operation.completedAt && (
                  <span>
                    Duration:{' '}
                    {(operation.completedAt.getTime() - operation.startedAt.getTime()) / 1000}s
                  </span>
                )}
                {operation.error && <span className="error-text">Error: {operation.error}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
};

export default ManualSyncOverrideInterface;
