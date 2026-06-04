# Scanner Flow Safeguards and UX Checklist

Date: 2026-06-02
Audience:
- Frontend
- Backend
- Product / flow alignment

Related docs:
- `docs/superpowers/specs/2026-06-02-shipment-verification-flow-audit-notes.md`
- `docs/superpowers/specs/2026-06-02-vendor-input-api-alignment-notes.md`

## Purpose

Dokumen ini merangkum semua concern operasional untuk flow scanner / receiving officer yang akan dipakai di HP.

Fokus dokumen:
- failure points di flow scanner
- pencegahan UX/UI
- guard backend yang dibutuhkan
- checklist implementasi minimum

Targetnya bukan dashboard analitik, tetapi mobile receiving workspace yang cepat, aman, dan jelas.

## Core Principle

Flow scanner harus punya 4 sifat:
- `fast`
- `forgiving`
- `constrained`
- `traceable`

Arti sederhananya:
- cepat untuk box normal
- tidak menghukum user saat ada gangguan
- user hanya bisa memproses shipment yang relevan
- semua langkah tercatat jelas untuk audit

## End-to-End Scanner Flow

Urutan ideal:
1. user masuk ke queue shipment sesuai gudang
2. user pilih shipment aktif
3. user scan QR box
4. sistem tampilkan expected content
5. user konfirmasi actual qty dan kondisi
6. user submit verification
7. sistem arahkan ke next box
8. setelah box terakhir, tampil shipment summary

## Safeguards by Stage

## 1. Before Scan

### Risks

- user melihat shipment dari gudang lain
- user tidak tahu sedang memproses gudang mana
- user bingung shipment mana yang aktif
- progress shipment tidak jelas

### UX/UI safeguards

- tampilkan `active warehouse` jelas di header
- tampilkan queue shipment yang hanya relevan dengan scope gudang user
- tiap shipment card memuat:
  - shipment reference / DO
  - vendor
  - expected boxes
  - scanned boxes
  - status singkat
  - tombol `Start` atau `Continue`
- kalau user sudah punya shipment aktif, sistem tampilkan CTA `Continue current shipment`

### Backend guards

- filter shipment by `target_warehouse_id`
- filter shipment by authenticated user `warehouse_scope`
- jangan kirim draft shipment ke scanner queue

## 2. During QR Scan

### Risks

- kamera tidak diizinkan
- kamera gagal terbuka
- QR blur atau rusak
- pencahayaan buruk
- QR tidak valid
- QR milik shipment lain
- QR bukan untuk gudang ini
- QR sudah pernah discan

### UX/UI safeguards

- kamera scan sebagai primary mode
- sediakan `manual token entry` sebagai fallback wajib
- tampilkan hint sederhana:
  - arahkan QR ke dalam frame
  - dekatkan kamera
  - pastikan label tidak terlipat
- jika device mendukung, tampilkan tombol `flash / torch`
- sediakan tombol:
  - `Retry`
  - `Input Manual`

### Error message rules

Jangan gunakan pesan generic `Scan failed`.

Minimal bedakan:
- kamera tidak diizinkan
- QR tidak terbaca
- QR tidak valid
- QR sudah pernah discan
- QR bukan untuk gudang ini
- QR bukan bagian shipment aktif

### Backend guards

- validate token existence
- validate token shipment ownership
- validate token warehouse target
- reject duplicate scan secara aman

## 3. After QR Success, Before Verification Submit

### Risks

- user tidak paham box yang baru discan
- expected vs actual tidak jelas
- salah input qty
- user terlalu banyak isi field
- form terlalu panjang di HP

### UX/UI safeguards

Setelah scan berhasil, sistem harus langsung tampilkan:
- shipment reference
- box ID / box sequence
- vendor
- expected product
- expected qty
- unit

### Recommended verification form

Minimal fields:
- `actual_qty`
- `condition_status`
- `notes`
- `photo`

Recommended behavior:
- `actual_qty` auto-filled dari expected qty
- user tinggal confirm kalau sesuai
- field tambahan issue bisa dipadatkan

Recommended `condition_status`:
- `normal`
- `damaged`
- `opened`
- `other`

Rule:
- jika actual = expected dan condition = normal, flow harus sangat cepat
- jika ada mismatch atau issue, notes dan photo flow diperjelas

### Backend guards

- reject invalid numeric qty
- reject verification submit tanpa box context yang valid
- pastikan QR token dan box record sinkron

## 4. Verification Submit

### Risks

- koneksi lemah
- request timeout
- user klik submit dua kali
- data hilang saat gagal
- UI menganggap sukses sebelum backend confirm

