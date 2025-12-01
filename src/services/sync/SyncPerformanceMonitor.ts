/**
 * SyncPerformanceMonitor - Tracks and analyzes synchronization performance
 * Provides detailed metrics and alerts for optimization
 */

export interface SyncMetrics {
  timestamp: Date;
  operation: 'master_sync' | 'transaction_sync' | 'full_sync' | 'retry';
  duration: number;
  success: boolean;
  itemsProcessed: number;
  networkRequests: number;
  dataTransferred: number;
  errorCount: number;
  retryCount: number;
}

export interface PerformanceAlert {
  id: string;
  type: 'slow_response' | 'high_error_rate' | 'large_queue' | 'network_issues';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metric: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface PerformanceThresholds {
  maxResponseTime: number; // ms
  maxErrorRate: number; // percentage
  maxQueueSize: number; // number of items
  minSuccessRate: number; // percentage
  maxDataTransfer: number; // bytes
}

export interface PerformanceReport {
  period: 'hourly' | 'daily' | 'weekly';
  startTime: Date;
  endTime: Date;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageResponseTime: number;
  totalDataTransferred: number;
  peakResponseTime: number;
  successRate: number;
  errorBreakdown: Record<string, number>;
  performanceTrends: {
    responseTimeTrend: 'improving' | 'stable' | 'degrading';
    successRateTrend: 'improving' | 'stable' | 'degrading';
    queueSizeTrend: 'growing' | 'stable' | 'shrinking';
  };
  recommendations: string[];
}

/**
 * SyncPerformanceMonitor - Monitors and analyzes sync performance
 */
export class SyncPerformanceMonitor {
  private metrics: SyncMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private thresholds: PerformanceThresholds;
  private reportCache: Map<string, PerformanceReport> = new Map();
  private notificationCallback?: (alert: PerformanceAlert) => void;

  constructor(
    thresholds?: Partial<PerformanceThresholds>,
    notificationCallback?: (alert: PerformanceAlert) => void
  ) {
    this.thresholds = {
      maxResponseTime: 5000, // 5 seconds
      maxErrorRate: 5, // 5%
      maxQueueSize: 100, // 100 items
      minSuccessRate: 95, // 95%
      maxDataTransfer: 10 * 1024 * 1024, // 10MB
      ...thresholds,
    };
    this.notificationCallback = notificationCallback;
  }

