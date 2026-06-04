export function buildWarehouseScopedParams(scope) {
  if (scope === 'all') {
    return { warehouse_scope: 'all' };
  }

  if (scope === null || scope === undefined || scope === '' || scope === 'default') {
    return {};
  }

  return { ID_gudang: Number(scope) };
}

export function buildReceivingProgress(shipment) {
  const boxes = (shipment?.details || []).flatMap((detail) => detail?.boxes || []);
  const totalBoxes = boxes.length;
  const scannedBoxes = boxes.filter((box) => ['scanned', 'verified', 'issue_flagged'].includes(box?.scan_status)).length;
  const verifiedBoxes = boxes.filter((box) => ['verified', 'issue_flagged'].includes(box?.scan_status)).length;
  const issueBoxes = boxes.filter((box) => box?.scan_status === 'issue_flagged').length;
  const pendingBoxes = Math.max(totalBoxes - scannedBoxes, 0);

  return {
    totalBoxes,
    scannedBoxes,
    verifiedBoxes,
    issueBoxes,
    pendingBoxes,
    progressPercent: totalBoxes > 0 ? Math.round((scannedBoxes / totalBoxes) * 100) : 0,
  };
}

export function buildVerifyBoxPayload({ inboundId, boxId, actualQty, conditionStatus, notes }) {
  return {
    ID_inbound: Number(inboundId),
    ID_outbound_box: Number(boxId),
    actual_qty: Number(actualQty),
    condition_status: conditionStatus,
    notes: notes || '',
    photo_ids: [],
  };
}
