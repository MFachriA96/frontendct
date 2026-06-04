# Vendor Input and API Alignment Notes

Date: 2026-06-02
Audience:
- Frontend
- Backend
- Product / flow alignment

Related docs:
- `docs/superpowers/specs/2026-06-02-shipment-verification-flow-audit-notes.md`
- `docs/superpowers/specs/dashboard-manager-vendor-api-contract.md`

## Purpose

Dokumen ini mengunci keputusan untuk:
- field input vendor
- alur `draft -> submitted`
- pemilihan `target warehouse`
- aturan `master product` vs `custom product`
- bentuk request/response API agar FE dan BE nyambung

Dokumen ini belum mengubah implementasi. Ini dipakai sebagai acuan sebelum FE dan BE dikerjakan sekali jalan.

## Final Decisions

### 1. Vendor does not input vendor identity manually

Vendor diambil dari akun login.

Implikasi:
- request create shipment tidak perlu kirim `vendor_id`
- backend resolve vendor dari auth user
- admin yang menentukan relasi user vendor

### 2. Target warehouse is selected by vendor from a system-provided list

Target warehouse wajib dipilih vendor dari dropdown.

Aturan:
- warehouse tidak boleh free-text
- FE simpan `warehouse_id`
- BE tetap mengembalikan `warehouse_name` untuk display

Rekomendasi:
- admin bisa menentukan warehouse mana yang boleh dipilih vendor tertentu
- kalau pembatasan per vendor belum siap, minimal tampilkan semua warehouse aktif

### 2a. Shipment should be routed by target warehouse after submit

Aturan:
- draft belum masuk queue Epson
- shipment baru masuk queue Epson saat `submit`
- queue receiving Epson harus difilter berdasarkan `target_warehouse_id`

### 3. Product input should be master-first, custom-as-exception

Jalur utama:
- vendor pilih dari `master product`

Jalur exception:
- vendor boleh input `custom product`

Kenapa bukan custom-only:
- nama barang bebas akan merusak konsistensi part analytics
- reconciliation lebih lemah kalau item tidak nyambung ke master data
- partner vendor seharusnya sebisa mungkin kirim item yang sudah dikenal sistem

Rekomendasi operasional:
- `master product` menjadi default
- `custom product` diberi flag khusus untuk review

### 4. Draft flow is valid and recommended

Status dasar:
- `draft`
- `submitted`

Arti:
- `draft`: masih bisa diedit, belum generate QR, belum masuk queue Epson
- `submitted`: data di-lock, QR dibuat, shipment masuk queue Epson sesuai warehouse tujuan

Recommended behavior:
- manifest sudah dikirim ke backend saat create draft
- submit bukan create pertama, tetapi finalisasi draft
- submit melakukan validasi final, lock data, QR generation, dan routing ke Epson side

### 5. Box detail is derived by system from item totals

Vendor tidak perlu input box satu-satu.

Vendor cukup input:
- total qty
- qty per box

Sistem menghitung:
- jumlah box
- expected qty per box

Contoh:
- total qty = 25
- qty per box = 10

Hasil:
- box 1 = 10
- box 2 = 10
- box 3 = 5

Catatan:
- ini penting agar `1 QR = 1 box` benar-benar punya expected content

## Recommended Vendor Form

## Shipment-level fields

Wajib:
- `shipment_reference` atau `no_do`
- `dispatch_date`
- `expected_arrival_date`
- `target_warehouse_id`
- `origin_location`

Opsional:
- `notes`

Tidak perlu diinput manual:
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
- optional: `custom_product_code`

Rekomendasi:
- untuk MVP, satu item merepresentasikan satu jenis part
- satu box sebaiknya hanya berisi satu jenis part

## Fields computed by backend

Jangan dijadikan source of truth dari FE:
- `jumlah_box`
- `box_breakdown`
- `qr_ready`
- `status`

Frontend boleh preview perhitungan, tapi backend tetap menghitung ulang.

## Validation Rules

## Shipment-level validation

- `shipment_reference` wajib
- `dispatch_date` wajib
- `expected_arrival_date` wajib
- `expected_arrival_date >= dispatch_date`
- `target_warehouse_id` wajib
- `origin_location` wajib

## Item-level validation

