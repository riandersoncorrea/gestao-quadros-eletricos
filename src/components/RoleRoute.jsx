import { Navigate, Outlet } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';

/** Bloqueia acesso direto por URL às páginas fora do que o perfil pode ver. */
export default function RoleRoute({ allow, redirectTo = '/mapa' }) {
  const { role } = useUserRole();

  if (!allow.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
