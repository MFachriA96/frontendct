import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecentShipmentActivity,
  buildShipmentChartSegments,
  buildVendorSummaryCards,
  buildQrDownloadLabel,
  canAccessQrForShipment,
  getDiscrepancyStatusCounts,
  getUpcomingShipmentSchedule,
  getShipmentStatusCounts,
  validateOutboundSchedule,
  normalizeAnalyticsResponse,
  buildTrendChartData,
  buildDiscrepancyByPartRows,
  summarizeAuditEvidence,
} from '../src/utils/dashboardLogic.js';

describe('validateOutboundSchedule', () => {
  it('requires dispatch date and expected arrival', () => {
    assert.deepEqual(validateOutboundSchedule('', ''), {
      valid: false,
      message: 'Dispatch Date and Expected Arrival are required.',
    });
  });

  it('rejects expected arrival before dispatch date', () => {
    assert.deepEqual(validateOutboundSchedule('2026-05-31', '2026-05-30'), {
      valid: false,
      message: 'Expected Arrival must be the same as or later than Dispatch Date.',
    });
  });

  it('accepts expected arrival on the same date or after dispatch date', () => {
    assert.deepEqual(validateOutboundSchedule('2026-05-30', '2026-05-30'), { valid: true });
    assert.deepEqual(validateOutboundSchedule('2026-05-30', '2026-05-31'), { valid: true });
  });
});

describe('getShipmentStatusCounts', () => {
  it('uses the same status buckets for vendor and manager dashboards', () => {
    const shipments = [
      { status: 'draft', has_discrepancy: false },
      { status: 'submitted', has_discrepancy: true },
      { status: 'in_transit', has_discrepancy: false },
      { status: 'arrived', has_discrepancy: true },
      { status: 'verified', has_discrepancy: false },
    ];

    assert.deepEqual(getShipmentStatusCounts(shipments), {
      total: 5,
      shipping: 2,
      delivered: 2,
      discrepancy: 2,
      draft: 1,
    });
  });
});

describe('buildQrDownloadLabel', () => {
  it('includes product, detail id, and token in the downloaded QR label', () => {
    const label = buildQrDownloadLabel({
      ID_outbound_detail: 42,
      nama_barang: 'Printer Housing Cover',
      qr_token: 'QR-ABC-123',
    });

    assert.equal(label, 'Printer Housing Cover | Detail #42 | Token: QR-ABC-123');
  });
});

describe('canAccessQrForShipment', () => {
  it('allows QR access only when backend marks the shipment as ready', () => {
    assert.equal(canAccessQrForShipment({ status: 'submitted', qr_ready: true }), true);
    assert.equal(canAccessQrForShipment({ status: 'in_transit', qr_ready: true }), true);
    assert.equal(canAccessQrForShipment({ status: 'arrived', qr_ready: true }), true);
  });

  it('blocks QR access when backend has not marked the shipment as ready', () => {
    assert.equal(canAccessQrForShipment({ status: 'submitted', qr_ready: false }), false);
    assert.equal(canAccessQrForShipment({ status: 'draft', qr_ready: false }), false);
  });
});

describe('buildShipmentChartSegments', () => {
  it('builds chart segments from the shared shipment buckets', () => {
    const segments = buildShipmentChartSegments([
      { status: 'draft', has_discrepancy: false },
      { status: 'submitted', has_discrepancy: true },
      { status: 'verified', has_discrepancy: false },
    ]);

    assert.deepEqual(segments, [
      { key: 'shipping', label: 'Shipping', value: 1, color: '#0f766e' },
      { key: 'delivered', label: 'Delivered', value: 1, color: '#2563eb' },
      { key: 'discrepancy', label: 'Discrepancy', value: 1, color: '#dc2626' },
      { key: 'draft', label: 'Draft', value: 1, color: '#d97706' },
    ]);
  });
});

