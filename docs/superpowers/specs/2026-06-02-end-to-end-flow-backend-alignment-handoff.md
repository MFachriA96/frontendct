# End-to-End Flow and Backend Alignment Handoff

Date: 2026-06-02
Status: Working source of truth for next BE alignment session
Audience:
- Product / flow alignment
- Frontend
- Backend

Related references:
- `docs/superpowers/specs/LAPORAN LEMBAR KERJA 3 - Capstone A.1 kel 3 (9).pdf`
- `docs/superpowers/specs/dashboard-manager-vendor-api-contract.md`
- `src/pages/VendorDashboard.jsx`
- `src/pages/ScanOfficerDashboard.jsx`
- `src/pages/ManagerDashboard.jsx`

## Purpose

Dokumen ini menyatukan keputusan dan rekomendasi utama untuk sistem verifikasi pengiriman dan penerimaan barang.

Tujuannya:
- menyamakan istilah
- mengunci flow bisnis utama
- menjelaskan pembagian tanggung jawab antar role
- menjelaskan implikasi ke backend contract
- menjadi bahan utama untuk sesi alignment dengan backend

Dokumen ini bukan detail implementasi UI final. Fokusnya adalah `flow + domain logic + API alignment`.

## Problem Being Solved

Masalah bisnis utamanya:
- vendor mengirim shipment dengan daftar box dan isi
- data pengiriman perlu dikunci secara digital setelah final
- Epson perlu membandingkan data outbound vendor dengan penerimaan aktual di gudang
- discrepancy harus cepat terlihat
- perlu bukti audit digital
- perlu tindak lanjut discrepancy yang terstruktur
- perlu monitoring per vendor, tanggal, gudang, dan part

## Core Business Decision Summary

Keputusan utama yang direkomendasikan:
- vendor membuat manifest shipment
- manifest disimpan sejak `draft`
- vendor wajib memilih `target warehouse`
- saat `submit`, manifest di-lock
- sistem generate `1 QR = 1 box`
- QR ditempel di luar box
- receiving officer bekerja via HP dengan flow `scan -> verify -> next box`
- manager menangani exception dan discrepancy resolution

## Domain Terms

Istilah yang harus dipakai konsisten:

### Shipment

Dokumen pengiriman dari vendor ke Epson.

Minimal berisi:
- shipment reference / no DO
- vendor
- target warehouse
- tanggal kirim
- estimasi tiba
- item details
- shipment status

### Manifest

Isi resmi shipment yang sudah disiapkan vendor.

Manifest mencakup:
- daftar item
- total qty per item
- qty per box
- breakdown box yang diturunkan sistem

### Shipment detail / outbound detail

Satu baris item di dalam shipment.

Contoh:
- part A
- total qty 25
- qty per box 10
- resulting box count 3

### Box record

Representasi fisik box yang diturunkan dari shipment detail.

Contoh:
- box 1 = item A, expected qty 10
- box 2 = item A, expected qty 10
- box 3 = item A, expected qty 5

### QR token

Identitas unik untuk satu box.

QR tidak boleh hanya token acak tanpa konteks. QR harus bisa ditelusuri ke:
- shipment
- box
- item expected
- qty expected
- target warehouse

### Inbound / receiving record

Data penerimaan di sisi Epson.

Minimal merekam:
- shipment yang sedang diterima
- gudang penerima
- petugas receiving
- waktu penerimaan
- progress receiving

### Verification

Langkah saat receiving officer mengonfirmasi hasil aktual box yang baru discan.

Contoh field:
- actual qty
- condition status
- notes
- photo evidence

### Discrepancy

Ketidaksesuaian antara manifest locked vendor dan hasil receiving aktual.

Status yang dipakai:
- `match`
- `mismatch`
- `missing`
- `over`

### Manager action

Tindak lanjut setelah discrepancy ditemukan.

Action yang direkomendasikan:
- `approve`
- `hold`
- `recount`
- `return`

## Roles and Responsibilities

### Vendor

Vendor bertugas:
- membuat shipment
- menyimpan draft
- submit shipment
- melihat status shipment
- melihat QR yang dihasilkan
- menerima notifikasi discrepancy atau tindak lanjut

Vendor tidak bertugas:
- memproses receiving
- resolve discrepancy

### Receiving Officer

Receiving officer bukan scanner pasif.

Receiving officer bertugas:
- memilih shipment yang relevan untuk gudangnya
- scan QR box
- melihat expected content
- mengisi actual qty
- memberi kondisi barang
- mengunggah bukti jika ada masalah

