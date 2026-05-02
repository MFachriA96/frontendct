import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import VendorDashboard from './pages/VendorDashboard';
import ScanOfficerDashboard from './pages/ScanOfficerDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/vendor-dashboard/*" element={<VendorDashboard />} />
        <Route path="/scan-officer-dashboard/*" element={<ScanOfficerDashboard />} />
        <Route path="/manager-dashboard/*" element={<ManagerDashboard />} />
        <Route path="/admin-dashboard/*" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;
