import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import { API_BASE_URL } from '../config/api';
import {
  buildRecentShipmentActivity,
  buildVendorDashboardHeroMetrics,
  buildVendorDashboardPrimaryCards,
  canAccessQrForShipment,
  filterShipmentsByStatusGroup,
  getQrProductName,
  hasShipmentDiscrepancy,
  getUpcomingShipmentSchedule,
  getShipmentStatusCounts,
  normalizeStatus,
  normalizeQrTokens,
  sortShipmentsByLatestDate,
  validateOutboundSchedule,
  normalizeAnalyticsResponse,
  buildTrendChartData,
  buildScheduleRiskCards,
  buildActionQueueCards,
} from '../utils/dashboardLogic';
import AppSidebar from '../components/navigation/AppSidebar';
import AppButton from '../components/ui/AppButton';
import AppSkeleton from '../components/ui/AppSkeleton';
import BaseModalShell from '../components/ui/BaseModalShell';
import ConfirmModal from '../components/ui/ConfirmModal';
import StatusModal from '../components/ui/StatusModal';
import { openReportPdf } from '../utils/reportUtils';
import './VendorDashboard.css';

const LazyAnalyticsTrendChart = lazy(() => import('../components/AnalyticsTrendChart'));

const readJsonStorage = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const getVendorCacheKey = (vendorId) => `vendorDashboardCache:${vendorId || 'unknown'}`;

const getUserVendorId = (vendorUser) => (
  vendorUser?.ID_vendor
  ?? vendorUser?.vendor_id
  ?? vendorUser?.vendor?.ID_vendor
  ?? vendorUser?.vendor?.id
  ?? null
);

const normalizeVendorUser = (vendorUser) => {
  if (!vendorUser) {
    return null;
  }

  const vendorId = getUserVendorId(vendorUser);

  return {
    ...vendorUser,
    ID_vendor: vendorId,
  };
};

const readVendorDashboardCache = (vendorUser) => {
  const vendorId = getUserVendorId(vendorUser);

  if (!vendorId) {
    return {};
  }

  return readJsonStorage(getVendorCacheKey(vendorId), {});
};

const writeVendorDashboardCache = (vendorId, patch) => {
  if (!vendorId) {
    return;
  }

  const cacheKey = getVendorCacheKey(vendorId);
  const current = readJsonStorage(cacheKey, {});
  localStorage.setItem(cacheKey, JSON.stringify({
    ...current,
    ...patch,
    cached_at: new Date().toISOString(),
  }));
};

const emptyPaginationMeta = {
  current_page: 1,
  last_page: 1,
  per_page: 15,
  total: 0,
  from: 0,
  to: 0,
};

const getShipmentQueryParams = (page = 1, statusFilter = 'total') => {
  const params = { page };

  if (['draft', 'shipping', 'delivered'].includes(statusFilter)) {
    params.status_bucket = statusFilter;
  }

  if (statusFilter === 'discrepancy') {
    params.has_discrepancy = true;
  }

  return params;
};

const getPaginationMeta = (responseData) => {
  const payload = responseData?.data;
  const metaSource = Array.isArray(payload) ? responseData : payload;

  return {
    current_page: Number(metaSource?.current_page ?? 1),
    last_page: Number(metaSource?.last_page ?? 1),
    per_page: Number(metaSource?.per_page ?? 15),
    total: Number(metaSource?.total ?? (Array.isArray(payload) ? payload.length : 0)),
    from: Number(metaSource?.from ?? 0),
    to: Number(metaSource?.to ?? 0),
  };
};

const vendorStatusText = {
  draft: 'Belum dikirim',
  submitted: 'Sedang dikirim',
  in_transit: 'Sedang dikirim',
  arrived: 'Sudah diterima',
  verified: 'Sudah diterima',
  delivered: 'Selesai',
  discrepancy: 'Perlu tindak lanjut',
};

const getVendorStatusLabel = (status) => (
  vendorStatusText[normalizeStatus(status)] || String(status || 'Tidak diketahui').replace(/_/g, ' ')
);

const reportStatusText = {
  draft: 'Draft',
  dikirim_ke_vendor: 'Menunggu persetujuan vendor',
  diproses_vendor: 'Pengembalian sedang diproses',
  barang_dikirim_ulang: 'Barang sudah dikirim ulang',
  closing: 'Tindak lanjut selesai',
};

const resolveVendorOrigin = (vendorUser) => (
  vendorUser?.vendor?.lokasi_vendor
  || vendorUser?.lokasi_vendor
  || ''
);

const VendorStatsSkeleton = () => (
  <div className="stats-grid vendor-stats-grid">
    {Array.from({ length: 4 }).map((_, index) => (
      <div key={`vendor-stat-skeleton-${index}`} className="stat-card vendor-skeleton-card">
        <div className="stat-icon icon-navy"><i className="fa-solid fa-chart-simple"></i></div>
        <div className="stat-info" style={{ width: '100%' }}>
          <AppSkeleton style={{ height: 12, maxWidth: 96, marginBottom: 8 }} />
          <AppSkeleton style={{ height: 28, maxWidth: 72, marginBottom: 10 }} />
          <AppSkeleton style={{ height: 10, maxWidth: 180 }} />
        </div>
      </div>
    ))}
  </div>
);

const VendorInlineListSkeleton = ({ count = 3 }) => (
  <div className="vendor-inline-list">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`vendor-inline-skeleton-${index}`} className="vendor-inline-item vendor-skeleton-card">
        <div className="vendor-inline-item__main">
          <AppSkeleton style={{ height: 14, maxWidth: 140, marginBottom: 8 }} />
          <AppSkeleton style={{ height: 10, maxWidth: 100 }} />
        </div>
        <div className="vendor-inline-item__meta">
          <AppSkeleton style={{ height: 10, width: 96, marginBottom: 8 }} />
          <AppSkeleton style={{ height: 24, width: 88, borderRadius: 999 }} />
        </div>
      </div>
    ))}
  </div>
);

const VendorTableSkeleton = ({ columns = 4, rows = 5 }) => (
  <tbody>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={`vendor-table-skeleton-${rowIndex}`}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <td key={`vendor-table-skeleton-cell-${rowIndex}-${colIndex}`}>
            <AppSkeleton style={{ height: 12, maxWidth: colIndex === columns - 1 ? 120 : 150 }} />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);
const APPROVED_PRODUCT_NAMES = [
  'Printer Housing Cover',
  'Paper Tray Assembly',
  'Scanner Unit Assembly',
  'Ink Tank Module',
  'Print Head Unit',
  'Paper Feed Assembly',
  'Control Panel Assembly',
  'Power Supply Unit',
  'Mainboard Assembly',
  'Roller Assembly',
];

