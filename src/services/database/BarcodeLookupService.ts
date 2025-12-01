/**
 * O(1) Barcode Lookup Service - Phase 2
 * Optimized constant-time barcode lookup with caching strategies
 * Performance target: <50ms per lookup
 */

import { Item } from '@/types';
import { db } from './POSDatabase';

export interface BarcodeCache {
  barcode: string;
  item: Item;
  timestamp: number;
  accessCount: number;
}

export interface BarcodeLookupResult {
  item: Item | null;
  lookupTime: number;
  source: 'cache' | 'database' | 'error';
  cacheHit: boolean;
}

export class BarcodeLookupService {
  private static instance: BarcodeLookupService;
  private cache = new Map<string, BarcodeCache>();
  private maxCacheSize = 10000; // Max cached barcodes
  private maxCacheAge = 30 * 60 * 1000; // 30 minutes in milliseconds
  private cacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  // Memory-efficient barcode index using Map for O(1) lookup
  private barcodeIndex = new Map<string, string>(); // barcode -> itemId

  constructor() {
    this.initializeIndexes();
    this.startCacheMaintenance();
  }

  static getInstance(): BarcodeLookupService {
    if (!BarcodeLookupService.instance) {
      BarcodeLookupService.instance = new BarcodeLookupService();
    }
    return BarcodeLookupService.instance;
  }

  /**
   * Initialize barcode index from database
   */
  private async initializeIndexes(): Promise<void> {
    try {
      console.log('🔍 Initializing barcode lookup indexes...');
      const startTime = performance.now();

      // Load all items and build barcode index
      const items = await db.items.where('isActive').equals(1).toArray();

      for (const item of items) {
        // Index primary barcode
        if (item.barcode) {
          this.barcodeIndex.set(item.barcode, item.id);
        }

        // Index additional barcodes
        if (item.additionalBarcodes) {
          for (const additionalBarcode of item.additionalBarcodes) {
            this.barcodeIndex.set(additionalBarcode, item.id);
          }
        }
      }

      const initTime = performance.now() - startTime;
      console.log(
        `✅ Barcode indexes initialized: ${items.length} items, ${
          this.barcodeIndex.size
        } barcodes (${initTime.toFixed(2)}ms)`
      );
    } catch (error) {
      console.error('❌ Failed to initialize barcode indexes:', error);
    }
  }

  /**
   * O(1) barcode lookup with cache optimization
   */
  async lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
    const startTime = performance.now();