Flow receiving officer:
- `scan -> verify -> submit -> next`

### Manager

Manager bertugas:
- memonitor shipment dan discrepancy
- melihat issue yang perlu keputusan
- melakukan action:
  - `approve`
  - `hold`
  - `recount`
  - `return`
- melihat analytics lintas vendor / gudang

### Admin

Admin bertugas:
- membuat akun
- menghubungkan user vendor ke vendor entity
- menghubungkan user Epson ke warehouse scope
- mengelola master product
- mengelola warehouse

## Recommended End-to-End Business Flow

## Phase 1: Vendor creates shipment draft

Vendor mengisi:
- shipment reference / no DO
- dispatch date
- expected arrival date
- origin location
- target warehouse
- item list
- total qty
- qty per box

Manifest langsung dikirim ke backend saat draft dibuat.

Status:
- `draft`

Behavior:
- masih editable
- belum generate QR
- belum masuk queue Epson

## Phase 2: Submit and lock

Saat vendor submit:
- backend melakukan validasi final
- manifest di-lock
- sistem generate QR per box
- shipment masuk ke queue receiving gudang tujuan

Status:
- `submitted`

## Phase 3: Physical delivery

Saat barang sedang dikirim:
- shipment dapat dipandang sebagai `in_transit`

Monitoring:
- vendor bisa melihat progress
- Epson bisa mengetahui shipment yang sedang menuju gudang tertentu

## Phase 4: Receiving queue by warehouse

Di sisi Epson:
- receiving officer hanya melihat shipment sesuai `warehouse_scope`
- draft tidak boleh muncul
- shipment yang terlihat minimal `submitted` atau yang sudah mulai diproses di gudang itu

## Phase 5: Scan one box

Receiving officer scan QR.

Sistem melakukan validasi:
- token valid atau tidak
- box milik shipment mana
- target warehouse sesuai user atau tidak
- sudah pernah discan atau belum
- shipment masih boleh diproses atau sudah closed

Kalau berhasil:
- tampilkan expected content box

## Phase 6: Verify one box

Setelah scan berhasil, receiving officer mengonfirmasi:
- actual qty
- condition status
- notes jika perlu
- photo jika perlu

Result verification per box:
- `match`
- `mismatch`
- `missing`
- `over`

## Phase 7: Continue to next box

Setelah submit verification:
- progress shipment diperbarui
- user diarahkan ke box berikutnya

Pattern yang direkomendasikan:
- `scan 1 box`
- `verify 1 box`
- `submit`
- `next box`

## Phase 8: Shipment summary

Setelah semua box selesai diproses:
- tampil summary shipment
- tentukan apakah shipment:
  - all matched
  - completed with issues
  - requires manager review

## Phase 9: Manager review

Jika ada issue:
- shipment atau discrepancy masuk ke queue manager
- manager memilih action:
  - approve
  - hold
  - recount
  - return

## Phase 10: Completion

Jika semua beres:
- shipment ditutup sebagai selesai

Jika ada issue:
- kasus mengikuti action manager sampai resolved

## Vendor Input Rules

## Shipment-level fields

Wajib:
- `shipment_reference` atau `no_do`
- `dispatch_date`
- `expected_arrival_date`
- `origin_location`
- `target_warehouse_id`

Opsional:
- `notes`

Tidak diinput manual:
- `vendor_id`
- `vendor_name`
- `shipment_status`

## Item-level fields

Wajib:
- `product_mode`
- `quantity_outbound`
- `quantity_per_box`
- `unit`

Jika `product_mode = existing`:
- `product_id`

Jika `product_mode = custom`:
- `custom_product_name`
- optional `custom_product_code`

## Product strategy

Strategi yang direkomendasikan:
- `master product` sebagai jalur utama
- `custom product` sebagai exception

Kenapa:
- menjaga konsistensi analytics dan reconciliation
- tetap memberi ruang untuk produk baru atau kasus khusus

## Warehouse strategy

Vendor harus memilih gudang tujuan dari daftar sistem.

Aturan:
- warehouse tidak boleh free text
- simpan `warehouse_id`
- tampilkan `warehouse_name`

Opsional ke depan:
- vendor hanya boleh memilih warehouse yang diizinkan admin

## Draft and Submit Logic

## Draft

Makna:
- data manifest sudah tersimpan
- masih editable
- belum generate QR
- belum terlihat di queue receiving Epson

## Submit

Makna:
- validasi final
- lock data
- generate QR per box
- route shipment ke queue gudang tujuan

