# Dokumen R1 Role, Flow, and Access Notes

Date: 2026-06-03
Purpose: clarify `Dokumen R1` ownership, role access, lifecycle, and backend restrictions
Audience:
- Backend
- Frontend
- Product / flow alignment

Related references:
- `D:\capstone-3-1\capstonea1\app\Models\DokumenR1.php`
- `D:\capstone-3-1\capstonea1\app\Http\Controllers\Api\DokumenR1Controller.php`
- `D:\capstone-3-1\capstonea1\app\Http\Requests\DokumenR1Request.php`
- `D:\capstone-3-1\capstonea1\database\migrations\2026_04_08_000014_create_tabel_dokumen_r1.php`
- `D:\capstone-3-1\capstonea1\routes\api.php`
- `src/pages/ManagerDashboard.jsx`
- `src/pages/VendorDashboard.jsx`
- `src/pages/AdminDashboard.jsx`

## What R1 Means in This Project

Dalam project ini, `Dokumen R1` paling masuk akal diperlakukan sebagai:
- dokumen formal tindak lanjut atas `discrepancy`
- dokumen yang menghubungkan keputusan internal manager dengan komunikasi/proses resmi ke vendor
- dokumen yang punya lifecycle sendiri sampai kasus ditutup

Saat ini struktur datanya menegaskan bahwa:
- `1 Dokumen R1` terkait ke `1 discrepancy`
- R1 bukan dokumen umum shipment, tapi dokumen turunan dari discrepancy

## Current Backend Shape

Entity `DokumenR1` saat ini punya field:
- `ID_discrepancy`
- `no_dokumen_r1`
- `status_dokumen`
- `dibuat_oleh`
- `dibuat_at`
- `keterangan`

Status dokumen saat ini:
- `draft`
- `dikirim_ke_vendor`
- `diproses_vendor`
- `closing`

Endpoint yang ada:
- `GET /api/dokumen-r1`
- `POST /api/dokumen-r1`
- `GET /api/dokumen-r1/{id}`
- `PUT /api/dokumen-r1/{id}/status`

## Recommended Role Ownership

### 1. Manager

Manager adalah `owner utama` flow R1.

Yang seharusnya manager bisa lakukan:
- membuat R1 dari discrepancy yang valid
- membaca daftar dan detail R1
- mengubah status lifecycle R1
- menambahkan keterangan formal
- memutuskan kapan dokumen dikirim ke vendor
- menutup dokumen saat kasus selesai

Alasan:
- manager adalah pemegang keputusan bisnis discrepancy
- R1 bukan bukti lapangan mentah, tapi dokumen tindak lanjut formal

### 2. Vendor

Vendor adalah `recipient / external counterpart`, bukan creator.

Yang seharusnya vendor bisa lakukan:
- melihat R1 yang terkait shipment / discrepancy miliknya
- menerima notifikasi saat R1 dikirim
- melihat status terkini dokumen

Yang seharusnya vendor tidak bisa lakukan:
- membuat R1
- mengubah status internal sesuka hati
- melihat R1 milik vendor lain

Catatan:
- kalau nanti dibutuhkan acknowledgement vendor, itu sebaiknya endpoint/field terpisah, bukan vendor bebas update status lifecycle utama

### 3. Petugas / Receiving Officer

Petugas bukan owner R1.

Yang seharusnya petugas lakukan:
- hanya menyuplai data operasional:
  - hasil scan
  - hasil verifikasi
  - foto
  - catatan

Yang seharusnya petugas tidak bisa lakukan:
- membuat R1
- mengubah status R1
- mengirim R1 ke vendor

### 4. Admin

Admin adalah `support / oversight role`, bukan owner bisnis utama.

Yang seharusnya admin bisa lakukan:
- membaca semua R1 untuk monitoring
- membantu investigasi
- melakukan intervensi administratif jika memang diperlukan

Yang sebaiknya dibatasi:
- admin tidak otomatis menjadi pelaku utama create/update R1 dalam flow normal, kecuali ada kebutuhan operasional khusus

## Recommended R1 Lifecycle

Lifecycle yang paling masuk akal:

1. `draft`
- manager membuat dokumen dari discrepancy
- dokumen masih internal
- vendor belum perlu diberi notifikasi

2. `dikirim_ke_vendor`
- manager mengirim / meresmikan dokumen ke vendor
- vendor mulai bisa melihat dokumen sebagai issue formal
- notifikasi vendor dikirim di tahap ini

3. `diproses_vendor`
- vendor sedang menindaklanjuti
- status ini menandakan kasus belum selesai

