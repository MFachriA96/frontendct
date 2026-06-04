# FE Session Handoff: Analytics Endpoints

Last updated: 2026-06-02
Repo: `capstonea1`

## Status

Analytics subset untuk dashboard `manager` dan `vendor` sudah aktif di backend.

Verifikasi backend terakhir:
- `php artisan test`
- hasil: `24 passed`

## Endpoint yang Dipakai FE

### Manager analytics

```http
GET /api/dashboard/manager-analytics
Authorization: Bearer <token>
```

Role yang boleh:
- `manager`
- `admin`

Query param opsional:
- `vendor_id=<id>` untuk filter analytics ke satu vendor

### Vendor analytics

```http
GET /api/dashboard/vendor-analytics
Authorization: Bearer <token>
```

Role yang boleh:
- `vendor`

Catatan:
- vendor otomatis terscope ke `ID_vendor` milik user login

## Response Shape Final

### `GET /api/dashboard/manager-analytics`

```json
{
  "success": true,
  "data": {
    "role_scope": "manager",
    "generated_at": "2026-06-02T10:00:00.000000Z",
    "date_basis": "dispatch_date",
    "discrepancy_by_part": [
      {
        "part_id": 10,
        "part_name": "Printer Housing Cover",
        "mismatch": 2,
        "missing": 1,
        "over": 0,
        "total_non_match": 3
      }
    ],
    "discrepancy_by_vendor": [
      {
        "vendor_id": 5,
        "vendor_name": "Vendor A",
        "total_shipments": 10,
        "shipments_with_discrepancy": 3,
        "discrepancy_rate": 0.3
      }
    ],
    "schedule_risk": {
      "dispatch_today": 2,
      "arrival_today": 3,
      "overdue_shipping": 1,
      "arrived_awaiting_verification": 2,
      "missing_schedule_data": 0
    },
    "action_queue": {
      "draft_pending_submit": 2,
      "submitted_qr_not_ready": 1,
      "pending_discrepancy_review": 3
    },
    "audit_evidence_summary": {
      "shipments_with_photo": 8,
      "shipments_without_photo": 2,
      "shipments_with_location": 7,
      "shipments_with_timestamp": 10
    },
    "trend_by_date": [
      {
        "date": "2026-06-02",
        "shipments_total": 10,
        "shipments_currently_verified": 7,
        "shipments_with_discrepancy": 2,
        "pending_review": 1,
        "discrepancy_rows": 4
      }
    ]
  },
  "message": "success"
}
```

### `GET /api/dashboard/vendor-analytics`

Shape sama, kecuali `discrepancy_by_vendor` tidak ada.

```json
{
  "success": true,
  "data": {
    "role_scope": "vendor",
    "generated_at": "2026-06-02T10:00:00.000000Z",
    "date_basis": "dispatch_date",
    "discrepancy_by_part": [],
    "schedule_risk": {
      "dispatch_today": 0,
      "arrival_today": 0,
      "overdue_shipping": 0,
      "arrived_awaiting_verification": 0,
      "missing_schedule_data": 0
    },
    "action_queue": {
      "draft_pending_submit": 0,
      "submitted_qr_not_ready": 0,
      "pending_discrepancy_review": 0
    },
    "audit_evidence_summary": {
      "shipments_with_photo": 0,
      "shipments_without_photo": 0,
      "shipments_with_location": 0,
      "shipments_with_timestamp": 0
    },
    "trend_by_date": [
      {
        "date": "2026-06-02",
        "shipments_total": 2,
        "shipments_currently_verified": 1,
        "shipments_with_discrepancy": 1,
        "pending_review": 1,
        "discrepancy_rows": 1
      }
    ]
  },
  "message": "success"
}
```

## Arti Field Penting

### `date_basis`
- selalu `dispatch_date`
- bucket tanggal diambil dari `tabel_outbound.waktu_kirim`

### `trend_by_date`
- urut terbaru dulu
- maksimal 30 bucket tanggal
- `shipments_currently_verified` artinya shipment dalam bucket itu yang statusnya saat ini `verified`
- `pending_review` artinya discrepancy non-`match` yang belum ada action, atau masih ada action `pending`

### `discrepancy_by_vendor`
- hanya ada di `manager-analytics`
- `discrepancy_rate` adalah float `0..1`, bukan string persen

### `schedule_risk`
- `overdue_shipping` = status `submitted|in_transit` dan `estimasi_tiba < now`
- `arrived_awaiting_verification` = shipment status `arrived`

### `action_queue`
- `draft_pending_submit` = outbound masih `draft`
- `submitted_qr_not_ready` = outbound non-draft yang masih punya detail tanpa `qr_token`
- `pending_discrepancy_review` = discrepancy non-`match` yang belum selesai direview

### `audit_evidence_summary`
- dihitung dari shipment yang sudah punya inbound
- photo berasal dari relasi foto inbound/manual verification
- location masih bersifat partial context, bukan GPS proof di level foto

## Yang Aman Dipakai FE Sekarang

- chart trend shipment/discrepancy berbasis `dispatch_date`
- breakdown discrepancy per part
- breakdown discrepancy per vendor untuk manager
- widget schedule risk
- widget action queue
- widget audit evidence summary

## Yang Harus Ditunda

- `discrepancy_by_line`
- `awaiting_vendor_response`

Alasan:
- `line` belum ada sebagai entity/domain yang valid
- `awaiting_vendor_response` belum ada sebagai state canonical

## Referensi Utama

- kontrak dashboard dasar: `docs/superpowers/specs/dashboard-manager-vendor-api-contract.md`
- keputusan extension analytics: `docs/superpowers/specs/dashboard-manager-vendor-api-contract-extension-decision.md`

