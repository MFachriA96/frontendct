import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import AdminModal from '../components/admin/AdminModal';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminPanel from '../components/admin/AdminPanel';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminStatCard from '../components/admin/AdminStatCard';
import AppButton from '../components/ui/AppButton';
import ConfirmModal from '../components/ui/ConfirmModal';
import StatusModal from '../components/ui/StatusModal';
import { API_BASE_URL } from '../config/api';
import {
  buildUserRegistrationPayload,
  isWarehouseAssignmentOptional,
  requiresVendorAssignment,
  requiresWarehouseAssignment,
} from '../utils/userAccess';
import './AdminDashboard.css';

const defaultSummary = {
  total_outbound_today: 0,
  total_inbound_today: 0,
  total_discrepancy_today: 0,
  pending_actions: 0,
  discrepancy_by_status: { match: 0, mismatch: 0, missing: 0, over: 0 },
};

const defaultUserForm = {
  nama: '',
  email: '',
  role: '',
  ID_vendor: '',
  ID_gudang: '',
  password: 'Epson@2026!',
};

const defaultVendorForm = {
  nama_vendor: '',
  email_vendor: '',
  lokasi_vendor: '',
  kontak: '',
  aktif: true,
};

const roleLabels = {
  admin: 'Administrator',
  manager: 'Manager',
  petugas: 'Scan Officer',
  vendor: 'Vendor User',
};

