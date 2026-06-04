# Shipment Verification Flow Audit Notes

Date: 2026-06-02
Project: Sistem Verifikasi Pengiriman dan Penerimaan Barang
Reference:
- `docs/superpowers/specs/LAPORAN LEMBAR KERJA 3 - Capstone A.1 kel 3 (9).pdf`
- `src/pages/VendorDashboard.jsx`
- `src/pages/ScanOfficerDashboard.jsx`
- `src/pages/ManagerDashboard.jsx`

## Purpose

Dokumen ini dipakai sebagai catatan kerja sebelum implementasi lanjutan. Fokusnya:
- merapikan flow bisnis end-to-end
- mencatat gap antara requirement dan web saat ini
- mengunci keputusan yang perlu disepakati dulu
- menyiapkan scope implementasi sekali jalan

## Current Understanding

Problem utama dari requirement:
- vendor membuat shipment/DO dengan daftar box dan isi
- data outbound perlu dikunci secara digital setelah submit
- pabrik perlu membandingkan data outbound vendor vs inbound aktual
- discrepancy harus cepat terdeteksi
- perlu bukti digital untuk audit
- perlu tindak lanjut discrepancy yang terstruktur
- perlu dashboard monitoring lintas vendor/tanggal/part/status

Struktur role yang sudah terlihat di web:
- Vendor
- Scan Officer / Staff Receiving
- Manager
- Admin

## Decision That Should Be Locked First

### Recommended packing model

Model yang paling realistis untuk versi ini:
- `1 QR = 1 box`
- QR ditempel di luar box
- tiap box terhubung ke expected content di manifest
- untuk MVP, `1 box = 1 jenis part`

Kenapa ini direkomendasikan:
- lebih realistis daripada scan per unit/pcs
- tetap bisa auto-compare di level box
- tetap bisa verifikasi actual qty di level box
- lebih ringan untuk receiving dan demo

### What QR should represent

QR jangan hanya jadi token acak tanpa makna operasional. QR harus merefer ke data:
- shipment ID
- box ID / box sequence
- vendor ID
- expected part
- expected qty

Kalau QR hanya identitas box tanpa expected content, maka scan hanya jadi check-in formalitas dan perbandingan isi tetap sepenuhnya manual.

## Recommended Business Flow

### Phase 1: Vendor creates outbound manifest

Vendor input:
- no shipment / no DO
- tanggal kirim
- estimasi tiba
- lokasi asal
- gudang tujuan
- daftar part
- total qty per part
- qty per box per part

Sistem menghasilkan:
- jumlah box per part
- box records otomatis
- expected content per box

Contoh:
- Part A total 100
- qty per box 10
- sistem buat 10 box
- tiap box expected `Part A, 10 pcs`

### Phase 2: Submit and lock

Flow yang disarankan:
- saat vendor `save draft`, manifest sudah tersimpan ke backend
- status shipment = `draft`
- draft masih bisa diedit
- draft belum generate QR
- draft belum masuk queue penerimaan Epson

Saat vendor submit:
- manifest jadi read-only
- shipment status berubah dari `draft` ke `submitted`
- sistem generate QR untuk tiap box
- vendor print QR dan tempel di luar box
- shipment masuk queue Epson sesuai gudang tujuan

Alasan kenapa draft tetap dikirim ke backend:
- vendor tidak kehilangan data saat belum selesai
- backend sudah punya draft manifest lebih awal
- submit menjadi titik finalisasi yang jelas
- routing ke gudang baru dilakukan saat data sudah final

### Phase 3: Physical delivery

Saat barang dikirim:
- status shipment jadi `in_transit`
- vendor dan Epson bisa memonitor progress shipment

### Phase 4: Receiving scan

Saat barang tiba:
- scan officer scan QR per box
- sistem check:
  - QR valid atau tidak
  - box milik shipment mana
  - box sudah pernah discan atau belum
  - scanned boxes vs expected boxes
  - duplicate / missing / unauthorized box

Output scan:
- inbound session / inbound record terbentuk atau ter-update
- shipment status masuk ke `arrived` atau `verifying`
- progress scan terlihat