describe('buildRecentShipmentActivity', () => {
  it('returns the most recent shipment activity in descending order', () => {
    const activity = buildRecentShipmentActivity([
      { ID_outbound: 1, status: 'draft', created_at: '2026-05-29T10:00:00Z' },
      { ID_outbound: 2, status: 'submitted', created_at: '2026-05-31T10:00:00Z' },
      { ID_outbound: 3, status: 'verified', created_at: '2026-05-30T10:00:00Z' },
    ], 2);

    assert.deepEqual(activity.map((item) => item.shipmentId), [2, 3]);
    assert.equal(activity[0].statusLabel, 'Submitted');
    assert.equal(activity[1].statusLabel, 'Verified');
  });
});

describe('getUpcomingShipmentSchedule', () => {
  it('sorts shipments by dispatch date and ignores records without schedule data', () => {
    const schedule = getUpcomingShipmentSchedule([
      { ID_outbound: 10, waktu_kirim: '2026-06-05 00:00:00', estimasi_tiba: '2026-06-08 00:00:00', status: 'submitted' },
      { ID_outbound: 11, waktu_kirim: '2026-06-03 00:00:00', estimasi_tiba: '2026-06-04 00:00:00', status: 'draft' },
      { ID_outbound: 12, status: 'draft' },
      { ID_outbound: 13, waktu_kirim: '2026-06-04 00:00:00', estimasi_tiba: '2026-06-07 00:00:00', status: 'in_transit' },
    ], 2);

    assert.deepEqual(schedule.map((item) => item.shipmentId), [11, 13]);
  });
});

describe('getDiscrepancyStatusCounts', () => {
  it('counts discrepancy statuses with a stable default shape', () => {
    const counts = getDiscrepancyStatusCounts([
      { status: 'match' },
      { status: 'mismatch' },
      { status: 'missing' },
      { status: 'over' },
      { status: 'mismatch' },
    ]);

    assert.deepEqual(counts, {
      match: 1,
      mismatch: 2,
      missing: 1,
      over: 1,
    });
  });
});

describe('buildVendorSummaryCards', () => {
  it('returns human-readable vendor dashboard stats', () => {
    const cards = buildVendorSummaryCards([
      { status: 'draft', has_discrepancy: false },
      { status: 'submitted', has_discrepancy: true },
      { status: 'in_transit', has_discrepancy: false },
      { status: 'verified', has_discrepancy: false },
    ]);

    assert.deepEqual(cards, [
      {
        key: 'total',
        label: 'Semua Pengiriman',
        value: 4,
        description: 'Total pengiriman yang sedang Anda monitor.',
        tone: 'blue',
      },
      {
        key: 'shipping',
        label: 'Sedang Dikirim',
        value: 2,
        description: 'Pengiriman sudah dilepas dan masih berjalan.',
        tone: 'yellow',
      },
      {
        key: 'delivered',
        label: 'Sudah Diterima',
        value: 1,
        description: 'Pengiriman sudah tiba dan tercatat diterima.',
        tone: 'green',
      },
      {
        key: 'discrepancy',
        label: 'Perlu Tindak Lanjut',
        value: 1,
        description: 'Ada selisih yang perlu ditinjau lebih lanjut.',
        tone: 'red',
      },
    ]);
  });
});

describe('normalizeAnalyticsResponse', () => {
  it('returns fully-zeroed safe shape for empty input', () => {
    const result = normalizeAnalyticsResponse(null);
    assert.deepEqual(result.discrepancy_by_part, []);
    assert.deepEqual(result.discrepancy_by_vendor, []);
    assert.deepEqual(result.trend_by_date, []);
    assert.equal(result.schedule_risk.dispatch_today, 0);
    assert.equal(result.schedule_risk.overdue_shipping, 0);
    assert.equal(result.action_queue.pending_discrepancy_review, 0);
    assert.equal(result.audit_evidence_summary.shipments_with_photo, 0);
  });

  it('unwraps data.data nesting', () => {
    const payload = {
      data: {
        role_scope: 'manager',
        schedule_risk: { dispatch_today: 3, overdue_shipping: 1, arrival_today: 0, arrived_awaiting_verification: 0, missing_schedule_data: 0 },
        action_queue: { draft_pending_submit: 0, submitted_qr_not_ready: 0, pending_discrepancy_review: 2 },
        audit_evidence_summary: { shipments_with_photo: 5, shipments_without_photo: 2, shipments_with_location: 4, shipments_with_timestamp: 7 },
        discrepancy_by_part: [],
        discrepancy_by_vendor: [],
        trend_by_date: [],
      },
    };
    const result = normalizeAnalyticsResponse(payload);
    assert.equal(result.role_scope, 'manager');
    assert.equal(result.schedule_risk.dispatch_today, 3);
    assert.equal(result.action_queue.pending_discrepancy_review, 2);
    assert.equal(result.audit_evidence_summary.shipments_with_photo, 5);
  });
});

