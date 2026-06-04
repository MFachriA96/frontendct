# FE Analytics Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up `/manager-analytics` and `/vendor-analytics` endpoints to replace the Manager Analytics panel and add a new Vendor Analytics panel, with shared utility functions and chart components.

**Architecture:** New pure-function helpers go into the existing `src/utils/dashboardLogic.js` util layer (tested in `tests/dashboardLogic.test.mjs`). A shared `AnalyticsTrendChart` component handles chart.js Line registration. Analytics fetch is lazy (triggered on sidebar open) and owns its own loading/error state — it must not block the dashboard first paint.

**Tech Stack:** React 19, chart.js 4 + react-chartjs-2 5, axios, node:test (unit tests)

---

## File Structure

| File | Action | What it does |
|------|--------|--------------|
| `src/utils/dashboardLogic.js` | Modify | Add 4 analytics util fns: `normalizeAnalyticsResponse`, `buildTrendChartData`, `buildDiscrepancyByPartRows`, `summarizeAuditEvidence` |
| `tests/dashboardLogic.test.mjs` | Modify | Add unit tests for the 4 new fns |
| `src/components/AnalyticsTrendChart.jsx` | Create | Shared Line chart wrapper (registers required chart.js elements) |
| `src/pages/ManagerDashboard.jsx` | Modify | Add analytics state + lazy fetch + replace analytics panel (lines ~1131–1192) |
| `src/pages/VendorDashboard.jsx` | Modify | Add analytics nav item + analytics panel + analytics state + lazy fetch |

---

### Task 1: Analytics util functions (TDD)

**Files:**
- Modify: `tests/dashboardLogic.test.mjs`
- Modify: `src/utils/dashboardLogic.js`

- [ ] **Step 1.1: Write the failing tests**

Append to `tests/dashboardLogic.test.mjs`:

```js
import {
  buildRecentShipmentActivity,
  buildShipmentChartSegments,
  buildVendorSummaryCards,
  buildQrDownloadLabel,
  canAccessQrForShipment,
  getDiscrepancyStatusCounts,
  getUpcomingShipmentSchedule,
  getShipmentStatusCounts,
  validateOutboundSchedule,
  // new imports:
  normalizeAnalyticsResponse,
  buildTrendChartData,
  buildDiscrepancyByPartRows,
  summarizeAuditEvidence,
} from '../src/utils/dashboardLogic.js';
```

Then add these describe blocks at the end of the file:

