import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import AdminModal from '../components/admin/AdminModal';
import AdminPageHeader from '../components/admin/AdminPageHeader';
import AdminPanel from '../components/admin/AdminPanel';
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminStatCard from '../components/admin/AdminStatCard';
import AppButton from '../components/ui/AppButton';
import AppSkeleton from '../components/ui/AppSkeleton';
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
  petugas: 'Petugas scan',
  vendor: 'User vendor',
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

  return user.warehouse?.nama_gudang || (user.ID_gudang ? `Gudang ${user.ID_gudang}` : 'Internal');
};

const buildActivityFeed = (outboundData, discrepancyData, documentData, inboundData) => {
  const outboundEvents = outboundData.map((item) => ({
    id: `outbound-${item.ID_outbound}`,
    time: item.created_at,
    actor: item.creator?.nama || item.vendor?.nama_vendor || 'Sistem',
    type: 'Outbound dibuat',
    typeClass: activityBadgeClass.outbound,
    detail: `Shipment ${item.no_pengiriman || `SHP-${item.ID_outbound}`} dibuat dengan status ${item.status || 'draft'}.`,
    source: 'Outbound',
  }));

  const discrepancyEvents = discrepancyData.map((item) => ({
    id: `discrepancy-${item.ID_discrepancy}`,
    time: item.detected_at || item.created_at,
    actor: item.outbound_detail?.outbound?.vendor?.nama_vendor || 'Sistem',
    type: `Selisih ${String(item.status || 'unknown').replace(/_/g, ' ')}`,
    typeClass: activityBadgeClass.discrepancy,
    detail: `${item.outbound_detail?.barang?.nama_barang || 'Item'} ditandai dengan selisih ${item.selisih ?? 0}.`,
    source: 'Selisih',
  }));

  const documentEvents = documentData.map((item) => ({
    id: `document-${item.ID_dokumen}`,
    time: item.dibuat_at,
    actor: item.pembuat?.nama || 'Sistem',
    type: `R1 ${String(item.status_dokumen || 'draft').replace(/_/g, ' ')}`,
    typeClass: activityBadgeClass.document,
    detail: `Dokumen ${item.no_dokumen_r1 || `R1-${item.ID_dokumen}`} untuk selisih ${item.ID_discrepancy}.`,
    source: 'Dokumen R1',
  }));

  const inboundEvents = inboundData.map((item) => ({
    id: `inbound-${item.ID_inbound}`,
    time: item.created_at,
    actor: item.receiver?.nama || 'Petugas scan',
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

const AdminStatsSkeleton = ({ compact = false, count = 4 }) => (
  <div className={`admin-stats-grid ${compact ? 'admin-stats-grid--compact' : ''}`}>
    {Array.from({ length: count }).map((_, index) => (
      <div key={`stat-skeleton-${index}`} className={`app-card admin-stat-card ${compact ? 'admin-stat-card--compact' : ''}`}>
        <div className="admin-stat-card__top">
          <AppSkeleton className="admin-skeleton admin-skeleton--label" />
          <AppSkeleton className="admin-skeleton admin-skeleton--icon" />
        </div>
        <AppSkeleton className="admin-skeleton admin-skeleton--value" />
        {!compact ? <AppSkeleton className="admin-skeleton admin-skeleton--meta" /> : null}
      </div>
    ))}
  </div>
);

const AdminQuickActionsSkeleton = () => (
  <AdminPanel
    className="admin-panel--quick-actions"
    title="Aksi cepat"
    description="Menyiapkan shortcut akun yang paling sering dipakai."
  >
    <div className="admin-quick-actions admin-quick-actions--compact">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`quick-skeleton-${index}`} className="admin-quick-action admin-quick-action--compact">
          <AppSkeleton className="admin-skeleton admin-skeleton--icon" />
          <div>
            <AppSkeleton className="admin-skeleton admin-skeleton--action-title" />
            <AppSkeleton className="admin-skeleton admin-skeleton--action-subtitle" />
          </div>
        </div>
      ))}
    </div>
  </AdminPanel>
);

