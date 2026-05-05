import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import './ScanOfficerDashboard.css';

const ScanOfficerDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(false);

  // Stats & Data
  const [inbounds, setInbounds] = useState([]);
  const [stats, setStats] = useState({ scannedToday: 0, pendingManual: 0, activeDiscrepancies: 0, cleared: 0 });

  // Scan State
  const [scanMethod, setScanMethod] = useState('manual');
  const [qrToken, setQrToken] = useState('');
  const [idGudang, setIdGudang] = useState(1);
  const [namaPenerima, setNamaPenerima] = useState(user?.nama || 'Officer');
  const [scanFeedback, setScanFeedback] = useState(null);

  // Manual verification state
  const [manualInboundId, setManualInboundId] = useState('');
  const [selectedInbound, setSelectedInbound] = useState(null);
  const [manualInputs, setManualInputs] = useState({});
  const [manualPhotos, setManualPhotos] = useState({});

  const navigate = useNavigate();

  const fetchInbounds = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/inbound`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const resData = response.data.data;
      const dataArray = Array.isArray(resData) ? resData : (resData?.data || []);
      setInbounds(dataArray);

      // Calc stats
      let pendingManual = 0;
      let cleared = 0;
      dataArray.forEach(inb => {
        if (inb.status_scan === 'menunggu' || inb.status_scan === 'sedang_diproses') pendingManual++;
        if (inb.status_scan === 'selesai') cleared++;
      });
      setStats(prev => ({ ...prev, pendingManual, cleared }));
    } catch (error) {
      console.error('Error fetching inbounds:', error);
    }
  };

  useEffect(() => {
    fetchInbounds();
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

  const handleScanSubmit = async () => {
    if (!qrToken) return;
    setLoading(true);
    setScanFeedback(null);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        qr_token: qrToken,
        ID_gudang: idGudang,
        nama_penerima: namaPenerima,
        lokasi_terakhir: 'Warehouse Entry'
      };
      const response = await axios.post(`${API_BASE_URL}/api/inbound/scan-qr`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setScanFeedback({ type: 'success', message: response.data.message, progress: response.data.progress });
      setQrToken('');
      fetchInbounds();
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      setScanFeedback({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadManualInbound = async () => {
    if (!manualInboundId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/inbound/${manualInboundId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const inbound = response.data.data;
      const inputs = {};
      inbound.details?.forEach(detail => {
        inputs[detail.ID_inbound_detail] = {
          quantity_inbound: detail.quantity_inbound ?? '',
          ada_cacat: Boolean(detail.ada_cacat),
          catatan_cacat: detail.catatan_cacat || ''
        };
      });
      setSelectedInbound(inbound);
      setManualInputs(inputs);
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      alert(`Error loading inbound: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const updateManualInput = (detailId, field, value) => {
    setManualInputs(prev => ({
      ...prev,
      [detailId]: {
        ...(prev[detailId] || {}),
        [field]: value
      }
    }));
  };

  const handleSaveManualDetail = async (detail) => {
    const input = manualInputs[detail.ID_inbound_detail];
    if (!selectedInbound || !input || input.quantity_inbound === '') return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_BASE_URL}/api/inbound/${selectedInbound.ID_inbound}/manual-verification/${detail.ID_inbound_detail}`, {
        quantity_inbound: parseInt(input.quantity_inbound, 10),
        ada_cacat: input.ada_cacat,
        catatan_cacat: input.catatan_cacat
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await handleLoadManualInbound();
      alert('Manual verification saved.');
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      alert(`Error saving manual verification: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadManualPhoto = async (detail) => {
    const file = manualPhotos[detail.ID_inbound_detail];
    if (!selectedInbound || !file) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('foto', file);

      await axios.post(`${API_BASE_URL}/api/inbound/${selectedInbound.ID_inbound}/manual-verification/${detail.ID_inbound_detail}/photo`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setManualPhotos(prev => ({ ...prev, [detail.ID_inbound_detail]: null }));
      await handleLoadManualInbound();
      alert('Condition photo uploaded.');
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      alert(`Error uploading condition photo: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeManualVerification = async () => {
    if (!selectedInbound) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/api/inbound/${selectedInbound.ID_inbound}/manual-verification/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Manual verification finalized.');
      setSelectedInbound(null);
      setManualInboundId('');
      fetchInbounds();
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      alert(`Error finalizing verification: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'menunggu': return <span className="badge badge-warning">Awaiting Manual Verification</span>;
      case 'sedang_diproses': return <span className="badge badge-info">In Progress</span>;
      case 'selesai': return <span className="badge badge-success">Verified</span>;
      default: return <span className="badge badge-warning">{status}</span>;
    }
  };

  return (
    <div className="app-container scan-officer-dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <i className="fa-solid fa-qrcode"></i>
            <span>EpsonVerify</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">MAIN</div>
          <a href="#" className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); setActiveTab('dashboard');}}>
            <i className="fa-solid fa-chart-pie"></i>
            <span>Dashboard</span>
          </a>
          <a href="#" className={`nav-item ${activeTab === 'scan' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); setActiveTab('scan');}}>
            <i className="fa-solid fa-expand"></i>
            <span>Scan Inbound</span>
          </a>
          <a href="#" className={`nav-item ${activeTab === 'manual' ? 'active' : ''}`} onClick={(e) => {e.preventDefault(); setActiveTab('manual');}}>
            <i className="fa-solid fa-camera"></i>
            <span>Manual Verification</span>
          </a>
          
          <div className="nav-section">HISTORY</div>
          <a href="#" className="nav-item">
            <i className="fa-solid fa-clock-rotate-left"></i>
            <span>Scan Logs</span>
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
            <input type="text" placeholder="Search token, shipment ID..." />
          </div>
          <div className="topbar-actions">
            <button className="icon-btn">
              <i className="fa-regular fa-bell"></i>
            </button>
            <div className="user-profile">
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#003399', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {user ? user.nama?.charAt(0).toUpperCase() : 'S'}
              </div>
              <div className="user-info">
                <span className="user-name">{user ? user.nama : 'Scan Officer'}</span>
                <span className="user-role">{user ? user.role : 'Staff'}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content-wrapper">
          <div className="page-header">
            <div>
              <h1>{activeTab === 'dashboard' ? 'Incoming Goods Verification' : activeTab === 'scan' ? 'Inbound QR Scan' : 'Manual Verification'}</h1>
              <p className="subtitle">Scan and verify vendor shipments arriving at the warehouse.</p>
            </div>
            {activeTab === 'dashboard' && (
              <button className="btn btn-primary" onClick={() => setActiveTab('scan')}>
                <i className="fa-solid fa-qrcode"></i> New Scan Session
              </button>
            )}
          </div>

          {activeTab === 'dashboard' && (
            <>
              {/* Stats Row */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon bg-blue-light"><i className="fa-solid fa-boxes-stacked text-blue"></i></div>
                  <div className="stat-details">
                    <h3>{stats.scannedToday || 0}</h3>
                    <p>Items Scanned Today</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon bg-warning-light"><i className="fa-solid fa-camera text-warning"></i></div>
                  <div className="stat-details">
                    <h3>{stats.pendingManual}</h3>
                    <p>Pending Manual Verification</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon bg-danger-light"><i className="fa-solid fa-triangle-exclamation text-danger"></i></div>
                  <div className="stat-details">
                    <h3>{stats.activeDiscrepancies || 0}</h3>
                    <p>Active Discrepancies</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon bg-success-light"><i className="fa-solid fa-check-double text-success"></i></div>
                  <div className="stat-details">
                    <h3>{stats.cleared}</h3>
                    <p>Shipments Cleared</p>
                  </div>
                </div>
              </div>

              {/* Recent Shipments Table */}
              <div className="card mt-4">
                <div className="card-header">
                  <h2>Recent Incoming Shipments</h2>
                </div>
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Inbound ID</th>
                        <th>Vendor ID</th>
                        <th>Date/Time</th>
                        <th>Scanned Boxes</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inbounds.slice(0, 10).map(inb => (
                        <tr key={inb.ID_inbound}>
                          <td><strong>INB-{inb.ID_inbound}</strong></td>
                          <td>{inb.ID_vendor}</td>
                          <td>{new Date(inb.timestamp_terima).toLocaleString()}</td>
                          <td>{inb.total_box_sudah_discan} / {inb.total_box_expected}</td>
                          <td>{getStatusBadge(inb.status_scan)}</td>
                        </tr>
                      ))}
                      {inbounds.length === 0 && (
                        <tr><td colSpan="5" className="text-center">No recent incoming shipments found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === 'scan' && (
            <div className="card scan-module" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div className="card-header">
                <h2>Quick Scan</h2>
                <div className="scan-tabs">
                  <button className={`tab-btn ${scanMethod === 'camera' ? 'active' : ''}`} onClick={() => setScanMethod('camera')}>Camera</button>
                  <button className={`tab-btn ${scanMethod === 'manual' ? 'active' : ''}`} onClick={() => setScanMethod('manual')}>Manual Entry</button>
                </div>
              </div>
              <div className="card-body">
                <div className="scan-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>Warehouse</label>
                    <select className="form-control" value={idGudang} onChange={(e) => setIdGudang(e.target.value)}>
                      <option value="1">Gudang Utama A</option>
                      <option value="2">Gudang Transit B</option>
                      <option value="3">Gudang Sparepart C</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Receiver Name</label>
                    <input type="text" className="form-control" value={namaPenerima} onChange={(e) => setNamaPenerima(e.target.value)} />
                  </div>
                </div>

                {scanMethod === 'camera' ? (
                  <div className="camera-viewport">
                    <div className="scanner-overlay">
                      <div className="scanner-box"><div className="scanner-line"></div></div>
                    </div>
                    <div className="camera-placeholder">
                      <i className="fa-solid fa-video-slash"></i>
                      <p>Camera is simulated.</p>
                      <button className="btn btn-outline" onClick={() => setScanMethod('manual')}>Use Manual Input Instead</button>
                    </div>
                  </div>
                ) : (
                  <div className="manual-entry-form">
                    <div className="form-group">
                      <label>Enter QR Token</label>
                      <div className="input-with-icon">
                        <i className="fa-solid fa-keyboard"></i>
                        <input type="text" className="form-control" placeholder="e.g. TOK-8X9A2B4C" value={qrToken} onChange={(e) => setQrToken(e.target.value)} />
                      </div>
                      <small className="form-text">Enter the fallback token printed below the QR code on the box.</small>
                    </div>
                    <button className="btn btn-primary w-100 mt-2" onClick={handleScanSubmit} disabled={loading || !qrToken}>
                      {loading ? 'Processing...' : 'Verify Token & Process Inbound'}
                    </button>
                  </div>
                )}

                {scanFeedback && (
                  <div style={{ marginTop: '20px', padding: '15px', borderRadius: '8px', backgroundColor: scanFeedback.type === 'success' ? '#dcfce7' : '#fee2e2', color: scanFeedback.type === 'success' ? '#166534' : '#991b1b' }}>
                    <div style={{ fontWeight: 'bold' }}>{scanFeedback.type === 'success' ? <><i className="fa-solid fa-check-circle"></i> Success</> : <><i className="fa-solid fa-triangle-exclamation"></i> Error</>}</div>
                    <div>{scanFeedback.message}</div>
                    {scanFeedback.progress && (
                      <div style={{ marginTop: '10px' }}>
                        Progress: {scanFeedback.progress.scanned} / {scanFeedback.progress.total} QR Codes scanned for this shipment.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="manual-verification-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="card">
                <div className="card-header">
                  <h2>Manual Item Verification</h2>
                </div>
                <div className="card-body">
                  <div className="form-group">
                    <label>Select Inbound Shipment</label>
                    <select className="form-control" value={manualInboundId} onChange={(e) => setManualInboundId(e.target.value)}>
                      <option value="">Select Inbound...</option>
                      {inbounds.filter(i => i.status_scan === 'menunggu').map(inb => (
                        <option key={inb.ID_inbound} value={inb.ID_inbound}>INB-{inb.ID_inbound} (QR: {inb.total_qr_sudah_discan || 0}/{inb.total_qr_expected || inb.total_box_expected})</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary w-100" onClick={handleLoadManualInbound} disabled={loading || !manualInboundId}>
                    Load Item Details
                  </button>

                  {selectedInbound && (
                    <div style={{ marginTop: '20px' }}>
                      <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                        <strong>INB-{selectedInbound.ID_inbound}</strong>
                        <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Input actual received quantities and upload condition photos for audit.</div>
                      </div>

                      <div style={{ display: 'grid', gap: '14px' }}>
                        {selectedInbound.details?.map(detail => {
                          const input = manualInputs[detail.ID_inbound_detail] || {};
                          return (
                            <div key={detail.ID_inbound_detail} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                  <strong>{detail.barang?.nama_barang || `Item ${detail.ID_barang}`}</strong>
                                  <div style={{ color: '#64748b', fontSize: '0.85rem' }}>Inbound Detail #{detail.ID_inbound_detail}</div>
                                </div>
                                <span className="badge badge-info">{detail.audit_photos?.length || 0} Photos</span>
                              </div>

                              <div className="form-group">
                                <label>Actual Quantity Received</label>
                                <input
                                  type="number"
                                  min="0"
                                  className="form-control"
                                  value={input.quantity_inbound ?? ''}
                                  onChange={(e) => updateManualInput(detail.ID_inbound_detail, 'quantity_inbound', e.target.value)}
                                />
                              </div>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(input.ada_cacat)}
                                  onChange={(e) => updateManualInput(detail.ID_inbound_detail, 'ada_cacat', e.target.checked)}
                                />
                                Item condition has damage/notes
                              </label>

                              <div className="form-group">
                                <label>Condition Notes</label>
                                <textarea
                                  className="form-control"
                                  rows="2"
                                  value={input.catatan_cacat || ''}
                                  onChange={(e) => updateManualInput(detail.ID_inbound_detail, 'catatan_cacat', e.target.value)}
                                  placeholder="Optional notes about packaging, damage, or item condition"
                                />
                              </div>

                              <div className="form-group">
                                <label>Condition Photo</label>
                                <input
                                  type="file"
                                  className="form-control"
                                  accept="image/*"
                                  capture="environment"
                                  onChange={(e) => setManualPhotos(prev => ({ ...prev, [detail.ID_inbound_detail]: e.target.files[0] }))}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button className="btn btn-outline" onClick={() => handleSaveManualDetail(detail)} disabled={loading || input.quantity_inbound === ''}>
                                  <i className="fa-solid fa-floppy-disk"></i> Save Input
                                </button>
                                <button className="btn btn-outline" onClick={() => handleUploadManualPhoto(detail)} disabled={loading || !manualPhotos[detail.ID_inbound_detail]}>
                                  <i className="fa-solid fa-camera"></i> Upload Photo
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button className="btn btn-success w-100 mt-3" onClick={handleFinalizeManualVerification} disabled={loading} style={{ backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }}>
                        <i className="fa-solid fa-check"></i> Finalize Manual Verification
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2>Audit Evidence</h2>
                </div>
                <div className="card-body">
                  {!selectedInbound ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                      <i className="fa-solid fa-clipboard-list" style={{ fontSize: '3rem', marginBottom: '10px' }}></i>
                      <p>Select an inbound shipment to review manual inputs and condition photos.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {selectedInbound.details?.map(detail => (
                        <div key={detail.ID_inbound_detail} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                          <strong>{detail.barang?.nama_barang || `Item ${detail.ID_barang}`}</strong>
                          <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                            Actual quantity: {manualInputs[detail.ID_inbound_detail]?.quantity_inbound || 'Not entered'}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                            Condition: {manualInputs[detail.ID_inbound_detail]?.ada_cacat ? 'Needs review' : 'No issue marked'}
                          </div>
                          {detail.audit_photos?.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', marginTop: '10px' }}>
                              {detail.audit_photos.map(photo => (
                                <a key={photo.ID_foto} href={photo.file_url} target="_blank" rel="noreferrer">
                                  <img src={photo.file_url} alt="Condition evidence" style={{ width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ScanOfficerDashboard;