```js
describe('normalizeAnalyticsResponse', () => {
  it('returns fully-zeroed safe shape for empty input', () => {
    const result = normalizeAnalyticsResponse(null);
    assert.deepEqual(result.discrepancy_by_part, []);
    assert.deepEqual(result.discrepancy_by_vendor, []);
    assert.deepEqual(result.trend_by_date, []);
    assert.equal(result.schedule_risk.dispatch_today, 0);
    assert.equal(result.schedule_risk.overdue_shipping, 0);
    assert.equal(result.action_queue.pending_discrepancy_review, 0);
    assert.equal(result.audit_evidence_summary.shipments_with_photo, 0);
  });

  it('unwraps data.data nesting', () => {
    const payload = {
      data: {
        role_scope: 'manager',
        schedule_risk: { dispatch_today: 3, overdue_shipping: 1, arrival_today: 0, arrived_awaiting_verification: 0, missing_schedule_data: 0 },
        action_queue: { draft_pending_submit: 0, submitted_qr_not_ready: 0, pending_discrepancy_review: 2 },
        audit_evidence_summary: { shipments_with_photo: 5, shipments_without_photo: 2, shipments_with_location: 4, shipments_with_timestamp: 7 },
        discrepancy_by_part: [],
        discrepancy_by_vendor: [],
        trend_by_date: [],
      },
    };
    const result = normalizeAnalyticsResponse(payload);
    assert.equal(result.role_scope, 'manager');
    assert.equal(result.schedule_risk.dispatch_today, 3);
    assert.equal(result.action_queue.pending_discrepancy_review, 2);
    assert.equal(result.audit_evidence_summary.shipments_with_photo, 5);
  });
});

describe('buildTrendChartData', () => {
  it('returns empty labels and datasets for empty input', () => {
    const result = buildTrendChartData([]);
    assert.deepEqual(result.labels, []);
    assert.equal(result.datasets.length, 3);
    assert.deepEqual(result.datasets[0].data, []);
  });

  it('reverses DESC input to ASC for time axis', () => {
    const trendDesc = [
      { date: '2026-06-03', shipments_total: 5, shipments_currently_verified: 3, shipments_with_discrepancy: 1 },
      { date: '2026-06-02', shipments_total: 4, shipments_currently_verified: 2, shipments_with_discrepancy: 0 },
      { date: '2026-06-01', shipments_total: 2, shipments_currently_verified: 1, shipments_with_discrepancy: 0 },
    ];
    const result = buildTrendChartData(trendDesc);
    assert.deepEqual(result.labels, ['2026-06-01', '2026-06-02', '2026-06-03']);
    assert.deepEqual(result.datasets[0].data, [2, 4, 5]);
    assert.deepEqual(result.datasets[1].data, [1, 2, 3]);
    assert.deepEqual(result.datasets[2].data, [0, 0, 1]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { date: '2026-06-02', shipments_total: 4, shipments_currently_verified: 2, shipments_with_discrepancy: 0 },
      { date: '2026-06-01', shipments_total: 2, shipments_currently_verified: 1, shipments_with_discrepancy: 0 },
    ];
    buildTrendChartData(input);
    assert.equal(input[0].date, '2026-06-02');
  });
});

describe('buildDiscrepancyByPartRows', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(buildDiscrepancyByPartRows([]), []);
  });

  it('sorts by total_non_match descending', () => {
    const parts = [
      { part_id: 1, part_name: 'A', mismatch: 0, missing: 1, over: 0, total_non_match: 1 },
      { part_id: 2, part_name: 'B', mismatch: 3, missing: 0, over: 0, total_non_match: 3 },
      { part_id: 3, part_name: 'C', mismatch: 1, missing: 1, over: 0, total_non_match: 2 },
    ];
    const result = buildDiscrepancyByPartRows(parts);
    assert.deepEqual(result.map((r) => r.part_id), [2, 3, 1]);
  });

  it('does not mutate the input array', () => {
    const parts = [
      { part_id: 1, total_non_match: 1 },
      { part_id: 2, total_non_match: 3 },
    ];
    buildDiscrepancyByPartRows(parts);
    assert.equal(parts[0].part_id, 1);
  });
});

describe('summarizeAuditEvidence', () => {
  it('returns zeroed summary with partial flag for empty input', () => {
    const result = summarizeAuditEvidence({});
    assert.equal(result.total, 0);
    assert.equal(result.photoPct, 0);
    assert.equal(result.locationPct, 0);
    assert.equal(result.partial, true);
  });

  it('computes photo and location coverage percentages', () => {
    const result = summarizeAuditEvidence({
      shipments_with_photo: 8,
      shipments_without_photo: 2,
      shipments_with_location: 7,
      shipments_with_timestamp: 10,
    });
    assert.equal(result.total, 10);
    assert.equal(result.photoPct, 80);
    assert.equal(result.locationPct, 70);
    assert.equal(result.withTimestamp, 10);
    assert.equal(result.partial, true);
  });

  it('avoids divide-by-zero when total is zero', () => {
    const result = summarizeAuditEvidence({
      shipments_with_photo: 0,
      shipments_without_photo: 0,
      shipments_with_location: 0,
      shipments_with_timestamp: 0,
    });
    assert.equal(result.photoPct, 0);
    assert.equal(result.locationPct, 0);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```
