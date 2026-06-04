# User Warehouse Assignment Design

Date: 2026-06-03
Purpose: define how warehouse assignment should work for `petugas`, `manager`, and `admin`
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-03-role-permission-matrix.md`
- `docs/2026-06-03-backend-final-decisions.md`
- `docs/2026-06-03-current-vs-proposed-api-impact-summary.md`

## Purpose

Dokumen ini mengunci cara sistem menentukan hubungan antara user internal dan gudang.

Masalah yang ingin diselesaikan:
- petugas receiving harus dibatasi ke gudang yang benar
- manager tetap perlu visibility lintas gudang
- admin perlu tetap global
- admin form create user harus tahu field apa yang wajib diisi
- `auth/me` dan dashboard/filter harus sinkron dengan role

## Final Baseline

Baseline yang dipilih:
- `petugas = 1 gudang`
- `manager = global visibility + warehouse filter`
- `admin = global full access`

Ini berarti:
- petugas dibatasi keras ke satu gudang
- manager tidak di-lock ke satu gudang, tapi boleh punya gudang default untuk tampilan awal
- admin tidak perlu assignment gudang wajib

## Why This Is the Wisest Flow

### Petugas

Petugas bekerja di flow operasional lapangan:
- lihat queue
- scan
- verify
- finalize

Kalau petugas bisa melihat banyak gudang:
- rawan salah proses shipment
- rawan salah scan
- queue jadi tidak relevan

Karena itu petugas harus `hard scoped`.

### Manager

Manager bekerja di flow monitoring dan decision making:
- lihat discrepancy
- lihat shipment bermasalah
- bandingkan performa antar gudang
- ambil action

Kalau manager di-lock ke satu gudang:
- visibility lintas gudang hilang
- analytics jadi sempit
- koordinasi antar gudang lebih sulit

Karena itu manager lebih masuk akal sebagai:
- `global visibility`
- `filter gudang`
- optional `default gudang`

### Admin

Admin bekerja di governance/configuration:
- create user
- maintain master data
- support oversight

Admin tidak perlu dibatasi assignment gudang.

## Recommended Data Model

### Option chosen for phase 1

Tambahkan assignment gudang langsung di tabel user.

Rekomendasi field:
- `ID_gudang` nullable

Makna field:
- untuk `petugas`: wajib terisi
- untuk `manager`: optional, dipakai sebagai `default warehouse`
- untuk `admin`: boleh null
- untuk `vendor`: null

### Why this is enough for now

Karena keputusan fase ini adalah:
- `1 petugas = 1 gudang`

Jadi belum perlu tabel mapping many-to-many.

Kalau nanti dibutuhkan:
- `1 user -> banyak gudang`

baru evolve ke tabel terpisah seperti:
- `tabel_user_gudang`

Tapi untuk sekarang itu overkill.

## Role-by-Role Warehouse Semantics

### Vendor

Tidak punya assignment gudang internal.

Yang vendor lakukan:
- memilih `target warehouse` saat membuat shipment

Yang vendor tidak punya:
- scope gudang internal
- receiving queue

### Petugas

Petugas wajib punya:
- `ID_gudang`

Efeknya:
- hanya bisa lihat shipment untuk gudang itu
- hanya bisa scan dan verify shipment untuk gudang itu
- receiving queue otomatis filter berdasarkan `ID_gudang` user

### Manager

Manager boleh punya:
- `ID_gudang` nullable sebagai `default warehouse`

Maknanya:
- bukan hard access restriction
- hanya dipakai untuk default filter / default view

Manager tetap bisa:
- lihat gudang lain
- pindah filter gudang
- lihat global analytics

### Admin

Admin:
- tidak butuh assignment gudang
- `ID_gudang` boleh null
- tetap bisa lihat dan konfigurasi seluruh sistem

## Admin Create User Flow

### Current gap

Saat ini admin create user baru mengisi:
- nama
- email
- role
- optional vendor link

Belum ada field gudang untuk petugas.

### New rules

#### If role = `petugas`
- `ID_gudang` wajib

#### If role = `manager`
- `ID_gudang` optional
- diperlakukan sebagai default gudang tampilan awal

#### If role = `admin`
- `ID_gudang` optional / null

#### If role = `vendor`
- tetap pakai `ID_vendor`
- `ID_gudang` null

### Recommended admin form behavior

Saat admin pilih role:

- `vendor`
  tampilkan field `Linked Vendor`

- `petugas`
  tampilkan field `Assigned Warehouse` dan wajib

- `manager`
  tampilkan field `Default Warehouse` dan optional

- `admin`
  tidak perlu field gudang

## Recommended Validation Rules

### Register / create user

Aturan yang disarankan:

- `role = vendor`
  - `ID_vendor` required
  - `ID_gudang` null

- `role = petugas`
  - `ID_gudang` required
  - `ID_vendor` null

- `role = manager`
  - `ID_gudang` nullable
  - `ID_vendor` null

- `role = admin`
  - `ID_gudang` nullable
  - `ID_vendor` null

## Auth / Session Payload Design

### `POST /api/auth/login`

Response user payload sebaiknya memuat:
- `ID_user`
- `nama`
- `email`
- `role`
- `ID_vendor`
- `ID_gudang`

### `GET /api/auth/me`

Response user payload sebaiknya juga memuat:
- `ID_user`
- `nama`
- `email`
- `role`
- `ID_vendor`
- `ID_gudang`
- `warehouse` object jika ada

Contoh:

```json
{
  "ID_user": 12,
  "nama": "Petugas Gudang A",
  "email": "petugas.a@epson.com",
  "role": "petugas",
  "ID_vendor": null,
  "ID_gudang": 3,
  "warehouse": {
    "ID_gudang": 3,
    "nama_gudang": "Gudang A"
  }
}
```

## FE Behavior by Role

### Vendor

Setelah login:
- redirect ke vendor dashboard
- tidak perlu baca `ID_gudang`

### Petugas

Setelah login:
- redirect ke receiving workspace
- FE baca `ID_gudang` user
- queue dan scan flow otomatis pakai gudang itu
- tidak perlu filter gudang di UI

### Manager

Setelah login:
- redirect ke manager dashboard
- kalau `ID_gudang` ada, gunakan sebagai default selected filter
- manager tetap bisa ubah filter ke gudang lain

### Admin

Setelah login:
- redirect ke admin dashboard
- tidak perlu forced warehouse context

## Backend Enforcement Rules

### Petugas

Receiving endpoint harus:
- ambil `ID_gudang` dari user login
- bukan percaya penuh ke input FE

Kalau FE tetap kirim `ID_gudang`, backend harus validasi bahwa:
- `ID_gudang payload == ID_gudang user`

Kalau tidak cocok:
- reject request

### Manager

Manager endpoint:
- tidak hard-restrict by `ID_gudang`
- pakai query filter jika diberikan

### Admin

Admin endpoint:
- global full read/config access

## Recommended Query Behavior

### Receiving queue

Untuk petugas:
- query berdasarkan `user.ID_gudang`

Untuk manager/admin:
- bisa support query param filter `ID_gudang`

### Dashboard manager

Behavior yang direkomendasikan:
- jika manager punya `ID_gudang`, gunakan sebagai default filter awal
- jika tidak, default ke `all warehouses`

## Migration Recommendation

### Phase 1

Tambah kolom:
- `ID_gudang` nullable ke `tabel_user`

Tambahkan relasi:
- `User belongsTo Gudang`

### Phase 2

Update:
- register / admin create user validation
- user resource / auth response
- admin FE create user form
- receiving service scope enforcement
- manager FE default warehouse filter

## Final Decision Summary

Keputusan final yang dipakai:
- `petugas` wajib punya `ID_gudang`
- `manager` optional punya `ID_gudang` sebagai default filter, bukan hard restriction
- `admin` global tanpa assignment wajib
- `vendor` tetap tidak punya assignment gudang internal

Ini adalah desain paling sederhana yang:
- sesuai flow
- cepat diimplementasikan
- tidak over-engineered
- masih bisa di-upgrade nanti kalau butuh multi-warehouse per user
