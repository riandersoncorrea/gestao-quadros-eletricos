import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { getCurrentUser, onAuthStateChange, signOut } from '@/auth/authService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const nextUser = await getCurrentUser();
      if (!active) return;
      setUser(nextUser);
      setIsAuthenticated(!!nextUser);
      setIsLoadingAuth(false);
    };

    refresh();
    const unsubscribe = onAuthStateChange(refresh);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    await signOut();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
