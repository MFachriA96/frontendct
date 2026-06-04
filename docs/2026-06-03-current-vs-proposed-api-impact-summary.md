# Current vs Proposed API Impact Summary

Date: 2026-06-03
Purpose: quick backend alignment summary before implementation
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-box-entity-backend-proposal.md`
- `docs/2026-06-03-persisted-status-and-transition-proposal.md`
- `docs/2026-06-03-verification-contract-and-discrepancy-rules.md`
- `docs/2026-06-03-manager-action-and-notification-contract.md`
- `docs/2026-06-03-receiving-inbound-endpoint-contract.md`

## Purpose

Dokumen ini merangkum:
- API / model backend yang ada sekarang
- perubahan yang diusulkan
- endpoint mana yang tetap
- endpoint mana yang perlu diubah
- endpoint mana yang baru

## Short Summary

### Current backend state

Saat ini backend masih:
- detail-centric
- QR masih melekat ke `OutboundDetail`
- scan dan discrepancy logic masih bertumpu pada `ID_outbound_detail`
- receiving flow belum benar-benar box-centric

### Proposed backend state

Backend diarahkan menjadi:
- box-centric untuk receiving
- QR dimiliki `OutboundBox`
- verify dilakukan per box
- discrepancy tetap boleh agregat per detail dulu
- manager action dan notification lebih terstruktur

## A. Entities / Data Model Impact

## Current

Entity utama yang ada:
- `Outbound`
- `OutboundDetail`
- `Inbound`
- `InboundDetail`
- `ScanSession`
- `Discrepancy`
- `DiscrepancyAction`
- `DokumenR1`
- `Foto`

### Important current behavior

- `qr_token` ada di `OutboundDetail`
- `sudah_discan`, `waktu_discan`, `discan_oleh` ada di `OutboundDetail`
- `ScanSession` mengacu ke `ID_outbound_detail`
- `Discrepancy` membandingkan per `OutboundDetail` vs `InboundDetail`

## Proposed

Tambahan entity baru:
- `OutboundBox`

### New responsibility split

- `OutboundDetail`
  item-level manifest

- `OutboundBox`
  physical box-level identity and scan state

- `InboundDetail`
  tetap agregat per item/detail untuk fase awal

- `Discrepancy`
  tetap agregat per detail untuk fase awal

## Impact

### Must add

- tabel baru: `tabel_outbound_box`
- model baru: `OutboundBox`

### Should move from OutboundDetail to OutboundBox

- `qr_token`
- `sudah_discan`
- `waktu_discan`
- `discan_oleh`

### Should add to ScanSession

- `ID_outbound_box`

## B. Shipment / Receiving Flow Impact

## Current

Current flow backend secara garis besar:
- vendor create outbound
- vendor submit outbound
- QR dibuat per detail
- inbound scan membaca `OutboundDetail.qr_token`
- discrepancy dibuat dari `OutboundDetail` vs `InboundDetail`

## Proposed

Flow baru:
- vendor create draft
- vendor submit outbound
- backend generate `OutboundBox` per detail
- QR dibuat per box
- scan lookup ke `OutboundBox`
- verify dilakukan per box
- finalize inbound menentukan `missing`
- discrepancy tetap diaggregate ke detail untuk fase awal

## C. Existing Endpoints That Can Stay

Endpoint yang bisa tetap ada dengan penyesuaian response/logic:

### 1. `POST /api/outbound`

Tetap ada.

Perubahan:
- target warehouse wajib
- draft persisted behavior ditegaskan
- backend hitung box nanti saat submit

### 2. `POST /api/outbound/{id}/submit`

Tetap ada.

Perubahan:
- bukan cuma update status
- harus generate `OutboundBox`
- QR dibuat per box

### 3. `GET /api/outbound`

Tetap ada.

Perubahan:
- status dan discrepancy flags harus mengikuti source of truth baru

### 4. `GET /api/discrepancy`

Tetap ada.

Perubahan:
- latest action semantics harus lebih konsisten

### 5. `POST /api/discrepancy/{id}/action`

Tetap ada.

Perubahan:
- action types diperluas/dirapikan
- efek domain diperjelas

## D. Existing Endpoints That Need Major Logic Change

## 1. `GET /api/outbound/{id}/qr-token`

### Current

Mengembalikan QR berbasis detail/token yang masih ambigu terhadap box.

### Proposed

Harus return box-level payload:
- `ID_outbound_box`
- `box_code`
- `box_sequence`
- `expected_qty_in_box`
- `qr_token`

### Impact level

`High`

## 2. Current inbound scan endpoint

Contoh existing flow:
- `POST /api/inbound/scan-qr`

### Current

Masih berpijak ke detail-centric scan.

### Proposed

Harus box-centric:
- resolve by `OutboundBox.qr_token`
- validate warehouse scope
- update box state
- return expected box content

### Impact level

`High`

## 3. Current manual verification flow

### Current

Verification dipisah dari scan dan masih terasa item/detail-centric.

### Proposed

Verification harus didesain sebagai box verification flow.

### Impact level

`High`

## 4. Discrepancy generation service

### Current

Masih membandingkan berdasarkan `quantity_outbound` detail lawan `quantity_inbound` detail.

### Proposed

Tetap boleh aggregate ke detail, tapi sumber datanya harus datang dari hasil verify per box.

### Impact level

`High`

## E. New Endpoints Recommended

Endpoint baru yang direkomendasikan:

### 1. `GET /api/gudang/options`

Purpose:
- warehouse dropdown untuk vendor form

### 2. `GET /api/receiving/queue`

Purpose:
- shipment queue per gudang untuk receiving officer

### 3. `GET /api/receiving/{outboundId}`

Purpose:
- open receiving detail / restore active context

### 4. `POST /api/receiving/scan-box`

Purpose:
- box-centric QR scan

### 5. `POST /api/receiving/verify-box`

Purpose:
- submit actual verification per box

### 6. `POST /api/receiving/{inboundId}/finalize`

Purpose:
- finalize receiving
- determine `missing`
- create/update discrepancy

### 7. `POST /api/receiving/recount`

Purpose:
- reopen receiving verification context for manager recount

### 8. `GET /api/receiving/{inboundId}/boxes`

Purpose:
- optional helper to show box statuses

## F. Status Model Impact

## Current

Status model masih belum sepenuhnya dibedakan antara:
- shipment progression
- scan progression
- discrepancy resolution

## Proposed

Pisahkan:
- shipment status
- box status
- inbound/receiving status
- discrepancy comparison status
- discrepancy action status

## Impact

### Must clarify

- persisted status mana yang canonical
- derived bucket mana yang hanya untuk dashboard

## G. Notification Impact

## Current

Notification sudah ada, tetapi masih belum sepenuhnya dibangun atas domain event yang terstruktur.

## Proposed

Notification should explicitly support:
- discrepancy detected
- discrepancy approved
- discrepancy hold
- discrepancy recount requested
- discrepancy returned
- R1 generated

## Impact level

`Medium`

## H. FE Impact Summary

Backend changes ini akan berdampak ke FE:

### Vendor FE

- butuh warehouse options endpoint
- butuh QR payload box-level

### Receiving FE

- akan berubah paling besar
- dari tabbed dashboard menjadi receiving task flow
- butuh queue, scan, verify, finalize contract

### Manager FE

- butuh latest action semantics yang lebih jelas
- butuh manager action outcome yang konsisten

## I. Migration / Refactor Impact Summary

## Low impact

- tetap mempertahankan outbound create/update basic concept
- tetap mempertahankan discrepancy list concept

## Medium impact

- vendor product and warehouse validation
- notification semantics
- manager action semantics

## High impact

- QR generation logic
- scan endpoint logic
- receiving flow contract
- box entity introduction
- discrepancy generation source logic

## J. Recommended Implementation Order

Urutan yang direkomendasikan:

1. tambah `OutboundBox` entity dan migration
2. ubah submit outbound untuk generate box rows
3. ubah QR token endpoint menjadi box-level
4. tambahkan receiving queue endpoint
5. tambahkan scan-box endpoint
6. tambahkan verify-box endpoint
7. tambahkan finalize receiving logic
8. rapikan discrepancy generation
9. rapikan manager action and notifications

## K. Final Conclusion

### What stays

Tetap dipertahankan:
- outbound concept
- discrepancy concept
- manager action endpoint concept

### What changes significantly

Berubah signifikan:
- QR ownership
- scan flow
- receiving verification flow
- progress model

### What is new

Baru:
- `OutboundBox`
- receiving queue contract
- box-level verify contract
- finalize receiving contract

## Recommended Use

Pakai dokumen ini sebagai ringkasan cepat untuk backend session:
- kalau mau tahu impact besar apa saja
- kalau mau tahu endpoint mana yang aman dipertahankan
- kalau mau tahu area mana yang perlu refactor besar
