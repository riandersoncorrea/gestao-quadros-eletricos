import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import MapPage from '@/pages/MapPage';
import PanelList from '@/pages/PanelList';
import PanelDetail from '@/pages/PanelDetail';
import QRCodePage from '@/pages/QRCodePage';
import InventoryList from '@/pages/InventoryList';
import InventoryForm from '@/pages/InventoryForm';
import InspectionList from '@/pages/InspectionList';
import InspectionForm from '@/pages/InspectionForm';
import InspectionDetail from '@/pages/InspectionDetail';
import InfoFundamentais from '@/pages/InfoFundamentais';
import UserManagement from '@/pages/UserManagement';
import SapImportList from '@/pages/SapImportList';
import SapImportWizard from '@/pages/SapImportWizard';
import SapBatchDetail from '@/pages/SapBatchDetail';
import HealthConfig from '@/pages/HealthConfig';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/quadros" element={<PanelList />} />
          <Route path="/quadro/:id" element={<PanelDetail />} />
          <Route path="/inventario" element={<InventoryList />} />
          <Route path="/inventario/novo" element={<InventoryForm />} />
          <Route path="/inventario/editar/:id" element={<InventoryForm />} />
          <Route path="/inspecoes" element={<InspectionList />} />
          <Route path="/inspecoes/nova" element={<InspectionForm />} />
          <Route path="/inspecoes/:id" element={<InspectionDetail />} />
          <Route path="/importacao-sap" element={<SapImportList />} />
          <Route path="/importacao-sap/nova" element={<SapImportWizard />} />
          <Route path="/importacao-sap/:id" element={<SapBatchDetail />} />
          <Route path="/qrcode" element={<QRCodePage />} />
          <Route path="/informacoes" element={<InfoFundamentais />} />
          <Route path="/usuarios" element={<UserManagement />} />
          <Route path="/config/indice-saude" element={<HealthConfig />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router basename={import.meta.env.BASE_URL}>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App