node --test tests/dashboardLogic.test.mjs
```

Expected: errors on `normalizeAnalyticsResponse`, `buildTrendChartData`, `buildDiscrepancyByPartRows`, `summarizeAuditEvidence` — "is not a function" or import error.

- [ ] **Step 1.3: Implement the four functions**

Append to the bottom of `src/utils/dashboardLogic.js`:

```js
export const normalizeAnalyticsResponse = (payload) => {
  const data = payload?.data ?? payload ?? {};
  return {
    role_scope: data.role_scope || '',
    generated_at: data.generated_at || null,
    date_basis: data.date_basis || 'dispatch_date',
    discrepancy_by_part: Array.isArray(data.discrepancy_by_part) ? data.discrepancy_by_part : [],
    discrepancy_by_vendor: Array.isArray(data.discrepancy_by_vendor) ? data.discrepancy_by_vendor : [],
    schedule_risk: {
      dispatch_today: Number(data.schedule_risk?.dispatch_today ?? 0),
      arrival_today: Number(data.schedule_risk?.arrival_today ?? 0),
      overdue_shipping: Number(data.schedule_risk?.overdue_shipping ?? 0),
      arrived_awaiting_verification: Number(data.schedule_risk?.arrived_awaiting_verification ?? 0),
      missing_schedule_data: Number(data.schedule_risk?.missing_schedule_data ?? 0),
    },
    action_queue: {
      draft_pending_submit: Number(data.action_queue?.draft_pending_submit ?? 0),
      submitted_qr_not_ready: Number(data.action_queue?.submitted_qr_not_ready ?? 0),
      pending_discrepancy_review: Number(data.action_queue?.pending_discrepancy_review ?? 0),
    },
    audit_evidence_summary: {
      shipments_with_photo: Number(data.audit_evidence_summary?.shipments_with_photo ?? 0),
      shipments_without_photo: Number(data.audit_evidence_summary?.shipments_without_photo ?? 0),
      shipments_with_location: Number(data.audit_evidence_summary?.shipments_with_location ?? 0),
      shipments_with_timestamp: Number(data.audit_evidence_summary?.shipments_with_timestamp ?? 0),
    },
    trend_by_date: Array.isArray(data.trend_by_date) ? data.trend_by_date : [],
  };
};

export const buildTrendChartData = (trendByDate = []) => {
  const sorted = [...trendByDate].reverse();
  return {
    labels: sorted.map((row) => row.date),
    datasets: [
      {
        label: 'Total',
        data: sorted.map((row) => row.shipments_total),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.1)',
        tension: 0.3,
      },
      {
        label: 'Verified',
        data: sorted.map((row) => row.shipments_currently_verified),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.1)',
        tension: 0.3,
      },
      {
        label: 'Discrepancy',
        data: sorted.map((row) => row.shipments_with_discrepancy),
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220,38,38,0.1)',
        tension: 0.3,
      },
    ],
  };
};

export const buildDiscrepancyByPartRows = (discrepancyByPart = []) =>
  [...discrepancyByPart].sort((a, b) => (b.total_non_match || 0) - (a.total_non_match || 0));

export const summarizeAuditEvidence = (summary = {}) => {
  const withPhoto = Number(summary.shipments_with_photo ?? 0);
  const withoutPhoto = Number(summary.shipments_without_photo ?? 0);
  const withLocation = Number(summary.shipments_with_location ?? 0);
  const withTimestamp = Number(summary.shipments_with_timestamp ?? 0);
  const total = withPhoto + withoutPhoto;
  const photoPct = total > 0 ? Math.round((withPhoto / total) * 100) : 0;
  const locationPct = total > 0 ? Math.round((withLocation / total) * 100) : 0;
  return {
    withPhoto,
    withoutPhoto,
    withLocation,
    withTimestamp,
    total,
    photoPct,
    locationPct,
    partial: true,
  };
};
```

- [ ] **Step 1.4: Run tests to verify all pass**

```
node --test tests/dashboardLogic.test.mjs
```

Expected: all tests pass (original + new describe blocks).

- [ ] **Step 1.5: Commit**

```bash
git add src/utils/dashboardLogic.js tests/dashboardLogic.test.mjs
git commit -m "feat: add analytics util fns (normalizeAnalyticsResponse, buildTrendChartData, buildDiscrepancyByPartRows, summarizeAuditEvidence)"
```

---

### Task 2: AnalyticsTrendChart component

**Files:**
- Create: `src/components/AnalyticsTrendChart.jsx`

- [ ] **Step 2.1: Create the component file**

Create `src/components/AnalyticsTrendChart.jsx`:

```jsx
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const CHART_OPTIONS = {
  responsive: true,
  plugins: {
    legend: { position: 'top' },
    tooltip: { mode: 'index', intersect: false },
  },
  scales: {
    y: { beginAtZero: true },
  },
};

