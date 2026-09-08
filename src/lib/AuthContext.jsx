import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

async function buildUser(authUser) {
  if (!authUser) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single();

  if (error) {
    // Network hiccups or a slow request land here too, not just a missing
    // row — falling back to 'viewer' silently would make a real admin look
    // downgraded with no trace of why. Logging keeps that diagnosable.
    console.error('Failed to load profile role, defaulting to viewer:', error);
  }

  return {
    id: authUser.id,
    email: authUser.email,
    full_name: authUser.user_metadata?.full_name || '',
    role: profile?.role || 'viewer',
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const nextUser = await buildUser(session?.user ?? null);
      if (!active) return;
      setUser(nextUser);
      setIsAuthenticated(!!nextUser);
      setIsLoadingAuth(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = await buildUser(session?.user ?? null);
      if (!active) return;
      setUser(nextUser);
      setIsAuthenticated(!!nextUser);
      setIsLoadingAuth(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
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
