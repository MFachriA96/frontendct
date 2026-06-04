# Manager/Vendor Dashboard Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the redesigned manager/vendor dashboards in the `frontendct` React + Vite repo using the stabilized backend overview and analytics contracts.

**Architecture:** Build one shared dashboard shell with reusable KPI cards, one reusable hero analytics panel, and compact widget containers. Keep manager/vendor differences in data mapping and widget composition, not in entirely separate layout systems.

**Tech Stack:** React, Vite, existing frontendct UI stack, backend endpoints from `capstonea1`

---

## Prerequisite

This plan assumes the frontend repo `frontendct` is checked out and available locally. The current workspace only contains backend repo `capstonea1`, so execution must happen in the frontend repo.

## Expected Backend Inputs

Dashboard dasar:
- `GET /api/dashboard/manager-overview`
- `GET /api/dashboard/vendor-overview`
- `GET /api/dashboard/summary`

Analytics:
- `GET /api/dashboard/manager-analytics`
- `GET /api/dashboard/vendor-analytics`

Click-through:
- `GET /api/outbound?status_bucket=...`
- `GET /api/outbound?has_discrepancy=...`
- `GET /api/discrepancy?pending_review=1`

## Expected Frontend File Areas

Before editing, inspect these areas in `frontendct` and map them to the actual repo:
- `frontendct/src/pages`
- `frontendct/src/features/dashboard`
- `frontendct/src/components`
- `frontendct/src/services` or `frontendct/src/api`
- `frontendct/src/routes`

If the repo uses different names, keep the same responsibilities but adapt the file paths to local structure.

### Task 1: Verify dashboard entry points and API layer

**Files:**
- Inspect: `frontendct/src/pages/**`
- Inspect: `frontendct/src/features/**`
- Inspect: `frontendct/src/services/**` or `frontendct/src/api/**`
- Inspect: `frontendct/src/routes/**`

- [ ] **Step 1: Find current manager/vendor dashboard screens**

Run:

```bash
cd frontendct
rg -n "manager|vendor|dashboard" src
```

Expected:
- menemukan page/screen dashboard manager
- menemukan page/screen dashboard vendor
- menemukan service fetch untuk `/api/dashboard/*`, `/api/outbound`, `/api/discrepancy`

- [ ] **Step 2: Document the actual file map before editing**

Create a short note in your working scratchpad with:
- exact page component for manager dashboard
- exact page component for vendor dashboard
- exact API service file
- exact shared UI folder for cards/panels/widgets

- [ ] **Step 3: Commit the discovery note to your branch description or issue comment**

```bash
git status
```

Expected:
- no code change yet

### Task 2: Add shared dashboard shell and card primitives

**Files:**
- Create: `frontendct/src/features/dashboard/components/DashboardShell.tsx`
- Create: `frontendct/src/features/dashboard/components/KpiCard.tsx`
- Create: `frontendct/src/features/dashboard/components/HeroAnalyticsPanel.tsx`
- Create: `frontendct/src/features/dashboard/components/CompactWidget.tsx`
- Test: `frontendct/src/features/dashboard/components/__tests__/DashboardShell.test.tsx`

- [ ] **Step 1: Write the failing component test for shared shell rendering**

```tsx
import { render, screen } from "@testing-library/react";
import { DashboardShell } from "../DashboardShell";

describe("DashboardShell", () => {
  it("renders title, hero area, and widgets area", () => {
    render(
      <DashboardShell
        title="Manager Dashboard"
        subtitle="Operational overview"
        topRow={<div>top-row</div>}
        hero={<div>hero-panel</div>}
        side={<div>side-widgets</div>}
        bottom={<div>bottom-widgets</div>}
      />
    );

    expect(screen.getByText("Manager Dashboard")).toBeInTheDocument();
    expect(screen.getByText("top-row")).toBeInTheDocument();
    expect(screen.getByText("hero-panel")).toBeInTheDocument();
    expect(screen.getByText("side-widgets")).toBeInTheDocument();
    expect(screen.getByText("bottom-widgets")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontendct
npm test -- DashboardShell
```

Expected:
- fail because components do not exist yet

- [ ] **Step 3: Write minimal shared components**