  /**
   * Record sync operation metrics
   */
  recordOperation(operation: Omit<SyncMetrics, 'timestamp'>): void {
    const metric: SyncMetrics = {
      ...operation,
      timestamp: new Date(),
    };

    this.metrics.push(metric);

    // Keep only recent metrics (last 1000 operations)
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Check for alerts
    this.checkForAlerts(metric);

    // Update report cache
    this.updateReportCache();
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageResponseTime: number;
    successRate: number;
    totalDataTransferred: number;
    recentErrors: string[];
  } {
    const now = Date.now();
    const recentMetrics = this.metrics.filter(
      metric => now - metric.timestamp.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    const successful = recentMetrics.filter(m => m.success);
    const failed = recentMetrics.filter(m => !m.success);

    const totalOperations = recentMetrics.length;
    const successfulOperations = successful.length;
    const failedOperations = failed.length;
    const averageResponseTime =
      totalOperations > 0
        ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations
        : 0;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;
    const totalDataTransferred = recentMetrics.reduce((sum, m) => sum + m.dataTransferred, 0);

    const recentErrors = failed
      .slice(-10)
      .map(m => `${m.operation}: ${m.errorCount} errors in ${m.duration}ms`);

    return {
      totalOperations,
      successfulOperations,
      failedOperations,
      averageResponseTime,
      successRate,
      totalDataTransferred,
      recentErrors,
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts within time range
   */
  getAlertsInRange(startTime: Date, endTime: Date): PerformanceAlert[] {
    return this.alerts.filter(alert => alert.timestamp >= startTime && alert.timestamp <= endTime);
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      console.log(`✅ Alert resolved: ${alert.message}`);
    }
  }

  /**
   * Generate performance report
   */
  generateReport(period: 'hourly' | 'daily' | 'weekly'): PerformanceReport {
    const cacheKey = `${period}_${new Date().toISOString().split('T')[0]}`;
    const cachedReport = this.reportCache.get(cacheKey);

    if (cachedReport) {
      return cachedReport;
    }

    const now = Date.now();
    let startTime: Date;

    switch (period) {
      case 'hourly':
        startTime = new Date(now - 60 * 60 * 1000); // Last hour
        break;
      case 'daily':
        startTime = new Date(now - 24 * 60 * 60 * 1000); // Last day
        break;
      case 'weekly':
        startTime = new Date(now - 7 * 24 * 60 * 60 * 1000); // Last week
        break;
    }

    const reportMetrics = this.metrics.filter(
      m => m.timestamp >= startTime && m.timestamp <= new Date(now)
    );

    const totalOperations = reportMetrics.length;
    const successfulOperations = reportMetrics.filter(m => m.success).length;
    const failedOperations = totalOperations - successfulOperations;
    const averageResponseTime =
      totalOperations > 0
        ? reportMetrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations
        : 0;
    const totalDataTransferred = reportMetrics.reduce((sum, m) => sum + m.dataTransferred, 0);
    const peakResponseTime = Math.max(...reportMetrics.map(m => m.duration), 0);
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    const errorBreakdown: Record<string, number> = {};
    reportMetrics.forEach(m => {
      if (!m.success) {
        const errorType = this.categorizeError(m);
        errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
      }
    });

    const performanceTrends = this.calculateTrends(reportMetrics);
    const recommendations = this.generateRecommendations(reportMetrics);

    const report: PerformanceReport = {
      period,
      startTime,
      endTime: new Date(now),
      totalOperations,
      successfulOperations,
      failedOperations,
      averageResponseTime,
      totalDataTransferred,
      peakResponseTime,
      successRate,
      errorBreakdown,
      performanceTrends,
      recommendations,
    };

    this.reportCache.set(cacheKey, report);
    return report;
  }

  /**
   * Update thresholds
   */
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('📊 Performance thresholds updated:', this.thresholds);
  }

  /**
   * Clear old metrics and alerts
   */
  cleanup(olderThanDays: number = 7): void {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const initialMetricsCount = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoffDate);

    const initialAlertsCount = this.alerts.length;
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoffDate || !alert.resolved);

    console.log(`🧹 Cleaned up metrics: ${initialMetricsCount - this.metrics.length} removed`);
    console.log(`🧹 Cleaned up alerts: ${initialAlertsCount - this.alerts.length} removed`);
  }

  /**
   * Check for performance alerts
   */
  private checkForAlerts(metric: SyncMetrics): void {
    const alerts: PerformanceAlert[] = [];

    // Check response time
    if (metric.duration > this.thresholds.maxResponseTime) {
      alerts.push({
        id: `slow_response_${Date.now()}`,
        type: 'slow_response',
        severity: metric.duration > this.thresholds.maxResponseTime * 2 ? 'critical' : 'high',
        message: `Operation took ${metric.duration}ms (threshold: ${this.thresholds.maxResponseTime}ms)`,
        metric: metric.duration,
        threshold: this.thresholds.maxResponseTime,
        timestamp: metric.timestamp,
        resolved: false,
      });
    }

    // Check error rate
    const recentMetrics = this.getRecentMetrics(100);
    const errorRate = (recentMetrics.filter(m => !m.success).length / recentMetrics.length) * 100;

    if (errorRate > this.thresholds.maxErrorRate) {
      alerts.push({
        id: `high_error_rate_${Date.now()}`,
        type: 'high_error_rate',
        severity: errorRate > this.thresholds.maxErrorRate * 2 ? 'critical' : 'high',
        message: `Error rate is ${errorRate.toFixed(1)}% (threshold: ${
          this.thresholds.maxErrorRate
        }%)`,
        metric: errorRate,
        threshold: this.thresholds.maxErrorRate,
        timestamp: metric.timestamp,
        resolved: false,
      });
    }

    // Add new alerts
    alerts.forEach(alert => {
      this.alerts.push(alert);

      // Notify if callback is set
      if (this.notificationCallback) {
        this.notificationCallback(alert);
      }

      console.warn(`⚠️ Performance alert: ${alert.message}`);
    });
  }

