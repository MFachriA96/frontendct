import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { API_BASE_URL } from '../config/api';
import './VendorDashboard.css';

const VendorDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [shipments, setShipments] = useState([]);
  const [authChecking, setAuthChecking] = useState(true);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [user, setUser] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  
  // Create Shipment State
  const [lokasiAsal, setLokasiAsal] = useState('');
  const [waktuKirim, setWaktuKirim] = useState('');
  const [estimasiTiba, setEstimasiTiba] = useState('');
  const [items, setItems] = useState([{ nama_barang: '', quantity_outbound: 100, quantity_per_box: 10 }]);

  // QR Modal State
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrTokens, setQrTokens] = useState([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCache, setQrCache] = useState({});

  // Notifications State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const navigate = useNavigate();

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

  const fetchShipments = async () => {
    try {
      setShipmentsLoading(true);
      const session = await ensureVendorSession({ silent: true });
      if (!session) {
        setShipments([]);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/outbound`, {
        headers: session.headers
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

  const fetchNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const session = await ensureVendorSession({ silent: true });
      if (!session) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/notifikasi`, {
        headers: session.headers
      });
      // Handle Laravel pagination wrapper
      const resData = response.data.data;
      const notifsArray = Array.isArray(resData) ? resData : (resData?.data || []);
      setNotifications(notifsArray);
      
      const unreadRes = await axios.get(`${API_BASE_URL}/api/notifikasi/unread-count`, {
        headers: session.headers
      });
      setUnreadCount(unreadRes.data.data.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotificationsLoading(false);
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

  useEffect(() => {
    const initializeDashboard = async () => {
      setAuthChecking(true);
      const session = await ensureVendorSession();
      if (!session) {
        setAuthChecking(false);
        return;
      }

      await Promise.all([
        fetchShipments(),
        fetchNotifications()
      ]);
      setAuthChecking(false);
    };

    initializeDashboard();
  }, []);

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
    setItems([...items, { nama_barang: '', quantity_outbound: 100, quantity_per_box: 10 }]);
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

  const handleSubmitShipment = async (isSubmit) => {
    setSubmitLoading(true);
    try {
      const session = await ensureVendorSession();
      if (!session) {
        return;
      }

      const details = items.map(item => ({
        nama_barang: item.nama_barang,
        quantity_outbound: parseInt(item.quantity_outbound),
        quantity_per_box: parseInt(item.quantity_per_box),
        jumlah_box: Math.ceil(parseInt(item.quantity_outbound) / parseInt(item.quantity_per_box))
      }));

      const payload = {
        waktu_kirim: waktuKirim + ' 00:00:00', // API might expect datetime
        estimasi_tiba: estimasiTiba ? estimasiTiba + ' 00:00:00' : null,
        lokasi_asal: lokasiAsal,
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
        const fetchedTokens = qrRes.data.data.qr_tokens || [];
        setQrTokens(fetchedTokens);
        setQrCache(prev => ({ ...prev, [outboundId]: fetchedTokens }));
        setSelectedShipmentId(outboundId);
        setShowQRModal(true);
      } else {
        alert('Shipment saved as draft successfully!');
      }

      // Reset form
      setLokasiAsal('');
      setWaktuKirim('');
      setEstimasiTiba('');
      setItems([{ nama_barang: '', quantity_outbound: 100, quantity_per_box: 10 }]);
      setActiveTab('shipments');
      fetchShipments();

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
      const fetchedTokens = qrRes.data.data.qr_tokens || [];
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

  const getStatusBadge = (status) => {
    switch(status) {
      case 'draft': return <span className="status-badge status-draft"><i className="fa-solid fa-pen"></i> Draft</span>;
      case 'submitted': return <span className="status-badge status-submitted"><i className="fa-solid fa-paper-plane"></i> Submitted</span>;
      case 'arrived': return <span className="status-badge status-delivered"><i className="fa-solid fa-check"></i> Arrived</span>;
      case 'discrepancy': return <span className="status-badge status-discrepancy"><i className="fa-solid fa-triangle-exclamation"></i> Discrepancy</span>;
      default: return <span className="status-badge status-draft">{status}</span>;
    }
  };

  // Stats
  const totalShipments = shipments.length;
  const draftShipments = shipments.filter(s => s.status === 'draft').length;
  const deliveredShipments = shipments.filter(s => s.status === 'arrived').length;
  const discrepancyShipments = shipments.filter(s => s.status === 'discrepancy').length;

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
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <i className="fa-solid fa-boxes-packing"></i>
          Epson Verify
        </div>
        
        <div className="sidebar-menu">
          <div className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <i className="fa-solid fa-chart-pie"></i> Dashboard
          </div>
          <div className={`menu-item ${activeTab === 'shipments' ? 'active' : ''}`} onClick={() => setActiveTab('shipments')}>
            <i className="fa-solid fa-truck-fast"></i> Outbound Shipments
          </div>
          <div className={`menu-item ${activeTab === 'create-shipment' ? 'active' : ''}`} onClick={() => setActiveTab('create-shipment')}>
            <i className="fa-solid fa-plus-circle"></i> Create Shipment
          </div>
          <div className={`menu-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            <i className="fa-regular fa-bell"></i> Notifications
          </div>
          <div className="menu-item">
            <i className="fa-solid fa-gear"></i> Settings
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="menu-item" style={{ padding: 0, color: '#ef4444' }} onClick={handleLogout}>
            <i className="fa-solid fa-arrow-right-from-bracket"></i> Logout
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-wrapper">
        
        {/* Header */}
        <header className="header">
          <h1 className="page-title">
            {activeTab === 'dashboard' && 'Vendor Dashboard'}
            {activeTab === 'shipments' && 'Outbound Shipments'}
            {activeTab === 'create-shipment' && 'Create Shipment'}
            {activeTab === 'notifications' && 'Notifications'}
          </h1>
          
          <div className="header-actions">
            <button className="notification-btn" onClick={() => setActiveTab('notifications')}>
              <i className="fa-regular fa-bell"></i>
              {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            
            <div className="user-profile">
              <div className="avatar">{user ? user.nama?.charAt(0).toUpperCase() : 'V'}</div>
              <div className="user-info">
                <span className="user-name">{user ? user.nama : 'Vendor Partner'}</span>
                <span className="user-role">{user ? user.role : 'Vendor'}</span>
              </div>
              <i className="fa-solid fa-chevron-down" style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}></i>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="content">
          
          {/* SECTION: Dashboard Overview */}
          {activeTab === 'dashboard' && (
            <div className="page-section active">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon icon-blue"><i className="fa-solid fa-box-open"></i></div>
                  <div className="stat-info">
                    <h3>Total Shipments</h3>
                    <div className="value">{totalShipments}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon icon-yellow"><i className="fa-solid fa-file-pen"></i></div>
                  <div className="stat-info">
                    <h3>Draft / Pending</h3>
                    <div className="value">{draftShipments}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon icon-green"><i className="fa-solid fa-check-double"></i></div>
                  <div className="stat-info">
                    <h3>Successfully Delivered</h3>
                    <div className="value">{deliveredShipments}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon icon-red"><i className="fa-solid fa-triangle-exclamation"></i></div>
                  <div className="stat-info">
                    <h3>Discrepancies Open</h3>
                    <div className="value">{discrepancyShipments}</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Recent Outbound Activity</h2>
                  <button className="btn btn-outline" onClick={() => setActiveTab('shipments')}>View All</button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Shipment ID</th>
                      <th>Date Created</th>
                      <th>Origin</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentsLoading ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center' }}>Loading shipments...</td>
                      </tr>
                    ) : shipments.slice(0, 5).map(ship => (
                      <tr key={ship.ID_outbound}>
                        <td><strong>{ship.ID_outbound}</strong></td>
                        <td>{new Date(ship.created_at).toLocaleString()}</td>
                        <td>{ship.lokasi_asal}</td>
                        <td>{getStatusBadge(ship.status)}</td>
                        <td>
                          {ship.status === 'submitted' && (
                            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleViewQR(ship.ID_outbound)}>View QR</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!shipmentsLoading && shipments.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center' }}>No recent activity.</td>
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
                  <select className="form-control" style={{ maxWidth: '200px' }}>
                    <option>All Status</option>
                    <option>Draft</option>
                    <option>Submitted</option>
                    <option>Delivered</option>
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
                    ) : shipments.map(ship => (
                      <tr key={ship.ID_outbound}>
                        <td><strong>{ship.ID_outbound}</strong></td>
                        <td>{new Date(ship.waktu_kirim).toLocaleDateString()}</td>
                        <td>{ship.lokasi_asal}</td>
                        <td>{getStatusBadge(ship.status)}</td>
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
                                fetchShipments();
                                handleViewQR(ship.ID_outbound);
                              } catch (error) {
                                console.error('Error submitting shipment:', error);
                                alert('Error submitting shipment');
                              }
                            }}>Submit</button>
                          )}
                          {ship.status === 'submitted' && (
                            <button className="btn btn-primary" style={{ padding: '6px 12px', marginRight: '8px' }} onClick={() => handleViewQR(ship.ID_outbound)}>QR Code</button>
                          )}
                          <button className="btn btn-outline" style={{ padding: '6px 12px' }}>Details</button>
                        </td>
                      </tr>
                    ))}
                    {!shipmentsLoading && shipments.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center' }}>No shipments found.</td>
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
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Create Outbound Shipment</h2>
                  <span className="status-badge status-draft">Status: Draft</span>
                </div>
                
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Origin (Lokasi Asal)</label>
                    <input type="text" className="form-control" placeholder="e.g. Vendor Warehouse A" value={lokasiAsal} onChange={(e) => setLokasiAsal(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dispatch Date (Waktu Kirim)</label>
                    <input type="date" className="form-control" value={waktuKirim} onChange={(e) => setWaktuKirim(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expected Arrival (Estimasi Tiba)</label>
                    <input type="date" className="form-control" value={estimasiTiba} onChange={(e) => setEstimasiTiba(e.target.value)} />
                  </div>
                </div>

                <div className="items-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--text-dark)' }}>Shipment Items</h3>
                    <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={handleAddItem}><i className="fa-solid fa-plus"></i> Add Item</button>
                  </div>
                  
                  {items.map((item, index) => (
                    <div className="item-row" key={index}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Item / Product Name</label>
                        <input type="text" className="form-control" placeholder="Enter item name..." value={item.nama_barang} onChange={(e) => handleItemChange(index, 'nama_barang', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Total Quantity</label>
                        <input type="number" className="form-control" value={item.quantity_outbound} onChange={(e) => handleItemChange(index, 'quantity_outbound', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Qty Per Box</label>
                        <input type="number" className="form-control" value={item.quantity_per_box} onChange={(e) => handleItemChange(index, 'quantity_per_box', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                        <button className="btn-icon btn-danger" onClick={() => handleRemoveItem(index)}><i className="fa-solid fa-trash"></i></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="form-actions">
                  <button className="btn btn-outline" onClick={() => handleSubmitShipment(false)} disabled={submitLoading}>Save as Draft</button>
                  <button className="btn btn-primary" onClick={() => handleSubmitShipment(true)} disabled={submitLoading}>
                    <i className="fa-solid fa-paper-plane" style={{ marginRight: '8px' }}></i> {submitLoading ? 'Processing...' : 'Submit & Generate QR'}
                  </button>
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
                    notifications.map(notif => (
                      <div 
                        key={notif.ID_notif} 
                        style={{ 
                          padding: '16px 24px', 
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: notif.sudah_dibaca ? 'transparent' : '#f0f9ff',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '16px',
                          cursor: notif.sudah_dibaca ? 'default' : 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => !notif.sudah_dibaca && handleMarkAsRead(notif.ID_notif)}
                        onMouseEnter={(e) => !notif.sudah_dibaca && (e.currentTarget.style.backgroundColor = '#e0f2fe')}
                        onMouseLeave={(e) => !notif.sudah_dibaca && (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                      >
                        <div style={{ 
                          width: '40px', height: '40px', borderRadius: '50%', 
                          backgroundColor: notif.related_type === 'discrepancy' ? '#fee2e2' : '#dcfce7',
                          color: notif.related_type === 'discrepancy' ? '#ef4444' : '#22c55e',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          <i className={`fa-solid ${notif.related_type === 'discrepancy' ? 'fa-triangle-exclamation' : 'fa-box-open'}`}></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#1e293b' }}>{notif.judul}</h4>
                          <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>{notif.pesan}</p>
                          <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {new Date(notif.created_at).toLocaleString()}
                          </span>
                        </div>
                        {!notif.sudah_dibaca && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', marginTop: '6px', flexShrink: 0 }}></div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

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
                    <QRCodeSVG value={token.qr_token || 'QR_TOKEN_NOT_AVAILABLE'} size={150} />
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#475569', wordBreak: 'break-all' }}>
                    Detail ID: {token.ID_outbound_detail}<br/>
                    Barang ID: {token.ID_barang || 'N/A'}<br/>
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
                  </div>
                </div>
              ))}
              {!qrLoading && qrTokens.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: '#64748b' }}>
                  No QR tokens generated yet.
                </div>
              )}
            </div>

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={() => window.print()}>Print QR Codes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