Aturan scope user:
- scan officer tidak boleh melihat semua shipment
- scan officer hanya melihat shipment untuk gudang yang menjadi scope user tersebut
- manager boleh melihat lintas gudang dengan filter

Implikasi:
- shipment wajib punya `target_warehouse_id`
- user receiving Epson wajib punya `warehouse_scope`
- inbound / receiving record juga perlu menyimpan `warehouse_id`

Poin penting:
- fungsi scan box adalah check-in kemasan dan membuka expected content
- scan box bukan pengganti verifikasi isi fisik

### Phase 5: Verification of actual content

Setelah box discan:
- sistem tampilkan expected part dan expected qty
- petugas konfirmasi actual qty
- petugas bisa tandai kerusakan / catatan kondisi
- petugas bisa upload foto bukti

Result per box / per detail:
- `match`
- `mismatch`
- `missing`
- `over`

### Phase 6: Reconciliation

Sistem membandingkan:
- outbound locked manifest
- inbound scanned boxes
- actual verified qty

Otomatis yang bisa dihitung:
- box expected vs box scanned
- part expected vs actual verified
- missing box
- duplicate scan
- qty mismatch
- over receipt

### Phase 7: Manager action

Kalau ada discrepancy, manager perlu opsi tindak lanjut yang lebih lengkap:
- `approve`
- `hold`
- `recount`
- `return`
- optional: generate `R1` untuk kasus tertentu

Arti sederhana:
- `approve`: manager menerima hasil aktual walau ada selisih
- `hold`: kasus dibekukan sementara menunggu investigasi
- `recount`: petugas diminta hitung ulang
- `return`: barang atau bagian shipment ditolak / dikembalikan

### Phase 8: Completion

Kalau semua box dan qty sesuai:
- shipment status jadi `verified` lalu `completed` / `delivered`

Kalau ada discrepancy:
- shipment masuk jalur exception sampai resolve

## Recommended Status Model

### Shipment status

Status yang lebih rapi:
- `draft`
- `submitted`
- `in_transit`
- `arrived`
- `verifying`
- `verified`
- `discrepancy`
- `completed`
- `returned` (optional, jika perlu status akhir khusus)

### Inbound / verification status

Status inbound yang disarankan:
- `waiting_scan`
- `scan_in_progress`
- `waiting_verification`
- `verification_in_progress`
- `verified`
- `discrepancy_found`
- `resolved`

Catatan:
- jangan campur status shipment dan status inbound kalau semantics-nya berbeda
- label antar role harus konsisten

## Warehouse Routing Rules

Aturan yang disarankan:
- vendor memilih gudang tujuan dari daftar sistem
- hanya shipment `submitted` yang masuk ke queue gudang
- draft tidak boleh muncul di sisi Epson
- scan officer hanya bisa memproses shipment untuk gudang dalam scope user
- manager bisa memantau semua gudang

Versi awal yang paling sederhana:
- `1 scan officer = 1 gudang`

Versi yang lebih fleksibel nanti:
- `1 user Epson = banyak gudang`

Validasi backend yang dibutuhkan:
- jika shipment ditujukan ke Gudang B, user receiving Gudang A tidak boleh memproses shipment itu
- jika vendor memilih gudang di luar scope yang diizinkan, create/submit harus ditolak

## Receiving Officer Mobile UX Direction

### Core decision

Petugas receiving tidak perlu memakai dashboard penuh.

Yang lebih tepat:
- mobile receiving workspace
- fokus ke task operasional
- simple, cepat, dan to the point

Karena user ini bekerja di lapangan dan akan memakai HP, UI harus memprioritaskan:
- scan cepat
- verifikasi cepat
- lanjut box berikutnya

Hal yang sebaiknya tidak ditampilkan sebagai fokus utama:
- chart
- analytics
- vendor performance
- discrepancy rate
- tabel lebar
- banyak tab yang tidak dipakai saat operasional

### Recommended screen model

Bukan dashboard manajerial, tetapi 3 layar utama:

