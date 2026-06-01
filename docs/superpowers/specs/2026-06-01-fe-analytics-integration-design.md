# FE Analytics Integration Design

Date: 2026-06-01
Branch: `alfi/continue`
Scope: Manager dashboard Analytics panel + new Vendor dashboard Analytics panel
Status: Draft for review

## Goal

Consume the two new backend analytics endpoints in the frontend:

- `GET /api/dashboard/manager-analytics` (role: manager | admin)
- `GET /api/dashboard/vendor-analytics` (role: vendor, auto-scoped)

Replace the current Manager Analytics sidebar (which only renders a `vendor_performance` table from `manager-overview`) with a full operational analytics panel, and add a brand-new Analytics panel to the Vendor dashboard (which has none today).

Source handoff: `docs/superpowers/specs/fe-session-analytics-handoff.md`
Builds on: `docs/superpowers/specs/2026-06-01-manager-vendor-dashboard-stabilization-design.md` (which pre-flagged aggregated + trend endpoints as recommended backend work — now delivered).

## Endpoints and Response Shape

### Manager analytics

```
GET /api/dashboard/manager-analytics
Authorization: Bearer <token>   (role: manager | admin)
?vendor_id=<id>   (optional, filter to one vendor)
```

`data` sections: `role_scope`, `generated_at`, `date_basis`, `discrepancy_by_part[]`, `discrepancy_by_vendor[]`, `schedule_risk{}`, `action_queue{}`, `audit_evidence_summary{}`, `trend_by_date[]`.

### Vendor analytics

```
GET /api/dashboard/vendor-analytics
Authorization: Bearer <token>   (role: vendor)
```

Same shape **minus** `discrepancy_by_vendor`. Auto-scoped to the vendor's own user.

### Field rules to honor (from handoff)

- `discrepancy_rate`: float `0`–`1`, not a percent string. Existing `formatRate` already multiplies by 100, so reuse it.
- `trend_by_date`: ordered DESC (newest first), max 30 points. `date_basis: "dispatch_date"` — bucket is from `waktu_kirim`, **not** verified date. `shipments_currently_verified` = how many in that bucket are currently verified (not when verified). Label the chart accordingly.
- `action_queue`: `submitted_qr_not_ready` = non-draft shipment with a detail whose QR token is not generated. `awaiting_vendor_response` does **not** exist — do not render it.
- `audit_evidence_summary`: `shipments_without_photo` = received (inbound exists) but no photo. Photo = `tabel_foto`. Location proof is partial (warehouse context, not GPS). Label photo and location as **partial**.

## Non-goals (explicit, per handoff)

- No `discrepancy_by_line` UI — no `line` entity exists in the domain.
- No `awaiting_vendor_response` field — no canonical state for it.
- No GPS / geotag claim in the audit evidence UI.

## Data Flow

Analytics is **secondary** data (per stabilization design loading strategy). It must not block the dashboard's first useful paint.

- Fetch is **lazy**: triggered when the user opens the **Analytics** sidebar section, not on initial dashboard load.
- The analytics panel owns its own `analyticsLoading` and `analyticsError` state, scoped to the panel (contextual error per stabilization design — no broad `alert()`).
- Manager fetch accepts an optional `vendor_id` from a vendor filter dropdown; changing the dropdown re-fetches.
- Vendor fetch takes no params (backend auto-scopes).
- Use `axios` with the bearer token, consistent with existing dashboard fetch code.
- A simple "already fetched" guard avoids redundant refetch when re-opening the panel (refetch still happens when the manager vendor filter changes).

## Shared Logic (`src/utils/dashboardLogic.js`) + Tests

New pure functions, all defensive against a partial/empty response (the endpoint may omit sections):

- `normalizeAnalyticsResponse(payload)` → returns a safe object with all sections present: arrays default to `[]`, the `schedule_risk` / `action_queue` / `audit_evidence_summary` objects default to fully-zeroed shapes, scalars default to sensible values. Accepts either the raw axios `data` or `data.data`.
- `buildTrendChartData(trendByDate)` → reverses DESC→ASC so the time axis reads left-to-right oldest→newest, returns a chart.js-ready `{ labels, datasets }` with three series: `shipments_total`, `shipments_currently_verified`, `shipments_with_discrepancy`. Empty input → empty labels/datasets.
- `buildDiscrepancyByPartRows(discrepancyByPart)` → returns rows sorted by `total_non_match` descending (stable for ties).
- `summarizeAuditEvidence(auditEvidenceSummary)` → derives photo coverage % and location coverage % (guard divide-by-zero), returns counts plus a `partial: true` marker for photo and location so the UI can label them.

