# Dashboard Manager/Vendor API Contract Extension Decision

Last updated: 2026-06-01

## Decision Summary

### A. Is the extension contract approved?

Binary answer:

- `No` for the full extension package as a final redesign-ready contract

Reason:

- several requested analytics are not yet implemented in backend
- some requested analytics are only partially supported by the current data model
- two requested concepts are not valid current-domain states:
  - `discrepancy_by_line`
  - `awaiting_vendor_response`

Practical answer:

- `Yes` for partial extension feasibility
- `No` for full final approval today

Frontend may continue with the current basic integration contract, but should still delay full redesign that depends on the analytics extension below.

## B. Approved Subset: What Can Be Supported By Current Domain

The following items are supportable by the current model, but are not all implemented yet as API fields.

Recommended endpoint grouping if implemented next:

- `GET /api/dashboard/manager-analytics`
- `GET /api/dashboard/vendor-analytics`

Alternative:

- extend current `manager-overview` and `vendor-overview`

Recommended fields that are valid with current domain:

### 1. `discrepancy_by_part`

Support status:

- `Supported by current model`

Reason:

- discrepancy links to `outbound_detail`
- `outbound_detail` links to `barang`

Recommended shape:

```json
{
  "discrepancy_by_part": [
    {
      "part_id": 10,
      "part_name": "Printer Housing Cover",
      "mismatch": 2,
      "missing": 1,
      "over": 0,
      "total_non_match": 3
    }
  ]
}
```

### 2. `discrepancy_by_vendor`

Support status:

- `Supported by current model`

Reason:

- already derivable from `outbound -> vendor`
- current `vendor-performance` is already close, but should return numeric rate if used as analytics

Recommended shape:

```json
{
  "discrepancy_by_vendor": [
    {
      "vendor_id": 5,
      "vendor_name": "Vendor A",
      "total_shipments": 10,
      "shipments_with_discrepancy": 3,
      "discrepancy_rate": 0.3
    }
  ]
}
```

### 3. `schedule_risk`

Support status:

- `Supported with current model`

Safe fields:

- `dispatch_today` from `tabel_outbound.waktu_kirim`
- `arrival_today` from `tabel_outbound.estimasi_tiba`
- `overdue_shipping` from `estimasi_tiba < now` and status in `submitted|in_transit`
- `arrived_awaiting_verification` from `tabel_outbound.status = arrived`
- `missing_schedule_data` from null date fields in legacy data if present

Recommended shape:

```json
{
  "schedule_risk": {
    "dispatch_today": 2,
    "arrival_today": 3,
    "overdue_shipping": 1,
    "arrived_awaiting_verification": 2,
    "missing_schedule_data": 0
  }
}
```

### 4. `action_queue`

Support status:

- `Partially supported`

Safe fields:

- `draft_pending_submit`
- `submitted_qr_not_ready`
- `pending_discrepancy_review`

Not safe:

- `awaiting_vendor_response`

Recommended currently valid shape:

```json
{
  "action_queue": {
    "draft_pending_submit": 2,
    "submitted_qr_not_ready": 1,
    "pending_discrepancy_review": 3
  }
}
```

### 5. `audit_evidence_summary`

Support status:

- `Partially supported`

What is available now:

- photo evidence:
  - entity: `tabel_foto`
  - sources:
    - scan session upload
    - manual verification photo upload
- timestamp evidence:
  - entities:
    - `tabel_foto.timestamp`
    - `tabel_inbound.timestamp_terima`
    - `tabel_discrepancy.detected_at`
    - `tabel_discrepancy_action.action_time`
- location evidence:
  - entities:
    - `tabel_inbound.lokasi_terakhir`
    - `tabel_outbound.lokasi_asal`
    - `tabel_gudang.lokasi_gudang`
    - `tabel_gudang.kode_area`

Important limitation:

- current model does not store GPS/geotag location tied to the photo itself
- current model stores receiving/location context, not strong geospatial proof

Recommended shape if implemented:

```json
{
  "audit_evidence_summary": {
    "shipments_with_photo": 8,
    "shipments_without_photo": 2,
    "shipments_with_location": 7,
    "shipments_with_timestamp": 10
  }
}
```

### 6. `trend_by_date`

Support status:

- `Partially supported`

Important constraint:

- current model does not store `verified_at`
- current model does not store a separate shipment status history timeline

Therefore:

- trend can be built by a chosen date basis
- but it cannot represent true historical verification transition timing

Recommended default date basis:

- shipment trend: `waktu_kirim` (`dispatch_date`)
- discrepancy trend: `detected_at`

If implemented, fields should be explicitly defined as dispatch-date buckets, for example:

```json
{
  "trend_by_date": [
    {
      "date": "2026-06-01",
      "shipments_total": 10,
      "shipments_currently_verified": 7,
      "shipments_with_discrepancy": 2,
      "discrepancy_rows": 4
    }
  ],
  "date_basis": "dispatch_date"
}
```

Do not label this as verification-date trend unless the model gains real verification timestamps.

## C. What Cannot Be Supported Cleanly By Current Domain

### 1. `discrepancy_by_line`

Decision:

- `Not supported by current domain`

Reason:

- there is no `line` entity or `line_id` field in current shipment/inbound/discrepancy domain
- the closest existing field is `gudang.kode_area`, but that is warehouse/receiving area, not production line

Backend recommendation:

- do not fake `line` using `kode_area`
- treat this as a real domain/data gap

### 2. `awaiting_vendor_response`

Decision:

- `Not supported by current domain`

Reason:

- there is no canonical state or field representing vendor response SLA/waiting status
- `dokumen_r1.status_dokumen` exists, but it is not equivalent to a general dashboard state named `awaiting_vendor_response`

Backend recommendation:

- do not force a pseudo-status
- if business wants this, a real domain rule and state source must be added first

### 3. Strong audit proof at photo-level location

Decision:

- `Not fully supported`

Reason:

- photo exists
- timestamp exists
- shipment/inbound location context exists
- but photo-specific location/geotag proof does not exist

## D. FE Guidance: Safe Now vs Delay

### Safe for FE now

Already implemented and safe:

- `GET /api/dashboard/manager-overview`
- `GET /api/dashboard/vendor-overview`
- `GET /api/dashboard/summary`
- `GET /api/outbound?status_bucket=...`
- `GET /api/outbound?has_discrepancy=...`
- `GET /api/discrepancy?pending_review=...`
- `GET /api/outbound/{id}/qr-token`

Safe concepts already available:

- canonical shipment buckets
- shipment/discrepancy count alignment
- QR readiness
- click-through list behavior
- vendor scoping
- manager/vendor overview base widgets

### FE should wait

Wait until backend explicitly implements analytics endpoints/fields for:

- `trend_by_date`
- `discrepancy_by_part`
- `discrepancy_by_vendor` as dashboard analytics payload
- `schedule_risk`
- `action_queue`
- `audit_evidence_summary`

Wait completely for domain change:

- `discrepancy_by_line`
- `awaiting_vendor_response`

## Explicit Answers To FE Questions

### 1. Is `line` data available?

- `No`

Closest current fields:

- `tabel_gudang.kode_area`
- `tabel_gudang.lokasi_gudang`

These are not equivalent to production line.

### 2. Is audit evidence available?

- `Photo`: yes, partial
- `Timestamp`: yes
- `Location`: yes, partial

Stored in:

- photo:
  - `tabel_foto`
- timestamp:
  - `tabel_foto.timestamp`
  - `tabel_inbound.timestamp_terima`
  - discrepancy/action timestamps
- location:
  - `tabel_inbound.lokasi_terakhir`
  - `tabel_outbound.lokasi_asal`
  - `tabel_gudang`

### 3. Does `awaiting_vendor_response` exist?

- `No`

### 4. What should `trend_by_date` use as default date basis?

Recommended:

- default `dispatch_date` based on `tabel_outbound.waktu_kirim`

Reason:

- it is the cleanest stable shipment date in current model
- there is no `verified_at`
- there is no status history table

## Implementation Recommendation

If backend continues this extension work, the next step should be:

1. implement `manager-analytics` and `vendor-analytics`
2. include only currently valid analytics first:
   - `discrepancy_by_part`
   - `discrepancy_by_vendor`
   - `schedule_risk`
   - `action_queue` without `awaiting_vendor_response`
   - `audit_evidence_summary`
   - `trend_by_date` with explicit `date_basis`
3. leave `discrepancy_by_line` and `awaiting_vendor_response` as blocked until domain changes