    try {
      // Input validation
      if (!barcode || typeof barcode !== 'string') {
        return {
          item: null,
          lookupTime: performance.now() - startTime,
          source: 'error',
          cacheHit: false,
        };
      }

      // Sanitize barcode
      const cleanBarcode = barcode.trim();

      // Check cache first (O(1))
      const cachedItem = this.getFromCache(cleanBarcode);
      if (cachedItem) {
        this.cacheStats.hits++;
        return {
          item: cachedItem,
          lookupTime: performance.now() - startTime,
          source: 'cache',
          cacheHit: true,
        };
      }

      // Database lookup using primary barcode index
      const item = await this.lookupInDatabase(cleanBarcode);

      if (item) {
        // Add to cache for future lookups
        this.addToCache(cleanBarcode, item);
        this.cacheStats.hits++;

        return {
          item,
          lookupTime: performance.now() - startTime,
          source: 'database',
          cacheHit: false,
        };
      } else {
        this.cacheStats.misses++;
        return {
          item: null,
          lookupTime: performance.now() - startTime,
          source: 'error',
          cacheHit: false,
        };
      }
    } catch (error) {
      console.error('❌ Barcode lookup failed:', error);
      this.cacheStats.errors++;
      return {
        item: null,
        lookupTime: performance.now() - startTime,
        source: 'error',
        cacheHit: false,
      };
    }
  }

  /**
   * Database lookup using optimized indexes
   */
  private async lookupInDatabase(barcode: string): Promise<Item | null> {
    const startTime = performance.now();

    try {
      // First attempt: Direct barcode lookup using primary barcode index
      let item = await db.items.where('barcode').equals(barcode).first();

      if (item) {
        const lookupTime = performance.now() - startTime;
        console.log(`⚡ Direct barcode lookup: ${lookupTime.toFixed(2)}ms`);
        return item;
      }

      // Second attempt: Check additional barcodes using composite index
      item = await db.items.where('additionalBarcodes').anyOf([barcode]).first();

      if (item) {
        const lookupTime = performance.now() - startTime;
        console.log(`⚡ Additional barcode lookup: ${lookupTime.toFixed(2)}ms`);
        return item;
      }

      // Third attempt: Use barcode index map for cross-reference
      const itemId = this.barcodeIndex.get(barcode);
      if (itemId) {
        item = await db.items.get(itemId);

        if (item) {
          const lookupTime = performance.now() - startTime;
          console.log(`⚡ Indexed barcode lookup: ${lookupTime.toFixed(2)}ms`);
          return item;
        }
      }

      return null;
    } catch (error) {
      console.error('Database lookup failed:', error);
      return null;
    }
  }

  /**
   * Get item from cache with LRU update
   */
  private getFromCache(barcode: string): Item | null {
    const cached = this.cache.get(barcode);

    if (!cached) {
      return null;
    }

    // Check if cache entry is still valid
    const now = Date.now();
    if (now - cached.timestamp > this.maxCacheAge) {
      this.cache.delete(barcode);
      return null;
    }

    // Update access statistics
    cached.accessCount++;
    cached.timestamp = now;

    return cached.item;
  }

  /**
   * Add item to cache with size management
   */
  private addToCache(barcode: string, item: Item): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(barcode, {
      barcode,
      item,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(): void {
    // Find the least recently used item
    let oldestBarcode = '';
    let oldestTimestamp = Date.now();

    for (const [barcode, cached] of this.cache.entries()) {
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
        oldestBarcode = barcode;
      }
    }

    if (oldestBarcode) {
      this.cache.delete(oldestBarcode);
    }
  }

  /**
   * Validate barcode format
   */
  static validateBarcode(barcode: string): {
    isValid: boolean;
    format: string;
    issues: string[];
  } {
    const issues: string[] = [];
    const cleanBarcode = barcode.trim();

    // Check if barcode is empty
    if (!cleanBarcode) {
      issues.push('Barcode is empty');
    }

    // Check length (typical barcodes: 8-18 characters)
    if (cleanBarcode.length < 8) {
      issues.push('Barcode too short (minimum 8 characters)');
    }
    if (cleanBarcode.length > 18) {
      issues.push('Barcode too long (maximum 18 characters)');
    }

    // Check for invalid characters (allow alphanumeric and some special chars)
    const validPattern = /^[A-Za-z0-9\s\-\_\+\/\.]+$/;
    if (!validPattern.test(cleanBarcode)) {
      issues.push('Barcode contains invalid characters');
    }

    // Check for common barcode types
    let format = 'Unknown';
    if (/^\d{8}$/.test(cleanBarcode)) {
      format = 'EAN-8';
    } else if (/^\d{12,13}$/.test(cleanBarcode)) {
      format = 'EAN-13 / UPC-A';
    } else if (/^\d{14}$/.test(cleanBarcode)) {
      format = 'ITF-14';
    } else if (/^[A-Za-z0-9]{6,20}$/.test(cleanBarcode)) {
      format = 'Code 128 / Code 39';
    }

    return {
      isValid: issues.length === 0,
      format,
      issues,
    };
  }

  /**
   * Bulk barcode lookup for performance testing
   */
  async bulkLookup(barcodes: string[]): Promise<BarcodeLookupResult[]> {
    console.log(`🚀 Starting bulk lookup for ${barcodes.length} barcodes...`);
    const startTime = performance.now();

    const results = await Promise.all(
      barcodes.map(async barcode => await this.lookupBarcode(barcode))
    );

    const totalTime = performance.now() - startTime;
    const avgTime = totalTime / barcodes.length;

    console.log(
      `✅ Bulk lookup completed: ${totalTime.toFixed(2)}ms total, ${avgTime.toFixed(2)}ms average`
    );

    return results;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): {
    cacheSize: number;
    maxCacheSize: number;
    hitRate: number;
    stats: { hits: number; misses: number; errors: number };
    avgLookupTime: number;
  } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    const hitRate = total > 0 ? (this.cacheStats.hits / total) * 100 : 0;

    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      hitRate,
      stats: { ...this.cacheStats },
      avgLookupTime: total > 0 ? (this.cacheStats.hits + this.cacheStats.misses) / total : 0,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheStats = { hits: 0, misses: 0, errors: 0 };
    console.log('🗑️ Barcode cache cleared');
  }

  /**
   * Refresh indexes from database
   */
  async refreshIndexes(): Promise<void> {
    console.log('🔄 Refreshing barcode indexes...');
    this.clearCache();
    await this.initializeIndexes();
  }

  /**
   * Start periodic cache maintenance
   */
  private startCacheMaintenance(): void {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];

      for (const [barcode, cached] of this.cache.entries()) {
        if (now - cached.timestamp > this.maxCacheAge) {
          expired.push(barcode);
        }
      }

      expired.forEach(barcode => this.cache.delete(barcode));

      if (expired.length > 0) {
        console.log(`🧹 Cleaned up ${expired.length} expired cache entries`);
      }
    }, 5 * 60 * 1000);
  }
}

// Export singleton instance
export const barcodeLookup = BarcodeLookupService.getInstance();
