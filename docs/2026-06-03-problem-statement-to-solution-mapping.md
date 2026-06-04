# Problem Statement to Solution Mapping

Date: 2026-06-03
Purpose: quick summary for presentation, backend alignment, and internal validation
Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-gap-validation-checklist-before-be-session.md`

## Goal

Dokumen ini merangkum bagaimana flow yang sudah dirancang menjawab problem statement utama pada topik:

`Sistem Verifikasi Pengiriman dan Penerimaan Barang`

## Short Answer

Secara desain flow dan contract target:
- ya, problem utama sudah terjawab dengan cukup baik

Secara implementasi sistem saat ini:
- belum sepenuhnya selesai
- masih butuh backend contract final dan implementasi lanjutan

Jadi:
- `solution direction = sudah benar`
- `current implementation = masih dalam proses`

## Problem 1

### Problem

`Discrepancy (match/mismatch/missing/over) sering terlambat terdeteksi`

### Why it happens in the old process

- data vendor tidak benar-benar locked secara digital
- inbound tidak terhubung kuat ke outbound
- box yang datang tidak punya identitas digital yang jelas
- comparison dilakukan terlambat atau manual

### Proposed solution in the new flow

- vendor menyimpan manifest dan submit final
- manifest di-lock saat submit
- sistem generate `1 QR = 1 box`
- receiving officer scan box satu per satu
- sistem menampilkan expected content per box
- receiving officer verify actual qty per box
- backend menentukan hasil verification dan discrepancy
- `missing` diputuskan saat finalize receiving

### Why this solves it better

- discrepancy bisa terdeteksi lebih cepat
- mismatch dan over bisa diketahui saat box diverifikasi
- missing tidak lagi menunggu proses manual yang tidak terstruktur
- ada hubungan digital yang jelas antara outbound dan inbound

### Current status

- `Solved at flow/design level`
- `Not fully implemented yet`

## Problem 2

### Problem

`Tidak ada bukti digital (foto, timestamp, lokasi) untuk audit dan klaim`

### Why it happens in the old process

- proses penerimaan tidak menyimpan bukti secara konsisten
- data scan, verifikasi, dan tindak lanjut tidak menjadi jejak audit tunggal

### Proposed solution in the new flow

- scan event menyimpan siapa, kapan, dan box mana
- verification menyimpan actual qty, condition, notes
- foto bisa diunggah saat ada issue
- receiving dibatasi per gudang
- manager action juga terekam sebagai history

### Why this solves it better

- setiap issue bisa ditelusuri ke box tertentu
- ada timestamp dan actor yang jelas
- ada bukti visual jika ada kerusakan atau selisih
- notifikasi dan action history memperkuat audit trail

### Current status

- `Solved at flow/design level`
- `Implementation still needs backend contract and persistence details`

## Problem 3

### Problem

`Proses tindak lanjut (approve/hold/return/recount) tidak terstruktur dan lambat`

### Why it happens in the old process

- discrepancy hanya berhenti di level temuan
- tidak ada jalur keputusan bisnis yang tegas
- tidak jelas siapa yang menyelesaikan issue

### Proposed solution in the new flow

- discrepancy tetap menyimpan hasil comparison teknis
- manager action dipisah sebagai resolution layer
- action yang didukung:
  - `approve`
  - `hold`
  - `recount`
  - `return`
- backend juga memicu notification berdasarkan action

### Why this solves it better

- comparison status dan resolution status tidak tercampur
- manager punya jalur keputusan yang jelas
- receiving officer hanya menangani operasional lapangan
- vendor bisa diberi notifikasi berdasarkan outcome

### Current status

- `Solved at flow/design level`
- `Needs backend contract finalization for action effects`

## Problem 4

### Problem

`Tidak ada dashboard untuk monitoring selisih per vendor/tanggal/line/jenis part`

### Why it happens in the old process

- data discrepancy tidak cukup terstruktur
- source of truth tidak stabil
- relasi antara shipment, vendor, item, dan discrepancy tidak rapi

### Proposed solution in the new flow

- shipment, box, inbound, discrepancy, dan action dipisah lebih jelas
- vendor dan manager dashboard memakai source data yang lebih konsisten
- analytics bisa dibangun dari:
  - vendor
  - tanggal / trend
  - jenis part
  - warehouse
  - discrepancy queue

### Why this solves it better

- data jadi cukup konsisten untuk monitoring
- manager bisa lihat issue secara lebih sistematis
- vendor performance dan part discrepancy bisa diukur

### Important note

Bagian `line` belum dikunci penuh sebagai domain model.

Kalau `line` memang berarti line produksi atau receiving line internal Epson, itu masih perlu didefinisikan di backend/domain model.

### Current status

- `Largely solved in direction`
- `Partially still open if "line" is required as a formal domain`

## Problem 5

### Problem

`Loss dan biaya tetap akibat discrepancy sulit ditekan karena tidak ada data analytics yang baik`

### Why it happens in the old process

- discrepancy tidak terdokumentasi dengan struktur yang kuat
- root data untuk analytics lemah
- action history tidak konsisten

### Proposed solution in the new flow

- manifest locked
- box-centric receiving
- discrepancy structured by comparison result
- manager action structured as business resolution
- dashboards and analytics use cleaner source data

### Why this solves it better

- data menjadi lebih siap untuk analytics
- issue per vendor, part, dan shipment bisa dihitung
- bottleneck operasional bisa terlihat lebih cepat
- outcome manager bisa dilacak

### Important note

Ini menyelesaikan `fondasi analytics`, bukan langsung seluruh advanced cost analytics.

Contoh yang masih bisa jadi fase berikutnya:
- SLA
- discrepancy aging
- cost attribution
- tolerance modeling

### Current status

- `Solved at foundation level`
- `Advanced analytics still belongs to later phases`

## Overall Assessment

## What is already solved well

Secara desain, flow baru sudah cukup kuat untuk:
- mempercepat deteksi discrepancy
- membangun audit trail digital
- menstrukturkan jalur tindak lanjut manager
- menyiapkan data untuk dashboard dan analytics

## What is still not fully complete

Yang belum final secara implementasi:
- backend persisted status final
- box entity actual implementation
- verification endpoint final
- discrepancy generation rule final
- manager action effect implementation
- notification implementation details

## Final Conclusion

Jawaban jujur untuk pertanyaan:

`Apakah 5 problem statement utama sudah ter-solve?`

Jawaban:
- `Ya, secara flow target dan desain solusi sudah terjawab dengan baik.`

`Apakah semuanya sudah fully implemented dan production-ready saat ini?`

Jawaban:
- `Belum. Masih perlu backend contract final dan implementasi lanjutan.`

## Suggested Presentation Wording

Kalau perlu kalimat singkat untuk menjelaskan ke dosen/tim:

> Flow yang dirancang sudah secara langsung menjawab 5 problem utama: discrepancy menjadi lebih cepat terdeteksi melalui box-level QR dan verification, bukti digital tersimpan melalui scan/verification/action trail, tindak lanjut manager menjadi terstruktur, data monitoring menjadi lebih siap untuk dashboard, dan fondasi analytics menjadi lebih kuat. Namun, beberapa bagian masih berada pada tahap finalisasi backend contract dan implementasi teknis.
