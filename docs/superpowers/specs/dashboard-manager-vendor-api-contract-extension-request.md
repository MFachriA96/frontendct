# Dashboard Manager/Vendor API Contract Extension Request

Last updated: 2026-06-01

## Context

This document is an addendum request for backend after reviewing the current API contract in:

- `docs/superpowers/specs/dashboard-manager-vendor-api-contract.md`

The current backend contract is already strong enough for:

- canonical shipment status
- discrepancy counting rules
- QR readiness
- base overview endpoint for manager/vendor
- click-through list endpoints

However, it is still not sufficient to support a manager/vendor dashboard that fully answers the Epson problem statement below.

## Business Problem Reference

PT. Indonesia Epson Industry  
Topik A.1: Sistem Verifikasi Pengiriman dan Penerimaan Barang

Main problems:

1. discrepancy (`match` / `mismatch` / `missing` / `over`) is often detected too late
2. there is no strong digital evidence (`photo`, `timestamp`, `location`) for audit and claims
3. follow-up actions (`approve` / `hold` / `return` / `recount`) are not structured and are slow
4. there is no dashboard for monitoring discrepancy by `vendor` / `date` / `line` / `part type`
5. losses and discrepancy-related costs are hard to reduce because analytics are still weak

## Backend Follow-up Goal

The frontend team needs backend to evaluate whether the current contract should be extended for `vendor` and `manager` dashboards.

The goal of this backend follow-up is:

1. decide whether the current contract needs extension
2. define the recommended extension contract if needed
3. implement the additional fields/endpoints if feasible
4. clearly classify which requested analytics are blocked by domain/data limitations

## Why This Matters

The frontend can already continue basic stabilization using the current contract:

- align counts
- use canonical shipment buckets
- use `qr_ready`
- fix manager/vendor click-through logic

But the frontend should delay full dashboard redesign until the backend analytics contract is final, otherwise the frontend will likely be rebuilt twice.

## Requested Backend Extension

### A. Vendor dashboard analytics

The vendor dashboard should not only show shipment counts. It should help vendors answer:

- how is my shipment quality performing?
- which shipments need action now?
- which parts cause the most discrepancy?
- which line sees the most discrepancy?
- is there schedule risk?
- is digital audit evidence available?

Backend is requested to consider extending `GET /api/dashboard/vendor-overview` or provide equivalent dedicated analytics endpoints.

#### 1. `trend_by_date`

Suggested shape:

```json
{
  "trend_by_date": [
    {
      "date": "2026-06-01",
      "shipments_total": 10,
      "shipments_verified": 7,
      "shipments_with_discrepancy": 2,
      "discrepancy_rows": 4
    }
  ]
}
```

Purpose:

- line chart for shipment/discrepancy trend by date
- detect whether shipment quality is improving or degrading

#### 2. `discrepancy_by_part`

Suggested shape:

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

Purpose:

- identify top problematic parts
- directly supports Epson requirement for monitoring by part type

#### 3. `discrepancy_by_line`

If line data exists in the domain.

Suggested shape:

```json
{
  "discrepancy_by_line": [
    {
      "line_id": "LINE-A",
      "line_name": "Line A",
      "mismatch": 3,
      "missing": 1,
      "over": 0,
      "total_non_match": 4
    }
  ]
}
```

Purpose:

- directly supports Epson requirement for monitoring by line

#### 4. `schedule_risk`

Suggested shape:

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

Purpose:

- turn shipment schedule into operational risk monitoring
- help vendor see what is urgent today

#### 5. `action_queue`

Suggested shape:

```json
{
  "action_queue": {
    "draft_pending_submit": 2,
    "submitted_qr_not_ready": 1,
    "pending_discrepancy_review": 3,
    "awaiting_vendor_response": 2
  }
}
```

Purpose:

- show vendors what they must act on immediately

Notes:

- if `awaiting_vendor_response` does not exist in the current domain model, backend should explicitly say so
- if another current state is the closest available proxy, backend should recommend it

#### 6. `audit_evidence_summary`

Suggested shape:

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

Purpose:

- support Epson requirement for photo/timestamp/location evidence
- support dashboard-level audit readiness visibility

If summary only is not enough, backend should also explain whether separate click-through endpoints or extra shipment/inbound detail fields are needed.

### B. Manager dashboard analytics

Manager dashboard should also move beyond raw shipment counts.

Backend is requested to consider adding:

#### 1. `trend_by_date`

Suggested shape:

```json
{
  "trend_by_date": [
    {
      "date": "2026-06-01",
      "shipments_total": 20,
      "shipments_verified": 14,
      "shipments_with_discrepancy": 4,
      "pending_review": 3
    }
  ]
}
```

#### 2. `discrepancy_by_vendor`

Suggested shape:

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

#### 3. `discrepancy_by_part`

#### 4. `discrepancy_by_line`

Purpose:

- help manager identify the largest problem sources
- expose which vendors, parts, or lines need attention first

## Explicit Backend Questions

Backend is requested to answer these directly:

### 1. Is `line` data actually available?

- if yes, in which entity and which field?
- if no, say clearly that monitoring “per line” cannot be fulfilled yet without data model or process changes

### 2. Is audit evidence actually available?

Please classify availability for:

- photo
- timestamp
- location

Also explain:

- which entity stores it
- whether it is captured from inbound scan, manual verification, or another process

### 3. Does `awaiting_vendor_response` really exist in the current model?

- if yes, define the exact source and rule
- if no, classify it as a domain gap instead of forcing a pseudo-status

### 4. What should `trend_by_date` use as the default date basis?

Backend should explicitly choose and justify the default basis per metric:

- shipment creation date
- dispatch date
- arrival date
- verification date

## Requested Backend Output

Backend follow-up should return:

1. whether the current contract needs extension (`yes` / `no`)
2. if yes, the recommended final extension contract
3. which new fields/endpoints can be implemented now
4. which requested fields are blocked by missing data/domain support
5. frontend impact:
   - what is already safe to implement now
   - what should wait for backend completion

## Important Note For Backend

Frontend will continue basic alignment work using the current contract, but the full dashboard redesign for `manager` and `vendor` should wait until this analytics extension is finalized.

Please be explicit and pragmatic. If any requirement cannot be supported by the current backend domain or data model, say so directly.
