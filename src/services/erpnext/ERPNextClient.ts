/**
 * ERPNext API Client with token-based authentication and error handling
 * Implements comprehensive API communication with retry logic and monitoring
 */

import { toast } from 'react-hot-toast';

export interface ERPNextConfig {
  baseUrl: string;
  apiVersion: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface ERPNextAuth {
  apiKey: string;
  apiSecret: string;
  sid?: string; // Session ID
  expiry?: number; // Token expiry timestamp
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
}

export interface ERPNextListResponse<T = any> {
  data: T[];
  total_count: number;
  page_length?: number;
}

export interface ERPNextDocType {
  name: string;
  description?: string;
  creation?: string;
  modified?: string;
  fields?: ERPNextField[];
}

export interface ERPNextField {
  fieldname: string;
  fieldtype: string;
  label: string;
  options?: string;
  reqd?: boolean;
}

export interface ERPNextItem {
  name: string; // Item code
  item_name: string;
  description?: string;
  item_group: string;
  stock_uom: string;
  image?: string;
  has_batch_no?: number;
  is_stock_item?: number;
  valuation_rate?: number;
  standard_rate?: number;
  last_purchase_rate?: number;
  creation?: string;
  modified?: string;
  modified_by?: string;
  owner?: string;
}

export interface ERPNextSalesInvoice {
  name?: string; // Document name
  company: string;
  customer?: string;
  posting_date: string;
  posting_time: string;
  items: ERPNextSalesInvoiceItem[];
  taxes?: ERPNextInvoiceTax[];
  payments?: ERPNextInvoicePayment[];
  discount_amount?: number;
  additional_discount_percentage?: number;
  apply_discount_on?: 'Grand Total' | 'Net Total';
  remarks?: string;
  // Custom POS fields
  pos_branch_id?: string;
  pos_device_id?: string;
  pos_transaction_id?: string;
  pos_receipt_number?: string;
}

export interface ERPNextSalesInvoiceItem {
  item_code: string;
  item_name?: string;
  qty: number;
  rate: number;
  amount?: number;
  warehouse?: string;
  cost_center?: string;
  income_account?: string;
  serial_no?: string;
  batch_no?: string;
}

export interface ERPNextInvoiceTax {
  charge_type:
    | 'On Net Total'
    | 'On Previous Row Amount'
    | 'On Previous Row Total'
    | 'On Paid Amount';
  account_head: string;
  description?: string;
  rate: number;
  amount?: number;
  row_id?: number;
}

export interface ERPNextInvoicePayment {
  mode_of_payment: string;
  amount: number;
  reference_no?: string;
  account?: string;
}

/**
 * ERPNext API Client with comprehensive error handling and retry logic
 */
export class ERPNextClient {
  private config: ERPNextConfig;
  private auth: ERPNextAuth | null = null;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private rateLimitQueue: Array<() => Promise<any>> = [];
  private rateLimitRemaining = 0;
  private rateLimitReset = 0;
  private isOnline = navigator.onLine;
  private lastRequestTime = 0;
  private responseTimes: number[] = [];

  constructor(config: ERPNextConfig) {
    this.config = config;
    this.setupNetworkMonitoring();
  }

  /**
   * Configure authentication credentials
   */
  setAuth(auth: ERPNextAuth): void {
    this.auth = auth;
    this.saveAuthToStorage(auth);
  }

  /**
   * Get current authentication status
   */
  getAuthStatus(): { isAuthenticated: boolean; isExpiringSoon: boolean } {
    if (!this.auth) return { isAuthenticated: false, isExpiringSoon: false };

    const isAuthenticated = !!(this.auth.apiKey && this.auth.apiSecret);
    const isExpiringSoon = this.auth.expiry ? Date.now() > this.auth.expiry - 300000 : false; // 5 min buffer

    return { isAuthenticated, isExpiringSoon };
  }

  /**
   * Check if authentication needs refresh
   */
  needsRefresh(): boolean {
    const status = this.getAuthStatus();
    return status.isAuthenticated && status.isExpiringSoon;
  }

