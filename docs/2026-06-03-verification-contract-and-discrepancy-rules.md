# Verification Contract and Discrepancy Rules

Date: 2026-06-03
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-box-entity-backend-proposal.md`
- `docs/2026-06-03-persisted-status-and-transition-proposal.md`

## Purpose

Dokumen ini mengunci usulan untuk:
- contract verifikasi box
- entity yang diupdate saat scan dan verify
- kapan discrepancy dibuat
- bagaimana rule `match`, `mismatch`, `missing`, dan `over`
- kapan shipment masuk `verified` atau `discrepancy`

## Core Principle

Receiving flow yang dipilih adalah:
- `scan 1 box`
- `verify 1 box`
- `submit`
- `next box`

Artinya contract backend harus:
- box-centric saat scan dan verify
- tetap bisa menghasilkan agregasi item-level dan shipment-level

## Domain Assumption

Asumsi yang dipakai dalam proposal ini:
- `1 QR = 1 box`
- 1 box merepresentasikan expected content tertentu
- verification dilakukan per box
- discrepancy fase awal tetap boleh diakumulasikan ke level detail/item

## Recommended Verification Flow

## Step 1: Scan box

Input:
- `qr_token`
- authenticated receiving user
- active warehouse context

Backend harus:
- lookup `OutboundBox`
- validasi user scope
- validasi shipment state
- validasi duplicate scan
- create or update receiving session context

Output:
- expected content box
- progress shipment
- state siap diverifikasi

## Step 2: Verify box

Input minimum:
- `qr_token` atau `ID_outbound_box`
- `actual_qty`
- `condition_status`
- `notes`
- optional photo evidence

Backend harus:
- baca expected qty dari `OutboundBox`
- simpan hasil verify
- update status box
- update receiving progress
- tentukan apakah issue ada atau tidak

## Recommended Endpoint Strategy

Untuk flow yang bersih, paling masuk akal memisahkan:

### 1. Scan endpoint

Contoh:
- `POST /api/inbound/scan-qr`

Tujuan:
- identify box
- validate QR
- open verification context

### 2. Verify endpoint

Contoh:
- `POST /api/inbound/verify-box`

Tujuan:
- submit actual verification result

### 3. Finalize receiving endpoint

Contoh:
- `POST /api/inbound/{id}/finalize`

Tujuan:
- menutup receiving session
- menghitung `missing` secara final
- membentuk status shipment akhir receiving

## Why finalize endpoint is important

Karena status `missing` sebaiknya tidak diputuskan terlalu cepat.

Kalau belum finalize:
- bisa jadi box lain belum datang
- bisa jadi shipment masih partial receiving

Jadi:
- `match`, `mismatch`, `over` bisa muncul saat verify box
- `missing` lebih aman diputuskan saat finalize

## Recommended Verification Payload

Usulan request:

```json
{
  "qr_token": "uuid-3",
  "actual_qty": 5,
  "condition_status": "normal",
  "notes": "",
  "photo_ids": []
}
```

Alternative:

```json
{
  "ID_outbound_box": 3003,
  "actual_qty": 5,
  "condition_status": "normal",
  "notes": "",
  "photo_ids": []
}
```

## Recommendation on identifier

Rekomendasiku:
- FE kirim `qr_token` saat hasilnya masih berasal dari scan segar
- backend resolve ke `ID_outbound_box`
- untuk edit/retry, backend bisa expose `ID_outbound_box`

## Required Verification Fields

Minimal field yang direkomendasikan:
- `actual_qty`
- `condition_status`
- `notes`

Foto:
- optional saat normal
- strongly recommended atau required saat issue

## Recommended Condition Status

Enum sederhana:
- `normal`
- `damaged`
- `opened`
- `other`

Catatan:
- condition status tidak sama dengan discrepancy status
- condition lebih ke kondisi fisik
- discrepancy lebih ke hasil comparison expected vs actual

## Recommended Verification Response

```json
{
  "success": true,
  "data": {
    "box": {
      "ID_outbound_box": 3003,
      "box_code": "BOX-101-003",
      "status": "verified",
      "expected_qty_in_box": 5,
      "actual_qty": 5,
      "condition_status": "normal"
    },
    "verification_result": {
      "status": "match",
      "issue_flagged": false
    },
    "shipment_progress": {
      "expected_boxes": 10,
      "scanned_boxes": 4,
      "verified_boxes": 4,
      "issue_boxes": 1,
      "remaining_boxes": 6
    },
    "shipment_status": "verifying",
    "inbound_status": "verification_in_progress"
  }
}
```

## Recommended Entity Updates on Scan

Saat scan sukses:

### OutboundBox

Update:
- `scan_status = scanned`
- `scanned_at = now`
- `scanned_by = current_user`

### Receiving session / inbound

Update:
- progress scan
- status receiving bisa bergeser ke `verification_in_progress`

### Optional scan log / scan session

Simpan event:
- box mana discan
- siapa scan
- kapan

## Recommended Entity Updates on Verify

Saat verify submit:

### OutboundBox

Jika clear:
- `scan_status = verified`

Jika ada issue:
- `scan_status = issue_flagged`

### Verification record

Perlu ada tempat simpan hasil verify box.

Ada dua opsi:

#### Opsi A: tambah tabel verification khusus

Contoh:
- `tabel_box_verification`

Kelebihan:
- paling bersih
- audit trail jelas

#### Opsi B: pakai `ScanSession` + `InboundDetail`

Kelebihan:
- perubahan lebih kecil

Rekomendasiku:
- untuk jangka sehat, Opsi A lebih bagus
- untuk MVP cepat, Opsi B masih bisa dipakai

## Recommendation for MVP

Jika ingin kompromi:
- `ScanSession` menyimpan event scan
- `InboundDetail` tetap menyimpan agregasi qty aktual
- `OutboundBox` menyimpan expected dan status box

Tetapi secara arsitektur jangka menengah, verification record khusus akan lebih baik.

## Recommended Discrepancy Rules

## Rule 1: Match

Kondisi:
- `actual_qty == expected_qty_in_box`
- tidak ada issue yang menyebabkan box harus ditahan secara kuantitas

Hasil:
- box result = clear
- box status = `verified`

## Rule 2: Over

Kondisi:
- `actual_qty > expected_qty_in_box`

Hasil:
- box status = `issue_flagged`
- discrepancy category = `over`

## Rule 3: Mismatch

Kondisi:
- `actual_qty < expected_qty_in_box`
- tetapi tidak diputuskan sebagai `missing final`

Atau:
- ada ketidaksesuaian lain yang tidak masuk `over`

Hasil:
- box status = `issue_flagged`
- discrepancy category = `mismatch`

## Rule 4: Missing

Kondisi yang direkomendasikan:
- box expected tidak pernah selesai diverifikasi sampai shipment / receiving di-finalize
- atau qty final untuk item/box tetap nol atau kurang dari yang seharusnya setelah receiving ditutup

Rekomendasi penting:
- `missing` jangan diputuskan langsung saat proses masih berjalan
- `missing` diputuskan saat `finalize receiving`

## Box-level vs Detail-level discrepancy

### Phase 1 recommendation

Untuk fase awal:
- discrepancy tetap disimpan di level detail/item
- backend menghitung hasil box verification lalu mengagregasikannya

### Why this is acceptable

Karena:
- lebih kecil perubahan ke model discrepancy sekarang
- masih cukup untuk dashboard manager/vendor

### Limitation

Kekurangannya:
- audit box-level discrepancy tidak sekuat entity discrepancy per box

## Recommended Aggregation Logic

Misalnya satu `OutboundDetail` punya 3 box:
- box 1 expected 10, actual 10
- box 2 expected 10, actual 8
- box 3 expected 5, actual 5

Agregasi detail:
- expected total = 25
- actual total = 23
- status detail = `mismatch`

Kalau box 3 tidak pernah diverifikasi sampai finalize:
- expected total = 25
- actual total tetap 18 atau 20 sesuai hasil
- final status detail bisa `missing` tergantung rule yang disepakati

## Recommended Finalize Receiving Behavior

Finalize receiving adalah titik penting.

Saat finalize:
- pastikan receiving session memang siap ditutup
- hitung box yang belum verified
- tentukan box mana yang final `missing`
- update agregasi `InboundDetail`
- generate or update discrepancy rows
- tentukan status shipment akhir:
  - `verified`
  - `discrepancy`

## Recommended Finalize Checks

Sebelum finalize, backend harus cek:
- apakah user berhak finalize
- apakah receiving session masih aktif
- apakah semua box expected sudah memiliki hasil jelas
  - verified
  - issue flagged
  - atau explicitly unresolved

Jika belum:
- reject finalize
- atau tandai unresolved boxes sebagai candidate missing

## Recommended Shipment Outcome Logic

### Shipment becomes `verified`

Jika:
- semua box selesai
- tidak ada discrepancy terbuka

### Shipment becomes `discrepancy`

Jika:
- ada hasil non-match
- ada issue flagged
- ada missing final
- ada over final

### Shipment becomes `completed`

Jika:
- shipment sudah clear setelah resolution manager
- atau semua proses shipment selesai tanpa issue

## Recommended Error Reasons for Verification

Minimal backend response perlu bisa membedakan:
- invalid QR
- duplicate scan
- wrong warehouse
- shipment not receivable
- box already verified
- box not scanned yet
- invalid quantity
- finalize not allowed

## Recommendation on Current Backend Refactor Direction

Karena backend saat ini masih banyak detail-centric:
- jangan langsung paksakan discrepancy per box
- mulai dari box entity + box status + verify contract
- agregasi discrepancy tetap di detail dulu

Urutan aman:
1. tambah `OutboundBox`
2. ubah scan ke box
3. ubah verify ke box
4. tambah finalize logic
5. baru evaluasi apakah discrepancy perlu box-level persistence

## Open Questions To Lock

Masih perlu diputuskan:

1. apakah verification record perlu tabel khusus sejak awal
2. apakah receiving boleh finalize jika ada box belum discan
3. apakah mismatch under-quantity langsung dianggap issue atau menunggu finalize
4. apakah photo wajib saat issue
5. bagaimana recount mempengaruhi verification result lama

## Recommendation

Untuk backend alignment:
- setujui verification flow per box
- setujui finalize endpoint sebagai penentu `missing`
- pertahankan discrepancy persistence di level detail dulu
- biarkan box-level state jadi sumber operasional receiving
