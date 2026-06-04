# FE Session Handoff: Analytics Endpoints

Last updated: 2026-06-01  
Branch: `alfi/continue`

---

## Status

Analytics subset sudah di-implement di backend.  
22 tests passing.

---

## Endpoints Baru

### Manager Analytics

```
GET /api/dashboard/manager-analytics
Authorization: Bearer <token>   (role: manager | admin)
```

Query params (opsional):
- `?vendor_id=5` — filter ke satu vendor

### Vendor Analytics

```
GET /api/dashboard/vendor-analytics
Authorization: Bearer <token>   (role: vendor)
```

Vendor auto-scoped ke vendor user sendiri.

---

## Response Shape

### Manager Analytics

```json
{
  "data": {
    "role_scope": "manager",
    "generated_at": "2026-06-01T10:00:00.000000Z",
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
        "date": "2026-06-01",
        "shipments_total": 10,
        "shipments_currently_verified": 7,
        "shipments_with_discrepancy": 2,
        "discrepancy_rows": 4
      }
    ]
  },
  "message": "success"
}
```

### Vendor Analytics

Shape sama, minus `discrepancy_by_vendor`:

```json
{
  "data": {
    "role_scope": "vendor",
    "generated_at": "...",
    "date_basis": "dispatch_date",
    "discrepancy_by_part": [...],
    "schedule_risk": {...},
    "action_queue": {...},
    "audit_evidence_summary": {...},
    "trend_by_date": [...]
  }
}
```

---

## Field Notes Penting

### `discrepancy_rate`
Float 0–1. Bukan persen string.  
`0.3` = 30% shipments dari vendor tsb punya discrepancy.

### `trend_by_date`
- Diurutkan DESC (terbaru dulu), max 30 data point
- `date_basis: "dispatch_date"` — date bucket dari `waktu_kirim`, **bukan** verified date
- `shipments_currently_verified` = berapa dari bucket itu yang sekarang berstatus verified (bukan "kapan" verified)

### `action_queue`
- `submitted_qr_not_ready` = shipment status != draft tapi ada detail yang QR token belum di-generate
- `awaiting_vendor_response` **tidak ada** — jangan render field ini

### `audit_evidence_summary`
- `shipments_without_photo` = shipments yang sudah received (inbound exist) tapi tanpa foto
- Photo = `tabel_foto`, bukan GPS/geotag — location proof bersifat partial

---

## Jawaban Eksplisit untuk FE

| Pertanyaan | Jawaban |
|---|---|
| Apakah ada `line` data? | **Tidak**. Closest: `kode_area` di gudang, tapi bukan production line |
| Apakah ada `awaiting_vendor_response`? | **Tidak** |
| Audit evidence: photo? | Ada, partial (bukan geotag) |
| Audit evidence: timestamp? | Ada |
| Audit evidence: location? | Ada, partial (warehouse context, bukan GPS) |
| Default `trend_by_date` basis? | `dispatch_date` dari `waktu_kirim` |

---

## Yang Belum Bisa Diimplementasikan

Jangan build UI yang blocking untuk ini — domain belum support:

- `discrepancy_by_line` — tidak ada entity `line` di domain
- `awaiting_vendor_response` — tidak ada canonical state ini

---

## Endpoints yang Sudah Ada (Tetap Valid)

```
GET /api/dashboard/summary
GET /api/dashboard/manager-overview
GET /api/dashboard/vendor-overview
GET /api/outbound?status_bucket=shipping|delivered
GET /api/outbound?has_discrepancy=0|1
GET /api/discrepancy?pending_review=0|1
GET /api/outbound/{id}/qr-token
```

Ref lengkap: `docs/superpowers/specs/dashboard-manager-vendor-api-contract.md`  
Keputusan extension: `docs/superpowers/specs/dashboard-manager-vendor-api-contract-extension-decision.md`
