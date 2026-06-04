# Persisted Status and Transition Proposal

Date: 2026-06-03
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-gap-validation-checklist-before-be-session.md`
- `docs/2026-06-03-box-entity-backend-proposal.md`

## Purpose

Dokumen ini mengunci usulan:
- status apa saja yang benar-benar disimpan di backend
- status apa saja yang hanya derived untuk UI/dashboard
- transisi status antar entity
- siapa yang memicu perubahan status

Ini penting agar:
- FE tidak menebak-nebak state bisnis
- BE punya source of truth yang jelas
- box-centric flow tetap konsisten

## Core Principle

Jangan campur semua status ke satu tabel atau satu entity.

Pisahkan status menurut tanggung jawab domain:
- shipment status
- box status
- inbound / receiving session status
- discrepancy status
- manager action status

## Proposed Status Layers

Entity yang punya status:
- `Shipment`
- `OutboundBox`
- `Inbound / ReceivingSession`
- `Discrepancy`
- `DiscrepancyAction`

Entity yang sebaiknya tidak jadi source utama status bisnis:
- `InboundDetail`

`InboundDetail` lebih cocok sebagai data hasil verifikasi/agregasi, bukan state machine utama.

## 1. Shipment Status

## Purpose

Menjawab pertanyaan:
- shipment ini sedang ada di tahap bisnis yang mana

## Recommended persisted shipment statuses

Persisted statuses yang direkomendasikan:
- `draft`
- `submitted`
- `in_transit`
- `arrived`
- `verifying`
- `verified`
- `discrepancy`
- `completed`
- optional `returned`

## Meaning of each shipment status

### `draft`

Shipment sudah dibuat dan tersimpan, tetapi:
- masih editable
- belum generate QR
- belum masuk queue receiving Epson

### `submitted`

Shipment sudah final:
- manifest di-lock
- QR per box sudah dibuat
- shipment siap muncul di queue Epson

### `in_transit`

Shipment sedang dalam perjalanan ke gudang tujuan.

### `arrived`

Shipment sudah tiba di gudang dan receiving session bisa dimulai, tetapi verifikasi belum berjalan aktif.

### `verifying`

Receiving sedang berlangsung:
- setidaknya sebagian box sudah discan atau diverifikasi

### `verified`

Semua box yang seharusnya diverifikasi sudah selesai, dan tidak ada issue terbuka yang membuat shipment masuk exception flow.

### `discrepancy`

Shipment selesai diverifikasi tetapi ada issue yang memerlukan review/tindak lanjut manager.

### `completed`

Seluruh proses shipment selesai.

Makna:
- semua box sudah selesai
- semua verification selesai
- semua discrepancy yang ada sudah resolved atau shipment dinyatakan clear

### `returned` (optional)

Dipakai jika hasil akhir shipment adalah retur / rejection dominan.

Catatan:
- ini opsional
- bisa juga cukup direpresentasikan lewat discrepancy action tanpa menjadikannya shipment final state

## Recommended shipment transition rules

Usulan transisi:

- `draft -> submitted`
- `submitted -> in_transit`
- `submitted -> arrived` jika tidak ingin memaksa state transit
- `in_transit -> arrived`
- `arrived -> verifying`
- `verifying -> verified`
- `verifying -> discrepancy`
- `verified -> completed`
- `discrepancy -> completed`
- optional `discrepancy -> returned`

## Who triggers shipment status changes

### Vendor

Vendor boleh memicu:
- `draft -> submitted`

### System or Epson process

Sistem atau proses receiving boleh memicu:
- `submitted -> in_transit`
- `submitted/in_transit -> arrived`
- `arrived -> verifying`

### Receiving completion logic

Sistem boleh memicu:
- `verifying -> verified`
- `verifying -> discrepancy`

### Manager resolution logic

Sistem setelah action manager boleh memicu:
- `discrepancy -> completed`
- optional `discrepancy -> returned`

## Suggested FE dashboard buckets derived from shipment status

Derived bucket, bukan persisted:
- `draft`
- `shipping` = `submitted + in_transit`
- `delivered` = `arrived + verifying + verified + completed`
- `discrepancy` = shipment dengan issue terbuka

Catatan:
- FE dashboard boleh tetap memakai bucket
- tetapi backend status canonical harus tetap granular

## 2. OutboundBox Status

## Purpose

Menjawab:
- box ini sudah sampai tahap mana dalam receiving

## Recommended persisted box statuses

Persisted box statuses:
- `pending`
- `scanned`
- `verified`
- `issue_flagged`

## Meaning

### `pending`

QR box sudah ada, tetapi box belum diproses di receiving.

### `scanned`

Box sudah discan dan teridentifikasi, tetapi verifikasi actual belum selesai.

### `verified`

Box sudah diverifikasi dan hasilnya clear / accepted.

### `issue_flagged`

Box sudah diverifikasi tetapi ada issue:
- mismatch
- over
- damage
- other issue requiring follow-up

## Recommended box transitions

- `pending -> scanned`
- `scanned -> verified`
- `scanned -> issue_flagged`

Optional:
- `issue_flagged -> verified` jika recount atau correction meng-clear issue

## Who triggers box status changes

### Receiving officer / system

Memicu:
- `pending -> scanned`
- `scanned -> verified`
- `scanned -> issue_flagged`

### Manager or recount process

Opsional memicu:
- `issue_flagged -> verified`

## Why box status matters

Karena flow receiving yang dipilih adalah:
- scan 1 box
- verify 1 box
- next box

Jadi backend butuh status di level box, bukan hanya di level shipment.

## 3. Inbound / Receiving Session Status

## Purpose

Menjawab:
- receiving untuk shipment ini sedang ada di tahap mana

Catatan:
- entity actual bisa bernama `Inbound`
- tetapi secara domain lebih jelas jika dipandang sebagai `receiving session`

## Recommended persisted inbound statuses

Persisted statuses:
- `waiting_scan`
- `scan_in_progress`
- `waiting_verification`
- `verification_in_progress`
- `verified`
- `discrepancy_found`
- `resolved`

## Meaning

### `waiting_scan`

Shipment sudah receivable, tetapi belum ada box yang discan.

### `scan_in_progress`

Sudah ada box yang discan, tetapi belum semua box sampai ke tahap siap diverifikasi.

### `waiting_verification`

Seluruh box yang perlu discan untuk sesi tersebut sudah terdaftar, tetapi verifikasi actual belum selesai.

### `verification_in_progress`

Verification actual qty / condition sedang berjalan.

### `verified`

Receiving session selesai dan clear.

### `discrepancy_found`

Receiving session selesai tetapi ada issue yang perlu manager review.

### `resolved`

Issue session sudah diselesaikan.

## Simplification option

Kalau backend ingin lebih sederhana untuk fase awal, boleh sederhanakan menjadi:
- `waiting_scan`
- `verification_in_progress`
- `verified`
- `discrepancy_found`
- `resolved`

Ini cukup untuk MVP yang sehat.

## Recommended inbound transition rules

Versi penuh:
- `waiting_scan -> scan_in_progress`
- `scan_in_progress -> waiting_verification`
- `waiting_verification -> verification_in_progress`
- `verification_in_progress -> verified`
- `verification_in_progress -> discrepancy_found`
- `discrepancy_found -> resolved`

Versi ringkas:
- `waiting_scan -> verification_in_progress`
- `verification_in_progress -> verified`
- `verification_in_progress -> discrepancy_found`
- `discrepancy_found -> resolved`

## Recommendation

Untuk capstone, versi ringkas lebih realistis.

## 4. Discrepancy Status

## Purpose

Menjawab:
- hasil comparison outbound vs inbound untuk item / aggregation ini apa

## Recommended persisted discrepancy statuses

Persisted:
- `match`
- `mismatch`
- `missing`
- `over`

## Meaning

### `match`

Actual sesuai dengan expected.

### `mismatch`

Actual tidak sesuai expected, tetapi bukan zero-missing dan bukan over yang jelas.

### `missing`

Expected tidak terpenuhi.

### `over`

Actual melebihi expected.

## Important rule

`missing` sebaiknya tidak terlalu cepat diputuskan saat proses receiving belum final.

Recommended:
- `missing` baru final saat receiving session ditutup / finalized

Ini perlu disepakati di backend.

## 5. Discrepancy Action Status

Entity:
- `DiscrepancyAction`

## Purpose

Menjawab:
- manager atau system sudah melakukan tindak lanjut apa

## Recommended action types

Action types:
- `approve`
- `hold`
- `recount`
- `return`

## Recommended action status

Status action:
- `pending`
- `done`
- `cancelled`

## Meaning

### `pending`

Action sudah dibuat tetapi belum selesai diterapkan.

### `done`

Action selesai.

### `cancelled`

Action dibatalkan atau tidak lagi berlaku.

## Transition

- `pending -> done`
- `pending -> cancelled`

## Recommendation on manager action effects

### `approve`

Efek yang direkomendasikan:
- discrepancy dianggap selesai
- shipment bisa lanjut ke `completed`

### `hold`

Efek:
- discrepancy tetap terbuka
- shipment tetap di jalur exception

### `recount`

Efek:
- kasus dikembalikan ke receiving / verification flow
- box atau item terkait perlu diverifikasi ulang

### `return`

Efek:
- discrepancy selesai dengan outcome return
- shipment bisa masuk `completed` atau `returned` tergantung keputusan model akhir

## Recommended Derived UI States

UI boleh menurunkan state tambahan, tetapi bukan source of truth.

Contoh derived UI state:
- `pending review`
- `in review`
- `clear`
- `has issue`
- `ready to scan`
- `ready to verify`

Ini boleh dipakai untuk UX, tetapi backend tetap menyimpan canonical statuses di entity yang benar.

## Recommended Source of Truth Summary

### Shipment source of truth

Stored in:
- `tabel_outbound.status`

### Box source of truth

Stored in:
- `tabel_outbound_box.scan_status`

### Inbound source of truth

Stored in:
- `tabel_inbound.status_scan` atau nama field baru yang lebih jelas jika direvisi

### Discrepancy source of truth

Stored in:
- `tabel_discrepancy.status`

### Action source of truth

Stored in:
- `tabel_discrepancy_action.action_type`
- `tabel_discrepancy_action.status_action`

## Recommended Next Lock Decisions

Setelah dokumen ini, yang perlu dikunci berikutnya:

1. apakah inbound akan pakai status versi ringkas atau penuh
2. apakah shipment final state butuh `returned`
3. bagaimana rule final `missing`
4. bagaimana `recount` mempengaruhi box dan inbound state
5. bagaimana endpoint response menampilkan progress berdasarkan box statuses

## Recommendation

Untuk backend session:
- setujui shipment status sebagai canonical business progression
- setujui box status untuk QR-centric receiving
- setujui inbound status versi ringkas untuk MVP
- pertahankan discrepancy status tetap sederhana
- gunakan derived UI buckets hanya untuk dashboard, bukan persisted domain state
