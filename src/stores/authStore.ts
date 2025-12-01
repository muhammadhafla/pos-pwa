import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, _password: string) => {
        set({ isLoading: true, error: null });

        try {
          // Simulate authentication - in real implementation, this would call ERPNext API
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Mock user for development
          const mockUser: User = {
            id: 'user-001',
            username,
            fullName: 'Demo User',
            role: username === 'admin' ? 'admin' : 'cashier',
            branchId: 'branch-001',
            isActive: true,
            lastLoginAt: new Date(),
            permissions: [
              { resource: 'transactions', actions: ['create', 'read'] },
              { resource: 'items', actions: ['read'] },
              { resource: 'pricing', actions: ['read'] },
            ],
          };

          set({
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
          });


        } catch (error) {
          set({
            error: 'Authentication failed',
            isLoading: false,
          });
          console.error('❌ Authentication error:', error);
        }
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          error: null,
        });

      },

      setUser: (user: User) => {
        set({ user, isAuthenticated: true });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'pos-auth-storage',
      partialize: state => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Hook for checking permissions
export const usePermissions = () => {
  const { user } = useAuthStore();

  return {
    hasPermission: (resource: string, action: string): boolean => {
      if (!user?.permissions) return false;

      const permission = user.permissions.find(p => p.resource === resource);
      return permission?.actions.includes(action) ?? false;
    },

    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isCashier: user?.role === 'cashier',
    isSupervisor: user?.role === 'supervisor',
  };
};
