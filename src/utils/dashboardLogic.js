const SHIPPING_STATUSES = new Set(['submitted', 'in_transit']);
const DELIVERED_STATUSES = new Set(['arrived', 'verified']);

const SHIPMENT_CHART_META = [
  { key: 'shipping', label: 'Shipping', color: '#0f766e' },
  { key: 'delivered', label: 'Delivered', color: '#2563eb' },
  { key: 'discrepancy', label: 'Discrepancy', color: '#dc2626' },
  { key: 'draft', label: 'Draft', color: '#d97706' },
];

export const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

export const hasShipmentDiscrepancy = (shipment = {}) => {
  const discrepancyFlag = shipment?.has_discrepancy;

  if (typeof discrepancyFlag === 'boolean') {
    return discrepancyFlag;
  }

  if (typeof discrepancyFlag === 'number') {
    return discrepancyFlag > 0;
  }

  if (typeof discrepancyFlag === 'string') {
    const normalizedFlag = normalizeStatus(discrepancyFlag);
    return normalizedFlag === '1' || normalizedFlag === 'true' || normalizedFlag === 'yes';
  }

  return false;
};

export const getShipmentStatusGroup = (shipment) => {
  const status = normalizeStatus(shipment?.status);

  if (SHIPPING_STATUSES.has(status)) {
    return 'shipping';
  }

  if (DELIVERED_STATUSES.has(status)) {
    return 'delivered';
  }

  if (status === 'draft') {
    return 'draft';
  }

  return 'other';
};

export const getShipmentStatusCounts = (shipments = []) => shipments.reduce((counts, shipment) => {
  const group = getShipmentStatusGroup(shipment);
  const nextCounts = {
    ...counts,
    total: counts.total + 1,
    [group]: (counts[group] || 0) + 1,
  };

  if (hasShipmentDiscrepancy(shipment)) {
    nextCounts.discrepancy += 1;
  }

  return nextCounts;
}, {
  total: 0,
  shipping: 0,
  delivered: 0,
  discrepancy: 0,
  draft: 0,
});

const resolveShipmentCountsInput = (input = []) => (
  Array.isArray(input)
    ? getShipmentStatusCounts(input)
    : {
        total: Number(input?.total || 0),
        shipping: Number(input?.shipping || 0),
        delivered: Number(input?.delivered || 0),
        discrepancy: Number(input?.discrepancy || 0),
        draft: Number(input?.draft || 0),
      }
);

export const filterShipmentsByStatusGroup = (shipments = [], group = 'total') => {
  if (group === 'total' || group === 'all') {
    return shipments;
  }

  if (group === 'discrepancy') {
    return shipments.filter((shipment) => hasShipmentDiscrepancy(shipment));
  }

  return shipments.filter((shipment) => getShipmentStatusGroup(shipment) === group);
};

export const validateOutboundSchedule = (dispatchDate, expectedArrivalDate) => {
  if (!dispatchDate || !expectedArrivalDate) {
    return {
      valid: false,
      message: 'Dispatch Date and Expected Arrival are required.',
    };
  }

  if (expectedArrivalDate < dispatchDate) {
    return {
      valid: false,
      message: 'Expected Arrival must be the same as or later than Dispatch Date.',
    };
  }

  return { valid: true };
};

export const canAccessQrForShipment = (shipment = {}) => {
  const qrReady = shipment?.qr_ready;

  if (typeof qrReady === 'boolean') {
    return qrReady;
  }

  if (typeof qrReady === 'number') {
    return qrReady > 0;
  }

  if (typeof qrReady === 'string') {
    const normalizedFlag = normalizeStatus(qrReady);
    return normalizedFlag === '1' || normalizedFlag === 'true' || normalizedFlag === 'yes';
  }

  return false;
};

export const getQrProductName = (token = {}) => (
  token.nama_barang
  || token.barang?.nama_barang
  || token.outbound_detail?.nama_barang
  || token.outbound_detail?.barang?.nama_barang
  || (token.ID_barang ? `Barang ${token.ID_barang}` : 'Unknown product')
);

export const buildQrDownloadLabel = (token = {}) => {
  const productName = getQrProductName(token);
  const boxCode = token.box_code || (token.box_sequence ? `Box ${token.box_sequence}` : 'Box');
  const quantityInBox = token.expected_qty_in_box ?? '-';
  const qrToken = token.qr_token || 'Token not available';

  return `${productName} | ${boxCode} | Qty ${quantityInBox} | Token: ${qrToken}`;
};