- minimal ada 1 item
- `quantity_outbound` harus integer positif
- `quantity_per_box` harus integer positif
- `quantity_per_box <= quantity_outbound`
- `unit` wajib

Jika `product_mode = existing`:
- `product_id` wajib

Jika `product_mode = custom`:
- `custom_product_name` wajib

## Recommended Domain Rules

### Warehouse routing

Setelah submit:
- shipment masuk ke queue warehouse tujuan
- scan officer hanya melihat shipment untuk warehouse yang menjadi scope-nya
- manager boleh melihat lintas warehouse dengan filter

Draft behavior:
- draft tetap tersimpan di backend
- draft tidak muncul di queue receiving Epson
- draft hanya terlihat di sisi vendor dan admin yang relevan

### Epson receiving user scope

Recommended:
- setiap user receiving Epson punya `warehouse_scope`
- scope bisa single warehouse atau multi-warehouse

Versi awal yang paling simpel:
- single warehouse scope

Versi lanjutan:
- multi-warehouse scope

Minimum backend guarantees:
- user receiving hanya bisa melihat shipment dengan `target_warehouse_id` dalam scope user
- user receiving tidak boleh memproses shipment di luar scope gudangnya
- inbound record harus menyimpan `warehouse_id`

### Product permission

Kalau backend siap:
- vendor hanya bisa memilih product yang memang diizinkan untuk vendor itu

Kalau backend belum siap:
- vendor bisa melihat semua product aktif
- custom tetap boleh sebagai exception

### Custom product behavior

Jika item custom diizinkan, backend sebaiknya menandai:
- `is_custom_product: true`
- `requires_product_review: true|false`

Tujuan:
- data custom tetap terlacak
- analytics tahu mana item master dan mana item exception

## Recommended API Shape

## 1. Product options for vendor form

### `GET /api/barang/options`

Current usage already exists in FE. Recommended response should be extended to support vendor form cleanly.

Recommended shape:

```json
{
  "success": true,
  "data": [
    {
      "ID_barang": 10,
      "kode_barang": "PRT-001",
      "nama_barang": "Printer Housing Cover",
      "unit_default": "pcs",
      "is_active": true
    }
  ]
}
```

Recommended optional future filters:
- scoped by vendor automatically from auth
- only active products

## 2. Warehouse options for vendor form

### `GET /api/gudang/options`

Recommended purpose:
- populate target warehouse dropdown

Recommended shape:

```json
{
  "success": true,
  "data": [
    {
      "ID_gudang": 1,
      "kode_gudang": "GUD-A",
      "nama_gudang": "Gudang Utama A",
      "lokasi_gudang": "Plant A",
      "is_active": true
    }
  ]
}
```

Recommended behavior:
- backend can scope warehouses by authenticated vendor if restriction exists

## 3. Create outbound shipment draft

### `POST /api/outbound`

Purpose:
- create shipment as draft

Recommended request:

```json
{
  "shipment_reference": "DO-2026-0001",
  "dispatch_date": "2026-06-03",
  "expected_arrival_date": "2026-06-04",
  "target_warehouse_id": 2,
  "origin_location": "Vendor Warehouse A",
  "notes": "Handle with care",
  "details": [
    {
      "product_mode": "existing",
      "product_id": 10,
      "quantity_outbound": 25,
      "quantity_per_box": 10,
      "unit": "pcs"
    },
    {
      "product_mode": "custom",
      "custom_product_name": "Prototype Bracket",
      "custom_product_code": "TEMP-01",
      "quantity_outbound": 12,
      "quantity_per_box": 6,
      "unit": "pcs"
    }
  ]
}
```

Recommended create response:

```json
{
  "success": true,
  "data": {
    "ID_outbound": 101,
    "shipment_reference": "DO-2026-0001",
    "status": "draft",
    "ID_vendor": 5,
    "ID_gudang": 2,
    "warehouse": {
      "ID_gudang": 2,
      "nama_gudang": "Gudang Transit B"
    },
    "lokasi_asal": "Vendor Warehouse A",
    "dispatch_date": "2026-06-03",
    "expected_arrival_date": "2026-06-04",
    "details": [
      {
        "ID_outbound_detail": 9001,
        "product_mode": "existing",
        "ID_barang": 10,
        "nama_barang": "Printer Housing Cover",
        "quantity_outbound": 25,
        "quantity_per_box": 10,
        "jumlah_box": 3,
        "box_breakdown": [10, 10, 5]
      }
    ]
  }
}
```

