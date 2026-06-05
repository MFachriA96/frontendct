import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {
  buildManagerDashboardHeroMetrics,
  buildManagerDashboardPrimaryCards,
  filterShipmentsByStatusGroup,
  getDiscrepancyStatusCounts,
  getShipmentStatusCounts,
  normalizeAnalyticsResponse,
  buildTrendChartData,
} from '../utils/dashboardLogic';
import AppSidebar from '../components/navigation/AppSidebar';
import AppSkeleton from '../components/ui/AppSkeleton';
import ConfirmModal from '../components/ui/ConfirmModal';
import StatusModal from '../components/ui/StatusModal';
import { buildWarehouseScopedParams } from '../utils/receivingWorkspace';
import './ManagerDashboard.css';

const LazyAnalyticsTrendChart = lazy(() => import('../components/AnalyticsTrendChart'));

const ManagerKpiSkeleton = ({ count = 4 }) => (
  <div className="stats-kpi-container">
    {Array.from({ length: count }).map((_, index) => (
      <div key={`manager-kpi-skeleton-${index}`} className="kpi-card manager-skeleton-card">
        <div className="kpi-header">
          <AppSkeleton style={{ height: 10, maxWidth: 92 }} />
          <AppSkeleton style={{ width: 16, height: 16, borderRadius: 999 }} />
        </div>
        <AppSkeleton style={{ height: 34, maxWidth: 72, marginBottom: 10 }} />
        <AppSkeleton style={{ height: 10, maxWidth: 180 }} />
      </div>
    ))}
  </div>
);

const ManagerTableSkeleton = ({ columns = 6, rows = 5 }) => (
  <tbody>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={`manager-table-skeleton-${rowIndex}`}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <td key={`manager-table-skeleton-cell-${rowIndex}-${colIndex}`}>
            <AppSkeleton style={{ height: 12, maxWidth: colIndex === columns - 1 ? 120 : 150 }} />
          </td>
        ))}
      </tr>
    ))}
  </tbody>
);

