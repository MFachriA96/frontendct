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
  
  // Modal State
  const [resolveModalData, setResolveModalData] = useState(null);
  const [resolutionType, setResolutionType] = useState('approve'); // approve (mismatch report) or return
  const [resolutionNotes, setResolutionNotes] = useState('');

  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch Summary
      const summaryRes = await axios.get(`${API_BASE_URL}/api/dashboard/summary`, { headers });
      setSummary(summaryRes.data.data);

      // Fetch Outbound Shipments (for overview)
      const outRes = await axios.get(`${API_BASE_URL}/api/outbound`, { headers });
      const outData = outRes.data.data;
      setShipments(Array.isArray(outData) ? outData : (outData?.data || []));

      // Fetch Discrepancies
      const discRes = await axios.get(`${API_BASE_URL}/api/discrepancy`, { headers });
      const discData = discRes.data.data;
      setDiscrepancies(Array.isArray(discData) ? discData : (discData?.data || []));
      
      // Fetch Analytics (Vendor Performance)
      const perfRes = await axios.get(`${API_BASE_URL}/api/dashboard/vendor-performance`, { headers });
      setAnalyticsData(perfRes.data.data);

      // Fetch Vendor Reports (Dokumen R1)
      const repRes = await axios.get(`${API_BASE_URL}/api/dokumen-r1`, { headers });
      const repData = repRes.data.data;
      setReportsData(Array.isArray(repData) ? repData : (repData?.data || []));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
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
      alert('Discrepancy resolved successfully!');
      setResolveModalData(null);
      fetchData();
    } catch (error) {
      console.error(error);
      const msg = error.response?.data?.message || error.message;
      alert(`Error resolving discrepancy: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const pendingDiscrepancies = discrepancies.filter(d => d.status !== 'match');
  const resolvedDiscrepancies = discrepancies.filter(d => d.status === 'match'); // Or ones that have an action, but we mock it via match for now if actions are not fully mapped locally.
  const pendingCount = summary.discrepancy_by_status.mismatch + summary.discrepancy_by_status.missing + summary.discrepancy_by_status.over;

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
          <a href="#" className={`nav-item ${activeSidebar === 'dashboard' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); setActiveSidebar('dashboard');}}>
            <i className="fa-solid fa-border-all"></i>
            <span>Dashboard</span>
          </a>
          <a href="#" className="nav-item">
            <i className="fa-solid fa-truck-fast"></i>
            <span>Shipments</span>
          </a>
          
          <div className="nav-section">VERIFICATION</div>
          <a href="#" className="nav-item">
            <i className="fa-solid fa-clipboard-check"></i>
            <span>Verification Results</span>
          </a>
          <a href="#" className="nav-item" onClick={(e) => {e.preventDefault(); setActiveTab('pending');}}>
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
                  <button className="btn btn-outline"><i className="fa-solid fa-download"></i> Export Report</button>
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
                  <button className={`tab-btn ${activeTab === 'discrepancies' ? 'active' : ''}`} onClick={() => setActiveTab('discrepancies')}>
                    Resolved Discrepancies
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
                          {shipments.map(shp => (
                            <tr key={shp.ID_outbound} className={shp.status === 'discrepancy' ? 'highlight-row' : ''}>
                              <td className="font-medium">SHP-{shp.ID_outbound}</td>
                              <td>{shp.vendor?.nama_vendor || `Vendor ${shp.ID_vendor}`}</td>
                              <td>{getStatusBadge(shp.status)}</td>
                              <td className="text-muted">{new Date(shp.created_at).toLocaleString()}</td>
                              <td>
                                {shp.status === 'discrepancy' ? (
                                  <button className="btn btn-sm btn-primary" onClick={() => setActiveTab('pending')}>Review</button>
                                ) : (
                                  <button className="btn btn-sm btn-outline">Details</button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {shipments.length === 0 && (
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
                {activeTab === 'discrepancies' && (
                  <div className="tab-content active" id="tab-discrepancies">
                    <div className="empty-state">
                      <i className="fa-solid fa-clipboard-check text-success"></i>
                      <h3>All Caught Up!</h3>
                      <p>Resolved discrepancies will appear here.</p>
                    </div>
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
                      {analyticsData.map((data, idx) => (
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
                      {analyticsData.length === 0 && (
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
                      {reportsData.map(doc => (
                        <tr key={doc.ID_dokumen}>
                          <td className="font-medium">{doc.no_dokumen_r1}</td>
                          <td>DISC-{doc.ID_discrepancy}</td>
                          <td>
                            <span className={`status-badge ${doc.status_dokumen === 'draft' ? 'status-pending' : 'status-success'}`}>
                              {doc.status_dokumen.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td>{doc.pembuat?.nama || 'System'}</td>
                          <td className="text-muted">{new Date(doc.created_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-sm btn-outline"><i className="fa-solid fa-file-pdf"></i> View PDF</button>
                          </td>
                        </tr>
                      ))}
                      {reportsData.length === 0 && (
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
    </div>
  );
};

export default ManagerDashboard;
