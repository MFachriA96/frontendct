# Manager and Vendor Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize manager and vendor dashboard counts, QR flow, outbound validation, and upgrade both dashboards into more informative operational views.

**Architecture:** Extend the shared dashboard utility layer first so vendor and manager use the same shipment and discrepancy derivations. Then refactor vendor and manager dashboards to consume the shared helpers, reduce blocking loading behavior, add actionable UI states, and surface lightweight charts built from the existing API payloads.

**Tech Stack:** React 19, Vite, axios, plain CSS, Node test runner

---

### Task 1: Expand shared dashboard utilities and regression tests

**Files:**
- Modify: `src/utils/dashboardLogic.js`
- Modify: `tests/dashboardLogic.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests for:
- QR access status eligibility
- shipment chart segments derived from shared counts
- shipment activity sorting
- upcoming shipment schedule ordering

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dashboardLogic.test.mjs`

Expected: failures for missing shared helper exports

- [ ] **Step 3: Write minimal shared implementation**

Add shared helpers for:
- `canAccessQrForShipment`
- `buildShipmentChartSegments`
- `buildRecentShipmentActivity`
- `getUpcomingShipmentSchedule`
- `getDiscrepancyStatusCounts`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dashboardLogic.test.mjs`

Expected: PASS

### Task 2: Stabilize vendor workflow and make vendor dashboard more informative

**Files:**
- Modify: `src/pages/VendorDashboard.jsx`
- Modify: `src/pages/VendorDashboard.css`
- Test: `tests/dashboardLogic.test.mjs`

- [ ] **Step 1: Add vendor dashboard test coverage via shared logic first**

Ensure Task 1 covers:
- date validation behavior
- QR access behavior for submitted, in transit, arrived, and discrepancy states

- [ ] **Step 2: Run shared tests before editing vendor UI**

Run: `node --test tests/dashboardLogic.test.mjs`

Expected: PASS

- [ ] **Step 3: Refactor vendor dashboard**

Implement:
- split critical and secondary initial loading
- inline outbound schedule validation state
- richer dashboard overview with status chart, activity timeline, and shipment schedule snapshot
- wider QR access eligibility based on shared helper
- contextual QR empty/error messaging

- [ ] **Step 4: Run build verification**

Run: `npm run build`

Expected: build succeeds

### Task 3: Refactor manager dashboard into an operational dashboard

**Files:**
- Modify: `src/pages/ManagerDashboard.jsx`
- Modify: `src/pages/ManagerDashboard.css`
- Modify: `src/utils/dashboardLogic.js`
- Test: `tests/dashboardLogic.test.mjs`

- [ ] **Step 1: Add any missing shared logic tests before manager changes**

If manager needs new pure helpers, add failing tests first in `tests/dashboardLogic.test.mjs`.

- [ ] **Step 2: Run shared tests to verify red state if new helper is added**

Run: `node --test tests/dashboardLogic.test.mjs`

Expected: fail only for the newly added behavior

- [ ] **Step 3: Implement manager dashboard updates**

Implement:
- chart section for shipment distribution and discrepancy breakdown
- actionable summary panels
- real vendor and status filtering in overview
- clearer distinction between shipment discrepancy and pending discrepancy review

- [ ] **Step 4: Run build verification**

Run: `npm run build`

Expected: build succeeds

### Task 4: Final verification

**Files:**
- Modify: `src/pages/VendorDashboard.jsx`
- Modify: `src/pages/VendorDashboard.css`
- Modify: `src/pages/ManagerDashboard.jsx`
- Modify: `src/pages/ManagerDashboard.css`
- Modify: `src/utils/dashboardLogic.js`
- Modify: `tests/dashboardLogic.test.mjs`

- [ ] **Step 1: Run shared tests**

Run: `node --test tests/dashboardLogic.test.mjs`

Expected: PASS

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Run lint for touched area awareness**

Run: `npm run lint`

Expected: known pre-existing lint issues may remain; no new syntax/runtime blocker from touched files
