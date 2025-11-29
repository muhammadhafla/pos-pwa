import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem, Item } from '@/types';
import { db } from '@/services/database/POSDatabase';

interface CartState {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  heldCarts: string[];
  currentCartId: string | null;
  
  // Actions
  addItem: (item: Item, quantity?: number) => Promise<void>;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updatePrice: (itemId: string, newPrice: number, reason?: string) => Promise<void>;
  clearCart: () => void;
  applyDiscount: (discount: number, reason?: string) => void;
  
  // Cart hold operations
  holdCart: (cartId: string) => Promise<void>;
  recallCart: (cartId: string) => Promise<void>;
  getHeldCarts: () => Promise<any[]>;
  deleteHeldCart: (cartId: string) => Promise<void>;
  
  // Price calculation
  calculateTotals: () => void;
  getCartMetrics: () => CartMetrics;
}

interface CartMetrics {
  totalItems: number;
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  averageItemPrice: number;
}

const TAX_RATE = 0.10; // 10% tax rate - should be configurable

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      totalItems: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
      discount: 0,
      heldCarts: [],
      currentCartId: null,

      addItem: async (item: Item, quantity = 1) => {
        const { items, calculateTotals } = get();
        const existingItem = items.find(cartItem => cartItem.itemId === item.id);
        
        if (existingItem) {
          // Update quantity of existing item
          const updatedItems = items.map(cartItem =>
            cartItem.itemId === item.id
              ? { ...cartItem, quantity: cartItem.quantity + quantity }
              : cartItem
          );
          set({ items: updatedItems });
        } else {
          // Add new item to cart
          const newCartItem: CartItem = {
            id: `cart-${Date.now()}-${item.id}`,
            itemId: item.id,
            itemName: item.name,
            barcode: item.barcode,
            quantity,
            unitPrice: item.basePrice,
            totalPrice: item.basePrice * quantity,
            discount: 0,
            taxRate: TAX_RATE,
            taxAmount: (item.basePrice * quantity) * TAX_RATE,
            finalPrice: item.basePrice * quantity
          };
          set({ items: [...items, newCartItem] });
        }
        
        calculateTotals();
      },

      removeItem: (itemId: string) => {
        const { items, calculateTotals } = get();
        const updatedItems = items.filter(item => item.itemId !== itemId);
        set({ items: updatedItems });
        calculateTotals();
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        
        const { items, calculateTotals } = get();
        const updatedItems = items.map(item =>
          item.itemId === itemId
            ? {
                ...item,
                quantity,
                totalPrice: item.unitPrice * quantity,
                taxAmount: (item.unitPrice * quantity) * item.taxRate,
                finalPrice: (item.unitPrice * quantity) - item.discount
              }
            : item
        );
        set({ items: updatedItems });
        calculateTotals();
      },

      updatePrice: async (itemId: string, newPrice: number, reason?: string) => {
        const { items, calculateTotals } = get();
        const item = items.find(i => i.itemId === itemId);
        
        if (!item) return;
        
        // Log price override if reason provided
        if (reason) {
          try {
            // This would log to audit trail in real implementation
            console.log(`💰 Price override: ${item.itemName} - $${item.unitPrice} -> $${newPrice} (${reason})`);
          } catch (error) {
            console.error('Failed to log price override:', error);
          }
        }
        
        const updatedItems = items.map(cartItem =>
          cartItem.itemId === itemId
            ? {
                ...cartItem,
                unitPrice: newPrice,
                totalPrice: newPrice * cartItem.quantity,
                taxAmount: (newPrice * cartItem.quantity) * cartItem.taxRate,
                finalPrice: (newPrice * cartItem.quantity) - cartItem.discount
              }
            : cartItem
        );
        
        set({ items: updatedItems });
        calculateTotals();
      },

      clearCart: () => {
        set({
          items: [],
          totalItems: 0,
          subtotal: 0,
          tax: 0,
          total: 0,
          discount: 0
        });
      },

      applyDiscount: (discountAmount: number, reason?: string) => {
        const { items, calculateTotals } = get();
        
        if (reason) {
          console.log(`💸 Discount applied: $${discountAmount} (${reason})`);
        }
        
        // Apply discount proportionally to all items
        const totalBeforeDiscount = items.reduce((sum, item) => sum + item.totalPrice, 0);
        const discountPercentage = discountAmount / totalBeforeDiscount;
        
        const updatedItems = items.map(item => {
          const itemDiscount = item.totalPrice * discountPercentage;
          return {
            ...item,
            discount: item.discount + itemDiscount,
            finalPrice: item.totalPrice - item.discount - itemDiscount
          };
        });
        
        set({ items: updatedItems, discount: discountAmount });
        calculateTotals();
      },

      holdCart: async (cartId: string) => {
        const { items, total } = get();
        
        try {
          await db.addToCartHold(cartId, items, total);
          const heldCarts = await get().getHeldCarts();
          
          set({
            items: [],
            totalItems: 0,
            subtotal: 0,
            tax: 0,
            total: 0,
            discount: 0,
            heldCarts: heldCarts.map(cart => cart.id),
            currentCartId: null
          });
          
          console.log(`📦 Cart ${cartId} held successfully`);
        } catch (error) {
          console.error('Failed to hold cart:', error);
          throw error;
        }
      },

      recallCart: async (cartId: string) => {
        try {
          const cartHold = await db.getCartHold(cartId);
          
          if (cartHold) {
            set({
              items: cartHold.items,
              currentCartId: cartId,
              totalItems: cartHold.items.reduce((sum, item) => sum + item.quantity, 0),
              subtotal: cartHold.items.reduce((sum, item) => sum + item.totalPrice, 0),
              tax: cartHold.items.reduce((sum, item) => sum + item.taxAmount, 0),
              total: cartHold.totalAmount,
              discount: cartHold.items.reduce((sum, item) => sum + item.discount, 0)
            });
            
            console.log(`📋 Cart ${cartId} recalled successfully`);
          }
        } catch (error) {
          console.error('Failed to recall cart:', error);
          throw error;
        }
      },

      getHeldCarts: async () => {
        try {
          return await db.getAllCartHolds();
        } catch (error) {
          console.error('Failed to get held carts:', error);
          return [];
        }
      },

      deleteHeldCart: async (cartId: string) => {
        try {
          await db.deleteCartHold(cartId);
          const heldCarts = await get().getHeldCarts();
          
          set({
            heldCarts: heldCarts.map(cart => cart.id)
          });
          
          console.log(`🗑️ Held cart ${cartId} deleted successfully`);
        } catch (error) {
          console.error('Failed to delete held cart:', error);
          throw error;
        }
      },

      calculateTotals: () => {
        const { items } = get();
        
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
        const discount = items.reduce((sum, item) => sum + item.discount, 0);
        const tax = items.reduce((sum, item) => sum + item.taxAmount, 0);
        const total = subtotal + tax - discount;
        
        set({
          totalItems,
          subtotal,
          discount,
          tax,
          total
        });
      },

      getCartMetrics: () => {
        const { items, totalItems, subtotal, tax, total, discount } = get();
        
        return {
          totalItems,
          subtotal,
          tax,
          total,
          discount,
          averageItemPrice: totalItems > 0 ? subtotal / totalItems : 0
        };
      }
    }),
    {
      name: 'pos-cart-storage',
      partialize: (state) => ({
        heldCarts: state.heldCarts,
        currentCartId: state.currentCartId
      })
    }
  )
);