1. `Queue / Active Shipment`
2. `Scan + Verify Box`
3. `Shipment Summary`

### Screen 1: Queue / Active Shipment

Tujuan:
- menunjukkan shipment yang memang relevan untuk gudang user
- memberi pintu masuk ke proses scan

Isi minimum:
- nama gudang aktif
- daftar shipment `submitted` atau `arrived` yang masuk ke gudang itu
- status singkat shipment
- progress jika shipment sudah pernah discan sebagian

Contoh info per card:
- no shipment / no DO
- vendor name
- expected box count
- scanned box count
- last updated
- tombol `Start` atau `Continue`

Catatan:
- kalau hanya ada satu shipment aktif, sistem boleh langsung arahkan ke screen scan

### Screen 2: Scan + Verify Box

Ini adalah layar utama dan paling penting.

Urutan interaksi:
1. petugas scan QR box
2. sistem baca QR dan tampilkan expected content
3. petugas verifikasi actual
4. petugas submit
5. sistem arahkan ke box berikutnya

Komponen utama:
- header kecil:
  - nama gudang
  - shipment reference
  - progress `3/10 box`
- area kamera / scan state
- card hasil scan

Isi card hasil scan:
- box ID
- vendor
- expected item
- expected qty
- unit
- status scan sebelumnya jika duplicate

Field input yang disarankan:
- actual qty
- kondisi box / barang
  - `normal`
  - `damaged`
  - `opened`
  - `other`
- notes
- upload photo jika ada masalah

Action utama:
- `Submit & Next Box`

Action sekunder:
- `Retake / Rescan`
- `Mark Issue`
- `Cancel`

Rekomendasi behavior:
- kalau actual qty = expected qty dan kondisi normal, input harus sangat cepat
- kalau ada mismatch atau kondisi bermasalah, form tambahan baru muncul atau diperluas

### Screen 3: Shipment Summary

Tujuan:
- menunjukkan hasil akhir satu shipment
- memberi closure sebelum lanjut ke shipment lain

Isi minimum:
- shipment reference
- vendor
- gudang
- total expected boxes
- total scanned boxes
- total verified boxes
- total issue boxes
- final shipment result

Kemungkinan result:
- `all matched`
- `completed with issues`
- `requires manager review`

Action:
- `Finish Shipment`
- `View Issue List`
- `Back to Queue`

### Recommended interaction pattern

Pattern yang direkomendasikan:
- `scan 1 box`
- `verify 1 box`
- `submit`
- `next box`

Bukan:
- scan semua box dulu
- baru verifikasi belakangan

Alasan:
- lebih jelas untuk operator
- discrepancy ketahuan lebih cepat
- audit trail per box lebih rapi
- lebih cocok untuk HP dan alur kerja lapangan

### Recommended role definition

Role ini sebaiknya bukan `scanner only`.

Role yang lebih tepat:
- receiving officer

Tugasnya:
- scan QR box
- konfirmasi qty actual
- tandai kondisi barang
- upload bukti jika ada masalah

Manager baru menangani exception:
- approve
- hold
- recount
- return

### Mobile UI principles

Untuk layar HP:
- single-column layout
- tombol besar
- text singkat
- sticky action area di bawah
- camera viewport dominan saat scanning
- card expected content langsung terlihat
- hindari modal bertumpuk
- hindari tabel horizontal

### Suggested state flow

Status UX di layar receiving:
- `ready_to_scan`
- `scan_success`
- `verification_required`
- `submitted`
- `issue_flagged`
- `shipment_completed`

### Open implementation detail

Yang masih perlu dikunci nanti sebelum coding:
- apakah actual qty selalu wajib diisi manual, atau boleh auto-filled dengan expected lalu tinggal confirm
- apakah foto wajib hanya saat issue, atau selalu opsional
- apakah shipment summary muncul otomatis setelah box terakhir, atau harus lewat tombol `Finish`

## Audit of Current Web

### What is already aligned

