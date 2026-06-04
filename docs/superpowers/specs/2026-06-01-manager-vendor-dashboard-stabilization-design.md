# Manager and Vendor Dashboard Stabilization Design

Date: 2026-06-01
Scope: Vendor dashboard and Manager dashboard only
Status: Draft for review

## Goal

Stabilize the manager and vendor dashboard experience so that:

- shipment counts are aligned between both roles
- outbound schedule validation is enforced clearly in the UI and on the backend contract
- QR access and QR download are reliable for vendor users
- manager and vendor dashboards become informative operational dashboards instead of static KPI strips

This design covers frontend structure, shared dashboard logic, backend dependencies, and rollout order. It does not redesign the scan officer or admin dashboards except where their data affects manager or vendor views.

## Problem Summary

The current dashboards have three linked problems:

1. The same business concepts are derived in different ways across pages, so shipment counts can drift.
2. Important workflows such as outbound date validation and QR access are only partially enforced in the frontend.
3. The dashboard surfaces are mostly KPI cards and tables, so they do not provide enough operational context for managers or vendors.

## Design Principles

- One status mapping for all shipment KPIs, filters, and charts.
- One clear distinction between shipment summary data and discrepancy workflow data.
- Fast first render for critical data, with secondary panels loading independently.
- Keep frontend logic conservative and compatible with current backend APIs.
- Explicitly classify backend requirements so frontend work does not guess at domain rules.

## Shared Dashboard Data Model

### Shipment source of truth

`/api/outbound` remains the source for shipment records in both dashboards.

- Vendor dashboard reads scoped outbound records for the current vendor only.
- Manager dashboard reads the global outbound dataset relevant to manager users.

### Discrepancy source of truth

`/api/discrepancy` is used for discrepancy workflow, queue management, and discrepancy-focused analytics.

It is not used to replace shipment totals. Shipment KPI counts remain derived from shipment status after normalization.

### Canonical shipment buckets

Frontend will normalize shipment status into the following buckets:

- `draft`: `draft`
- `shipping`: `submitted`, `in_transit`, `shipping`
- `delivered`: `arrived`, `verified`, `delivered`
- `discrepancy`: `discrepancy`
- `other`: any unmapped status

All of the following must use the same mapping:

- top KPI cards
- shipment table filters
- chart datasets
- exported dashboard summaries

### Semantic distinction

Manager views must distinguish two separate concepts:

- `Shipment Discrepancy`: shipments whose shipment status resolves to the discrepancy bucket
- `Pending Discrepancy Review`: unresolved discrepancy records from `/api/discrepancy`

These values may differ. The UI must label them clearly so users do not assume they are the same metric.

## Vendor Dashboard Design

### Primary user goals

- create outbound shipments safely
- monitor shipment state clearly
- access QR codes and QR tokens reliably
- notice discrepancy or R1 report events quickly

### Main sections

#### 1. Summary row

Clickable KPI cards:

- Total Shipments
- Shipping
- Delivered
- Discrepancy

Clicking a KPI card opens the shipment list with the matching active filter.

#### 2. Visual overview

Add:

- shipment status distribution chart
- recent shipment activity timeline
- upcoming dispatch and expected arrival schedule snapshot

#### 3. Outbound workflow panel

The create shipment flow keeps the existing form but adds inline field feedback for:

- dispatch date required
- expected arrival required
- expected arrival must be the same as or later than dispatch date

Client validation stays in place for immediate feedback. Server validation remains mandatory.

#### 4. QR workflow panel

The vendor must be able to identify which shipments already have QR available.

Rules:

- QR entry points should be available for all business-relevant statuses where QR remains usable, not only one narrow state unless backend rules require that restriction.
- QR modal shows product name, outbound detail id, and token value.
- QR download remains PNG and includes text label content below the code.
- QR error states are separated into:
  - token not generated
  - endpoint failed
  - empty payload
  - browser render/download failure

#### 5. Notification and exception area

Add a compact panel or summary for:

- discrepancy alerts
- R1 document alerts
- quick links to the affected shipment or report

## Manager Dashboard Design

### Primary user goals

