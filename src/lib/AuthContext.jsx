import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { getCurrentUser, onAuthStateChange, signOut } from '@/auth/authService';

const AuthContext = createContext();

/**
 * Compara os campos de `user` que a aplicação de fato consome (ver
 * getCurrentUser em src/auth/authService.js). O Supabase Auth reemite
 * eventos (ex.: `SIGNED_IN`) sempre que a aba volta a ficar visível —
 * comum em Android ao voltar da câmera/outro app — mesmo quando a sessão
 * e o perfil não mudaram nada. Comparar por campo (em vez de por
 * referência do objeto) evita um `setUser` redundante nesses casos, que é
 * o que permite ao `value` do contexto (useMemo abaixo) permanecer
 * estável e não re-renderizar toda a árvore autenticada.
 */
function sameUser(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.full_name === b.full_name &&
    a.avatar_url === b.avatar_url &&
    a.role === b.role &&
    a.approved === b.approved
  );
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const refreshUser = useCallback(async () => {
    const nextUser = await getCurrentUser();
    // Forma funcional: pega o `user` mais atual no momento da atualização,
    // não o capturado no fechamento (importante no listener abaixo, cujo
    // `refresh` só é criado uma vez no mount).
    setUser((prev) => (sameUser(prev, nextUser) ? prev : nextUser));
    setIsAuthenticated(!!nextUser);
    return nextUser;
  }, []);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const nextUser = await getCurrentUser();
      if (!active) return;
      setUser((prev) => (sameUser(prev, nextUser) ? prev : nextUser));
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

  // Só recria o objeto do contexto quando algo que ele carrega de fato
  // muda — sem isso, todo consumidor de useAuth/useUserRole (22 arquivos,
  // incluindo o layout e o Checklist) re-renderiza a cada evento de auth,
  // mesmo quando `user`/`isAuthenticated`/`isLoadingAuth` não mudaram.
  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    logout,
    refreshUser,
  }), [user, isAuthenticated, isLoadingAuth, logout, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
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
