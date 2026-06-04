# Receiving / Inbound Endpoint Contract

Date: 2026-06-03
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-box-entity-backend-proposal.md`
- `docs/2026-06-03-persisted-status-and-transition-proposal.md`
- `docs/2026-06-03-verification-contract-and-discrepancy-rules.md`
- `docs/2026-06-03-manager-action-and-notification-contract.md`

## Purpose

Dokumen ini mengusulkan kontrak endpoint backend untuk flow receiving / inbound.

Fokusnya:
- shipment queue untuk receiving officer
- start / continue receiving
- scan QR box
- verify box
- finalize receiving
- recount handoff

## Core Principle

Receiving flow yang dipilih adalah:
- mobile-first
- box-centric
- one box at a time

Artinya endpoint backend harus mendukung:
- fetch shipment queue sesuai gudang
- scan box dan dapat expected content
- verify box dan update progress
- finalize shipment receiving

## Scope of This Contract

Dokumen ini fokus ke endpoint untuk receiving officer dan proses inbound.

Tidak fokus ke:
- vendor create shipment endpoint
- manager dashboard analytics
- admin CRUD

## Recommended API Sections

Endpoint dibagi menjadi:

1. warehouse-scoped shipment queue
2. receiving session detail
3. scan QR
4. verify box
5. finalize receiving
6. recount / reopen context

## 1. Warehouse-Scoped Receiving Queue

### `GET /api/receiving/queue`

Purpose:
- menampilkan shipment yang relevan untuk gudang user Epson

Backend behavior:
- filter by authenticated user `warehouse_scope`
- jangan tampilkan shipment `draft`
- hanya tampilkan shipment yang receivable

Recommended query params:
- `status=ready|in_progress|issue`
- `warehouse_id` optional for multi-warehouse manager-like roles

Recommended response:

```json
{
  "success": true,
  "data": [
    {
      "ID_outbound": 101,
      "shipment_reference": "DO-2026-0001",
      "vendor": {
        "ID_vendor": 5,
        "nama_vendor": "Vendor A"
      },
      "warehouse": {
        "ID_gudang": 2,
        "nama_gudang": "Gudang Transit B"
      },
      "shipment_status": "arrived",
      "receiving_status": "waiting_scan",
      "progress": {
        "expected_boxes": 10,
        "scanned_boxes": 3,
        "verified_boxes": 2,
        "issue_boxes": 1
      },
      "active_receiving": true,
      "updated_at": "2026-06-03T10:00:00Z"
    }
  ]
}
```

## Recommended queue buckets

Derived queue buckets:
- `ready`
- `in_progress`
- `issue`

These are UI buckets only, not necessarily persisted statuses.

## 2. Receiving Detail

### `GET /api/receiving/{outboundId}`

Purpose:
- membuka detail shipment yang sedang diproses receiving
- mengembalikan ringkasan shipment dan progress box

Recommended response:

```json
{
  "success": true,
  "data": {
    "shipment": {
      "ID_outbound": 101,
      "shipment_reference": "DO-2026-0001",
      "shipment_status": "verifying",
      "warehouse": {
        "ID_gudang": 2,
        "nama_gudang": "Gudang Transit B"
      },
      "vendor": {
        "ID_vendor": 5,
        "nama_vendor": "Vendor A"
      }
    },
    "receiving": {
      "ID_inbound": 201,
      "receiving_status": "verification_in_progress",
      "progress": {
        "expected_boxes": 10,
        "scanned_boxes": 3,
        "verified_boxes": 2,
        "issue_boxes": 1,
        "remaining_boxes": 7
      }
    },
    "last_box": {
      "ID_outbound_box": 3002,
      "box_code": "BOX-101-002",
      "box_status": "verified"
    }
  }
}
```

## Why this endpoint is useful

FE mobile dapat:
- membuka shipment aktif
- restore context setelah refresh
- menampilkan progress tanpa query tambahan terlalu banyak

## 3. Scan QR Box

### `POST /api/receiving/scan-box`

Purpose:
- menerima hasil scan QR
- validasi QR dan scope gudang
- membuka konteks verifikasi box

Recommended request:

```json
{
  "qr_token": "uuid-3"
}
```

Optional request variant if needed:

```json
{
  "qr_token": "uuid-3",
  "ID_inbound": 201
}
```

## Recommended backend behavior

Backend should:
- resolve `OutboundBox` from `qr_token`
- validate shipment status is receivable
- validate user warehouse scope
- validate box is not already finalized in a conflicting state
- create or find `Inbound` / receiving context
- mark box as `scanned`
- return expected content and progress

## Recommended scan-box response

```json
{
  "success": true,
  "data": {
    "shipment": {
      "ID_outbound": 101,
      "shipment_reference": "DO-2026-0001",
      "shipment_status": "verifying"
    },
    "receiving": {
      "ID_inbound": 201,
      "receiving_status": "verification_in_progress"
    },
    "box": {
      "ID_outbound_box": 3003,
      "box_code": "BOX-101-003",
      "box_status": "scanned",
      "expected_product": {
        "ID_barang": 10,
        "nama_barang": "Printer Housing Cover",
        "unit": "pcs"
      },
      "expected_qty_in_box": 5
    },
    "progress": {
      "expected_boxes": 10,
      "scanned_boxes": 4,
      "verified_boxes": 2,
      "issue_boxes": 1,
      "remaining_boxes": 6
    }
  }
}
```

## Recommended scan-box error reasons

Minimum clear error reasons:
- `invalid_qr`
- `duplicate_scan`
- `wrong_warehouse`
- `shipment_not_receivable`
- `box_already_verified`
- `shipment_closed`

## 4. Verify Box

### `POST /api/receiving/verify-box`

Purpose:
- submit hasil verifikasi satu box

Recommended request:

```json
{
  "ID_outbound_box": 3003,
  "actual_qty": 5,
  "condition_status": "normal",
  "notes": "",
  "photo_ids": []
}
```

Alternative request:

```json
{
  "qr_token": "uuid-3",
  "actual_qty": 5,
  "condition_status": "normal",
  "notes": "",
  "photo_ids": []
}
```

## Recommended backend behavior

Backend should:
- validate user scope
- validate box already scanned or can be verified
- compare `actual_qty` vs `expected_qty_in_box`
- update box status
- update inbound progress
- update or aggregate into `InboundDetail`
- return verification result

## Recommended verify-box response

```json
{
  "success": true,
  "data": {
    "box": {
      "ID_outbound_box": 3003,
      "box_code": "BOX-101-003",
      "expected_qty_in_box": 5,
      "actual_qty": 5,
      "condition_status": "normal",
      "box_status": "verified"
    },
    "verification_result": {
      "comparison_status": "match",
      "issue_flagged": false
    },
    "receiving": {
      "ID_inbound": 201,
      "receiving_status": "verification_in_progress"
    },
    "progress": {
      "expected_boxes": 10,
      "scanned_boxes": 4,
      "verified_boxes": 3,
      "issue_boxes": 1,
      "remaining_boxes": 6
    },
    "shipment_status": "verifying"
  }
}
```

## Recommended verify-box error reasons

Minimum reasons:
- `box_not_found`
- `box_not_scanned`
- `box_already_verified`
- `invalid_quantity`
- `wrong_warehouse`
- `shipment_closed`

## 5. Finalize Receiving

### `POST /api/receiving/{inboundId}/finalize`

Purpose:
- menutup receiving session
- menentukan unresolved missing
- generate or update discrepancies
- menentukan shipment outcome

## Recommended backend behavior

Backend should:
- validate user allowed to finalize
- validate receiving session still active
- examine all expected boxes for shipment / inbound
- determine final `missing`
- aggregate values into `InboundDetail`
- generate discrepancy rows
- set:
  - `receiving_status`
  - `shipment_status`

## Recommended finalize response

```json
{
  "success": true,
  "data": {
    "ID_inbound": 201,
    "receiving_status": "discrepancy_found",
    "shipment_status": "discrepancy",
    "summary": {
      "expected_boxes": 10,
      "scanned_boxes": 10,
      "verified_boxes": 10,
      "issue_boxes": 2,
      "discrepancy_rows_created": 2
    }
  }
}
```

## Recommended success outcomes

If no issue:
- `receiving_status = verified`
- `shipment_status = verified` or directly `completed` based on final model

If issue exists:
- `receiving_status = discrepancy_found`
- `shipment_status = discrepancy`

## Recommended finalize error reasons

Minimum reasons:
- `receiving_not_found`
- `receiving_already_finalized`
- `unverified_boxes_remaining`
- `wrong_warehouse`

## Recommendation on finalize strictness

Ada dua model:

### Strict

Finalize ditolak jika masih ada box unresolved.

### Guided strict

Finalize boleh, tetapi backend otomatis treat unresolved expected boxes sebagai candidate `missing`.

Rekomendasiku:
- untuk MVP, pilih `strict`
- lebih aman
- lebih sedikit edge case

## 6. Recount / Reopen Context

### `POST /api/receiving/recount`

Purpose:
- membuka kembali konteks verify untuk issue yang diminta manager recount

Recommended request:

```json
{
  "ID_discrepancy": 501
}
```

Optional future fields:
- `ID_outbound_box`
- `target_scope`

## Recommended backend behavior

Backend should:
- validate discrepancy exists
- validate latest action is `recount`
- resolve target receiving context
- reopen only relevant box/detail if possible

## Recommended recount response

```json
{
  "success": true,
  "data": {
    "ID_inbound": 201,
    "shipment_status": "discrepancy",
    "receiving_status": "verification_in_progress",
    "recount_target": {
      "ID_outbound_box": 3002,
      "box_code": "BOX-101-002"
    }
  }
}
```

## Recommended Supporting Endpoint

### `GET /api/receiving/{inboundId}/boxes`

Purpose:
- optional helper endpoint untuk FE jika butuh daftar box dengan status

Recommended response:

```json
{
  "success": true,
  "data": [
    {
      "ID_outbound_box": 3001,
      "box_code": "BOX-101-001",
      "box_status": "verified",
      "expected_qty_in_box": 10,
      "actual_qty": 10
    },
    {
      "ID_outbound_box": 3002,
      "box_code": "BOX-101-002",
      "box_status": "issue_flagged",
      "expected_qty_in_box": 10,
      "actual_qty": 8
    }
  ]
}
```

## Recommended Minimal Endpoint Set

Kalau mau paling fokus untuk MVP:
- `GET /api/receiving/queue`
- `GET /api/receiving/{outboundId}`
- `POST /api/receiving/scan-box`
- `POST /api/receiving/verify-box`
- `POST /api/receiving/{inboundId}/finalize`
- optional `POST /api/receiving/recount`

## Recommended Source of Truth by Endpoint

### Queue

Derived from:
- shipment status
- receiving status
- box progress

### Scan

Writes to:
- `OutboundBox`
- receiving/inbound session context

### Verify

Writes to:
- `OutboundBox`
- `InboundDetail` aggregate or verification record

### Finalize

Writes to:
- `Inbound`
- `Discrepancy`
- `Shipment`

### Recount

Writes to:
- receiving context state
- relevant box/detail target status if needed

## Open Questions To Lock

Masih perlu diputuskan:

1. apakah `GET /api/receiving/{outboundId}` atau `{inboundId}` lebih cocok untuk primary detail route
2. apakah verify endpoint harus pakai `ID_outbound_box` atau cukup `qr_token`
3. apakah `InboundDetail` cukup dipakai untuk agregasi atau perlu verification record table
4. apakah recount reopen hanya 1 box atau 1 detail
5. apakah finalize strict atau guided strict

## Recommendation

Untuk backend session:
- setujui minimal endpoint set
- setujui scan dan verify sebagai endpoint terpisah
- setujui finalize sebagai titik penentu `missing`
- setujui queue selalu warehouse-scoped