const AdminTableSkeleton = ({ columns = 6, rows = 5 }) => (
  <div className="admin-table-wrap">
    <table className="admin-table">
      <thead>
        <tr>
          {Array.from({ length: columns }).map((_, index) => (
            <th key={`head-skeleton-${index}`}>
              <AppSkeleton className="admin-skeleton admin-skeleton--table-head" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <tr key={`row-skeleton-${rowIndex}`}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <td key={`cell-skeleton-${rowIndex}-${colIndex}`}>
                <AppSkeleton className="admin-skeleton admin-skeleton--table-cell" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const AdminActivitySkeleton = ({ count = 4 }) => (
  <div className="admin-activity-list">
    {Array.from({ length: count }).map((_, index) => (
      <article key={`activity-skeleton-${index}`} className="admin-activity-item">
        <div className="admin-activity-item__top">
          <div className="admin-skeleton-stack">
            <AppSkeleton className="admin-skeleton admin-skeleton--activity-title" />
            <AppSkeleton className="admin-skeleton admin-skeleton--activity-time" />
          </div>
          <AppSkeleton className="admin-skeleton admin-skeleton--activity-chip" />
        </div>
        <AppSkeleton className="admin-skeleton admin-skeleton--activity-body" />
        <AppSkeleton className="admin-skeleton admin-skeleton--activity-foot" />
      </article>
    ))}
  </div>
);

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
  const [primaryLoaded, setPrimaryLoaded] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
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
  const initializedRef = useRef(false);

  const openStatusModal = (type, title, message) => {
    setStatusModal({
      open: true,
      type,
      title,
      message,
    });
  };

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const fetchPrimaryData = useCallback(async ({ withLoading = true } = {}) => {
    if (withLoading) {
      setLoading(true);
    }
    setLoadError('');

    try {
      const headers = getHeaders();
      const [summaryRes, usersRes, vendorRes, gudangRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/dashboard/summary`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/user`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/vendor`, { headers }),
        axios.get(`${API_BASE_URL}/api/master/gudang`, { headers }),
      ]);

      const summaryData = summaryRes.data?.data || defaultSummary;
      const userData = usersRes.data?.data?.data || usersRes.data?.data || [];
      const vendorData = vendorRes.data?.data?.data || vendorRes.data?.data || [];
      const warehouseData = gudangRes.data?.data?.data || gudangRes.data?.data || [];

      setSummary({ ...defaultSummary, ...summaryData });
      setUsersList(Array.isArray(userData) ? userData : []);
      setVendors(Array.isArray(vendorData) ? vendorData : []);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
    } catch (error) {
      console.error('Error fetching admin primary data:', error);
      setLoadError(error.response?.data?.message || 'Gagal memuat data inti admin.');
    } finally {
      setPrimaryLoaded(true);
      if (withLoading) {
        setLoading(false);
      }
    }
  }, [getHeaders]);

  const fetchSecondaryData = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setActivityLoading(true);
    }

    try {
      const headers = getHeaders();
      const [outboundRes, inboundRes, discrepancyRes, documentRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/outbound`, { headers }),
        axios.get(`${API_BASE_URL}/api/inbound`, { headers }),
        axios.get(`${API_BASE_URL}/api/discrepancy`, { headers }),
        axios.get(`${API_BASE_URL}/api/dokumen-r1`, { headers }),
      ]);

      const outboundData = outboundRes.data?.data?.data || outboundRes.data?.data || [];
      const inboundData = inboundRes.data?.data?.data || inboundRes.data?.data || [];
      const discrepancyData = discrepancyRes.data?.data?.data || discrepancyRes.data?.data || [];
      const documentData = documentRes.data?.data?.data || documentRes.data?.data || [];

      setShipments(Array.isArray(outboundData) ? outboundData : []);
      setInbounds(Array.isArray(inboundData) ? inboundData : []);
      setDiscrepancies(Array.isArray(discrepancyData) ? discrepancyData : []);
      setDocuments(Array.isArray(documentData) ? documentData : []);
      setActivityFeed(buildActivityFeed(outboundData, discrepancyData, documentData, inboundData));
      setActivityLoaded(true);
    } catch (error) {
      console.error('Error fetching admin secondary data:', error);
      setLoadError((prev) => prev || error.response?.data?.message || 'Gagal memuat aktivitas admin.');
    } finally {
      if (showLoader) {
        setActivityLoading(false);
      }
    }
  }, [getHeaders]);

  const fetchAllAdminData = useCallback(async () => {
    await fetchPrimaryData();
    await fetchSecondaryData({ showLoader: true });
  }, [fetchPrimaryData, fetchSecondaryData]);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    void (async () => {
      await fetchPrimaryData();
      void fetchSecondaryData();
    })();
  }, [fetchPrimaryData, fetchSecondaryData]);

  useEffect(() => {
    if (activeTab !== 'activity' || activityLoaded || activityLoading) {
      return;
    }

    void fetchSecondaryData({ showLoader: true });
  }, [activeTab, activityLoaded, activityLoading, fetchSecondaryData]);

  const handleLogout = () => {
    const token = localStorage.getItem('token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');

    if (token) {
      axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        // Keep logout resilient
      });
    }
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
      openStatusModal('warning', 'Form belum lengkap', 'Lengkapi nama, email, dan role terlebih dahulu.');
      return;
    }

    if (requiresVendorAssignment(newUserForm.role) && !newUserForm.ID_vendor) {
      openStatusModal('warning', 'Vendor wajib dipilih', 'Pilih vendor yang akan dihubungkan ke akun ini.');
      return;
    }

    if (requiresWarehouseAssignment(newUserForm.role) && !newUserForm.ID_gudang) {
      openStatusModal('warning', 'Gudang wajib dipilih', 'Pilih gudang untuk akun petugas scan.');
      return;
    }

    setSavingUser(true);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/register`, buildUserRegistrationPayload(newUserForm));
      setIsAddUserModalOpen(false);
      resetNewUserForm();
      await fetchPrimaryData();
      openStatusModal('success', 'User berhasil dibuat', 'Akun user baru berhasil dibuat.');
    } catch (error) {
      console.error('Error creating user:', error);
      const message = error.response?.data?.message || 'Gagal membuat user.';
      const validationErrors = error.response?.data?.errors;
      const firstError = validationErrors ? Object.values(validationErrors).flat()[0] : null;
      openStatusModal('error', 'User gagal dibuat', firstError || message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleCreateVendor = async () => {
    if (!newVendorForm.nama_vendor || !newVendorForm.email_vendor) {
      openStatusModal('warning', 'Form belum lengkap', 'Lengkapi nama vendor dan email vendor terlebih dahulu.');
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
      await fetchPrimaryData();
      openStatusModal('success', 'Vendor berhasil dibuat', 'Data master vendor berhasil dibuat.');
    } catch (error) {
      console.error('Error creating vendor:', error);
      const message = error.response?.data?.message || 'Gagal membuat vendor.';
      const validationErrors = error.response?.data?.errors;
      const firstError = validationErrors ? Object.values(validationErrors).flat()[0] : null;
      openStatusModal('error', 'Vendor gagal dibuat', firstError || message);
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
      description: 'Pergerakan terbaru dari outbound, inbound, selisih, dan dokumen R1.',
      title: 'Aktivitas terbaru',
    },
    users: {
      description: 'Buat akun petugas, manager, admin, dan user vendor dari satu tempat.',
      title: 'Manajemen user',
    },
    vendors: {
      description: 'Kelola data master vendor sebelum dipakai untuk user atau shipment.',
      title: 'Manajemen vendor',
    },
  }[activeTab];

  const showPrimarySkeleton = loading && !primaryLoaded;
  const showActivitySkeleton = (activityLoading && !activityLoaded) || (!activityLoaded && activeTab === 'activity');

  const headerActions = (
    <>
      {activeTab === 'users' ? (
        <>
          <AppButton type="button" onClick={() => openUserModal('manager')}>
            Tambah user
          </AppButton>
        </>
      ) : null}

      {activeTab === 'vendors' ? (
        <>
          <AppButton type="button" variant="secondary" onClick={() => openUserModal('vendor')}>
            Tambah user vendor
          </AppButton>
          <AppButton type="button" onClick={() => setIsAddVendorModalOpen(true)}>
            Tambah vendor
          </AppButton>
        </>
      ) : null}

      {activeTab === 'activity' ? (
        <AppButton type="button" variant="secondary" onClick={() => fetchSecondaryData({ showLoader: true })}>
          {activityLoading ? 'Memuat...' : 'Muat ulang'}
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
              {showPrimarySkeleton ? (
                <div className="admin-users-top-row">
                  <AdminStatsSkeleton compact count={4} />
                  <AdminQuickActionsSkeleton />
                </div>
              ) : (
                <div className="admin-users-top-row">
                  <div className="admin-stats-grid admin-stats-grid--compact">
                    <AdminStatCard compact icon="fa-solid fa-users" label="Total user" value={stats.totalUsers} />
                    <AdminStatCard compact icon="fa-solid fa-qrcode" label="Petugas scan" value={stats.scannerCount} />
                    <AdminStatCard compact icon="fa-solid fa-user-tie" label="Manager" value={stats.managerCount} />
                    <AdminStatCard compact icon="fa-solid fa-truck" label="User vendor" value={stats.vendorUserCount} />
                  </div>

                  <AdminPanel
                    className="admin-panel--quick-actions"
                    title="Aksi cepat"
                    description="Buat tipe akun yang paling sering dipakai lebih cepat."
                  >
                    <div className="admin-quick-actions admin-quick-actions--compact">
                      <button type="button" className="admin-quick-action admin-quick-action--compact" onClick={() => openUserModal('petugas')}>
                        <i className="fa-solid fa-qrcode"></i>
                        <div>
                          <strong>Tambah petugas</strong>
                          <span>Cakupan gudang tetap.</span>
                        </div>
                      </button>
                      <button type="button" className="admin-quick-action admin-quick-action--compact" onClick={() => openUserModal('manager')}>
                        <i className="fa-solid fa-chart-column"></i>
                        <div>
                          <strong>Tambah manager</strong>
                          <span>Gudang default opsional.</span>
                        </div>
                      </button>
                      <button type="button" className="admin-quick-action admin-quick-action--compact" onClick={() => openUserModal('vendor')}>
                        <i className="fa-solid fa-building"></i>
                        <div>
                          <strong>Tambah user vendor</strong>
                          <span>Hubungkan ke satu master vendor.</span>
                        </div>
                      </button>
                    </div>
                  </AdminPanel>
                </div>
              )}

              <AdminPanel
                title="Daftar user"
                description="Data user dari backend, termasuk cakupan gudang dan vendor."
                action={<button type="button" className="admin-link-action" onClick={() => fetchPrimaryData()}>{loading ? 'Memuat ulang...' : 'Muat ulang'}</button>}
              >
                {showPrimarySkeleton ? (
                  <AdminTableSkeleton columns={6} rows={5} />
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Nama</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Cakupan</th>
                          <th>Status</th>
                          <th>Dibuat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map((item) => {
                          const isVendor = item.role === 'vendor';
                          const statusLabel = isVendor && item.vendor?.aktif === false ? 'Nonaktif' : 'Aktif';

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
                              <td><span className={`admin-status ${statusLabel === 'Aktif' ? 'is-active' : 'is-inactive'}`}>{statusLabel}</span></td>
                              <td>{formatDateTime(item.created_at)}</td>
                            </tr>
                          );
                        })}

                        {usersList.length === 0 && primaryLoaded ? (
                          <tr>
                            <td colSpan="6" className="admin-table__empty">Belum ada user dari backend.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminPanel>
            </>
          ) : null}

          {activeTab === 'vendors' ? (
            <>
              {showPrimarySkeleton ? (
                <AdminStatsSkeleton count={4} />
              ) : (
                <div className="admin-stats-grid">
                  <AdminStatCard icon="fa-solid fa-building" label="Master vendor" meta="Total vendor yang tersedia di data master" value={vendors.length} />
                  <AdminStatCard icon="fa-solid fa-circle-check" label="Vendor aktif" meta="Partner yang saat ini masih aktif" value={stats.activeVendorCount} />
                  <AdminStatCard icon="fa-solid fa-user-group" label="User vendor" meta="Akun eksternal yang sudah terhubung" value={stats.vendorUserCount} />
                  <AdminStatCard icon="fa-solid fa-warehouse" label="Gudang" meta="Referensi gudang yang tersedia" value={warehouses.length} />
                </div>
              )}

              <AdminPanel
                title="Data master vendor"
                description="Data vendor dipakai untuk ownership shipment dan akun user vendor."
                action={<button type="button" className="admin-link-action" onClick={() => setIsAddVendorModalOpen(true)}>Tambah vendor</button>}
              >
                {showPrimarySkeleton ? (
                  <AdminTableSkeleton columns={5} rows={5} />
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Nama vendor</th>
                          <th>Email</th>
                          <th>Lokasi</th>
                          <th>Kontak</th>
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
                            <td><span className={`admin-status ${vendor.aktif ? 'is-active' : 'is-inactive'}`}>{vendor.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
                          </tr>
                        ))}

                        {vendors.length === 0 && primaryLoaded ? (
                          <tr>
                            <td colSpan="5" className="admin-table__empty">Belum ada vendor dari backend.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminPanel>
            </>
          ) : null}

          {activeTab === 'activity' ? (
            <AdminPanel
              title="Aktivitas terbaru"
              description="Gabungan aktivitas dari outbound, inbound, selisih, dan dokumen R1."
              action={<button type="button" className="admin-link-action" onClick={() => fetchAllAdminData()}>{activityLoading ? 'Memuat ulang...' : 'Muat ulang semua'}</button>}
            >
              {showActivitySkeleton ? (
                <AdminActivitySkeleton />
              ) : (
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

                  {activityFeed.length === 0 && activityLoaded ? (
                    <div className="admin-empty-block">Belum ada aktivitas terbaru dari backend.</div>
                  ) : null}
                </div>
              )}
            </AdminPanel>
          ) : null}
        </div>
      </main>

      {isAddUserModalOpen ? (
        <AdminModal title="Buat user" onClose={() => { setIsAddUserModalOpen(false); resetNewUserForm(); }}>
          <div className="admin-form-grid">
            <div className="admin-form-field">
              <label htmlFor="admin-user-name">Nama lengkap</label>
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
              <option value="">Pilih role</option>
              <option value="vendor">User vendor</option>
              <option value="petugas">Petugas scan</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </div>

          {requiresVendorAssignment(newUserForm.role) ? (
            <div className="admin-form-field">
              <label htmlFor="admin-user-vendor">Vendor terkait</label>
              <select id="admin-user-vendor" className="admin-input" value={newUserForm.ID_vendor} onChange={(event) => handleNewUserFieldChange('ID_vendor', event.target.value)}>
                <option value="">Pilih vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.ID_vendor} value={vendor.ID_vendor}>{vendor.nama_vendor}</option>
                ))}
              </select>
            </div>
          ) : null}

          {requiresWarehouseAssignment(newUserForm.role) || isWarehouseAssignmentOptional(newUserForm.role) ? (
            <div className="admin-form-field">
              <label htmlFor="admin-user-warehouse">
                {requiresWarehouseAssignment(newUserForm.role) ? 'Gudang petugas' : 'Gudang default'}
              </label>
              <select id="admin-user-warehouse" className="admin-input" value={newUserForm.ID_gudang} onChange={(event) => handleNewUserFieldChange('ID_gudang', event.target.value)}>
                <option value="">{requiresWarehouseAssignment(newUserForm.role) ? 'Pilih gudang' : 'Tanpa gudang default'}</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.ID_gudang} value={warehouse.ID_gudang}>{warehouse.nama_gudang}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="admin-form-field">
            <label htmlFor="admin-user-password">Password awal</label>
            <input id="admin-user-password" className="admin-input" type="password" value={newUserForm.password} onChange={(event) => handleNewUserFieldChange('password', event.target.value)} />
          </div>

          <div className="admin-modal__actions">
            <AppButton type="button" variant="secondary" onClick={() => { setIsAddUserModalOpen(false); resetNewUserForm(); }}>
              Batal
            </AppButton>
            <AppButton type="button" onClick={handleCreateUser} disabled={savingUser}>
              {savingUser ? 'Membuat...' : 'Buat user'}
            </AppButton>
          </div>
        </AdminModal>
      ) : null}

      {isAddVendorModalOpen ? (
        <AdminModal title="Buat vendor" onClose={() => { setIsAddVendorModalOpen(false); resetNewVendorForm(); }}>
          <div className="admin-form-grid">
            <div className="admin-form-field">
              <label htmlFor="vendor-name">Nama vendor</label>
              <input id="vendor-name" className="admin-input" type="text" placeholder="PT Vendor Makmur" value={newVendorForm.nama_vendor} onChange={(event) => handleNewVendorFieldChange('nama_vendor', event.target.value)} />
            </div>
            <div className="admin-form-field">
              <label htmlFor="vendor-email">Email vendor</label>
              <input id="vendor-email" className="admin-input" type="email" placeholder="vendor@example.com" value={newVendorForm.email_vendor} onChange={(event) => handleNewVendorFieldChange('email_vendor', event.target.value)} />
            </div>
          </div>

          <div className="admin-form-grid">
            <div className="admin-form-field">
              <label htmlFor="vendor-location">Lokasi</label>
              <input id="vendor-location" className="admin-input" type="text" placeholder="Bekasi" value={newVendorForm.lokasi_vendor} onChange={(event) => handleNewVendorFieldChange('lokasi_vendor', event.target.value)} />
            </div>
            <div className="admin-form-field">
              <label htmlFor="vendor-contact">Kontak</label>
              <input id="vendor-contact" className="admin-input" type="text" placeholder="0812xxxxxxx" value={newVendorForm.kontak} onChange={(event) => handleNewVendorFieldChange('kontak', event.target.value)} />
            </div>
          </div>

          <label className="admin-checkbox">
            <input type="checkbox" checked={newVendorForm.aktif} onChange={(event) => handleNewVendorFieldChange('aktif', event.target.checked)} />
            <span>Vendor aktif</span>
          </label>

          <div className="admin-modal__actions">
            <AppButton type="button" variant="secondary" onClick={() => { setIsAddVendorModalOpen(false); resetNewVendorForm(); }}>
              Batal
            </AppButton>
            <AppButton type="button" onClick={handleCreateVendor} disabled={savingVendor}>
              {savingVendor ? 'Membuat...' : 'Buat vendor'}
            </AppButton>
          </div>
        </AdminModal>
      ) : null}

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Keluar dari workspace admin?"
        message="Kamu perlu login lagi untuk lanjut memakai workspace admin."
        cancelLabel="Tetap di sini"
        confirmLabel="Keluar"
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