export const buildShipmentChartSegments = (shipments = []) => {
  const counts = resolveShipmentCountsInput(shipments);
  return SHIPMENT_CHART_META.map((segment) => ({
    ...segment,
    value: counts[segment.key] || 0,
  }));
};

export const buildVendorSummaryCards = (shipments = []) => {
  const counts = resolveShipmentCountsInput(shipments);

  return [
    {
      key: 'total',
      label: 'Semua Pengiriman',
      value: counts.total,
      description: 'Total pengiriman yang sedang Anda monitor.',
      tone: 'blue',
    },
    {
      key: 'shipping',
      label: 'Sedang Dikirim',
      value: counts.shipping,
      description: 'Pengiriman sudah dilepas dan masih berjalan.',
      tone: 'yellow',
    },
    {
      key: 'delivered',
      label: 'Sudah Diterima',
      value: counts.delivered,
      description: 'Pengiriman sudah tiba dan tercatat diterima.',
      tone: 'green',
    },
    {
      key: 'discrepancy',
      label: 'Perlu Tindak Lanjut',
      value: counts.discrepancy,
      description: 'Ada selisih yang perlu ditinjau lebih lanjut.',
      tone: 'red',
    },
  ];
};

export const buildVendorDashboardPrimaryCards = (shipments = [], qrReadiness = {}) => {
  const counts = resolveShipmentCountsInput(shipments);

  return [
    {
      key: 'total',
      actionKey: 'total',
      label: 'Semua Pengiriman',
      value: counts.total,
      description: 'Total pengiriman yang sedang Anda monitor.',
      tone: 'blue',
    },
    {
      key: 'shipping',
      actionKey: 'shipping',
      label: 'Sedang Dikirim',
      value: counts.shipping,
      description: 'Pengiriman sudah dilepas dan masih berjalan.',
      tone: 'yellow',
    },
    {
      key: 'delivered',
      actionKey: 'delivered',
      label: 'Sudah Diterima',
      value: counts.delivered,
      description: 'Pengiriman sudah tiba dan tercatat diterima.',
      tone: 'green',
    },
    {
      key: 'qr_ready',
      actionKey: 'total',
      label: 'QR Siap',
      value: Number(qrReadiness.shipments_ready ?? 0),
      description: 'Shipment non-draft yang QR-nya sudah lengkap.',
      tone: 'navy',
    },
  ];
};

export const buildVendorDashboardHeroMetrics = ({
  overviewCounts = {},
  analytics = {},
  discrepancyAlert = {},
} = {}) => {
  const latestTrend = Array.isArray(analytics?.trend_by_date) && analytics.trend_by_date.length > 0
    ? analytics.trend_by_date[0]
    : null;

  return [
    {
      key: 'verified',
      label: 'Verified',
      value: Number(latestTrend?.shipments_currently_verified ?? overviewCounts.delivered ?? 0),
      tone: 'success',
    },
    {
      key: 'discrepancy',
      label: 'With discrepancy',
      value: Number(discrepancyAlert.total_non_match ?? latestTrend?.shipments_with_discrepancy ?? 0),
      tone: 'danger',
    },
    {
      key: 'pending_review',
      label: 'Pending review',
      value: Number(latestTrend?.pending_review ?? analytics?.action_queue?.pending_discrepancy_review ?? 0),
      tone: 'warning',
    },
  ];
};

export const buildManagerDashboardPrimaryCards = (shipments = [], pendingReview = 0) => {
  const counts = resolveShipmentCountsInput(shipments);

  return [
    {
      key: 'total',
      actionKey: 'total',
      label: 'Total Shipments',
      value: counts.total,
      description: 'Live outbound records',
      tone: 'blue',
    },
    {
      key: 'shipping',
      actionKey: 'shipping',
      label: 'Shipping',
      value: counts.shipping,
      description: 'Submitted or in transit',
      tone: 'info',
    },
    {
      key: 'delivered',
      actionKey: 'delivered',
      label: 'Delivered',
      value: counts.delivered,
      description: 'Arrived, verified, or delivered',
      tone: 'success',
    },
    {
      key: 'pending_review',
      actionKey: 'pending',
      label: 'Pending Review',
      value: Number(pendingReview ?? 0),
      description: 'Discrepancies still waiting manager action',
      tone: 'warning',
    },
  ];
};