### UX/UI safeguards

- tombol submit disable saat request sedang jalan
- tampilkan state:
  - `Sending...`
  - `Saved`
  - `Failed to send`
- jangan ubah status box menjadi sukses sebelum backend confirm
- jika submit gagal, form tetap ada
- tampilkan tombol `Retry`
- jika user mau keluar saat ada data belum terkirim, tampilkan warning

### Network-specific guidance

Pendekatan yang direkomendasikan:
- `online-first`
- bukan offline penuh untuk tahap awal

Minimum behavior:
- tampilkan indikator koneksi
- tampilkan pesan jika koneksi lemah
- jangan hapus input user saat submit gagal
- simpan context lokal sementara jika perlu

### Backend guards

- gunakan idempotency atau minimal duplicate submit protection jika memungkinkan
- response harus jelas apakah data tersimpan atau belum

## 5. After Verification Submit

### Risks

- user bingung apakah box sudah selesai
- user tidak tahu harus lanjut ke box berikutnya atau selesai
- user tidak tahu issue sudah tercatat atau belum

### UX/UI safeguards

Setelah submit sukses:
- tampilkan success state singkat
- update progress `4/10`
- tampilkan CTA utama `Scan Next Box`

Jika itu box terakhir:
- arahkan otomatis ke `Shipment Summary`

Jika box punya issue:
- tampilkan bahwa issue sudah dicatat
- tampilkan bahwa shipment akan masuk review manager jika diperlukan

## 6. Exception Cases

## Case A: Duplicate scan

Expected behavior:
- jangan crash
- tampilkan informasi:
  - box sudah pernah discan
  - waktu scan
  - oleh siapa jika tersedia
- beri pilihan:
  - `Back`
  - `View shipment`

## Case B: Label damaged or QR unreadable

Expected behavior:
- user bisa pilih `Input Manual`
- user bisa tandai `Label Damaged`
- user bisa upload foto label

## Case C: Wrong warehouse

Expected behavior:
- hard block
- tampilkan pesan jelas bahwa shipment bukan untuk gudang user ini

## Case D: Wrong active shipment

Expected behavior:
- kalau QR milik shipment lain, tampilkan informasi itu
- jangan silently pindah shipment
- jika perlu, minta konfirmasi sebelum ganti context shipment aktif

## Case E: Browser refresh or accidental close

Expected behavior:
- simpan context shipment aktif sementara
- simpan draft verification local state secukupnya
- saat user kembali, tampilkan `Resume current verification`

## Case F: Camera permission denied

Expected behavior:
- tampilkan penjelasan singkat
- arahkan ke manual token entry
- sediakan tombol `Retry Camera`

## Minimal Mobile UI Structure

## Screen 1: Queue

Should show:
- active warehouse
- shipment cards
- start / continue action

## Screen 2: Scan + Verify

Should show:
- camera viewport or manual token input
- expected content card
- compact verification form
- sticky submit action

## Screen 3: Shipment Summary

Should show:
- shipment result
- expected vs scanned totals
- issue count
- finish / back to queue

## Copywriting Guidelines

Gunakan copy singkat dan operasional.

Contoh:
- `Scan box`
- `Input manual token`
- `Box already scanned`
- `Not assigned to this warehouse`
- `Saved and ready for next box`
- `Verification failed. Try again.`

Hindari:
- error teknis panjang
- bahasa abstrak
- label generik tanpa aksi lanjut

## FE and BE Responsibility Split

### Frontend

FE bertanggung jawab untuk:
- mobile-first rendering
- camera UX
- manual fallback
- preserving form state on failure
- showing progress and clear actions

### Backend

BE bertanggung jawab untuk:
- token validation
- warehouse scope validation
- duplicate scan protection
- verification persistence
- progress calculation
- discrepancy result generation

## Implementation Checklist

Checklist minimum yang harus ada:
- queue shipment per gudang
- scan QR
- manual token fallback
- expected content card
- auto-filled actual qty
- condition / notes / photo support
- retry-safe submit
- duplicate scan handling
- wrong warehouse handling
- shipment summary

Checklist bagus jika sempat:
- flash / torch support
- resume active shipment
- local context restore
- label damaged flow

## Recommendation

Jangan anggap scanner flow sebagai fitur kecil.

Ini adalah titik operasional inti sistem. Kalau flow scanner rapi:
- discrepancy lebih cepat terdeteksi
- audit lebih jelas
- manager review jadi lebih masuk akal
- vendor tracking jadi lebih kredibel