  /**
   * Get recent metrics
   */
  private getRecentMetrics(count: number): SyncMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Categorize error for reporting
   */
  private categorizeError(metric: SyncMetrics): string {
    if (metric.networkRequests > metric.itemsProcessed * 2) {
      return 'network_flood';
    }
    if (metric.duration > 10000) {
      return 'timeout';
    }
    if (metric.errorCount > metric.networkRequests * 0.1) {
      return 'frequent_errors';
    }
    return 'unknown';
  }

  /**
   * Calculate performance trends
   */
  private calculateTrends(metrics: SyncMetrics[]): PerformanceReport['performanceTrends'] {
    if (metrics.length < 10) {
      return {
        responseTimeTrend: 'stable',
        successRateTrend: 'stable',
        queueSizeTrend: 'stable',
      };
    }

    const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
    const secondHalf = metrics.slice(Math.floor(metrics.length / 2));

    const firstHalfAvgResponse =
      firstHalf.reduce((sum, m) => sum + m.duration, 0) / firstHalf.length;
    const secondHalfAvgResponse =
      secondHalf.reduce((sum, m) => sum + m.duration, 0) / secondHalf.length;

    const firstHalfSuccessRate = (firstHalf.filter(m => m.success).length / firstHalf.length) * 100;
    const secondHalfSuccessRate =
      (secondHalf.filter(m => m.success).length / secondHalf.length) * 100;

    const responseTimeTrend =
      secondHalfAvgResponse < firstHalfAvgResponse * 0.9
        ? 'improving'
        : secondHalfAvgResponse > firstHalfAvgResponse * 1.1
        ? 'degrading'
        : 'stable';

    const successRateTrend =
      secondHalfSuccessRate > firstHalfSuccessRate + 2
        ? 'improving'
        : secondHalfSuccessRate < firstHalfSuccessRate - 2
        ? 'degrading'
        : 'stable';

    const queueSizeTrend = 'stable'; // Placeholder

    return {
      responseTimeTrend,
      successRateTrend,
      queueSizeTrend,
    };
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(metrics: SyncMetrics[]): string[] {
    const recommendations: string[] = [];

    if (metrics.length === 0) {
      return ['No performance data available'];
    }

    const avgResponseTime = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
    const errorRate = (metrics.filter(m => !m.success).length / metrics.length) * 100;

    if (avgResponseTime > 3000) {
      recommendations.push('Consider reducing batch size for better response times');
    }

    if (errorRate > 10) {
      recommendations.push(
        'High error rate detected - check network connectivity and server status'
      );
    }

    const avgDataTransfer = metrics.reduce((sum, m) => sum + m.dataTransferred, 0) / metrics.length;
    if (avgDataTransfer > this.thresholds.maxDataTransfer * 0.8) {
      recommendations.push('Large data transfers detected - consider data compression');
    }

    const networkHeavyOps = metrics.filter(m => m.networkRequests > m.itemsProcessed * 2).length;
    if (networkHeavyOps > metrics.length * 0.3) {
      recommendations.push('High network request ratio - optimize API calls');
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance is within acceptable parameters');
    }

    return recommendations;
  }

  /**
   * Update report cache
   */
  private updateReportCache(): void {
    // Clear cache if it's getting too large
    if (this.reportCache.size > 50) {
      this.reportCache.clear();
    }
  }
}
