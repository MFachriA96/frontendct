import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './VendorQrPrintPage.css';

const VendorQrPrintPage = () => {
  const [searchParams] = useSearchParams();
  const [printJob, setPrintJob] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [hasTriggeredPrint, setHasTriggeredPrint] = useState(false);

  useEffect(() => {
    const jobId = searchParams.get('job');

    if (!jobId) {
      setLoadError('Data cetak QR tidak ditemukan.');
      return;
    }

    try {
      const rawJob = window.sessionStorage.getItem(jobId);
      if (!rawJob) {
        setLoadError('Data cetak QR sudah tidak tersedia. Buka lagi dari modal QR shipment.');
        return;
      }

      const parsedJob = JSON.parse(rawJob);
      if (!parsedJob?.groups?.length) {
        setLoadError('Data cetak QR tidak lengkap.');
        return;
      }

      setPrintJob({ ...parsedJob, jobId });
    } catch (error) {
      console.error('Failed to load vendor QR print job:', error);
      setLoadError('Data cetak QR gagal dibaca.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!printJob || hasTriggeredPrint) {
      return undefined;
    }

    const triggerId = window.setTimeout(() => {
      window.print();
      setHasTriggeredPrint(true);
    }, 180);

    return () => window.clearTimeout(triggerId);
  }, [printJob, hasTriggeredPrint]);

  useEffect(() => {
    if (!printJob?.jobId) {
      return undefined;
    }

    const handleAfterPrint = () => {
      window.sessionStorage.removeItem(printJob.jobId);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [printJob]);

  if (loadError) {
    return (
      <main className="vendor-qr-print-page vendor-qr-print-page--empty">
        <div className="vendor-qr-print-empty">
          <h1>Cetak QR belum bisa dibuka</h1>
          <p>{loadError}</p>
        </div>
      </main>
    );
  }

  if (!printJob) {
    return (
      <main className="vendor-qr-print-page vendor-qr-print-page--empty">
        <div className="vendor-qr-print-empty">
          <h1>Menyiapkan lembar cetak QR...</h1>
          <p>Halaman ini akan otomatis memanggil dialog print setelah siap.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="vendor-qr-print-page">
      <header className="vendor-qr-print-header">
        <div>
          <h1>{printJob.title}</h1>
          <p>{printJob.description}</p>
        </div>
        <div className="vendor-qr-print-meta">
          <span>Dicetak: {printJob.printedAt}</span>
          <button type="button" className="vendor-qr-print-button" onClick={() => window.print()}>
            Print lagi
          </button>
        </div>
      </header>

      <div className="vendor-qr-print-groups">
        {printJob.groups.map((group) => (
          <section key={group.productName} className="vendor-qr-print-group">
            <div className="vendor-qr-print-group__head">
              <div>
                <h2>{group.productName}</h2>
                <p>{group.tokens.length} box siap dicetak</p>
              </div>
              <span>{group.tokens.length} box</span>
            </div>

            <div className="vendor-qr-print-grid">
              {group.tokens.map((token) => (
                <article key={`${group.productName}-${token.boxCode}-${token.qrToken}`} className="vendor-qr-print-card">
                  <div
                    className="vendor-qr-print-card__qr"
                    dangerouslySetInnerHTML={{ __html: token.svgMarkup || '<div class="vendor-qr-print-card__fallback">QR tidak tersedia</div>' }}
                  />
                  <div className="vendor-qr-print-card__product">{group.productName}</div>
                  <div className="vendor-qr-print-card__box">{token.boxCode}</div>
                  <div className="vendor-qr-print-card__qty">Qty {token.quantityInBox}</div>
                  <div className="vendor-qr-print-card__token-label">TOKEN</div>
                  <div className="vendor-qr-print-card__token">{token.qrToken}</div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
};

export default VendorQrPrintPage;
