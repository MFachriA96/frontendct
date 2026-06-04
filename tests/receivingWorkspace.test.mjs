import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceivingProgress,
  buildVerifyBoxPayload,
  buildWarehouseScopedParams,
} from '../src/utils/receivingWorkspace.js';

describe('buildWarehouseScopedParams', () => {
  it('returns empty params for default manager scope', () => {
    assert.deepEqual(buildWarehouseScopedParams('default'), {});
    assert.deepEqual(buildWarehouseScopedParams(''), {});
    assert.deepEqual(buildWarehouseScopedParams(null), {});
  });

  it('returns global scope override when all warehouses is selected', () => {
    assert.deepEqual(buildWarehouseScopedParams('all'), { warehouse_scope: 'all' });
  });

  it('returns explicit warehouse id for numeric selection', () => {
    assert.deepEqual(buildWarehouseScopedParams('3'), { ID_gudang: 3 });
    assert.deepEqual(buildWarehouseScopedParams(5), { ID_gudang: 5 });
  });
});

describe('buildReceivingProgress', () => {
  it('summarizes total, scanned, verified, issue, and pending boxes', () => {
    const progress = buildReceivingProgress({
      details: [
        {
          boxes: [
            { scan_status: 'pending' },
            { scan_status: 'scanned' },
            { scan_status: 'verified' },
            { scan_status: 'issue_flagged' },
          ],
        },
      ],
    });

    assert.deepEqual(progress, {
      totalBoxes: 4,
      scannedBoxes: 3,
      verifiedBoxes: 2,
      issueBoxes: 1,
      pendingBoxes: 1,
      progressPercent: 75,
    });
  });

  it('handles missing details safely', () => {
    assert.deepEqual(buildReceivingProgress(null), {
      totalBoxes: 0,
      scannedBoxes: 0,
      verifiedBoxes: 0,
      issueBoxes: 0,
      pendingBoxes: 0,
      progressPercent: 0,
    });
  });
});

describe('buildVerifyBoxPayload', () => {
  it('normalizes verify-box payload with integer quantity', () => {
    assert.deepEqual(
      buildVerifyBoxPayload({
        inboundId: 11,
        boxId: 22,
        actualQty: '15',
        conditionStatus: 'damaged',
        notes: 'Box dented',
      }),
      {
        ID_inbound: 11,
        ID_outbound_box: 22,
        actual_qty: 15,
        condition_status: 'damaged',
        notes: 'Box dented',
        photo_ids: [],
      },
    );
  });
});
