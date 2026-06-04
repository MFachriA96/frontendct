# Dashboard Manager/Vendor API Contract

Last updated: 2026-06-01

## Scope

This contract is the backend source of truth for dashboard work limited to:

- `manager`
- `vendor`

It covers:

- canonical shipment status
- discrepancy counting rules
- QR readiness rules
- dashboard overview endpoints
- click-through list endpoints

## Canonical Domain Rules

### Shipment status

Canonical shipment status is stored in `tabel_outbound.status`.

Allowed values:

- `draft`
- `submitted`
- `in_transit`
- `arrived`
- `verified`

### Dashboard shipment buckets

Frontend must not invent a new persisted shipment status.

Dashboard buckets are derived as:

- `draft` = `draft`
- `shipping` = `submitted` + `in_transit`
- `delivered` = `arrived` + `verified`

### Discrepancy status

Canonical discrepancy status is stored in `tabel_discrepancy.status`.

Allowed values:

- `match`
- `mismatch`
- `missing`
- `over`

### Discrepancy counting rule

For dashboard issue counts:

- `total_non_match` = all discrepancy rows with `status != match`
- `pending_review` = non-match discrepancy with no action yet, or with at least one `status_action = pending`
- shipment-level `discrepancy` count = distinct outbound shipment with at least one discrepancy row where `status != match`

Frontend must not derive discrepancy counts from `shipment.status`.

### QR readiness

Outbound is considered QR-ready when:

- `status != draft`
- all outbound detail rows have non-null `qr_token`

## Endpoint Summary

### Dashboard overview

#### `GET /api/dashboard/manager-overview`

Purpose:

- manager landing dashboard

Shape:

```json
{
  "success": true,
  "data": {
    "role_scope": "manager",
    "generated_at": "2026-06-01T00:00:00.000000Z",
    "shipment_counts": {
      "total": 0,
      "draft": 0,
      "shipping": 0,
      "delivered": 0,
      "verified": 0,
      "discrepancy": 0,
      "status_distribution": {
        "draft": 0,
        "submitted": 0,
        "in_transit": 0,
        "arrived": 0,
        "verified": 0
      }
    },
    "discrepancy_breakdown": {
      "total_non_match": 0,
      "pending_review": 0,
      "by_status": {
        "match": 0,
        "mismatch": 0,
        "missing": 0,
        "over": 0
      }
    },
    "vendor_performance": [],
    "aging_sla": {
      "overdue_shipping": 0,
      "awaiting_verification": 0
    },
    "recent_shipments": [],
    "pending_review_queue": []
  }
}
```

Notes:

- `recent_shipments` reuses outbound row resource
- `pending_review_queue` reuses discrepancy row resource

#### `GET /api/dashboard/vendor-overview`

Purpose:

- vendor landing dashboard

Shape:

```json
{
  "success": true,
  "data": {
    "role_scope": "vendor",
    "generated_at": "2026-06-01T00:00:00.000000Z",
    "shipment_status_distribution": {
      "total": 0,
      "draft": 0,
      "shipping": 0,
      "delivered": 0,
      "verified": 0,
      "discrepancy": 0,
      "status_distribution": {
        "draft": 0,
        "submitted": 0,
        "in_transit": 0,
        "arrived": 0,
        "verified": 0
      }
    },
    "qr_readiness": {
      "shipments_ready": 0,
      "shipments_not_ready": 0,
      "total_qr": 0,
      "ready_qr": 0
    },
    "discrepancy_alert": {
      "total_non_match": 0,
      "pending_review": 0,
      "by_status": {
        "match": 0,
        "mismatch": 0,
        "missing": 0,
        "over": 0
      }
    },
    "recent_activity": []
  }
}
```

Notes:

- vendor scope is applied automatically from authenticated user
- frontend must not pass `vendor_id` for vendor self-dashboard

### Shared summary

#### `GET /api/dashboard/summary`

Purpose:

- backward-compatible summary endpoint
- still valid, but new dashboard pages should prefer `manager-overview` or `vendor-overview`

## Click-through List Endpoints

### `GET /api/outbound`

Supported filters for dashboard click-through:

- `status_bucket=draft|shipping|delivered`
- `has_discrepancy=1|0`

List rows now expose dashboard-ready flags:

```json
{
  "ID_outbound": 10,
  "status": "verified",
  "total_qr": 3,
  "ready_qr": 3,
  "qr_ready": true,
  "has_discrepancy": true
}
```

Filter rules:

- `status_bucket=shipping` -> `submitted` + `in_transit`
- `status_bucket=delivered` -> `arrived` + `verified`
- `has_discrepancy=1` -> outbound has at least one non-match discrepancy
- `has_discrepancy=0` -> outbound has no non-match discrepancy

### `GET /api/discrepancy`

Supported filters for dashboard click-through:

- `status=mismatch|missing|over|match`
- `pending_review=1|0`

Filter rules:

- `pending_review=1` -> non-match discrepancy with no action yet, or with pending action
- `pending_review=0` -> non-match discrepancy with resolved action (`done` or `cancelled`)

List rows expose `latest_action` without loading full action history.

## QR Endpoint

### `GET /api/outbound/{id}/qr-token`

Shape:

```json
{
  "success": true,
  "data": {
    "shipment_status": "submitted",
    "qr_ready": true,
    "total_qr": 2,
    "ready_qr": 2,
    "qr_tokens": [
      {
        "ID_outbound_detail": 1,
        "ID_barang": 10,
        "qr_token": "uuid"
      }
    ]
  }
}
```

Notes:

- older non-draft records are backfilled if QR token is missing
- frontend should rely on `qr_ready`, not only `shipment_status`

## Validation Rules

### Outbound create/update

Backend validation is enforced for:

- `waktu_kirim` required
- `estimasi_tiba` required
- `estimasi_tiba >= waktu_kirim`

Frontend validation should mirror backend validation, not replace it.

## Recommended Frontend Wiring

### Manager dashboard

- summary cards: `GET /api/dashboard/manager-overview`
- recent shipments section: `data.recent_shipments`
- pending review queue: `data.pending_review_queue`
- vendor performance table: `data.vendor_performance`

Click-through mapping:

- Total shipments -> `/api/outbound`
- Draft -> `/api/outbound?status_bucket=draft`
- Shipping -> `/api/outbound?status_bucket=shipping`
- Delivered -> `/api/outbound?status_bucket=delivered`
- Shipment discrepancy -> `/api/outbound?has_discrepancy=1`
- Pending review -> `/api/discrepancy?pending_review=1`

### Vendor dashboard

- overview cards: `GET /api/dashboard/vendor-overview`
- recent activity: `data.recent_activity`
- QR readiness card: `data.qr_readiness`
- discrepancy alert card: `data.discrepancy_alert`

Click-through mapping:

- Draft -> `/api/outbound?status_bucket=draft`
- Shipping -> `/api/outbound?status_bucket=shipping`
- Delivered -> `/api/outbound?status_bucket=delivered`
- Shipment discrepancy -> `/api/outbound?has_discrepancy=1`
- Pending discrepancy review -> `/api/discrepancy?pending_review=1`

## Known Remaining Domain Risk

QR token is currently modeled effectively per `outbound_detail`.

If one detail row can represent multiple physical boxes through `jumlah_box > 1`, then future domain clarification is still required:

- either keep one QR per detail
- or refactor to true QR-per-box

This risk does not block current dashboard counts, but it may affect future scan accuracy and QR UX.
