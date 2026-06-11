import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getStoredAuthRedirect } from './utils/authRedirect';

const Login = lazy(() => import('./pages/Login'));
const VendorDashboard = lazy(() => import('./pages/VendorDashboard'));
const VendorQrPrintPage = lazy(() => import('./pages/VendorQrPrintPage'));
const ScanOfficerDashboard = lazy(() => import('./pages/ScanOfficerDashboard'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

const AppFallback = () => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    color: '#475569',
    fontFamily: 'Inter, sans-serif',
  }}>
    Memuat halaman...
  </div>
);

const resolveStoredRedirectPath = () => {
  if (typeof window === 'undefined') return null;
  return getStoredAuthRedirect(window.localStorage)?.path || null;
};

const RootRoute = () => {
  const redirectPath = resolveStoredRedirectPath();
  return <Navigate to={redirectPath || '/login'} replace />;
};

const LoginRoute = () => {
  const redirectPath = resolveStoredRedirectPath();
  return redirectPath ? <Navigate to={redirectPath} replace /> : <Login />;
};

function App() {
  return (
    <Router>
      <Suspense fallback={<AppFallback />}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/vendor-qr-print" element={<VendorQrPrintPage />} />
          <Route path="/vendor-dashboard/*" element={<VendorDashboard />} />
          <Route path="/scan-officer-dashboard/*" element={<ScanOfficerDashboard />} />
          <Route path="/manager-dashboard/*" element={<ManagerDashboard />} />
          <Route path="/admin-dashboard/*" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