const ManagerDashboard = () => {
  const [, setActiveTab] = useState('overview');
  const [activeSidebar, setActiveSidebar] = useState('dashboard');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('total');
  const [user] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(false);

  // Data State
  const [shipments, setShipments] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [managerOverview, setManagerOverview] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [reportsData, setReportsData] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [managerAnalytics, setManagerAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseScope, setWarehouseScope] = useState(() => (user?.ID_gudang ? 'default' : 'all'));

  // Modal State
  const [resolveModalData, setResolveModalData] = useState(null);
  const [shipmentModalData, setShipmentModalData] = useState(null);
  const [reportModalData, setReportModalData] = useState(null);
  const [shipmentDetailsLoading, setShipmentDetailsLoading] = useState(false);
  const [resolutionType, setResolutionType] = useState('approve'); // approve sends R1 follow-up, return closes internally
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [statusModal, setStatusModal] = useState({
    open: false,
    type: 'info',
    title: '',
    message: '',
  });
  const reportStatusText = {
    draft: 'Draft',
    dikirim_ke_vendor: 'Menunggu persetujuan vendor',
    diproses_vendor: 'Pengembalian sedang diproses',
    barang_dikirim_ulang: 'Barang sudah dikirim ulang',
    closing: 'Tindak lanjut selesai',
  };

  const navigate = useNavigate();

  const openStatusModal = (type, title, message) => {
    setStatusModal({
      open: true,
      type,
      title,
      message,
    });
  };

  const normalizeListResponse = (data) => {
    const responseData = data?.data;
    return Array.isArray(responseData) ? responseData : (responseData?.data || []);
  };

  const normalizeOverviewResponse = (data) => data?.data || null;

  const fetchData = useCallback(async ({ includeSecondary = true } = {}) => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    const params = buildWarehouseScopedParams(warehouseScope);

    setDashboardLoading(true);

    const [overviewResult, outboundResult, discrepancyResult] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/dashboard/manager-overview`, { headers, params }),
      axios.get(`${API_BASE_URL}/api/outbound`, { headers, params }),
      axios.get(`${API_BASE_URL}/api/discrepancy`, { headers, params })
    ]);

    if (overviewResult.status === 'fulfilled') {
      const overview = normalizeOverviewResponse(overviewResult.value.data);
      setManagerOverview(overview);
      setAnalyticsData(overview?.vendor_performance || []);
    } else {
      console.error('Error fetching manager overview:', overviewResult.reason);
      setManagerOverview(null);
      setAnalyticsData([]);
    }

    if (outboundResult.status === 'fulfilled') {
      setShipments(normalizeListResponse(outboundResult.value.data));
    } else {
      console.error('Error fetching outbound shipments:', outboundResult.reason);
    }

    if (discrepancyResult.status === 'fulfilled') {
      setDiscrepancies(normalizeListResponse(discrepancyResult.value.data));
    } else {
      console.error('Error fetching discrepancies:', discrepancyResult.reason);
    }

    setDashboardLoading(false);

    if (!includeSecondary) {
      return;
    }

    setSecondaryLoading(true);
    const [reportsResult] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/dokumen-r1`, { headers })
    ]);

    if (reportsResult.status === 'fulfilled') {
      setReportsData(normalizeListResponse(reportsResult.value.data));
    } else {
      console.error('Error fetching vendor reports:', reportsResult.reason);
    }

    setSecondaryLoading(false);
  }, [warehouseScope]);

  const fetchManagerAnalytics = useCallback(async (vendorId = null) => {
    const token = localStorage.getItem('token');
    const queryParams = new URLSearchParams();
    const warehouseParams = buildWarehouseScopedParams(warehouseScope);

    Object.entries(warehouseParams).forEach(([key, value]) => {
      queryParams.set(key, value);
    });

    if (vendorId && vendorId !== 'all') {
      queryParams.set('vendor_id', vendorId);
    }

    const params = queryParams.toString() ? `?${queryParams.toString()}` : '';
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/dashboard/manager-analytics${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setManagerAnalytics(normalizeAnalyticsResponse(res.data));
    } catch (err) {
      setAnalyticsError(err.response?.data?.message || err.message || 'Gagal memuat analitik.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [warehouseScope]);

  const fetchWarehouses = useCallback(async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/master/gudang`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = response.data?.data;
      setWarehouses(Array.isArray(payload) ? payload : (payload?.data || []));
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      setWarehouses([]);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      void fetchData();
      void fetchManagerAnalytics();
    });
  }, [fetchData, fetchManagerAnalytics]);

  useEffect(() => {
    Promise.resolve().then(() => {
      void fetchWarehouses();
    });
  }, [fetchWarehouses]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error(error);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleResolve = async () => {
    if (!resolveModalData) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/discrepancy/${resolveModalData.ID_discrepancy}/action`, {
        action_type: resolutionType,
        notes: resolutionNotes
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let generatedReport = null;
      if (resolutionType === 'approve') {
          const reportDescription = [
            `Dokumen R1 dibuat untuk discrepancy DISC-${resolveModalData.ID_discrepancy}.`,
            `Jumlah yang diharapkan: ${resolveModalData.quantity_outbound}.`,
            `Jumlah yang diterima: ${resolveModalData.quantity_inbound}.`,
            `Selisih yang perlu ditindaklanjuti: ${Math.abs(Number(resolveModalData.selisih || 0))}.`,
            resolutionNotes ? `Instruksi manager: ${resolutionNotes}` : 'Vendor diminta memproses pengembalian atau pengiriman ulang barang terkait.',
          ].filter(Boolean).join('\n');

        const reportRes = await axios.post(`${API_BASE_URL}/api/dokumen-r1`, {
          ID_discrepancy: resolveModalData.ID_discrepancy,
          keterangan: reportDescription,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const reportId = reportRes.data?.data?.ID_dokumen;
        if (reportId) {
          const sendRes = await axios.put(`${API_BASE_URL}/api/dokumen-r1/${reportId}/status`, {
            status_dokumen: 'dikirim_ke_vendor',
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          generatedReport = sendRes.data?.data || reportRes.data?.data;
        } else {
          generatedReport = reportRes.data?.data;
        }
      }

      setResolveModalData(null);
      setResolutionNotes('');
      await fetchData();
      if (generatedReport) {
        setReportModalData(generatedReport);
      } else {
          openStatusModal('success', 'Keputusan tersimpan', 'Discrepancy ditutup tanpa mengirim dokumen R1 ke vendor.');
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || error.message;
      openStatusModal('error', 'Aksi gagal disimpan', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReportStatus = async (reportId, nextStatus) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_BASE_URL}/api/dokumen-r1/${reportId}/status`, {
        status_dokumen: nextStatus,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const updatedReport = response.data?.data || null;
      if (updatedReport) {
        setReportModalData(updatedReport);
      }

      await fetchData();
      openStatusModal(
        'success',
        'Status laporan diperbarui',
          nextStatus === 'closing'
            ? 'Dokumen R1 ditandai selesai.'
            : nextStatus === 'barang_dikirim_ulang'
              ? 'Vendor menandai bahwa barang sudah dikirim ulang.'
              : 'Status dokumen R1 berhasil diperbarui.'
      );
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || error.message;
      openStatusModal('error', 'Status laporan gagal diperbarui', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleViewShipmentDetails = async (shipment) => {
    setShipmentModalData(shipment);
    setShipmentDetailsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/outbound/${shipment.ID_outbound}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShipmentModalData(response.data?.data || shipment);
    } catch (error) {
      console.error('Error fetching shipment details:', error);
      const msg = error.response?.data?.message || error.message;
      openStatusModal('error', 'Detail gagal dimuat', msg);
    } finally {
      setShipmentDetailsLoading(false);
    }
  };

  const hasCompletedAction = (discrepancy) => discrepancy.latest_action?.status_action === 'done';
  const pendingDiscrepancies = discrepancies.filter(d => d.status !== 'match' && !hasCompletedAction(d));
  const shipmentCounts = managerOverview?.shipment_counts || getShipmentStatusCounts(shipments);
  const pendingCount = Number(managerOverview?.discrepancy_breakdown?.pending_review ?? pendingDiscrepancies.length);
  const filteredShipments = filterShipmentsByStatusGroup(shipments, shipmentStatusFilter);
  const discrepancyStatusCounts = managerOverview?.discrepancy_breakdown?.by_status || getDiscrepancyStatusCounts(discrepancies);
  const pendingReviewQueue = Array.isArray(managerOverview?.pending_review_queue)
    ? managerOverview.pending_review_queue
    : pendingDiscrepancies.slice(0, 5);
  const analyticsModel = managerAnalytics || normalizeAnalyticsResponse(null);
  const analyticsTrendData = buildTrendChartData(analyticsModel.trend_by_date);
  const analyticsPreviewAvailable = Boolean(managerAnalytics) && !analyticsError;
  const analyticsPending = analyticsLoading && !managerAnalytics;
  const managerPrimaryCards = buildManagerDashboardPrimaryCards(shipmentCounts, pendingCount);
  const managerHeroMetrics = buildManagerDashboardHeroMetrics({
    shipmentCounts,
    pendingCount,
    analytics: analyticsModel,
  });
  const showManagerDashboardSkeleton = dashboardLoading && shipments.length === 0 && discrepancies.length === 0 && !managerOverview;
  const showManagerShipmentsSkeleton = dashboardLoading && shipments.length === 0;
  const showManagerReportsSkeleton = secondaryLoading && reportsData.length === 0;
  const assignedWarehouse = user?.warehouse || null;
  const warehouseScopeLabel = warehouseScope === 'default'
    ? (assignedWarehouse?.nama_gudang || 'Gudang default akun')
    : warehouseScope === 'all'
      ? 'Semua gudang'
      : (warehouses.find((warehouse) => String(warehouse.ID_gudang) === String(warehouseScope))?.nama_gudang || `Gudang ${warehouseScope}`);
  const managerCardLabelMap = {
    'Total Shipments': 'Perlu keputusan',
    Shipping: 'Dalam pengiriman',
    Delivered: 'Selesai diverifikasi',
    'Pending Review': 'Shipment bermasalah',
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'verified': return <span className="status-badge status-success">Sudah diverifikasi</span>;
      case 'delivered': return <span className="status-badge status-success">Selesai</span>;
      case 'discrepancy': return <span className="status-badge status-danger">Perlu tindak lanjut</span>;
      case 'in_transit': return <span className="status-badge status-warning">Dalam perjalanan</span>;
      case 'draft': return <span className="status-badge status-pending">Draft</span>;
      case 'submitted': return <span className="status-badge status-pending">Sudah dikirim</span>;
      case 'arrived': return <span className="status-badge status-warning">Sudah tiba</span>;
      default: return <span className="status-badge status-pending">{String(status || 'Tidak diketahui').replace(/_/g, ' ')}</span>;
    }
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  };

  const formatRate = (value) => {
    if (typeof value === 'number') {
      return `${(value * 100).toFixed(1)}%`;
    }

    return value || '-';
  };

  const getShipmentTotals = (shipment) => {
    const details = shipment?.details || [];
    return details.reduce((totals, detail) => ({
      quantity: totals.quantity + Number(detail.quantity_outbound || 0),
      boxes: totals.boxes + Number(detail.jumlah_box || 0)
    }), { quantity: 0, boxes: 0 });
  };

  const escapeCsvValue = (value) => {
    const stringValue = value === null || value === undefined ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const handleExportReport = () => {
    const generatedAt = new Date();
    const rows = [
      ['Epson Verification Manager Report'],
      ['Generated At', formatDateTime(generatedAt)],
      [],
      ['Summary'],
      ['Metric', 'Value'],
      ['Total Shipments', shipmentCounts.total],
      ['Shipping', shipmentCounts.shipping],
      ['Delivered', shipmentCounts.delivered],
      ['Shipment Discrepancy', shipmentCounts.discrepancy],
      ['Items Matched', discrepancyStatusCounts.match],
      ['Pending Review', pendingCount],
      [],
      ['Shipment Overview'],
      ['Shipment ID', 'Delivery Number', 'Vendor', 'Origin', 'Status', 'Created At', 'Dispatch Time', 'Estimated Arrival'],
      ...shipments.map(shipment => [
        `SHP-${shipment.ID_outbound}`,
        shipment.no_pengiriman || '',
        shipment.vendor?.nama_vendor || `Vendor ${shipment.ID_vendor || '-'}`,
        shipment.lokasi_asal || '',
        shipment.status || '',
        formatDateTime(shipment.created_at),
        formatDateTime(shipment.waktu_kirim),
        formatDateTime(shipment.estimasi_tiba),
      ]),
      [],
      ['Discrepancy Review'],
      ['Discrepancy ID', 'Item', 'Status', 'Expected Qty', 'Received Qty', 'Difference', 'Detected At'],
      ...discrepancies.map(discrepancy => [
        `DISC-${discrepancy.ID_discrepancy}`,
        discrepancy.outbound_detail?.barang?.nama_barang || `Outbound Detail ${discrepancy.ID_outbound_detail}`,
        discrepancy.status || '',
        discrepancy.quantity_outbound ?? '',
        discrepancy.quantity_inbound ?? '',
        discrepancy.selisih ?? '',
        formatDateTime(discrepancy.detected_at),
      ]),
    ];

    const csv = rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = generatedAt.toISOString().slice(0, 10);

    link.href = url;
    link.download = `manager-dashboard-report-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
          <title>${report.no_dokumen_r1 || 'Dokumen R1'}</title>
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
            <h1>Dokumen R1 Tindak Lanjut</h1>
            <div class="muted">${report.no_dokumen_r1 || '-'} • Status: ${(report.status_dokumen || '-').replaceAll('_', ' ')}</div>
          </div>
          <div class="grid">
            <div class="box"><span class="label">Vendor</span><strong>${shipment.vendor?.nama_vendor || '-'}</strong></div>
            <div class="box"><span class="label">Shipment</span><strong>${shipment.no_pengiriman || `SHP-${shipment.ID_outbound || '-'}`}</strong></div>
            <div class="box"><span class="label">Asal</span><strong>${shipment.lokasi_asal || '-'}</strong></div>
            <div class="box"><span class="label">Waktu Kirim</span><strong>${formatDateTime(shipment.waktu_kirim)}</strong></div>
          </div>
          <table>
            <thead>
              <tr><th>Produk</th><th>Ekspektasi</th><th>Diterima</th><th>Selisih</th><th>Status</th></tr>
            </thead>
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
          <h2>Instruksi Manager</h2>
          <div class="box notes">${report.keterangan || '-'}</div>
          <div class="footer">Dibuat oleh Epson Verification System pada ${formatDateTime(report.dibuat_at || new Date())}</div>
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

  const openSidebarSection = (section) => {
    setActiveSidebar(section);
    if (section === 'dashboard') {
      setActiveTab('overview');
    }
  };

  const openDiscrepancyReview = () => {
    setActiveSidebar('discrepancy-review');
    setActiveTab('pending');
  };

  const openManagerShipmentFilter = (filter) => {
    setShipmentStatusFilter(filter);
    setActiveSidebar('shipments');
    setActiveTab('overview');
  };

  const openManagerPrimaryCard = (card) => {
    if (card.key === 'pending_review') {
      openDiscrepancyReview();
      return;
    }

    openManagerShipmentFilter(card.actionKey || card.key);
  };

  return (
    <div className="app-container manager-dashboard">
      <AppSidebar
        activeValue={activeSidebar}
        brand="Evy"
        brandMeta="Manager"
        onSignOut={() => setLogoutConfirmOpen(true)}
        sections={[
          {
            label: 'Dashboard',
            items: [
              {
                value: 'dashboard',
                label: 'Dashboard',
                icon: 'fa-solid fa-border-all',
                onClick: () => openSidebarSection('dashboard'),
              },
              {
                value: 'shipments',
                label: 'Pengiriman',
                icon: 'fa-solid fa-truck-fast',
                onClick: () => openSidebarSection('shipments'),
              },
            ],
          },
          {
            label: 'Verifikasi',
            items: [
              {
                value: 'verification-results',
                label: 'Hasil verifikasi',
                icon: 'fa-solid fa-clipboard-check',
                onClick: () => openSidebarSection('verification-results'),
              },
              {
                value: 'discrepancy-review',
                label: 'Tinjau selisih',
                icon: 'fa-solid fa-code-pull-request',
                badge: pendingCount > 0 ? pendingCount : null,
                onClick: () => openDiscrepancyReview(),
              },
            ],
          },
          {
            label: 'Laporan',
            items: [
              {
                value: 'reports',
                label: 'Laporan R1',
                icon: 'fa-solid fa-file-invoice',
                onClick: () => setActiveSidebar('reports'),
              },
            ],
          },
        ]}
      />

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="topbar topbar-compact">
          <div className="manager-topbar-copy">
            <span className="manager-topbar-kicker">Scope aktif</span>
            <strong>{warehouseScopeLabel}</strong>
          </div>
          <div className="topbar-actions">
            <div className="date-badge">
              <i className="fa-regular fa-calendar"></i>
              <span>{new Date().toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="user-profile manager-user-chip">
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#003399', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {user ? user.nama?.charAt(0).toUpperCase() : 'M'}
              </div>
              <div className="user-info">
                <span className="user-name">{user ? user.nama : 'Manager'}</span>
                <span className="user-role">{user ? user.role : 'Manager gudang'}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content-wrapper">
          {activeSidebar === 'dashboard' && (
            <>
              <div className="page-header">
                <div>
                  <h1>Dashboard</h1>
                  <p className="subtitle">Pantau kasus prioritas dan progres gudang.</p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="filter-group" style={{ minWidth: '220px' }}>
                    <select
                      className="filter-select"
                      value={warehouseScope}
                      onChange={(event) => setWarehouseScope(event.target.value)}
                    >
                      <option value="default">
                        {assignedWarehouse?.nama_gudang ? `Default: ${assignedWarehouse.nama_gudang}` : 'Pakai gudang default'}
                      </option>
                      <option value="all">Semua gudang</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.ID_gudang} value={String(warehouse.ID_gudang)}>
                          {warehouse.nama_gudang}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-outline" onClick={handleExportReport} disabled={dashboardLoading}>
                    <i className="fa-solid fa-download"></i> {dashboardLoading ? 'Menyiapkan...' : 'Ekspor'}
                  </button>
                </div>
              </div>

              <div className="card data-card manager-context-card" style={{ marginBottom: '0.85rem' }}>
                <div className="table-toolbar" style={{ justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div className="table-summary-text">
                    Scope aktif: <strong>{warehouseScopeLabel}</strong>
                  </div>
                </div>
              </div>

              {/* Stats KPI Row */}
              {showManagerDashboardSkeleton ? (
                <ManagerKpiSkeleton />
              ) : (
                <div className="stats-kpi-container">
                  {managerPrimaryCards.map((card) => (
                    <button
                      key={card.key}
                      type="button"
                      className={`kpi-card kpi-card-action ${card.tone === 'blue'
                          ? 'border-blue'
                          : card.tone === 'info'
                            ? 'border-info'
                            : card.tone === 'success'
                              ? 'border-success'
                              : 'border-warning'
                        }`}
                      onClick={() => openManagerPrimaryCard(card)}
                    >
                      <div className="kpi-header">
                        <span className={`kpi-title ${card.key === 'pending_review' && card.value > 0 ? 'is-urgent' : ''}`}>{managerCardLabelMap[card.label] || card.label}</span>
                        <i className={`fa-solid text-muted ${card.key === 'total'
                            ? 'fa-box-open'
                            : card.key === 'shipping'
                              ? 'fa-truck-fast'
                              : card.key === 'delivered'
                                ? 'fa-circle-check'
                                : 'fa-triangle-exclamation'
                          }`}></i>
                      </div>
                      <div className={`kpi-value ${card.key === 'pending_review' && card.value > 0 ? 'text-warning' : ''}`}>{card.value}</div>
                      <div className={`kpi-trend ${card.key === 'pending_review' && card.value > 0 ? 'text-danger kpi-trend-urgent' : 'text-muted'}`}>
                        {card.key === 'total' ? <i className="fa-solid fa-arrow-trend-up"></i> : null} {card.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="manager-visual-grid mt-4">
                <section className="manager-visual-card manager-visual-card--chart">
                  <div className="manager-visual-card-head">
                    <div>
                      <span className="manager-visual-kicker">Trend aktif</span>
                      <h2>Pergerakan shipment dan selisih</h2>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => fetchManagerAnalytics()} disabled={analyticsLoading}>
                      {analyticsLoading ? 'Memuat...' : 'Muat ulang'}
                    </button>
                  </div>

                  {showManagerDashboardSkeleton || analyticsPending ? (
                    <>
                      <div className="manager-visual-chip-row">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div key={index} className="manager-visual-chip manager-skeleton-card">
                            <AppSkeleton style={{ height: 10, maxWidth: 88, marginBottom: 10 }} />
                            <AppSkeleton style={{ height: 28, maxWidth: 72 }} />
                          </div>
                        ))}
                      </div>
                      <div className="manager-visual-chart manager-skeleton-card manager-skeleton-chart"></div>
                    </>
                  ) : (
                    <>
                      <div className="manager-visual-chip-row">
                        {managerHeroMetrics.slice(0, 3).map((metric) => (
                          <div key={metric.key} className={`manager-visual-chip tone-${metric.tone}`}>
                            <div className="manager-visual-chip-top">
                              <span className="manager-visual-chip-icon">
                                <i className={`fa-solid ${metric.tone === 'success'
                                    ? 'fa-circle-check'
                                    : metric.tone === 'warning'
                                      ? 'fa-triangle-exclamation'
                                      : 'fa-truck-fast'
                                  }`}></i>
                              </span>
                              <span>{metric.label}</span>
                            </div>
                            <strong>{metric.value}</strong>
                          </div>
                        ))}
                      </div>
                      {analyticsPreviewAvailable && analyticsModel.trend_by_date.length > 0 ? (
                        <div className="manager-visual-chart">
                          <Suspense fallback={<div className="manager-activity-empty">Memuat grafik...</div>}>
                            <LazyAnalyticsTrendChart data={analyticsTrendData} theme="manager" />
                          </Suspense>
                        </div>
                      ) : (
                        <div className="manager-visual-empty">Trend belum tersedia.</div>
                      )}
                    </>
                  )}
                </section>

                <section className="manager-visual-card manager-visual-card--priority">
                  <div className="manager-visual-card-head">
                    <div>
                      <span className="manager-visual-kicker">Prioritas</span>
                      <h2>Kasus yang perlu keputusan sekarang</h2>
                    </div>
                    {pendingReviewQueue.length > 0 ? <span className="status-badge status-warning">{pendingReviewQueue.length} kasus</span> : null}
                  </div>

                  {showManagerDashboardSkeleton ? (
                    <div className="vendor-performance-mini-list manager-priority-list">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`priority-skeleton-${index}`} className="vendor-performance-mini-item manager-priority-item manager-skeleton-card">
                          <div className="manager-priority-copy">
                            <AppSkeleton style={{ height: 14, maxWidth: 150, marginBottom: 8 }} />
                            <AppSkeleton style={{ height: 10, maxWidth: 110 }} />
                          </div>
                          <div className="manager-priority-meta">
                            <AppSkeleton style={{ height: 12, maxWidth: 80, marginBottom: 8 }} />
                            <AppSkeleton style={{ height: 10, maxWidth: 140 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : pendingReviewQueue.length > 0 ? (
                    <div className="vendor-performance-mini-list manager-priority-list">
                      {pendingReviewQueue.slice(0, 3).map((item) => (
                        <button key={item.ID_discrepancy} type="button" className="vendor-performance-mini-item manager-priority-item" onClick={() => setActiveTab('pending')}>
                          <div className="manager-priority-copy">
                            <strong>{item.outbound_detail?.outbound?.vendor?.nama_vendor || `Vendor ${item.ID_vendor || '-'}`}</strong>
                            <span>{item.outbound_detail?.barang?.nama_barang || `Outbound Detail ${item.ID_outbound_detail || '-'}`}</span>
                          </div>
                          <div className="manager-priority-meta">
                            <strong>{item.status || 'pending'}</strong>
                            <span>{`Selisih ${item.selisih ?? 0} • ${formatDateTime(item.detected_at)}`}</span>
                          </div>
                          <i className="fa-solid fa-arrow-up-right-from-square manager-priority-arrow"></i>
                        </button>
                      ))}
                      {pendingReviewQueue.length > 3 && (
                        <button type="button" className="manager-inline-link" onClick={() => setActiveTab('pending')}>
                          Lihat {pendingReviewQueue.length - 3} kasus lain
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="manager-visual-empty">Tidak ada discrepancy yang menunggu review.</div>
                  )}
                </section>

                <section className="manager-visual-card manager-visual-card--breakdown">
                  <div className="manager-visual-card-head">
                    <div>
                      <span className="manager-visual-kicker">Snapshot</span>
                      <h2>Breakdown selisih</h2>
                    </div>
                  </div>
                  {showManagerDashboardSkeleton ? (
                    <div className="manager-visual-stat-grid">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={`breakdown-skeleton-${index}`} className="manager-visual-stat manager-skeleton-card">
                          <AppSkeleton style={{ height: 10, maxWidth: 70, marginBottom: 10 }} />
                          <AppSkeleton style={{ height: 28, maxWidth: 44 }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-visual-stat-grid">
                      <div className="manager-visual-stat">
                        <span>Match</span>
                        <strong>{discrepancyStatusCounts.match || 0}</strong>
                      </div>
                      <div className="manager-visual-stat">
                        <span>Mismatch</span>
                        <strong>{discrepancyStatusCounts.mismatch || 0}</strong>
                      </div>
                      <div className="manager-visual-stat">
                        <span>Missing</span>
                        <strong>{discrepancyStatusCounts.missing || 0}</strong>
                      </div>
                      <div className="manager-visual-stat">
                        <span>Over</span>
                        <strong>{discrepancyStatusCounts.over || 0}</strong>
                      </div>
                    </div>
                  )}
                </section>

                <section className="manager-visual-card manager-visual-card--vendor">
                  <div className="manager-visual-card-head">
                    <div>
                      <span className="manager-visual-kicker">Vendor rawan</span>
                      <h2>Paling butuh perhatian</h2>
                    </div>
                  </div>
                  {showManagerDashboardSkeleton ? (
                    <div className="vendor-performance-mini-list">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`vendor-risk-skeleton-${index}`} className="vendor-performance-mini-item manager-skeleton-card">
                          <div>
                            <AppSkeleton style={{ height: 14, maxWidth: 170, marginBottom: 8 }} />
                            <AppSkeleton style={{ height: 10, maxWidth: 120 }} />
                          </div>
                          <div>
                            <AppSkeleton style={{ height: 16, maxWidth: 56, marginBottom: 8 }} />
                            <AppSkeleton style={{ height: 10, maxWidth: 90 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : analyticsData.length > 0 ? (
                    <div className="vendor-performance-mini-list">
                      {analyticsData.slice(0, 3).map((item) => (
                        <div key={item.vendor_id || item.vendor_name || item.vendor} className="vendor-performance-mini-item">
                          <div>
                            <strong>{item.vendor_name || item.vendor || `Vendor ${item.vendor_id || '-'}`}</strong>
                            <span>{item.shipments_with_discrepancy ?? item.total_discrepancies ?? 0} shipment bermasalah</span>
                          </div>
                          <div>
                            <strong>{formatRate(item.discrepancy_rate ?? item.rate)}</strong>
                            <span>{item.total_shipments} shipment</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-visual-empty">
                      {secondaryLoading ? 'Memuat vendor...' : 'Belum ada snapshot vendor.'}
                    </div>
                  )}
                </section>
              </div>
            </>


          )}
 
          {activeSidebar === 'shipments' && (


            <>


              <div className="page-header">


                <div>


                  <h1>Shipments</h1>


                  <p className="subtitle">Monitor vendor outbound shipments and inspect shipment contents.</p>


                </div>


              </div>


              {showManagerShipmentsSkeleton ? (
                <div className="manager-section-grid">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={`shipment-summary-skeleton-${index}`} className="section-summary-card manager-skeleton-card">
                      <AppSkeleton style={{ height: 10, maxWidth: 110, marginBottom: 10 }} />
                      <AppSkeleton style={{ height: 30, maxWidth: 64 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="manager-section-grid">
                  <div className="section-summary-card">
                    <span>Total Shipments</span>
                    <strong>{shipmentCounts.total}</strong>
                  </div>
                  <div className="section-summary-card">
                    <span>Shipping</span>
                    <strong>{shipmentCounts.shipping}</strong>
                  </div>
                  <div className="section-summary-card">
                    <span>Discrepancy</span>
                    <strong>{shipmentCounts.discrepancy}</strong>
                  </div>
                </div>
              )}


              <div className="card data-card mt-4">


                <div className="section-card-header">


                  <div>


                    <h2>Shipment Directory</h2>


                    <p>Use Details to inspect vendor, schedule, origin, and item quantities.</p>


                  </div>


                  <select className="form-control filter-select" value={shipmentStatusFilter} onChange={(e) => setShipmentStatusFilter(e.target.value)}>


                    <option value="total">All Shipments</option>


                    <option value="shipping">Shipping</option>


                    <option value="delivered">Delivered</option>


                    <option value="discrepancy">Discrepancy</option>


                  </select>


                </div>


                <div className="table-responsive">


                  <table className="data-table">


                    <thead>


                      <tr>


                        <th>Shipment</th>


                        <th>Vendor</th>


                        <th>Origin</th>


                        <th>Dispatch</th>


                        <th>Status</th>


                        <th>Action</th>


                      </tr>


                    </thead>


                    {showManagerShipmentsSkeleton ? (
                      <ManagerTableSkeleton columns={6} rows={6} />
                    ) : (
                      <tbody>
                        {filteredShipments.map(shp => (
                          <tr key={shp.ID_outbound}>
                            <td className="font-medium">{shp.no_pengiriman || `SHP-${shp.ID_outbound}`}</td>
                            <td>{shp.vendor?.nama_vendor || `Vendor ${shp.ID_vendor}`}</td>
                            <td>{shp.lokasi_asal || '-'}</td>
                            <td className="text-muted">{formatDateTime(shp.waktu_kirim)}</td>
                            <td>{getStatusBadge(shp.status)}</td>
                            <td><button className="btn btn-sm btn-outline" onClick={() => handleViewShipmentDetails(shp)}>Details</button></td>
                          </tr>
                        ))}
                        {!dashboardLoading && filteredShipments.length === 0 && (
                          <tr><td colSpan="6" className="text-center" style={{ padding: '32px' }}>No shipments found for this status.</td></tr>
                        )}
                      </tbody>
                    )}


                  </table>


                </div>


              </div>


            </>


          )}





          {activeSidebar === 'verification-results' && (


            <>


              <div className="page-header">


                <div>


                  <h1>Verification Results</h1>


                  <p className="subtitle">Review inbound verification outcomes from scan officer manual checks.</p>


                </div>


              </div>


              <div className="manager-section-grid">


                <div className="section-summary-card">


                  <span>Matched</span>


                  <strong>{discrepancyStatusCounts.match || 0}</strong>


                </div>


                <div className="section-summary-card">


                  <span>Mismatched</span>


                  <strong>{discrepancyStatusCounts.mismatch || 0}</strong>


                </div>


                <div className="section-summary-card">


                  <span>Missing / Over</span>


                  <strong>{(discrepancyStatusCounts.missing || 0) + (discrepancyStatusCounts.over || 0)}</strong>


                </div>


              </div>


              <div className="verification-results-grid mt-4">


                {discrepancies.map(disc => (


                  <div className="verification-card" key={disc.ID_discrepancy}>


                    <div className="verification-card-top">


                      <div>


                        <strong>{disc.outbound_detail?.barang?.nama_barang || `Outbound Detail ${disc.ID_outbound_detail}`}</strong>


                        <span>DISC-{disc.ID_discrepancy}</span>


                      </div>


                      <span className={`status-badge ${disc.status === 'match' ? 'status-success' : 'status-danger'}`}>


                        {disc.status}


                      </span>


                    </div>


                    <div className="verification-metrics">


                      <div><span>Expected</span><strong>{disc.quantity_outbound ?? '-'}</strong></div>


                      <div><span>Received</span><strong>{disc.quantity_inbound ?? '-'}</strong></div>


                      <div><span>Difference</span><strong>{disc.selisih ?? '-'}</strong></div>


                    </div>


                    <div className="verification-footer">


                      <span>{formatDateTime(disc.created_at)}</span>


                      {disc.status !== 'match' && (


                        <button className="btn btn-sm btn-primary" onClick={() => setResolveModalData(disc)}>Resolve</button>


                      )}


                    </div>


                  </div>


                ))}


                {discrepancies.length === 0 && (


                  <div className="empty-state" style={{ gridColumn: '1 / -1' }}>


                    <i className="fa-solid fa-clipboard-check text-muted"></i>


                    <h3>No verification results yet</h3>


                    <p>Results will appear after scan officers complete manual verification.</p>


                  </div>


                )}


              </div>


            </>


          )}





          {activeSidebar === 'discrepancy-review' && (


            <>


              <div className="page-header">


                <div>


                  <h1>Discrepancy Review</h1>


                  <p className="subtitle">Prioritize unresolved mismatches and generate the right vendor follow-up action.</p>


                </div>


              </div>


              <div className="review-grid standalone-review-grid">


                {pendingDiscrepancies.map(disc => (


                  <div className="review-card" key={disc.ID_discrepancy}>


                    <div className="review-card-header bg-danger-light border-danger">


                      <div className="review-title">


                        <i className="fa-solid fa-triangle-exclamation text-danger"></i>


                        <span style={{ textTransform: 'capitalize' }}>{disc.status} Item Discrepancy</span>


                      </div>


                      <span className="review-time">{formatDateTime(disc.created_at)}</span>


                    </div>


                    <div className="review-card-body">


                      <div className="review-detail-row">


                        <span className="label">Item Name</span>


                        <span className="value">{disc.outbound_detail?.barang?.nama_barang || 'Unknown'}</span>


                      </div>


                      <div className="review-detail-row">


                        <span className="label">Outbound Detail</span>


                        <span className="value font-medium">#{disc.ID_outbound_detail}</span>


                      </div>


                      <div className="issue-numbers">


                        <div className="num-box">


                          <span className="num-label">Expected</span>


                          <span className="num-val">{disc.quantity_outbound}</span>


                        </div>


                        <div className="num-box error">


                          <span className="num-label">Scanned</span>


                          <span className="num-val">{disc.quantity_inbound}</span>


                        </div>


                        <div className="num-box result">


                          <span className="num-label">Difference</span>


                          <span className="num-val">{disc.selisih}</span>


                        </div>


                      </div>


                      <button className="btn btn-primary btn-block mt-3" onClick={() => setResolveModalData(disc)}>


                        <i className="fa-solid fa-file-contract"></i> Resolve Mismatch


                      </button>


                    </div>


                  </div>


                ))}


                {pendingDiscrepancies.length === 0 && (


                  <div className="empty-state" style={{ gridColumn: '1 / -1' }}>


                    <i className="fa-solid fa-circle-check text-success"></i>


                    <h3>No Open Discrepancies</h3>


                    <p>All verification issues are currently resolved.</p>


                  </div>


                )}


              </div>


            </>


          )}





          {activeSidebar === 'reports' && (
            <>
              <div className="page-header">
                <div>
                  <h1>Laporan R1</h1>
                  <p className="subtitle">Laporan selisih resmi yang dikirim ke vendor untuk tindak lanjut.</p>
                </div>
              </div>
              <div className="card data-card">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nomor dokumen</th>
                        <th>ID selisih</th>
                        <th>Status</th>
                        <th>Dibuat oleh</th>
                        <th>Dibuat pada</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    {showManagerReportsSkeleton ? (
                      <ManagerTableSkeleton columns={6} rows={5} />
                    ) : (
                      <tbody>
                        {reportsData.map(doc => (
                          <tr key={doc.ID_dokumen}>
                            <td className="font-medium">{doc.no_dokumen_r1}</td>
                            <td>DISC-{doc.ID_discrepancy}</td>
                            <td>
                                <span className={`status-badge ${doc.status_dokumen === 'draft' ? 'status-pending' : 'status-success'}`}>
                                  {reportStatusText[doc.status_dokumen] || doc.status_dokumen.replace(/_/g, ' ')}
                                </span>
                            </td>
                            <td>{doc.pembuat?.nama || 'Sistem'}</td>
                            <td className="text-muted">{formatDateTime(doc.dibuat_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button className="btn btn-sm btn-outline" onClick={() => setReportModalData(doc)}><i className="fa-solid fa-file-pdf"></i> Lihat PDF</button>
                                {doc.status_dokumen === 'barang_dikirim_ulang' && (
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => handleUpdateReportStatus(doc.ID_dokumen, 'closing')}
                                    disabled={loading}
                                  >
                                    Selesaikan
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!secondaryLoading && reportsData.length === 0 && (
                          <tr><td colSpan="6" className="text-center" style={{ padding: '40px' }}>
                            <div className="empty-state" style={{ padding: 0 }}>
                              <i className="fa-solid fa-folder-open text-muted" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
                                <p>Belum ada dokumen R1 tindak lanjut yang dibuat.</p>
                            </div>
                          </td></tr>
                        )}
                      </tbody>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Keluar dari akun manager?"
        message="Kamu perlu login lagi untuk lanjut review discrepancy dan laporan."
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

      {/* Resolution Modal Overlay */}
      {resolveModalData && (
        <div className="modal-overlay" id="resolveModal" style={{ display: 'flex' }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Keputusan selisih</h2>
              <button className="close-btn" onClick={() => setResolveModalData(null)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning mb-3">
                <i className="fa-solid fa-circle-info"></i>
                <div>
                  <strong>Item {resolveModalData.outbound_detail?.barang?.nama_barang}</strong> punya selisih {resolveModalData.selisih} item. Pilih tindakan manager untuk menyelesaikannya.
                </div>
              </div>

              <div className="form-group mt-3">
                <label>Tindakan penyelesaian</label>
                <div className="radio-group-vertical">
                  <label className="radio-card">
                    <input type="radio" name="resolution_type" checked={resolutionType === 'approve'} onChange={() => setResolutionType('approve')} />
                    <div className="radio-content">
                      <h4>Kirim dokumen R1 ke vendor</h4>
                      <p>Buat dokumen tindak lanjut resmi agar vendor memproses pengembalian atau pengiriman ulang barang terkait.</p>
                    </div>
                  </label>
                  <label className="radio-card">
                    <input type="radio" name="resolution_type" checked={resolutionType === 'return'} onChange={() => setResolutionType('return')} />
                    <div className="radio-content">
                      <h4>Selesaikan tanpa dokumen R1</h4>
                      <p>Tutup discrepancy secara internal tanpa mengirim instruksi tindak lanjut ke vendor.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Catatan manager (opsional)</label>
                <textarea className="form-control" rows="3" placeholder="Tambahkan instruksi yang akan dibaca vendor pada dokumen R1..." value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)}></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setResolveModalData(null)}>Batal</button>
              <button className="btn btn-primary" onClick={handleResolve} disabled={loading}>
                {loading ? 'Memproses...' : 'Konfirmasi keputusan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generated Vendor Report Modal */}
      {reportModalData && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal report-preview-modal">
            <div className="modal-header">
              <div>
                <h2>Dokumen R1 yang dikirim</h2>
                <p>{reportModalData.no_dokumen_r1 || 'Dokumen R1'}</p>
              </div>
              <button className="close-btn" onClick={() => setReportModalData(null)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="modal-body">
              <div className="report-preview-sheet">
                <div className="report-preview-head">
                  <div>
                    <span>Vendor</span>
                    <strong>{reportModalData.discrepancy?.shipment?.vendor?.nama_vendor || '-'}</strong>
                  </div>
                  <span className="status-badge status-danger">Instruksi tindak lanjut</span>
                </div>
                <div className="shipment-detail-grid">
                  <div>
                    <span>Shipment</span>
                    <strong>{reportModalData.discrepancy?.shipment?.no_pengiriman || `SHP-${reportModalData.discrepancy?.shipment?.ID_outbound || '-'}`}</strong>
                  </div>
                  <div>
                    <span>Origin</span>
                    <strong>{reportModalData.discrepancy?.shipment?.lokasi_asal || '-'}</strong>
                  </div>
                  <div>
                    <span>Waktu kirim</span>
                    <strong>{formatDateTime(reportModalData.discrepancy?.shipment?.waktu_kirim)}</strong>
                  </div>
                  <div>
                    <span>Status dokumen</span>
                      <strong>{(reportStatusText[reportModalData.status_dokumen] || reportModalData.status_dokumen || '-').toUpperCase()}</strong>
                  </div>
                </div>
                <div className="report-mismatch-row">
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
                    <strong className="text-danger">{reportModalData.discrepancy?.selisih ?? '-'}</strong>
                  </div>
                </div>
                <div className="report-notes">
                  <span>Instruksi manager</span>
                  <p>{reportModalData.keterangan || '-'}</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {reportModalData.status_dokumen === 'barang_dikirim_ulang' && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateReportStatus(reportModalData.ID_dokumen, 'closing')}
                  disabled={loading}
                >
                  {loading ? 'Memproses...' : 'Tandai selesai'}
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setReportModalData(null)}>Tutup</button>
              <button className="btn btn-primary" onClick={() => openReportPdf(reportModalData)}>
                <i className="fa-solid fa-file-pdf"></i> Buka PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipment Details Modal Overlay */}
      {shipmentModalData && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal shipment-details-modal">
            <div className="modal-header">
              <div>
                <h2>Detail shipment</h2>
                <p>SHP-{shipmentModalData.ID_outbound}</p>
              </div>
              <button className="close-btn" onClick={() => setShipmentModalData(null)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="modal-body">
              {shipmentDetailsLoading ? (
                <div className="modal-loading">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <p>Memuat detail shipment...</p>
                </div>
              ) : (
                <>
                  <div className="shipment-hero">
                    <div>
                      <span>Vendor</span>
                      <strong>{shipmentModalData.vendor?.nama_vendor || `Vendor ${shipmentModalData.ID_vendor || '-'}`}</strong>
                    </div>
                    {getStatusBadge(shipmentModalData.status)}
                  </div>

                  <div className="shipment-detail-grid">
                    <div>
                      <span>Nomor pengiriman</span>
                      <strong>{shipmentModalData.no_pengiriman || '-'}</strong>
                    </div>
                    <div>
                      <span>Lokasi asal</span>
                      <strong>{shipmentModalData.lokasi_asal || '-'}</strong>
                    </div>
                    <div>
                      <span>Waktu kirim</span>
                      <strong>{formatDateTime(shipmentModalData.waktu_kirim)}</strong>
                    </div>
                    <div>
                      <span>Estimasi tiba</span>
                      <strong>{formatDateTime(shipmentModalData.estimasi_tiba)}</strong>
                    </div>
                    <div>
                      <span>Dibuat pada</span>
                      <strong>{formatDateTime(shipmentModalData.created_at)}</strong>
                    </div>
                    <div>
                      <span>Dibuat oleh</span>
                      <strong>{shipmentModalData.creator?.nama || `User ${shipmentModalData.dibuat_oleh || '-'}`}</strong>
                    </div>
                  </div>

                  <div className="shipment-total-row">
                    <div>
                      <span>Total item</span>
                      <strong>{getShipmentTotals(shipmentModalData).quantity}</strong>
                    </div>
                    <div>
                      <span>Total box</span>
                      <strong>{getShipmentTotals(shipmentModalData).boxes}</strong>
                    </div>
                    <div>
                      <span>Baris detail</span>
                      <strong>{shipmentModalData.details?.length || 0}</strong>
                    </div>
                  </div>

                  <div className="shipment-items-section">
                    <h3>Item shipment</h3>
                    <div className="table-responsive">
                      <table className="data-table compact-table">
                        <thead>
                          <tr>
                            <th>Produk</th>
                            <th>Total qty</th>
                            <th>Qty / box</th>
                            <th>Box</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(shipmentModalData.details || []).map(detail => (
                            <tr key={detail.ID_outbound_detail}>
                              <td className="font-medium">{detail.nama_barang || `Barang ${detail.ID_barang || '-'}`}</td>
                              <td>{detail.quantity_outbound ?? '-'}</td>
                              <td>{detail.quantity_per_box ?? '-'}</td>
                              <td>{detail.jumlah_box ?? '-'}</td>
                            </tr>
                          ))}
                          {(!shipmentModalData.details || shipmentModalData.details.length === 0) && (
                            <tr>
                              <td colSpan="4" className="text-center" style={{ padding: '20px' }}>Belum ada detail item.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShipmentModalData(null)}>Tutup</button>
              {shipmentModalData.has_discrepancy && (
                <button className="btn btn-primary" onClick={() => { setShipmentModalData(null); openDiscrepancyReview(); }}>
                  Tinjau selisih
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard;

