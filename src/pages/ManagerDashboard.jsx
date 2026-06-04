import { useState, useEffect } from 'react';
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
  buildDiscrepancyByPartRows,
  buildScheduleRiskCards,
  buildActionQueueCards,
  buildTopDiscrepancyPartHighlights,
  summarizeAuditEvidence,
} from '../utils/dashboardLogic';
import AnalyticsTrendChart from '../components/AnalyticsTrendChart';
import AppSidebar from '../components/navigation/AppSidebar';
import ConfirmModal from '../components/ui/ConfirmModal';
import { buildWarehouseScopedParams } from '../utils/receivingWorkspace';
import './ManagerDashboard.css';

const ManagerDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSidebar, setActiveSidebar] = useState('dashboard');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState('total');
  const [overviewVendorFilter, setOverviewVendorFilter] = useState('all');
  const [overviewStatusFilter, setOverviewStatusFilter] = useState('all');
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
  const [resolutionType, setResolutionType] = useState('approve'); // approve (mismatch report) or return
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const navigate = useNavigate();

  const normalizeListResponse = (data) => {
    const responseData = data?.data;
    return Array.isArray(responseData) ? responseData : (responseData?.data || []);
  };

  const normalizeOverviewResponse = (data) => data?.data || null;

  const fetchData = async ({ includeSecondary = true } = {}) => {
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
  };

  const fetchManagerAnalytics = async (vendorId = null) => {
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
      setAnalyticsError(err.response?.data?.message || err.message || 'Failed to load analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchWarehouses = async () => {
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
  };

  useEffect(() => {
    fetchData();
    void fetchManagerAnalytics();
  }, [warehouseScope]);

  useEffect(() => {
    void fetchWarehouses();
  }, []);

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
          `Mismatch report generated for discrepancy DISC-${resolveModalData.ID_discrepancy}.`,
          `Expected quantity: ${resolveModalData.quantity_outbound}.`,
          `Received quantity accepted: ${resolveModalData.quantity_inbound}.`,
          `Difference / missing quantity: ${Math.abs(Number(resolveModalData.selisih || 0))}.`,
          resolutionNotes ? `Manager notes: ${resolutionNotes}` : null,
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
        alert('Discrepancy action saved successfully.');
      }
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || error.message;
      alert(`Error resolving discrepancy: ${msg}`);
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
      alert(`Error loading shipment details: ${msg}`);
    } finally {
      setShipmentDetailsLoading(false);
    }
  };

  const hasCompletedAction = (discrepancy) => discrepancy.latest_action?.status_action === 'done';
  const isAcceptedDiscrepancy = (discrepancy) => hasCompletedAction(discrepancy) && discrepancy.latest_action?.action_type === 'approve';
  const isReturnedDiscrepancy = (discrepancy) => hasCompletedAction(discrepancy) && discrepancy.latest_action?.action_type === 'return';
  const pendingDiscrepancies = discrepancies.filter(d => d.status !== 'match' && !hasCompletedAction(d));
  const resolvedDiscrepancies = discrepancies.filter(d => d.status !== 'match' && hasCompletedAction(d));
  const inboundReceivedItems = discrepancies.filter(d => d.status === 'match' || isAcceptedDiscrepancy(d));
  const shipmentCounts = managerOverview?.shipment_counts || getShipmentStatusCounts(shipments);
  const pendingCount = Number(managerOverview?.discrepancy_breakdown?.pending_review ?? pendingDiscrepancies.length);
  const filteredShipments = filterShipmentsByStatusGroup(shipments, shipmentStatusFilter);
  const discrepancyStatusCounts = managerOverview?.discrepancy_breakdown?.by_status || getDiscrepancyStatusCounts(discrepancies);
  const agingSla = managerOverview?.aging_sla || {
    overdue_shipping: 0,
    awaiting_verification: 0,
  };
  const pendingReviewQueue = Array.isArray(managerOverview?.pending_review_queue)
    ? managerOverview.pending_review_queue
    : pendingDiscrepancies.slice(0, 5);
  const vendorOptions = Array.from(new Set(
    shipments
      .map((shipment) => shipment.vendor?.nama_vendor || (shipment.ID_vendor ? `Vendor ${shipment.ID_vendor}` : ''))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  const overviewFilteredShipments = shipments.filter((shipment) => {
    const vendorName = shipment.vendor?.nama_vendor || (shipment.ID_vendor ? `Vendor ${shipment.ID_vendor}` : '');
    const vendorMatches = overviewVendorFilter === 'all' || vendorName === overviewVendorFilter;
    const statusMatches = overviewStatusFilter === 'all'
      || (overviewStatusFilter === 'discrepancy' ? shipment.has_discrepancy : shipment.status === overviewStatusFilter);
    return vendorMatches && statusMatches;
  });
  const analyticsModel = managerAnalytics || normalizeAnalyticsResponse(null);
  const analyticsTrendData = buildTrendChartData(analyticsModel.trend_by_date);
  const analyticsTopParts = buildTopDiscrepancyPartHighlights(analyticsModel.discrepancy_by_part, 4);
  const analyticsRiskCards = buildScheduleRiskCards(analyticsModel.schedule_risk);
  const analyticsActionCards = buildActionQueueCards(analyticsModel.action_queue);
  const analyticsAuditSummary = summarizeAuditEvidence(analyticsModel.audit_evidence_summary);
  const analyticsPreviewAvailable = Boolean(managerAnalytics) && !analyticsError;
  const analyticsPending = analyticsLoading && !managerAnalytics;
  const managerPrimaryCards = buildManagerDashboardPrimaryCards(shipmentCounts, pendingCount);
  const managerHeroMetrics = buildManagerDashboardHeroMetrics({
    shipmentCounts,
    pendingCount,
    analytics: analyticsModel,
  });
  const assignedWarehouse = user?.warehouse || null;
  const warehouseScopeLabel = warehouseScope === 'default'
    ? (assignedWarehouse?.nama_gudang || 'Assigned default warehouse')
    : warehouseScope === 'all'
      ? 'All warehouses'
      : (warehouses.find((warehouse) => String(warehouse.ID_gudang) === String(warehouseScope))?.nama_gudang || `Warehouse ${warehouseScope}`);

  const getStatusBadge = (status) => {
    switch(status) {
      case 'verified': return <span className="status-badge status-success">Verified</span>;
      case 'delivered': return <span className="status-badge status-success">Delivered</span>;
      case 'discrepancy': return <span className="status-badge status-danger">Discrepancy</span>;
      case 'in_transit': return <span className="status-badge status-warning">In Transit</span>;
      case 'draft': return <span className="status-badge status-pending">Draft</span>;
      case 'submitted': return <span className="status-badge status-pending">Submitted</span>;
      case 'arrived': return <span className="status-badge status-warning">Arrived (Awaiting Manual Verification)</span>;
      default: return <span className="status-badge status-pending">{String(status || 'Unknown').replace(/_/g, ' ')}</span>;
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
            <thead>
              <tr><th>Product</th><th>Expected</th><th>Received Accepted</th><th>Difference</th><th>Status</th></tr>
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
          <h2>Manager Notes</h2>
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
            label: 'Overview',
            items: [
              {
                value: 'dashboard',
                label: 'Dashboard',
                icon: 'fa-solid fa-border-all',
                onClick: () => openSidebarSection('dashboard'),
              },
              {
                value: 'shipments',
                label: 'Shipments',
                icon: 'fa-solid fa-truck-fast',
                onClick: () => openSidebarSection('shipments'),
              },
            ],
          },
          {
            label: 'Verification',
            items: [
              {
                value: 'verification-results',
                label: 'Verification results',
                icon: 'fa-solid fa-clipboard-check',
                onClick: () => openSidebarSection('verification-results'),
              },
              {
                value: 'discrepancy-review',
                label: 'Discrepancy review',
                icon: 'fa-solid fa-code-pull-request',
                badge: pendingCount > 0 ? pendingCount : null,
                onClick: () => openDiscrepancyReview(),
              },
            ],
          },
          {
            label: 'Reports',
            items: [
              {
                value: 'reports',
                label: 'Vendor reports',
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
        <header className="topbar">
          <div className="search-bar">
            <i className="fa-solid fa-search"></i>
            <input type="text" placeholder="Search Shipment ID, Vendor Name, or Status..." />
          </div>
          <div className="topbar-actions">
            <div className="date-badge">
              <i className="fa-regular fa-calendar"></i>
              <span>{new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <button className="icon-btn">
              <i className="fa-regular fa-bell"></i>
              {pendingCount > 0 && <span className="notification-dot"></span>}
            </button>
            <div className="user-profile">
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#003399', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {user ? user.nama?.charAt(0).toUpperCase() : 'M'}
              </div>
              <div className="user-info">
                <span className="user-name">{user ? user.nama : 'Manager'}</span>
                <span className="user-role">{user ? user.role : 'Warehouse Manager'}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content-wrapper">
          {activeSidebar === 'dashboard' && (
            <>
              <div className="page-header">
                <div>
                  <h1>Manager Dashboard</h1>
                  <p className="subtitle">Welcome back, {user ? user.nama.split(' ')[0] : 'Manager'}. Review and resolve all shipment discrepancies.</p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="filter-group" style={{ minWidth: '220px' }}>
                    <select
                      className="filter-select"
                      value={warehouseScope}
                      onChange={(event) => setWarehouseScope(event.target.value)}
                    >
                      <option value="default">
                        {assignedWarehouse?.nama_gudang ? `Default: ${assignedWarehouse.nama_gudang}` : 'Use assigned default'}
                      </option>
                      <option value="all">All Warehouses</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.ID_gudang} value={String(warehouse.ID_gudang)}>
                          {warehouse.nama_gudang}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-outline" onClick={handleExportReport} disabled={dashboardLoading}>
                    <i className="fa-solid fa-download"></i> {dashboardLoading ? 'Preparing...' : 'Export Report'}
                  </button>
                </div>
              </div>

              <div className="card data-card" style={{ marginBottom: '1rem' }}>
                <div className="table-toolbar" style={{ justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div className="table-summary-text">
                    Warehouse context: <strong>{warehouseScopeLabel}</strong>
                  </div>
                  <div className="table-summary-text text-muted">
                    Default scope comes from your account. Switch to a specific warehouse or all warehouses when needed.
                  </div>
                </div>
              </div>

              {/* Stats KPI Row */}
              <div className="stats-kpi-container">
                {managerPrimaryCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className={`kpi-card kpi-card-action ${
                      card.tone === 'blue'
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
                      <span className="kpi-title">{card.label}</span>
                      <i className={`fa-solid text-muted ${
                        card.key === 'total'
                          ? 'fa-box-open'
                          : card.key === 'shipping'
                            ? 'fa-truck-fast'
                            : card.key === 'delivered'
                              ? 'fa-circle-check'
                              : 'fa-triangle-exclamation'
                      }`}></i>
                    </div>
                    <div className={`kpi-value ${card.key === 'pending_review' && card.value > 0 ? 'text-warning' : ''}`}>{card.value}</div>
                    <div className={`kpi-trend ${card.key === 'pending_review' && card.value > 0 ? 'text-danger' : 'text-muted'}`}>
                      {card.key === 'total' ? <i className="fa-solid fa-arrow-trend-up"></i> : null} {card.description}
                    </div>
                  </button>
                ))}
              </div>

              <div className="manager-spotlight-card">
                <div className="manager-spotlight-copy">
                  <span className="manager-spotlight-eyebrow">Highlighted now</span>
                  <h2>Shipment discrepancy dan overdue shipping tetap jadi fokus pertama manager.</h2>
                  <p>Dashboard utama sekarang menaruh trend analytics di depan, tapi tetap menjaga queue review dan breakdown vendor tetap cepat dipindai.</p>
                </div>
                <div className="manager-spotlight-metrics">
                  <div className="manager-spotlight-metric">
                    <span>Shipment discrepancy</span>
                    <strong>{shipmentCounts.discrepancy}</strong>
                  </div>
                  <div className="manager-spotlight-metric">
                    <span>Overdue shipping</span>
                    <strong>{agingSla.overdue_shipping}</strong>
                  </div>
                </div>
                <button className="btn btn-outline manager-spotlight-action" onClick={() => fetchManagerAnalytics()} disabled={analyticsLoading}>
                  {analyticsLoading ? 'Syncing...' : 'Refresh insight'}
                </button>
              </div>

              <div className="insight-card manager-hero-card manager-hero-card--standalone">
                <div className="insight-card-header">
                  <div>
                    <h2>Shipment & Discrepancy Trend</h2>
                    <p>Trend utama manager sekarang langsung menyorot shipment bermasalah, backlog review, dan bukti audit tanpa pindah halaman.</p>
                  </div>
                  <button className="btn btn-outline" onClick={() => fetchManagerAnalytics()} disabled={analyticsLoading}>
                    {analyticsLoading ? 'Syncing...' : 'Refresh insight'}
                  </button>
                </div>
                {analyticsPending ? (
                  <>
                    <div className="manager-hero-chip-row">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="manager-hero-chip manager-skeleton-card">
                          <span className="manager-skeleton-line short"></span>
                          <strong className="manager-skeleton-line value"></strong>
                        </div>
                      ))}
                    </div>
                    <div className="manager-trend-panel manager-trend-panel-hero manager-skeleton-card manager-skeleton-chart"></div>
                  </>
                ) : (
                  <>
                    <div className="manager-hero-chip-row">
                      {managerHeroMetrics.map((metric) => (
                        <div key={metric.key} className={`manager-hero-chip tone-${metric.tone}`}>
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                        </div>
                      ))}
                    </div>
                    {analyticsPreviewAvailable && analyticsModel.trend_by_date.length > 0 ? (
                      <div className="manager-trend-panel manager-trend-panel-hero">
                        <AnalyticsTrendChart data={analyticsTrendData} theme="dark" />
                      </div>
                    ) : (
                      <div className="manager-activity-empty">Trend analytics belum tersedia.</div>
                    )}
                  </>
                )}
              </div>

              <div className="manager-insight-grid mt-4">
                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Audit Evidence Coverage</h2>
                      <p>Bukti digital lebih relevan untuk audit dan klaim dibanding mengulang distribusi status yang sudah ada di KPI.</p>
                    </div>
                  </div>
                  {analyticsPending ? (
                    <div className="queue-signal-list">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="queue-signal-item manager-skeleton-card manager-skeleton-signal"></div>
                      ))}
                    </div>
                  ) : (
                    <div className="queue-signal-list">
                      <div className="queue-signal-item">
                        <span>With Photo</span>
                        <strong>{analyticsAuditSummary.withPhoto}</strong>
                      </div>
                      <div className="queue-signal-item">
                        <span>Without Photo</span>
                        <strong>{analyticsAuditSummary.withoutPhoto}</strong>
                      </div>
                      <div className="queue-signal-item">
                        <span>With Timestamp</span>
                        <strong>{analyticsAuditSummary.withTimestamp}</strong>
                      </div>
                      <div className="queue-signal-item">
                        <span>With Location</span>
                        <strong>{analyticsAuditSummary.withLocation}</strong>
                      </div>
                    </div>
                  )}
                </div>

                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Discrepancy Breakdown</h2>
                      <p>Operational view of verification outcomes.</p>
                    </div>
                  </div>
                  <div className="breakdown-grid">
                    <div>
                      <span>Match</span>
                      <strong>{discrepancyStatusCounts.match || 0}</strong>
                    </div>
                    <div>
                      <span>Mismatch</span>
                      <strong>{discrepancyStatusCounts.mismatch || 0}</strong>
                    </div>
                    <div>
                      <span>Missing</span>
                      <strong>{discrepancyStatusCounts.missing || 0}</strong>
                    </div>
                    <div>
                      <span>Over</span>
                      <strong>{discrepancyStatusCounts.over || 0}</strong>
                    </div>
                  </div>
                </div>

                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Action Queue</h2>
                      <p>Operational backlog that still needs a manager decision.</p>
                    </div>
                  </div>
                  <div className="queue-signal-list">
                    {analyticsPending ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="queue-signal-item manager-skeleton-card manager-skeleton-signal"></div>
                      ))
                    ) : analyticsPreviewAvailable ? (
                      analyticsActionCards.map((card) => (
                        <div key={card.key} className="queue-signal-item">
                          <span>{card.label}</span>
                          <strong>{card.value}</strong>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="queue-signal-item">
                          <span>Pending Review</span>
                          <strong>{pendingCount}</strong>
                        </div>
                        <div className="queue-signal-item">
                          <span>Awaiting Verification</span>
                          <strong>{agingSla.awaiting_verification}</strong>
                        </div>
                        <div className="queue-signal-item">
                          <span>Overdue Shipping</span>
                          <strong>{agingSla.overdue_shipping}</strong>
                        </div>
                        <div className="queue-signal-item">
                          <span>Queue Preview</span>
                          <strong>{pendingReviewQueue.length}</strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Pending Review Queue</h2>
                      <p>Queue discrepancy yang paling perlu keputusan manager sekarang.</p>
                    </div>
                  </div>
                  {pendingReviewQueue.length > 0 ? (
                    <div className="vendor-performance-mini-list">
                      {pendingReviewQueue.map((item) => (
                        <div key={item.ID_discrepancy} className="vendor-performance-mini-item">
                          <div>
                            <strong>{item.outbound_detail?.outbound?.vendor?.nama_vendor || `Vendor ${item.ID_vendor || '-'}`}</strong>
                            <span>{item.outbound_detail?.barang?.nama_barang || `Outbound Detail ${item.ID_outbound_detail || '-'}`}</span>
                          </div>
                          <div>
                            <strong>{item.status || 'pending'}</strong>
                            <span>{formatDateTime(item.detected_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-activity-empty">Tidak ada discrepancy yang menunggu review.</div>
                  )}
                </div>

                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Vendor Performance Snapshot</h2>
                      <p>Quick read of discrepancy rate by vendor.</p>
                    </div>
                    {secondaryLoading && <span className="status-badge status-pending">Syncing</span>}
                  </div>
                  {analyticsData.length > 0 ? (
                    <div className="vendor-performance-mini-list">
                      {analyticsData.slice(0, 3).map((item) => (
                        <div key={item.vendor_id || item.vendor_name || item.vendor} className="vendor-performance-mini-item">
                          <div>
                            <strong>{item.vendor_name || item.vendor || `Vendor ${item.vendor_id || '-'}`}</strong>
                            <span>{item.shipments_with_discrepancy ?? item.total_discrepancies ?? 0} discrepancy shipments</span>
                          </div>
                          <div>
                            <strong>{formatRate(item.discrepancy_rate ?? item.rate)}</strong>
                            <span>{item.total_shipments} total shipments</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-activity-empty">
                      {secondaryLoading ? 'Loading vendor performance...' : 'No vendor performance data available yet.'}
                    </div>
                  )}
                </div>

                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Part Paling Sering Selisih</h2>
                      <p>Komponen yang paling sering memicu mismatch, missing, atau over.</p>
                    </div>
                  </div>
                  {analyticsPending ? (
                    <div className="vendor-performance-mini-list">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="vendor-performance-mini-item manager-skeleton-card manager-skeleton-row"></div>
                      ))}
                    </div>
                  ) : analyticsPreviewAvailable && analyticsTopParts.length > 0 ? (
                    <div className="vendor-performance-mini-list">
                      {analyticsTopParts.map((part) => (
                        <div key={part.part_id || part.part_name} className="vendor-performance-mini-item">
                          <div>
                            <strong>{part.part_name || `Part ${part.part_id || '-'}`}</strong>
                            <span>Mismatch {part.mismatch || 0} | Missing {part.missing || 0} | Over {part.over || 0}</span>
                          </div>
                          <div>
                            <strong>{part.total_non_match || 0}</strong>
                            <span>Total non-match</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="manager-activity-empty">No discrepancy-by-part data available yet.</div>
                  )}
                </div>

                <div className="insight-card">
                  <div className="insight-card-header">
                    <div>
                      <h2>Schedule Risk & Audit Coverage</h2>
                      <p>Shipment yang berisiko terlambat dan sejauh mana bukti audit sudah tersedia.</p>
                    </div>
                  </div>
                  <div className="queue-signal-list">
                    {analyticsPending ? (
                      Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="queue-signal-item manager-skeleton-card manager-skeleton-signal"></div>
                      ))
                    ) : analyticsPreviewAvailable ? (
                      <>
                        {analyticsRiskCards.slice(0, 4).map((card) => (
                          <div key={card.key} className="queue-signal-item">
                            <span>{card.label}</span>
                            <strong>{card.value}</strong>
                          </div>
                        ))}
                        <div className="queue-signal-item">
                          <span>With Photo</span>
                          <strong>{analyticsAuditSummary.withPhoto}</strong>
                        </div>
                        <div className="queue-signal-item">
                          <span>With Timestamp</span>
                          <strong>{analyticsAuditSummary.withTimestamp}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="queue-signal-item">
                          <span>Overdue Shipping</span>
                          <strong>{agingSla.overdue_shipping}</strong>
                        </div>
                        <div className="queue-signal-item">
                          <span>Awaiting Verification</span>
                          <strong>{agingSla.awaiting_verification}</strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Data Section */}
              <div className="card data-card mt-4">
                <div className="card-tabs">
                  <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                    Shipment Overview <span className="tab-badge">All</span>
                  </button>
                  <button className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                    Pending Review <span className="tab-badge warning">{pendingCount}</span>
                  </button>
                  <button className={`tab-btn ${activeTab === 'inbound-received' ? 'active' : ''}`} onClick={() => setActiveTab('inbound-received')}>
                    Inbound Received <span className="tab-badge">{inboundReceivedItems.length}</span>
                  </button>
                  <button className={`tab-btn ${activeTab === 'discrepancies' ? 'active' : ''}`} onClick={() => setActiveTab('discrepancies')}>
                    Resolved Discrepancies <span className="tab-badge">{resolvedDiscrepancies.length}</span>
                  </button>
                </div>

                {/* Shipment Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="tab-content active" id="tab-overview">
                    <div className="table-toolbar">
                      <div className="filter-group">
                        <select className="form-control filter-select" value={overviewVendorFilter} onChange={(e) => setOverviewVendorFilter(e.target.value)}>
                          <option value="all">All Vendors</option>
                          {vendorOptions.map((vendor) => (
                            <option key={vendor} value={vendor}>{vendor}</option>
                          ))}
                        </select>
                        <select className="form-control filter-select" value={overviewStatusFilter} onChange={(e) => setOverviewStatusFilter(e.target.value)}>
                          <option value="all">All Statuses</option>
                          <option value="draft">Draft</option>
                          <option value="submitted">Submitted</option>
                          <option value="in_transit">In Transit</option>
                          <option value="arrived">Arrived</option>
                          <option value="verified">Verified</option>
                          <option value="discrepancy">Has Discrepancy</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Shipment ID</th>
                            <th>Vendor</th>
                            <th>Status</th>
                            <th>Created At</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardLoading ? (
                            <tr><td colSpan="5" className="text-center" style={{ padding: '24px' }}><i className="fa-solid fa-spinner fa-spin"></i> Loading shipments...</td></tr>
                          ) : overviewFilteredShipments.map(shp => (
                            <tr key={shp.ID_outbound} className={shp.has_discrepancy ? 'highlight-row' : ''}>
                              <td className="font-medium">SHP-{shp.ID_outbound}</td>
                              <td>{shp.vendor?.nama_vendor || `Vendor ${shp.ID_vendor}`}</td>
                              <td>{getStatusBadge(shp.status)}</td>
                              <td className="text-muted">{formatDateTime(shp.created_at)}</td>
                              <td>
                                {shp.has_discrepancy ? (
                                  <button className="btn btn-sm btn-primary" onClick={() => setActiveTab('pending')}>Review</button>
                                ) : (
                                  <button className="btn btn-sm btn-outline" onClick={() => handleViewShipmentDetails(shp)}>Details</button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!dashboardLoading && overviewFilteredShipments.length === 0 && (
                            <tr><td colSpan="5" className="text-center" style={{ padding: '20px' }}>No shipments found for the selected filters.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Pending Review Tab */}
                {activeTab === 'pending' && (
                  <div className="tab-content active" id="tab-pending">
                    <div className="review-grid">
                      {pendingDiscrepancies.map(disc => (
                        <div className="review-card" key={disc.ID_discrepancy}>
                          <div className="review-card-header bg-danger-light border-danger">
                            <div className="review-title">
                              <i className="fa-solid fa-triangle-exclamation text-danger"></i>
                              <span style={{ textTransform: 'capitalize' }}>{disc.status} Item Discrepancy</span>
                            </div>
                            <span className="review-time">{new Date(disc.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="review-card-body">
                            <div className="review-detail-row">
                              <span className="label">Outbound Detail ID</span>
                              <span className="value font-medium">{disc.ID_outbound_detail}</span>
                            </div>
                            <div className="review-detail-row">
                              <span className="label">Item Name</span>
                              <span className="value">{disc.outbound_detail?.barang?.nama_barang || 'Unknown'}</span>
                            </div>
                            <div className="review-issue-box">
                              <p><strong>Issue:</strong> Quantity mismatch detected from Scan Officer manual verification.</p>
                              {disc.inbound_detail?.audit_photos?.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '8px', margin: '10px 0' }}>
                                  {disc.inbound_detail.audit_photos.map(photo => (
                                    <a key={photo.ID_foto} href={photo.file_url} target="_blank" rel="noreferrer">
                                      <img src={photo.file_url} alt="Condition evidence" style={{ width: '100%', height: '72px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                                    </a>
                                  ))}
                                </div>
                              )}
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
                            </div>
                            <div className="review-actions mt-3">
                              <button className="btn btn-primary btn-block" onClick={() => setResolveModalData(disc)}>
                                <i className="fa-solid fa-file-contract"></i> Resolve Mismatch
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {pendingDiscrepancies.length === 0 && (
                        <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                          <i className="fa-solid fa-clipboard-check text-success"></i>
                          <h3>All Caught Up!</h3>
                          <p>There are no pending discrepancies requiring your attention.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Resolved Discrepancies Tab */}
                {activeTab === 'inbound-received' && (
                  <div className="tab-content active" id="tab-inbound-received">
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Shipment</th>
                            <th>Vendor</th>
                            <th>Item</th>
                            <th>Expected</th>
                            <th>Received Accepted</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inboundReceivedItems.map(item => (
                            <tr key={item.ID_discrepancy}>
                              <td className="font-medium">{item.outbound_detail?.outbound?.no_pengiriman || `SHP-${item.outbound_detail?.outbound?.ID_outbound || '-'}`}</td>
                              <td>{item.outbound_detail?.outbound?.vendor?.nama_vendor || '-'}</td>
                              <td>{item.outbound_detail?.barang?.nama_barang || `Outbound Detail ${item.ID_outbound_detail}`}</td>
                              <td>{item.quantity_outbound ?? '-'}</td>
                              <td>{item.quantity_inbound ?? '-'}</td>
                              <td>
                                {item.status === 'match' ? (
                                  <span className="status-badge status-success">Matched</span>
                                ) : (
                                  <span className="status-badge status-warning">Discrepancy Accepted</span>
                                )}
                              </td>
                              <td>
                                {item.dokumen_r1 ? (
                                  <span className="text-muted">{item.dokumen_r1.no_dokumen_r1}</span>
                                ) : (
                                  <span className="text-muted">Accepted inbound</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {inboundReceivedItems.length === 0 && (
                            <tr><td colSpan="7" className="text-center" style={{ padding: '32px' }}>No inbound received records yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Resolved Discrepancies Tab */}
                {activeTab === 'discrepancies' && (
                  <div className="tab-content active" id="tab-discrepancies">
                    <div className="resolved-discrepancy-list">
                      {resolvedDiscrepancies.map(disc => (
                        <div className="resolved-discrepancy-item" key={disc.ID_discrepancy}>
                          <div className={`resolved-discrepancy-icon ${isReturnedDiscrepancy(disc) ? 'returned' : ''}`}>
                            <i className={`fa-solid ${isReturnedDiscrepancy(disc) ? 'fa-rotate-left' : 'fa-check'}`}></i>
                          </div>
                          <div className="resolved-discrepancy-main">
                            <div className="resolved-discrepancy-title">
                              <strong>{disc.outbound_detail?.barang?.nama_barang || `Outbound Detail ${disc.ID_outbound_detail}`}</strong>
                              <span className={`status-badge ${isReturnedDiscrepancy(disc) ? 'status-danger' : 'status-success'}`}>
                                {isReturnedDiscrepancy(disc) ? 'Returned to Vendor' : 'Accepted with Report'}
                              </span>
                            </div>
                            <div className="resolved-discrepancy-meta">
                              <span>DISC-{disc.ID_discrepancy}</span>
                              <span>Expected {disc.quantity_outbound}</span>
                              <span>Received {disc.quantity_inbound}</span>
                              <span>Difference {disc.selisih}</span>
                              {disc.dokumen_r1 && <span>Report {disc.dokumen_r1.no_dokumen_r1}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                      {resolvedDiscrepancies.length === 0 && (
                        <div className="empty-state">
                          <i className="fa-solid fa-clipboard-check text-success"></i>
                          <h3>No Resolved Discrepancies Yet</h3>
                          <p>Items will appear here after a manager confirms a mismatch resolution.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                    <tbody>
                      {dashboardLoading ? (
                        <tr><td colSpan="6" className="text-center" style={{ padding: '32px' }}><i className="fa-solid fa-spinner fa-spin"></i> Loading shipments...</td></tr>
                      ) : filteredShipments.map(shp => (
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

          {false && (
            <>
              <div className="page-header">
                <div>
                  <h1>Analytics & Vendor Performance</h1>
                  <p className="subtitle">
                    Operational analytics by dispatch date.{' '}
                    {managerAnalytics?.generated_at && (
                      <span className="text-muted">Generated {formatDateTime(managerAnalytics.generated_at)}</span>
                    )}
                  </p>
                </div>
                <div className="header-actions">
                  <select
                    className="form-control filter-select"
                    value="all"
                    onChange={(e) => fetchManagerAnalytics(e.target.value)}
                    disabled={analyticsLoading}
                  >
                    <option value="all">All Vendors</option>
                    {(managerAnalytics?.discrepancy_by_vendor || []).map((v) => (
                      <option key={v.vendor_id} value={String(v.vendor_id)}>{v.vendor_name}</option>
                    ))}
                  </select>
                  <button className="btn btn-outline" onClick={() => fetchManagerAnalytics()} disabled={analyticsLoading}>
                    <i className="fa-solid fa-rotate"></i> Refresh
                  </button>
                </div>
              </div>

              {analyticsLoading && (
                <div className="text-center" style={{ padding: '48px' }}>
                  <i className="fa-solid fa-spinner fa-spin"></i> Loading analytics...
                </div>
              )}

              {analyticsError && !analyticsLoading && (
                <div className="card data-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
                  <i className="fa-solid fa-circle-exclamation"></i> {analyticsError}
                  <div style={{ marginTop: '1rem' }}>
                    <button className="btn btn-outline" onClick={() => fetchManagerAnalytics()}>Retry</button>
                  </div>
                </div>
              )}

              {!analyticsLoading && !analyticsError && managerAnalytics && (() => {
                const { schedule_risk, action_queue, audit_evidence_summary, discrepancy_by_part, discrepancy_by_vendor, trend_by_date } = managerAnalytics;
                const partRows = buildDiscrepancyByPartRows(discrepancy_by_part);
                const auditSummary = summarizeAuditEvidence(audit_evidence_summary);
                const trendData = buildTrendChartData(trend_by_date);

                return (
                  <>
                    {/* Signal Cards */}
                    <div className="manager-section-grid">
                      <div className="section-summary-card">
                        <span>Dispatch Today</span>
                        <strong>{schedule_risk.dispatch_today}</strong>
                      </div>
                      <div className="section-summary-card">
                        <span>Arrival Today</span>
                        <strong>{schedule_risk.arrival_today}</strong>
                      </div>
                      <div className="section-summary-card">
                        <span>Overdue Shipping</span>
                        <strong style={{ color: schedule_risk.overdue_shipping > 0 ? 'var(--danger)' : undefined }}>{schedule_risk.overdue_shipping}</strong>
                      </div>
                      <div className="section-summary-card">
                        <span>Awaiting Verification</span>
                        <strong>{schedule_risk.arrived_awaiting_verification}</strong>
                      </div>
                      <div className="section-summary-card">
                        <span>Draft Pending Submit</span>
                        <strong>{action_queue.draft_pending_submit}</strong>
                      </div>
                      <div className="section-summary-card">
                        <span>QR Not Ready</span>
                        <strong>{action_queue.submitted_qr_not_ready}</strong>
                      </div>
                      <div className="section-summary-card">
                        <span>Pending Discrepancy Review</span>
                        <strong style={{ color: action_queue.pending_discrepancy_review > 0 ? 'var(--danger)' : undefined }}>{action_queue.pending_discrepancy_review}</strong>
                      </div>
                    </div>

                    {/* Trend Chart */}
                    <div className="card data-card mt-4">
                      <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', borderBottom: 'none' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Shipment Trend</h2>
                        <p className="text-muted" style={{ fontSize: '0.85rem' }}>By dispatch date · latest 30 points</p>
                      </div>
                      <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
                        {trend_by_date.length > 0 ? (
                          <AnalyticsTrendChart data={trendData} />
                        ) : (
                          <div className="manager-activity-empty">No trend data available yet.</div>
                        )}
                      </div>
                    </div>

                    {/* Discrepancy by Part */}
                    <div className="card data-card mt-4">
                      <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Discrepancy by Part</h2>
                      </div>
                      <div className="table-responsive" style={{ padding: '1rem' }}>
                        {partRows.length > 0 ? (
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Part</th>
                                <th className="text-center">Mismatch</th>
                                <th className="text-center">Missing</th>
                                <th className="text-center">Over</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {partRows.map((row) => {
                                const maxTotal = partRows[0].total_non_match || 1;
                                const barPct = Math.round((row.total_non_match / maxTotal) * 100);
                                return (
                                  <tr key={row.part_id}>
                                    <td className="font-medium">{row.part_name}</td>
                                    <td className="text-center">{row.mismatch}</td>
                                    <td className="text-center">{row.missing}</td>
                                    <td className="text-center">{row.over}</td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '80px', height: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
                                          <div style={{ width: `${barPct}%`, height: '100%', backgroundColor: 'var(--danger)' }}></div>
                                        </div>
                                        <strong>{row.total_non_match}</strong>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <div className="manager-activity-empty">No part discrepancy data available.</div>
                        )}
                      </div>
                    </div>

                    {/* Vendor Performance */}
                    <div className="card data-card mt-4">
                      <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Vendor Performance</h2>
                      </div>
                      <div className="table-responsive" style={{ padding: '1rem' }}>
                        {discrepancy_by_vendor.length > 0 ? (
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Vendor</th>
                                <th className="text-center">Total Shipments</th>
                                <th className="text-center">w/ Discrepancy</th>
                                <th>Rate</th>
                                <th>Label</th>
                              </tr>
                            </thead>
                            <tbody>
                              {discrepancy_by_vendor.map((v) => {
                                const pct = (v.discrepancy_rate || 0) * 100;
                                return (
                                  <tr key={v.vendor_id}>
                                    <td className="font-medium">{v.vendor_name}</td>
                                    <td className="text-center">{v.total_shipments}</td>
                                    <td className="text-center">{v.shipments_with_discrepancy}</td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '100px', height: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
                                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: pct > 10 ? 'var(--danger)' : 'var(--success)' }}></div>
                                        </div>
                                        <span className="font-bold">{formatRate(v.discrepancy_rate)}</span>
                                      </div>
                                    </td>
                                    <td>
                                      {pct === 0
                                        ? <span className="status-badge status-success">Excellent</span>
                                        : pct > 10
                                          ? <span className="status-badge status-danger">Needs Review</span>
                                          : <span className="status-badge status-warning">Acceptable</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <div className="manager-activity-empty">No vendor performance data available.</div>
                        )}
                      </div>
                    </div>

                    {/* Audit Evidence */}
                    <div className="card data-card mt-4">
                      <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                        <h2 style={{ fontSize: '1.1rem' }}>Audit Evidence Summary</h2>
                      </div>
                      <div style={{ padding: '1.5rem' }}>
                        <div className="manager-section-grid">
                          <div className="section-summary-card">
                            <span>With Photo <span className="status-badge status-pending" style={{ fontSize: '0.7rem' }}>partial</span></span>
                            <strong>{auditSummary.withPhoto} <span className="text-muted" style={{ fontSize: '0.85rem' }}>({auditSummary.photoPct}%)</span></strong>
                          </div>
                          <div className="section-summary-card">
                            <span>Without Photo</span>
                            <strong style={{ color: auditSummary.withoutPhoto > 0 ? 'var(--warning)' : undefined }}>{auditSummary.withoutPhoto}</strong>
                          </div>
                          <div className="section-summary-card">
                            <span>With Location <span className="status-badge status-pending" style={{ fontSize: '0.7rem' }}>partial</span></span>
                            <strong>{auditSummary.withLocation} <span className="text-muted" style={{ fontSize: '0.85rem' }}>({auditSummary.locationPct}%)</span></strong>
                          </div>
                          <div className="section-summary-card">
                            <span>With Timestamp</span>
                            <strong>{auditSummary.withTimestamp}</strong>
                          </div>
                        </div>
                        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
                          Photo = <code>tabel_foto</code> records only. Location = warehouse context, not GPS coordinates.
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          )}

          {activeSidebar === 'reports' && (
            <>
              <div className="page-header">
                <div>
                  <h1>Vendor Reports (R1 Documents)</h1>
                  <p className="subtitle">Official discrepancy reports sent to vendors for acknowledgment.</p>
                </div>
              </div>
              <div className="card data-card">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Document No</th>
                        <th>Discrepancy ID</th>
                        <th>Status</th>
                        <th>Created By</th>
                        <th>Created At</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secondaryLoading && reportsData.length === 0 ? (
                        <tr><td colSpan="6" className="text-center" style={{ padding: '40px' }}><i className="fa-solid fa-spinner fa-spin"></i> Loading vendor reports...</td></tr>
                      ) : reportsData.map(doc => (
                        <tr key={doc.ID_dokumen}>
                          <td className="font-medium">{doc.no_dokumen_r1}</td>
                          <td>DISC-{doc.ID_discrepancy}</td>
                          <td>
                            <span className={`status-badge ${doc.status_dokumen === 'draft' ? 'status-pending' : 'status-success'}`}>
                              {doc.status_dokumen.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td>{doc.pembuat?.nama || 'System'}</td>
                          <td className="text-muted">{formatDateTime(doc.dibuat_at)}</td>
                          <td>
                            <button className="btn btn-sm btn-outline" onClick={() => setReportModalData(doc)}><i className="fa-solid fa-file-pdf"></i> View PDF</button>
                          </td>
                        </tr>
                      ))}
                      {!secondaryLoading && reportsData.length === 0 && (
                        <tr><td colSpan="6" className="text-center" style={{ padding: '40px' }}>
                          <div className="empty-state" style={{ padding: 0 }}>
                            <i className="fa-solid fa-folder-open text-muted" style={{ fontSize: '3rem', marginBottom: '1rem' }}></i>
                            <p>No R1 documents generated yet.</p>
                          </div>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Sign out?"
        message="You will need to sign in again before continuing manager review and reporting."
        cancelLabel="Stay here"
        confirmLabel="Sign out"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />

      {/* Resolution Modal Overlay */}
      {resolveModalData && (
        <div className="modal-overlay" id="resolveModal" style={{ display: 'flex' }}>
          <div className="modal">
            <div className="modal-header">
              <h2>Discrepancy Resolution</h2>
              <button className="close-btn" onClick={() => setResolveModalData(null)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning mb-3">
                <i className="fa-solid fa-circle-info"></i>
                <div>
                  <strong>Item {resolveModalData.outbound_detail?.barang?.nama_barang}</strong> has a mismatch of {resolveModalData.selisih} items. You must choose how to resolve this.
                </div>
              </div>
              
              <div className="form-group mt-3">
                <label>Resolution Action</label>
                <div className="radio-group-vertical">
                  <label className="radio-card">
                    <input type="radio" name="resolution_type" checked={resolutionType === 'approve'} onChange={() => setResolutionType('approve')} />
                    <div className="radio-content">
                      <h4>Generate Mismatch Report</h4>
                      <p>Accept the {resolveModalData.quantity_inbound} items and generate an official mismatch report sent to the vendor's dashboard.</p>
                    </div>
                  </label>
                  <label className="radio-card">
                    <input type="radio" name="resolution_type" checked={resolutionType === 'return'} onChange={() => setResolutionType('return')} />
                    <div className="radio-content">
                      <h4>Return Affected Items</h4>
                      <p>Reject the mismatched items and mark them for return to the vendor.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Manager Notes (Optional)</label>
                <textarea className="form-control" rows="3" placeholder="Add any comments that will be attached to the vendor report..." value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)}></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setResolveModalData(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleResolve} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm Resolution'}
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
                <h2>Generated Mismatch Report</h2>
                <p>{reportModalData.no_dokumen_r1 || 'R1 Document'}</p>
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
                  <span className="status-badge status-danger">Mismatch Report</span>
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
                    <span>Dispatch Time</span>
                    <strong>{formatDateTime(reportModalData.discrepancy?.shipment?.waktu_kirim)}</strong>
                  </div>
                  <div>
                    <span>Document Status</span>
                    <strong>{(reportModalData.status_dokumen || '-').replace(/_/g, ' ').toUpperCase()}</strong>
                  </div>
                </div>
                <div className="report-mismatch-row">
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
                    <strong className="text-danger">{reportModalData.discrepancy?.selisih ?? '-'}</strong>
                  </div>
                </div>
                <div className="report-notes">
                  <span>Report Notes</span>
                  <p>{reportModalData.keterangan || '-'}</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setReportModalData(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => openReportPdf(reportModalData)}>
                <i className="fa-solid fa-file-pdf"></i> Open PDF
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
                <h2>Shipment Details</h2>
                <p>SHP-{shipmentModalData.ID_outbound}</p>
              </div>
              <button className="close-btn" onClick={() => setShipmentModalData(null)}><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="modal-body">
              {shipmentDetailsLoading ? (
                <div className="modal-loading">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <p>Loading shipment details...</p>
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
                      <span>Delivery Number</span>
                      <strong>{shipmentModalData.no_pengiriman || '-'}</strong>
                    </div>
                    <div>
                      <span>Origin Location</span>
                      <strong>{shipmentModalData.lokasi_asal || '-'}</strong>
                    </div>
                    <div>
                      <span>Dispatch Time</span>
                      <strong>{formatDateTime(shipmentModalData.waktu_kirim)}</strong>
                    </div>
                    <div>
                      <span>Estimated Arrival</span>
                      <strong>{formatDateTime(shipmentModalData.estimasi_tiba)}</strong>
                    </div>
                    <div>
                      <span>Created At</span>
                      <strong>{formatDateTime(shipmentModalData.created_at)}</strong>
                    </div>
                    <div>
                      <span>Created By</span>
                      <strong>{shipmentModalData.creator?.nama || `User ${shipmentModalData.dibuat_oleh || '-'}`}</strong>
                    </div>
                  </div>

                  <div className="shipment-total-row">
                    <div>
                      <span>Total Items</span>
                      <strong>{getShipmentTotals(shipmentModalData).quantity}</strong>
                    </div>
                    <div>
                      <span>Total Boxes</span>
                      <strong>{getShipmentTotals(shipmentModalData).boxes}</strong>
                    </div>
                    <div>
                      <span>Detail Lines</span>
                      <strong>{shipmentModalData.details?.length || 0}</strong>
                    </div>
                  </div>

                  <div className="shipment-items-section">
                    <h3>Shipment Items</h3>
                    <div className="table-responsive">
                      <table className="data-table compact-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Total Qty</th>
                            <th>Qty / Box</th>
                            <th>Boxes</th>
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
                              <td colSpan="4" className="text-center" style={{ padding: '20px' }}>No item details available.</td>
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
              <button className="btn btn-outline" onClick={() => setShipmentModalData(null)}>Close</button>
              {shipmentModalData.has_discrepancy && (
                <button className="btn btn-primary" onClick={() => { setShipmentModalData(null); openDiscrepancyReview(); }}>
                  Review Discrepancy
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