export const buildManagerDashboardHeroMetrics = ({
  shipmentCounts = {},
  pendingCount = 0,
  analytics = {},
} = {}) => {
  const latestTrend = Array.isArray(analytics?.trend_by_date) && analytics.trend_by_date.length > 0
    ? analytics.trend_by_date[0]
    : null;

  return [
    {
      key: 'verified',
      label: 'Verified',
      value: Number(latestTrend?.shipments_currently_verified ?? shipmentCounts.delivered ?? 0),
      tone: 'success',
    },
    {
      key: 'discrepancy',
      label: 'With discrepancy',
      value: Number(shipmentCounts.discrepancy ?? latestTrend?.shipments_with_discrepancy ?? 0),
      tone: 'danger',
    },
    {
      key: 'pending_review',
      label: 'Pending review',
      value: Number(latestTrend?.pending_review ?? pendingCount ?? 0),
      tone: 'warning',
    },
  ];
};

export const buildRecentShipmentActivity = (shipments = [], limit = 5) => shipments
  .map((shipment) => {
    const timestamp = shipment.updated_at || shipment.created_at || shipment.waktu_kirim || shipment.estimasi_tiba;
    return {
      shipmentId: shipment.ID_outbound,
      shipmentNumber: shipment.no_pengiriman || `SHP-${shipment.ID_outbound || '-'}`,
      status: normalizeStatus(shipment.status),
      statusLabel: String(shipment.status || 'unknown')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      origin: shipment.lokasi_asal || '-',
      timestamp,
    };
  })
  .filter((shipment) => shipment.timestamp)
  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  .slice(0, limit);

export const getUpcomingShipmentSchedule = (shipments = [], limit = 4) => shipments
  .filter((shipment) => shipment?.waktu_kirim || shipment?.estimasi_tiba)
  .map((shipment) => ({
    shipmentId: shipment.ID_outbound,
    shipmentNumber: shipment.no_pengiriman || `SHP-${shipment.ID_outbound || '-'}`,
    dispatchAt: shipment.waktu_kirim || null,
    expectedArrivalAt: shipment.estimasi_tiba || null,
    status: normalizeStatus(shipment.status),
    origin: shipment.lokasi_asal || '-',
  }))
  .sort((a, b) => {
    const aTime = new Date(a.dispatchAt || a.expectedArrivalAt || 0).getTime();
    const bTime = new Date(b.dispatchAt || b.expectedArrivalAt || 0).getTime();
    return aTime - bTime;
  })
  .slice(0, limit);

export const getDiscrepancyStatusCounts = (discrepancies = []) => discrepancies.reduce((counts, discrepancy) => {
  const status = normalizeStatus(discrepancy?.status);
  if (!status) {
    return counts;
  }

  return {
    ...counts,
    [status]: (counts[status] || 0) + 1,
  };
}, {
  match: 0,
  mismatch: 0,
  missing: 0,
  over: 0,
});

export const normalizeQrTokens = (responseData) => {
  const data = responseData?.data ?? responseData;
  const tokens = data?.qr_tokens ?? data?.data?.qr_tokens ?? data;

  return Array.isArray(tokens) ? tokens : [];
};

export const normalizeAnalyticsResponse = (payload) => {
  const data = payload?.data ?? payload ?? {};
  return {
    role_scope: data.role_scope || '',
    generated_at: data.generated_at || null,
    date_basis: data.date_basis || 'dispatch_date',
    discrepancy_by_part: Array.isArray(data.discrepancy_by_part) ? data.discrepancy_by_part : [],
    discrepancy_by_vendor: Array.isArray(data.discrepancy_by_vendor) ? data.discrepancy_by_vendor : [],
    schedule_risk: {
      dispatch_today: Number(data.schedule_risk?.dispatch_today ?? 0),
      arrival_today: Number(data.schedule_risk?.arrival_today ?? 0),
      overdue_shipping: Number(data.schedule_risk?.overdue_shipping ?? 0),
      arrived_awaiting_verification: Number(data.schedule_risk?.arrived_awaiting_verification ?? 0),
      missing_schedule_data: Number(data.schedule_risk?.missing_schedule_data ?? 0),
    },
    action_queue: {
      draft_pending_submit: Number(data.action_queue?.draft_pending_submit ?? 0),
      submitted_qr_not_ready: Number(data.action_queue?.submitted_qr_not_ready ?? 0),
      pending_discrepancy_review: Number(data.action_queue?.pending_discrepancy_review ?? 0),
    },
    audit_evidence_summary: {
      shipments_with_photo: Number(data.audit_evidence_summary?.shipments_with_photo ?? 0),
      shipments_without_photo: Number(data.audit_evidence_summary?.shipments_without_photo ?? 0),
      shipments_with_location: Number(data.audit_evidence_summary?.shipments_with_location ?? 0),
      shipments_with_timestamp: Number(data.audit_evidence_summary?.shipments_with_timestamp ?? 0),
    },
    trend_by_date: Array.isArray(data.trend_by_date) ? data.trend_by_date : [],
  };
};

