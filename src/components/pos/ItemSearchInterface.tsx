/**
 * Item Search Interface Component
 * Performance target: <200ms search response time
 * Features: Debounced search, virtual scrolling, category/brand filtering
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  CameraIcon,
  XMarkIcon,
  TagIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';
import { Item, AdvancedFilters, Category, Supplier, ItemTag, FilterOptions } from '@/types';
import { categorizationService } from '@/services/database/CategorizationService';
import { barcodeScanner, ScanResult } from '@/services/barcode/BarcodeScannerManager';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'react-hot-toast';

interface ItemSearchInterfaceProps {
  onItemSelect?: (item: Item) => void;
  onScanResult?: (result: ScanResult) => void;
  className?: string;
}

const ItemSearchInterface: React.FC<ItemSearchInterfaceProps> = ({
  onItemSelect,
  onScanResult,
  className = '',
}) => {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AdvancedFilters>({});
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [availableSuppliers, setAvailableSuppliers] = useState<Supplier[]>([]);
  const [availableTags, setAvailableTags] = useState<ItemTag[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<any>(null);

  // Cart store
  const { addItem } = useCartStore();

  // Performance monitoring
  const performanceMonitor = useRef({
    searchCount: 0,
    totalSearchTime: 0,
    lastSearchAt: 0,
  });

  /**
   * Initialize component and load available filters
   */
  useEffect(() => {
    void loadAvailableFilters();
    setupBarcodeScanner();

    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      barcodeScanner.destroy();
    };
  }, []);

  /**
   * Setup barcode scanner event handlers
   */
  const setupBarcodeScanner = useCallback(() => {
    barcodeScanner.onScan((result: ScanResult) => {
      setIsScanning(false);
      setLastScanResult(result);
      onScanResult?.(result);

      if (result.success && result.item) {
        // Auto-add scanned item to cart
        void handleAddToCart(result.item);
        toast.success(`Added ${result.item.name} to cart`);
        console.log(`⚡ Fast scan: ${result.scanTime.toFixed(2)}ms`);
      } else {
        toast.error(`Item not found: ${result.barcode}`);
        console.warn(`❌ Scan failed: ${result.error}`);
      }
    });

    barcodeScanner.onError((error: string) => {
      setIsScanning(false);
      toast.error(`Scanner error: ${error}`);
      console.error('Scanner error:', error);
    });
  }, [onScanResult]);

  /**
   * Load available categories, brands, suppliers, and tags for filtering
   */
  const loadAvailableFilters = async () => {
    try {
      const [categories, filterOptions] = await Promise.all([
        categorizationService.getCategories(),
        categorizationService.getFilterOptions(),
      ]);

      setAvailableCategories(categories);
      setFilterOptions(filterOptions);
      setAvailableBrands(filterOptions.brands);
      setAvailableSuppliers(filterOptions.suppliers);
      setAvailableTags(filterOptions.tags);
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  /**
   * Debounced search function with performance monitoring
   */
  const performSearch = useCallback(async (query: string, currentFilters: AdvancedFilters) => {
    const startTime = performance.now();
    setIsSearching(true);

    try {
      // Use the categorization service for advanced search
      const results = await categorizationService.searchItems(query, currentFilters, 50);

      const searchDuration = performance.now() - startTime;

      // Performance monitoring
      performanceMonitor.current.searchCount++;
      performanceMonitor.current.totalSearchTime += searchDuration;
      performanceMonitor.current.lastSearchAt = Date.now();

      setSearchTime(searchDuration);
      setSearchResults(results);

      // Log performance warnings
      if (searchDuration > 200) {
        console.warn(`⚠️ Slow search detected: ${searchDuration.toFixed(2)}ms for "${query}"`);
      }

      console.log(
        `🔍 Search "${query}": ${results.length} results in ${searchDuration.toFixed(2)}ms`
      );
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  /**
   * Handle search input changes with debouncing
   */
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      // Debounce search for 200ms
      searchTimeoutRef.current = setTimeout(() => {
        void performSearch(value, filters);
      }, 200);
    },
    [performSearch, filters]
  );

  /**
   * Handle barcode scan trigger
   */
  const handleBarcodeScan = useCallback(() => {
    setIsScanning(true);
    toast('Ready to scan... Point barcode at scanner', { icon: '📷' });
  }, []);

  /**
   * Add item to cart and notify parent
   */
  const handleAddToCart = useCallback(
    (item: Item) => {
      try {
        addItem(item, 1);
        onItemSelect?.(item);
        setSelectedItem(item);

        // Clear selection after a short delay
        setTimeout(() => setSelectedItem(null), 1000);
      } catch (error) {
        console.error('Failed to add item to cart:', error);
        toast.error('Failed to add item to cart');
      }
    },
    [addItem, onItemSelect]
  );

  /**
   * Handle item selection from search results
   */
  const handleItemSelect = useCallback(
    (item: Item) => {
      void handleAddToCart(item);
    },
    [handleAddToCart]
  );

  /**
   * Clear all filters
   */
  const clearFilters = useCallback(() => {
    setFilters({});
    if (searchQuery) {
      void performSearch(searchQuery, {});
    }
  }, [searchQuery, performSearch]);

  /**
   * Render individual item in virtual list
   */
  const renderItem = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const item = searchResults[index];
      if (!item) return null;

      const isSelected = selectedItem?.id === item.id;

      return (
        <div
          style={style}
          className={`
          flex items-center justify-between p-3 border-b border-gray-100 cursor-pointer
          hover:bg-blue-50 transition-colors duration-150
          ${isSelected ? 'bg-green-50 border-green-200' : ''}
        `}
          onClick={() => handleItemSelect(item)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span className="truncate">{item.category}</span>
                  {item.brand && (
                    <>
                      <span>•</span>
                      <span className="truncate">{item.brand}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4 ml-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">${item.basePrice.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{item.unit}</p>
            </div>

            <button
              onClick={e => {
                e.stopPropagation();
                void handleAddToCart(item);
              }}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      );
    },
    [searchResults, selectedItem, handleItemSelect, handleAddToCart]
  );

  /**
   * Get performance metrics for display
   */
  const getPerformanceMetrics = useCallback(() => {
    const { searchCount, totalSearchTime } = performanceMonitor.current;
    const avgSearchTime = searchCount > 0 ? totalSearchTime / searchCount : 0;

    return {
      averageSearchTime: avgSearchTime,
      totalSearches: searchCount,
      lastSearchDuration: searchTime,
    };
  }, [searchTime]);

  const metrics = getPerformanceMetrics();

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Item Search</h2>

          {/* Scanner Status */}
          <div className="flex items-center space-x-2">
            <div
              className={`
              w-2 h-2 rounded-full
              ${
                isScanning
                  ? 'bg-yellow-400 animate-pulse'
                  : lastScanResult?.success
                  ? 'bg-green-400'
                  : 'bg-gray-300'
              }
            `}
            />
            <span className="text-xs text-gray-500">{isScanning ? 'Scanning...' : 'Ready'}</span>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>

          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search items by name, barcode, or brand..."
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            className="block w-full pl-10 pr-20 py-3 border border-gray-300 rounded-lg 
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                       text-sm placeholder-gray-500"
          />

          <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`
                p-1 rounded hover:bg-gray-100 transition-colors
                ${showFilters ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}
              `}
              title="Toggle filters"
            >
              <FunnelIcon className="h-4 w-4" />
            </button>

            {/* Scanner Button */}
            <button
              onClick={handleBarcodeScan}
              disabled={isScanning}
              className={`
                p-1 rounded hover:bg-gray-100 transition-colors
                ${isScanning ? 'text-yellow-600' : 'text-gray-400'}
              `}
              title="Scan barcode"
            >
              <CameraIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search Performance Indicator */}
        {searchQuery && (
          <div className="flex items-center justify-between mt-2 text-xs">
            <span
              className={`
              ${searchTime > 200 ? 'text-yellow-600' : 'text-green-600'}
            `}
            >
              Found {searchResults.length} items in {searchTime.toFixed(0)}ms
            </span>

            <span className="text-gray-500">Avg: {metrics.averageSearchTime.toFixed(0)}ms</span>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">Filters</h3>
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800">
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Category Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <BuildingStorefrontIcon className="inline h-3 w-3 mr-1" />
                Category
              </label>
              <select
                value={filters.categories?.[0] ?? ''}
                onChange={e =>
                  setFilters({
                    ...filters,
                    categories: e.target.value ? [e.target.value] : undefined,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="">All Categories</option>
                {availableCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {'--'.repeat(category.level)}
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Brand Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
              <select
                value={filters.brands?.[0] ?? ''}
                onChange={e =>
                  setFilters({
                    ...filters,
                    brands: e.target.value ? [e.target.value] : undefined,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="">All Brands</option>
                {availableBrands.map(brand => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
              <select
                value={filters.suppliers?.[0] ?? ''}
                onChange={e =>
                  setFilters({
                    ...filters,
                    suppliers: e.target.value ? [e.target.value] : undefined,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="">All Suppliers</option>
                {availableSuppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                <TagIcon className="inline h-3 w-3 mr-1" />
                Tags
              </label>
              <select
                value={filters.tags?.[0] ?? ''}
                onChange={e =>
                  setFilters({
                    ...filters,
                    tags: e.target.value ? [e.target.value] : undefined,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="">All Tags</option>
                {availableTags.map(tag => (
                  <option key={tag.id} value={tag.id}>
                    <span
                      className="inline-block w-3 h-3 rounded mr-2"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Advanced Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
            {/* Price Range */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Price Range</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.priceRange?.min ?? ''}
                  onChange={e =>
                    setFilters({
                      ...filters,
                      priceRange: {
                        min: Number(e.target.value) || 0,
                        max: filters.priceRange?.max ?? 999999,
                      },
                    })
                  }
                  className="w-16 text-xs border border-gray-300 rounded px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.priceRange?.max ?? ''}
                  onChange={e =>
                    setFilters({
                      ...filters,
                      priceRange: {
                        min: filters.priceRange?.min ?? 0,
                        max: Number(e.target.value) || 999999,
                      },
                    })
                  }
                  className="w-16 text-xs border border-gray-300 rounded px-2 py-1"
                />
              </div>
            </div>

            {/* Stock Status */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stock Status</label>
              <select
                value={filters.stockStatus ?? 'all'}
                onChange={e =>
                  setFilters({
                    ...filters,
                    stockStatus: e.target.value as any,
                  })
                }
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value="all">All Items</option>
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock</option>
                <option value="out-of-stock">Out of Stock</option>
              </select>
            </div>

            {/* Additional Options */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Options</label>
              <div className="space-y-1">
                <label className="flex items-center text-xs">
                  <input
                    type="checkbox"
                    checked={filters.hasBarcode ?? false}
                    onChange={e =>
                      setFilters({
                        ...filters,
                        hasBarcode: e.target.checked || undefined,
                      })
                    }
                    className="mr-2"
                  />
                  Has Barcode
                </label>
                <label className="flex items-center text-xs">
                  <input
                    type="checkbox"
                    checked={filters.isActive !== false}
                    onChange={e =>
                      setFilters({
                        ...filters,
                        isActive: e.target.checked || undefined,
                      })
                    }
                    className="mr-2"
                  />
                  Active Items Only
                </label>
              </div>
            </div>
          </div>

          {/* Filter Statistics */}
          {filterOptions && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                <div>
                  <span className="font-medium">Categories:</span> {filterOptions.categories.length}
                </div>
                <div>
                  <span className="font-medium">Brands:</span> {filterOptions.brands.length}
                </div>
                <div>
                  <span className="font-medium">Suppliers:</span> {filterOptions.suppliers.length}
                </div>
                <div>
                  <span className="font-medium">Tags:</span> {filterOptions.tags.length}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-600 mt-2">
                <div>
                  <span className="font-medium">In Stock:</span> {filterOptions.stockCounts.inStock}
                </div>
                <div>
                  <span className="font-medium">Low Stock:</span>{' '}
                  {filterOptions.stockCounts.lowStock}
                </div>
                <div>
                  <span className="font-medium">Out of Stock:</span>{' '}
                  {filterOptions.stockCounts.outOfStock}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isSearching && (
        <div className="p-8 text-center">
          <div className="inline-flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-500">Searching...</span>
          </div>
        </div>
      )}

      {/* Search Results */}
      {!isSearching && (
        <div className="h-96">
          {searchResults.length > 0 ? (
            <List
              ref={listRef}
              height={384}
              itemCount={searchResults.length}
              itemSize={72}
              width="100%"
            >
              {renderItem}
            </List>
          ) : searchQuery ? (
            <div className="p-8 text-center text-gray-500">
              <MagnifyingGlassIcon className="mx-auto h-8 w-8 mb-3 text-gray-300" />
              <p className="text-sm">No items found for "{searchQuery}"</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <MagnifyingGlassIcon className="mx-auto h-8 w-8 mb-3 text-gray-300" />
              <p className="text-sm">Start typing to search items</p>
              <p className="text-xs mt-1">Or use your barcode scanner to add items quickly</p>
            </div>
          )}
        </div>
      )}

      {/* Last Scan Result */}
      {lastScanResult && (
        <div
          className={`
          p-3 border-t text-xs
          ${
            lastScanResult.success
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }
        `}
        >
          <div className="flex items-center justify-between">
            <span>
              Last scan: {lastScanResult.barcode}({lastScanResult.success ? 'found' : 'not found'})
              - {lastScanResult.scanTime.toFixed(0)}ms
            </span>
            <button
              onClick={() => setLastScanResult(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemSearchInterface;