const activityBadgeClass = {
  outbound: 'admin-chip admin-chip--blue',
  discrepancy: 'admin-chip admin-chip--amber',
  document: 'admin-chip admin-chip--green',
  action: 'admin-chip admin-chip--slate',
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

const getUserScopeLabel = (user) => {
  if (user.role === 'vendor') {
    return user.vendor?.nama_vendor || `Vendor ${user.ID_vendor || '-'}`;
  }

  return user.warehouse?.nama_gudang || (user.ID_gudang ? `Warehouse ${user.ID_gudang}` : 'Internal');
};

const buildActivityFeed = (outboundData, discrepancyData, documentData, inboundData) => {
  const outboundEvents = outboundData.map((item) => ({
    id: `outbound-${item.ID_outbound}`,
    time: item.created_at,
    actor: item.creator?.nama || item.vendor?.nama_vendor || 'System',
    type: 'Outbound created',
    typeClass: activityBadgeClass.outbound,
    detail: `Shipment ${item.no_pengiriman || `SHP-${item.ID_outbound}`} created with status ${item.status || 'draft'}.`,
    source: 'Outbound',
  }));

  const discrepancyEvents = discrepancyData.map((item) => ({
    id: `discrepancy-${item.ID_discrepancy}`,
    time: item.detected_at || item.created_at,
    actor: item.outbound_detail?.outbound?.vendor?.nama_vendor || 'System',
    type: `Discrepancy ${String(item.status || 'unknown').replace(/_/g, ' ')}`,
    typeClass: activityBadgeClass.discrepancy,
    detail: `${item.outbound_detail?.barang?.nama_barang || 'Item'} flagged with difference ${item.selisih ?? 0}.`,
    source: 'Discrepancy',
  }));

  const documentEvents = documentData.map((item) => ({
    id: `document-${item.ID_dokumen}`,
    time: item.dibuat_at,
    actor: item.pembuat?.nama || 'System',
    type: `R1 ${String(item.status_dokumen || 'draft').replace(/_/g, ' ')}`,
    typeClass: activityBadgeClass.document,
    detail: `Document ${item.no_dokumen_r1 || `R1-${item.ID_dokumen}`} for discrepancy ${item.ID_discrepancy}.`,
    source: 'R1 document',
  }));

  const inboundEvents = inboundData.map((item) => ({
    id: `inbound-${item.ID_inbound}`,
    time: item.created_at,
    actor: item.receiver?.nama || 'Scan Officer',
    type: `Inbound ${String(item.status_scan || 'menunggu').replace(/_/g, ' ')}`,
    typeClass: activityBadgeClass.action,
    detail: `Inbound ${item.no_pengiriman || `IN-${item.ID_inbound}`} is ${String(item.status_scan || 'menunggu').replace(/_/g, ' ')}.`,
    source: 'Inbound',
  }));

  return [...outboundEvents, ...discrepancyEvents, ...documentEvents, ...inboundEvents]
    .filter((item) => item.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 24);
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [user] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [summary, setSummary] = useState(defaultSummary);
  const [shipments, setShipments] = useState([]);
  const [inbounds, setInbounds] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState(defaultUserForm);
  const [newVendorForm, setNewVendorForm] = useState(defaultVendorForm);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [statusModal, setStatusModal] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });

  const navigate = useNavigate();

  const openStatusModal = (type, title, message) => {
    setStatusModal({
      open: true,
      type,
      title,
      message,
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [
        summaryRes,
        usersRes,
        vendorRes,
        gudangRes,
        outboundRes,
        inboundRes,
        discrepancyRes,
        documentRes,
      ] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/dashboard/summary`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/user`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/vendor`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/gudang`, { headers }),
        axios.get(`${API_BASE_URL}/api/outbound`, { headers }),
        axios.get(`${API_BASE_URL}/api/inbound`, { headers }),
        axios.get(`${API_BASE_URL}/api/discrepancy`, { headers }),
        axios.get(`${API_BASE_URL}/api/dokumen-r1`, { headers }),
      ]);

      const summaryData = summaryRes.data?.data || defaultSummary;
      const userData = usersRes.data?.data?.data || usersRes.data?.data || [];
      const vendorData = vendorRes.data?.data?.data || vendorRes.data?.data || [];
      const warehouseData = gudangRes.data?.data?.data || gudangRes.data?.data || [];
      const outboundData = outboundRes.data?.data?.data || outboundRes.data?.data || [];
      const inboundData = inboundRes.data?.data?.data || inboundRes.data?.data || [];
      const discrepancyData = discrepancyRes.data?.data?.data || discrepancyRes.data?.data || [];
      const documentData = documentRes.data?.data?.data || documentRes.data?.data || [];

      setSummary({ ...defaultSummary, ...summaryData });
      setUsersList(Array.isArray(userData) ? userData : []);
      setVendors(Array.isArray(vendorData) ? vendorData : []);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setShipments(Array.isArray(outboundData) ? outboundData : []);
      setInbounds(Array.isArray(inboundData) ? inboundData : []);
      setDiscrepancies(Array.isArray(discrepancyData) ? discrepancyData : []);
      setDocuments(Array.isArray(documentData) ? documentData : []);
      setActivityFeed(buildActivityFeed(outboundData, discrepancyData, documentData, inboundData));
    } catch (error) {
      console.error('Error fetching admin dashboard data:', error);
      setLoadError(error.response?.data?.message || 'Failed to load admin dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Keep logout resilient
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const resetNewUserForm = () => {
    setNewUserForm(defaultUserForm);
  };

  const resetNewVendorForm = () => {
    setNewVendorForm(defaultVendorForm);
  };

  const openUserModal = (role = '') => {
    resetNewUserForm();
    setNewUserForm((prev) => ({
      ...prev,
      role,
    }));
    setIsAddUserModalOpen(true);
  };

  const handleNewUserFieldChange = (field, value) => {
    setNewUserForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'role' && value !== 'vendor' ? { ID_vendor: '' } : {}),
      ...(field === 'role' && !['petugas', 'manager'].includes(value) ? { ID_gudang: '' } : {}),
    }));
  };

  const handleNewVendorFieldChange = (field, value) => {
    setNewVendorForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateUser = async () => {
    if (!newUserForm.nama || !newUserForm.email || !newUserForm.role) {
      openStatusModal('warning', 'Incomplete form', 'Please complete name, email, and role first.');
      return;
    }

    if (requiresVendorAssignment(newUserForm.role) && !newUserForm.ID_vendor) {
      openStatusModal('warning', 'Vendor required', 'Please select a linked vendor.');
      return;
    }

    if (requiresWarehouseAssignment(newUserForm.role) && !newUserForm.ID_gudang) {
      openStatusModal('warning', 'Warehouse required', 'Please select an assigned warehouse for scan officer users.');
      return;
    }

    setSavingUser(true);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/register`, buildUserRegistrationPayload(newUserForm));
      setIsAddUserModalOpen(false);
      resetNewUserForm();
      await fetchData();
      openStatusModal('success', 'User created', 'The new user account has been created successfully.');
    } catch (error) {
      console.error('Error creating user:', error);
      const message = error.response?.data?.message || 'Failed to create user.';
      const validationErrors = error.response?.data?.errors;
      const firstError = validationErrors ? Object.values(validationErrors).flat()[0] : null;
      openStatusModal('error', 'Unable to create user', firstError || message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateVendor = async () => {
    if (!newVendorForm.nama_vendor || !newVendorForm.email_vendor) {
      openStatusModal('warning', 'Incomplete form', 'Please complete vendor name and vendor email first.');
      return;
    }

    setSavingVendor(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/master/vendor`, newVendorForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsAddVendorModalOpen(false);
      resetNewVendorForm();
      await fetchData();
      openStatusModal('success', 'Vendor created', 'The vendor master record has been created successfully.');
    } catch (error) {
      console.error('Error creating vendor:', error);
      const message = error.response?.data?.message || 'Failed to create vendor.';
      const validationErrors = error.response?.data?.errors;
      const firstError = validationErrors ? Object.values(validationErrors).flat()[0] : null;
      openStatusModal('error', 'Unable to create vendor', firstError || message);
    } finally {
      setSavingVendor(false);
    }
  };

  const stats = useMemo(() => {
    const activeVendorCount = vendors.filter((vendor) => vendor.aktif !== false).length;
    const scannerCount = usersList.filter((item) => item.role === 'petugas').length;
    const managerCount = usersList.filter((item) => item.role === 'manager').length;
    const vendorUserCount = usersList.filter((item) => item.role === 'vendor').length;

    return {
      activeVendorCount,
      managerCount,
      scannerCount,
      totalUsers: usersList.length,
      vendorUserCount,
    };
  }, [usersList, vendors]);

  const pageCopy = {
    activity: {
      description: 'Live events from outbound, inbound, discrepancy, and R1 records.',
      title: 'Recent activity',
    },
    users: {
      description: 'Create scanner, manager, admin, and vendor-linked user accounts from one place.',
      title: 'User management',
    },
    vendors: {
      description: 'Maintain vendor master data before linking users or shipments.',
      title: 'Vendor management',
    },
  }[activeTab];

  const headerActions = (
    <>
      {activeTab === 'users' ? (
        <>
          <AppButton type="button" onClick={() => openUserModal('manager')}>
            Add user
          </AppButton>
        </>
      ) : null}

      {activeTab === 'vendors' ? (
        <>
          <AppButton type="button" variant="secondary" onClick={() => openUserModal('vendor')}>
            Add vendor user
          </AppButton>
          <AppButton type="button" onClick={() => setIsAddVendorModalOpen(true)}>
            Add vendor
          </AppButton>
        </>
      ) : null}

      {activeTab === 'activity' ? (
        <AppButton type="button" variant="secondary" onClick={fetchData}>
          Refresh
        </AppButton>
      ) : null}
    </>
  );

  return (
    <div className="admin-workspace">
      <AdminSidebar activeTab={activeTab} onChangeTab={setActiveTab} onLogout={() => setLogoutConfirmOpen(true)} />

      <main className="admin-workspace__main">
        <div className="admin-workspace__inner">
          <AdminPageHeader title={pageCopy.title} description={pageCopy.description} actions={headerActions} />

          {loadError ? (
            <div className="admin-inline-alert">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{loadError}</span>
            </div>
          ) : null}

          {activeTab === 'users' ? (
            <>
              <div className="admin-users-top-row">
                <div className="admin-stats-grid admin-stats-grid--compact">
                  <AdminStatCard compact icon="fa-solid fa-users" label="Total users" value={stats.totalUsers} />
                  <AdminStatCard compact icon="fa-solid fa-qrcode" label="Scan officers" value={stats.scannerCount} />
                  <AdminStatCard compact icon="fa-solid fa-user-tie" label="Managers" value={stats.managerCount} />
                  <AdminStatCard compact icon="fa-solid fa-truck" label="Vendor users" value={stats.vendorUserCount} />
                </div>

                <AdminPanel
                  className="admin-panel--quick-actions"
                  title="Quick actions"
                  description="Create common account types faster."
                >
                  <div className="admin-quick-actions admin-quick-actions--compact">
                    <button type="button" className="admin-quick-action admin-quick-action--compact" onClick={() => openUserModal('petugas')}>
                      <i className="fa-solid fa-qrcode"></i>
                      <div>
                        <strong>Add scanner</strong>
                        <span>Fixed warehouse scope.</span>
                      </div>
                    </button>
                    <button type="button" className="admin-quick-action admin-quick-action--compact" onClick={() => openUserModal('manager')}>
                      <i className="fa-solid fa-chart-column"></i>
                      <div>
                        <strong>Add manager</strong>
                        <span>Optional default warehouse.</span>
                      </div>
                    </button>
                    <button type="button" className="admin-quick-action admin-quick-action--compact" onClick={() => openUserModal('vendor')}>
                      <i className="fa-solid fa-building"></i>
                      <div>
                        <strong>Add vendor user</strong>
                        <span>Link to one vendor master.</span>
                      </div>
                    </button>
                  </div>
                </AdminPanel>
              </div>

              <AdminPanel
                title="System users"
                description="Users returned from /api/master/user, including warehouse and vendor scopes."
                action={<button type="button" className="admin-link-action" onClick={fetchData}>{loading ? 'Refreshing...' : 'Refresh'}</button>}
              >
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Scope</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((item) => {
                        const isVendor = item.role === 'vendor';
                        const statusLabel = isVendor && item.vendor?.aktif === false ? 'Inactive' : 'Active';

                        return (
                          <tr key={item.ID_user}>
                            <td>
                              <div className="admin-person">
                                <div className="admin-person__avatar">{item.nama?.charAt(0).toUpperCase()}</div>
                                <div>
                                  <strong>{item.nama}</strong>
                                  <span>ID {item.ID_user}</span>
                                </div>
                              </div>
                            </td>
                            <td>{item.email}</td>
                            <td><span className={`admin-role admin-role--${item.role || 'vendor'}`}>{roleLabels[item.role] || item.role}</span></td>
                            <td>{getUserScopeLabel(item)}</td>
                            <td><span className={`admin-status ${statusLabel === 'Active' ? 'is-active' : 'is-inactive'}`}>{statusLabel}</span></td>
                            <td>{formatDateTime(item.created_at)}</td>
                          </tr>
                        );
                      })}

                      {usersList.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="admin-table__empty">No users returned by backend.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdminPanel>
            </>
          ) : null}

          {activeTab === 'vendors' ? (
            <>
              <div className="admin-stats-grid">
                <AdminStatCard icon="fa-solid fa-building" label="Vendor master" meta="Total vendors available in master data" value={vendors.length} />
                <AdminStatCard icon="fa-solid fa-circle-check" label="Active vendors" meta="Partners currently marked active" value={stats.activeVendorCount} />
                <AdminStatCard icon="fa-solid fa-user-group" label="Vendor users" meta="Linked external accounts" value={stats.vendorUserCount} />
                <AdminStatCard icon="fa-solid fa-warehouse" label="Warehouses" meta="Available warehouse references" value={warehouses.length} />
              </div>

              <AdminPanel
                title="Vendor master data"
                description="Vendor records are used for shipment ownership and vendor-linked user accounts."
                action={<button type="button" className="admin-link-action" onClick={() => setIsAddVendorModalOpen(true)}>Add vendor</button>}
              >
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Email</th>
                        <th>Location</th>
                        <th>Contact</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendors.map((vendor) => (
                        <tr key={vendor.ID_vendor}>
                          <td>
                            <div className="admin-person">
                              <div className="admin-person__avatar admin-person__avatar--vendor">
                                {vendor.nama_vendor?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong>{vendor.nama_vendor}</strong>
                                <span>ID {vendor.ID_vendor}</span>
                              </div>
                            </div>
                          </td>
                          <td>{vendor.email_vendor || '-'}</td>
                          <td>{vendor.lokasi_vendor || '-'}</td>
                          <td>{vendor.kontak || '-'}</td>
                          <td><span className={`admin-status ${vendor.aktif ? 'is-active' : 'is-inactive'}`}>{vendor.aktif ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      ))}

                      {vendors.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="admin-table__empty">No vendors returned by backend.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </AdminPanel>
            </>
          ) : null}

          {activeTab === 'activity' ? (
            <AdminPanel
              title="Recent activity"
              description="A combined feed from outbound, inbound, discrepancy, and R1 records."
              action={<button type="button" className="admin-link-action" onClick={fetchData}>{loading ? 'Refreshing...' : 'Refresh'}</button>}
            >
              <div className="admin-activity-list">
                {activityFeed.map((item) => (
                  <article key={item.id} className="admin-activity-item">
                    <div className="admin-activity-item__top">
                      <div>
                        <strong>{item.actor}</strong>
                        <span>{formatDateTime(item.time)}</span>
                      </div>
                      <span className={item.typeClass}>{item.type}</span>
                    </div>
                    <p>{item.detail}</p>
                    <small>{item.source}</small>
                  </article>
                ))}

                {activityFeed.length === 0 ? (
                  <div className="admin-empty-block">No recent activity returned by backend.</div>
                ) : null}
              </div>
            </AdminPanel>
          ) : null}
        </div>
      </main>

      {isAddUserModalOpen ? (
        <AdminModal title="Create user" onClose={() => { setIsAddUserModalOpen(false); resetNewUserForm(); }}>
          <div className="admin-form-grid">
            <div className="admin-form-field">
              <label htmlFor="admin-user-name">Full name</label>
              <input id="admin-user-name" className="admin-input" type="text" placeholder="John Doe" value={newUserForm.nama} onChange={(event) => handleNewUserFieldChange('nama', event.target.value)} />
            </div>
            <div className="admin-form-field">
              <label htmlFor="admin-user-email">Email</label>
              <input id="admin-user-email" className="admin-input" type="email" placeholder="john@epson.com" value={newUserForm.email} onChange={(event) => handleNewUserFieldChange('email', event.target.value)} />
            </div>
          </div>

          <div className="admin-form-field">
            <label htmlFor="admin-user-role">Role</label>
            <select id="admin-user-role" className="admin-input" value={newUserForm.role} onChange={(event) => handleNewUserFieldChange('role', event.target.value)}>
              <option value="">Select role</option>
              <option value="vendor">Vendor user</option>
              <option value="petugas">Scan officer</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          {requiresVendorAssignment(newUserForm.role) ? (
            <div className="admin-form-field">
              <label htmlFor="admin-user-vendor">Linked vendor</label>
              <select id="admin-user-vendor" className="admin-input" value={newUserForm.ID_vendor} onChange={(event) => handleNewUserFieldChange('ID_vendor', event.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.ID_vendor} value={vendor.ID_vendor}>{vendor.nama_vendor}</option>
                ))}
              </select>
            </div>
          ) : null}

          {requiresWarehouseAssignment(newUserForm.role) || isWarehouseAssignmentOptional(newUserForm.role) ? (
            <div className="admin-form-field">
              <label htmlFor="admin-user-warehouse">
                {requiresWarehouseAssignment(newUserForm.role) ? 'Assigned warehouse' : 'Default warehouse'}
              </label>
              <select id="admin-user-warehouse" className="admin-input" value={newUserForm.ID_gudang} onChange={(event) => handleNewUserFieldChange('ID_gudang', event.target.value)}>
                <option value="">{requiresWarehouseAssignment(newUserForm.role) ? 'Select warehouse' : 'No default warehouse'}</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.ID_gudang} value={warehouse.ID_gudang}>{warehouse.nama_gudang}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="admin-form-field">
            <label htmlFor="admin-user-password">Initial password</label>
            <input id="admin-user-password" className="admin-input" type="password" value={newUserForm.password} onChange={(event) => handleNewUserFieldChange('password', event.target.value)} />
          </div>

          <div className="admin-modal__actions">
            <AppButton type="button" variant="secondary" onClick={() => { setIsAddUserModalOpen(false); resetNewUserForm(); }}>
              Cancel
            </AppButton>
            <AppButton type="button" onClick={handleCreateUser} disabled={savingUser}>
              {savingUser ? 'Creating...' : 'Create user'}
            </AppButton>
          </div>
        </AdminModal>
      ) : null}

      {isAddVendorModalOpen ? (
        <AdminModal title="Create vendor" onClose={() => { setIsAddVendorModalOpen(false); resetNewVendorForm(); }}>
          <div className="admin-form-grid">
            <div className="admin-form-field">
              <label htmlFor="vendor-name">Vendor name</label>
              <input id="vendor-name" className="admin-input" type="text" placeholder="PT Vendor Makmur" value={newVendorForm.nama_vendor} onChange={(event) => handleNewVendorFieldChange('nama_vendor', event.target.value)} />
            </div>
            <div className="admin-form-field">
              <label htmlFor="vendor-email">Vendor email</label>
              <input id="vendor-email" className="admin-input" type="email" placeholder="vendor@example.com" value={newVendorForm.email_vendor} onChange={(event) => handleNewVendorFieldChange('email_vendor', event.target.value)} />
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-field">
              <label htmlFor="vendor-location">Location</label>
              <input id="vendor-location" className="admin-input" type="text" placeholder="Bekasi" value={newVendorForm.lokasi_vendor} onChange={(event) => handleNewVendorFieldChange('lokasi_vendor', event.target.value)} />
            </div>
            <div className="admin-form-field">
              <label htmlFor="vendor-contact">Contact</label>
              <input id="vendor-contact" className="admin-input" type="text" placeholder="0812xxxxxxx" value={newVendorForm.kontak} onChange={(event) => handleNewVendorFieldChange('kontak', event.target.value)} />
            </div>
          </div>

          <label className="admin-checkbox">
            <input type="checkbox" checked={newVendorForm.aktif} onChange={(event) => handleNewVendorFieldChange('aktif', event.target.checked)} />
            <span>Vendor is active</span>
          </label>

          <div className="admin-modal__actions">
            <AppButton type="button" variant="secondary" onClick={() => { setIsAddVendorModalOpen(false); resetNewVendorForm(); }}>
              Cancel
            </AppButton>
            <AppButton type="button" onClick={handleCreateVendor} disabled={savingVendor}>
              {savingVendor ? 'Creating...' : 'Create vendor'}
            </AppButton>
          </div>
        </AdminModal>
      ) : null}

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Sign out?"
        message="You will need to sign in again to continue using the admin workspace."
        cancelLabel="Stay here"
        confirmLabel="Sign out"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />

      <StatusModal
        open={statusModal.open}
        type={statusModal.type}
        title={statusModal.title}
        message={statusModal.message}
        onClose={() => setStatusModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};

export default AdminDashboard;