Hal yang sudah cukup searah:
- vendor sudah input quantity dan `quantity_per_box`
- sistem sudah menghitung `jumlah_box`
- QR sudah diambil setelah submit shipment
- scan officer sudah scan via QR/token
- ada manual verification qty dan upload foto
- manager sudah bisa melihat discrepancy dan melakukan action dasar

### Main gaps

#### 1. Flow scan belum langsung nyambung ke verification

Kondisi sekarang:
- scan sukses memberi feedback
- user masih perlu masuk manual verification dan load inbound lagi

Dampak:
- flow operasional terasa patah
- demo terlihat seperti dua proses terpisah

#### 2. Tindak lanjut discrepancy manager belum lengkap

Kondisi sekarang:
- action manager baru `approve` atau `return`

Dampak:
- belum sesuai flow bisnis yang butuh keputusan bertahap
- `hold` dan `recount` belum terwakili

#### 3. Status antar role belum konsisten

Kondisi sekarang:
- vendor bisa melihat `arrived` seolah barang sudah selesai tiba
- manager melihat `arrived` sebagai menunggu verifikasi

Dampak:
- rawan miskomunikasi
- status terlihat benar di satu dashboard tapi bermakna lain di dashboard lain

#### 4. Manual verification list berpotensi tidak lengkap

Kondisi sekarang:
- inbound `sedang_diproses` masih dianggap butuh verification
- tetapi list manual hanya mengambil `menunggu`

Dampak:
- inbound yang belum selesai bisa sulit ditemukan

#### 5. KPI scan officer belum semuanya terpercaya

Kondisi sekarang:
- ada state KPI yang tidak terisi penuh dari hasil fetch data

Dampak:
- angka dashboard berisiko misleading

#### 6. Model data box-content belum eksplisit di UI

Kondisi sekarang:
- UI mengarah ke shipment, detail, QR, dan verification
- tetapi konsep `expected content per box` belum terasa eksplisit

Dampak:
- user bisa bingung apakah scan membandingkan box, item, atau shipment

## Clarification on "Per Box" vs "Per Item"

### If using per item scan

Kelebihan:
- paling akurat
- otomatis hitung per unit

Kekurangan:
- receiving paling lambat
- operasional paling berat
- kurang realistis kalau shipment besar

### If using per box scan

Kelebihan:
- cepat
- realistis
- cukup kuat untuk audit logistik

Kekurangan:
- isi box tetap perlu verifikasi actual qty
- butuh expected content per box agar scan tidak kosong makna

### Recommended choice

Untuk versi ini:
- pakai `per box`
- expected content harus jelas
- verification actual qty tetap ada

## Scope For One-Pass Implementation Later

Urutan implementasi yang paling masuk akal:

1. Rapikan model status dan label antar dashboard
2. Rapikan flow `scan -> detail expected -> verification`
3. Tampilkan expected content per box secara eksplisit
4. Lengkapi action manager: `approve / hold / recount / return`
5. Rapikan KPI dan queue agar benar-benar pakai data valid
6. Baru poles UI/UX final supaya bersih dan konsisten

## UI/UX Direction

Prinsip visual yang harus dijaga:
- simple
- clean
- modern
- white-base
- tidak banyak warna aneh
- hierarchy jelas

Catatan UI:
- scan page harus fokus ke satu task utama
- setelah scan sukses, tampilkan card expected content langsung
- discrepancy action manager harus jelas, tidak ambigu
- label status harus bisa dipahami non-teknis

## Open Questions To Settle Before Implementation

Hal yang masih perlu diputuskan:
- apakah `1 box` wajib `1 part type`, atau boleh mixed contents?
- apakah manager butuh `hold` dan `recount` di versi sekarang?
- apakah `R1` selalu dibuat saat approve mismatch, atau hanya kasus tertentu?
- apakah vendor boleh lihat detail discrepancy per box atau hanya per shipment?
- apakah inbound status dan shipment status akan dipisah penuh?

## Recommendation

Jangan lanjut patch fitur satu-satu dulu.

Lanjutkan dengan pendekatan:
- kunci keputusan flow final
- kunci status model
- kunci action discrepancy
- lalu implementasi sekali jalan agar tidak bolak-balik ubah UI, state, dan wording