const AnalyticsTrendChart = ({ data }) => <Line data={data} options={CHART_OPTIONS} />;

export default AnalyticsTrendChart;
```

- [ ] **Step 2.2: Verify lint is clean on the new file**

```
npm run lint -- src/components/AnalyticsTrendChart.jsx
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/components/AnalyticsTrendChart.jsx
git commit -m "feat: add AnalyticsTrendChart shared component"
```

---

### Task 3: Manager Analytics panel

**Files:**
- Modify: `src/pages/ManagerDashboard.jsx`

- [ ] **Step 3.1: Add analytics imports at the top of ManagerDashboard.jsx**

In the existing import from `'../utils/dashboardLogic'`, add the four new fns:

```js
import {
  buildRecentShipmentActivity,
  buildShipmentChartSegments,
  filterShipmentsByStatusGroup,
  getDiscrepancyStatusCounts,
  getShipmentStatusCounts,
  // add:
  normalizeAnalyticsResponse,
  buildTrendChartData,
  buildDiscrepancyByPartRows,
  summarizeAuditEvidence,
} from '../utils/dashboardLogic';
```

Also add the chart component import after the CSS import:

```js
import AnalyticsTrendChart from '../components/AnalyticsTrendChart';
```

- [ ] **Step 3.2: Add analytics state variables**

After the existing `const [reportsData, setReportsData] = useState([]);` line, add:

```js
const [managerAnalytics, setManagerAnalytics] = useState(null);
const [analyticsLoading, setAnalyticsLoading] = useState(false);
const [analyticsError, setAnalyticsError] = useState(null);
const [analyticsVendorFilter, setAnalyticsVendorFilter] = useState('all');
const [analyticsFetched, setAnalyticsFetched] = useState(false);
```

- [ ] **Step 3.3: Add the lazy fetch function**

After the existing `fetchData` function (before `useEffect`), add:

```js
const fetchManagerAnalytics = async (vendorId = null) => {
  const token = localStorage.getItem('token');
  const params = vendorId && vendorId !== 'all' ? `?vendor_id=${vendorId}` : '';
  setAnalyticsLoading(true);
  setAnalyticsError(null);
  try {
    const res = await axios.get(`${API_BASE_URL}/api/dashboard/manager-analytics${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setManagerAnalytics(normalizeAnalyticsResponse(res.data));
    setAnalyticsFetched(true);
  } catch (err) {
    setAnalyticsError(err.response?.data?.message || err.message || 'Failed to load analytics.');
  } finally {
    setAnalyticsLoading(false);
  }
};
```

- [ ] **Step 3.4: Add the useEffect trigger for lazy fetch**

After the existing `useEffect(() => { fetchData(); }, []);`, add:

```js
useEffect(() => {
  if (activeSidebar === 'analytics' && !analyticsFetched) {
    fetchManagerAnalytics();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeSidebar]);
```

- [ ] **Step 3.5: Add the vendor filter handler**

After `fetchManagerAnalytics`, add:

```js
const handleAnalyticsVendorFilter = (vendorId) => {
  setAnalyticsVendorFilter(vendorId);
  fetchManagerAnalytics(vendorId);
};
```

- [ ] **Step 3.6: Replace the analytics panel JSX**

Find the existing analytics block (starts at `{activeSidebar === 'analytics' && (`). Replace the entire block with:

```jsx
{activeSidebar === 'analytics' && (
  <>
    <div className="page-header">
      <div>
        <h1>Analytics & Vendor Performance</h1>
        <p className="subtitle">
          Operational analytics by dispatch date.{' '}
          {managerAnalytics?.generated_at && (
            <span className="text-muted">Generated {formatDateTime(managerAnalytics.generated_at)}</span>
          )}
        </p>
      </div>
      <div className="header-actions">
        <select
          className="form-control filter-select"
          value={analyticsVendorFilter}
          onChange={(e) => handleAnalyticsVendorFilter(e.target.value)}
          disabled={analyticsLoading}
        >
          <option value="all">All Vendors</option>
          {(managerAnalytics?.discrepancy_by_vendor || []).map((v) => (
            <option key={v.vendor_id} value={String(v.vendor_id)}>{v.vendor_name}</option>
          ))}
        </select>
        <button className="btn btn-outline" onClick={() => { setAnalyticsFetched(false); fetchManagerAnalytics(analyticsVendorFilter); }} disabled={analyticsLoading}>
          <i className="fa-solid fa-rotate"></i> Refresh
        </button>
      </div>
    </div>

    {analyticsLoading && (
      <div className="text-center" style={{ padding: '48px' }}>
        <i className="fa-solid fa-spinner fa-spin"></i> Loading analytics...
      </div>
    )}

    {analyticsError && !analyticsLoading && (
      <div className="card data-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
        <i className="fa-solid fa-circle-exclamation"></i> {analyticsError}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={() => fetchManagerAnalytics(analyticsVendorFilter)}>Retry</button>
        </div>
      </div>
    )}

    {!analyticsLoading && !analyticsError && managerAnalytics && (() => {
      const { schedule_risk, action_queue, audit_evidence_summary, discrepancy_by_part, discrepancy_by_vendor, trend_by_date } = managerAnalytics;
      const partRows = buildDiscrepancyByPartRows(discrepancy_by_part);
      const auditSummary = summarizeAuditEvidence(audit_evidence_summary);
      const trendData = buildTrendChartData(trend_by_date);

      return (
        <>
          {/* Signal Cards */}
          <div className="manager-section-grid">
            <div className="section-summary-card">
              <span>Dispatch Today</span>
              <strong>{schedule_risk.dispatch_today}</strong>
            </div>
            <div className="section-summary-card">
              <span>Arrival Today</span>
              <strong>{schedule_risk.arrival_today}</strong>
            </div>
            <div className="section-summary-card">
              <span>Overdue Shipping</span>
              <strong style={{ color: schedule_risk.overdue_shipping > 0 ? 'var(--danger)' : undefined }}>{schedule_risk.overdue_shipping}</strong>
            </div>
            <div className="section-summary-card">
              <span>Awaiting Verification</span>
              <strong>{schedule_risk.arrived_awaiting_verification}</strong>
            </div>
            <div className="section-summary-card">
              <span>Draft Pending Submit</span>
              <strong>{action_queue.draft_pending_submit}</strong>
            </div>
            <div className="section-summary-card">
              <span>QR Not Ready</span>
              <strong>{action_queue.submitted_qr_not_ready}</strong>
            </div>
            <div className="section-summary-card">
              <span>Pending Discrepancy Review</span>
              <strong style={{ color: action_queue.pending_discrepancy_review > 0 ? 'var(--danger)' : undefined }}>{action_queue.pending_discrepancy_review}</strong>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="card data-card mt-4">
            <div className="card-header" style={{ padding: '1.5rem 1.5rem 0', borderBottom: 'none' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Shipment Trend</h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>By dispatch date · latest 30 points</p>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem' }}>
              {trend_by_date.length > 0 ? (
                <AnalyticsTrendChart data={trendData} />
              ) : (
                <div className="manager-activity-empty">No trend data available yet.</div>
              )}
            </div>
          </div>

          {/* Discrepancy by Part */}
          <div className="card data-card mt-4">
            <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Discrepancy by Part</h2>
            </div>
            <div className="table-responsive" style={{ padding: '1rem' }}>
              {partRows.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th className="text-center">Mismatch</th>
                      <th className="text-center">Missing</th>
                      <th className="text-center">Over</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partRows.map((row) => {
                      const maxTotal = partRows[0].total_non_match || 1;
                      const barPct = Math.round((row.total_non_match / maxTotal) * 100);
                      return (
                        <tr key={row.part_id}>
                          <td className="font-medium">{row.part_name}</td>
                          <td className="text-center">{row.mismatch}</td>
                          <td className="text-center">{row.missing}</td>
                          <td className="text-center">{row.over}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '80px', height: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${barPct}%`, height: '100%', backgroundColor: 'var(--danger)' }}></div>
                              </div>
                              <strong>{row.total_non_match}</strong>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="manager-activity-empty">No part discrepancy data available.</div>
              )}
            </div>
          </div>

          {/* Vendor Performance */}
          <div className="card data-card mt-4">
            <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Vendor Performance</h2>
            </div>
            <div className="table-responsive" style={{ padding: '1rem' }}>
              {discrepancy_by_vendor.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th className="text-center">Total Shipments</th>
                      <th className="text-center">w/ Discrepancy</th>
                      <th>Rate</th>
                      <th>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discrepancy_by_vendor.map((v) => {
                      const pct = (v.discrepancy_rate || 0) * 100;
                      return (
                        <tr key={v.vendor_id}>
                          <td className="font-medium">{v.vendor_name}</td>
                          <td className="text-center">{v.total_shipments}</td>
                          <td className="text-center">{v.shipments_with_discrepancy}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '100px', height: '8px', backgroundColor: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: pct > 10 ? 'var(--danger)' : 'var(--success)' }}></div>
                              </div>
                              <span className="font-bold">{formatRate(v.discrepancy_rate)}</span>
                            </div>
                          </td>
                          <td>
                            {pct === 0
                              ? <span className="status-badge status-success">Excellent</span>
                              : pct > 10
                                ? <span className="status-badge status-danger">Needs Review</span>
                                : <span className="status-badge status-warning">Acceptable</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="manager-activity-empty">No vendor performance data available.</div>
              )}
            </div>
          </div>

          {/* Audit Evidence */}
          <div className="card data-card mt-4">
            <div className="card-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Audit Evidence Summary</h2>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div className="manager-section-grid">
                <div className="section-summary-card">
                  <span>With Photo <span className="status-badge status-pending" style={{ fontSize: '0.7rem' }}>partial</span></span>
                  <strong>{auditSummary.withPhoto} <span className="text-muted" style={{ fontSize: '0.85rem' }}>({auditSummary.photoPct}%)</span></strong>
                </div>
                <div className="section-summary-card">
                  <span>Without Photo</span>
                  <strong style={{ color: auditSummary.withoutPhoto > 0 ? 'var(--warning)' : undefined }}>{auditSummary.withoutPhoto}</strong>
                </div>
                <div className="section-summary-card">
                  <span>With Location <span className="status-badge status-pending" style={{ fontSize: '0.7rem' }}>partial</span></span>
                  <strong>{auditSummary.withLocation} <span className="text-muted" style={{ fontSize: '0.85rem' }}>({auditSummary.locationPct}%)</span></strong>
                </div>
                <div className="section-summary-card">
                  <span>With Timestamp</span>
                  <strong>{auditSummary.withTimestamp}</strong>
                </div>
              </div>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
                Photo = <code>tabel_foto</code> records only. Location = warehouse context, not GPS coordinates.
              </p>
            </div>
          </div>
        </>
      );
    })()}
  </>
)}
```

- [ ] **Step 3.7: Lint check**

```
npm run lint -- src/pages/ManagerDashboard.jsx
```

Expected: no errors (fix any reported).

- [ ] **Step 3.8: Commit**

```bash
git add src/pages/ManagerDashboard.jsx src/components/AnalyticsTrendChart.jsx
git commit -m "feat: replace manager analytics panel with full analytics endpoint integration"
```

---

### Task 4: Vendor Analytics panel

**Files:**
- Modify: `src/pages/VendorDashboard.jsx`

- [ ] **Step 4.1: Add analytics imports to VendorDashboard.jsx**

In the existing import from `'../utils/dashboardLogic'`, add:

```js
import {
  buildRecentShipmentActivity,
  buildShipmentChartSegments,
  buildVendorSummaryCards,
  buildQrDownloadLabel,
  canAccessQrForShipment,
  filterShipmentsByStatusGroup,
  getQrProductName,
  getUpcomingShipmentSchedule,
  getShipmentStatusCounts,
  normalizeStatus,
  normalizeQrTokens,
  validateOutboundSchedule,
  // add:
  normalizeAnalyticsResponse,
  buildTrendChartData,
  buildDiscrepancyByPartRows,
  summarizeAuditEvidence,
} from '../utils/dashboardLogic';
```

Also add after the existing CSS import:

```js
import AnalyticsTrendChart from '../components/AnalyticsTrendChart';
```

- [ ] **Step 4.2: Add analytics state variables**

After the existing `const [notificationsLoading, setNotificationsLoading] = useState(false);` line, add:

```js
const [vendorAnalytics, setVendorAnalytics] = useState(null);
const [analyticsLoading, setAnalyticsLoading] = useState(false);
const [analyticsError, setAnalyticsError] = useState(null);
const [analyticsFetched, setAnalyticsFetched] = useState(false);
```

- [ ] **Step 4.3: Add the vendor analytics lazy fetch function**

After the `handleLogout` function (or wherever the fetch helpers are), add:

```js
const fetchVendorAnalytics = async () => {
  const token = localStorage.getItem('token');
  setAnalyticsLoading(true);
  setAnalyticsError(null);
  try {
    const res = await axios.get(`${API_BASE_URL}/api/dashboard/vendor-analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setVendorAnalytics(normalizeAnalyticsResponse(res.data));
    setAnalyticsFetched(true);
  } catch (err) {
    setAnalyticsError(err.response?.data?.message || err.message || 'Failed to load analytics.');
  } finally {
    setAnalyticsLoading(false);
  }
};
```

- [ ] **Step 4.4: Add the useEffect trigger for lazy fetch**

After the existing `useEffect` that calls the primary fetch (the one that calls `fetchDashboard` or equivalent), add:

```js
useEffect(() => {
  if (activeTab === 'analytics' && !analyticsFetched) {
    fetchVendorAnalytics();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab]);
```

- [ ] **Step 4.5: Add Analytics nav item to the vendor sidebar**

Find the existing nav items block (around line 867–879). After the last `menu-item` (currently `settings`), add:

```jsx
<div className={`menu-item ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
  <i className="fa-solid fa-chart-line"></i>
  <span>Analytics</span>
</div>
```

Also find the header title block (around lines 897–901) and add:

```jsx
{activeTab === 'analytics' && 'Analytics'}
```

- [ ] **Step 4.6: Add the analytics panel**

Find the last `{activeTab === 'settings' && (` block and add this new panel **after** it (before the closing `</main>` or equivalent wrapper):

```jsx
{activeTab === 'analytics' && (
  <div className="content-section">
    <div className="section-header">
      <h2>Analytics</h2>
      {vendorAnalytics?.generated_at && (
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
          Generated {new Date(vendorAnalytics.generated_at).toLocaleString()}
        </span>
      )}
      <button className="btn btn-outline btn-sm" onClick={() => { setAnalyticsFetched(false); fetchVendorAnalytics(); }} disabled={analyticsLoading} style={{ marginLeft: 'auto' }}>
        <i className="fa-solid fa-rotate"></i> Refresh
      </button>
    </div>

    {analyticsLoading && (
      <div className="text-center" style={{ padding: '48px' }}>
        <i className="fa-solid fa-spinner fa-spin"></i> Loading analytics...
      </div>
    )}

    {analyticsError && !analyticsLoading && (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger, #dc2626)' }}>
        <i className="fa-solid fa-circle-exclamation"></i> {analyticsError}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={fetchVendorAnalytics}>Retry</button>
        </div>
      </div>
    )}

    {!analyticsLoading && !analyticsError && vendorAnalytics && (() => {
      const { schedule_risk, action_queue, audit_evidence_summary, discrepancy_by_part, trend_by_date } = vendorAnalytics;
      const partRows = buildDiscrepancyByPartRows(discrepancy_by_part);
      const auditSummary = summarizeAuditEvidence(audit_evidence_summary);
      const trendData = buildTrendChartData(trend_by_date);

      return (
        <>
          {/* Signal Cards */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-label">Dispatch Today</div>
              <div className="stat-value">{schedule_risk.dispatch_today}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Arrival Today</div>
              <div className="stat-value">{schedule_risk.arrival_today}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Overdue Shipping</div>
              <div className="stat-value" style={{ color: schedule_risk.overdue_shipping > 0 ? '#dc2626' : undefined }}>{schedule_risk.overdue_shipping}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Draft Pending Submit</div>
              <div className="stat-value">{action_queue.draft_pending_submit}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">QR Not Ready</div>
              <div className="stat-value">{action_queue.submitted_qr_not_ready}</div>
            </div>
          </div>

          {/* Trend Chart */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>Shipment Trend</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>By dispatch date · latest 30 points</p>
            {trend_by_date.length > 0 ? (
              <AnalyticsTrendChart data={trendData} />
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No trend data available yet.</div>
            )}
          </div>

          {/* Discrepancy by Part */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Discrepancy by Part</h3>
            {partRows.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', color: '#475569' }}>Part</th>
                    <th style={{ textAlign: 'center', padding: '8px', color: '#475569' }}>Mismatch</th>
                    <th style={{ textAlign: 'center', padding: '8px', color: '#475569' }}>Missing</th>
                    <th style={{ textAlign: 'center', padding: '8px', color: '#475569' }}>Over</th>
                    <th style={{ textAlign: 'center', padding: '8px', color: '#475569' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {partRows.map((row) => (
                    <tr key={row.part_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 0', fontWeight: 500 }}>{row.part_name}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>{row.mismatch}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>{row.missing}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>{row.over}</td>
                      <td style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 700 }}>{row.total_non_match}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No part discrepancy data available.</div>
            )}
          </div>

          {/* Audit Evidence */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Audit Evidence</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">With Photo <span style={{ fontSize: '0.7rem', background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>partial</span></div>
                <div className="stat-value">{auditSummary.withPhoto} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({auditSummary.photoPct}%)</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Without Photo</div>
                <div className="stat-value" style={{ color: auditSummary.withoutPhoto > 0 ? '#d97706' : undefined }}>{auditSummary.withoutPhoto}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">With Location <span style={{ fontSize: '0.7rem', background: '#fef9c3', padding: '1px 5px', borderRadius: '4px' }}>partial</span></div>
                <div className="stat-value">{auditSummary.withLocation} <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({auditSummary.locationPct}%)</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-label">With Timestamp</div>
                <div className="stat-value">{auditSummary.withTimestamp}</div>
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.75rem' }}>
              Photo = tabel_foto records only. Location = warehouse context, not GPS.
            </p>
          </div>
        </>
      );
    })()}
  </div>
)}
```

- [ ] **Step 4.7: Lint check**

```
npm run lint -- src/pages/VendorDashboard.jsx
```

Expected: no errors (fix any reported).

- [ ] **Step 4.8: Commit**

```bash
git add src/pages/VendorDashboard.jsx
git commit -m "feat: add vendor analytics panel with lazy fetch from /vendor-analytics"
```

---

### Task 5: Final verification

- [ ] **Step 5.1: Run all unit tests**

```
node --test tests/dashboardLogic.test.mjs
```

Expected: all pass.

- [ ] **Step 5.2: Run lint on the whole project**

```
npm run lint
```

Expected: no errors.

- [ ] **Step 5.3: Run build**

```
npm run build
```

Expected: build completes with no errors. (Warnings about bundle size are acceptable; errors are not.)

- [ ] **Step 5.4: Final commit if any lint/build fixes were needed**

If any fixes were applied in steps 5.1–5.3:

```bash
git add -p
git commit -m "fix: lint and build cleanup for analytics integration"
```
