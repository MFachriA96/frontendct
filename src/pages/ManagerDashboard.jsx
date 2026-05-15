import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import './ManagerDashboard.css';

const ManagerDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSidebar, setActiveSidebar] = useState('dashboard');
  const [user, setUser] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(false);

  // Data State
  const [summary, setSummary] = useState({
    total_outbound_today: 0,
    total_inbound_today: 0,
    total_discrepancy_today: 0,
    pending_actions: 0,
    discrepancy_by_status: { match: 0, mismatch: 0, missing: 0, over: 0 }
  });
  const [shipments, setShipments] = useState([]);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [reportsData, setReportsData] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  
  // Modal State
  const [resolveModalData, setResolveModalData] = useState(null);
  const [shipmentModalData, setShipmentModalData] = useState(null);
  const [reportModalData, setReportModalData] = useState(null);
  const [shipmentDetailsLoading, setShipmentDetailsLoading] = useState(false);
  const [resolutionType, setResolutionType] = useState('approve'); // approve (mismatch report) or return
  const [resolutionNotes, setResolutionNotes] = useState('');

  const navigate = useNavigate();

  const normalizeListResponse = (data) => {
    const responseData = data?.data;
    return Array.isArray(responseData) ? responseData : (responseData?.data || []);
  };

  const fetchData = async ({ includeSecondary = true } = {}) => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    setDashboardLoading(true);

    const [summaryResult, outboundResult, discrepancyResult] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/dashboard/summary`, { headers }),
      axios.get(`${API_BASE_URL}/api/outbound`, { headers }),
      axios.get(`${API_BASE_URL}/api/discrepancy`, { headers })
    ]);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value.data.data);
    } else {
      console.error('Error fetching dashboard summary:', summaryResult.reason);
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
    const [performanceResult, reportsResult] = await Promise.allSettled([
      axios.get(`${API_BASE_URL}/api/dashboard/vendor-performance`, { headers }),
      axios.get(`${API_BASE_URL}/api/dokumen-r1`, { headers })
    ]);

    if (performanceResult.status === 'fulfilled') {
      setAnalyticsData(performanceResult.value.data.data || []);
    } else {
      console.error('Error fetching vendor performance:', performanceResult.reason);
    }

    if (reportsResult.status === 'fulfilled') {
      setReportsData(normalizeListResponse(reportsResult.value.data));
    } else {
      console.error('Error fetching vendor reports:', reportsResult.reason);
    }

    setSecondaryLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (e) {}
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
  const pendingCount = pendingDiscrepancies.length;

  const getStatusBadge = (status) => {
    switch(status) {
      case 'verified': return <span className="status-badge status-success">Verified</span>;
      case 'discrepancy': return <span className="status-badge status-danger">Discrepancy</span>;
      case 'in_transit': return <span className="status-badge status-warning">In Transit</span>;
      case 'draft': return <span className="status-badge status-pending">Draft</span>;
      case 'submitted': return <span className="status-badge status-pending">Pending Scan</span>;
      case 'arrived': return <span className="status-badge status-warning">Arrived (Awaiting Manual Verification)</span>;
      default: return <span className="status-badge status-pending">{status}</span>;
    }
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
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
      ['Total Shipments Today', summary.total_outbound_today],
      ['Inbound Received Today', summary.total_inbound_today],
      ['Items Matched', summary.discrepancy_by_status.match],
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

  return (
    <div className="app-container manager-dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <i className="fa-solid fa-chart-line"></i>
            <span>EpsonManager</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">OVERVIEW</div>
          <a href="#" className={`nav-item ${activeSidebar === 'dashboard' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); openSidebarSection('dashboard');}}>
            <i className="fa-solid fa-border-all"></i>
            <span>Dashboard</span>
          </a>
          <a href="#" className={`nav-item ${activeSidebar === 'shipments' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); openSidebarSection('shipments');}}>
            <i className="fa-solid fa-truck-fast"></i>
            <span>Shipments</span>
          </a>
          
          <div className="nav-section">VERIFICATION</div>
          <a href="#" className={`nav-item ${activeSidebar === 'verification-results' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); openSidebarSection('verification-results');}}>
            <i className="fa-solid fa-clipboard-check"></i>
            <span>Verification Results</span>
          </a>
          <a href="#" className={`nav-item ${activeSidebar === 'discrepancy-review' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); openDiscrepancyReview();}}>
            <i className="fa-solid fa-code-pull-request"></i>
            <span>Discrepancy Review</span>
            {pendingCount > 0 && <span className="badge badge-danger">{pendingCount}</span>}
          </a>

          <div className="nav-section">REPORTS</div>
          <a href="#" className={`nav-item ${activeSidebar === 'analytics' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); setActiveSidebar('analytics');}}>
            <i className="fa-solid fa-chart-pie"></i>
            <span>Analytics</span>
          </a>
          <a href="#" className={`nav-item ${activeSidebar === 'reports' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); setActiveSidebar('reports');}}>
            <i className="fa-solid fa-file-invoice"></i>
            <span>Vendor Reports</span>
          </a>
        </nav>
        <div className="sidebar-footer">
          <a href="#" className="nav-item text-danger" onClick={(e) => {e.preventDefault(); handleLogout();}}>
            <i className="fa-solid fa-right-from-bracket"></i>
            <span>Logout</span>
          </a>
        </div>
      </aside>

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
                <div className="header-actions">
                  <button className="btn btn-outline" onClick={handleExportReport} disabled={dashboardLoading}>
                    <i className="fa-solid fa-download"></i> {dashboardLoading ? 'Preparing...' : 'Export Report'}
                  </button>
                </div>
              </div>

              {/* Stats KPI Row */}
              <div className="stats-kpi-container">
                <div className="kpi-card border-blue">
                  <div className="kpi-header">
                    <span className="kpi-title">Total Shipments (Today)</span>
                    <i className="fa-solid fa-box-open text-muted"></i>
                  </div>
                  <div className="kpi-value">{summary.total_outbound_today}</div>
                  <div className="kpi-trend text-success"><i className="fa-solid fa-arrow-trend-up"></i> Ongoing tracking</div>
                </div>
                
                <div className="kpi-card border-success">
                  <div className="kpi-header">
                    <span className="kpi-title">Items Matched</span>
                    <i className="fa-regular fa-circle-check text-muted"></i>
                  </div>
                  <div className="kpi-value">{summary.discrepancy_by_status.match} <span className="kpi-unit">boxes</span></div>
                  <div className="kpi-trend text-muted">Across all verified shipments</div>
                </div>

                <div className="kpi-card border-warning">
                  <div className="kpi-header">
                    <span className="kpi-title">Pending Review</span>
                    <i className="fa-solid fa-triangle-exclamation text-muted"></i>
                  </div>
                  <div className={`kpi-value ${pendingCount > 0 ? 'text-warning' : ''}`}>{pendingCount} <span className="kpi-unit">discrepancies</span></div>
                  <div className={`kpi-trend ${pendingCount > 0 ? 'text-danger' : 'text-muted'}`}>
                    {pendingCount > 0 ? <><i className="fa-solid fa-circle-exclamation"></i> Requires immediate action</> : 'All clear for now'}
                  </div>
                </div>

                <div className="kpi-card border-info">
                  <div className="kpi-header">
                    <span className="kpi-title">Inbound Received</span>
                    <i className="fa-solid fa-truck-ramp-box text-muted"></i>
                  </div>
                  <div className="kpi-value">{summary.total_inbound_today} <span className="kpi-unit">today</span></div>
                  <div className="kpi-trend text-muted">Total physical inbound today</div>
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
                        <select className="form-control filter-select">
                          <option>All Vendors</option>
                        </select>
                        <select className="form-control filter-select">
                          <option>All Statuses</option>
                          <option>Verified</option>
                          <option>Pending Scan</option>
                          <option>Discrepancy</option>
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
                          ) : shipments.map(shp => (
                            <tr key={shp.ID_outbound} className={shp.status === 'discrepancy' ? 'highlight-row' : ''}>
                              <td className="font-medium">SHP-{shp.ID_outbound}</td>
                              <td>{shp.vendor?.nama_vendor || `Vendor ${shp.ID_vendor}`}</td>
                              <td>{getStatusBadge(shp.status)}</td>
                              <td className="text-muted">{formatDateTime(shp.created_at)}</td>
                              <td>
                                {shp.status === 'discrepancy' ? (
                                  <button className="btn btn-sm btn-primary" onClick={() => setActiveTab('pending')}>Review</button>
                                ) : (
                                  <button className="btn btn-sm btn-outline" onClick={() => handleViewShipmentDetails(shp)}>Details</button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!dashboardLoading && shipments.length === 0 && (
                            <tr><td colSpan="5" className="text-center" style={{ padding: '20px' }}>No shipments found.</td></tr>
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
                  <strong>{shipments.length}</strong>
                </div>
                <div className="section-summary-card">
                  <span>Pending Scan</span>
                  <strong>{shipments.filter(shp => shp.status === 'submitted').length}</strong>
                </div>
                <div className="section-summary-card">
                  <span>Needs Attention</span>
                  <strong>{shipments.filter(shp => shp.status === 'discrepancy').length}</strong>
                </div>
              </div>
              <div className="card data-card mt-4">
                <div className="section-card-header">
                  <div>
                    <h2>Shipment Directory</h2>
                    <p>Use Details to inspect vendor, schedule, origin, and item quantities.</p>
                  </div>
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
                      ) : shipments.map(shp => (
                        <tr key={shp.ID_outbound}>
                          <td className="font-medium">{shp.no_pengiriman || `SHP-${shp.ID_outbound}`}</td>
                          <td>{shp.vendor?.nama_vendor || `Vendor ${shp.ID_vendor}`}</td>
                          <td>{shp.lokasi_asal || '-'}</td>
                          <td className="text-muted">{formatDateTime(shp.waktu_kirim)}</td>
                          <td>{getStatusBadge(shp.status)}</td>
                          <td><button className="btn btn-sm btn-outline" onClick={() => handleViewShipmentDetails(shp)}>Details</button></td>
                        </tr>
                      ))}
                      {!dashboardLoading && shipments.length === 0 && (
                        <tr><td colSpan="6" className="text-center" style={{ padding: '32px' }}>No shipments found.</td></tr>
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
                  <strong>{summary.discrepancy_by_status.match || 0}</strong>
                </div>
                <div className="section-summary-card">
                  <span>Mismatched</span>
                  <strong>{summary.discrepancy_by_status.mismatch || 0}</strong>
                </div>
                <div className="section-summary-card">
                  <span>Missing / Over</span>
                  <strong>{(summary.discrepancy_by_status.missing || 0) + (summary.discrepancy_by_status.over || 0)}</strong>
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

          {activeSidebar === 'analytics' && (
            <>
              <div className="page-header">
                <div>
                  <h1>Analytics & Vendor Performance</h1>
                  <p className="subtitle">Track system accuracy and vendor reliability metrics.</p>
                </div>
              </div>
              <div className="card data-card">
                <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-main)' }}>
                  <h2 style={{ fontSize: '1.1rem' }}>Vendor Discrepancy Rates</h2>
                </div>
                <div className="table-responsive" style={{ padding: '1rem' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Vendor Name</th>
                        <th className="text-center">Total Shipments</th>
                        <th className="text-center">Shipments w/ Discrepancy</th>
                        <th>Error Rate</th>
                        <th>Performance Label</th>
                      </tr>
                    </thead>
                    <tbody>
                      {secondaryLoading && analyticsData.length === 0 ? (
                        <tr><td colSpan="5" className="text-center" style={{ padding: '20px' }}><i className="fa-solid fa-spinner fa-spin"></i> Loading analytics...</td></tr>
                      ) : analyticsData.map((data, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{data.vendor}</td>
                          <td className="text-center">{data.total_shipments}</td>
                          <td className="text-center">{data.total_discrepancies}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '100px', height: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: data.rate, height: '100%', backgroundColor: parseFloat(data.rate) > 10 ? 'var(--danger)' : 'var(--success)' }}></div>
                              </div>
                              <span className="font-bold">{data.rate}</span>
                            </div>
                          </td>
                          <td>
                            {parseFloat(data.rate) === 0 ? <span className="status-badge status-success">Excellent</span> : 
                             parseFloat(data.rate) > 10 ? <span className="status-badge status-danger">Needs Review</span> :
                             <span className="status-badge status-warning">Acceptable</span>}
                          </td>
                        </tr>
                      ))}
                      {!secondaryLoading && analyticsData.length === 0 && (
                        <tr><td colSpan="5" className="text-center" style={{ padding: '20px' }}>No analytics data available yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
              {shipmentModalData.status === 'discrepancy' && (
                <button className="btn btn-primary" onClick={() => { setShipmentModalData(null); setActiveTab('pending'); }}>
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
