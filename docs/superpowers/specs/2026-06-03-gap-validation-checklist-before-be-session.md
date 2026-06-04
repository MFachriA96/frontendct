# Gap Validation Checklist Before BE Session

Date: 2026-06-03
Purpose: final sanity check before backend alignment session
Related doc:
- `docs/superpowers/specs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`

## How to Use This Checklist

Dokumen ini dipakai untuk memastikan pembahasan flow yang sudah dilakukan:
- mana yang sudah cukup matang
- mana yang masih perlu diputuskan di sesi backend
- mana yang bisa ditunda ke fase berikutnya

## A. Already Covered Well

Bagian ini sudah cukup kuat untuk dibawa ke sesi backend:

### 1. Core end-to-end flow

Sudah tercakup:
- vendor create shipment
- draft disimpan ke backend
- submit mengunci manifest
- QR dibuat per box
- receiving officer scan dan verify
- issue naik ke manager

### 2. Main domain terms

Sudah tercakup:
- shipment
- manifest
- outbound detail
- box record
- QR token
- inbound / receiving record
- verification
- discrepancy
- manager action

### 3. Role boundaries

Sudah tercakup:
- vendor
- receiving officer
- manager
- admin

### 4. Warehouse routing concept

Sudah tercakup:
- target warehouse wajib
- receiving officer harus punya warehouse scope
- shipment Epson harus difilter by target warehouse

### 5. Draft vs submit concept

Sudah tercakup:
- draft persisted
- submit final validation
- submit lock data
- submit trigger QR generation

### 6. Mobile receiving UX direction

Sudah tercakup:
- no heavy dashboard
- mobile task flow
- queue
- scan + verify
- shipment summary

### 7. Scanner safeguards

Sudah tercakup:
- manual token fallback
- retry
- duplicate scan handling
- wrong warehouse handling
- camera failure handling
- bad network basic handling

### 8. Product strategy

Sudah tercakup:
- master product as primary path
- custom product as exception

### 9. Manager action direction

Sudah tercakup sebagai target model:
- approve
- hold
- recount
- return

## B. Must Still Be Decided in BE Session

Bagian ini belum cukup final dan harus dikunci bersama backend.

### 1. Canonical persisted statuses

Harus diputuskan:
- status shipment mana yang benar-benar disimpan
- status inbound mana yang benar-benar disimpan
- status mana yang hanya derived bucket untuk dashboard

### 2. Discrepancy granularity

Harus diputuskan:
- discrepancy dibuat per shipment, per detail, atau per box
- apakah `match` juga disimpan sebagai row

### 3. Missing finalization rule

Harus diputuskan:
- kapan `missing` dianggap final
- apakah saat satu box gagal
- atau saat receiving shipment ditutup/finalized

Ini penting dan belum cukup presisi.

### 4. Partial receipt / multi-session receiving

Harus diputuskan:
- apakah satu shipment boleh diterima bertahap
- apakah satu shipment boleh punya beberapa receiving session
- bagaimana progress dan status dihitung jika pengiriman datang bertahap

### 5. Verification entity and endpoint contract

Harus diputuskan:
- verification submit berdasarkan `qr_token`, `box_id`, atau entity lain
- actual qty disimpan di tabel mana
- condition status disimpan di mana
- photo evidence terhubung ke entity apa

### 6. Box-level persistence model

Harus diputuskan:
- apakah box jadi entitas backend tersendiri
- atau hanya dibentuk saat generate QR
- bagaimana last partial box direpresentasikan

### 7. Manager action effects

Harus diputuskan:
- efek `approve`
- efek `hold`
- efek `recount`
- efek `return`

Ke mana impact-nya:
- discrepancy
- shipment status
- notification
- R1 document

### 8. R1 generation rule

Harus diputuskan:
- otomatis atau manual
- dibuat untuk action apa saja
- siapa yang memicu

### 9. Warehouse permission enforcement

Harus diputuskan:
- vendor boleh pilih semua gudang atau hanya gudang tertentu
- user Epson bisa single warehouse atau multi-warehouse
- rule backend saat user mencoba akses shipment di luar scope

### 10. Error reason contract

Harus diputuskan:
- daftar error reason minimum untuk scanner
- shape response yang cukup jelas untuk FE

Contoh:
- invalid QR
- duplicate scan
- wrong warehouse
- shipment closed
- draft shipment not receivable

## C. Important But Can Be Deferred If Needed

Bagian ini bagus untuk best practice industri, tapi tidak harus jadi blocker sesi backend pertama.

### 1. Tolerance rules

Contoh:
- apakah selisih kecil masih bisa diterima tanpa discrepancy
- apakah ada tolerance per part tertentu

### 2. QC / quarantine flow

Contoh:
- barang rusak masuk hold area
- butuh review QC sebelum manager final action

### 3. Reverse logistics after return

Contoh:
- apakah return bikin shipment balik
- apakah hanya status administratif

### 4. Full audit metadata

Contoh tambahan:
- device info
- IP / browser context
- full action history detail

### 5. SLA analytics

Contoh:
- receiving lead time
- discrepancy aging
- warehouse backlog

### 6. Master data governance for custom products

Contoh:
- siapa approve custom product
- apakah custom bisa di-promote ke master

### 7. Label design standard

Contoh:
- QR
- manual token
- box ID
- shipment ref
- short product label

## D. Best Practice Assessment

### Current maturity

Untuk level capstone / serious prototype:
- flow coverage sudah kuat
- role boundaries sudah sehat
- warehouse-based routing sudah benar
- mobile receiving direction sudah masuk akal

### Current limitation

Belum setara enterprise logistics system penuh karena:
- final discrepancy rules belum dikunci
- receiving session model belum final
- reverse / QC / tolerance flow belum lengkap

## E. Recommendation Before BE Session

Masuk ke sesi backend dengan mindset:
- core operating model sudah cukup siap
- jangan ubah keputusan besar yang sudah sehat kecuali backend punya constraint kuat
- fokus sesi backend adalah mengunci source of truth dan state transitions

## F. Success Criteria for the BE Session

Sesi backend dianggap sukses jika keluar keputusan jelas untuk:
- persisted statuses
- box-level model
- verification contract
- discrepancy rules
- manager action effects
- warehouse scope enforcement
- error response contract

## G. Short Conclusion

Jawaban singkat untuk validasi:
- ya, flow utama sudah tercakup dengan baik
- belum semua best practice industri enterprise tercakup
- gap yang tersisa sudah cukup jelas dan mostly memang harus dikunci di backend session
