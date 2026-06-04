import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/mobile/BottomNav';
import EmptyState from '../components/mobile/EmptyState';
import FeedbackBanner from '../components/mobile/FeedbackBanner';
import ProgressBar from '../components/mobile/ProgressBar';
import SectionCard from '../components/mobile/SectionCard';
import StatusBadge from '../components/mobile/StatusBadge';
import WorkspaceHeader from '../components/mobile/WorkspaceHeader';
import AppButton from '../components/ui/AppButton';
import ConfirmModal from '../components/ui/ConfirmModal';
import { API_BASE_URL } from '../config/api';
import { getAssignedWarehouseId } from '../utils/userAccess';
import { buildReceivingProgress, buildVerifyBoxPayload } from '../utils/receivingWorkspace';
import './ScanOfficerDashboard.css';

const normalizeListResponse = (payload) => {
  const data = payload?.data;
  return Array.isArray(data) ? data : (data?.data || []);
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

const formatStatusLabel = (value, fallback = 'Unknown') => String(value || fallback).replace(/_/g, ' ');

const getStatusTone = (value) => {
  const status = String(value || '').toLowerCase();

  if (['verified', 'selesai', 'match', 'normal'].includes(status)) {
    return 'success';
  }

  if (['issue_flagged', 'mismatch', 'missing', 'over', 'damaged', 'suspect'].includes(status)) {
    return 'danger';
  }

  if (['submitted', 'arrived', 'waiting_scan', 'scanned', 'scan_in_progress', 'menunggu'].includes(status)) {
    return 'warning';
  }

  return 'neutral';
};

const navItems = [
  { value: 'queue', label: 'Queue', icon: 'fa-solid fa-list-check' },
  { value: 'receive', label: 'Scan', icon: 'fa-solid fa-qrcode' },
  { value: 'history', label: 'History', icon: 'fa-solid fa-clock-rotate-left' },
];

const ScanOfficerDashboard = () => {
  const [activeTab, setActiveTab] = useState('queue');
  const [user] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [queueShipments, setQueueShipments] = useState([]);
  const [historyInbounds, setHistoryInbounds] = useState([]);
  const [activeShipment, setActiveShipment] = useState(null);
  const [activeInbound, setActiveInbound] = useState(null);
  const [activeBox, setActiveBox] = useState(null);
  const [verificationForm, setVerificationForm] = useState({
    actualQty: '',
    conditionStatus: 'normal',
    notes: '',
  });
  const [scanMethod, setScanMethod] = useState('manual');
  const [qrToken, setQrToken] = useState('');
  const [idGudang] = useState(() => getAssignedWarehouseId(user, ''));
  const [scanFeedback, setScanFeedback] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSuccessOverlay, setCameraSuccessOverlay] = useState(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const detectorRef = useRef(null);
  const cameraSuccessTimerRef = useRef(null);
  const sheetTouchStartYRef = useRef(null);

  const assignedWarehouseLabel = user?.warehouse?.nama_gudang
    || user?.nama_gudang
    || (idGudang ? `Warehouse ${idGudang}` : 'Unassigned warehouse');
  const receiverName = user?.nama || 'Receiving Officer';
  const hasWarehouseScope = Boolean(idGudang);

  const currentTitle = activeTab === 'queue'
    ? 'Receiving queue'
    : activeTab === 'receive'
      ? 'Scan'
      : 'Receiving history';

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/receiving/queue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQueueShipments(normalizeListResponse(response.data));
    } catch (error) {
      console.error('Error fetching receiving queue:', error);
      setQueueShipments([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/inbound`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistoryInbounds(normalizeListResponse(response.data));
    } catch (error) {
      console.error('Error fetching inbound history:', error);
      setHistoryInbounds([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadShipmentContext = useCallback(async (outboundId) => {
    if (!outboundId) return null;
    setContextLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE_URL}/api/receiving/${outboundId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const shipment = response.data?.data || null;
      setActiveShipment(shipment);
      setActiveInbound(shipment?.inbound || null);
      return shipment;
    } catch (error) {
      console.error('Error loading shipment context:', error);
      setScanFeedback({
        type: 'error',
        message: error.response?.data?.message || 'Failed to load shipment context.',
      });
      return null;
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    void fetchHistory();
  }, [fetchHistory, fetchQueue]);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      window.cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraActive(false);
  }, []);

  const resetVerificationState = useCallback(() => {
    setActiveBox(null);
    setVerificationForm({
      actualQty: '',
      conditionStatus: 'normal',
      notes: '',
    });
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
      // Keep client logout resilient.
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleSelectShipment = async (shipment) => {
    resetVerificationState();
    setScanFeedback(null);
    setScanMethod('camera');
    setSheetExpanded(false);
    await loadShipmentContext(shipment.ID_outbound);
    setActiveTab('receive');
  };

  const handleTabChange = (nextTab) => {
    if (nextTab === 'receive') {
      setScanMethod('camera');
      setSheetExpanded(false);
    }

    setActiveTab(nextTab);
  };

  const handleScanSubmit = useCallback(async (scannedToken = qrToken, source = 'manual') => {
    const tokenValue = String(scannedToken || '').trim();
    if (!tokenValue || !idGudang) return;

    setLoading(true);
    setScanFeedback(null);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        qr_token: tokenValue,
        ID_gudang: idGudang,
        nama_penerima: receiverName,
        lokasi_terakhir: 'Warehouse Entry',
      };
      const response = await axios.post(`${API_BASE_URL}/api/receiving/scan-box`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = response.data?.data || {};
      setActiveInbound(result.inbound || null);
      setActiveBox(result.box || null);
      setVerificationForm({
        actualQty: result.box?.expected_qty_in_box ?? '',
        conditionStatus: 'normal',
        notes: '',
      });
      setSheetExpanded(true);
      setScanFeedback({
        type: 'success',
        message: `Box ${result.box?.box_code || tokenValue} scanned. Verify actual quantity before continuing.`,
      });
      setQrToken('');

      if (result.shipment?.ID_outbound) {
        await loadShipmentContext(result.shipment.ID_outbound);
      }

      await Promise.all([fetchQueue(), fetchHistory()]);

      if (source === 'camera') {
        setCameraSuccessOverlay({
          message: `Box ${result.box?.box_code || tokenValue} scanned successfully.`,
        });

        if (cameraSuccessTimerRef.current) {
          window.clearTimeout(cameraSuccessTimerRef.current);
        }

        cameraSuccessTimerRef.current = window.setTimeout(() => {
          setCameraSuccessOverlay(null);
          stopCamera();
          cameraSuccessTimerRef.current = null;
        }, 1600);
      } else {
        stopCamera();
      }
    } catch (error) {
      setScanFeedback({
        type: 'error',
        message: error.response?.data?.message || 'Failed to scan box.',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchHistory, fetchQueue, idGudang, loadShipmentContext, qrToken, receiverName, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setScanFeedback(null);
    setCameraSuccessOverlay(null);

    if (cameraSuccessTimerRef.current) {
      window.clearTimeout(cameraSuccessTimerRef.current);
      cameraSuccessTimerRef.current = null;
    }

    if (!hasWarehouseScope) {
      setCameraError('Your account is not assigned to a warehouse yet. Contact admin before scanning.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported by this browser. Please use manual entry.');
      return;
    }

    if (!('BarcodeDetector' in window)) {
      setCameraError('QR scanning is not supported by this browser yet. Please use manual entry.');
      return;
    }

    try {
      detectorRef.current = detectorRef.current || new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);

      const scanFrame = async () => {
        if (!videoRef.current || !detectorRef.current || !streamRef.current) return;

        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          const detectedValue = codes[0]?.rawValue;

          if (detectedValue) {
            setQrToken(detectedValue);
            await handleScanSubmit(detectedValue, 'camera');
            return;
          }
        } catch (error) {
          console.error('QR scan failed:', error);
        }

        scanLoopRef.current = window.requestAnimationFrame(scanFrame);
      };

      scanLoopRef.current = window.requestAnimationFrame(scanFrame);
    } catch (error) {
      console.error('Camera access failed:', error);
      const message = error.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Please allow camera access in your browser settings.'
        : 'Unable to open the camera. Please check browser permission or use manual entry.';
      setCameraError(message);
      stopCamera();
    }
  }, [handleScanSubmit, hasWarehouseScope, stopCamera]);

  useEffect(() => {
    let cancelled = false;

    if (scanMethod === 'camera' && activeTab === 'receive') {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          startCamera();
        }
      });
    } else {
      stopCamera();
    }

    return () => {
      cancelled = true;
      if (cameraSuccessTimerRef.current) {
        window.clearTimeout(cameraSuccessTimerRef.current);
        cameraSuccessTimerRef.current = null;
      }
      stopCamera();
    };
  }, [activeTab, scanMethod, startCamera, stopCamera]);

  const handleVerifyBox = async () => {
    if (!activeInbound?.ID_inbound || !activeBox?.ID_outbound_box) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = buildVerifyBoxPayload({
        inboundId: activeInbound.ID_inbound,
        boxId: activeBox.ID_outbound_box,
        actualQty: verificationForm.actualQty,
        conditionStatus: verificationForm.conditionStatus,
        notes: verificationForm.notes,
      });
      const response = await axios.post(`${API_BASE_URL}/api/receiving/verify-box`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = response.data?.data || {};
      setScanFeedback({
        type: 'success',
        message: `Verification saved for ${activeBox.box_code}. Result: ${formatStatusLabel(result.verification_status, 'saved')}.`,
      });
      await Promise.all([
        loadShipmentContext(activeShipment?.ID_outbound),
        fetchQueue(),
        fetchHistory(),
      ]);
      resetVerificationState();
      setQrToken('');
    } catch (error) {
      setScanFeedback({
        type: 'error',
        message: error.response?.data?.message || 'Failed to verify box.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeReceiving = async () => {
    if (!activeInbound?.ID_inbound) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/api/receiving/${activeInbound.ID_inbound}/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = response.data?.data || {};

      setScanFeedback({
        type: 'success',
        message: (result.summary?.issue_boxes || 0) > 0
          ? 'Shipment completed. Review the issue summary in history.'
          : 'Shipment completed.',
      });

      await Promise.all([fetchQueue(), fetchHistory()]);
      setActiveShipment(null);
      setActiveInbound(null);
      resetVerificationState();
      setActiveTab('history');
    } catch (error) {
      setScanFeedback({
        type: 'error',
        message: error.response?.data?.message || 'Failed to finalize receiving.',
      });
    } finally {
      setLoading(false);
    }
  };

  const progress = buildReceivingProgress(activeShipment);

  const handleSheetTouchStart = (event) => {
    sheetTouchStartYRef.current = event.touches?.[0]?.clientY ?? null;
  };

  const handleSheetTouchEnd = (event) => {
    const startY = sheetTouchStartYRef.current;
    const endY = event.changedTouches?.[0]?.clientY ?? null;
    sheetTouchStartYRef.current = null;

    if (startY === null || endY === null) return;

    const delta = endY - startY;

    if (delta < -32) {
      setSheetExpanded(true);
    } else if (delta > 32 && !activeBox) {
      setSheetExpanded(false);
    }
  };

  const renderCameraStage = () => (
    <>
      {scanMethod === 'camera' ? (
        <div className="camera-viewport receiving-fullscan__camera">
          <video ref={videoRef} className="camera-video" muted playsInline autoPlay />
          <div className="scanner-overlay">
            <div className="scanner-box">
              <div className="scanner-line"></div>
            </div>
          </div>
          {cameraSuccessOverlay && (
            <div className="camera-success-overlay">
              <div className="camera-success-icon">
                <i className="fa-solid fa-check"></i>
              </div>
              <strong>QR scanned</strong>
              <span>{cameraSuccessOverlay.message}</span>
            </div>
          )}
          {(!cameraActive || cameraError) && !cameraSuccessOverlay && (
            <div className="camera-placeholder">
              <i className={`fa-solid ${cameraError ? 'fa-video-slash' : 'fa-camera'}`}></i>
              <p>{cameraError || 'Starting camera...'}</p>
              <div className="camera-actions">
                <button type="button" className="receiving-btn receiving-btn--ghost" onClick={startCamera}>
                  Retry
                </button>
                <button type="button" className="receiving-btn receiving-btn--ghost" onClick={() => {
                  setScanMethod('manual');
                  setSheetExpanded(true);
                }}>
                  Manual entry
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="camera-viewport receiving-fullscan__camera receiving-fullscan__camera--manual">
          <div className="camera-placeholder">
            <i className="fa-solid fa-keyboard"></i>
            <p>Manual entry mode is active. Type the QR token from the box label below.</p>
          </div>
        </div>
      )}
    </>
  );

  const renderQueueView = () => (
    <div className="receiving-mobile__stack">
      <SectionCard
        title="Assigned shipments"
        action={(
          <button
            type="button"
            className="receiving-btn receiving-btn--ghost"
            onClick={() => { void fetchQueue(); void fetchHistory(); }}
            disabled={queueLoading || historyLoading}
          >
            Refresh
          </button>
        )}
      >
        {queueLoading ? (
          <EmptyState
            description="Please wait while the latest queue is loaded."
            icon="fa-solid fa-spinner fa-spin"
            title="Loading queue"
          />
        ) : queueShipments.length === 0 ? (
          <EmptyState
            description="New shipments for this warehouse will appear here."
            icon="fa-solid fa-inbox"
            title="No shipments in queue"
          />
        ) : (
          <div className="receiving-list">
            {queueShipments.map((shipment) => (
              <article className="receiving-item" key={shipment.ID_outbound}>
                <div className="receiving-item__body">
                  <div className="receiving-item__top">
                    <div>
                      <strong>{shipment.no_pengiriman || `SHP-${shipment.ID_outbound}`}</strong>
                      <p>{shipment.vendor?.nama_vendor || `Vendor ${shipment.ID_vendor || '-'}`}</p>
                    </div>
                    <StatusBadge
                      label={formatStatusLabel(shipment.status, 'submitted')}
                      tone={getStatusTone(shipment.status)}
                    />
                  </div>
                  <div className="receiving-item__meta">
                    <span>{formatDateTime(shipment.waktu_kirim)}</span>
                    <span>{assignedWarehouseLabel}</span>
                  </div>
                </div>
                <button type="button" className="receiving-btn receiving-btn--ghost" onClick={() => void handleSelectShipment(shipment)}>
                  Start
                </button>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );

  const renderReceiveView = () => (
    <div className="receiving-mobile__stack">
      <div className="receiving-fullscan">
        <div className="receiving-fullscan__topbar">
          <button type="button" className="receiving-fullscan__icon-btn" onClick={() => handleTabChange('queue')} aria-label="Back to queue">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          <div className="receiving-fullscan__topcopy">
            <strong>{activeShipment?.no_pengiriman || 'Ready to scan'}</strong>
            <span>{activeShipment ? assignedWarehouseLabel : 'Scan a QR or enter token to start a shipment session.'}</span>
          </div>
          <StatusBadge
            label={activeShipment ? `${progress.scannedBoxes}/${progress.totalBoxes}` : 'Scan'}
            tone={activeShipment ? (progress.issueBoxes > 0 ? 'danger' : 'neutral') : 'neutral'}
          />
        </div>

        {renderCameraStage()}

        <div
          className={`receiving-sheet ${sheetExpanded ? 'is-expanded' : ''}`}
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
        >
          <button
            type="button"
            className="receiving-sheet__handle"
            onClick={() => setSheetExpanded((prev) => !prev)}
            aria-label={sheetExpanded ? 'Collapse session panel' : 'Expand session panel'}
          >
            <span></span>
          </button>

          <div className="receiving-sheet__summary">
            <div className="receiving-sheet__summary-copy">
              <strong>{activeShipment?.vendor?.nama_vendor || 'No active shipment yet'}</strong>
              <span>
                {activeShipment
                  ? `${progress.scannedBoxes} of ${progress.totalBoxes} scanned`
                  : `Warehouse scope: ${assignedWarehouseLabel}`}
              </span>
            </div>
            <div className="receiving-sheet__summary-side">
              <span>
                {activeShipment
                  ? `${progress.issueBoxes} issue${progress.issueBoxes === 1 ? '' : 's'}`
                  : receiverName}
              </span>
              {activeInbound?.ID_inbound ? (
                <button
                  type="button"
                  className="receiving-btn receiving-btn--ghost"
                  onClick={() => void handleFinalizeReceiving()}
                  disabled={loading || progress.totalBoxes === 0 || progress.scannedBoxes < progress.totalBoxes}
                >
                  Finalize
                </button>
              ) : null}
            </div>
          </div>

          <ProgressBar label="Progress" value={progress.progressPercent} />

          <div className="receiving-sheet__content">
            <div className="receiving-toggle receiving-sheet__toggle">
              <button
                type="button"
                className={scanMethod === 'camera' ? 'is-active' : ''}
                onClick={() => {
                  setScanMethod('camera');
                  setSheetExpanded(false);
                }}
              >
                Camera
              </button>
              <button
                type="button"
                className={scanMethod === 'manual' ? 'is-active' : ''}
                onClick={() => {
                  setScanMethod('manual');
                  setSheetExpanded(true);
                }}
              >
                Manual
              </button>
            </div>

            {!hasWarehouseScope ? (
              <div className="receiving-inline-warning">
                This account does not have a warehouse assignment yet. Contact admin to continue scanning.
              </div>
            ) : null}

            {scanMethod === 'manual' ? (
              <div className="receiving-manual">
                <div className="receiving-field-group">
                  <label htmlFor="qr-token">QR token</label>
                  <input
                    id="qr-token"
                    className="receiving-control"
                    type="text"
                    placeholder="BOX-TOKEN-001"
                    value={qrToken}
                    onChange={(event) => setQrToken(event.target.value)}
                  />
                </div>
                <AppButton
                  className="receiving-primary-button"
                  disabled={loading || !qrToken || !hasWarehouseScope}
                  type="button"
                  onClick={() => void handleScanSubmit()}
                >
                  {loading ? 'Processing...' : 'Scan this box'}
                </AppButton>
              </div>
            ) : null}

            {activeBox ? (
              <div className="receiving-verify">
                <div className="receiving-flow__verify-head">
                  <div>
                    <span>Current box</span>
                    <strong>{activeBox.box_code}</strong>
                  </div>
                  <div>
                    <span>Expected</span>
                    <strong>{activeBox.expected_qty_in_box}</strong>
                  </div>
                </div>

                <div className="receiving-field-group">
                  <label htmlFor="actual-qty">Actual quantity</label>
                  <input
                    id="actual-qty"
                    className="receiving-control"
                    type="number"
                    min="0"
                    value={verificationForm.actualQty}
                    onChange={(event) => setVerificationForm((prev) => ({ ...prev, actualQty: event.target.value }))}
                  />
                </div>

                <div className="receiving-field-group">
                  <label htmlFor="condition-status">Condition</label>
                  <select
                    id="condition-status"
                    className="receiving-control"
                    value={verificationForm.conditionStatus}
                    onChange={(event) => setVerificationForm((prev) => ({ ...prev, conditionStatus: event.target.value }))}
                  >
                    <option value="normal">Normal</option>
                    <option value="damaged">Damaged</option>
                    <option value="suspect">Suspect</option>
                  </select>
                </div>

                <div className="receiving-field-group">
                  <label htmlFor="verification-notes">Notes</label>
                  <textarea
                    id="verification-notes"
                    className="receiving-control receiving-control--textarea"
                    rows="4"
                    placeholder="Add notes if something needs manager review."
                    value={verificationForm.notes}
                    onChange={(event) => setVerificationForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>

                <div className="receiving-actions">
                  <AppButton
                    className="receiving-primary-button"
                    disabled={loading || verificationForm.actualQty === ''}
                    type="button"
                    onClick={() => void handleVerifyBox()}
                  >
                    {loading ? 'Saving...' : 'Submit and next'}
                  </AppButton>
                  <button type="button" className="receiving-btn receiving-btn--ghost" onClick={resetVerificationState} disabled={loading}>
                    Clear box
                  </button>
                </div>
              </div>
            ) : !activeShipment ? (
              <div className="receiving-sheet__empty">
                <strong>Scan a box to begin</strong>
                <span>The shipment session will appear here automatically after a valid QR or manual token is read.</span>
              </div>
            ) : scanMethod === 'camera' && !sheetExpanded ? (
              <div className="receiving-sheet__hint">Aim the QR inside the frame. Pull up for manual entry.</div>
            ) : (
              <div className="receiving-sheet__empty">
                <strong>Nothing to verify yet</strong>
                <span>Scan one box first. Its expected quantity will appear here.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="receiving-mobile__stack">
      <SectionCard
        title="Recent history"
        action={(
          <button
            type="button"
            className="receiving-btn receiving-btn--ghost"
            onClick={() => { void fetchHistory(); }}
            disabled={historyLoading}
          >
            Refresh
          </button>
        )}
      >
        {historyLoading ? (
          <EmptyState
            description="Please wait while receiving history is loaded."
            icon="fa-solid fa-spinner fa-spin"
            title="Loading history"
          />
        ) : historyInbounds.length === 0 ? (
          <EmptyState
            description="Inbound records will appear here after the first scan."
            icon="fa-solid fa-clock-rotate-left"
            title="No receiving history yet"
          />
        ) : (
          <div className="receiving-list">
            {historyInbounds.map((inbound) => {
              const scanned = inbound.total_qr_sudah_discan ?? inbound.total_box_sudah_discan ?? 0;
              const total = inbound.total_qr_expected ?? inbound.total_box_expected ?? 0;
              const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;

              return (
                <article className="receiving-item receiving-item--history" key={inbound.ID_inbound}>
                  <div className="receiving-item__body">
                    <div className="receiving-item__top">
                      <div>
                        <strong>INB-{inbound.ID_inbound}</strong>
                        <p>{inbound.vendor?.nama_vendor || `Vendor ${inbound.ID_vendor || '-'}`}</p>
                      </div>
                      <StatusBadge
                        label={formatStatusLabel(inbound.status_scan, 'menunggu')}
                        tone={getStatusTone(inbound.status_scan)}
                      />
                    </div>
                    <div className="receiving-item__meta">
                      <span>{formatDateTime(inbound.timestamp_terima)}</span>
                      <span>{inbound.nama_penerima || 'Receiving Officer'}</span>
                    </div>
                    <ProgressBar label={`${scanned} of ${total} scanned`} value={percent} />
                  </div>
                  <button
                    type="button"
                    className="receiving-btn receiving-btn--ghost"
                    onClick={() => void loadShipmentContext(inbound.ID_outbound).then(() => setActiveTab('receive'))}
                  >
                    Open
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );

  return (
    <div className="receiving-mobile">
      <WorkspaceHeader
        actionLabel="Sign out"
        onAction={() => setLogoutConfirmOpen(true)}
        scopeLabel={assignedWarehouseLabel}
        title={currentTitle}
      />

      {scanFeedback ? (
        <FeedbackBanner
          message={scanFeedback.message}
          title={scanFeedback.type === 'success' ? 'Updated' : 'Action needed'}
          tone={scanFeedback.type === 'success' ? 'success' : 'error'}
        />
      ) : null}

      <main className={`receiving-mobile__content ${activeTab === 'receive' ? 'is-receive' : ''}`}>
        {contextLoading && activeTab === 'receive' ? (
          <div className="receiving-mobile__loading">Loading shipment...</div>
        ) : null}
        {activeTab === 'queue' ? renderQueueView() : null}
        {activeTab === 'receive' ? renderReceiveView() : null}
        {activeTab === 'history' ? renderHistoryView() : null}
      </main>

      {activeTab !== 'receive' ? (
      <BottomNav
        items={navItems.map((item) => ({
          ...item,
          onClick: () => handleTabChange(item.value),
        }))}
        prominentValue="receive"
        value={activeTab}
      />
      ) : null}

      <ConfirmModal
        open={logoutConfirmOpen}
        title="Sign out?"
        message="You will need to sign in again before continuing the receiving workflow."
        cancelLabel="Stay here"
        confirmLabel="Sign out"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
};

export default ScanOfficerDashboard;
