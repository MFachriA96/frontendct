const escapeHtml = (str) => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str ?? '').replace(/[&<>"']/g, (char) => map[char]);
};

export const openReportPdf = (report, formatDateTime) => {
  if (!report) return;

  const discrepancy = report.discrepancy || {};
  const shipment = discrepancy.shipment || {};
  const item = discrepancy.item || {};
  const reportNumber = escapeHtml(report.no_dokumen_r1 || 'Dokumen R1');
  const reportStatus = escapeHtml(String(report.status_dokumen || '-').replaceAll('_', ' '));
  const vendorName = escapeHtml(shipment.vendor?.nama_vendor || '-');
  const shipmentLabel = escapeHtml(shipment.no_pengiriman || `SHP-${shipment.ID_outbound || '-'}`);
  const shipmentOrigin = escapeHtml(shipment.lokasi_asal || '-');
  const dispatchTime = escapeHtml(formatDateTime(shipment.waktu_kirim));
  const productName = escapeHtml(item.nama_barang || '-');
  const expectedQuantity = escapeHtml(discrepancy.quantity_outbound ?? '-');
  const receivedQuantity = escapeHtml(discrepancy.quantity_inbound ?? '-');
  const discrepancyValue = escapeHtml(discrepancy.selisih ?? '-');
  const discrepancyStatus = escapeHtml(discrepancy.status || '-');
  const reportNotes = escapeHtml(report.keterangan || '-');
  const generatedAt = escapeHtml(formatDateTime(report.dibuat_at || new Date()));
  const downloadName = report.no_dokumen_r1 || 'mismatch-report';

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>${reportNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1e293b; margin: 32px; }
          .header { border-bottom: 3px solid #0a2f88; padding-bottom: 18px; margin-bottom: 24px; }
          h1 { margin: 0 0 8px; color: #0a2f88; }
          .muted { color: #64748b; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0; }
          .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; }
          .label { display: block; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; }
          .danger { color: #dc2626; font-weight: 700; }
          .notes { white-space: pre-wrap; line-height: 1.5; }
          .footer { margin-top: 36px; color: #64748b; font-size: 12px; }
          @media print { button { display: none; } body { margin: 20px; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()" style="float:right;padding:10px 14px;background:#0a2f88;color:#fff;border:0;border-radius:6px;">Print / Save PDF</button>
        <div class="header">
          <h1>Dokumen R1 Tindak Lanjut</h1>
          <div class="muted">${reportNumber} • Status: ${reportStatus}</div>
        </div>
        <div class="grid">
          <div class="box"><span class="label">Vendor</span><strong>${vendorName}</strong></div>
          <div class="box"><span class="label">Shipment</span><strong>${shipmentLabel}</strong></div>
          <div class="box"><span class="label">Asal</span><strong>${shipmentOrigin}</strong></div>
          <div class="box"><span class="label">Waktu Kirim</span><strong>${dispatchTime}</strong></div>
        </div>
        <table>
          <thead><tr><th>Produk</th><th>Ekspektasi</th><th>Diterima</th><th>Selisih</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td>${productName}</td>
              <td>${expectedQuantity}</td>
              <td>${receivedQuantity}</td>
              <td class="danger">${discrepancyValue}</td>
              <td>${discrepancyStatus}</td>
            </tr>
          </tbody>
        </table>
        <h2>Instruksi Manager</h2>
        <div class="box notes">${reportNotes}</div>
        <div class="footer">Dibuat oleh Epson Verification System pada ${generatedAt}</div>
      </body>
    </html>
  `;

  const reportBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const reportUrl = URL.createObjectURL(reportBlob);
  const reportWindow = window.open(reportUrl, '_blank');

  if (!reportWindow) {
    const link = document.createElement('a');
    link.href = reportUrl;
    link.download = `${downloadName}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(reportUrl), 60000);
};

export { escapeHtml };
