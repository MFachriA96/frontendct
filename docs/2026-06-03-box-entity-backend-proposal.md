# Box Entity Backend Proposal

Date: 2026-06-03
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-gap-validation-checklist-before-be-session.md`
- `docs/dashboard-manager-vendor-api-contract.md`

## Purpose

Dokumen ini menjelaskan proposal formal untuk menambahkan entitas `box` secara eksplisit di backend.

Tujuan utamanya:
- membuat model `1 QR = 1 box` benar-benar valid
- memisahkan item manifest dari unit fisik scan
- memperjelas expected content per box
- menyederhanakan flow receiving dan QR validation

## Current Problem

Saat ini backend masih `detail-centric`.

Kondisi sekarang:
- `tabel_outbound_detail` menyimpan:
  - `quantity_outbound`
  - `quantity_per_box`
  - `jumlah_box`
  - `qr_token`
  - status scan
- `qr_token` saat ini melekat ke `OutboundDetail`
- `ScanSession`, `InboundDetail`, dan `Discrepancy` masih banyak mengacu ke `ID_outbound_detail`

Masalah dari model ini:
- satu detail bisa punya `jumlah_box > 1`
- tetapi hanya ada satu `qr_token`
- artinya box fisik belum direpresentasikan eksplisit

Akibatnya:
- expected content per box tidak benar-benar jelas
- box terakhir dengan partial quantity sulit dimodelkan dengan benar
- duplicate scan dan progress box-level tidak presisi
- receiving flow jadi sulit benar-benar box-centric

## Decision Summary

Rekomendasi:
- tambahkan entitas eksplisit `OutboundBox`
- jadikan `qr_token` milik `OutboundBox`, bukan `OutboundDetail`
- jadikan receiving flow berbasis box

## Proposed New Entity

Nama entitas:
- `OutboundBox`

Nama tabel yang direkomendasikan:
- `tabel_outbound_box`

Alasan:
- konsisten dengan naming yang ada
- tetap jelas bahwa box ini bagian dari outbound shipment

## Proposed Relationships

### 1. Outbound

`Outbound` memiliki banyak `OutboundDetail`

### 2. OutboundDetail

`OutboundDetail` memiliki banyak `OutboundBox`

### 3. OutboundBox

`OutboundBox` milik satu `OutboundDetail`

Secara tidak langsung:
- satu box milik satu shipment
- satu box milik satu item detail

### 4. Inbound

`Inbound` tetap milik satu `Outbound`

### 5. ScanSession

`ScanSession` sebaiknya mengacu ke `OutboundBox`

### 6. InboundDetail

`InboundDetail` untuk tahap awal tetap sebagai agregasi per item/detail

### 7. Discrepancy

Untuk tahap awal tetap boleh berbasis:
- `ID_outbound_detail`
- `ID_inbound_detail`

Opsional fase berikutnya:
- tambahkan referensi `ID_outbound_box` untuk audit lebih granular

## Proposed Table Schema

Tabel baru:
- `tabel_outbound_box`

Field minimum yang direkomendasikan:

- `ID_outbound_box`
- `ID_outbound_detail`
- `box_sequence`
- `box_code`
- `expected_qty_in_box`
- `qr_token`
- `scan_status`
- `scanned_at`
- `scanned_by`
- `created_at`
- `updated_at`

## Field Explanations

### `ID_outbound_box`

Primary key box.

### `ID_outbound_detail`

Foreign key ke `tabel_outbound_detail`.

Fungsi:
- menghubungkan box ke item manifest asalnya

### `box_sequence`

Nomor urut box untuk satu detail.

Contoh:
- 1
- 2
- 3

### `box_code`

Identifier yang human-readable.

Contoh:
- `BOX-101-001`
- `BOX-101-002`

Fungsi:
- tampil di UI
- tercetak di label
- jadi fallback visual jika QR bermasalah

### `expected_qty_in_box`

Qty yang diharapkan ada dalam box itu.

Field ini sangat penting untuk:
- last partial box
- expected content card saat scan
- verifikasi actual vs expected

### `qr_token`

Token unik untuk QR box.

Harus:
- unique
- tidak nullable setelah submit

### `scan_status`

Status scan box.

Usulan enum sederhana:
- `pending`
- `scanned`
- `verified`
- `issue_flagged`

Catatan:
- ini status box-level
- jangan dicampur dengan shipment status

### `scanned_at`

Timestamp saat box discan.

### `scanned_by`

User Epson yang scan.

### `created_at`, `updated_at`

Untuk audit dan traceability.

## Example Data

Contoh manifest:
- item: Kaleng
- total qty: 25
- qty per box: 10

Maka `OutboundDetail`:
- `quantity_outbound = 25`
- `quantity_per_box = 10`
- `jumlah_box = 3`

Maka `OutboundBox` yang dibentuk:

1. Box 1
- `box_sequence = 1`
- `expected_qty_in_box = 10`

2. Box 2
- `box_sequence = 2`
- `expected_qty_in_box = 10`

3. Box 3
- `box_sequence = 3`
- `expected_qty_in_box = 5`

## Fields That Should Stay in OutboundDetail

Tetap di `tabel_outbound_detail`:
- `quantity_outbound`
- `quantity_per_box`
- `jumlah_box`

Alasan:
- detail tetap jadi source manifest item-level
- box adalah hasil turunan dari detail

## Fields That Should Move Out of OutboundDetail

Sebaiknya dipindahkan dari `OutboundDetail` ke `OutboundBox`:
- `qr_token`
- `sudah_discan`
- `waktu_discan`
- `discan_oleh`

Alasan:
- field-field itu milik box fisik, bukan milik detail item

## Proposed Behavior Changes

## 1. On draft create

Saat draft dibuat:
- `Outbound`
- `OutboundDetail`

Belum perlu membuat `OutboundBox`.

Kenapa:
- draft masih bisa diedit
- tidak perlu generate token terlalu awal

## 2. On submit outbound

Saat submit:
- validate final payload
- lock shipment
- generate `OutboundBox` rows dari setiap `OutboundDetail`
- generate `qr_token` per box

Jadi box dibentuk pada saat `submit`, bukan saat `draft`.

## 3. On QR fetch

Endpoint QR sebaiknya membaca dari `tabel_outbound_box`, bukan dari `tabel_outbound_detail`.

Response harus box-level.

## 4. On scan

Saat QR discan:
- lookup berdasarkan `OutboundBox.qr_token`
- validasi warehouse target
- validasi shipment status
- validasi apakah box sudah discan

Kalau valid:
- update `scan_status`
- simpan `scanned_at`
- simpan `scanned_by`

## 5. On verification

Receiving officer verify box:
- backend baca expected qty dari `OutboundBox`
- backend simpan hasil actual
- backend update progress receiving

## Implication for Existing Models

## OutboundDetail

Perlu relasi baru:
- `boxes()`

## OutboundBox

Perlu model baru:
- `OutboundBox.php`

Relasi minimum:
- `outboundDetail()`
- `scanner()`

Opsional:
- `scanSessions()`

## ScanSession

Sebaiknya tambah:
- `ID_outbound_box`

Idealnya `ScanSession` mengacu ke box, bukan hanya detail.

Untuk fase transisi:
- `ID_outbound_detail` boleh dipertahankan sementara
- tetapi `ID_outbound_box` menjadi referensi utama

## InboundDetail

Untuk fase awal:
- tetap agregat per item/detail
- nilai aggregate berasal dari box verification

Ini pendekatan kompromi yang aman supaya perubahan tidak terlalu besar sekaligus.

## Discrepancy

Untuk fase awal:
- tetap per `ID_outbound_detail + ID_inbound_detail`

Kenapa:
- lebih kecil perubahan domain
- cukup untuk MVP/capstone

Opsional fase berikutnya:
- tambah `ID_outbound_box` jika ingin audit box-level discrepancy

## Proposed Migration Strategy

Strategi yang paling aman:

### Step 1

Tambah tabel baru:
- `tabel_outbound_box`

### Step 2

Tambah model dan relasi:
- `OutboundBox`
- relasi dari `OutboundDetail`

### Step 3

Ubah logic `submitOutbound`
- generate rows box
- generate QR per box

### Step 4

Ubah endpoint QR
- ambil data dari box

### Step 5

Ubah scan flow
- lookup QR ke box

### Step 6

Ubah `ScanSession`
- tambah `ID_outbound_box`

### Step 7

Setelah transisi stabil, pertimbangkan hapus field lama dari `OutboundDetail`:
- `qr_token`
- `sudah_discan`
- `waktu_discan`
- `discan_oleh`

## Why This Proposal Is Recommended

Proposal ini paling cocok dengan keputusan flow yang sudah dikunci:
- `1 QR = 1 box`
- receiving berbasis box
- expected content per box
- mobile verification per box

Kalau box tetap tidak jadi entitas eksplisit:
- flow bisnis tetap bisa dipaksakan
- tapi model datanya akan rapuh
- last partial box sulit presisi
- backend contract akan penuh pengecualian

## Recommendation

Keputusan yang direkomendasikan untuk backend:

1. Setujui `OutboundBox` sebagai entitas resmi
2. Jadikan `qr_token` milik `OutboundBox`
3. Jadikan `ScanSession` box-centric
4. Pertahankan `InboundDetail` dan `Discrepancy` tetap agregat dulu untuk fase awal

## Open Questions

Masih perlu dikunci bersama backend:

1. Apakah `scan_status` cukup di `OutboundBox`, atau sebagian state lebih baik di `ScanSession`?
2. Apakah `box_code` digenerate sistem atau mengikuti format vendor?
3. Apakah shipment boleh partial receiving dalam banyak sesi?
4. Kapan box dianggap `verified`:
   - setelah scan?
   - setelah actual qty submit?
5. Apakah nanti discrepancy perlu ditambah referensi box-level?
