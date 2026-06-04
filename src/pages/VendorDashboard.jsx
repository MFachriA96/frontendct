import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE_URL } from '../config/api';
import {
  buildRecentShipmentActivity,
  buildShipmentChartSegments,
  buildVendorDashboardHeroMetrics,
  buildVendorDashboardPrimaryCards,
  buildVendorSummaryCards,
  buildQrDownloadLabel,
  canAccessQrForShipment,
  filterShipmentsByStatusGroup,
  getQrProductName,
  hasShipmentDiscrepancy,
  getUpcomingShipmentSchedule,
  getShipmentStatusCounts,
  normalizeStatus,
  normalizeQrTokens,
  validateOutboundSchedule,
  normalizeAnalyticsResponse,
  buildTrendChartData,
  buildScheduleRiskCards,
  buildActionQueueCards,
  buildTopDiscrepancyPartHighlights,
  summarizeAuditEvidence,
} from '../utils/dashboardLogic';
import AnalyticsTrendChart from '../components/AnalyticsTrendChart';
import AppSidebar from '../components/navigation/AppSidebar';
import AppButton from '../components/ui/AppButton';
import ConfirmModal from '../components/ui/ConfirmModal';
import './VendorDashboard.css';

const vendorStatusText = {
  draft: 'Belum Dikirim',
  submitted: 'Siap Diproses',
  in_transit: 'Sedang Dikirim',
  arrived: 'Sudah Tiba',
  verified: 'Sudah Dicek',
  delivered: 'Selesai',
  discrepancy: 'Perlu Tindak Lanjut',
};

const resolveVendorOrigin = (vendorUser) => (
  vendorUser?.vendor?.lokasi_vendor
  || vendorUser?.lokasi_vendor
  || ''
);

ChartJS.register(ArcElement, Legend, Tooltip);