describe('buildTrendChartData', () => {
  it('returns empty labels and datasets for empty input', () => {
    const result = buildTrendChartData([]);
    assert.deepEqual(result.labels, []);
    assert.equal(result.datasets.length, 3);
    assert.deepEqual(result.datasets[0].data, []);
  });

  it('reverses DESC input to ASC for time axis', () => {
    const trendDesc = [
      { date: '2026-06-03', shipments_total: 5, shipments_currently_verified: 3, shipments_with_discrepancy: 1 },
      { date: '2026-06-02', shipments_total: 4, shipments_currently_verified: 2, shipments_with_discrepancy: 0 },
      { date: '2026-06-01', shipments_total: 2, shipments_currently_verified: 1, shipments_with_discrepancy: 0 },
    ];
    const result = buildTrendChartData(trendDesc);
    assert.deepEqual(result.labels, ['2026-06-01', '2026-06-02', '2026-06-03']);
    assert.deepEqual(result.datasets[0].data, [2, 4, 5]);
    assert.deepEqual(result.datasets[1].data, [1, 2, 3]);
    assert.deepEqual(result.datasets[2].data, [0, 0, 1]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { date: '2026-06-02', shipments_total: 4, shipments_currently_verified: 2, shipments_with_discrepancy: 0 },
      { date: '2026-06-01', shipments_total: 2, shipments_currently_verified: 1, shipments_with_discrepancy: 0 },
    ];
    buildTrendChartData(input);
    assert.equal(input[0].date, '2026-06-02');
  });
});

describe('buildDiscrepancyByPartRows', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(buildDiscrepancyByPartRows([]), []);
  });

  it('sorts by total_non_match descending', () => {
    const parts = [
      { part_id: 1, part_name: 'A', mismatch: 0, missing: 1, over: 0, total_non_match: 1 },
      { part_id: 2, part_name: 'B', mismatch: 3, missing: 0, over: 0, total_non_match: 3 },
      { part_id: 3, part_name: 'C', mismatch: 1, missing: 1, over: 0, total_non_match: 2 },
    ];
    const result = buildDiscrepancyByPartRows(parts);
    assert.deepEqual(result.map((r) => r.part_id), [2, 3, 1]);
  });

  it('does not mutate the input array', () => {
    const parts = [
      { part_id: 1, total_non_match: 1 },
      { part_id: 2, total_non_match: 3 },
    ];
    buildDiscrepancyByPartRows(parts);
    assert.equal(parts[0].part_id, 1);
  });
});

describe('summarizeAuditEvidence', () => {
  it('returns zeroed summary with partial flag for empty input', () => {
    const result = summarizeAuditEvidence({});
    assert.equal(result.total, 0);
    assert.equal(result.photoPct, 0);
    assert.equal(result.locationPct, 0);
    assert.equal(result.partial, true);
  });

  it('computes photo and location coverage percentages', () => {
    const result = summarizeAuditEvidence({
      shipments_with_photo: 8,
      shipments_without_photo: 2,
      shipments_with_location: 7,
      shipments_with_timestamp: 10,
    });
    assert.equal(result.total, 10);
    assert.equal(result.photoPct, 80);
    assert.equal(result.locationPct, 70);
    assert.equal(result.withTimestamp, 10);
    assert.equal(result.partial, true);
  });

  it('avoids divide-by-zero when total is zero', () => {
    const result = summarizeAuditEvidence({
      shipments_with_photo: 0,
      shipments_without_photo: 0,
      shipments_with_location: 0,
      shipments_with_timestamp: 0,
    });
    assert.equal(result.photoPct, 0);
    assert.equal(result.locationPct, 0);
  });
});