## Why draft should be persisted

Alasannya:
- vendor tidak kehilangan data
- backend sudah punya draft manifest
- submit menjadi titik finalisasi yang tegas
- FE dan BE tidak perlu membedakan create pertama vs final create

## Box and QR Model

Model yang direkomendasikan:
- `1 QR = 1 box`
- `1 box` sebaiknya `1 part type` untuk MVP

Vendor cukup input:
- total qty
- qty per box

Backend menghitung:
- jumlah box
- breakdown expected qty per box

Contoh:
- total qty = 25
- qty per box = 10

Hasil:
- box 1 = 10
- box 2 = 10
- box 3 = 5

Data box-level yang dibutuhkan FE:
- `box_id`
- `box_sequence`
- `ID_outbound_detail`
- `ID_barang`
- `nama_barang`
- `expected_qty_in_box`
- `unit`
- `qr_token`

## Status Model

Status perlu dipisah secara domain agar tidak campur.

## Shipment status

Usulan:
- `draft`
- `submitted`
- `in_transit`
- `arrived`
- `verifying`
- `verified`
- `discrepancy`
- `completed`
- optional `returned`

Catatan:
- backend harus menentukan mana persisted state
- frontend tidak boleh mengarang status baru tanpa contract

## Inbound / receiving status

Usulan:
- `waiting_scan`
- `scan_in_progress`
- `waiting_verification`
- `verification_in_progress`
- `verified`
- `discrepancy_found`
- `resolved`

## Discrepancy status

Dipakai:
- `match`
- `mismatch`
- `missing`
- `over`

Perlu dikunci di backend:
- status ini disimpan per entity apa
- bagaimana naik ke shipment-level issue

## Receiving Officer Mobile UX Direction

Receiving officer tidak perlu dashboard manajerial penuh.

Yang lebih tepat:
- mobile receiving workspace
- simple
- responsive
- to the point

## Recommended screen model

3 layar utama:
- `Queue / Active Shipment`
- `Scan + Verify Box`
- `Shipment Summary`

## Queue / Active Shipment

Tampilkan:
- active warehouse
- shipment cards
- progress scan
- tombol `Start` atau `Continue`

## Scan + Verify Box

Tampilkan:
- camera viewport
- manual token fallback
- expected content card
- actual qty
- condition status
- notes
- photo
- tombol utama `Submit & Next Box`

## Shipment Summary

Tampilkan:
- shipment reference
- vendor
- gudang
- expected boxes
- scanned / verified boxes
- issue count
- final result

## Scanner Failure and Safeguard Rules

Scanner flow harus tahan terhadap failure points utama.

## Before scan

Harus aman dari:
- shipment gudang lain
- shipment yang tidak relevan
- user bingung context gudang

## During scan

Harus tangani:
- camera permission denied
- QR blur / rusak
- cahaya buruk
- invalid QR
- duplicate scan
- wrong warehouse
- wrong shipment

Safeguards:
- manual token entry
- retry
- torch / flash jika device support
- pesan error yang spesifik

## During verification

Harus jelas:
- expected vs actual
- form tidak terlalu panjang
- issue notes / photo muncul saat perlu

## During submit

Harus aman dari:
- bad network
- duplicate submit
- data hilang

Safeguards:
- loading state
- disable double submit
- retry
- jangan hilangkan form saat gagal
- jangan tandai sukses sebelum backend confirm

## After submit

Harus jelas:
- box sudah selesai atau belum
- progress shipment
- lanjut next box atau summary

## Exception cases

Kasus minimum yang harus di-handle:
- duplicate scan
- label damaged
- manual token fallback
- wrong warehouse
- wrong shipment
- browser refresh / close
- camera denied

## Network Handling Strategy

Pendekatan yang direkomendasikan:
- `online-first`
- bukan offline queue penuh untuk tahap awal

Minimum behavior:
- connection state jelas
- submit state jelas
- form state tidak hilang jika gagal
- retry tersedia

## Warehouse Routing and Scope Rules

## Target warehouse

Shipment wajib punya `target_warehouse_id`.

## Vendor side

Vendor memilih warehouse dari dropdown sistem.

## Epson side

Receiving officer hanya boleh melihat shipment sesuai `warehouse_scope`.

## Manager side

Manager boleh melihat lintas gudang dengan filter.

## Minimum backend enforcement

Backend harus menolak jika:
- vendor memilih warehouse di luar scope yang diizinkan
- receiving officer memproses shipment di luar warehouse scope
- shipment belum submitted tetapi diakses untuk receiving