const VendorDashboard = () => {
  const approvedProductNames = [
    'Printer Housing Cover',
    'Paper Tray Assembly',
    'Scanner Unit Assembly',
    'Ink Tank Module',
    'Print Head Unit',
    'Paper Feed Assembly',
    'Control Panel Assembly',
    'Power Supply Unit',
    'Mainboard Assembly',
    'Roller Assembly'
  ];

  const [activeTab, setActiveTab] = useState('dashboard');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('total');
  const [shipments, setShipments] = useState([]);
  const [vendorOverview, setVendorOverview] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [vendorAnalytics, setVendorAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [productOptions, setProductOptions] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [user, setUser] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  
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
  const [qrCache, setQrCache] = useState({});

  // Shipment Details Modal State
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedShipmentDetails, setSelectedShipmentDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [reportModalData, setReportModalData] = useState(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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

  const navigate = useNavigate();
  const vendorOrigin = resolveVendorOrigin(user);
  const hasPresetOrigin = Boolean(vendorOrigin);

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
      alert(message);
    }
    navigate('/login');
  };

  const ensureVendorSession = async ({ silent = false } = {}) => {
    try {
      const { token, headers } = getAuthHeaders();

      if (!token) {
        if (!silent) {
          forceLogoutToLogin('Your session was not found. Please log in again as a vendor.');
        }
        return null;
      }

      const response = await axios.get(`${API_BASE_URL}/api/auth/me`, { headers });
      const backendUser = response.data?.data || null;

      if (!backendUser || String(backendUser.role).toLowerCase() !== 'vendor' || !backendUser.ID_vendor) {
        if (!silent) {
          forceLogoutToLogin('This account is not a valid vendor-linked user. Please log in with a vendor account before creating shipments.');
        }
        return null;
      }

      setUser(backendUser);
      localStorage.setItem('user', JSON.stringify(backendUser));
      return { token, headers, user: backendUser };
    } catch (error) {
      console.error('Failed to verify vendor session:', error);
      if (!silent) {
        forceLogoutToLogin('Your login session is no longer valid. Please log in again as a vendor.');
      }
      return null;
    }
  };

  const fetchShipments = async (session) => {
    try {
      setShipmentsLoading(true);
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setShipments([]);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/outbound`, {
        headers: activeSession.headers
      });
      const resData = response.data.data;
      const shipmentsArray = Array.isArray(resData) ? resData : (resData?.data || []);
      setShipments(shipmentsArray);
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
      setVendorOverview(response.data?.data || null);
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
            .filter(product => approvedProductNames.includes(product.nama_barang))
            .sort((a, b) => approvedProductNames.indexOf(a.nama_barang) - approvedProductNames.indexOf(b.nama_barang))
        : [];
      setProductOptions(approvedProducts);
    } catch (error) {
      console.error('Error fetching product options:', error);
      setProductOptions([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchWarehouses = async (session) => {
    try {
      const activeSession = session || await ensureVendorSession({ silent: true });
      if (!activeSession) {
        setWarehouses([]);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/master/gudang`, {
        headers: activeSession.headers,
      });
      const payload = response.data?.data;
      setWarehouses(Array.isArray(payload) ? payload : (payload?.data || []));
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      setWarehouses([]);
    }
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

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/dokumen-r1/${notif.related_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReportModalData(response.data?.data || null);
    } catch (error) {
      console.error('Error loading vendor report:', error);
      alert('Failed to load the mismatch report.');
    }
  };

  const handleNotificationPreviewClick = async (notif) => {
    setNotificationMenuOpen(false);
    await handleNotificationClick(notif);

    if (notif.related_type !== 'dokumen_r1') {
      setActiveTab('notifications');
    }
  };

  async function fetchVendorAnalytics() {
    const token = localStorage.getItem('token');
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dashboard/vendor-analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVendorAnalytics(normalizeAnalyticsResponse(res.data));
    } catch (err) {
      setAnalyticsError(err.response?.data?.message || err.message || 'Failed to load analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    const initializeDashboard = async () => {
      setAuthChecking(true);
      const session = await ensureVendorSession();
      if (!session) {
        setAuthChecking(false);
        return;
      }

      await Promise.all([
        fetchShipments(session),
        fetchVendorOverview(session),
      ]);
      setAuthChecking(false);
      void fetchVendorAnalytics();
      void fetchNotifications(session);
      void fetchProductOptions(session);
      void fetchWarehouses(session);
    };

    initializeDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleAddItem = () => {
    setItems([...items, { ID_barang: '', nama_barang: '', product_mode: 'select', quantity_outbound: 100, quantity_per_box: 10 }]);
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
      nextErrors.waktuKirim = 'Dispatch Date is required.';
    }

    if (!estimasiTiba) {
      nextErrors.estimasiTiba = 'Expected Arrival is required.';
    }

    if (!targetWarehouseId) {
      nextErrors.targetWarehouseId = 'Target warehouse is required.';
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

    setFormErrors({});
    setSubmitLoading(true);
    try {
      const session = await ensureVendorSession();
      if (!session) {
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
        details: details
      };

      const res = await axios.post(`${API_BASE_URL}/api/outbound`, payload, {
        headers: session.headers
      });
      
      const outboundId = res.data.data.ID_outbound;

      if (isSubmit) {
        await axios.post(`${API_BASE_URL}/api/outbound/${outboundId}/submit`, {}, {
          headers: session.headers
        });
        
        // Fetch QR
        const qrRes = await axios.get(`${API_BASE_URL}/api/outbound/${outboundId}/qr-token`, {
          headers: session.headers
        });
        const fetchedTokens = normalizeQrTokens(qrRes.data);
        setQrTokens(fetchedTokens);
        setQrCache(prev => ({ ...prev, [outboundId]: fetchedTokens }));
        setSelectedShipmentId(outboundId);
        setShowQRModal(true);
      } else {
        alert('Shipment saved as draft successfully!');
      }

      // Reset form
      setLokasiAsal(resolveVendorOrigin(session.user));
      setTargetWarehouseId('');
      setWaktuKirim('');
      setEstimasiTiba('');
      setFormErrors({});
      setItems([{ ID_barang: '', nama_barang: '', product_mode: 'select', quantity_outbound: 100, quantity_per_box: 10 }]);
      setActiveTab('shipments');
      await Promise.all([
        fetchShipments(session),
        fetchVendorOverview(session),
      ]);

    } catch (error) {
      console.error(error);
      const apiMessage = error.response?.data?.message || error.message;
      alert(`Error: ${apiMessage}`);
    } finally {
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
      alert('Failed to load QR Tokens.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleCopyQrToken = async (qrToken) => {
    if (!qrToken) {
      alert('QR token is not available for this item yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(qrToken);
      alert('QR token copied successfully.');
    } catch (error) {
      console.error('Failed to copy QR token:', error);
      alert(`Failed to copy automatically. Please copy this token manually: ${qrToken}`);
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

  const getQrFileName = (token, index) => {
    const detailId = token?.ID_outbound_detail || index + 1;
    return `shipment-${selectedShipmentId || 'qr'}-detail-${detailId}-qr.png`;
  };

  const handleDownloadQr = (token, index) => {
    if (!token?.qr_token) {
      alert('QR token is not available for this item yet.');
      return;
    }

    const svgElement = document.getElementById(`qr-svg-${token.ID_outbound_detail || index}`);
    if (!svgElement) {
      alert('QR code is still rendering. Please try again.');
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const padding = 24;
      const qrSize = 180;
      const label = buildQrDownloadLabel(token);
      const labelLines = label.split(' | ');
      const canvas = document.createElement('canvas');
      canvas.width = qrSize + padding * 2;
      canvas.height = qrSize + padding * 2 + 72;

      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, padding, padding, qrSize, qrSize);
      context.fillStyle = '#0f172a';
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.font = '700 14px Arial, sans-serif';
      context.fillText(labelLines[0], canvas.width / 2, padding + qrSize + 12, canvas.width - padding * 2);
      context.font = '12px Arial, sans-serif';
      context.fillStyle = '#475569';
      context.fillText(labelLines[1], canvas.width / 2, padding + qrSize + 32, canvas.width - padding * 2);
      context.font = '11px "Courier New", monospace';
      context.fillText(labelLines[2], canvas.width / 2, padding + qrSize + 50, canvas.width - padding * 2);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(svgUrl);
        if (!blob) {
          alert('Failed to prepare QR image for download.');
          return;
        }

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = getQrFileName(token, index);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);
      }, 'image/png');
    };

    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      alert('Failed to prepare QR image for download.');
    };

    image.src = svgUrl;
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
      alert('Failed to load shipment details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const openReportPdf = (report) => {
    if (!report) return;

    const discrepancy = report.discrepancy || {};
    const shipment = discrepancy.shipment || {};
    const item = discrepancy.item || {};
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>${report.no_dokumen_r1 || 'Mismatch Report'}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #1e293b; margin: 32px; }
            .header { border-bottom: 3px solid #003399; padding-bottom: 18px; margin-bottom: 24px; }
            h1 { margin: 0 0 8px; color: #003399; }
            .muted { color: #64748b; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0; }
            .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; }
            .label { display: block; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; }
            .danger { color: #dc2626; font-weight: 700; }
            .notes { white-space: pre-wrap; line-height: 1.5; }
            .footer { margin-top: 36px; color: #64748b; font-size: 12px; }
            @media print { button { display: none; } body { margin: 20px; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()" style="float:right;padding:10px 14px;background:#003399;color:#fff;border:0;border-radius:6px;">Print / Save PDF</button>
          <div class="header">
            <h1>Mismatch Report</h1>
            <div class="muted">${report.no_dokumen_r1 || '-'} • Status: ${(report.status_dokumen || '-').replaceAll('_', ' ')}</div>
          </div>
          <div class="grid">
            <div class="box"><span class="label">Vendor</span><strong>${shipment.vendor?.nama_vendor || '-'}</strong></div>
            <div class="box"><span class="label">Shipment</span><strong>${shipment.no_pengiriman || `SHP-${shipment.ID_outbound || '-'}`}</strong></div>
            <div class="box"><span class="label">Origin</span><strong>${shipment.lokasi_asal || '-'}</strong></div>
            <div class="box"><span class="label">Dispatch Time</span><strong>${formatDateTime(shipment.waktu_kirim)}</strong></div>
          </div>
          <table>
            <thead><tr><th>Product</th><th>Expected</th><th>Received Accepted</th><th>Difference</th><th>Status</th></tr></thead>
            <tbody>
              <tr>
                <td>${item.nama_barang || '-'}</td>
                <td>${discrepancy.quantity_outbound ?? '-'}</td>
                <td>${discrepancy.quantity_inbound ?? '-'}</td>
                <td class="danger">${discrepancy.selisih ?? '-'}</td>
                <td>${discrepancy.status || '-'}</td>
              </tr>
            </tbody>
          </table>
          <h2>Report Notes</h2>
          <div class="box notes">${report.keterangan || '-'}</div>
          <div class="footer">Generated by Epson Verification System on ${formatDateTime(report.dibuat_at || new Date())}</div>
        </body>
      </html>
    `;

    const reportBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const reportUrl = URL.createObjectURL(reportBlob);
    const reportWindow = window.open(reportUrl, '_blank');

    if (!reportWindow) {
      const link = document.createElement('a');
      link.href = reportUrl;
      link.download = `${report.no_dokumen_r1 || 'mismatch-report'}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    window.setTimeout(() => URL.revokeObjectURL(reportUrl), 60000);
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
      case 'draft': return <span className="status-badge status-draft"><i className="fa-solid fa-pen"></i> Masih Disiapkan</span>;
      case 'submitted': return <span className="status-badge status-submitted"><i className="fa-solid fa-paper-plane"></i> Siap Dikirim</span>;
      case 'in_transit': return <span className="status-badge status-submitted"><i className="fa-solid fa-truck-fast"></i> Sedang Dikirim</span>;
      case 'arrived': return <span className="status-badge status-delivered"><i className="fa-solid fa-check"></i> Sudah Tiba</span>;
      case 'verified': return <span className="status-badge status-delivered"><i className="fa-solid fa-check-double"></i> Sudah Diverifikasi</span>;
      case 'delivered': return <span className="status-badge status-delivered"><i className="fa-solid fa-box-open"></i> Selesai</span>;
      case 'discrepancy': return <span className="status-badge status-discrepancy"><i className="fa-solid fa-triangle-exclamation"></i> Perlu Klarifikasi</span>;
      default: return <span className="status-badge status-draft">{String(status || 'Unknown').replace(/_/g, ' ')}</span>;
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
  const filteredShipments = filterShipmentsByStatusGroup(shipments, shipmentStatusFilter);
  const vendorSummaryCards = buildVendorSummaryCards(overviewCounts);
  const recentShipmentActivity = buildRecentShipmentActivity(shipments, 8);
  const shipmentChartSegments = buildShipmentChartSegments(overviewCounts);
  const upcomingShipmentSchedule = getUpcomingShipmentSchedule(shipments, 4);
  const secondaryDashboardLoading = notificationsLoading || productsLoading;
  const qrReadiness = vendorOverview?.qr_readiness || {
    shipments_ready: shipments.filter((shipment) => shipment.qr_ready).length,
    shipments_not_ready: shipments.filter((shipment) => !shipment.qr_ready && normalizeStatus(shipment.status) !== 'draft').length,
    total_qr: shipments.reduce((total, shipment) => total + Number(shipment.total_qr || 0), 0),
    ready_qr: shipments.reduce((total, shipment) => total + Number(shipment.ready_qr || 0), 0),
  };
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
  const vendorStatusChartData = shipmentChartSegments
    .filter((segment) => segment.value > 0)
    .map((segment) => ({
      ...segment,
      name: vendorSummaryCards.find((card) => card.key === segment.key)?.label || segment.label,
    }));
  const vendorStatusChart = {
    labels: vendorStatusChartData.map((segment) => segment.name),
    datasets: [
      {
        data: vendorStatusChartData.map((segment) => segment.value),
        backgroundColor: vendorStatusChartData.map((segment) => segment.color),
        borderWidth: 0,
      },
    ],
  };
  const vendorStatusChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 16,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: ${context.raw} shipment`,
        },
      },
    },
  };
  const analyticsModel = vendorAnalytics || normalizeAnalyticsResponse(null);
  const analyticsTopParts = buildTopDiscrepancyPartHighlights(analyticsModel.discrepancy_by_part, 3);
  const analyticsRiskCards = buildScheduleRiskCards(analyticsModel.schedule_risk);
  const analyticsActionCards = buildActionQueueCards(analyticsModel.action_queue);
  const analyticsAuditSummary = summarizeAuditEvidence(analyticsModel.audit_evidence_summary);
  const analyticsTrendData = buildTrendChartData(analyticsModel.trend_by_date);
  const analyticsPreviewAvailable = Boolean(vendorAnalytics) && !analyticsError;
  const analyticsPending = analyticsLoading && !vendorAnalytics;
  const topDiscrepancyTotal = analyticsTopParts.reduce((total, part) => total + Number(part.total_non_match || 0), 0);
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

    return { label: vendorStatusText[status] || 'Dipantau', tone: 'status-draft' };
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
            <p>Verifying vendor session...</p>
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
          { value: 'shipments', label: 'Outbound shipments', icon: 'fa-solid fa-truck-fast' },
          { value: 'create-shipment', label: 'Create shipment', icon: 'fa-solid fa-plus-circle' },
          { value: 'notifications', label: 'Notifications', icon: 'fa-regular fa-bell' },
        ]}
        onSelect={setActiveTab}
        onSignOut={() => setLogoutConfirmOpen(true)}
      />

      {/* Main Content */}
      <main className="main-wrapper">
        
        {/* Header */}
        <header className="header">
          <h1 className="page-title">
            {activeTab === 'dashboard' && 'Vendor Dashboard'}
            {activeTab === 'shipments' && 'Outbound Shipments'}
            {activeTab === 'create-shipment' && 'Create Shipment'}
            {activeTab === 'notifications' && 'Notifications'}
            {activeTab === 'settings' && 'Settings'}
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
                    <strong>Notifications</strong>
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
                      Mark all
                    </button>
                  )}
                </div>

                <div className="notification-preview-list">
                  {notificationsLoading ? (
                    <div className="notification-preview-empty">Loading notifications...</div>
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
                  Open Notifications
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
                  <span>Settings</span>
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
                  <span>Notifications</span>
                  {unreadCount > 0 && <strong>{unreadCount}</strong>}
                </button>
                <button
                  type="button"
                  className="profile-menu-item danger"
                  onClick={handleLogout}
                  role="menuitem"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket"></i>
                  <span>Logout</span>
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
              <div className="stats-grid">
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

              <div className="overview-grid overview-grid-primary">
                <div className="card overview-card overview-card-feature vendor-hero-card">
                  <div className="card-header">
                    <h2 className="card-title">Pergerakan Pengiriman</h2>
                    <button className="btn btn-outline" onClick={() => fetchVendorAnalytics()} disabled={analyticsLoading}>Refresh insight</button>
                  </div>
                  <div className="overview-card-body vendor-hero-panel">
                    {analyticsPending ? (
                      <>
                        <div className="vendor-hero-chip-row">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="vendor-hero-chip vendor-skeleton-card">
                              <span className="vendor-skeleton-line short"></span>
                              <strong className="vendor-skeleton-line value"></strong>
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
                            <AnalyticsTrendChart data={analyticsTrendData} theme="light" />
                          </div>
                        ) : (
                          <div className="overview-empty-state">Analytics operasional belum siap ditampilkan.</div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="card overview-card overview-card-compact">
                  <div className="card-header">
                    <h2 className="card-title">Antrean Tindakan & Risiko</h2>
                    <span className="status-badge status-submitted">Hari Ini</span>
                  </div>
                  <div className="overview-card-body">
                    <div className="signal-card-grid signal-card-grid-compact">
                      {operationalFocusCards.slice(0, 4).map((card) => (
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
                    {criticalScheduleItems.length > 0 ? (
                      <div className="schedule-mini-list">
                        {criticalScheduleItems.map((shipment) => (
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
                    ) : (
                      <div className="overview-empty-state">Belum ada shipment kritikal untuk dijadikan pengingat operasional.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="overview-grid overview-grid-secondary">
                <div className="card overview-card">
                  <div className="card-header">
                    <h2 className="card-title">Part Paling Sering Selisih</h2>
                    <span className="status-badge status-discrepancy">{topDiscrepancyTotal} kasus utama</span>
                  </div>
                  <div className="overview-card-body">
                    {analyticsPending ? (
                      <div className="top-part-list">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div key={index} className="top-part-item vendor-skeleton-card vendor-skeleton-row"></div>
                        ))}
                      </div>
                    ) : analyticsPreviewAvailable && analyticsTopParts.length > 0 ? (
                      <div className="top-part-list">
                        {analyticsTopParts.map((part) => (
                          <div key={part.part_id || part.part_name} className="top-part-item">
                            <div>
                              <strong>{part.part_name || `Part ${part.part_id || '-'}`}</strong>
                              <span>
                                Mismatch {part.mismatch || 0} | Missing {part.missing || 0} | Over {part.over || 0}
                              </span>
                            </div>
                            <div>
                              <strong>{part.total_non_match || 0}</strong>
                              <span>Total kasus</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="overview-empty-state">Belum ada analytics part yang siap ditampilkan.</div>
                    )}
                  </div>
                </div>

                <div className="card overview-card">
                  <div className="card-header">
                    <h2 className="card-title">Kesiapan QR & Bukti Audit</h2>
                    {secondaryDashboardLoading && <span className="status-badge status-draft">Sinkronisasi</span>}
                  </div>
                  <div className="overview-card-body">
                    <div className="signal-card-grid">
                      <div className="signal-card tone-info">
                        <span>QR Siap</span>
                        <strong>{qrReadiness.shipments_ready}</strong>
                      </div>
                      <div className="signal-card tone-warning">
                        <span>QR Belum Lengkap</span>
                        <strong>{qrReadiness.shipments_not_ready}</strong>
                      </div>
                      <div className="signal-card tone-success">
                        <span>Cocok / Match</span>
                        <strong>{discrepancyAlert.by_status?.match || 0}</strong>
                      </div>
                      <div className="signal-card tone-danger">
                        <span>Selisih Kuantitas</span>
                        <strong>{discrepancyAlert.by_status?.mismatch || 0}</strong>
                      </div>
                      <div className="signal-card tone-danger">
                        <span>Barang Kurang</span>
                        <strong>{discrepancyAlert.by_status?.missing || 0}</strong>
                      </div>
                      <div className="signal-card tone-warning">
                        <span>Kelebihan</span>
                        <strong>{discrepancyAlert.by_status?.over || 0}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Aktivitas Pengiriman Terbaru</h2>
                  <button className="btn btn-outline" onClick={() => setActiveTab('shipments')}>Lihat Semua</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Nomor Shipment</th>
                      <th>Waktu Kirim</th>
                      <th>Asal</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentsLoading ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center' }}>Memuat data pengiriman...</td>
                      </tr>
                    ) : recentShipmentActivity.length > 0 ? (
                      recentShipmentActivity.map((activity) => (
                        <tr key={activity.shipmentId}>
                          <td><strong>{activity.shipmentNumber}</strong></td>
                          <td>{formatCompactDateTime(activity.timestamp)}</td>
                          <td>{activity.origin}</td>
                          <td>{getStatusBadge(activity.status)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center' }}>Belum ada aktivitas pengiriman.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION: Shipments List */}
          {activeTab === 'shipments' && (
            <div className="page-section active">
              <div className="card">
                <div className="card-header" style={{ display: 'flex', gap: '16px' }}>
                  <input type="text" className="form-control" placeholder="Search by ID or Destination..." style={{ maxWidth: '300px' }} />
                  <select className="form-control" style={{ maxWidth: '200px' }} value={shipmentStatusFilter} onChange={(e) => setShipmentStatusFilter(e.target.value)}>
                    <option value="total">All Status</option>
                    <option value="draft">Belum Dikirim</option>
                    <option value="shipping">Sedang Dikirim</option>
                    <option value="delivered">Sudah Diterima</option>
                    <option value="discrepancy">Perlu Tindak Lanjut</option>
                  </select>
                  <div style={{ flex: 1 }}></div>
                  <button className="btn btn-primary" onClick={() => setActiveTab('create-shipment')}><i className="fa-solid fa-plus"></i> New Shipment</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Shipment ID</th>
                      <th>Dispatch Time</th>
                      <th>Origin</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentsLoading ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center' }}>Loading shipments...</td>
                      </tr>
                    ) : filteredShipments.map(ship => (
                      <tr key={ship.ID_outbound}>
                        <td><strong>{ship.ID_outbound}</strong></td>
                        <td>{formatDateTime(ship.waktu_kirim)}</td>
                        <td>{ship.lokasi_asal}</td>
                          <td>{getStatusBadge(ship)}</td>
                        <td>
                          {ship.status === 'draft' && (
                            <button className="btn btn-primary" style={{ padding: '6px 12px', marginRight: '8px' }} onClick={async () => {
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
                                ]);
                                handleViewQR(ship.ID_outbound);
                              } catch (error) {
                                console.error('Error submitting shipment:', error);
                                alert('Error submitting shipment');
                              }
                            }}>Submit</button>
                          )}
                          {canAccessQrForShipment(ship) && (
                            <button className="btn btn-primary" style={{ padding: '6px 12px', marginRight: '8px' }} onClick={() => handleViewQR(ship.ID_outbound)}>QR Code</button>
                          )}
                          <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleViewShipmentDetails(ship)}>Details</button>
                        </td>
                      </tr>
                    ))}
                    {!shipmentsLoading && filteredShipments.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center' }}>No shipments found for this status.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION: Create Shipment */}
          {activeTab === 'create-shipment' && (
            <div className="page-section active">
              <div className="card vendor-create-shipment">
                <div className="card-header vendor-create-shipment__header">
                  <div className="vendor-create-shipment__title-block">
                    <h2 className="card-title">Create Outbound Shipment</h2>
                    <p className="vendor-create-shipment__subtitle">Prepare shipment details once, then submit to generate QR per box.</p>
                  </div>
                  <span className="status-badge status-draft">Status: Draft</span>
                </div>
                
                <div className="form-grid vendor-create-shipment__meta-grid">
                  <div className="form-group">
                    <label className="form-label">Origin (Lokasi Asal)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder={hasPresetOrigin ? '' : 'e.g. Vendor Warehouse A'}
                      value={lokasiAsal}
                      onChange={(e) => setLokasiAsal(e.target.value)}
                      readOnly={hasPresetOrigin}
                    />
                    {hasPresetOrigin ? (
                      <div className="form-helper-text">Origin uses the vendor location already configured in master data.</div>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Target Warehouse</label>
                    <select
                      className={`form-control ${formErrors.targetWarehouseId ? 'form-control-error' : ''}`}
                      value={targetWarehouseId}
                      onChange={(e) => {
                        setTargetWarehouseId(e.target.value);
                        setFormErrors((prev) => ({ ...prev, targetWarehouseId: '' }));
                      }}
                      required
                    >
                      <option value="">Choose warehouse...</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.ID_gudang} value={warehouse.ID_gudang}>
                          {warehouse.nama_gudang}
                        </option>
                      ))}
                    </select>
                    {formErrors.targetWarehouseId && <div className="form-error-text">{formErrors.targetWarehouseId}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dispatch Date (Waktu Kirim)</label>
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
                    <label className="form-label">Expected Arrival (Estimasi Tiba)</label>
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

                <div className="items-container">
                  <div className="vendor-create-shipment__items-head">
                    <div>
                      <h3>Shipment Items</h3>
                      <p>Set product, total quantity, and quantity per box. Box count is calculated automatically.</p>
                    </div>
                    <AppButton type="button" variant="secondary" className="vendor-create-shipment__add-btn" onClick={handleAddItem}>
                      <i className="fa-solid fa-plus"></i>
                      Add item
                    </AppButton>
                  </div>
                  
                  {items.map((item, index) => {
                    const quantityOutbound = Number(item.quantity_outbound) || 0;
                    const quantityPerBox = Number(item.quantity_per_box) || 0;
                    const derivedBoxes = quantityPerBox > 0 ? Math.ceil(quantityOutbound / quantityPerBox) : 0;

                    return (
                    <div className="item-row" key={index}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Item / Product Name</label>
                        <select
                          className="form-control"
                          value={item.product_mode === 'custom' ? 'custom' : item.ID_barang}
                          onChange={(e) => handleProductSelectionChange(index, e.target.value)}
                          disabled={productsLoading}
                        >
                          <option value="">{productsLoading ? 'Loading products...' : 'Choose product...'}</option>
                          {productOptions.map(product => (
                            <option key={product.ID_barang} value={product.ID_barang}>
                              {product.nama_barang}
                            </option>
                          ))}
                          <option value="custom">Custom Product</option>
                        </select>
                        {item.product_mode === 'custom' && (
                          <input
                            type="text"
                            className="form-control product-custom-input"
                            placeholder="Enter custom product name..."
                            value={item.nama_barang}
                            onChange={(e) => handleItemChange(index, 'nama_barang', e.target.value)}
                          />
                        )}
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Total Quantity</label>
                        <input type="number" className="form-control" value={item.quantity_outbound} onChange={(e) => handleItemChange(index, 'quantity_outbound', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Qty Per Box</label>
                        <input type="number" className="form-control" value={item.quantity_per_box} onChange={(e) => handleItemChange(index, 'quantity_per_box', e.target.value)} />
                      </div>
                      <div className="item-row__side">
                        <div className="item-row__summary">
                          <span>Estimated boxes</span>
                          <strong>{derivedBoxes || 0}</strong>
                        </div>
                        <button className="btn-icon btn-danger" onClick={() => handleRemoveItem(index)}><i className="fa-solid fa-trash"></i></button>
                      </div>
                    </div>
                  )})}
                </div>

                <div className="form-actions vendor-create-shipment__actions">
                  <AppButton type="button" variant="secondary" onClick={() => handleSubmitShipment(false)} disabled={submitLoading}>
                    Save as draft
                  </AppButton>
                  <AppButton type="button" onClick={() => handleSubmitShipment(true)} disabled={submitLoading}>
                    <i className="fa-solid fa-paper-plane" style={{ marginRight: '8px' }}></i> {submitLoading ? 'Processing...' : 'Submit & Generate QR'}
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
                  <h2 className="card-title">Notifications</h2>
                  {unreadCount > 0 && (
                    <button className="btn btn-outline" onClick={handleMarkAllAsRead} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="notifications-list" style={{ padding: '16px 0' }}>
                  {notificationsLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                      <p>Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <i className="fa-regular fa-bell-slash" style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}></i>
                      <p>You have no notifications at the moment.</p>
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
                              Click to open mismatch PDF report
                            </span>
                          )}
                          <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {new Date(notif.created_at).toLocaleString()}
                          </span>
                        </div>
                        {!notif.sudah_dibaca && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', marginTop: '6px', flexShrink: 0 }}></div>
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
                    <h2 className="card-title">Account Profile</h2>
                    <span className="status-badge status-submitted">Vendor Account</span>
                  </div>
                  <div className="settings-profile">
                    <div className="settings-avatar">{user ? user.nama?.charAt(0).toUpperCase() : 'V'}</div>
                    <div>
                      <h3>{user?.nama || 'Vendor Partner'}</h3>
                      <p>{user?.email || 'No email available'}</p>
                    </div>
                  </div>
                  <div className="settings-detail-list">
                    <div>
                      <span>Role</span>
                      <strong>{user?.role || 'vendor'}</strong>
                    </div>
                    <div>
                      <span>Linked Vendor ID</span>
                      <strong>{user?.ID_vendor || '-'}</strong>
                    </div>
                    <div>
                      <span>Session Status</span>
                      <strong>Active</strong>
                    </div>
                  </div>
                </div>

                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Notification Preferences</h2>
                  </div>
                  <div className="settings-toggles">
                    <label className="settings-toggle-row">
                      <div>
                        <strong>Discrepancy Alerts</strong>
                        <span>Highlight mismatch and R1 report notifications in red.</span>
                      </div>
                      <input type="checkbox" checked={settingsPrefs.discrepancyAlerts} onChange={() => handleSettingsPreferenceChange('discrepancyAlerts')} />
                    </label>
                    <label className="settings-toggle-row">
                      <div>
                        <strong>Report Alerts</strong>
                        <span>Show vendor report notifications when a manager sends an R1 document.</span>
                      </div>
                      <input type="checkbox" checked={settingsPrefs.reportAlerts} onChange={() => handleSettingsPreferenceChange('reportAlerts')} />
                    </label>
                    <label className="settings-toggle-row">
                      <div>
                        <strong>QR Download Reminder</strong>
                        <span>Keep QR download guidance visible in the QR modal workflow.</span>
                      </div>
                      <input type="checkbox" checked={settingsPrefs.qrDownloadHint} onChange={() => handleSettingsPreferenceChange('qrDownloadHint')} />
                    </label>
                  </div>
                </div>

                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Workflow Shortcuts</h2>
                  </div>
                  <div className="settings-actions-list">
                    <button className="settings-action-btn" onClick={() => setActiveTab('create-shipment')}>
                      <i className="fa-solid fa-plus"></i>
                      <div>
                        <strong>Create New Shipment</strong>
                        <span>Prepare outbound details and generate QR after submit.</span>
                      </div>
                    </button>
                    <button className="settings-action-btn" onClick={() => setActiveTab('shipments')}>
                      <i className="fa-solid fa-truck-fast"></i>
                      <div>
                        <strong>Review Outbound Shipments</strong>
                        <span>Open shipment details, QR codes, and status history.</span>
                      </div>
                    </button>
                    <button className="settings-action-btn" onClick={() => setActiveTab('notifications')}>
                      <i className="fa-regular fa-bell"></i>
                      <div>
                        <strong>Open Notifications</strong>
                        <span>Review R1 reports, discrepancies, and shipment updates.</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="card settings-card">
                  <div className="card-header">
                    <h2 className="card-title">Security</h2>
                  </div>
                  <div className="settings-security">
                    <div>
                      <strong>Current session</strong>
                      <span>Use logout when you are finished on a shared device.</span>
                    </div>
                    <button className="btn btn-outline settings-logout-btn" onClick={() => setLogoutConfirmOpen(true)}>
                      <i className="fa-solid fa-arrow-right-from-bracket"></i> Logout
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
        title="Sign out?"
        message="You will need to sign in again before continuing shipment and QR tasks."
        cancelLabel="Stay here"
        confirmLabel="Sign out"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
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
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>Mismatch Report</h2>
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
                <span className="status-badge status-discrepancy">Discrepancy</span>
              </div>

              <div className="shipment-detail-grid">
                <div>
                  <span className="detail-label">Vendor</span>
                  <strong>{reportModalData.discrepancy?.shipment?.vendor?.nama_vendor || '-'}</strong>
                </div>
                <div>
                  <span className="detail-label">Origin</span>
                  <strong>{reportModalData.discrepancy?.shipment?.lokasi_asal || '-'}</strong>
                </div>
                <div>
                  <span className="detail-label">Dispatch Time</span>
                  <strong>{formatDateTime(reportModalData.discrepancy?.shipment?.waktu_kirim)}</strong>
                </div>
                <div>
                  <span className="detail-label">Document Status</span>
                  <strong>{(reportModalData.status_dokumen || '-').replace(/_/g, ' ').toUpperCase()}</strong>
                </div>
              </div>

              <div className="vendor-report-mismatch">
                <div>
                  <span>Product</span>
                  <strong>{reportModalData.discrepancy?.item?.nama_barang || '-'}</strong>
                </div>
                <div>
                  <span>Expected</span>
                  <strong>{reportModalData.discrepancy?.quantity_outbound ?? '-'}</strong>
                </div>
                <div>
                  <span>Received Accepted</span>
                  <strong>{reportModalData.discrepancy?.quantity_inbound ?? '-'}</strong>
                </div>
                <div>
                  <span>Difference</span>
                  <strong style={{ color: '#dc2626' }}>{reportModalData.discrepancy?.selisih ?? '-'}</strong>
                </div>
              </div>

              <div className="vendor-report-notes">
                <span>Report Notes</span>
                <p>{reportModalData.keterangan || '-'}</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button className="btn btn-outline" onClick={() => setReportModalData(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => openReportPdf(reportModalData)}>
                <i className="fa-solid fa-file-pdf"></i> Open PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)' }}>QR Codes for Shipment {selectedShipmentId}</h2>
              <button onClick={() => setShowQRModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
              {qrLoading ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '32px 20px', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                  <p>Loading QR codes and tokens...</p>
                </div>
              ) : qrTokens.map((token, idx) => (
                <div key={idx} className="qr-token-card">
                  <div style={{ background: 'white', padding: '10px', display: 'inline-block', borderRadius: '8px', marginBottom: '12px' }}>
                    <QRCodeSVG id={`qr-svg-${token.ID_outbound_detail || idx}`} value={token.qr_token || 'QR_TOKEN_NOT_AVAILABLE'} size={150} />
                  </div>
                  <div className="qr-token-meta">
                    <div className="qr-token-product">{getQrProductName(token)}</div>
                    <div className="qr-token-caption">
                      <span>{token.box_code || (token.box_sequence ? `Box ${token.box_sequence}` : 'Box')}</span>
                      <span>{`Qty ${token.expected_qty_in_box ?? '-'}`}</span>
                    </div>
                  </div>
                  <div className="qr-token-section">
                    <div className="qr-token-label">QR Token</div>
                    <div className="qr-token-value">{token.qr_token || 'Token not available yet'}</div>
                    <button
                      type="button"
                      className="btn btn-outline qr-copy-btn"
                      disabled={!token.qr_token}
                      onClick={() => handleCopyQrToken(token.qr_token)}
                    >
                      <i className="fa-regular fa-copy"></i> Copy Token
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary qr-copy-btn"
                      style={{ marginTop: '10px' }}
                      disabled={!token.qr_token}
                      onClick={() => handleDownloadQr(token, idx)}
                    >
                      <i className="fa-solid fa-download"></i> Download QR
                    </button>
                  </div>
                </div>
              ))}
              {!qrLoading && qrTokens.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: '#64748b' }}>
                  No QR tokens were returned for this shipment yet. If the shipment was already submitted, this likely needs backend verification.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                Shipment Details {selectedShipmentDetails?.ID_outbound ? `#${selectedShipmentDetails.ID_outbound}` : ''}
              </h2>
              <button onClick={() => setShowDetailsModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>

            {detailsLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 20px', color: '#64748b' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '16px' }}></i>
                <p>Loading shipment details...</p>
              </div>
            ) : selectedShipmentDetails && (
              <>
                <div className="shipment-detail-grid">
                  <div>
                    <span className="detail-label">Origin Location</span>
                    <strong>{selectedShipmentDetails.lokasi_asal || '-'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Shipping Time</span>
                    <strong>{formatDateTime(selectedShipmentDetails.waktu_kirim)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Estimated Arrival</span>
                    <strong>{formatDateTime(selectedShipmentDetails.estimasi_tiba)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Status</span>
                    {getStatusBadge(selectedShipmentDetails)}
                  </div>
                  <div>
                    <span className="detail-label">Shipment Number</span>
                    <strong>{selectedShipmentDetails.no_pengiriman || '-'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Created At</span>
                    <strong>{formatDateTime(selectedShipmentDetails.created_at)}</strong>
                  </div>
                </div>

                <div className="shipment-items-table">
                  <h3>Shipment Items</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>Total Quantity</th>
                        <th>Quantity Per Box</th>
                        <th>Boxes</th>
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
                          <td colSpan="4" style={{ textAlign: 'center' }}>No item details available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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