const VendorDashboard = () => {
  const initialUser = normalizeVendorUser(readJsonStorage('user', null));
  const initialDashboardCache = readVendorDashboardCache(initialUser);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('total');
  const [shipments, setShipments] = useState(() => initialDashboardCache.shipments || []);
  const [shipmentsMeta, setShipmentsMeta] = useState(() => initialDashboardCache.shipmentsMeta || emptyPaginationMeta);
  const [shipmentsPage, setShipmentsPage] = useState(() => initialDashboardCache.shipmentsMeta?.current_page || 1);
  const [reportsData, setReportsData] = useState([]);
  const [vendorOverview, setVendorOverview] = useState(() => initialDashboardCache.vendorOverview || null);
  const [authChecking, setAuthChecking] = useState(true);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [vendorAnalytics, setVendorAnalytics] = useState(() => initialDashboardCache.vendorAnalytics || null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [warehouses, setWarehouses] = useState(() => {
    try {
      const cachedWarehouses = JSON.parse(localStorage.getItem('warehouseOptions') || '[]');
      return Array.isArray(cachedWarehouses) ? cachedWarehouses : [];
    } catch {
      return [];
    }
  });
  const [formErrors, setFormErrors] = useState({});
  const [user, setUser] = useState(initialUser);
  
  // Create Shipment State
  const [lokasiAsal, setLokasiAsal] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [waktuKirim, setWaktuKirim] = useState('');
  const [estimasiTiba, setEstimasiTiba] = useState('');
  const [items, setItems] = useState([{ ID_barang: '', nama_barang: '', product_mode: 'select', quantity_outbound: 100, quantity_per_box: 10 }]);

  // QR Modal State
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrTokens, setQrTokens] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrBulkDownloadLoading, setQrBulkDownloadLoading] = useState(false);
  const [qrPrintLoading, setQrPrintLoading] = useState(false);
  const [qrToast, setQrToast] = useState({ open: false, type: 'info', message: '' });
  const [qrCache, setQrCache] = useState({});

  // Shipment Details Modal State
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedShipmentDetails, setSelectedShipmentDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [editingDraftNumber, setEditingDraftNumber] = useState('');
  const [reportModalData, setReportModalData] = useState(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [statusModal, setStatusModal] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });

  // Notifications State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsPrefs, setSettingsPrefs] = useState(() => {
    const savedPrefs = localStorage.getItem('vendorSettingsPrefs');
    return savedPrefs ? JSON.parse(savedPrefs) : {
      discrepancyAlerts: true,
      reportAlerts: true,
      qrDownloadHint: true,
    };
  });
  const profileMenuRef = useRef(null);
  const notificationMenuRef = useRef(null);
  const initializedRef = useRef(false);
  const notificationsPollingRef = useRef(null);

  const navigate = useNavigate();
  const vendorOrigin = resolveVendorOrigin(user);
  const hasPresetOrigin = Boolean(vendorOrigin);
  const showVendorDashboardSkeleton = authChecking;
  const showVendorShipmentsSkeleton = shipmentsLoading && shipments.length === 0;
  const showVendorReportsSkeleton = reportsLoading && reportsData.length === 0;

  const openStatusModal = (type, title, message) => {
    setStatusModal({
      open: true,
      type,
      title,
      message,
    });
  };

  const openQrToast = (type, message) => {
    setQrToast({
      open: true,
      type,
      message,
    });
  };

  const openQrPrintSheet = (groups, scopeLabel) => {
    const printableGroups = groups
      .map((group) => ({
        productName: group.productName,
        tokens: group.tokens
          .filter((token) => Boolean(token?.qr_token))
          .map((token) => {
            const svgElement = document.getElementById(`qr-svg-${getQrDomKey(token, token._qrIndex)}`);
            return {
              productName: group.productName,
              boxCode: token.box_code || (token.box_sequence ? `Box ${token.box_sequence}` : 'Box'),
              quantityInBox: token.expected_qty_in_box ?? '-',
              qrToken: token.qr_token || 'Token belum tersedia',
              svgMarkup: svgElement?.outerHTML || '',
            };
          }),
      }))
      .filter((group) => group.tokens.length > 0);

    if (printableGroups.length === 0) {
      openQrToast('warning', 'Belum ada QR yang siap dicetak.');
      return false;
    }

    const jobId = `vendor-qr-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const scopeTitle = scopeLabel
      ? `Cetak QR ${scopeLabel}`
      : `Cetak QR Shipment ${selectedShipmentId || '-'}`;

    const payload = {
      title: scopeTitle,
      description: 'Siap untuk kebutuhan kirim, scan, dan fallback input manual petugas.',
      printedAt: new Date().toLocaleString('id-ID'),
      groups: printableGroups,
    };

    window.sessionStorage.setItem(jobId, JSON.stringify(payload));
    const printWindow = window.open(`/vendor-qr-print?job=${encodeURIComponent(jobId)}`, '_blank');

    if (!printWindow) {
      window.sessionStorage.removeItem(jobId);
      openQrToast('warning', 'Pop-up print diblokir browser. Izinkan pop-up lalu coba lagi.');
      return false;
    }

    return true;
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      token,
      headers: { Authorization: `Bearer ${token}` }
    };
  };

  const forceLogoutToLogin = (message) => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (message) {
      sessionStorage.setItem('loginNotice', message);
    }
    navigate('/login');
  };

  const ensureVendorSession = async ({ silent = false } = {}) => {
    try {
      const { token, headers } = getAuthHeaders();

      if (!token) {
        if (!silent) {
          forceLogoutToLogin('Sesi kamu tidak ditemukan. Silakan login lagi sebagai vendor.');
        }
        return null;
      }

      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, { headers });
      const cachedUser = normalizeVendorUser(readJsonStorage('user', null));
      const rawBackendUser = response.data?.data || null;
      const backendUser = normalizeVendorUser({
        ...(cachedUser || {}),
        ...(rawBackendUser || {}),
        vendor: rawBackendUser?.vendor || cachedUser?.vendor || null,
      });

      if (!backendUser || String(backendUser.role).toLowerCase() !== 'vendor' || !getUserVendorId(backendUser)) {
        if (!silent) {
          forceLogoutToLogin('Akun ini tidak terhubung ke vendor yang valid. Silakan login memakai akun vendor sebelum membuat shipment.');
        }
        return null;
      }

      const normalizedUser = normalizeVendorUser(backendUser);
      setUser(normalizedUser);
      localStorage.setItem('user', JSON.stringify(normalizedUser));
      return { token, headers, user: normalizedUser };
    } catch (error) {
      console.error('Failed to verify vendor session:', error);
      if (!silent) {
        forceLogoutToLogin('Sesi login kamu sudah tidak valid. Silakan login lagi sebagai vendor.');
      }
      return null;
    }
  };

  const fetchShipments = async (session, page = shipmentsPage, statusFilter = shipmentStatusFilter) => {
    try {
      setShipmentsLoading(true);
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setShipments([]);
        setShipmentsMeta(emptyPaginationMeta);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/outbound`, {
        headers: activeSession.headers,
        params: getShipmentQueryParams(page, statusFilter),
      });
      const resData = response.data.data;
      const shipmentsArray = Array.isArray(resData) ? resData : (resData?.data || []);
      const sortedShipments = sortShipmentsByLatestDate(shipmentsArray);
      const nextMeta = getPaginationMeta(response.data);
      setShipments(sortedShipments);
      setShipmentsMeta(nextMeta);
      setShipmentsPage(nextMeta.current_page);

      if (page === 1 && statusFilter === 'total') {
        writeVendorDashboardCache(activeSession.user?.ID_vendor, {
          shipments: sortedShipments,
          shipmentsMeta: nextMeta,
        });
      }
    } catch (error) {
      console.error('Error fetching shipments:', error);
    } finally {
      setShipmentsLoading(false);
    }
  };

  const fetchVendorOverview = async (session) => {
    try {
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setVendorOverview(null);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/dashboard/vendor-overview`, {
        headers: activeSession.headers,
      });
      const nextOverview = response.data?.data || null;
      setVendorOverview(nextOverview);
      writeVendorDashboardCache(activeSession.user?.ID_vendor, { vendorOverview: nextOverview });
    } catch (error) {
      console.error('Error fetching vendor overview:', error);
      setVendorOverview(null);
    }
  };

  const fetchNotifications = async (session) => {
    try {
      setNotificationsLoading(true);
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/notifikasi`, {
        headers: activeSession.headers
      });
      // Handle Laravel pagination wrapper
      const resData = response.data.data;
      const notifsArray = Array.isArray(resData) ? resData : (resData?.data || []);
      setNotifications(notifsArray);
      
      const unreadRes = await axios.get(`${API_BASE_URL}/api/notifikasi/unread-count`, {
        headers: activeSession.headers
      });
      setUnreadCount(unreadRes.data.data.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const fetchProductOptions = async (session) => {
    try {
      setProductsLoading(true);
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setProductOptions([]);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/barang/options`, {
        headers: activeSession.headers
      });
      const productData = response.data?.data || [];
      const approvedProducts = Array.isArray(productData)
        ? productData
            .filter(product => APPROVED_PRODUCT_NAMES.includes(product.nama_barang))
            .sort((a, b) => APPROVED_PRODUCT_NAMES.indexOf(a.nama_barang) - APPROVED_PRODUCT_NAMES.indexOf(b.nama_barang))
        : [];
      setProductOptions(approvedProducts);
    } catch (error) {
      console.error('Error fetching product options:', error);
      setProductOptions([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchReports = async (session) => {
    try {
      setReportsLoading(true);
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setReportsData([]);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/dokumen-r1`, {
        headers: activeSession.headers,
      });
      const resData = response.data?.data;
      const reportsArray = Array.isArray(resData) ? resData : (resData?.data || []);
      setReportsData(reportsArray);
    } catch (error) {
      console.error('Error fetching reports:', error);
      setReportsData([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchWarehouses = async (session) => {
    try {
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setWarehouses([]);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/gudang/options`, {
        headers: activeSession.headers,
      });
      const payload = response.data?.data;
      const nextWarehouses = Array.isArray(payload) ? payload : (payload?.data || []);
      setWarehouses(nextWarehouses);
      localStorage.setItem('warehouseOptions', JSON.stringify(nextWarehouses));
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      try {
        const cachedWarehouses = JSON.parse(localStorage.getItem('warehouseOptions') || '[]');
        setWarehouses(Array.isArray(cachedWarehouses) ? cachedWarehouses : []);
      } catch {
        setWarehouses([]);
      }
    }
  };

  const handleShipmentFilterChange = (nextFilter) => {
    setShipmentStatusFilter(nextFilter);
    setShipmentsPage(1);
    const token = localStorage.getItem('token');
    const storedUser = readJsonStorage('user', null);
    const session = token && storedUser
      ? { token, headers: { Authorization: `Bearer ${token}` }, user: storedUser }
      : null;

    void fetchShipments(session, 1, nextFilter);
  };

  const handleShipmentPageChange = (nextPage) => {
    const boundedPage = Math.max(1, Math.min(Number(nextPage), shipmentsMeta.last_page || 1));
    setShipmentsPage(boundedPage);
    const token = localStorage.getItem('token');
    const storedUser = readJsonStorage('user', null);
    const session = token && storedUser
      ? { token, headers: { Authorization: `Bearer ${token}` }, user: storedUser }
      : null;

    void fetchShipments(session, boundedPage, shipmentStatusFilter);
  };

  const handleMarkAsRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/notifikasi/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/notifikasi/read-all`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleSettingsPreferenceChange = (field) => {
    setSettingsPrefs(prev => {
      const nextPrefs = { ...prev, [field]: !prev[field] };
      localStorage.setItem('vendorSettingsPrefs', JSON.stringify(nextPrefs));
      return nextPrefs;
    });
  };

  const isDiscrepancyNotification = (notif) => {
    const text = `${notif?.judul || ''} ${notif?.pesan || ''}`.toLowerCase();
    return notif?.related_type === 'discrepancy'
      || notif?.related_type === 'dokumen_r1'
      || text.includes('discrepancy')
      || text.includes('mismatch')
      || text.includes('r1');
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.sudah_dibaca) {
      await handleMarkAsRead(notif.ID_notif);
    }

    if (notif.related_type !== 'dokumen_r1' || !notif.related_id) {
      return;
    }

    await handleOpenReport(notif.related_id);
  };

  const refreshNotifications = async (session) => {
    await fetchNotifications(session);
  };

  const handleNotificationPreviewClick = async (notif) => {
    setNotificationMenuOpen(false);
    await handleNotificationClick(notif);

    if (notif.related_type !== 'dokumen_r1') {
      setActiveTab('notifications');
    }
  };

  const fetchVendorAnalytics = async (session) => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setVendorAnalytics(null);
        return;
      }

      const res = await axios.get(`${API_BASE_URL}/api/dashboard/vendor-analytics`, {
        headers: activeSession.headers,
      });
      const nextAnalytics = normalizeAnalyticsResponse(res.data);
      setVendorAnalytics(nextAnalytics);
      writeVendorDashboardCache(activeSession.user?.ID_vendor, { vendorAnalytics: nextAnalytics });
    } catch (err) {
      setAnalyticsError(err.response?.data?.message || err.message || 'Failed to load analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    const initializeDashboard = async () => {
      if (initializedRef.current) {
        return;
      }

      initializedRef.current = true;
      setAuthChecking(true);
      const { token, headers } = getAuthHeaders();
      const storedUser = normalizeVendorUser(readJsonStorage('user', null));
      const storedUserIsVendor = storedUser
        && String(storedUser.role).toLowerCase() === 'vendor'
        && getUserVendorId(storedUser);
      const session = token && storedUserIsVendor
        ? { token, headers, user: storedUser }
        : await ensureVendorSession();

      if (!session) {
        setAuthChecking(false);
        return;
      }

      if (storedUserIsVendor) {
        setUser(storedUser);
        void ensureVendorSession({ silent: true });
      }

      setAuthChecking(false);
      void Promise.allSettled([
        fetchShipments(session),
        fetchReports(session),
        fetchVendorOverview(session),
        fetchVendorAnalytics(session),
        fetchNotifications(session),
        fetchProductOptions(session),
        fetchWarehouses(session),
      ]);
    };

    initializeDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const startNotificationsPolling = async () => {
      const token = localStorage.getItem('token');
      const session = token ? { headers: { Authorization: `Bearer ${token}` } } : null;
      if (!session) {
        return;
      }

      if (notificationsPollingRef.current) {
        window.clearInterval(notificationsPollingRef.current);
      }

      notificationsPollingRef.current = window.setInterval(() => {
        void refreshNotifications(session);
      }, 45000);
    };

    const handleVisibilityRefresh = async () => {
      if (document.visibilityState === 'visible') {
        const token = localStorage.getItem('token');
        const session = token ? { headers: { Authorization: `Bearer ${token}` } } : null;
        if (session) {
          void refreshNotifications(session);
        }
      }
    };

    void startNotificationsPolling();
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
      if (notificationsPollingRef.current) {
        window.clearInterval(notificationsPollingRef.current);
        notificationsPollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!qrToast.open) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setQrToast((prev) => ({ ...prev, open: false }));
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [qrToast]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }

      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setNotificationMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
        setNotificationMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (vendorOrigin && !lokasiAsal) {
      setLokasiAsal(vendorOrigin);
    }
  }, [vendorOrigin, lokasiAsal]);

  const handleLogout = () => {
    const token = localStorage.getItem('token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');

    if (!token) {
      return;
    }

    axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch((e) => {
      console.error(e);
    });
  };

  const handleAddItem = () => {
    setItems([...items, { ID_barang: '', nama_barang: '', product_mode: 'select', quantity_outbound: 100, quantity_per_box: 10 }]);
  };

  const resetShipmentForm = (nextOrigin = '') => {
    setEditingDraftId(null);
    setEditingDraftNumber('');
    setLokasiAsal(nextOrigin);
    setTargetWarehouseId('');
    setWaktuKirim('');
    setEstimasiTiba('');
    setFormErrors({});
    setItems([{ ID_barang: '', nama_barang: '', product_mode: 'select', quantity_outbound: 100, quantity_per_box: 10 }]);
  };

  const handleRemoveItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const populateDraftForm = (shipmentData) => {
    const draftItems = Array.isArray(shipmentData?.details) && shipmentData.details.length > 0
      ? shipmentData.details.map((detail) => ({
          ID_barang: detail.ID_barang ? String(detail.ID_barang) : '',
          nama_barang: detail.nama_barang || '',
          product_mode: detail.ID_barang ? 'select' : 'custom',
          quantity_outbound: detail.quantity_outbound ?? 1,
          quantity_per_box: detail.quantity_per_box ?? 1,
        }))
      : [{ ID_barang: '', nama_barang: '', product_mode: 'select', quantity_outbound: 100, quantity_per_box: 10 }];

    setEditingDraftId(shipmentData?.ID_outbound || null);
    setEditingDraftNumber(shipmentData?.no_pengiriman || '');
    setLokasiAsal(shipmentData?.lokasi_asal || resolveVendorOrigin(user) || '');
    setTargetWarehouseId(shipmentData?.ID_gudang_tujuan ? String(shipmentData.ID_gudang_tujuan) : '');
    setWaktuKirim(shipmentData?.waktu_kirim ? String(shipmentData.waktu_kirim).slice(0, 10) : '');
    setEstimasiTiba(shipmentData?.estimasi_tiba ? String(shipmentData.estimasi_tiba).slice(0, 10) : '');
    setFormErrors({});
    setItems(draftItems);
    setActiveTab('create-shipment');
  };

  const handleProductSelectionChange = (index, value) => {
    const newItems = [...items];

    if (value === 'custom') {
      newItems[index] = {
        ...newItems[index],
        ID_barang: '',
        nama_barang: '',
        product_mode: 'custom'
      };
    } else {
      const selectedProduct = productOptions.find(product => String(product.ID_barang) === value);
      newItems[index] = {
        ...newItems[index],
        ID_barang: value,
        nama_barang: selectedProduct?.nama_barang || '',
        product_mode: 'select'
      };
    }

    setItems(newItems);
  };

  const getScheduleFieldErrors = () => {
    const nextErrors = {};

    if (!waktuKirim) {
      nextErrors.waktuKirim = 'Tanggal kirim wajib diisi.';
    }

    if (!estimasiTiba) {
      nextErrors.estimasiTiba = 'Estimasi tiba wajib diisi.';
    }

    if (!targetWarehouseId) {
      nextErrors.targetWarehouseId = 'Gudang tujuan wajib dipilih.';
    }

    if (waktuKirim && estimasiTiba) {
      const scheduleValidation = validateOutboundSchedule(waktuKirim, estimasiTiba);
      if (!scheduleValidation.valid) {
        nextErrors.estimasiTiba = scheduleValidation.message;
      }
    }

    return nextErrors;
  };

  const handleSubmitShipment = async (isSubmit) => {
    const scheduleErrors = getScheduleFieldErrors();
    if (Object.keys(scheduleErrors).length > 0) {
      setFormErrors(scheduleErrors);
      return;
    }

    if (!targetWarehouseId) {
      setFormErrors({ targetWarehouseId: 'Pilih gudang tujuan terlebih dahulu.' });
      openStatusModal('warning', 'Gudang tujuan wajib dipilih', 'Pilih gudang tujuan supaya shipment masuk ke antrian scanner yang benar.');
      return;
    }

    setFormErrors({});
    setSubmitLoading(true);
    try {
      const { token, headers } = getAuthHeaders();
      const storedUser = readJsonStorage('user', null);
      const session = token && storedUser
        ? { token, headers, user: storedUser }
        : await ensureVendorSession();

      if (!session) {
        setSubmitLoading(false);
        return;
      }

      const details = items.map(item => {
        const quantityOutbound = parseInt(item.quantity_outbound);
        const quantityPerBox = parseInt(item.quantity_per_box);
        const baseDetail = {
          quantity_outbound: quantityOutbound,
          quantity_per_box: quantityPerBox,
          jumlah_box: Math.ceil(quantityOutbound / quantityPerBox)
        };

        if (item.product_mode === 'custom' || !item.ID_barang) {
          return {
            ...baseDetail,
            nama_barang: item.nama_barang
          };
        }

        return {
          ...baseDetail,
          ID_barang: parseInt(item.ID_barang),
          nama_barang: item.nama_barang
        };
      });

      const payload = {
        waktu_kirim: waktuKirim + ' 00:00:00', // API might expect datetime
        estimasi_tiba: estimasiTiba + ' 00:00:00',
        lokasi_asal: lokasiAsal,
        target_warehouse_id: Number(targetWarehouseId),
        submit_now: Boolean(isSubmit && !editingDraftId),
        details: details
      };

      const res = editingDraftId
        ? await axios.put(`${API_BASE_URL}/api/outbound/${editingDraftId}`, payload, {
            headers: session.headers
          })
        : await axios.post(`${API_BASE_URL}/api/outbound`, payload, {
            headers: session.headers
          });

      const outboundId = res.data.data.ID_outbound;

      if (isSubmit) {
        const submitResponse = editingDraftId
          ? await axios.post(`${API_BASE_URL}/api/outbound/${outboundId}/submit`, {}, {
              headers: session.headers
            })
          : res;
        const fetchedTokens = normalizeQrTokens(submitResponse.data);

        setQrTokens(fetchedTokens);
        setQrCache(prev => ({ ...prev, [outboundId]: fetchedTokens }));
        setSelectedShipmentId(outboundId);
        setShowQRModal(true);
      } else {
        openStatusModal(
          'success',
          editingDraftId ? 'Draft diperbarui' : 'Draft tersimpan',
          editingDraftId
            ? 'Perubahan draft shipment berhasil disimpan.'
            : 'Shipment berhasil disimpan sebagai draft.',
        );
      }

      // Reset form
      resetShipmentForm(resolveVendorOrigin(session.user));
      setActiveTab('shipments');

      void Promise.allSettled([
        fetchShipments(session),
        fetchVendorOverview(session),
        fetchVendorAnalytics(session),
      ]);
      setSubmitLoading(false);

    } catch (error) {
      console.error(error);
      const apiMessage = error.response?.data?.message || error.message;
      openStatusModal('error', 'Shipment gagal disimpan', apiMessage);
      setSubmitLoading(false);
    }
  };

  const handleViewQR = async (id) => {
    setSelectedShipmentId(id);
    setShowQRModal(true);

    if (qrCache[id]) {
      setQrTokens(qrCache[id]);
      setQrLoading(false);
      return;
    }

    try {
      setQrLoading(true);
      setQrTokens([]);
      const session = await ensureVendorSession();
      if (!session) {
        setShowQRModal(false);
        return;
      }

      const qrRes = await axios.get(`${API_BASE_URL}/api/outbound/${id}/qr-token`, {
        headers: session.headers
      });
      const fetchedTokens = normalizeQrTokens(qrRes.data);
      setQrTokens(fetchedTokens);
      setQrCache(prev => ({ ...prev, [id]: fetchedTokens }));
    } catch (error) {
      console.error(error);
      setShowQRModal(false);
      openStatusModal('error', 'QR gagal dimuat', 'QR shipment belum bisa dimuat saat ini.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleCopyQrToken = async (qrToken) => {
    if (!qrToken) {
      openQrToast('warning', 'Token untuk box ini belum tersedia.');
      return;
    }

    try {
      await navigator.clipboard.writeText(qrToken);
      openQrToast('success', 'Token berhasil disalin.');
    } catch (error) {
      console.error('Failed to copy QR token:', error);
      openQrToast('warning', 'Salin otomatis gagal. Silakan salin manual dari token yang tampil.');
    }
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const formatCompactDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getQrDomKey = (token, index) => (
    token?.box_code
    || token?.box_sequence
    || token?.qr_token
    || `${token?.ID_outbound_detail || 'detail'}-${index + 1}`
  );

  const getQrFileName = (token, index) => {
    const detailId = token?.ID_outbound_detail || 'detail';
    const boxIdentifier = token?.box_code
      || (token?.box_sequence ? `box-${token.box_sequence}` : `box-${index + 1}`);
    return `shipment-${selectedShipmentId || 'qr'}-${detailId}-${boxIdentifier}-qr.png`;
  };

  const buildQrImageBlob = (token, index) => new Promise((resolve, reject) => {
    if (!token?.qr_token) {
      reject(new Error('QR token untuk box ini belum tersedia.'));
      return;
    }

    const svgElement = document.getElementById(`qr-svg-${getQrDomKey(token, index)}`);
    if (!svgElement) {
      reject(new Error('QR masih dirender. Coba lagi sebentar.'));
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const padding = 24;
      const qrSize = 180;
      const productName = getQrProductName(token);
      const boxCode = token.box_code || (token.box_sequence ? `Box ${token.box_sequence}` : 'Box');
      const quantityInBox = token.expected_qty_in_box ?? '-';
      const qrToken = token.qr_token || 'Token belum tersedia';
      const tokenPrefix = 'TOKEN: ';
      const tokenLineWidth = 24;
      const tokenChunks = [];

      for (let cursor = 0; cursor < qrToken.length; cursor += tokenLineWidth) {
        tokenChunks.push(qrToken.slice(cursor, cursor + tokenLineWidth));
      }

      const tokenLines = tokenChunks.length > 0
        ? tokenChunks.map((chunk, chunkIndex) => `${chunkIndex === 0 ? tokenPrefix : '       '}${chunk}`)
        : [tokenPrefix + 'Token belum tersedia'];

      const labelBaseY = padding + qrSize + 12;
      const tokenLineHeight = 14;
      const canvas = document.createElement('canvas');
      canvas.width = qrSize + padding * 2;
      canvas.height = qrSize + padding * 2 + 78 + (Math.max(tokenLines.length - 1, 0) * tokenLineHeight);

      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, padding, padding, qrSize, qrSize);
      context.fillStyle = '#0f172a';
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.font = '700 14px Arial, sans-serif';
      context.fillText(productName, canvas.width / 2, labelBaseY, canvas.width - padding * 2);
      context.font = '12px Arial, sans-serif';
      context.fillStyle = '#475569';
      context.fillText(`${boxCode}  Qty ${quantityInBox}`, canvas.width / 2, labelBaseY + 20, canvas.width - padding * 2);
      context.font = '11px "Courier New", monospace';
      context.fillStyle = '#1e293b';
      tokenLines.forEach((line, lineIndex) => {
        context.fillText(line, canvas.width / 2, labelBaseY + 40 + (lineIndex * tokenLineHeight), canvas.width - padding * 2);
      });

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl);
        if (!blob) {
          reject(new Error('Gambar QR belum bisa disiapkan untuk diunduh.'));
          return;
        }

        resolve(blob);
      }, 'image/png');
    };

    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Gambar QR belum bisa disiapkan untuk diunduh.'));
    };

    image.src = svgUrl;
  });

  const handleDownloadQr = async (token, index) => {
    try {
      const blob = await buildQrImageBlob(token, index);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = getQrFileName(token, index);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gambar QR belum bisa disiapkan untuk diunduh.';
      openStatusModal('error', 'Unduhan gagal', message);
    }
  };

  const handleDownloadAllQr = async () => {
    const downloadableTokens = qrTokens.filter((token) => Boolean(token?.qr_token));

    if (downloadableTokens.length === 0) {
      openStatusModal('warning', 'QR belum tersedia', 'Belum ada QR yang bisa diunduh untuk shipment ini.');
      return;
    }

    try {
      setQrBulkDownloadLoading(true);
      const zip = new JSZip();
      const folder = zip.folder(`shipment-${selectedShipmentId || 'qr'}`);

      await Promise.all(downloadableTokens.map(async (token, index) => {
        const blob = await buildQrImageBlob(token, index);
        folder.file(getQrFileName(token, index), blob);
      }));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `shipment-${selectedShipmentId || 'qr'}-all-qr.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ZIP QR belum bisa disiapkan untuk diunduh.';
      openStatusModal('error', 'Unduhan massal gagal', message);
    } finally {
      setQrBulkDownloadLoading(false);
    }
  };

  const handlePrintAllQr = () => {
    setQrPrintLoading(true);
    try {
      openQrPrintSheet(groupedQrTokens, `Shipment ${selectedShipmentId || '-'}`);
    } finally {
      setQrPrintLoading(false);
    }
  };

  const handleViewShipmentDetails = async (shipment) => {
    setSelectedShipmentDetails(shipment);
    setShowDetailsModal(true);
    setDetailsLoading(true);

    try {
      const session = await ensureVendorSession();
      if (!session) {
        setShowDetailsModal(false);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/outbound/${shipment.ID_outbound}`, {
        headers: session.headers
      });
      setSelectedShipmentDetails(response.data?.data || shipment);
    } catch (error) {
      console.error('Error fetching shipment details:', error);
      openStatusModal('error', 'Detail gagal dimuat', 'Detail shipment belum bisa dimuat saat ini.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleOpenReport = async (reportId) => {
    const existingReport = reportsData.find((report) => String(report.ID_dokumen) === String(reportId));
    if (existingReport) {
      setReportModalData(existingReport);
    }

    try {
      const { token, headers } = getAuthHeaders();
      const storedUser = readJsonStorage('user', null);
      const session = token && storedUser
        ? { token, headers, user: storedUser }
        : await ensureVendorSession();

      if (!session) {
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/dokumen-r1/${reportId}`, {
        headers: session.headers,
      });
      setReportModalData(response.data?.data || null);
    } catch (error) {
      console.error('Error opening report:', error);
      openStatusModal('error', 'Laporan gagal dimuat', 'Dokumen R1 belum bisa dibuka saat ini.');
    }
  };

  const handleUpdateReportStatus = async (reportId, nextStatus) => {
    const previousReports = reportsData;
    const previousModalData = reportModalData;
    const applyStatus = (report) => (
      String(report?.ID_dokumen) === String(reportId)
        ? { ...report, status_dokumen: nextStatus }
        : report
    );

    setReportsData((currentReports) => currentReports.map(applyStatus));
    setReportModalData((currentReport) => currentReport ? applyStatus(currentReport) : currentReport);

    try {
      const { token, headers } = getAuthHeaders();
      const storedUser = readJsonStorage('user', null);
      const session = token && storedUser
        ? { token, headers, user: storedUser }
        : await ensureVendorSession();

      if (!session) {
        return;
      }

      const response = await axios.put(`${API_BASE_URL}/api/dokumen-r1/${reportId}/status`, {
        status_dokumen: nextStatus,
      }, {
        headers: session.headers,
      });

      const updatedReport = response.data?.data || null;
      if (updatedReport) {
        setReportModalData(updatedReport);
        setReportsData((currentReports) => currentReports.map((report) => (
          String(report.ID_dokumen) === String(reportId) ? updatedReport : report
        )));
      }

      void Promise.allSettled([
        fetchReports(session),
        fetchNotifications(session),
      ]);

      const successMessage = nextStatus === 'diproses_vendor'
        ? 'Dokumen R1 sudah disetujui. Vendor bisa lanjut memproses pengembalian atau pengiriman ulang barang.'
        : nextStatus === 'barang_dikirim_ulang'
          ? 'Status dikirim ulang sudah dikirim ke manager. Dokumen tinggal menunggu penutupan akhir.'
          : 'Status dokumen berhasil diperbarui.';
      openStatusModal('success', 'Status laporan diperbarui', successMessage);
    } catch (error) {
      setReportsData(previousReports);
      setReportModalData(previousModalData);
      console.error('Error updating report status:', error);
      const message = error.response?.data?.message || 'Status dokumen belum bisa diperbarui saat ini.';
      openStatusModal('error', 'Status laporan gagal diperbarui', message);
    }
  };


  const getStatusBadge = (shipmentOrStatus) => {
    const shipment = typeof shipmentOrStatus === 'object' && shipmentOrStatus !== null
      ? shipmentOrStatus
      : null;
    const status = normalizeStatus(shipment ? shipment.status : shipmentOrStatus);

    if (shipment && hasShipmentDiscrepancy(shipment)) {
      return <span className="status-badge status-discrepancy"><i className="fa-solid fa-triangle-exclamation"></i> Perlu Tindak Lanjut</span>;
    }

    switch(status) {
      case 'draft': return <span className="status-badge status-draft"><i className="fa-solid fa-pen"></i> {getVendorStatusLabel(status)}</span>;
      case 'submitted': return <span className="status-badge status-submitted"><i className="fa-solid fa-paper-plane"></i> {getVendorStatusLabel(status)}</span>;
      case 'in_transit': return <span className="status-badge status-submitted"><i className="fa-solid fa-truck-fast"></i> {getVendorStatusLabel(status)}</span>;
      case 'arrived': return <span className="status-badge status-delivered"><i className="fa-solid fa-check"></i> {getVendorStatusLabel(status)}</span>;
      case 'verified': return <span className="status-badge status-delivered"><i className="fa-solid fa-check-double"></i> {getVendorStatusLabel(status)}</span>;
      case 'delivered': return <span className="status-badge status-delivered"><i className="fa-solid fa-box-open"></i> Selesai</span>;
      case 'discrepancy': return <span className="status-badge status-discrepancy"><i className="fa-solid fa-triangle-exclamation"></i> {getVendorStatusLabel(status)}</span>;
      default: return <span className="status-badge status-draft">{getVendorStatusLabel(status)}</span>;
    }
  };

  const handleEditDraft = async (shipment) => {
    try {
      const session = await ensureVendorSession();
      if (!session) {
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/outbound/${shipment.ID_outbound}`, {
        headers: session.headers
      });

      const draftData = response.data?.data || shipment;
      populateDraftForm(draftData);

      if (!draftData?.ID_gudang_tujuan) {
        openStatusModal(
          'info',
          'Pilih ulang gudang tujuan',
          'Draft berhasil dibuka untuk diedit. Gudang tujuan perlu dipilih ulang karena data lama belum ikut dikirim backend.',
        );
      }
    } catch (error) {
      console.error('Error loading draft for edit:', error);
      openStatusModal('error', 'Draft gagal dibuka', 'Draft shipment belum bisa dibuka untuk diedit saat ini.');
    }
  };

  const openShipmentFilter = (filter) => {
    setShipmentStatusFilter(filter);
    setActiveTab('shipments');
  };

  const openPrimaryDashboardCard = (card) => {
    if (card.key === 'qr_ready') {
      setShipmentStatusFilter('total');
      setActiveTab('shipments');
      return;
    }

    openShipmentFilter(card.actionKey || card.key);
  };

  // Stats
  const shipmentCounts = getShipmentStatusCounts(shipments);
  const overviewCounts = vendorOverview?.shipment_status_distribution || shipmentCounts;
  const filteredShipments = sortShipmentsByLatestDate(
    filterShipmentsByStatusGroup(shipments, shipmentStatusFilter)
  );
  const recentShipmentActivity = buildRecentShipmentActivity(shipments, 8);
  const upcomingShipmentSchedule = getUpcomingShipmentSchedule(shipments, 4);
  const qrReadiness = vendorOverview?.qr_readiness || {
    shipments_ready: shipments.filter((shipment) => shipment.qr_ready).length,
    shipments_not_ready: shipments.filter((shipment) => !shipment.qr_ready && normalizeStatus(shipment.status) !== 'draft').length,
    total_qr: shipments.reduce((total, shipment) => total + Number(shipment.total_qr || 0), 0),
    ready_qr: shipments.reduce((total, shipment) => total + Number(shipment.ready_qr || 0), 0),
  };
  const groupedQrTokens = qrTokens.reduce((groups, token, index) => {
    const productName = getQrProductName(token);
    const nextToken = {
      ...token,
      _qrIndex: index,
    };
    const existingGroup = groups.find((group) => group.productName === productName);

    if (existingGroup) {
      existingGroup.tokens.push(nextToken);
      return groups;
    }

    groups.push({
      productName,
      tokens: [nextToken],
    });
    return groups;
  }, []).map((group) => ({
    ...group,
    tokens: [...group.tokens].sort((left, right) => {
      const leftSequence = Number(left.box_sequence ?? left._qrIndex);
      const rightSequence = Number(right.box_sequence ?? right._qrIndex);
      return leftSequence - rightSequence;
    }),
  }));
  const discrepancyAlert = vendorOverview?.discrepancy_alert || {
    total_non_match: shipments.filter((shipment) => shipment.has_discrepancy).length,
    pending_review: 0,
    by_status: {
      match: 0,
      mismatch: 0,
      missing: 0,
      over: 0,
    },
  };
  const analyticsModel = vendorAnalytics || normalizeAnalyticsResponse(null);
  const analyticsRiskCards = buildScheduleRiskCards(analyticsModel.schedule_risk);
  const analyticsActionCards = buildActionQueueCards(analyticsModel.action_queue);
  const analyticsTrendData = buildTrendChartData(analyticsModel.trend_by_date);
  const analyticsPreviewAvailable = Boolean(vendorAnalytics) && !analyticsError;
  const notificationPreviewItems = notifications.slice(0, 4);
  const primaryDashboardCards = buildVendorDashboardPrimaryCards(overviewCounts, qrReadiness);
  const heroMetrics = buildVendorDashboardHeroMetrics({
    overviewCounts,
    analytics: analyticsModel,
    discrepancyAlert,
  });
  const pendingReviewHighlight = Number(
    analyticsModel.action_queue.pending_discrepancy_review
      || discrepancyAlert.pending_review
      || 0
  );
  const getScheduleSignal = (shipment) => {
    const now = new Date();
    const todayLabel = now.toDateString();
    const dispatchDate = shipment.dispatchAt ? new Date(shipment.dispatchAt) : null;
    const arrivalDate = shipment.expectedArrivalAt ? new Date(shipment.expectedArrivalAt) : null;
    const status = normalizeStatus(shipment.status);

    if (dispatchDate && dispatchDate.toDateString() === todayLabel) {
      return { label: 'Berangkat Hari Ini', tone: 'status-submitted' };
    }

    if (arrivalDate && arrivalDate.toDateString() === todayLabel) {
      return { label: 'Tiba Hari Ini', tone: 'status-delivered' };
    }

    if (arrivalDate && arrivalDate < now && (status === 'submitted' || status === 'in_transit')) {
      return { label: 'Melewati Estimasi Tiba', tone: 'status-discrepancy' };
    }

    if (status === 'arrived') {
      return { label: 'Menunggu Verifikasi Epson', tone: 'status-draft' };
    }

    return { label: getVendorStatusLabel(status) || 'Dipantau', tone: 'status-draft' };
  };
  const operationalFocusCards = analyticsPreviewAvailable
    ? [
        ...analyticsActionCards.map((card) => ({
          ...card,
          actionKey: card.key === 'draft_pending_submit' ? 'draft'
            : card.key === 'submitted_qr_not_ready' ? 'shipping'
            : card.key === 'pending_discrepancy_review' ? 'discrepancy'
            : 'total',
        })),
        { ...analyticsRiskCards.find((card) => card.key === 'overdue_shipping'), actionKey: 'shipping' },
      ].filter(Boolean)
    : [
        { key: 'draft', label: 'Belum Dikirim', value: overviewCounts.draft, tone: 'warning', actionKey: 'draft' },
        { key: 'qr_pending', label: 'QR Belum Lengkap', value: qrReadiness.shipments_not_ready, tone: 'info', actionKey: 'shipping' },
        { key: 'review', label: 'Perlu Review Selisih', value: discrepancyAlert.pending_review, tone: 'danger', actionKey: 'discrepancy' },
        { key: 'overdue', label: 'Risiko Terlambat', value: analyticsRiskCards.find((c) => c.key === 'overdue_shipping')?.value ?? 0, tone: 'muted', actionKey: 'shipping' },
      ];
  const criticalScheduleItems = upcomingShipmentSchedule
    .map((shipment) => ({
      ...shipment,
      signal: getScheduleSignal(shipment),
    }))
    .filter((shipment) => (
      shipment.signal.label === 'Melewati Estimasi Tiba'
      || shipment.signal.label === 'Berangkat Hari Ini'
      || shipment.signal.label === 'Tiba Hari Ini'
      || shipment.signal.label === 'Menunggu Verifikasi Epson'
    ))
    .slice(0, 3);

  if (authChecking) {
    return (
      <div className="vendor-dashboard">
        <main className="main-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-dark)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
            <p>Memeriksa sesi vendor...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="vendor-dashboard">
      <AppSidebar
        activeValue={activeTab}
        brand="Evy"
        brandMeta="Vendor"
        items={[
          { value: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-chart-pie' },
          { value: 'shipments', label: 'Shipment outbound', icon: 'fa-solid fa-truck-fast' },
          { value: 'create-shipment', label: 'Buat shipment', icon: 'fa-solid fa-plus-circle' },
          { value: 'reports', label: 'Tindak lanjut R1', icon: 'fa-regular fa-file-lines' },
        ]}
        onSelect={setActiveTab}
        onSignOut={() => setLogoutConfirmOpen(true)}
      />

      {/* Main Content */}
      <main className="main-wrapper">
        
        {/* Header */}
        <header className="header">
          <h1 className="page-title">
            {activeTab === 'dashboard' && 'Dashboard vendor'}
            {activeTab === 'shipments' && 'Shipment outbound'}
            {activeTab === 'create-shipment' && 'Buat shipment'}
              {activeTab === 'reports' && 'Tindak lanjut R1'}
            {activeTab === 'notifications' && 'Notifikasi'}
            {activeTab === 'settings' && 'Pengaturan'}
          </h1>
          
          <div className="header-actions">
            <div className={`notification-menu ${notificationMenuOpen ? 'open' : ''}`} ref={notificationMenuRef}>
              <button
                type="button"
                className="notification-btn"
                onClick={() => {
                  setNotificationMenuOpen((prev) => !prev);
                  setProfileMenuOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={notificationMenuOpen}
              >
                <i className="fa-regular fa-bell"></i>
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>

              <div className="notification-dropdown" role="menu" aria-hidden={!notificationMenuOpen}>
                <div className="notification-dropdown-header">
                  <div>
                    <strong>Notifikasi</strong>
                    <span>{unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className="notification-link-btn"
                      onClick={async () => {
                        await handleMarkAllAsRead();
                        setNotificationMenuOpen(false);
                      }}
                    >
                      Tandai semua
                    </button>
                  )}
                </div>

                <div className="notification-preview-list">
                  {notificationsLoading ? (
                    <div className="notification-preview-empty">Memuat notifikasi...</div>
                  ) : notificationPreviewItems.length === 0 ? (
                    <div className="notification-preview-empty">Belum ada notifikasi baru.</div>
                  ) : (
                    notificationPreviewItems.map((notif) => {
                      const isDiscrepancy = isDiscrepancyNotification(notif);

                      return (
                        <button
                          key={notif.ID_notif}
                          type="button"
                          className={`notification-preview-item ${!notif.sudah_dibaca ? 'unread' : ''}`}
                          onClick={() => handleNotificationPreviewClick(notif)}
                        >
                          <div className={`notification-preview-icon ${isDiscrepancy ? 'danger' : 'success'}`}>
                            <i className={`fa-solid ${isDiscrepancy ? 'fa-triangle-exclamation' : 'fa-box-open'}`}></i>
                          </div>
                          <div className="notification-preview-copy">
                            <strong>{notif.judul}</strong>
                            <span>{notif.pesan}</span>
                            <small>{formatCompactDateTime(notif.created_at)}</small>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <button
                  type="button"
                  className="notification-dropdown-footer"
                  onClick={() => {
                    setActiveTab('notifications');
                    setNotificationMenuOpen(false);
                  }}
                >
                  Buka notifikasi
                </button>
              </div>
            </div>
            
            <div className={`profile-menu ${profileMenuOpen ? 'open' : ''}`} ref={profileMenuRef}>
              <button
                type="button"
                className="user-profile user-profile-trigger"
                onClick={() => {
                  setProfileMenuOpen((prev) => !prev);
                  setNotificationMenuOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
              >
                <div className="avatar">{user ? user.nama?.charAt(0).toUpperCase() : 'V'}</div>
                <div className="user-info">
                  <span className="user-name">{user ? user.nama : 'Vendor Partner'}</span>
                  <span className="user-role">{user ? user.role : 'Vendor'}</span>
                </div>
                <i className="fa-solid fa-chevron-down profile-chevron"></i>
              </button>

              <div className="profile-menu-dropdown" role="menu" aria-hidden={!profileMenuOpen}>
                <button
                  type="button"
                  className={`profile-menu-item ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('settings');
                    setProfileMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <i className="fa-solid fa-gear"></i>
                  <span>Pengaturan</span>
                </button>
                <button
                  type="button"
                  className="profile-menu-item"
                  onClick={() => {
                    setActiveTab('notifications');
                    setProfileMenuOpen(false);
                  }}
                  role="menuitem"
                >
                  <i className="fa-regular fa-bell"></i>
                  <span>Notifikasi</span>
                  {unreadCount > 0 && <strong>{unreadCount}</strong>}
                </button>
                <button
                  type="button"
                  className="profile-menu-item danger"
                  onClick={handleLogout}
                  role="menuitem"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i>
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="content">
          
          {/* SECTION: Dashboard Overview */}
          {activeTab === 'dashboard' && (
            <div className="page-section active">
              {showVendorDashboardSkeleton ? (
                <VendorStatsSkeleton />
              ) : (
                <div className="stats-grid vendor-stats-grid">
                  {primaryDashboardCards.map((card) => (
                    <button key={card.key} type="button" className="stat-card stat-card-action stat-card-verbose" onClick={() => openPrimaryDashboardCard(card)}>
                      <div className={`stat-icon icon-${card.tone}`}><i className={`fa-solid ${
                        card.key === 'total'
                          ? 'fa-box-open'
                          : card.key === 'shipping'
                            ? 'fa-truck-fast'
                            : card.key === 'delivered'
                              ? 'fa-check-double'
                              : 'fa-qrcode'
                      }`}></i></div>
                      <div className="stat-info">
                        <h3>{card.label}</h3>
                        <div className="value">{card.value}</div>
                        <p>{card.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="overview-grid overview-grid-primary vendor-dashboard-grid">
                <div className="card overview-card overview-card-feature vendor-hero-card">
                  <div className="card-header">
                    <div>
                      <p className="vendor-section-kicker">Dashboard</p>
                      <h2 className="card-title">Progress pengiriman</h2>
                    </div>
                    <button className="btn btn-outline" onClick={() => setActiveTab('create-shipment')}>Buat shipment</button>
                  </div>
                  <div className="overview-card-body vendor-hero-panel">
                    {showVendorDashboardSkeleton ? (
                      <>
                        <div className="vendor-hero-chip-row">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="vendor-hero-chip vendor-skeleton-card">
                              <AppSkeleton style={{ height: 10, maxWidth: 88, marginBottom: 10 }} />
                              <AppSkeleton style={{ height: 28, maxWidth: 72 }} />
                            </div>
                          ))}
                        </div>
                        <div className="vendor-hero-chart-frame vendor-skeleton-card vendor-skeleton-chart"></div>
                      </>
                    ) : (
                      <>
                        <div className="vendor-hero-chip-row">
                          {heroMetrics.map((metric) => (
                            <div key={metric.key} className={`vendor-hero-chip tone-${metric.tone}`}>
                              <span>{metric.label}</span>
                              <strong>{metric.value}</strong>
                            </div>
                          ))}
                        </div>
                        {analyticsPreviewAvailable && analyticsTrendData.labels.length > 0 ? (
                          <div className="vendor-hero-chart-frame">
                            <Suspense fallback={<div className="overview-empty-state">Memuat grafik...</div>}>
                              <LazyAnalyticsTrendChart data={analyticsTrendData} theme="light" />
                            </Suspense>
                          </div>
                        ) : (
                          <div className="overview-empty-state">Belum ada cukup data untuk membaca pola pengiriman.</div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="card overview-card overview-card-compact vendor-focus-card">
                  <div className="card-header">
                    <div>
                      <p className="vendor-section-kicker">Fokus</p>
                      <h2 className="card-title">Yang perlu kamu cek</h2>
                    </div>
                    <button className="btn btn-outline" onClick={() => setActiveTab('shipments')}>Lihat daftar</button>
                  </div>
                  <div className="overview-card-body vendor-focus-body">
                    {showVendorDashboardSkeleton ? (
                      <>
                        <div className="signal-card-grid signal-card-grid-compact vendor-focus-grid">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div key={`focus-skeleton-${index}`} className="signal-card vendor-skeleton-card vendor-skeleton-signal">
                              <AppSkeleton style={{ height: 10, maxWidth: 96, marginBottom: 10 }} />
                              <AppSkeleton style={{ height: 26, maxWidth: 64 }} />
                            </div>
                          ))}
                        </div>
                        <div className="vendor-focus-strip">
                          {Array.from({ length: 2 }).map((_, index) => (
                            <div key={`focus-strip-skeleton-${index}`} className="vendor-focus-strip__item vendor-skeleton-card">
                              <AppSkeleton style={{ height: 10, maxWidth: 104, marginBottom: 10 }} />
                              <AppSkeleton style={{ height: 24, maxWidth: 56 }} />
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="signal-card-grid signal-card-grid-compact vendor-focus-grid">
                          {operationalFocusCards.slice(0, 3).map((card) => (
                            <button
                              key={card.key}
                              type="button"
                              className={`signal-card signal-card-action tone-${card.tone}`}
                              onClick={() => card.actionKey && openShipmentFilter(card.actionKey)}
                            >
                              <span>{card.label}</span>
                              <strong>{card.value}</strong>
                            </button>
                          ))}
                        </div>
                        <div className="vendor-focus-strip">
                          <div className="vendor-focus-strip__item">
                            <span>QR siap diunduh</span>
                            <strong>{qrReadiness.shipments_ready}</strong>
                          </div>
                          <div className="vendor-focus-strip__item">
                            <span>Perlu tindak lanjut</span>
                            <strong>{discrepancyAlert.pending_review}</strong>
                          </div>
                        </div>
                        {criticalScheduleItems.length > 0 && (
                          <div className="schedule-mini-list vendor-focus-list">
                            {criticalScheduleItems.slice(0, 2).map((shipment) => (
                              <div key={shipment.shipmentId} className="schedule-mini-item">
                                <div>
                                  <strong>{shipment.shipmentNumber}</strong>
                                  <span>{shipment.origin}</span>
                                </div>
                                <div>
                                  <span>{formatCompactDateTime(shipment.dispatchAt)}</span>
                                  <strong className={`status-badge ${shipment.signal.tone}`}>{shipment.signal.label}</strong>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="overview-grid overview-grid-secondary vendor-dashboard-grid-secondary">
                <div className="card overview-card vendor-schedule-card">
                  <div className="card-header">
                    <div>
                      <p className="vendor-section-kicker">Jadwal</p>
                      <h2 className="card-title">Pengiriman terdekat</h2>
                    </div>
                    <button className="btn btn-outline" onClick={() => openShipmentFilter('shipping')}>Lihat yang jalan</button>
                  </div>
                  <div className="overview-card-body vendor-list-card-body">
                    {showVendorDashboardSkeleton ? (
                      <VendorInlineListSkeleton count={3} />
                    ) : upcomingShipmentSchedule.length > 0 ? (
                      <div className="vendor-inline-list">
                        {upcomingShipmentSchedule.map((shipment) => {
                          const signal = getScheduleSignal(shipment);
                          return (
                            <button
                              key={shipment.shipmentId}
                              type="button"
                              className="vendor-inline-item"
                              onClick={() => setActiveTab('shipments')}
                            >
                              <div className="vendor-inline-item__main">
                                <strong>{shipment.shipmentNumber}</strong>
                                <span>{shipment.origin}</span>
                              </div>
                              <div className="vendor-inline-item__meta">
                                <span>{formatCompactDateTime(shipment.dispatchAt || shipment.expectedArrivalAt)}</span>
                                <strong className={`status-badge ${signal.tone}`}>{signal.label}</strong>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="overview-empty-state">Belum ada jadwal pengiriman yang bisa dipantau.</div>
                    )}
                  </div>
                </div>

                <div className="card overview-card vendor-recent-card">
                  <div className="card-header">
                    <div>
                      <p className="vendor-section-kicker">Terbaru</p>
                      <h2 className="card-title">Shipment terbaru</h2>
                    </div>
                    <button className="btn btn-outline" onClick={() => setActiveTab('shipments')}>Buka daftar</button>
                  </div>
                  <div className="overview-card-body vendor-list-card-body">
                    {showVendorDashboardSkeleton ? (
                      <VendorInlineListSkeleton count={4} />
                    ) : recentShipmentActivity.length > 0 ? (
                      <div className="vendor-inline-list">
                        {recentShipmentActivity.slice(0, 4).map((activity) => (
                          <button
                            key={activity.shipmentId}
                            type="button"
                            className="vendor-inline-item"
                            onClick={() => setActiveTab('shipments')}
                          >
                            <div className="vendor-inline-item__main">
                              <strong>{activity.shipmentNumber}</strong>
                              <span>{activity.origin}</span>
                            </div>
                            <div className="vendor-inline-item__meta">
                              <span>{formatCompactDateTime(activity.timestamp)}</span>
                              {getStatusBadge(activity.status)}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="overview-empty-state">Belum ada shipment yang bisa ditampilkan.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card vendor-dashboard-table-card">
                <div className="card-header">
                  <div>
                    <p className="vendor-section-kicker">Daftar singkat</p>
                    <h2 className="card-title">Shipment terbaru</h2>
                  </div>
                  <button className="btn btn-outline" onClick={() => setActiveTab('shipments')}>Lihat semua</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Shipment</th>
                      <th>Waktu kirim</th>
                      <th>Asal</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  {showVendorDashboardSkeleton ? (
                    <VendorTableSkeleton columns={4} rows={5} />
                  ) : (
                    <tbody>
                      {recentShipmentActivity.length > 0 ? (
                        recentShipmentActivity.slice(0, 5).map((activity) => (
                          <tr key={activity.shipmentId}>
                            <td><strong>{activity.shipmentNumber}</strong></td>
                            <td>{formatCompactDateTime(activity.timestamp)}</td>
                            <td>{activity.origin}</td>
                            <td>{getStatusBadge(activity.status)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center' }}>Belum ada shipment yang bisa ditampilkan.</td>
                        </tr>
                      )}
                    </tbody>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* SECTION: Shipments List */}
          {activeTab === 'shipments' && (
            <div className="page-section active">
              <div className="card vendor-shipments-card">
                <div className="card-header vendor-shipments-card__header">
                  <div>
                    <p className="vendor-section-kicker">Workspace</p>
                    <h2 className="card-title">Daftar shipment</h2>
                  </div>
                  <AppButton type="button" onClick={() => setActiveTab('create-shipment')}>
                    <i className="fa-solid fa-plus"></i>
                    Shipment baru
                  </AppButton>
                </div>
                <div className="vendor-shipments-toolbar">
                  <div className="vendor-shipments-toolbar__filters">
                    <select className="form-control vendor-shipments-filter" value={shipmentStatusFilter} onChange={(e) => handleShipmentFilterChange(e.target.value)}>
                      <option value="total">Semua status</option>
                      <option value="draft">Belum dikirim</option>
                      <option value="shipping">Sedang dikirim</option>
                      <option value="delivered">Sudah diterima</option>
                      <option value="discrepancy">Perlu tindak lanjut</option>
                    </select>
                  </div>
                  <div className="vendor-shipments-toolbar__summary">
                    <span>
                      {shipmentsMeta.total > 0
                        ? `${shipmentsMeta.from || 1}-${shipmentsMeta.to || filteredShipments.length} dari ${shipmentsMeta.total} shipment`
                        : '0 shipment'}
                    </span>
                  </div>
                </div>
                <table className="vendor-shipments-table">
                  <thead>
                    <tr>
                      <th>Shipment</th>
                      <th>Waktu kirim</th>
                      <th>Asal</th>
                      <th>Status</th>
                      <th className="vendor-shipments-table__action-col">Aksi</th>
                    </tr>
                  </thead>
                  {showVendorShipmentsSkeleton ? (
                    <VendorTableSkeleton columns={5} rows={6} />
                  ) : (
                    <tbody>
                      {filteredShipments.map(ship => (
                        <tr key={ship.ID_outbound}>
                          <td>
                            <div className="vendor-shipment-row__main">
                              <strong>{ship.no_pengiriman || `SHP-${ship.ID_outbound}`}</strong>
                              <span>ID {ship.ID_outbound}</span>
                            </div>
                          </td>
                          <td>{formatDateTime(ship.waktu_kirim)}</td>
                          <td>{ship.lokasi_asal}</td>
                          <td>{getStatusBadge(ship)}</td>
                          <td className="vendor-shipments-table__action-cell">
                            <div className="vendor-shipment-row__actions">
                              {ship.status === 'draft' && (
                                <AppButton
                                  type="button"
                                  variant="secondary"
                                  className="vendor-row-btn vendor-row-btn--icon"
                                  aria-label="Edit draft"
                                  title="Edit draft"
                                  onClick={() => handleEditDraft(ship)}
                                >
                                  <i className="fa-regular fa-pen-to-square"></i>
                                </AppButton>
                              )}
                              {canAccessQrForShipment(ship) && (
                                <AppButton
                                  type="button"
                                  className="vendor-row-btn vendor-row-btn--icon"
                                  aria-label="Lihat QR"
                                  title="Lihat QR"
                                  onClick={() => handleViewQR(ship.ID_outbound)}
                                >
                                  <i className="fa-solid fa-qrcode"></i>
                                </AppButton>
                              )}
                              <AppButton
                                type="button"
                                variant="secondary"
                                className="vendor-row-btn vendor-row-btn--icon"
                                aria-label="Lihat detail"
                                title="Lihat detail"
                                onClick={() => handleViewShipmentDetails(ship)}
                              >
                                <i className="fa-regular fa-eye"></i>
                              </AppButton>
                              {ship.status === 'draft' && (
                                <AppButton
                                  type="button"
                                  className="vendor-row-btn vendor-row-btn--icon"
                                  aria-label="Submit shipment"
                                  title="Submit shipment"
                                  onClick={async () => {
                                    try {
                                      const session = await ensureVendorSession();
                                      if (!session) {
                                        return;
                                      }

                                      await axios.post(`${API_BASE_URL}/api/outbound/${ship.ID_outbound}/submit`, {}, {
                                        headers: session.headers
                                      });
                                      await Promise.all([
                                        fetchShipments(session),
                                        fetchVendorOverview(session),
                                        fetchVendorAnalytics(session),
                                      ]);
                                      handleViewQR(ship.ID_outbound);
                                    } catch (error) {
                                      console.error('Error submitting shipment:', error);
                                      const message = error.response?.data?.message || 'Gagal submit shipment.';
                                      openStatusModal('error', 'Shipment gagal dikirim', message);
                                    }
                                  }}
                                >
                                  <i className="fa-solid fa-paper-plane"></i>
                                </AppButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!shipmentsLoading && filteredShipments.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center' }}>Belum ada shipment untuk status ini.</td>
                        </tr>
                      )}
                    </tbody>
                  )}
                </table>
                {!showVendorShipmentsSkeleton && shipmentsMeta.last_page > 1 && (
                  <div className="vendor-shipments-toolbar" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', marginTop: 0 }}>
                    <div className="vendor-shipments-toolbar__summary">
                      <span>Halaman {shipmentsMeta.current_page} dari {shipmentsMeta.last_page}</span>
                    </div>
                    <div className="vendor-shipment-row__actions">
                      <AppButton
                        type="button"
                        variant="secondary"
                        className="vendor-row-btn"
                        disabled={shipmentsLoading || shipmentsMeta.current_page <= 1}
                        onClick={() => handleShipmentPageChange(shipmentsMeta.current_page - 1)}
                      >
                        Sebelumnya
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        className="vendor-row-btn"
                        disabled={shipmentsLoading || shipmentsMeta.current_page >= shipmentsMeta.last_page}
                        onClick={() => handleShipmentPageChange(shipmentsMeta.current_page + 1)}
                      >
                        Berikutnya
                      </AppButton>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="page-section active">
              <div className="card vendor-shipments-card">
                <div className="card-header vendor-shipments-card__header">
                  <div>
                      <h2 className="card-title">Tindak lanjut R1</h2>
                      <p className="vendor-create-shipment__subtitle">Pantau dokumen instruksi dari manager untuk pengembalian atau pengiriman ulang barang.</p>
                  </div>
                  <div className="vendor-shipments-toolbar__summary">
                    <strong>{reportsData.length}</strong>
                    <span>dokumen</span>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="vendor-shipments-table">
                    <thead>
                      <tr>
                        <th>Nomor dokumen</th>
                        <th>Shipment</th>
                        <th>Produk</th>
                        <th>Status</th>
                        <th>Dibuat pada</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    {showVendorReportsSkeleton ? (
                      <VendorTableSkeleton columns={6} rows={5} />
                    ) : (
                      <tbody>
                        {reportsData.map((report) => (
                          <tr key={report.ID_dokumen}>
                            <td>
                              <div className="vendor-shipment-row__identity">
                                <strong>{report.no_dokumen_r1}</strong>
                                <span>DISC-{report.ID_discrepancy}</span>
                              </div>
                            </td>
                            <td>{report.discrepancy?.shipment?.no_pengiriman || `SHP-${report.discrepancy?.shipment?.ID_outbound || '-'}`}</td>
                            <td>{report.discrepancy?.item?.nama_barang || '-'}</td>
                            <td>
                                <span className={`status-badge ${
                                  report.status_dokumen === 'closing'
                                    ? 'status-delivered'
                                    : report.status_dokumen === 'diproses_vendor' || report.status_dokumen === 'barang_dikirim_ulang'
                                      ? 'status-submitted'
                                      : 'status-discrepancy'
                                }`}>
                                  {reportStatusText[report.status_dokumen] || report.status_dokumen}
                                </span>
                            </td>
                            <td>{formatDateTime(report.dibuat_at)}</td>
                            <td>
                              <div className="vendor-shipment-row__actions">
                                <AppButton
                                  type="button"
                                  variant="secondary"
                                  className="vendor-row-btn"
                                  onClick={() => handleOpenReport(report.ID_dokumen)}
                                >
                                  Detail
                                </AppButton>
                                  {report.status_dokumen === 'dikirim_ke_vendor' && (
                                    <AppButton
                                      type="button"
                                      className="vendor-row-btn"
                                      onClick={() => handleUpdateReportStatus(report.ID_dokumen, 'diproses_vendor')}
                                    >
                                      Setujui & proses
                                    </AppButton>
                                  )}
                                  {report.status_dokumen === 'diproses_vendor' && (
                                    <AppButton
                                      type="button"
                                      className="vendor-row-btn"
                                      onClick={() => handleUpdateReportStatus(report.ID_dokumen, 'barang_dikirim_ulang')}
                                    >
                                      Tandai sudah dikirim ulang
                                    </AppButton>
                                  )}
                                </div>
                              </td>
                            </tr>
                        ))}
                        {!reportsLoading && reportsData.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center' }}>Belum ada dokumen tindak lanjut R1 untuk vendor ini.</td>
                          </tr>
                        )}
                      </tbody>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION: Create Shipment */}
          {activeTab === 'create-shipment' && (
            <div className="page-section active">
                <div className="card vendor-create-shipment">
                <div className="card-header vendor-create-shipment__header">
                  <div className="vendor-create-shipment__title-block">
                    <p className="vendor-section-kicker">Langkah 1</p>
                    <h2 className="card-title">{editingDraftId ? 'Edit draft shipment' : 'Buat shipment baru'}</h2>
                    <p className="vendor-create-shipment__subtitle">
                      {editingDraftId
                        ? `Perbarui draft ${editingDraftNumber || `#${editingDraftId}`} lalu simpan lagi atau langsung submit.`
                        : 'Isi rute, susun item, lalu kirim untuk membuat QR per box.'}
                    </p>
                  </div>
                  <span className="status-badge status-draft">{editingDraftId ? 'Mode: Edit draft' : 'Status: Draft'}</span>
                </div>
                
                <div className="vendor-create-shipment__section">
                  <div className="vendor-create-shipment__section-head">
                    <div className="vendor-create-shipment__step">1</div>
                    <div>
                      <h3>Rute pengiriman</h3>
                      <p>Tentukan asal, gudang tujuan, dan jadwal kirim.</p>
                    </div>
                  </div>
                <div className="form-grid vendor-create-shipment__meta-grid">
                  <div className="form-group">
                    <label className="form-label">Lokasi asal</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={hasPresetOrigin ? '' : 'Contoh: Vendor Warehouse A'}
                      value={lokasiAsal}
                      onChange={(e) => setLokasiAsal(e.target.value)}
                      readOnly={hasPresetOrigin}
                    />
                    {hasPresetOrigin ? (
                      <div className="form-helper-text">Otomatis mengikuti lokasi vendor yang sudah terdaftar.</div>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gudang tujuan</label>
                    <select
                      className={`form-control ${formErrors.targetWarehouseId ? 'form-control-error' : ''}`}
                      value={targetWarehouseId}
                      onChange={(e) => {
                        setTargetWarehouseId(e.target.value);
                        setFormErrors((prev) => ({ ...prev, targetWarehouseId: '' }));
                      }}
                      required
                    >
                      <option value="">Pilih gudang tujuan...</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.ID_gudang} value={warehouse.ID_gudang}>
                          {warehouse.nama_gudang}
                        </option>
                      ))}
                    </select>
                    {formErrors.targetWarehouseId && <div className="form-error-text">{formErrors.targetWarehouseId}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tanggal kirim</label>
                    <input
                      type="date"
                      className={`form-control ${formErrors.waktuKirim ? 'form-control-error' : ''}`}
                      value={waktuKirim}
                      onChange={(e) => {
                        setWaktuKirim(e.target.value);
                        setFormErrors((prev) => ({ ...prev, waktuKirim: '', estimasiTiba: '' }));
                      }}
                      required
                    />
                    {formErrors.waktuKirim && <div className="form-error-text">{formErrors.waktuKirim}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estimasi tiba</label>
                    <input
                      type="date"
                      className={`form-control ${formErrors.estimasiTiba ? 'form-control-error' : ''}`}
                      value={estimasiTiba}
                      min={waktuKirim || undefined}
                      onChange={(e) => {
                        setEstimasiTiba(e.target.value);
                        setFormErrors((prev) => ({ ...prev, estimasiTiba: '' }));
                      }}
                      required
                    />
                    {formErrors.estimasiTiba && <div className="form-error-text">{formErrors.estimasiTiba}</div>}
                  </div>
                </div>
                </div>

                <div className="items-container vendor-create-shipment__section">
                  <div className="vendor-create-shipment__items-head">
                    <div className="vendor-create-shipment__section-head">
                      <div className="vendor-create-shipment__step">2</div>
                      <div>
                        <h3>Isi shipment</h3>
                        <p>Tentukan barang, total quantity, dan quantity per box.</p>
                      </div>
                    </div>
                    <AppButton type="button" variant="secondary" className="vendor-create-shipment__add-btn" onClick={handleAddItem}>
                      <i className="fa-solid fa-plus"></i>
                      Tambah item
                    </AppButton>
                  </div>
                  
                  {items.map((item, index) => {
                    const quantityOutbound = Number(item.quantity_outbound) || 0;
                    const quantityPerBox = Number(item.quantity_per_box) || 0;
                    const derivedBoxes = quantityPerBox > 0 ? Math.ceil(quantityOutbound / quantityPerBox) : 0;

                    return (
                    <div className="item-row" key={index}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Barang</label>
                        <select
                          className="form-control"
                          value={item.product_mode === 'custom' ? 'custom' : item.ID_barang}
                          onChange={(e) => handleProductSelectionChange(index, e.target.value)}
                          disabled={productsLoading}
                        >
                          <option value="">{productsLoading ? 'Memuat produk...' : 'Pilih barang...'}</option>
                          {productOptions.map(product => (
                            <option key={product.ID_barang} value={product.ID_barang}>
                              {product.nama_barang}
                            </option>
                          ))}
                          <option value="custom">Barang kustom</option>
                        </select>
                        {item.product_mode === 'custom' && (
                          <input
                            type="text"
                            className="form-control product-custom-input"
                            placeholder="Masukkan nama barang..."
                            value={item.nama_barang}
                            onChange={(e) => handleItemChange(index, 'nama_barang', e.target.value)}
                          />
                        )}
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Total quantity</label>
                        <input type="number" className="form-control" value={item.quantity_outbound} onChange={(e) => handleItemChange(index, 'quantity_outbound', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Qty Per Box</label>
                        <input type="number" className="form-control" value={item.quantity_per_box} onChange={(e) => handleItemChange(index, 'quantity_per_box', e.target.value)} />
                      </div>
                      <div className="item-row__side">
                        <div className="item-row__summary">
                          <span>Estimasi box</span>
                          <strong>{derivedBoxes || 0}</strong>
                        </div>
                        <button className="btn-icon btn-danger" onClick={() => handleRemoveItem(index)}><i className="fa-solid fa-trash"></i></button>
                      </div>
                    </div>
                  )})}
                </div>

                <div className="vendor-create-shipment__section vendor-create-shipment__summary">
                  <div className="vendor-create-shipment__section-head">
                    <div className="vendor-create-shipment__step">3</div>
                    <div>
                      <h3>Ringkasan sebelum kirim</h3>
                      <p>Cek ulang jumlah item dan total box sebelum draft atau submit.</p>
                    </div>
                  </div>
                  <div className="vendor-create-shipment__summary-grid">
                    <div className="vendor-create-shipment__summary-card">
                      <span>Gudang tujuan</span>
                      <strong>{warehouses.find((warehouse) => String(warehouse.ID_gudang) === String(targetWarehouseId))?.nama_gudang || 'Belum dipilih'}</strong>
                    </div>
                    <div className="vendor-create-shipment__summary-card">
                      <span>Jadwal</span>
                      <strong>{waktuKirim && estimasiTiba ? `${waktuKirim} - ${estimasiTiba}` : 'Belum lengkap'}</strong>
                    </div>
                    <div className="vendor-create-shipment__summary-card">
                      <span>Total item</span>
                      <strong>{items.length}</strong>
                    </div>
                    <div className="vendor-create-shipment__summary-card">
                      <span>Total estimasi box</span>
                      <strong>{items.reduce((total, item) => total + (Number(item.quantity_per_box) > 0 ? Math.ceil((Number(item.quantity_outbound) || 0) / Number(item.quantity_per_box)) : 0), 0)}</strong>
                    </div>
                  </div>
                </div>

                <div className="form-actions vendor-create-shipment__actions">
                  {editingDraftId && (
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        resetShipmentForm(resolveVendorOrigin(user));
                        setActiveTab('shipments');
                      }}
                      disabled={submitLoading}
                    >
                      Batal edit
                    </AppButton>
                  )}
                  <AppButton type="button" variant="secondary" onClick={() => handleSubmitShipment(false)} disabled={submitLoading}>
                    {editingDraftId ? 'Update draft' : 'Simpan draft'}
                  </AppButton>
                  <AppButton type="button" onClick={() => handleSubmitShipment(true)} disabled={submitLoading}>
                    <i className="fa-solid fa-paper-plane" style={{ marginRight: '8px' }}></i> {submitLoading ? 'Memproses...' : editingDraftId ? 'Update & Buat QR' : 'Submit & Buat QR'}
                  </AppButton>
                </div>
              </div>
            </div>
          )}
          {/* SECTION: Notifications */}
          {activeTab === 'notifications' && (
            <div className="page-section active">
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="card-title">Notifikasi</h2>
                  {unreadCount > 0 && (
                    <button className="btn btn-outline" onClick={handleMarkAllAsRead} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      Tandai semua sudah dibaca
                    </button>
                  )}
                </div>
                <div className="notifications-list" style={{ padding: '16px 0' }}>
                  {notificationsLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                      <p>Memuat notifikasi...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <i className="fa-regular fa-bell-slash" style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}></i>
                      <p>Saat ini belum ada notifikasi.</p>
                    </div>
                  ) : (
                    notifications.map(notif => {
                      const isDiscrepancy = isDiscrepancyNotification(notif);
                      return (
                      <div 
                        key={notif.ID_notif} 
                        style={{ 
                          padding: '16px 24px', 
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: notif.sudah_dibaca ? 'transparent' : (isDiscrepancy ? '#fef2f2' : '#f0fdf4'),
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '16px',
                          cursor: (!notif.sudah_dibaca || notif.related_type === 'dokumen_r1') ? 'pointer' : 'default',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => handleNotificationClick(notif)}
                        onMouseEnter={(e) => (!notif.sudah_dibaca || notif.related_type === 'dokumen_r1') && (e.currentTarget.style.backgroundColor = isDiscrepancy ? '#fee2e2' : '#dcfce7')}
                        onMouseLeave={(e) => (!notif.sudah_dibaca || notif.related_type === 'dokumen_r1') && (e.currentTarget.style.backgroundColor = notif.sudah_dibaca ? 'transparent' : (isDiscrepancy ? '#fef2f2' : '#f0fdf4'))}
                      >
                        <div style={{ 
                          width: '40px', height: '40px', borderRadius: '50%', 
                          backgroundColor: isDiscrepancy ? '#fee2e2' : '#dcfce7',
                          color: isDiscrepancy ? '#ef4444' : '#22c55e',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <i className={`fa-solid ${isDiscrepancy ? 'fa-triangle-exclamation' : 'fa-box-open'}`}></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#1e293b' }}>{notif.judul}</h4>
                          <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>{notif.pesan}</p>
                          {notif.related_type === 'dokumen_r1' && (
                            <span style={{ display: 'inline-flex', marginTop: '8px', fontSize: '0.78rem', color: '#b91c1c', fontWeight: 700 }}>
                              Klik untuk membuka dokumen tindak lanjut R1
                            </span>
                          )}
                          <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {new Date(notif.created_at).toLocaleString()}
                          </span>
                        </div>
                        {!notif.sudah_dibaca && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0a2f88', marginTop: '6px', flexShrink: 0 }}></div>
                        )}
                      </div>
                    )})
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION: Settings */}
          {activeTab === 'settings' && (
            <div className="page-section active">
              <div className="settings-grid">
                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Profil akun</h2>
                    <span className="status-badge status-submitted">Akun vendor</span>
                  </div>
                  <div className="settings-profile">
                    <div className="settings-avatar">{user ? user.nama?.charAt(0).toUpperCase() : 'V'}</div>
                    <div>
                      <h3>{user?.nama || 'Vendor Partner'}</h3>
                      <p>{user?.email || 'Email belum tersedia'}</p>
                    </div>
                  </div>
                  <div className="settings-detail-list">
                    <div>
                      <span>Role</span>
                      <strong>{user?.role || 'vendor'}</strong>
                    </div>
                    <div>
                      <span>ID vendor terkait</span>
                      <strong>{user?.ID_vendor || '-'}</strong>
                    </div>
                    <div>
                      <span>Status sesi</span>
                      <strong>Aktif</strong>
                    </div>
                  </div>
                </div>

                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Preferensi notifikasi</h2>
                  </div>
                  <div className="settings-toggles">
                    <label className="settings-toggle-row">
                      <div>
                        <strong>Alert selisih</strong>
                          <span>Tandai mismatch dan dokumen R1 yang butuh tindak lanjut dengan warna merah.</span>
                      </div>
                      <input type="checkbox" checked={settingsPrefs.discrepancyAlerts} onChange={() => handleSettingsPreferenceChange('discrepancyAlerts')} />
                    </label>
                    <label className="settings-toggle-row">
                      <div>
                        <strong>Alert laporan</strong>
                          <span>Tampilkan notifikasi saat manager mengirim dokumen R1 untuk pengembalian atau pengiriman ulang.</span>
                      </div>
                      <input type="checkbox" checked={settingsPrefs.reportAlerts} onChange={() => handleSettingsPreferenceChange('reportAlerts')} />
                    </label>
                    <label className="settings-toggle-row">
                      <div>
                        <strong>Pengingat unduh QR</strong>
                        <span>Biarkan panduan unduh QR tetap terlihat di alur modal QR.</span>
                      </div>
                      <input type="checkbox" checked={settingsPrefs.qrDownloadHint} onChange={() => handleSettingsPreferenceChange('qrDownloadHint')} />
                    </label>
                  </div>
                </div>

                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Shortcut workflow</h2>
                  </div>
                  <div className="settings-actions-list">
                    <button className="settings-action-btn" onClick={() => setActiveTab('create-shipment')}>
                      <i className="fa-solid fa-plus"></i>
                      <div>
                        <strong>Buat shipment baru</strong>
                        <span>Siapkan detail outbound dan buat QR setelah submit.</span>
                      </div>
                    </button>
                    <button className="settings-action-btn" onClick={() => setActiveTab('shipments')}>
                      <i className="fa-solid fa-truck-fast"></i>
                      <div>
                        <strong>Lihat shipment outbound</strong>
                        <span>Buka detail shipment, QR, dan riwayat status.</span>
                      </div>
                    </button>
                    <button className="settings-action-btn" onClick={() => setActiveTab('notifications')}>
                      <i className="fa-regular fa-bell"></i>
                      <div>
                        <strong>Buka notifikasi</strong>
                          <span>Lihat dokumen R1, selisih, dan update shipment.</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Keamanan</h2>
                  </div>
                  <div className="settings-security">
                    <div>
                      <strong>Sesi saat ini</strong>
                      <span>Gunakan logout kalau selesai memakai perangkat bersama.</span>
                    </div>
                    <button className="btn btn-outline settings-logout-btn" onClick={() => setLogoutConfirmOpen(true)}>
                      <i className="fa-solid fa-arrow-right-from-bracket"></i> Keluar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Keluar dari akun vendor?"
        message="Kamu perlu login lagi untuk lanjut mengelola shipment dan QR."
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

      {/* Vendor Report Modal */}
      {reportModalData && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
              <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Dokumen R1 tindak lanjut</h2>
                <p style={{ margin: 0, color: '#64748b' }}>{reportModalData.no_dokumen_r1}</p>
              </div>
              <button onClick={() => setReportModalData(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>

            <div className="vendor-report-sheet">
              <div className="vendor-report-head">
                <div>
                  <span>Shipment</span>
                  <strong>{reportModalData.discrepancy?.shipment?.no_pengiriman || `SHP-${reportModalData.discrepancy?.shipment?.ID_outbound || '-'}`}</strong>
                </div>
                <span className="status-badge status-discrepancy">Instruksi manager</span>
              </div>

              <div className="shipment-detail-grid">
                <div>
                  <span className="detail-label">Vendor</span>
                  <strong>{reportModalData.discrepancy?.shipment?.vendor?.nama_vendor || '-'}</strong>
                </div>
                <div>
                  <span className="detail-label">Asal</span>
                  <strong>{reportModalData.discrepancy?.shipment?.lokasi_asal || '-'}</strong>
                </div>
                <div>
                  <span className="detail-label">Waktu kirim</span>
                  <strong>{formatDateTime(reportModalData.discrepancy?.shipment?.waktu_kirim)}</strong>
                </div>
                <div>
                  <span className="detail-label">Status dokumen</span>
                  <strong>{reportStatusText[reportModalData.status_dokumen] || reportModalData.status_dokumen || '-'}</strong>
                </div>
              </div>

              <div className="vendor-report-mismatch">
                <div>
                  <span>Produk</span>
                  <strong>{reportModalData.discrepancy?.item?.nama_barang || '-'}</strong>
                </div>
                <div>
                  <span>Ekspektasi</span>
                  <strong>{reportModalData.discrepancy?.quantity_outbound ?? '-'}</strong>
                </div>
                <div>
                  <span>Diterima</span>
                  <strong>{reportModalData.discrepancy?.quantity_inbound ?? '-'}</strong>
                </div>
                <div>
                  <span>Selisih</span>
                  <strong style={{ color: '#dc2626' }}>{reportModalData.discrepancy?.selisih ?? '-'}</strong>
                </div>
              </div>

              <div className="vendor-report-notes">
                <span>Instruksi manager</span>
                <p>{reportModalData.keterangan || '-'}</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              {reportModalData.status_dokumen === 'dikirim_ke_vendor' && (
                <button className="btn btn-primary" onClick={() => handleUpdateReportStatus(reportModalData.ID_dokumen, 'diproses_vendor')}>
                    Setujui & proses pengembalian
                </button>
              )}
              {reportModalData.status_dokumen === 'diproses_vendor' && (
                <button className="btn btn-primary" onClick={() => handleUpdateReportStatus(reportModalData.ID_dokumen, 'barang_dikirim_ulang')}>
                    Tandai barang sudah dikirim ulang
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setReportModalData(null)}>Tutup</button>
              <button className="btn btn-primary" onClick={() => openReportPdf(reportModalData, formatDateTime)}>
                <i className="fa-solid fa-file-pdf"></i> Buka PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      <BaseModalShell open={showQRModal} onClose={() => setShowQRModal(false)} panelClassName="vendor-qr-modal-shell">
        <div className="vendor-qr-modal">
          {qrToast.open && (
            <div className={`vendor-qr-toast vendor-qr-toast--${qrToast.type}`} role="status" aria-live="polite">
              <i className={`fa-solid ${qrToast.type === 'success' ? 'fa-check' : 'fa-circle-info'}`}></i>
              <span>{qrToast.message}</span>
            </div>
          )}
          <div className="vendor-qr-modal__header">
            <div>
              <p className="vendor-section-kicker">QR shipment</p>
              <h2>QR untuk shipment {selectedShipmentId || '-'}</h2>
              <p>Unduh QR per box untuk kebutuhan kirim dan verifikasi di gudang tujuan.</p>
            </div>
            <div className="vendor-qr-modal__header-actions">
              <AppButton
                type="button"
                variant="secondary"
                className="vendor-qr-modal__bulk-btn"
                disabled={qrLoading || qrPrintLoading || qrTokens.filter((token) => Boolean(token?.qr_token)).length === 0}
                onClick={handlePrintAllQr}
              >
                <i className={`fa-solid ${qrPrintLoading ? 'fa-spinner fa-spin' : 'fa-print'}`}></i>
                {qrPrintLoading ? 'Menyiapkan print...' : 'Print semua'}
              </AppButton>
              <AppButton
                type="button"
                className="vendor-qr-modal__bulk-btn"
                disabled={qrLoading || qrBulkDownloadLoading || qrPrintLoading || qrTokens.filter((token) => Boolean(token?.qr_token)).length === 0}
                onClick={handleDownloadAllQr}
              >
                <i className={`fa-solid ${qrBulkDownloadLoading ? 'fa-spinner fa-spin' : 'fa-file-zipper'}`}></i>
                {qrBulkDownloadLoading ? 'Menyiapkan ZIP...' : 'Download semua'}
              </AppButton>
              <button type="button" className="vendor-qr-modal__close" onClick={() => setShowQRModal(false)} aria-label="Tutup modal QR">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <div className="vendor-qr-modal__summary">
            <div className="vendor-qr-modal__summary-card">
              <span>Total box</span>
              <strong>{qrTokens.length}</strong>
            </div>
            <div className="vendor-qr-modal__summary-card">
              <span>QR siap diunduh</span>
              <strong>{qrTokens.filter((token) => Boolean(token.qr_token)).length}</strong>
            </div>
          </div>

          <div className="vendor-qr-modal__body">
            {qrLoading ? (
              <div className="vendor-qr-modal__empty">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <p>Memuat QR dan token shipment...</p>
              </div>
            ) : qrTokens.length > 0 ? (
              <div className="vendor-qr-groups">
                {groupedQrTokens.map((group) => (
                  <section key={group.productName} className="vendor-qr-group">
                    <div className="vendor-qr-group__header">
                      <div>
                        <h3>{group.productName}</h3>
                        <p>{group.tokens.length} box siap dipakai untuk kirim dan verifikasi.</p>
                      </div>
                      <div className="vendor-qr-group__actions">
                        <span className="vendor-qr-group__count">{group.tokens.length} box</span>
                        <AppButton
                          type="button"
                          variant="secondary"
                          className="vendor-qr-group__print-btn"
                          disabled={qrLoading || qrPrintLoading || group.tokens.filter((token) => Boolean(token?.qr_token)).length === 0}
                          onClick={() => {
                            setQrPrintLoading(true);
                            try {
                              openQrPrintSheet([group], group.productName);
                            } finally {
                              setQrPrintLoading(false);
                            }
                          }}
                        >
                          <i className={`fa-solid ${qrPrintLoading ? 'fa-spinner fa-spin' : 'fa-print'}`}></i>
                          Print produk
                        </AppButton>
                      </div>
                    </div>

                    <div className="vendor-qr-grid">
                      {group.tokens.map((token) => (
                        <div key={`${group.productName}-${getQrDomKey(token, token._qrIndex)}`} className="qr-token-card">
                        <div className="qr-token-visual">
                            <QRCodeSVG
                              id={`qr-svg-${getQrDomKey(token, token._qrIndex)}`}
                              value={token.qr_token || 'QR_TOKEN_NOT_AVAILABLE'}
                              size={148}
                            />
                          </div>
                          <div className="qr-token-meta">
                            <div className="qr-token-product">{group.productName}</div>
                            <div className="qr-token-caption">
                              <span className="qr-token-box-pill">{token.box_code || (token.box_sequence ? `Box ${token.box_sequence}` : 'Box')}</span>
                              <span>{`Qty ${token.expected_qty_in_box ?? '-'}`}</span>
                            </div>
                          </div>
                          <div className="qr-token-section">
                            <div className="qr-token-label">QR token</div>
                            <div className="qr-token-value" title={token.qr_token || 'Token belum tersedia'}>
                              {token.qr_token || 'Token belum tersedia'}
                            </div>
                          </div>
                          <div className="qr-token-actions">
                            <AppButton
                              type="button"
                              variant="secondary"
                              className="qr-copy-btn"
                              disabled={!token.qr_token}
                              onClick={() => handleCopyQrToken(token.qr_token)}
                            >
                              <i className="fa-regular fa-copy"></i>
                              Salin token
                            </AppButton>
                            <AppButton
                              type="button"
                              className="qr-copy-btn"
                              disabled={!token.qr_token}
                              onClick={() => handleDownloadQr(token, token._qrIndex)}
                            >
                              <i className="fa-solid fa-download"></i>
                              Download QR
                            </AppButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="vendor-qr-modal__empty">
                <i className="fa-solid fa-qrcode"></i>
                <p>Belum ada QR yang tersedia untuk shipment ini.</p>
                <span>Kalau shipment sudah disubmit, kemungkinan QR masih menunggu sinkronisasi backend.</span>
              </div>
            )}
          </div>
        </div>
      </BaseModalShell>

      {/* Shipment Details Modal */}
      {showDetailsModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="modal-content shipment-details-modal" style={{
            backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                Detail shipment {selectedShipmentDetails?.ID_outbound ? `#${selectedShipmentDetails.ID_outbound}` : ''}
              </h2>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>

            {detailsLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                <p>Memuat detail shipment...</p>
              </div>
            ) : selectedShipmentDetails && (
              <>
                <div className="shipment-detail-grid">
                  <div>
                    <span className="detail-label">Lokasi asal</span>
                    <strong>{selectedShipmentDetails.lokasi_asal || '-'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Waktu kirim</span>
                    <strong>{formatDateTime(selectedShipmentDetails.waktu_kirim)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Estimasi tiba</span>
                    <strong>{formatDateTime(selectedShipmentDetails.estimasi_tiba)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Status</span>
                    {getStatusBadge(selectedShipmentDetails)}
                  </div>
                  <div>
                    <span className="detail-label">Nomor shipment</span>
                    <strong>{selectedShipmentDetails.no_pengiriman || '-'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Dibuat pada</span>
                    <strong>{formatDateTime(selectedShipmentDetails.created_at)}</strong>
                  </div>
                </div>

                <div className="shipment-items-table">
                  <h3>Item shipment</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Nama produk</th>
                        <th>Total quantity</th>
                        <th>Quantity per box</th>
                        <th>Box</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedShipmentDetails.details || []).map((detail) => (
                        <tr key={detail.ID_outbound_detail}>
                          <td>{detail.nama_barang || `Barang ${detail.ID_barang || '-'}`}</td>
                          <td>{detail.quantity_outbound ?? '-'}</td>
                          <td>{detail.quantity_per_box ?? '-'}</td>
                          <td>{detail.jumlah_box ?? '-'}</td>
                        </tr>
                      ))}
                      {(!selectedShipmentDetails.details || selectedShipmentDetails.details.length === 0) && (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center' }}>Belum ada detail item.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                  {normalizeStatus(selectedShipmentDetails?.status) === 'draft' && (
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowDetailsModal(false);
                        handleEditDraft(selectedShipmentDetails);
                      }}
                    >
                      Edit draft
                    </AppButton>
                  )}
                  {selectedShipmentDetails?.ID_outbound && normalizeStatus(selectedShipmentDetails?.status) !== 'draft' && (
                    <AppButton
                      type="button"
                      onClick={() => {
                        const shipmentId = selectedShipmentDetails.ID_outbound;
                        setShowDetailsModal(false);
                        if (shipmentId) {
                          handleViewQR(shipmentId);
                        }
                      }}
                    >
                      <i className="fa-solid fa-qrcode"></i> Lihat QR
                    </AppButton>
                  )}
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => setShowDetailsModal(false)}
                  >
                    Tutup
                  </AppButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