## Discrepancy Rules To Lock With Backend

Ini perlu dibahas dan dikunci di sesi backend:

### Match

Kondisi:
- actual qty = expected qty
- item sesuai

### Mismatch

Kondisi:
- ada ketidaksesuaian isi atau qty
- tetapi bukan kategori final `missing` atau `over` yang sudah dipisah jelas

### Missing

Perlu dipastikan:
- missing dihitung kapan
- apakah hanya difinalkan saat shipment selesai diverifikasi

### Over

Kondisi:
- actual qty melebihi expected

## Manager Action Rules To Lock With Backend

Action yang direkomendasikan:
- `approve`
- `hold`
- `recount`
- `return`

Makna:
- `approve`: menerima hasil aktual walau ada selisih
- `hold`: tahan kasus untuk investigasi
- `recount`: kirim balik ke receiving untuk hitung ulang
- `return`: tolak / kembalikan barang terkait

Perlu dikunci:
- efek ke discrepancy
- efek ke shipment status
- efek ke notifikasi vendor
- kapan `R1` dibuat

## Notification Events To Lock With Backend

Event minimum:
- shipment submitted
- discrepancy detected
- manager action taken
- R1 generated / sent

Penerima minimum:
- vendor
- manager
- receiving officer jika ada recount atau action lanjutan ke lapangan

## Backend Contract Alignment Requirements

Sesi backend berikutnya perlu mengunci:

1. canonical domain terms
2. shipment status transitions
3. inbound / receiving structure
4. draft vs submit behavior
5. box-level QR contract
6. verification endpoint contract
7. discrepancy creation rules
8. manager action contract
9. warehouse scope enforcement
10. notification event contract
11. scanner error reason contract

## Recommended API Behaviors

## Product options

`GET /api/barang/options`

Sebaiknya mengembalikan:
- `ID_barang`
- `kode_barang`
- `nama_barang`
- `unit_default`
- `is_active`

## Warehouse options

`GET /api/gudang/options`

Sebaiknya mengembalikan:
- `ID_gudang`
- `kode_gudang`
- `nama_gudang`
- `lokasi_gudang`
- `is_active`

## Create outbound draft

`POST /api/outbound`

Tujuan:
- create draft shipment

## Submit outbound

`POST /api/outbound/{id}/submit`

Tujuan:
- final validation
- lock shipment
- generate QR per box
- route to warehouse queue

## Get QR tokens

`GET /api/outbound/{id}/qr-token`

Tujuan:
- return box-level QR meaning, bukan token mentah saja

## Verification endpoint

Perlu dikunci endpoint-nya, tetapi minimal backend harus mendukung payload yang bisa memproses:
- qr token / box reference
- actual qty
- condition status
- notes
- photo evidence

## FE and BE Responsibility Split

## Frontend

FE bertanggung jawab untuk:
- render mobile-first workflow
- basic validation
- show queue, scan, verify, summary
- preserve form state saat gagal
- menampilkan progress dan error state

## Backend

BE bertanggung jawab untuk:
- final validation
- vendor scoping dari auth
- warehouse scope check
- product scope / master product validation
- draft persistence
- submit locking
- box calculation
- QR generation
- verification persistence
- discrepancy calculation
- manager action persistence
- notification triggers

## Known Gaps in Current Web

Dari audit FE saat ini:
- vendor input validation masih terlalu tipis
- target warehouse belum dikunci di flow vendor saat ini
- flow scan belum langsung menyatu ke verification
- receiving mobile UX masih terasa seperti dashboard campuran
- discrepancy action manager belum lengkap
- status antar role belum sepenuhnya sinkron
- box-level meaning belum eksplisit di response yang dipakai FE

## What Success Looks Like

Sistem dianggap lebih matang kalau:
- vendor submit shipment dengan target warehouse yang jelas
- QR benar-benar mewakili box
- receiving officer bisa scan dan verify cepat di HP
- discrepancy punya aturan backend yang jelas
- manager action punya efek domain yang jelas
- FE tidak perlu menebak status atau derivasi bisnis sendiri

## Recommended Next Step

Gunakan dokumen ini sebagai handoff untuk sesi backend.

Target sesi backend:
- jangan bahas UI dulu
- kunci domain terms
- kunci state transitions
- kunci endpoint shape
- kunci error reasons
- kunci warehouse and role enforcement

Setelah contract backend jelas, baru lanjut implementasi FE dan BE sekali jalan.