```tsx
// DashboardShell.tsx
type DashboardShellProps = {
  title: string;
  subtitle: string;
  topRow: React.ReactNode;
  hero: React.ReactNode;
  side: React.ReactNode;
  bottom: React.ReactNode;
};

export function DashboardShell({
  title,
  subtitle,
  topRow,
  hero,
  side,
  bottom,
}: DashboardShellProps) {
  return (
    <section className="dashboard-shell">
      <header className="dashboard-shell__header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      <div className="dashboard-shell__top">{topRow}</div>
      <div className="dashboard-shell__main">
        <div className="dashboard-shell__hero">{hero}</div>
        <aside className="dashboard-shell__side">{side}</aside>
      </div>
      <div className="dashboard-shell__bottom">{bottom}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontendct
npm test -- DashboardShell
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/components
git commit -m "feat: add shared dashboard layout primitives"
```

### Task 3: Add dashboard API adapters

**Files:**
- Modify: `frontendct/src/services/dashboard.ts` or `frontendct/src/api/dashboard.ts`
- Create: `frontendct/src/features/dashboard/types.ts`
- Test: `frontendct/src/features/dashboard/__tests__/dashboard-adapter.test.ts`

- [ ] **Step 1: Write a failing adapter test for manager analytics mapping**

```tsx
import { mapManagerDashboard } from "../dashboardAdapter";

describe("mapManagerDashboard", () => {
  it("maps backend payload into hero, KPI, and widget data", () => {
    const result = mapManagerDashboard({
      overview: {
        shipment_counts: { total: 10, shipping: 4, delivered: 5, discrepancy: 2 },
        discrepancy_breakdown: { pending_review: 3 },
        pending_review_queue: [],
        recent_shipments: [],
        vendor_performance: [],
        aging_sla: { overdue_shipping: 1, awaiting_verification: 2 },
      },
      analytics: {
        trend_by_date: [{ date: "2026-06-02", shipments_total: 10, shipments_with_discrepancy: 2, pending_review: 3, shipments_currently_verified: 5, discrepancy_rows: 4 }],
        discrepancy_by_part: [],
        discrepancy_by_vendor: [],
        schedule_risk: { dispatch_today: 1, arrival_today: 2, overdue_shipping: 1, arrived_awaiting_verification: 2, missing_schedule_data: 0 },
        action_queue: { draft_pending_submit: 1, submitted_qr_not_ready: 1, pending_discrepancy_review: 3 },
        audit_evidence_summary: { shipments_with_photo: 1, shipments_without_photo: 0, shipments_with_location: 1, shipments_with_timestamp: 1 },
      },
    });

    expect(result.kpis[0].value).toBe(10);
    expect(result.highlight.value).toBe(3);
    expect(result.hero.title).toBe("Shipment & Discrepancy Trend");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontendct
npm test -- dashboard-adapter
```

Expected:
- fail because adapter does not exist yet

- [ ] **Step 3: Implement the adapter with explicit role mappings**

Implementation rules:
- manager:
  - top KPI: total, shipping, delivered, pending review
  - highlight: pending review or discrepancy shipment
  - hero: `trend_by_date`
- vendor:
  - top KPI: total, shipping, delivered, QR ready
  - highlight: pending discrepancy review
  - hero: `trend_by_date`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontendct
npm test -- dashboard-adapter
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/services src/api src/features/dashboard
git commit -m "feat: add dashboard API adapters for manager and vendor"
```

### Task 4: Implement manager dashboard screen

**Files:**
- Modify: `frontendct/src/pages/manager/DashboardPage.tsx`
- Modify: `frontendct/src/features/dashboard/components/*`
- Test: `frontendct/src/pages/manager/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Write a failing screen test for manager dashboard sections**

```tsx
import { render, screen } from "@testing-library/react";
import { ManagerDashboardPage } from "../DashboardPage";

describe("ManagerDashboardPage", () => {
  it("renders manager hero, KPI strip, and support widgets", async () => {
    render(<ManagerDashboardPage />);

    expect(await screen.findByText("Shipment & Discrepancy Trend")).toBeInTheDocument();
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
    expect(screen.getByText(/vendor performance/i)).toBeInTheDocument();
    expect(screen.getByText(/recent shipments/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontendct
npm test -- ManagerDashboardPage
```

Expected:
- FAIL on missing sections

- [ ] **Step 3: Implement the screen using shared shell**

Use:
- `DashboardShell`
- `KpiCard`
- `HeroAnalyticsPanel`
- compact widgets for:
  - `schedule_risk`
  - `discrepancy_by_part`
  - `vendor_performance`
  - `pending_review_queue`
  - `recent_shipments`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontendct
npm test -- ManagerDashboardPage
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/manager src/features/dashboard
git commit -m "feat: implement redesigned manager dashboard"
```

### Task 5: Implement vendor dashboard screen

**Files:**
- Modify: `frontendct/src/pages/vendor/DashboardPage.tsx`
- Modify: `frontendct/src/features/dashboard/components/*`
- Test: `frontendct/src/pages/vendor/__tests__/DashboardPage.test.tsx`

- [ ] **Step 1: Write a failing screen test for vendor dashboard sections**

```tsx
import { render, screen } from "@testing-library/react";
import { VendorDashboardPage } from "../DashboardPage";

describe("VendorDashboardPage", () => {
  it("renders vendor hero, KPI strip, and operational widgets", async () => {
    render(<VendorDashboardPage />);

    expect(await screen.findByText("Shipment Movement")).toBeInTheDocument();
    expect(screen.getByText(/qr ready/i)).toBeInTheDocument();
    expect(screen.getByText(/action queue/i)).toBeInTheDocument();
    expect(screen.getByText(/audit evidence/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontendct
npm test -- VendorDashboardPage
```

Expected:
- FAIL on missing sections

- [ ] **Step 3: Implement the screen using shared shell**

Use widgets for:
- `schedule_risk`
- `discrepancy_by_part`
- `action_queue`
- `audit_evidence_summary`
- `recent_activity`

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd frontendct
npm test -- VendorDashboardPage
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/vendor src/features/dashboard
git commit -m "feat: implement redesigned vendor dashboard"
```

### Task 6: Apply visual system and responsive behavior

**Files:**
- Modify: `frontendct/src/styles/dashboard.css` or existing dashboard stylesheet
- Modify: `frontendct/src/features/dashboard/components/*`
- Test: manual responsive QA in browser

- [ ] **Step 1: Add dashboard design tokens**

Add tokens for:
- navy hero background
- blue brand surface
- cyan analytics accent
- amber warning
- neutral light background

- [ ] **Step 2: Apply responsive layout rules**

Required behavior:
- desktop: hero left, support widgets right/below
- tablet: hero full-width, widgets two-column
- mobile: KPI stack, hero full-width, widgets single-column

- [ ] **Step 3: Run local UI verification**

Run:

```bash
cd frontendct
npm run dev
```

Expected:
- manager and vendor dashboard load without layout break
- hero panel remains dominant
- compact widgets remain readable

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "style: apply dashboard redesign visual system"
```

### Task 7: Wire click-through interactions

**Files:**
- Modify: `frontendct/src/pages/manager/DashboardPage.tsx`
- Modify: `frontendct/src/pages/vendor/DashboardPage.tsx`
- Modify: `frontendct/src/routes/**`
- Test: page-level interaction test if router test infrastructure exists

- [ ] **Step 1: Implement KPI navigation mapping**

Manager mappings:
- total shipment -> `/outbound`
- shipping -> `/outbound?status_bucket=shipping`
- delivered -> `/outbound?status_bucket=delivered`
- pending review -> `/discrepancy?pending_review=1`
- discrepancy highlight -> `/outbound?has_discrepancy=1`

Vendor mappings:
- total shipment -> `/outbound`
- shipping -> `/outbound?status_bucket=shipping`
- delivered -> `/outbound?status_bucket=delivered`
- QR ready -> `/outbound`
- pending discrepancy review -> `/discrepancy?pending_review=1`

- [ ] **Step 2: Verify navigation manually**

Run:

```bash
cd frontendct
npm run dev
```

Expected:
- each KPI click opens the intended filtered destination

- [ ] **Step 3: Commit**

```bash
git add src/pages src/routes
git commit -m "feat: wire dashboard KPI click-through filters"
```

### Task 8: Final QA and FE handoff update

**Files:**
- Modify: `frontendct/docs/manager-vendor-dashboard-implementation-notes.md` if docs folder exists
- Test: project test command and manual responsive QA

- [ ] **Step 1: Run the frontend test suite**

Run:

```bash
cd frontendct
npm test
```

Expected:
- all dashboard tests pass

- [ ] **Step 2: Run production build**

Run:

```bash
cd frontendct
npm run build
```

Expected:
- build succeeds without TypeScript/runtime import errors

- [ ] **Step 3: Update FE notes**

Document:
- manager widgets used
- vendor widgets used
- routes used for click-through
- any intentionally deferred backend-dependent items

- [ ] **Step 4: Commit**

```bash
git add docs src
git commit -m "docs: finalize manager vendor dashboard FE handoff"
```

## Self-Review

Spec coverage:
- shared shell: covered in Task 2
- manager layout: covered in Task 4
- vendor layout: covered in Task 5
- tone/responsive visual system: covered in Task 6
- click-through behavior: covered in Task 7

Blocked items intentionally excluded:
- `discrepancy_by_line`
- `awaiting_vendor_response`