4. `closing`
- kasus dianggap selesai
- dokumen ditutup

## Recommended Trigger Rules

R1 tidak perlu dibuat untuk semua discrepancy.

Trigger minimum yang direkomendasikan:
- `return`
  hampir selalu layak punya R1
- `hold`
  optional, jika kasus perlu jejak formal ke vendor
- `recount`
  biasanya belum perlu R1, kecuali escalated
- `approve`
  umumnya tidak perlu R1, karena discrepancy diterima selesai secara internal

Rekomendasi baseline:
- `R1 wajib untuk return`
- `R1 opsional untuk hold tertentu`
- `R1 tidak wajib untuk approve`
- `R1 tidak otomatis dibuat untuk recount`

## Recommended Flow

### Normal path

1. Petugas scan dan verify box.
2. Sistem menghasilkan discrepancy.
3. Manager review discrepancy.
4. Manager memilih action.
5. Jika action butuh tindak lanjut formal, manager create R1.
6. Manager ubah status ke `dikirim_ke_vendor`.
7. Vendor menerima notifikasi dan melihat detail R1.
8. Setelah tindak lanjut selesai, manager ubah status ke `closing`.

### What R1 should not replace

R1 bukan pengganti:
- discrepancy record
- manager action record
- scan evidence

R1 adalah dokumen formal di atas data-data itu.

## Current Behavior Seen in Code

### What is already aligned

- create R1 mengambil `dibuat_oleh` dari user login
- R1 terkait langsung ke discrepancy
- vendor hanya melihat daftar/detail R1 miliknya lewat scoping query
- vendor mendapat notifikasi saat status menjadi `dikirim_ke_vendor`

### Current gap

Komentar route mengatakan:
- `POST /api/dokumen-r1` manager/admin only

Tetapi implementasi route saat ini belum benar-benar membatasi role di route group.

Artinya saat ini perlu diasumsikan ada gap authorization, karena:
- request validation tidak membatasi role
- route belum diberi middleware khusus manager/admin untuk create/update

## Recommended Access Matrix

### Manager
- list R1: yes
- view detail R1: yes
- create R1: yes
- update status R1: yes
- close R1: yes

### Vendor
- list own R1: yes
- view own R1 detail: yes
- create R1: no
- update status lifecycle utama: no

### Petugas
- list R1: no by default
- view detail R1: optional read-only if needed, but not required
- create R1: no
- update status R1: no

### Admin
- list all R1: yes
- view all R1 detail: yes
- create R1: optional support access
- update status R1: optional support access

## Recommended Backend Restrictions

### Minimum required

1. Restrict create R1
- `POST /api/dokumen-r1`
- allow only `manager` and optionally `admin`

2. Restrict update status R1
- `PUT /api/dokumen-r1/{id}/status`
- allow only `manager` and optionally `admin`

3. Keep vendor read-only
- vendor hanya boleh `GET` list/detail untuk R1 miliknya

4. Keep discrepancy ownership check
- saat manager create R1, discrepancy yang dipilih harus valid dan memang ada

### Nice to have

5. Prevent duplicate active R1 if business rule wants one formal doc per discrepancy

6. Add rule for allowed status transitions:
- `draft -> dikirim_ke_vendor`
- `dikirim_ke_vendor -> diproses_vendor`
- `diproses_vendor -> closing`

7. Prevent arbitrary jumps such as:
- `draft -> closing`
- `closing -> draft`

## Recommended Frontend Treatment

### Manager UI

Manager harus punya:
- discrepancy detail panel
- tombol `Create R1` hanya saat kasus memang butuh dokumen formal
- list R1 terpisah dari discrepancy list
- status badge jelas

### Vendor UI

Vendor cukup punya:
- notifikasi R1
- detail dokumen
- status dokumen

Vendor tidak perlu:
- tombol create
- tombol status update lifecycle utama

### Petugas UI

Petugas tidak perlu halaman R1 khusus.

Kalau perlu pun, cukup read-only link dari shipment issue detail, bukan workspace utama.

## Final Recommendation

Posisi yang paling aman untuk dikunci:
- `R1 owner = manager`
- `R1 recipient/viewer = vendor`
- `R1 support oversight = admin`
- `petugas tidak mengelola R1`

Dan rule bisnis awal yang paling simpel:
- discrepancy ditemukan dulu
- manager action dipilih dulu
- jika action mengarah ke proses formal, manager create R1
- vendor menerima R1 saat status `dikirim_ke_vendor`
