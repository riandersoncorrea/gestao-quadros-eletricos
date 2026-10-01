import { Navigate, Outlet } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { homePathForRole } from '@/auth/roles';

/**
 * Bloqueia acesso direto por URL às páginas fora do que o perfil pode ver.
 * Sem `redirectTo`, leva o usuário à página inicial do próprio perfil
 * (Mapa para os perfis gerais, Não Conformidades para o Inspetor).
 */
export default function RoleRoute({ allow, redirectTo }) {
  const { role } = useUserRole();

  if (!allow.includes(role)) {
    return <Navigate to={redirectTo || homePathForRole(role)} replace />;
  }

  return <Outlet />;
}
