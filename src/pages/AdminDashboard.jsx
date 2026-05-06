import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import './AdminDashboard.css';

const defaultSummary = {
  total_outbound_today: 0,
  total_inbound_today: 0,
  total_discrepancy_today: 0,
  pending_actions: 0,
  discrepancy_by_status: { match: 0, mismatch: 0, missing: 0, over: 0 },
};

const defaultForm = {
  nama: '',
  email: '',
  role: '',
  ID_vendor: '',
  password: 'Epson@2026!',
};

const roleLabels = {
  admin: 'Administrator',
  manager: 'Manager',
  petugas: 'Scan Officer',
  vendor: 'Vendor',
};

const roleClassMap = {
  admin: 'admin',
  manager: 'manager',
  petugas: 'scanner',
  vendor: 'vendor',
};

const activityBadgeClass = {
  outbound: 'badge-primary',
  discrepancy: 'badge-warning',
  document: 'badge-success',
  action: 'badge-info',
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [activeSidebar, setActiveSidebar] = useState('dashboard');
  const [user] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [systemLatency, setSystemLatency] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [summary, setSummary] = useState(defaultSummary);
  const [shipments, setShipments] = useState([]);
  const [inbounds, setInbounds] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState(defaultForm);

  const navigate = useNavigate();

  const buildActivityFeed = (outboundData, discrepancyData, documentData, inboundData) => {
    const outboundEvents = outboundData.map((item) => ({
      id: `outbound-${item.ID_outbound}`,
      time: item.created_at,
      actor: item.creator?.nama || item.vendor?.nama_vendor || 'System',
      type: 'OUTBOUND_CREATED',
      typeClass: activityBadgeClass.outbound,
      detail: `Shipment ${item.no_pengiriman || `SHP-${item.ID_outbound}`} created with status ${item.status || 'draft'}.`,
      source: 'Outbound',
    }));

    const discrepancyEvents = discrepancyData.map((item) => ({
      id: `discrepancy-${item.ID_discrepancy}`,
      time: item.detected_at || item.created_at,
      actor: item.outbound_detail?.outbound?.vendor?.nama_vendor || 'System',
      type: `DISCREPANCY_${String(item.status || 'unknown').toUpperCase()}`,
      typeClass: activityBadgeClass.discrepancy,
      detail: `${item.outbound_detail?.barang?.nama_barang || 'Item'} flagged with difference ${item.selisih ?? 0}.`,
      source: 'Discrepancy',
    }));

    const documentEvents = documentData.map((item) => ({
      id: `document-${item.ID_dokumen}`,
      time: item.dibuat_at,
      actor: item.pembuat?.nama || 'System',
      type: `R1_${String(item.status_dokumen || 'draft').toUpperCase()}`,
      typeClass: activityBadgeClass.document,
      detail: `Document ${item.no_dokumen_r1 || `R1-${item.ID_dokumen}`} for discrepancy ${item.ID_discrepancy}.`,
      source: 'R1 Document',
    }));

    const inboundEvents = inboundData.map((item) => ({
      id: `inbound-${item.ID_inbound}`,
      time: item.created_at,
      actor: item.receiver?.nama || 'Scan Officer',
      type: `INBOUND_${String(item.status_scan || 'menunggu').toUpperCase()}`,
      typeClass: activityBadgeClass.action,
      detail: `Inbound ${item.no_pengiriman || `IN-${item.ID_inbound}`} is ${String(item.status_scan || 'menunggu').replace(/_/g, ' ')}.`,
      source: 'Inbound',
    }));

    return [...outboundEvents, ...discrepancyEvents, ...documentEvents, ...inboundEvents]
      .filter((item) => item.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 25);
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const startTime = performance.now();

      const [
        summaryRes,
        usersRes,
        vendorRes,
        outboundRes,
        inboundRes,
        discrepancyRes,
        documentRes,
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/dashboard/summary`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/user`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/vendor`, { headers }),
        axios.get(`${API_BASE_URL}/api/outbound`, { headers }),
        axios.get(`${API_BASE_URL}/api/inbound`, { headers }),
        axios.get(`${API_BASE_URL}/api/discrepancy`, { headers }),
        axios.get(`${API_BASE_URL}/api/dokumen-r1`, { headers }),
      ]);

      const summaryData = summaryRes.data?.data || defaultSummary;
      const userData = usersRes.data?.data?.data || usersRes.data?.data || [];
      const vendorData = vendorRes.data?.data?.data || vendorRes.data?.data || [];
      const outboundData = outboundRes.data?.data?.data || outboundRes.data?.data || [];
      const inboundData = inboundRes.data?.data?.data || inboundRes.data?.data || [];
      const discrepancyData = discrepancyRes.data?.data?.data || discrepancyRes.data?.data || [];
      const documentData = documentRes.data?.data?.data || documentRes.data?.data || [];

      setSummary({ ...defaultSummary, ...summaryData });
      setUsersList(Array.isArray(userData) ? userData : []);
      setVendors(Array.isArray(vendorData) ? vendorData : []);
      setShipments(Array.isArray(outboundData) ? outboundData : []);
      setInbounds(Array.isArray(inboundData) ? inboundData : []);
      setDiscrepancies(Array.isArray(discrepancyData) ? discrepancyData : []);
      setDocuments(Array.isArray(documentData) ? documentData : []);
      setActivityFeed(buildActivityFeed(outboundData, discrepancyData, documentData, inboundData));
      setSystemLatency(Math.round(performance.now() - startTime));
    } catch (error) {
      console.error('Error fetching admin dashboard data:', error);
      setLoadError(error.response?.data?.message || 'Failed to load admin dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleNewUserFieldChange = (field, value) => {
    setNewUserForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' && value !== 'vendor' ? { ID_vendor: '' } : {}),
    }));
  };

  const resetNewUserForm = () => {
    setNewUserForm(defaultForm);
  };

  const handleCreateUser = async () => {
    if (!newUserForm.nama || !newUserForm.email || !newUserForm.role) {
      alert('Please complete name, email, and role first.');
      return;
    }

    if (newUserForm.role === 'vendor' && !newUserForm.ID_vendor) {
      alert('Please select a vendor for vendor-role users.');
      return;
    }

    setSavingUser(true);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/register`, {
        nama: newUserForm.nama,
        email: newUserForm.email,
        password: newUserForm.password,
        password_confirmation: newUserForm.password,
        role: newUserForm.role,
        ID_vendor: newUserForm.role === 'vendor' ? Number(newUserForm.ID_vendor) : null,
      });

      setIsAddUserModalOpen(false);
      resetNewUserForm();
      await fetchData();
    } catch (error) {
      console.error('Error creating user:', error);
      const message = error.response?.data?.message || 'Failed to create user.';
      const validationErrors = error.response?.data?.errors;

      if (validationErrors) {
        const firstError = Object.values(validationErrors).flat()[0];
        alert(firstError || message);
      } else {
        alert(message);
      }
    } finally {
      setSavingUser(false);
    }
  };

  const totalShipments = shipments.length;
  const discrepancyCount = discrepancies.length;
  const discrepancyRate = totalShipments > 0 ? ((discrepancyCount / totalShipments) * 100).toFixed(1) : '0.0';
  const roleCount = new Set(usersList.map((item) => item.role)).size;
  const activeVendorCount = usersList.filter((item) => item.role === 'vendor' && item.vendor?.aktif !== false).length;
  const recentActivityCount = activityFeed.length;

  const apiHealthUp = !loadError;
  const databaseHealthUp = apiHealthUp && (
    usersList.length > 0 ||
    vendors.length > 0 ||
    shipments.length > 0 ||
    inbounds.length > 0 ||
    discrepancies.length > 0 ||
    documents.length > 0
  );

  return (
    <div className="app-container admin-dashboard">
      <aside className="sidebar admin-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <i className="fa-solid fa-shield-halved"></i>
            <span>EpsonAdmin</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">ADMINISTRATION</div>
          <a href="#" className={`nav-item ${activeSidebar === 'dashboard' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveSidebar('dashboard'); }}>
            <i className="fa-solid fa-server"></i>
            <span>System Dashboard</span>
          </a>
          <a href="#" className={`nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveSidebar('dashboard'); setActiveTab('users'); }}>
            <i className="fa-solid fa-users-gear"></i>
            <span>User Management</span>
          </a>
          <a href="#" className={`nav-item ${activeTab === 'vendors' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveSidebar('dashboard'); setActiveTab('vendors'); }}>
            <i className="fa-solid fa-building"></i>
            <span>Vendors</span>
          </a>

          <div className="nav-section">SECURITY & LOGS</div>
          <a href="#" className={`nav-item ${activeTab === 'activity' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveSidebar('dashboard'); setActiveTab('activity'); }}>
            <i className="fa-solid fa-list-check"></i>
            <span>Recent Activity</span>
          </a>
          <a href="#" className={`nav-item ${activeTab === 'health' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveSidebar('dashboard'); setActiveTab('health'); }}>
            <i className="fa-solid fa-triangle-exclamation"></i>
            <span>System Health</span>
          </a>
        </nav>
        <div className="sidebar-footer">
          <a href="#" className="nav-item text-danger" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>Logout</span>
          </a>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <i className="fa-solid fa-database"></i>
            <input type="text" value="Live backend-connected admin dashboard" readOnly />
          </div>
          <div className="topbar-actions">
            <div className="date-badge">
              <i className="fa-regular fa-clock"></i>
              <span>{new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <button className="icon-btn" onClick={fetchData} disabled={loading} title="Refresh dashboard">
              <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
            </button>
            <div className="user-profile">
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#0f172a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {user ? user.nama?.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="user-info">
                <span className="user-name">{user ? user.nama : 'Admin'}</span>
                <span className="user-role">System Administrator</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content-wrapper">
          <div className="page-header">
            <div>
              <h1>Admin & Audit Portal</h1>
              <p className="subtitle">Live system data from backend APIs. Logged in as: <strong>{user ? user.email : 'admin@epson.com'}</strong></p>
            </div>
            <div className="header-actions">
              <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
                <i className="fa-solid fa-arrows-rotate"></i> Refresh
              </button>
              <button className="btn btn-primary" onClick={() => setIsAddUserModalOpen(true)}>
                <i className="fa-solid fa-user-plus"></i> Add New User
              </button>
            </div>
          </div>

          {loadError && (
            <div className="alert-banner error">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{loadError}</span>
            </div>
          )}

          <div className="stats-kpi-container">
            <div className="kpi-card border-blue">
              <div className="kpi-header">
                <span className="kpi-title">Registered Users</span>
                <i className="fa-solid fa-users text-muted"></i>
              </div>
              <div className="kpi-value">{usersList.length}</div>
              <div className="kpi-trend text-muted">Across {roleCount || 0} active roles</div>
            </div>

            <div className="kpi-card border-info">
              <div className="kpi-header">
                <span className="kpi-title">Total Shipments</span>
                <i className="fa-solid fa-box text-muted"></i>
              </div>
              <div className="kpi-value">{totalShipments}</div>
              <div className="kpi-trend text-success">Outbound records from database</div>
            </div>

            <div className="kpi-card border-warning">
              <div className="kpi-header">
                <span className="kpi-title">Discrepancy Rate</span>
                <i className="fa-solid fa-triangle-exclamation text-muted"></i>
              </div>
              <div className="kpi-value">{discrepancyRate}<span className="kpi-unit">%</span></div>
              <div className="kpi-trend text-warning">{discrepancyCount} discrepancy records detected</div>
            </div>

            <div className="kpi-card border-purple">
              <div className="kpi-header">
                <span className="kpi-title">Recent Activities</span>
                <i className="fa-solid fa-file-waveform text-muted"></i>
              </div>
              <div className="kpi-value">{recentActivityCount}</div>
              <div className="kpi-trend text-muted">Combined live system events</div>
            </div>
          </div>

          <div className="card data-card mt-4">
            <div className="card-tabs">
              <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                System Users <span className="tab-badge blue">{usersList.length}</span>
              </button>
              <button className={`tab-btn ${activeTab === 'vendors' ? 'active' : ''}`} onClick={() => setActiveTab('vendors')}>
                Vendors <span className="tab-badge">{vendors.length}</span>
              </button>
              <button className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                Recent Activity <span className="tab-badge">{recentActivityCount}</span>
              </button>
              <button className={`tab-btn ${activeTab === 'health' ? 'active' : ''}`} onClick={() => setActiveTab('health')}>
                System Health
              </button>
            </div>

            {activeTab === 'users' && (
              <div className="tab-content active" id="tab-users">
                <div className="table-toolbar">
                  <div className="table-summary-text">
                    Pulled from <code>/api/master/user</code> with vendor relation data.
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => {
                        const isVendor = u.role === 'vendor';
                        const derivedStatus = isVendor ? (u.vendor?.aktif === false ? 'inactive' : 'active') : 'active';

                        return (
                          <tr key={u.ID_user} className={derivedStatus === 'inactive' ? 'inactive-row' : ''}>
                            <td className="font-medium text-muted">{u.ID_user}</td>
                            <td>
                              <div className="user-cell">
                                <div className={`avatar-sm bg-${roleClassMap[u.role] || 'muted'}`}>{u.nama?.charAt(0).toUpperCase()}</div>
                                <span className="font-medium">{u.nama}</span>
                              </div>
                            </td>
                            <td>{u.email}</td>
                            <td><span className={`role-badge role-${roleClassMap[u.role] || 'vendor'}`}>{roleLabels[u.role] || u.role}</span></td>
                            <td>
                              <span className="status-indicator">
                                <span className={`dot ${derivedStatus}`}></span>
                                {derivedStatus === 'active' ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="text-muted">{formatDateTime(u.created_at)}</td>
                            <td>{isVendor ? (u.vendor?.nama_vendor || `Vendor ${u.ID_vendor || '-'}`) : 'Internal User'}</td>
                          </tr>
                        );
                      })}
                      {usersList.length === 0 && (
                        <tr>
                          <td colSpan="7" className="text-center" style={{ padding: '24px' }}>No users returned by backend.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'vendors' && (
              <div className="tab-content active" id="tab-vendors">
                <div className="table-toolbar">
                  <div className="table-summary-text">
                    Active vendor-linked users: <strong>{activeVendorCount}</strong>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Vendor ID</th>
                        <th>Vendor Name</th>
                        <th>Email</th>
                        <th>Location</th>
                        <th>Contact</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((vendor) => (
                        <tr key={vendor.ID_vendor}>
                          <td className="font-medium text-muted">{vendor.ID_vendor}</td>
                          <td>{vendor.nama_vendor}</td>
                          <td>{vendor.email_vendor}</td>
                          <td>{vendor.lokasi_vendor}</td>
                          <td>{vendor.kontak}</td>
                          <td>
                            <span className="status-indicator">
                              <span className={`dot ${vendor.aktif ? 'active' : 'inactive'}`}></span>
                              {vendor.aktif ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {vendors.length === 0 && (
                        <tr>
                          <td colSpan="6" className="text-center" style={{ padding: '24px' }}>No vendors returned by backend.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="tab-content active" id="tab-activity">
                <div className="table-toolbar">
                  <div className="table-summary-text">
                    This feed is generated from live outbound, inbound, discrepancy, and R1 document records.
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Actor</th>
                        <th>Action Type</th>
                        <th>Resource / Details</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityFeed.map((log) => (
                        <tr key={log.id}>
                          <td className="text-muted">{formatDateTime(log.time)}</td>
                          <td><strong>{log.actor}</strong></td>
                          <td><span className={`badge ${log.typeClass}`}>{log.type}</span></td>
                          <td>{log.detail}</td>
                          <td className="text-muted">{log.source}</td>
                        </tr>
                      ))}
                      {activityFeed.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center" style={{ padding: '24px' }}>No recent activity returned by backend data.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'health' && (
              <div className="tab-content active" id="tab-health">
                <div className="health-grid">
                  <div className="health-card">
                    <h3>API Server Status</h3>
                    <div className={`health-status ${apiHealthUp ? 'up' : 'down'}`}>
                      <i className={`fa-solid ${apiHealthUp ? 'fa-check-circle' : 'fa-circle-xmark'}`}></i>
                      {apiHealthUp ? 'Operational' : 'Unavailable'}
                    </div>
                    <p className="text-muted mt-2">Latest refresh latency: {systemLatency !== null ? `${systemLatency}ms` : '-'}</p>
                  </div>
                  <div className="health-card">
                    <h3>Database Connectivity</h3>
                    <div className={`health-status ${databaseHealthUp ? 'up' : 'down'}`}>
                      <i className={`fa-solid ${databaseHealthUp ? 'fa-check-circle' : 'fa-circle-xmark'}`}></i>
                      {databaseHealthUp ? 'Operational' : 'No data returned'}
                    </div>
                    <p className="text-muted mt-2">Users: {usersList.length}, Vendors: {vendors.length}, Documents: {documents.length}</p>
                  </div>
                  <div className="health-card">
                    <h3>Live Processing Queue</h3>
                    <div className="health-status up">
                      <i className="fa-solid fa-check-circle"></i>
                      Monitoring
                    </div>
                    <p className="text-muted mt-2">Inbound today: {summary.total_inbound_today}, Pending actions: {summary.pending_actions}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {isAddUserModalOpen && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Create New System User</h2>
              <button className="close-btn" onClick={() => { setIsAddUserModalOpen(false); resetNewUserForm(); }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name</label>
                  <input type="text" className="form-control" placeholder="e.g. John Doe" value={newUserForm.nama} onChange={(e) => handleNewUserFieldChange('nama', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" className="form-control" placeholder="e.g. john@epson.com" value={newUserForm.email} onChange={(e) => handleNewUserFieldChange('email', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>System Role</label>
                <select className="form-control" value={newUserForm.role} onChange={(e) => handleNewUserFieldChange('role', e.target.value)}>
                  <option value="">Select a role...</option>
                  <option value="vendor">Vendor (External)</option>
                  <option value="petugas">Scan Officer (Internal)</option>
                  <option value="manager">Manager (Internal)</option>
                  <option value="admin">Administrator (Super User)</option>
                </select>
              </div>

              {newUserForm.role === 'vendor' && (
                <div className="form-group">
                  <label>Linked Vendor</label>
                  <select className="form-control" value={newUserForm.ID_vendor} onChange={(e) => handleNewUserFieldChange('ID_vendor', e.target.value)}>
                    <option value="">Select a vendor...</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.ID_vendor} value={vendor.ID_vendor}>
                        {vendor.nama_vendor}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Initial Password</label>
                <input type="password" className="form-control" value={newUserForm.password} onChange={(e) => handleNewUserFieldChange('password', e.target.value)} />
                <small className="text-muted d-block mt-2">This form is now connected to the backend registration endpoint.</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setIsAddUserModalOpen(false); resetNewUserForm(); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateUser} disabled={savingUser}>
                {savingUser ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
