import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleRoute from '@/components/RoleRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import PageLoadingFallback from '@/components/PageLoadingFallback';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';

// As páginas autenticadas (abaixo) são carregadas sob demanda (uma por
// rota) — só as 4 páginas de autenticação acima ficam no bundle inicial,
// já que são a primeira coisa que um usuário não autenticado precisa ver
// (uma volta de rede extra bem no login custaria mais em UX do que
// economizaria em bytes, ao contrário das páginas abaixo, já dentro do
// app autenticado). Ver PageLoadingFallback para o fallback do Suspense.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const MapPage = lazy(() => import('@/pages/MapPage'));
const PanelList = lazy(() => import('@/pages/PanelList'));
const PanelDetail = lazy(() => import('@/pages/PanelDetail'));
const QRCodePage = lazy(() => import('@/pages/QRCodePage'));
const InventoryList = lazy(() => import('@/pages/InventoryList'));
const InventoryForm = lazy(() => import('@/pages/InventoryForm'));
const InspectionList = lazy(() => import('@/pages/InspectionList'));
const InspectionForm = lazy(() => import('@/pages/InspectionForm'));
const InspectionDetail = lazy(() => import('@/pages/InspectionDetail'));
const InfoFundamentais = lazy(() => import('@/pages/InfoFundamentais'));
const UserManagement = lazy(() => import('@/pages/UserManagement'));
const HealthConfig = lazy(() => import('@/pages/HealthConfig'));
const NonconformityList = lazy(() => import('@/pages/NonconformityList'));
const NonconformityDetail = lazy(() => import('@/pages/NonconformityDetail'));
const ActionList = lazy(() => import('@/pages/ActionList'));
const ExecutiveReport = lazy(() => import('@/pages/ExecutiveReport'));
const IntelligentAnalysis = lazy(() => import('@/pages/IntelligentAnalysis'));
const AuditLog = lazy(() => import('@/pages/AuditLog'));
const Profile = lazy(() => import('@/pages/Profile'));

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return <PageLoadingFallback />;
  }

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AppLayout />}>
            <Route path="/mapa" element={<MapPage />} />
            <Route path="/quadros" element={<PanelList />} />
            <Route path="/quadro/:id" element={<PanelDetail />} />
            <Route path="/inventario" element={<InventoryList />} />
            <Route path="/inventario/novo" element={<InventoryForm />} />
            <Route path="/inventario/editar/:id" element={<InventoryForm />} />
            <Route path="/inspecoes" element={<InspectionList />} />
            <Route path="/inspecoes/nova" element={<InspectionForm />} />
            <Route path="/inspecoes/:id" element={<InspectionDetail />} />
            <Route path="/informacoes" element={<InfoFundamentais />} />
            <Route path="/perfil" element={<Profile />} />

            {/* Editor não tem acesso: Painel, Não Conformidades, Ações, Relatório */}
            <Route element={<RoleRoute allow={['admin', 'viewer']} />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/nao-conformidades" element={<NonconformityList />} />
              <Route path="/nao-conformidades/:id" element={<NonconformityDetail />} />
              <Route path="/acoes" element={<ActionList />} />
              <Route path="/relatorio" element={<ExecutiveReport />} />
              <Route path="/analise-inteligente" element={<IntelligentAnalysis />} />
            </Route>

            {/* Editor não tem acesso: QR Codes (agora só admin) */}
            <Route element={<RoleRoute allow={['admin']} />}>
              <Route path="/qrcode" element={<QRCodePage />} />
              <Route path="/usuarios" element={<UserManagement />} />
              <Route path="/config/indice-saude" element={<HealthConfig />} />
              <Route path="/auditoria" element={<AuditLog />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ErrorBoundary>
          <Router basename={import.meta.env.BASE_URL}>
            <AuthenticatedApp />
          </Router>
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App