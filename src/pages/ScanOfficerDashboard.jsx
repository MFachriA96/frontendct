import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import jsQR from 'jsqr';
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

const formatStatusLabel = (value, fallback = 'Tidak diketahui') => String(value || fallback).replace(/_/g, ' ');

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
  { value: 'queue', label: 'Antrian', icon: 'fa-solid fa-list-check' },
  { value: 'receive', label: 'Scan', icon: 'fa-solid fa-qrcode' },
  { value: 'history', label: 'Riwayat', icon: 'fa-solid fa-clock-rotate-left' },
];

const scannerFaqItems = [
  {
    question: 'Bagaimana cara mulai scan?',
    answer: 'Buka tab scan lalu arahkan QR pada label box ke frame kamera. Kalau QR tidak terbaca, buka panel bawah dan gunakan input manual.',
  },
  {
    question: 'Kapan pakai input manual?',
    answer: 'Pakai input manual saat kamera tidak bisa diakses, QR rusak, atau browser perangkat tidak bisa membaca QR dengan stabil.',
  },
  {
    question: 'Apa yang dilakukan setelah QR terbaca?',
    answer: 'Sistem akan membuka box yang aktif. Petugas lalu memeriksa quantity aktual, memilih kondisi box, lalu menyimpan verifikasi.',
  },
  {
    question: 'Kalau ada selisih bagaimana?',
    answer: 'Tetap simpan hasil verifikasi dengan quantity aktual dan catatan yang relevan. Kasus itu akan masuk ke alur review manager sebagai discrepancy.',
  },
  {
    question: 'Apa arti status shipment aktif?',
    answer: 'Shipment aktif menunjukkan konteks box yang sedang diproses. Progress akan bertambah saat box berhasil diverifikasi.',
  },
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
  const [cameraStarting, setCameraStarting] = useState(false);
  const [scanResolving, setScanResolving] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [photoUploadLoading, setPhotoUploadLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [queueShipments, setQueueShipments] = useState([]);
  const [historyInbounds, setHistoryInbounds] = useState([]);
  const [activeShipment, setActiveShipment] = useState(null);
  const [activeInbound, setActiveInbound] = useState(null);
  const [activeBox, setActiveBox] = useState(null);
  const [pendingPhotos, setPendingPhotos] = useState([]);
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
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(0);

  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const detectorRef = useRef(null);
  const fallbackCanvasRef = useRef(null);
  const cameraSuccessTimerRef = useRef(null);
  const sheetTouchStartYRef = useRef(null);
  const cameraPhotoInputRef = useRef(null);
  const galleryPhotoInputRef = useRef(null);

  const assignedWarehouseLabel = user?.warehouse?.nama_gudang
    || user?.nama_gudang
    || (idGudang ? `Gudang ${idGudang}` : 'Gudang belum diatur');
  const receiverName = user?.nama || 'Petugas penerima';
  const hasWarehouseScope = Boolean(idGudang);
  const receiveBusy = cameraStarting || scanResolving || contextLoading;

  const currentTitle = activeTab === 'queue'
    ? 'Antrian penerimaan'
    : activeTab === 'receive'
      ? 'Scan'
      : activeTab === 'help'
        ? 'Bantuan scanner'
        : 'Riwayat penerimaan';

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
        message: error.response?.data?.message || 'Gagal memuat konteks shipment.',
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
    setCameraStarting(false);
    setCameraError('');
    setFlashSupported(false);
    setFlashEnabled(false);
  }, []);

  const resetVerificationState = useCallback(() => {
    setActiveBox(null);
    setPendingPhotos((prev) => {
      prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
    setVerificationForm({
      actualQty: '',
      conditionStatus: 'normal',
      notes: '',
    });
  }, []);

  const handleLogout = () => {
    const token = localStorage.getItem('token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');

    if (token) {
      axios.post(`${API_BASE_URL}/api/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {
        // Keep client logout resilient.
      });
    }
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
    setScanResolving(true);
    setScanFeedback(null);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        qr_token: tokenValue,
        ID_gudang: idGudang,
        nama_penerima: receiverName,
        lokasi_terakhir: 'Area masuk gudang',
      };
      const response = await axios.post(`${API_BASE_URL}/api/receiving/scan-box`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = response.data?.data || {};
      setActiveInbound(result.inbound || null);
      setActiveBox(result.box || null);
      setPendingPhotos((prev) => {
        prev.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        return [];
      });
      setVerificationForm({
        actualQty: result.box?.expected_qty_in_box ?? '',
        conditionStatus: 'normal',
        notes: '',
      });
      setSheetExpanded(true);
      setScanFeedback({
        type: 'success',
        message: `Box ${result.box?.box_code || tokenValue} terbaca. Lanjut cek quantity aktualnya.`,
      });
      setQrToken('');

      if (result.shipment?.ID_outbound) {
        await loadShipmentContext(result.shipment.ID_outbound);
      }

      await Promise.all([fetchQueue(), fetchHistory()]);

      if (source === 'camera') {
        setCameraSuccessOverlay({
          message: `Box ${result.box?.box_code || tokenValue} berhasil dipindai.`,
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
        message: error.response?.data?.message || 'Gagal scan box.',
      });
    } finally {
      setScanResolving(false);
      setLoading(false);
    }
  }, [fetchHistory, fetchQueue, idGudang, loadShipmentContext, qrToken, receiverName, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraStarting(true);
    setCameraError('');
    setScanFeedback(null);
    setCameraSuccessOverlay(null);

    if (cameraSuccessTimerRef.current) {
      window.clearTimeout(cameraSuccessTimerRef.current);
      cameraSuccessTimerRef.current = null;
    }

    if (!hasWarehouseScope) {
      setCameraError('Akun ini belum punya assignment gudang. Hubungi admin sebelum scan.');
      setCameraStarting(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini belum mendukung akses kamera. Pakai input manual saja.');
      setCameraStarting(false);
      return;
    }

    try {
      const supportsNativeDetector = 'BarcodeDetector' in window;
      detectorRef.current = supportsNativeDetector
        ? (detectorRef.current || new window.BarcodeDetector({ formats: ['qr_code'] }))
        : null;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks?.()[0];
      const capabilities = typeof videoTrack?.getCapabilities === 'function' ? videoTrack.getCapabilities() : null;
      const supportsTorch = Boolean(capabilities?.torch);
      setFlashSupported(supportsTorch);
      setFlashEnabled(false);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraStarting(false);

      const scanFrame = async () => {
        if (!videoRef.current || !streamRef.current) return;

        try {
          let detectedValue = null;

          if (detectorRef.current) {
            const codes = await detectorRef.current.detect(videoRef.current);
            detectedValue = codes[0]?.rawValue || null;
          } else {
            const video = videoRef.current;
            const width = video.videoWidth;
            const height = video.videoHeight;

            if (width > 0 && height > 0) {
              fallbackCanvasRef.current = fallbackCanvasRef.current || document.createElement('canvas');
              const canvas = fallbackCanvasRef.current;
              canvas.width = width;
              canvas.height = height;

              const context = canvas.getContext('2d', { willReadFrequently: true });
              if (context) {
                context.drawImage(video, 0, 0, width, height);
                const imageData = context.getImageData(0, 0, width, height);
                const qrResult = jsQR(imageData.data, width, height, {
                  inversionAttempts: 'dontInvert',
                });
                detectedValue = qrResult?.data || null;
              }
            }
          }

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
        ? 'Izin kamera diblokir. Aktifkan akses kamera di pengaturan browser.'
        : 'Kamera tidak bisa dibuka. Cek izin browser atau pakai input manual.';
      setCameraError(message);
      setCameraStarting(false);
      stopCamera();
    }
  }, [handleScanSubmit, hasWarehouseScope, stopCamera]);

  const toggleFlash = useCallback(async () => {
    try {
      const videoTrack = streamRef.current?.getVideoTracks?.()[0];
      if (!videoTrack || typeof videoTrack.applyConstraints !== 'function') {
        return;
      }

      const nextFlashState = !flashEnabled;
      await videoTrack.applyConstraints({
        advanced: [{ torch: nextFlashState }],
      });
      setFlashEnabled(nextFlashState);
    } catch (error) {
      console.error('Flash toggle failed:', error);
      setScanFeedback({
        type: 'error',
        message: 'Flash tidak bisa diaktifkan di perangkat ini.',
      });
    }
  }, [flashEnabled]);

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
    setVerifyLoading(true);
    try {
      const token = localStorage.getItem('token');
      const boxCode = activeBox.box_code;
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
      if (pendingPhotos.length > 0) {
        setPhotoUploadLoading(true);

        for (const pendingPhoto of pendingPhotos) {
          const photoPayload = new FormData();
          photoPayload.append('ID_inbound', activeInbound.ID_inbound);
          photoPayload.append('ID_outbound_box', activeBox.ID_outbound_box);
          photoPayload.append('foto', pendingPhoto.file);

          await axios.post(`${API_BASE_URL}/api/receiving/upload-photo`, photoPayload, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          });
        }
      }

      setScanFeedback({
        type: 'success',
        message: `Verifikasi ${boxCode} tersimpan. Hasil: ${formatStatusLabel(result.verification_status, 'tersimpan')}.`,
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
        message: error.response?.data?.message || 'Gagal verifikasi box.',
      });
    } finally {
      setPhotoUploadLoading(false);
      setVerifyLoading(false);
      setLoading(false);
    }
  };

  const handlePhotoSelected = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !activeBox?.ID_outbound_box) {
      return;
    }

    setScanFeedback(null);
    const previewUrl = URL.createObjectURL(file);
    setPendingPhotos((prev) => ([
      ...prev,
      {
        id: `${Date.now()}-${file.name}`,
        file,
        previewUrl,
        is_pending: true,
      },
    ]));
  };

  const handleFinalizeReceiving = async () => {
    if (!activeInbound?.ID_inbound) return;

    setLoading(true);
    setFinalizeLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/api/receiving/${activeInbound.ID_inbound}/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = response.data?.data || {};

      setScanFeedback({
        type: 'success',
        message: (result.summary?.issue_boxes || 0) > 0
          ? 'Shipment selesai. Cek ringkasan issue di riwayat.'
          : 'Shipment selesai.',
      });

      await Promise.all([fetchQueue(), fetchHistory()]);
      setActiveShipment(null);
      setActiveInbound(null);
      resetVerificationState();
      setActiveTab('history');
    } catch (error) {
      setScanFeedback({
        type: 'error',
        message: error.response?.data?.message || 'Gagal menyelesaikan receiving.',
      });
    } finally {
      setFinalizeLoading(false);
      setLoading(false);
    }
  };

  const progress = buildReceivingProgress(activeShipment);
  const activeBoxPhotos = [
    ...(Array.isArray(activeBox?.photos) ? activeBox.photos : []),
    ...pendingPhotos.map((photo) => ({
      ID_foto: photo.id,
      file_url: photo.previewUrl,
      is_pending: true,
    })),
  ];

  const handleSheetTouchStart = (event) => {
    sheetTouchStartYRef.current = event.touches?.[0]?.clientY ?? null;
  };

  const handleSheetTouchMove = (event) => {
    const startY = sheetTouchStartYRef.current;
    const currentY = event.touches?.[0]?.clientY ?? null;

    if (startY === null || currentY === null) return;

    const delta = currentY - startY;

    if (delta < -20) {
      setSheetExpanded(true);
    } else if (delta > 20 && !activeBox) {
      setSheetExpanded(false);
    }
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
              <strong>QR terbaca</strong>
              <span>{cameraSuccessOverlay.message}</span>
            </div>
          )}
          {scanResolving && !cameraSuccessOverlay ? (
            <div className="camera-loading-overlay">
              <div className="camera-loading-overlay__spinner">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
              <strong>Mengecek box...</strong>
              <span>Sistem sedang mencari shipment dan detail box dari QR ini.</span>
            </div>
          ) : null}
          {(!cameraActive || cameraError) && !cameraSuccessOverlay && (
            <div className="camera-placeholder">
              <i className={`fa-solid ${cameraError ? 'fa-video-slash' : cameraStarting ? 'fa-spinner fa-spin' : 'fa-camera'}`}></i>
              <p>{cameraError || (cameraStarting ? 'Menyalakan kamera...' : 'Kamera siap dipakai.')}</p>
              <div className="camera-actions">
                <button type="button" className="receiving-btn receiving-btn--ghost" onClick={startCamera}>
                  Coba lagi
                </button>
                <button type="button" className="receiving-btn receiving-btn--ghost" onClick={() => {
                  setScanMethod('manual');
                  setSheetExpanded(true);
                }}>
                  Input manual
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="camera-viewport receiving-fullscan__camera receiving-fullscan__camera--manual">
          <div className="camera-placeholder">
            <i className="fa-solid fa-keyboard"></i>
            <p>Mode input manual aktif. Masukkan token QR dari label box di bawah.</p>
          </div>
        </div>
      )}
    </>
  );

  const renderQueueView = () => (
    <div className="receiving-mobile__stack">
      <SectionCard
        title="Shipment untuk gudang ini"
        action={(
          <button
            type="button"
            className="receiving-btn receiving-btn--ghost"
            onClick={() => { void fetchQueue(); void fetchHistory(); }}
            disabled={queueLoading || historyLoading}
          >
            Muat ulang
          </button>
        )}
      >
        {queueLoading ? (
          <EmptyState
            description="Tunggu sebentar, antrian terbaru sedang dimuat."
            icon="fa-solid fa-spinner fa-spin"
            title="Memuat antrian"
          />
        ) : queueShipments.length === 0 ? (
          <EmptyState
            description="Shipment baru untuk gudang ini akan muncul di sini."
            icon="fa-solid fa-inbox"
            title="Belum ada shipment di antrian"
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
                  Mulai
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
          <button type="button" className="receiving-fullscan__icon-btn" onClick={() => handleTabChange('queue')} aria-label="Kembali ke antrian">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          <div className="receiving-fullscan__scope">
            <span>{assignedWarehouseLabel}</span>
          </div>
          <div className="receiving-fullscan__tools">
            <button type="button" className="receiving-fullscan__icon-btn" onClick={() => setActiveTab('help')} aria-label="Buka bantuan scanner">
              <i className="fa-solid fa-circle-question"></i>
            </button>
            <button
              type="button"
              className={`receiving-fullscan__icon-btn ${flashEnabled ? 'is-active' : ''}`}
              onClick={() => void toggleFlash()}
              aria-label="Nyalakan flash"
              disabled={!flashSupported || !cameraActive}
            >
              <i className="fa-solid fa-bolt"></i>
            </button>
          </div>
        </div>

        {renderCameraStage()}

        <div
          className={`receiving-sheet ${sheetExpanded ? 'is-expanded' : ''}`}
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
        >
          <button
            type="button"
            className="receiving-sheet__handle"
            onClick={() => setSheetExpanded((prev) => !prev)}
            aria-label={sheetExpanded ? 'Tutup panel sesi' : 'Buka panel sesi'}
          >
            <span></span>
          </button>

          <div className="receiving-sheet__summary">
            <div className="receiving-sheet__summary-copy">
              <strong>
                {receiveBusy
                  ? 'Menyiapkan sesi shipment...'
                  : activeShipment?.vendor?.nama_vendor || 'Belum ada shipment aktif'}
              </strong>
              <span>
                {scanResolving
                  ? 'QR sedang dicocokkan dengan box dan shipment.'
                  : contextLoading
                    ? 'Memuat detail shipment aktif.'
                    : activeShipment
                  ? `${progress.scannedBoxes} dari ${progress.totalBoxes} box`
                  : `Cakupan gudang: ${assignedWarehouseLabel}`}
              </span>
            </div>
            <div className="receiving-sheet__summary-side">
              <span>
                {finalizeLoading
                  ? 'Menyelesaikan...'
                  : activeShipment
                  ? `${progress.issueBoxes} masalah`
                  : receiverName}
              </span>
              {activeInbound?.ID_inbound ? (
                <button
                  type="button"
                  className="receiving-btn receiving-btn--ghost"
                  onClick={() => void handleFinalizeReceiving()}
                  disabled={loading || progress.totalBoxes === 0 || progress.scannedBoxes < progress.totalBoxes}
                >
                  {finalizeLoading ? 'Menyelesaikan...' : 'Selesaikan'}
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
                Kamera
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
                Akun ini belum punya assignment gudang. Hubungi admin untuk lanjut scan.
              </div>
            ) : null}

            {receiveBusy && !activeBox ? (
              <div className="receiving-sheet__loading">
                <div className="receiving-sheet__loading-icon">
                  <i className="fa-solid fa-spinner fa-spin"></i>
                </div>
                <strong>
                  {scanResolving
                    ? 'Mengecek QR dan box'
                    : cameraStarting
                      ? 'Menyiapkan kamera'
                      : 'Memuat shipment'}
                </strong>
                <span>
                  {scanResolving
                    ? 'Tunggu sebentar, sistem sedang mencocokkan QR dengan shipment aktif.'
                    : cameraStarting
                      ? 'Kamera sedang diaktifkan supaya siap dipakai scan.'
                      : 'Data shipment aktif sedang dimuat ke panel ini.'}
                </span>
              </div>
            ) : null}

            {scanMethod === 'manual' ? (
              <div className="receiving-manual">
                <div className="receiving-field-group">
                  <label htmlFor="qr-token">Token QR</label>
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
                  {scanResolving ? 'Mengecek token...' : 'Scan box ini'}
                </AppButton>
              </div>
            ) : null}

            {activeBox ? (
              <div className="receiving-verify">
                <div className="receiving-flow__verify-head">
                  <div>
                    <span>Box saat ini</span>
                    <strong>{activeBox.box_code}</strong>
                  </div>
                  <div>
                    <span>Ekspektasi</span>
                    <strong>{activeBox.expected_qty_in_box}</strong>
                  </div>
                </div>

                <div className="receiving-field-group">
                  <label htmlFor="actual-qty">Quantity aktual</label>
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
                  <label htmlFor="condition-status">Kondisi</label>
                  <select
                    id="condition-status"
                    className="receiving-control"
                    value={verificationForm.conditionStatus}
                    onChange={(event) => setVerificationForm((prev) => ({ ...prev, conditionStatus: event.target.value }))}
                  >
                    <option value="normal">Normal</option>
                    <option value="damaged">Rusak</option>
                    <option value="suspect">Mencurigakan</option>
                  </select>
                </div>

                <div className="receiving-field-group">
                  <label htmlFor="verification-notes">Catatan</label>
                  <textarea
                    id="verification-notes"
                    className="receiving-control receiving-control--textarea"
                    rows="4"
                    placeholder="Tambahkan catatan kalau perlu review manager."
                    value={verificationForm.notes}
                    onChange={(event) => setVerificationForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>

                <div className="receiving-photo-panel">
                  <div className="receiving-photo-panel__head">
                    <div>
                      <span>Foto barang</span>
                      <strong>{activeBoxPhotos.length ? `${activeBoxPhotos.length} foto terlampir` : 'Belum ada foto terlampir'}</strong>
                    </div>
                  </div>
                  <div className="receiving-photo-panel__actions">
                    <button
                      type="button"
                      className="receiving-btn receiving-btn--ghost"
                      onClick={() => cameraPhotoInputRef.current?.click()}
                      disabled={loading || photoUploadLoading}
                    >
                      <i className="fa-solid fa-camera"></i> Add Photo - Camera
                    </button>
                    <button
                      type="button"
                      className="receiving-btn receiving-btn--ghost"
                      onClick={() => galleryPhotoInputRef.current?.click()}
                      disabled={loading || photoUploadLoading}
                    >
                      <i className="fa-solid fa-image"></i> Add Photo - Upload
                    </button>
                  </div>
                  <input
                    ref={cameraPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={handlePhotoSelected}
                  />
                  <input
                    ref={galleryPhotoInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handlePhotoSelected}
                  />
                  {photoUploadLoading ? (
                    <div className="receiving-photo-panel__empty">Mengunggah foto...</div>
                  ) : activeBoxPhotos.length > 0 ? (
                    <div className="receiving-photo-grid">
                      {activeBoxPhotos.map((photo) => (
                        <a
                          key={photo.ID_foto || photo.file_url}
                          className="receiving-photo-thumb"
                          href={photo.file_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Buka foto barang"
                        >
                          <img src={photo.file_url} alt="Foto barang hasil verifikasi" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="receiving-photo-panel__empty">Belum ada foto terlampir.</div>
                  )}
                </div>

                <div className="receiving-actions">
                  <AppButton
                    className="receiving-primary-button"
                    disabled={loading || photoUploadLoading || verificationForm.actualQty === ''}
                    type="button"
                    onClick={() => void handleVerifyBox()}
                  >
                    {verifyLoading ? 'Menyimpan...' : 'Simpan dan lanjut'}
                  </AppButton>
                  <button type="button" className="receiving-btn receiving-btn--ghost" onClick={resetVerificationState} disabled={loading}>
                    Kosongkan box
                  </button>
                </div>
              </div>
            ) : receiveBusy ? null : !activeShipment ? (
              <div className="receiving-sheet__empty">
                <strong>Scan box untuk mulai</strong>
                <span>Sesi shipment akan muncul otomatis setelah QR atau token valid terbaca.</span>
              </div>
            ) : scanMethod === 'camera' && !sheetExpanded ? (
              <div className="receiving-sheet__hint">Tarik panel ke atas untuk input manual atau detail shipment.</div>
            ) : (
              <div className="receiving-sheet__empty">
                <strong>Belum ada yang diverifikasi</strong>
                <span>Scan satu box dulu. Quantity ekspektasinya akan muncul di sini.</span>
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
        title="Riwayat terbaru"
        action={(
          <button
            type="button"
            className="receiving-btn receiving-btn--ghost"
            onClick={() => { void fetchHistory(); }}
            disabled={historyLoading}
          >
            Muat ulang
          </button>
        )}
      >
        {historyLoading ? (
          <EmptyState
            description="Tunggu sebentar, riwayat receiving sedang dimuat."
            icon="fa-solid fa-spinner fa-spin"
            title="Memuat riwayat"
          />
        ) : historyInbounds.length === 0 ? (
          <EmptyState
            description="Catatan inbound akan muncul di sini setelah scan pertama."
            icon="fa-solid fa-clock-rotate-left"
            title="Belum ada riwayat receiving"
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
                      <span>{inbound.nama_penerima || 'Petugas penerima'}</span>
                    </div>
                    <ProgressBar label={`${scanned} of ${total} scanned`} value={percent} />
                  </div>
                  <button
                    type="button"
                    className="receiving-btn receiving-btn--ghost"
                    onClick={() => void loadShipmentContext(inbound.ID_outbound).then(() => setActiveTab('receive'))}
                  >
                    Buka
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );

  const renderHelpView = () => (
    <div className="receiving-mobile__stack">
      <SectionCard
        title="Bantuan scanner"
        action={(
          <button
            type="button"
            className="receiving-btn receiving-btn--ghost"
            onClick={() => setActiveTab('receive')}
          >
            Kembali
          </button>
        )}
      >
        <div className="scanner-faq">
          {scannerFaqItems.map((item, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div key={item.question} className={`scanner-faq__item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="scanner-faq__trigger"
                  onClick={() => setOpenFaqIndex((prev) => (prev === index ? -1 : index))}
                >
                  <span>{item.question}</span>
                  <i className={`fa-solid ${isOpen ? 'fa-minus' : 'fa-plus'}`}></i>
                </button>
                {isOpen ? (
                  <div className="scanner-faq__answer">
                    <p>{item.answer}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );

  return (
    <div className="receiving-mobile">
      {activeTab !== 'receive' ? (
        <WorkspaceHeader
          actionLabel="Keluar"
          onAction={() => setLogoutConfirmOpen(true)}
          scopeLabel={assignedWarehouseLabel}
          title={currentTitle}
        />
      ) : null}

      {scanFeedback ? (
        <FeedbackBanner
          message={scanFeedback.message}
          title={scanFeedback.type === 'success' ? 'Berhasil diperbarui' : 'Perlu perhatian'}
          tone={scanFeedback.type === 'success' ? 'success' : 'error'}
        />
      ) : null}

      <main className={`receiving-mobile__content ${activeTab === 'receive' ? 'is-receive' : ''}`}>
        {contextLoading && activeTab !== 'receive' ? (
          <div className="receiving-mobile__loading">Memuat shipment...</div>
        ) : null}
        {activeTab === 'queue' ? renderQueueView() : null}
        {activeTab === 'receive' ? renderReceiveView() : null}
        {activeTab === 'history' ? renderHistoryView() : null}
        {activeTab === 'help' ? renderHelpView() : null}
      </main>

      {activeTab !== 'receive' && activeTab !== 'help' ? (
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
        title="Keluar dari sesi petugas?"
        message="Kamu perlu login lagi untuk lanjut proses receiving."
        cancelLabel="Tetap di sini"
        confirmLabel="Keluar"
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
};

export default ScanOfficerDashboard;
