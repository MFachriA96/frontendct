# Backend Final Decisions

Date: 2026-06-03
Status: accepted baseline for backend implementation planning
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-gap-validation-checklist-before-be-session.md`
- `docs/2026-06-03-box-entity-backend-proposal.md`
- `docs/2026-06-03-persisted-status-and-transition-proposal.md`
- `docs/2026-06-03-verification-contract-and-discrepancy-rules.md`
- `docs/2026-06-03-manager-action-and-notification-contract.md`
- `docs/2026-06-03-receiving-inbound-endpoint-contract.md`
- `docs/2026-06-03-current-vs-proposed-api-impact-summary.md`

## Purpose

Dokumen ini mengubah hasil sesi alignment dari status `proposal` menjadi `decision baseline`.
Artinya:
- item di bagian `accepted` dianggap keputusan kerja
- item di bagian `deferred` boleh ditunda tanpa memblokir fase implementasi pertama
- item di bagian `rejected` tidak dipakai lagi sebagai arah desain

## Scope

Keputusan final ini berlaku untuk:
- flow vendor shipment manifest
- box-level QR generation
- receiving / scan / verify flow
- discrepancy generation
- manager action
- notification dan dashboard data source

Dokumen ini tidak membahas:
- styling frontend
- rollout production
- observability enterprise-grade

## Accepted Decisions

### 1. Shipment tetap menjadi root document

Model utama tetap:
- `Outbound` sebagai shipment header
- `OutboundDetail` sebagai manifest item-level

Alasan:
- struktur existing backend sudah berpusat di `Outbound`
- dashboard vendor/manager dan relasi discrepancy saat ini sudah bertumpu pada shipment
- perubahan ke model baru total tidak perlu untuk fase ini

### 2. Box menjadi entitas backend yang eksplisit

Entity baru yang diterima:
- `OutboundBox`

Tanggung jawabnya:
- merepresentasikan box fisik
- menyimpan `qr_token` per box
- menyimpan `expected_qty_in_box`
- menyimpan status scan / verify di level box

Implikasi:
- `1 QR = 1 box`
- `OutboundDetail` tidak lagi menjadi source of truth untuk scan state

### 3. `draft` dan `submitted` diperlakukan berbeda

Decision:
- `POST /api/outbound` menyimpan draft persisted
- `POST /api/outbound/{id}/submit` melakukan final validation, lock data, dan generate box rows

Makna status:
- `draft`
  masih editable, belum terlihat sebagai queue receiving resmi
- `submitted`
  manifest final, QR siap, shipment masuk queue gudang tujuan

### 4. `target_warehouse_id` wajib di shipment

Decision:
- vendor wajib memilih gudang tujuan dari master warehouse
- backend menyimpan `target_warehouse_id` di shipment
- receiving queue dibatasi oleh gudang tujuan tersebut

Rejected pattern:
- input nama gudang manual
- shipment tanpa tujuan gudang yang eksplisit

### 5. Receiving officer bekerja dengan warehouse scope

Decision:
- receiving officer hanya boleh melihat dan memproses shipment untuk gudang dalam scope-nya
- manager tetap bisa melihat lintas gudang

Untuk fase pertama:
- minimal support `1 officer = 1 gudang`
- desain data boleh disiapkan agar bisa multi-warehouse nanti

### 6. QR dikelola per box, bukan per shipment dan bukan per detail

Decision:
- QR di-generate saat submit
- QR ditempel di luar tiap box
- QR merefer ke `OutboundBox`

Field minimum payload box:
- `ID_outbound_box`
- `ID_outbound_detail`
- `box_sequence`
- `box_code`
- `expected_qty_in_box`
- `qr_token`

### 7. Receiving flow canonical adalah `scan -> verify -> next box`

Decision:
- receiving officer bukan hanya scan pasif
- setelah scan berhasil, backend harus bisa mengembalikan expected content box
- verifikasi dilakukan per box

Data verifikasi minimum:
- `actual_qty`
- `condition_status`
- `notes`
- `photo_ids`

### 8. `missing` difinalkan saat receiving finalize, bukan di tengah proses

Decision:
- `match`, `mismatch`, `over` bisa muncul dari hasil verifikasi box
- `missing` baru dianggap final saat shipment / receiving session difinalisasi

Alasan:
- menghindari false missing ketika box lain belum sempat diproses
- lebih sesuai praktik receiving industri

### 9. Discrepancy tetap disimpan agregat per detail untuk fase pertama

Decision:
- sumber operasional receiving adalah `OutboundBox`
- tetapi persistence discrepancy fase pertama tetap boleh agregat per:
  - `ID_outbound_detail`
  - `ID_inbound_detail`

Alasan:
- mengurangi blast radius perubahan model
- kompatibel dengan dashboard dan discrepancy logic existing

Catatan:
- audit dan progress receiving tetap box-centric
- discrepancy box-level eksplisit bisa jadi fase berikutnya

### 10. Manager action dipisah dari status perbandingan

Decision:
- `Discrepancy.status` tetap source of truth hasil compare:
  - `match`
  - `mismatch`
  - `missing`
  - `over`
- `DiscrepancyAction` menyimpan tindak lanjut bisnis

Action yang diterima:
- `approve`
- `hold`
- `recount`
- `return`

### 11. Canonical receiving endpoints memakai prefix `/api/receiving`

Decision:
endpoint baru yang dianggap canonical:
- `GET /api/receiving/queue`
- `GET /api/receiving/{outboundId}`
- `POST /api/receiving/scan-box`
- `POST /api/receiving/verify-box`
- `POST /api/receiving/{inboundId}/finalize`

Catatan transisi:
- endpoint lama `/api/inbound/*` dan `/api/scan-session/*` boleh dipertahankan sementara
- tetapi source of truth baru harus diarahkan ke flow canonical ini

### 12. Existing dashboard analytics tetap dipertahankan, tetapi source of truth dirapikan

Decision:
- dashboard manager/vendor tetap hidup
- data summary dan analytics harus membaca status canonical yang baru
- FE tidak boleh menebak status sendiri

### 13. Notification tetap event-driven

Event minimum yang diterima:
- shipment submitted
- discrepancy detected
- discrepancy action taken
- recount requested
- return initiated
- R1 generated

### 14. Legacy columns boleh dipertahankan sementara selama cutover

Decision:
- kolom scan-related lama di `OutboundDetail` boleh dibiarkan sementara untuk compatibility
- tetapi jangan lagi dipakai sebagai source of truth setelah `OutboundBox` aktif

Alasan:
- mengurangi risiko migrasi besar sekaligus
- mempermudah transisi FE dan service existing

## Deferred Decisions

Item di bawah ini dianggap penting, tetapi tidak memblokir implementasi fase pertama.

### 1. Multi-warehouse scope per user

Fase pertama cukup:
- `1 receiving officer = 1 gudang`

Deferred:
- user dengan daftar beberapa gudang

### 2. Multiple receiving sessions per shipment

Belum dikunci apakah:
- satu shipment boleh diterima bertahap di banyak sesi
- atau fase pertama membatasi satu shipment satu sesi receiving

Baseline implementasi fase pertama:
- satu shipment satu receiving flow aktif

### 3. Box-level discrepancy persistence

Fase pertama:
- discrepancy tetap agregat per detail

Deferred:
- menyimpan discrepancy eksplisit per box

### 4. GPS presisi / device metadata penuh

Fase pertama cukup:
- timestamp
- actor
- warehouse
- notes
- photo evidence

Deferred:
- GPS akurat
- fingerprint device lengkap

### 5. R1 generation policy otomatis

Belum dikunci apakah:
- `return` otomatis membuat R1
- atau manager membuat R1 terpisah

Baseline fase pertama:
- action `return` tidak harus auto-create R1

### 6. Custom product approval workflow

Sudah disepakati:
- `master product` sebagai jalur utama
- `custom product` sebagai exception

Yang masih deferred:
- approval workflow backend untuk custom product jangka panjang

### 7. Dimension `line` pada analytics

Dashboard discrepancy by vendor/date/part sudah masuk baseline.

Deferred:
- apakah `line` berarti production line, receiving line, atau area internal tertentu

## Rejected Decisions

### 1. QR per shipment

Ditolak karena:
- tidak bisa mendukung scan per box
- tidak bisa mendukung progress receiving yang presisi
- terlalu lemah untuk discrepancy detection yang cepat

### 2. QR tetap di level `OutboundDetail`

Ditolak karena:
- satu detail bisa punya banyak box
- model sekarang mencampur item manifest dan box fisik
- tidak cukup untuk `1 QR = 1 box`

### 3. Free text warehouse

Ditolak karena:
- rawan typo
- routing receiving tidak pasti
- analytics per gudang jadi kotor

### 4. Receiving officer hanya scan tanpa verify

Ditolak karena:
- scan menjadi formalitas
- issue baru tetap ketahuan terlambat
- audit trail per box menjadi lemah

### 5. `missing` ditetapkan saat box pertama bermasalah

Ditolak karena:
- terlalu dini
- bisa salah ketika shipment masih aktif diproses

### 6. FE menjadi source of truth status

Ditolak karena:
- riskan inkonsistensi antar role
- dashboard dan scanner bisa menampilkan state berbeda
- backend harus tetap memegang status canonical

## Implementation Freeze Points

Sebelum coding backend dimulai, tim BE dan FE harus menganggap poin di bawah ini sudah terkunci:
- `OutboundBox` wajib dibuat
- `qr_token` source of truth pindah ke box
- target warehouse wajib
- receiving canonical flow adalah `scan -> verify -> next`
- `missing` final di finalize
- manager action mendukung `approve / hold / recount / return`
- canonical receiving endpoints memakai `/api/receiving`

## Next Step

Langkah setelah dokumen ini:
1. gunakan keputusan ini sebagai baseline
2. implementasikan sesuai `docs/superpowers/plans/2026-06-03-backend-shipment-verification-refactor.md`
3. setelah backend stabil, baru lanjutkan refactor FE scanner agar mengikuti flow baru
