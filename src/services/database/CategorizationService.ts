/**
 * Categorization Service
 * Manages hierarchical categories, suppliers, tags, and advanced filtering
 */

import { db } from './POSDatabase';
import { 
  Category, 
  Supplier, 
  ItemTag, 
  Item, 
  AdvancedFilters, 
  FilterOptions 
} from '@/types';

export class CategorizationService {
  
  /**
   * Get all categories with hierarchical structure
   */
  async getCategories(): Promise<Category[]> {
    try {
      return await db.getCategoryTree();
    } catch (error) {
      console.error('Failed to get categories:', error);
      throw error;
    }
  }

  /**
   * Create a new category
   */
  async createCategory(category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = new Date();
      const newCategory: Category = {
        id: crypto.randomUUID(),
        ...category,
        createdAt: now,
        updatedAt: now
      };

      await db.categories.add(newCategory);
      return newCategory.id;
    } catch (error) {
      console.error('Failed to create category:', error);
      throw error;
    }
  }

  /**
   * Update an existing category
   */
  async updateCategory(id: string, updates: Partial<Category>): Promise<void> {
    try {
      const existing = await db.categories.get(id);
      if (!existing) {
        throw new Error('Category not found');
      }

      await db.categories.update(id, {
        ...updates,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Failed to update category:', error);
      throw error;
    }
  }

  /**
   * Delete a category (soft delete by setting isActive to false)
   */
  async deleteCategory(id: string): Promise<void> {
    try {
      // Check if category has items
      const itemCount = await db.items.where('category').equals(id).count();
      if (itemCount > 0) {
        throw new Error('Cannot delete category with existing items');
      }

      // Check if category has children
      const childCount = await db.categories.where('parentId').equals(id).count();
      if (childCount > 0) {
        throw new Error('Cannot delete category with child categories');
      }

      await db.categories.update(id, {
        isActive: false,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Failed to delete category:', error);
      throw error;
    }
  }

  /**
   * Get all suppliers
   */
  async getSuppliers(): Promise<Supplier[]> {
    try {
      return await db.suppliers
        .where('isActive')
        .equals(1)
        .sortBy('name');
    } catch (error) {
      console.error('Failed to get suppliers:', error);
      throw error;
    }
  }

  /**
   * Create a new supplier
   */
  async createSupplier(supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = new Date();
      const newSupplier: Supplier = {
        id: crypto.randomUUID(),
        ...supplier,
        createdAt: now,
        updatedAt: now
      };

      await db.suppliers.add(newSupplier);
      return newSupplier.id;
    } catch (error) {
      console.error('Failed to create supplier:', error);
      throw error;
    }
  }

  /**
   * Get all item tags
   */
  async getTags(): Promise<ItemTag[]> {
    try {
      return await db.itemTags.orderBy('name').toArray();
    } catch (error) {
      console.error('Failed to get tags:', error);
      throw error;
    }
  }

  /**
   * Create a new tag
   */
  async createTag(tag: Omit<ItemTag, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const now = new Date();
      const newTag: ItemTag = {
        id: crypto.randomUUID(),
        ...tag,
        createdAt: now,
        updatedAt: now
      };

      await db.itemTags.add(newTag);
      return newTag.id;
    } catch (error) {
      console.error('Failed to create tag:', error);
      throw error;
    }
  }

  /**
   * Search items with advanced filtering
   */
  async searchItems(
    query: string, 
    filters: AdvancedFilters, 
    limit = 50
  ): Promise<Item[]> {
    try {
      return await db.searchItemsAdvanced(query, filters, limit);
    } catch (error) {
      console.error('Failed to search items with filters:', error);
      throw error;
    }
  }

  /**
   * Get all filter options for the current catalog
   */
  async getFilterOptions(): Promise<FilterOptions> {
    try {
      return await db.getFilterOptions();
    } catch (error) {
      console.error('Failed to get filter options:', error);
      throw error;
    }
  }

  /**
   * Get category path (breadcrumb) for a category
   */
  async getCategoryPath(categoryId: string): Promise<Category[]> {
    try {
      const path: Category[] = [];
      let currentCategory = await db.categories.get(categoryId);

      while (currentCategory) {
        path.unshift(currentCategory);
        if (currentCategory.parentId) {
          currentCategory = await db.categories.get(currentCategory.parentId);
        } else {
          break;
        }
      }

      return path;
    } catch (error) {
      console.error('Failed to get category path:', error);
      throw error;
    }
  }

  /**
   * Get items by category (including subcategories)
   */
  async getItemsByCategory(categoryId: string): Promise<Item[]> {
    try {
      // Get all subcategory IDs
      const subcategoryIds = await this.getSubcategoryIds(categoryId);
      const allCategoryIds = [categoryId, ...subcategoryIds];

      return await db.items
        .where('category')
        .anyOf(allCategoryIds)
        .and(item => item.isActive)
        .toArray();
    } catch (error) {
      console.error('Failed to get items by category:', error);
      throw error;
    }
  }

  /**
   * Get all subcategory IDs for a given category
   */
  private async getSubcategoryIds(categoryId: string): Promise<string[]> {
    try {
      const children = await db.categories
        .where('parentId')
        .equals(categoryId)
        .and(category => category.isActive)
        .toArray();

      const subcategoryIds: string[] = [];
      
      for (const child of children) {
        subcategoryIds.push(child.id);
        const grandchildren = await this.getSubcategoryIds(child.id);
        subcategoryIds.push(...grandchildren);
      }

      return subcategoryIds;
    } catch (error) {
      console.error('Failed to get subcategory IDs:', error);
      throw error;
    }
  }

  /**
   * Get brand statistics
   */
  async getBrandStatistics(): Promise<Array<{
    brand: string;
    itemCount: number;
    averagePrice: number;
  }>> {
    try {
      const items = await db.items
        .where('isActive')
        .equals(1)
        .and(item => !!item.brand && item.brand!.trim() !== '')
        .toArray();

      const brandStats = items.reduce((acc, item) => {
        if (!item.brand) return acc;

        if (!acc[item.brand]) {
          acc[item.brand] = {
            brand: item.brand,
            itemCount: 0,
            totalPrice: 0
          };
        }

        acc[item.brand].itemCount++;
        acc[item.brand].totalPrice += item.basePrice;

        return acc;
      }, {} as Record<string, { brand: string; itemCount: number; totalPrice: number }>);

      return Object.values(brandStats).map(stat => ({
        brand: stat.brand,
        itemCount: stat.itemCount,
        averagePrice: stat.totalPrice / stat.itemCount
      }));
    } catch (error) {
      console.error('Failed to get brand statistics:', error);
      throw error;
    }
  }

  /**
   * Get supplier statistics
   */
  async getSupplierStatistics(): Promise<Array<{
    supplier: Supplier;
    itemCount: number;
    averagePrice: number;
    totalValue: number;
  }>> {
    try {
      const [suppliers, items] = await Promise.all([
        this.getSuppliers(),
        db.items
          .where('isActive')
          .equals(1)
          .and(item => !!item.supplierId)
          .toArray()
      ]);

      return suppliers.map(supplier => {
        const supplierItems = items.filter(item => item.supplierId === supplier.id);
        const totalValue = supplierItems.reduce((sum, item) => sum + item.basePrice, 0);

        return {
          supplier,
          itemCount: supplierItems.length,
          averagePrice: supplierItems.length > 0 ? totalValue / supplierItems.length : 0,
          totalValue
        };
      });
    } catch (error) {
      console.error('Failed to get supplier statistics:', error);
      throw error;
    }
  }

  /**
   * Initialize default categories and tags
   */
  async initializeDefaultData(): Promise<void> {
    try {
      // Create default categories if none exist
      const categoryCount = await db.categories.count();
      if (categoryCount === 0) {
        const defaultCategories = [
          { name: 'Food & Beverage', level: 0, displayOrder: 1, isActive: true },
          { name: 'Personal Care', level: 0, displayOrder: 2, isActive: true },
          { name: 'Household', level: 0, displayOrder: 3, isActive: true },
          { name: 'Electronics', level: 0, displayOrder: 4, isActive: true }
        ];

        for (const categoryData of defaultCategories) {
          await this.createCategory(categoryData);
        }
      }

      // Create default tags if none exist
      const tagCount = await db.itemTags.count();
      if (tagCount === 0) {
        const defaultTags = [
          { name: 'Popular', color: '#10B981', category: 'Popularity' },
          { name: 'New Arrival', color: '#3B82F6', category: 'Status' },
          { name: 'Sale', color: '#EF4444', category: 'Pricing' },
          { name: 'Organic', color: '#059669', category: 'Quality' },
          { name: 'Local', color: '#F59E0B', category: 'Origin' }
        ];

        for (const tagData of defaultTags) {
          await this.createTag(tagData);
        }
      }

      console.log('✅ Default categorization data initialized');
    } catch (error) {
      console.error('Failed to initialize default data:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const categorizationService = new CategorizationService();