  /**
   * Perform authentication with ERPNext
   */
  async authenticate(): Promise<APIResponse> {
    if (!this.auth?.apiKey || !this.auth?.apiSecret) {
      return {
        success: false,
        error: 'API credentials not configured',
      };
    }

    try {
      console.log('🔐 Authenticating with ERPNext...');

      const response = await this.makeRequest(
        'POST',
        '/api/method/login',
        {
          usr: this.auth.apiKey,
          pwd: this.auth.apiSecret,
        },
        false
      );

      if (response.success && response.data) {
        // Update auth with session ID
        this.auth.sid = response.data.sid;
        this.auth.expiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours

        // Save updated auth
        this.saveAuthToStorage(this.auth);

        console.log('✅ ERPNext authentication successful');
        toast.success('Connected to ERPNext');

        return {
          success: true,
          message: 'Authentication successful',
        };
      }

      throw new Error(response.error ?? 'Authentication failed');
    } catch (error) {
      console.error('❌ ERPNext authentication failed:', error);
      toast.error('ERPNext connection failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshAuth(): Promise<APIResponse> {
    if (!this.auth?.sid) {
      return this.authenticate();
    }

    try {
      console.log('🔄 Refreshing ERPNext authentication...');

      const response = await this.makeRequest(
        'POST',
        '/api/method/login',
        {
          sid: this.auth.sid,
        },
        false
      );

      if (response.success) {
        this.auth.expiry = Date.now() + 23 * 60 * 60 * 1000;
        this.saveAuthToStorage(this.auth);

        console.log('✅ ERPNext authentication refreshed');
        return { success: true, message: 'Token refreshed' };
      }

      throw new Error(response.error ?? 'Token refresh failed');
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      // Clear auth and force re-authentication
      this.clearAuth();
      return this.authenticate();
    }
  }

  /**
   * Get list of items from ERPNext
   */
  async getItems(params?: {
    fields?: string[];
    filters?: any[];
    limit_start?: number;
    limit_page_length?: number;
    order_by?: string;
  }): Promise<APIResponse<ERPNextListResponse<ERPNextItem>>> {
    const queryParams = new URLSearchParams();

    if (params?.fields) {
      queryParams.append('fields', JSON.stringify(params.fields));
    }

    if (params?.filters) {
      queryParams.append('filters', JSON.stringify(params.filters));
    }

    if (params?.limit_start !== undefined) {
      queryParams.append('limit_start', params.limit_start.toString());
    }

    if (params?.limit_page_length !== undefined) {
      queryParams.append('limit_page_length', params.limit_page_length.toString());
    }

    if (params?.order_by) {
      queryParams.append('order_by', params.order_by);
    }

    return this.makeRequest('GET', `/api/resource/Item?${queryParams.toString()}`);
  }

  /**
   * Get single item by code
   */
  async getItem(itemCode: string): Promise<APIResponse<ERPNextItem>> {
    return this.makeRequest('GET', `/api/resource/Item/${encodeURIComponent(itemCode)}`);
  }

  /**
   * Create sales invoice in ERPNext
   */
  async createSalesInvoice(invoice: ERPNextSalesInvoice): Promise<APIResponse<{ name: string }>> {
    return this.makeRequest('POST', '/api/resource/Sales Invoice', invoice);
  }

  /**
   * Get sales invoice by name
   */
  async getSalesInvoice(name: string): Promise<APIResponse<ERPNextSalesInvoice>> {
    return this.makeRequest('GET', `/api/resource/Sales Invoice/${encodeURIComponent(name)}`);
  }

  /**
   * Update sales invoice
   */
  async updateSalesInvoice(
    name: string,
    data: Partial<ERPNextSalesInvoice>
  ): Promise<APIResponse<{ name: string }>> {
    return this.makeRequest('PUT', `/api/resource/Sales Invoice/${encodeURIComponent(name)}`, data);
  }

  /**
   * Submit document (make it active)
   */
  async submitDocument(docType: string, name: string): Promise<APIResponse> {
    return this.makeRequest('POST', `/api/method/frappe.client.submit`, {
      doctype: docType,
      name: name,
    });
  }

  /**
   * Cancel document
   */
  async cancelDocument(docType: string, name: string, reason?: string): Promise<APIResponse> {
    return this.makeRequest('POST', `/api/method/frappe.client.cancel`, {
      doctype: docType,
      name: name,
      reason: reason ?? 'Cancelled via POS',
    });
  }

  /**
   * Health check - test API connectivity
   */
  async healthCheck(): Promise<APIResponse<{ timestamp: string; status: string }>> {
    try {
      const response = await this.makeRequest(
        'GET',
        '/api/method/frappe.utils.scheduler.is_scheduler_disabled'
      );
      return {
        success: response.success,
        data: {
          timestamp: new Date().toISOString(),
          status: response.success ? 'healthy' : 'unhealthy',
        },
        message: response.success ? 'API is responding' : response.error,
      };
    } catch (error) {
      return {
        success: false,
        data: {
          timestamp: new Date().toISOString(),
          status: 'unhealthy',
        },
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  /**
   * Get API status and performance metrics
   */
  getApiStatus(): {
    isOnline: boolean;
    rateLimitRemaining: number;
    rateLimitReset: number;
    queueSize: number;
    lastRequestTime?: number;
    averageResponseTime?: number;
  } {
    return {
      isOnline: this.isOnline,
      rateLimitRemaining: this.rateLimitRemaining,
      rateLimitReset: this.rateLimitReset,
      queueSize: this.requestQueue.length,
      lastRequestTime: this.lastRequestTime,
      averageResponseTime: this.averageResponseTime,
    };
  }

  /**
   * Get average response time
   */
  get averageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup network monitoring
   */
  private setupNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('🌐 Network connection restored');
      toast.success('Network connection restored');
      this.processRequestQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📵 Network connection lost');
      toast.error('Network connection lost - working offline');
    });
  }

  /**
   * Process queued requests when network returns
   */
  private async processRequestQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) return;

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error('Failed to process queued request:', error);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Save auth to localStorage
   */
  private saveAuthToStorage(auth: ERPNextAuth): void {
    try {
      localStorage.setItem(
        'erpnext_auth',
        JSON.stringify({
          ...auth,
          // Don't save sid as it should be session-based
          sid: undefined,
        })
      );
    } catch (error) {
      console.warn('Failed to save auth to storage:', error);
    }
  }

  /**
   * Load auth from localStorage
   */
  loadAuthFromStorage(): ERPNextAuth | null {
    try {
      const stored = localStorage.getItem('erpnext_auth');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to load auth from storage:', error);
      return null;
    }
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.auth = null;
    localStorage.removeItem('erpnext_auth');
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    requireAuth: boolean = true
  ): Promise<APIResponse<T>> {
    const startTime = Date.now();

    // Handle authentication
    if (requireAuth) {
      const authStatus = this.getAuthStatus();
      if (!authStatus.isAuthenticated) {
        const authResult = await this.authenticate();
        if (!authResult.success) {
          return {
            success: false,
            error: 'Authentication required',
          };
        }
      } else if (authStatus.isExpiringSoon) {
        await this.refreshAuth();
      }
    }

    // Build request URL
    const url = `${this.config.baseUrl}${endpoint}`;

    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requireAuth && this.auth) {
      if (this.auth.sid) {
        headers['Cookie'] = `sid=${this.auth.sid}`;
      } else {
        headers['Authorization'] = `token ${this.auth.apiKey}:${this.auth.apiSecret}`;
      }
    }

    // Prepare request body
    const requestBody = data ? JSON.stringify(data) : undefined;

    // Implement retry logic
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(
          `🌐 ${method} ${endpoint} (attempt ${attempt + 1}/${this.config.maxRetries + 1})`
        );

        const response = await fetch(url, {
          method,
          headers,
          body: requestBody,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;

          console.warn(`⏳ Rate limited, waiting ${waitTime}ms...`);
          await this.delay(waitTime);
          continue;
        }

        // Handle network errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          if (response.status === 401) {
            // Authentication error - try to refresh
            console.warn('🔄 Authentication error, attempting refresh...');
            if (attempt === this.config.maxRetries) {
              return {
                success: false,
                error: 'Authentication failed',
                code: 'AUTH_ERROR',
              };
            }

            const refreshResult = await this.refreshAuth();
            if (!refreshResult.success) {
              return {
                success: false,
                error: 'Authentication refresh failed',
                code: 'AUTH_REFRESH_FAILED',
              };
            }
            continue;
          }

          if (response.status >= 500) {
            // Server error - retry
            const error = new Error(`Server error: ${response.status} ${response.statusText}`);
            (error as any).isRetryable = true;
            lastError = error;

            if (attempt < this.config.maxRetries) {
              const delay = this.calculateRetryDelay(attempt);
              console.warn(`⏳ Server error, retrying in ${delay}ms...`);
              await this.delay(delay);
              continue;
            }
          }

          // Non-retryable error
          return {
            success: false,
            error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
            code: errorData.code || `HTTP_${response.status}`,
          };
        }

        // Parse response
        const responseData = await response.json();

        // Track response time
        const responseTime = Date.now() - startTime;
        this.lastRequestTime = Date.now();
        this.responseTimes.push(responseTime);
        if (this.responseTimes.length > 100) {
          this.responseTimes.shift(); // Keep only last 100 measurements
        }

        // Update rate limit info
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');
        if (remaining) this.rateLimitRemaining = parseInt(remaining);
        if (reset) this.rateLimitReset = parseInt(reset);

        console.log(`✅ ${method} ${endpoint} completed in ${responseTime}ms`);

        return {
          success: true,
          data: responseData.data || responseData,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof Error && error.name === 'AbortError') {
          return {
            success: false,
            error: 'Request timeout',
            code: 'TIMEOUT',
          };
        }

        console.error(`❌ Request failed (attempt ${attempt + 1}):`, error);

        if (attempt < this.config.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          await this.delay(delay);
          continue;
        }
      }
    }

    // All retries exhausted
    return {
      success: false,
      error: lastError?.message ?? 'Request failed after all retries',
      code: 'MAX_RETRIES_EXCEEDED',
    };
  }
}