export const buildTrendChartData = (trendByDate = []) => {
  const sorted = [...trendByDate].reverse();
  return {
    labels: sorted.map((row) => row.date),
    datasets: [
      {
        label: 'Total',
        data: sorted.map((row) => row.shipments_total),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.1)',
        tension: 0.3,
      },
      {
        label: 'Verified',
        data: sorted.map((row) => row.shipments_currently_verified),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.1)',
        tension: 0.3,
      },
      {
        label: 'Discrepancy',
        data: sorted.map((row) => row.shipments_with_discrepancy),
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220,38,38,0.1)',
        tension: 0.3,
      },
    ],
  };
};

export const buildDiscrepancyByPartRows = (discrepancyByPart = []) =>
  [...discrepancyByPart].sort((a, b) => (b.total_non_match || 0) - (a.total_non_match || 0));

export const buildTopDiscrepancyPartHighlights = (discrepancyByPart = [], limit = 3) =>
  buildDiscrepancyByPartRows(discrepancyByPart).slice(0, limit);

export const buildScheduleRiskCards = (scheduleRisk = {}) => ([
  {
    key: 'dispatch_today',
    label: 'Berangkat Hari Ini',
    value: Number(scheduleRisk.dispatch_today ?? 0),
    tone: 'info',
  },
  {
    key: 'arrival_today',
    label: 'Tiba Hari Ini',
    value: Number(scheduleRisk.arrival_today ?? 0),
    tone: 'success',
  },
  {
    key: 'overdue_shipping',
    label: 'Melewati Estimasi',
    value: Number(scheduleRisk.overdue_shipping ?? 0),
    tone: 'danger',
  },
  {
    key: 'arrived_awaiting_verification',
    label: 'Menunggu Verifikasi',
    value: Number(scheduleRisk.arrived_awaiting_verification ?? 0),
    tone: 'warning',
  },
  {
    key: 'missing_schedule_data',
    label: 'Jadwal Belum Lengkap',
    value: Number(scheduleRisk.missing_schedule_data ?? 0),
    tone: 'muted',
  },
]);

export const buildActionQueueCards = (actionQueue = {}) => ([
  {
    key: 'draft_pending_submit',
    label: 'Draft Belum Dikirim',
    value: Number(actionQueue.draft_pending_submit ?? 0),
    tone: 'warning',
  },
  {
    key: 'submitted_qr_not_ready',
    label: 'QR Belum Siap',
    value: Number(actionQueue.submitted_qr_not_ready ?? 0),
    tone: 'info',
  },
  {
    key: 'pending_discrepancy_review',
    label: 'Selisih Menunggu Review',
    value: Number(actionQueue.pending_discrepancy_review ?? 0),
    tone: 'danger',
  },
]);

export const summarizeAuditEvidence = (summary = {}) => {
  const withPhoto = Number(summary.shipments_with_photo ?? 0);
  const withoutPhoto = Number(summary.shipments_without_photo ?? 0);
  const withLocation = Number(summary.shipments_with_location ?? 0);
  const withTimestamp = Number(summary.shipments_with_timestamp ?? 0);
  const total = withPhoto + withoutPhoto;
  const photoPct = total > 0 ? Math.round((withPhoto / total) * 100) : 0;
  const locationPct = total > 0 ? Math.round((withLocation / total) * 100) : 0;
  return {
    withPhoto,
    withoutPhoto,
    withLocation,
    withTimestamp,
    total,
    photoPct,
    locationPct,
    partial: true,
  };
};