Existing reused helpers: `formatRate` (rate display), `formatDateTime` (timestamps), `normalizeStatus`.

Unit tests added under `tests/` following the existing `dashboardLogic.test.mjs` pattern (node test runner / `.mjs`). Cover: empty/partial input defaults, trend reversal + 3-series mapping, part sorting, audit % math incl. divide-by-zero.

## Manager Analytics Panel

Replaces the body of `activeSidebar === 'analytics'` in `ManagerDashboard.jsx`. Sections top-to-bottom:

1. **Header + vendor filter** — title, "generated at" timestamp, vendor dropdown (`All vendors` + each vendor; selection drives `?vendor_id=`).
2. **Signal cards** — small cards combining `schedule_risk` (dispatch_today, arrival_today, overdue_shipping, arrived_awaiting_verification, missing_schedule_data) and `action_queue` (draft_pending_submit, submitted_qr_not_ready, pending_discrepancy_review). Reuse existing `section-summary-card` / `queue-signal-item` styling.
3. **Trend chart** — chart.js `Line` via `react-chartjs-2`, fed by `buildTrendChartData`. Subtitle: "By dispatch date · latest 30 points".
4. **Discrepancy by Part** — table (Part, Mismatch, Missing, Over, Total) using `buildDiscrepancyByPartRows`; the Total column may carry a small inline bar for visual weight.
5. **Vendor Performance** — `discrepancy_by_vendor` table (Vendor, Total Shipments, Shipments w/ Discrepancy, Rate via `formatRate`, performance label). This supersedes the current overview-derived table.
6. **Audit Evidence** — counts for photo (with/without), location, timestamp from `summarizeAuditEvidence`; photo and location explicitly labeled **partial**.

Loading: panel-level skeleton/spinner while `analyticsLoading`. Error: inline message inside the panel with a retry affordance. Empty section: per-section empty state, reusing existing `empty-state` / `manager-activity-empty` patterns.

## Vendor Analytics Panel

New work in `VendorDashboard.jsx`:

- Add an **Analytics** entry to the vendor sidebar nav.
- Add `activeSidebar === 'analytics'` panel rendering: signal cards, trend chart, discrepancy by part, audit evidence — i.e. the manager panel **minus** the vendor filter and the Vendor Performance table (`discrepancy_by_vendor` is not in the vendor response).
- Same lazy-fetch, panel-scoped loading/error, and shared util usage as manager.

Styling reuses existing VendorDashboard / shared dashboard CSS classes; add minimal new CSS only where a chart container or grid needs it.

## Charting

Use `chart.js` + `react-chartjs-2` (already in `package.json`, currently unused). Register only the controllers/elements needed (Line + scales + tooltip + legend) to keep bundle lean. A thin local wrapper component (e.g. `AnalyticsTrendChart`) keeps chart.js registration in one place and is shared by both dashboards.

## Verification Plan

- `npm run lint` clean.
- `npm run build` succeeds.
- Unit tests for new util fns pass (node `.mjs` test runner, existing pattern).
- Manual smoke (where backend reachable): open Manager Analytics → sections render, vendor filter re-fetches; open Vendor Analytics → renders without vendor-performance section; both show contextual loading/error, no full-page block.

## Delivery Order

1. Shared util fns + unit tests.
2. Shared `AnalyticsTrendChart` chart.js wrapper.
3. Manager Analytics panel (lazy fetch, vendor filter, 6 sections).
4. Vendor Analytics panel (sidebar entry + panel).
5. Lint + build + test pass.

## Assumptions

- Backend endpoints behave per the handoff; partial responses are tolerated by the normalizer.
- Existing dashboard fetch/auth patterns (axios + localStorage token) remain valid.
- No new chart library beyond the already-installed chart.js stack.
