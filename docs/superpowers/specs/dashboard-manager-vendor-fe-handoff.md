# Dashboard Manager/Vendor FE Handoff

Last updated: 2026-06-01

## Status

Backend contract for `manager` and `vendor` dashboard is now stabilized enough for frontend integration.

Core goal already covered:

- dashboard counts are now derived from backend with explicit domain rules
- click-through filters are available
- QR readiness has a stable response shape
- manager/vendor overview endpoints are available

## What Changed In Backend

### 1. Canonical shipment and discrepancy rules are now explicit

Shipment source of truth:

- `tabel_outbound.status`

Allowed shipment statuses:

- `draft`
- `submitted`
- `in_transit`
- `arrived`
- `verified`

Dashboard bucket mapping:

- `draft` = `draft`
- `shipping` = `submitted` + `in_transit`
- `delivered` = `arrived` + `verified`

Discrepancy source of truth:

- `tabel_discrepancy.status`

Allowed discrepancy statuses:

- `match`
- `mismatch`
- `missing`
- `over`

Important counting rule:

- dashboard discrepancy counts must not be derived from `shipment.status`

### 2. Outbound validation is enforced server-side

Backend now enforces:

- `waktu_kirim` required
- `estimasi_tiba` required
- `estimasi_tiba >= waktu_kirim`

### 3. QR contract is stable

`GET /api/outbound/{id}/qr-token` now returns:

- `shipment_status`
- `qr_ready`
- `total_qr`
- `ready_qr`
- `qr_tokens`

Frontend should rely on `qr_ready`, not only `shipment_status`.

### 4. Dashboard click-through is supported

`GET /api/outbound`

Supported filters:

- `status_bucket=draft|shipping|delivered`
- `has_discrepancy=1|0`

Each outbound row now also exposes:

- `total_qr`
- `ready_qr`
- `qr_ready`
- `has_discrepancy`

`GET /api/discrepancy`

Supported filters:

- `status=mismatch|missing|over|match`
- `pending_review=1|0`

Each discrepancy row exposes `latest_action` without requiring full action history fetch.

### 5. Dashboard overview endpoints are ready

Available endpoints:

- `GET /api/dashboard/manager-overview`
- `GET /api/dashboard/vendor-overview`

Role guard:

- `manager-overview` only for `manager` and `admin`
- `vendor-overview` only for `vendor`

## Recommended FE Usage

### Manager dashboard

Primary endpoint:

- `GET /api/dashboard/manager-overview`

Use:

- cards from `shipment_counts`
- discrepancy cards from `discrepancy_breakdown`
- vendor table from `vendor_performance`
- aging/SLA widgets from `aging_sla`
- recent shipment list from `recent_shipments`
- pending review list from `pending_review_queue`

Click-through mapping:

- Total shipments -> `/api/outbound`
- Draft -> `/api/outbound?status_bucket=draft`
- Shipping -> `/api/outbound?status_bucket=shipping`
- Delivered -> `/api/outbound?status_bucket=delivered`
- Shipment discrepancy -> `/api/outbound?has_discrepancy=1`
- Pending review -> `/api/discrepancy?pending_review=1`

### Vendor dashboard

Primary endpoint:

- `GET /api/dashboard/vendor-overview`

Use:

- cards from `shipment_status_distribution`
- QR widget from `qr_readiness`
- discrepancy alert from `discrepancy_alert`
- activity list from `recent_activity`

Click-through mapping:

- Draft -> `/api/outbound?status_bucket=draft`
- Shipping -> `/api/outbound?status_bucket=shipping`
- Delivered -> `/api/outbound?status_bucket=delivered`
- Shipment discrepancy -> `/api/outbound?has_discrepancy=1`
- Pending discrepancy review -> `/api/discrepancy?pending_review=1`

## Current Response Notes

### Manager overview

Includes:

- `role_scope`
- `generated_at`
- `shipment_counts`
- `discrepancy_breakdown`
- `vendor_performance`
- `aging_sla`
- `recent_shipments`
- `pending_review_queue`

### Vendor overview

Includes:

- `role_scope`
- `generated_at`
- `shipment_status_distribution`
- `qr_readiness`
- `discrepancy_alert`
- `recent_activity`

### Shared note

Current recent list size:

- `recent_shipments`: max 5
- `recent_activity`: max 5
- `pending_review_queue`: max 5

## What FE Should Stop Doing

- stop deriving dashboard discrepancy counts from `/api/outbound` status alone
- stop mixing shipment KPI and discrepancy KPI as if they are the same domain
- stop assuming QR readiness only from non-draft shipment status
- stop computing final summary numbers from paginated list endpoints when overview endpoints already provide the aggregate

## Known Remaining Risk

QR token is still effectively modeled per `outbound_detail`.

If `jumlah_box > 1` means multiple physical boxes per detail, a future QR-per-box refactor may still be needed.

This does not block current dashboard integration, but it is still a domain risk for scan flow accuracy.

## Verification

Backend verification completed with:

```bash
php artisan test
```

Result at handoff time:

- `19 passed`

## Reference

Detailed contract:

- `docs/dashboard-manager-vendor-api-contract.md`