Important:
- backend should calculate `jumlah_box`
- backend should calculate `box_breakdown`
- backend should store `target_warehouse_id`
- backend should keep shipment as vendor-editable while `status = draft`

## 4. Submit draft shipment

### `POST /api/outbound/{id}/submit`

Purpose:
- lock shipment
- generate QR per box
- route shipment into Epson receiving queue

Recommended response:

```json
{
  "success": true,
  "data": {
    "ID_outbound": 101,
    "status": "submitted",
    "qr_ready": true,
    "total_qr": 5,
    "ready_qr": 5,
    "target_warehouse_id": 2
  }
}
```

## 5. Get QR tokens for submitted shipment

### `GET /api/outbound/{id}/qr-token`

Current endpoint already exists. Recommended shape should reflect box-level QR, not only detail-level ambiguity.

Recommended shape:

```json
{
  "success": true,
  "data": {
    "shipment_status": "submitted",
    "qr_ready": true,
    "total_qr": 3,
    "ready_qr": 3,
    "qr_tokens": [
      {
        "box_id": "BOX-101-001",
        "box_sequence": 1,
        "ID_outbound_detail": 9001,
        "ID_barang": 10,
        "nama_barang": "Printer Housing Cover",
        "expected_qty_in_box": 10,
        "unit": "pcs",
        "qr_token": "uuid-1"
      },
      {
        "box_id": "BOX-101-002",
        "box_sequence": 2,
        "ID_outbound_detail": 9001,
        "ID_barang": 10,
        "nama_barang": "Printer Housing Cover",
        "expected_qty_in_box": 10,
        "unit": "pcs",
        "qr_token": "uuid-2"
      },
      {
        "box_id": "BOX-101-003",
        "box_sequence": 3,
        "ID_outbound_detail": 9001,
        "ID_barang": 10,
        "nama_barang": "Printer Housing Cover",
        "expected_qty_in_box": 5,
        "unit": "pcs",
        "qr_token": "uuid-3"
      }
    ]
  }
}
```

This response is important because FE and receiving flow need explicit box-level meaning.

## API Behavior Rules

### Draft edit behavior

Recommended:
- draft shipment can still be edited
- submitted shipment cannot be edited

If edit endpoint is added later:
- only allow edit while `status = draft`

### Submit guard

Backend should reject submit if:
- no target warehouse
- no item details
- invalid quantities
- invalid product reference

### Warehouse permission guard

Backend should reject create or submit if:
- vendor chooses warehouse outside allowed scope

### Receiving scope guard

Backend should reject receiving actions if:
- user Epson tries to access shipment outside `warehouse_scope`
- user Epson tries to scan inbound into warehouse different from shipment target warehouse unless explicit transfer flow exists

### Custom product guard

Backend should reject custom item if:
- custom product name empty
- custom product mode sent together with invalid existing product combination

## Suggested FE/BE Responsibility Split

### Frontend

FE is responsible for:
- rendering form
- doing basic UX validation
- previewing box count if needed
- showing warehouse and product options

### Backend

BE is responsible for:
- final validation
- vendor scoping from auth
- warehouse permission check
- receiving user warehouse scope check
- product permission check
- box calculation
- QR generation
- data locking on submit
- queue routing by warehouse

## Recommended Next Implementation Order

1. Backend define warehouse options endpoint
2. Backend finalize create draft payload validation
3. Backend return explicit box-level QR payload
4. Frontend update vendor form to include warehouse dropdown and stronger validation
5. Frontend update QR modal wording from detail-level to box-level

## Final Recommendation

Untuk menghindari bolak-balik revisi:
- jadikan `master product + custom exception` sebagai keputusan final
- jadikan `target warehouse` sebagai field wajib
- pertahankan `draft -> submit`
- pastikan backend mengembalikan `box-level meaning`, bukan hanya token mentah

Kalau ini dikunci dulu, flow vendor sampai receiving akan jauh lebih konsisten.