- monitor shipment flow at a glance
- identify operational bottlenecks quickly
- act on discrepancy review items
- compare vendor performance without opening multiple sections

### Main sections

#### 1. Summary row

Clickable KPI cards:

- Total Shipments
- Shipping
- Delivered
- Shipment Discrepancy

Each card applies a shipment filter to the shipment drilldown section.

#### 2. Operational charts

Minimum dashboard visuals:

- shipment status distribution chart
- discrepancy breakdown chart using discrepancy statuses
- recent trend chart for shipment or discrepancy activity by day

Trend data may be derived client-side initially from current list APIs if dedicated dashboard aggregates are not yet available.

#### 3. Actionable operational panels

Add dedicated panels for:

- Pending Discrepancy Review
- Recent Verification Outcomes
- Vendor Performance Snapshot

The intent is that a manager can both observe and act from the dashboard without treating it as a passive report.

#### 4. Shipment drilldown

Keep a shipment table below the dashboard summary with real filters:

- active status filter from KPI selection
- vendor filter
- status filter
- direct actions for shipment detail and discrepancy review

Remove purely decorative controls. Every visible filter must drive data or view state.

## Loading and Error Handling

### Loading strategy

Split data into:

- critical data:
  - shipments
  - manager discrepancy queue summary
- secondary data:
  - notifications
  - vendor performance
  - reports
  - product options
  - secondary charts

The page shell should render immediately. Critical sections can show local skeletons. Secondary sections should not block the first useful paint.

### Error strategy

Replace broad reliance on `alert()` with contextual states where possible:

- shipment table load failure shown in the shipment area
- chart load failure shown in the chart panel
- QR failures shown inside the QR modal state
- field validation errors shown inline in the outbound form

Blocking submit failures may still use a toast or alert, but field-level issues should stay visible on the form.

## Backend Requirements

### Required backend work

- enforce `dispatch date` not null
- enforce `expected arrival` not null
- enforce `expected arrival >= dispatch date`
- guarantee vendor scoping on outbound list and detail APIs
- define canonical shipment statuses and return them consistently
- make `/api/outbound/{id}/qr-token` response shape consistent
- decide whether QR is available immediately on submit and keep that rule stable
- define whether discrepancy dashboard metrics are shipment-status-based or discrepancy-record-based

### Optional but strongly recommended backend work

- aggregated dashboard endpoints for manager and vendor
- trend endpoints by date
- vendor performance aggregates
- SLA or aging aggregates

## Frontend Architecture Changes

### Shared logic

Expand the shared dashboard utility layer to contain:

- status normalization
- shipment bucket counts
- shipment filtering by bucket
- chart dataset builders
- outbound schedule validation helpers
- QR label builders and QR payload normalization

This shared layer must be used by both manager and vendor dashboards.

### Vendor page refactor

- move current KPI and shipment filtering onto shared helpers
- add chart and activity sections
- improve QR availability handling
- add inline schedule validation UI
- reduce full-page blocking during startup

### Manager page refactor

- move KPI and shipment filtering onto shared helpers
- add real filter state
- add actionable dashboard panels
- add chart sections
- keep discrepancy queue logic separate but clearly labeled

## Verification Plan

At minimum verify:

- vendor and manager shipment counts use the same bucket logic
- KPI card clicks update the downstream filtered views correctly
- invalid outbound schedule cannot be submitted from the UI
- backend validation failures map cleanly into frontend errors
- QR download output includes the QR code plus descriptive label text
- manager discrepancy queue and shipment discrepancy summary are both correct and clearly distinguished

## Delivery Order

1. Stabilize shared shipment status and count logic
2. Stabilize outbound validation and QR workflow in vendor dashboard
3. Refactor manager dashboard into an operational dashboard
4. Refactor vendor dashboard into an operational dashboard
5. Align with backend audit outcomes and adjust contracts if needed

## Assumptions

- Existing backend endpoints remain available during the first frontend pass.
- Current frontend can continue deriving chart datasets client-side until backend aggregate endpoints exist.
- Backend session will provide final guidance on status canon, scoping guarantees, and QR readiness rules before implementation is finalized.
