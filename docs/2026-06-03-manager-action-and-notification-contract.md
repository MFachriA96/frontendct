# Manager Action and Notification Contract

Date: 2026-06-03
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-02-end-to-end-flow-backend-alignment-handoff.md`
- `docs/2026-06-03-persisted-status-and-transition-proposal.md`
- `docs/2026-06-03-verification-contract-and-discrepancy-rules.md`

## Purpose

Dokumen ini mengunci usulan untuk:
- action manager atas discrepancy
- efek domain dari tiap action
- hubungan action dengan shipment, discrepancy, dan receiving
- notifikasi apa yang harus dipicu backend

## Core Principle

Receiving officer bertugas menemukan dan mencatat issue.

Manager bertugas:
- memutuskan tindak lanjut
- mengubah outcome bisnis
- memicu notifikasi atau dokumen lanjutan

Artinya:
- manager action bukan sekadar UI button
- manager action harus punya efek domain yang jelas

## Recommended Manager Actions

Action yang direkomendasikan:
- `approve`
- `hold`
- `recount`
- `return`

## Meaning of Each Action

### `approve`

Makna:
- manager menerima hasil aktual walau ada selisih
- discrepancy dianggap selesai secara bisnis

Contoh:
- qty kurang sedikit tetapi tetap diterima
- hasil aktual dianggap final

### `hold`

Makna:
- manager menahan kasus
- belum ada keputusan akhir
- perlu investigasi lanjutan atau menunggu pihak lain

### `recount`

Makna:
- manager meminta receiving melakukan verifikasi ulang
- issue belum dianggap selesai
- hasil lama belum dianggap final

### `return`

Makna:
- barang / box / item terkait ditolak atau dikembalikan
- issue selesai dengan outcome retur

## Recommended Data Model

Entity yang tetap dipakai:
- `Discrepancy`
- `DiscrepancyAction`

## Recommended discrepancy action fields

Minimal field yang direkomendasikan:
- `ID_discrepancy_action`
- `ID_discrepancy`
- `action_type`
- `status_action`
- `notes`
- `action_by`
- `action_time`
- optional `metadata_json`

## Recommended action types

Persisted values:
- `approve`
- `hold`
- `recount`
- `return`

## Recommended action statuses

Persisted values:
- `pending`
- `done`
- `cancelled`

## Why action status is still useful

Karena action tidak selalu selesai seketika.

Contoh:
- `recount` dibuat manager, tetapi baru selesai setelah receiving ulang
- `hold` bisa dibuat dulu, lalu nanti di-cancel atau diganti keputusan lain

## Recommended Action Transition Rules

### Generic action transition

- `pending -> done`
- `pending -> cancelled`

## Recommended Domain Effects Per Action

## 1. Approve

### Effect on discrepancy

Discrepancy:
- tetap menyimpan status hasil comparison asli
- tetapi issue dianggap resolved secara bisnis

Artinya:
- discrepancy `status` tidak harus berubah dari `mismatch` menjadi `match`
- yang berubah adalah action outcome

Rekomendasi:
- gunakan `latest_action` sebagai penentu apakah issue sudah selesai

### Effect on shipment

Shipment:
- jika semua discrepancy terkait sudah resolved
- shipment bisa lanjut ke `completed`

### Effect on inbound / receiving

Inbound:
- tidak perlu dikirim kembali ke receiving

### Effect on notification

Notifikasi:
- vendor diberi tahu discrepancy sudah diputuskan
- manager queue berkurang

### Effect on document

Perlu diputuskan:
- apakah `approve` selalu membuat `R1`
- atau hanya untuk jenis discrepancy tertentu

Rekomendasiku:
- `R1` jangan otomatis untuk semua approve
- jadikan configurable / conditional

## 2. Hold

### Effect on discrepancy

Discrepancy:
- tetap open
- latest action = `hold`

### Effect on shipment

Shipment:
- tetap di jalur `discrepancy`
- belum boleh dianggap selesai

### Effect on inbound / receiving

Inbound:
- tidak otomatis kembali ke receiving
- kasus hanya ditahan

### Effect on notification

Notifikasi:
- vendor optional diberi tahu bahwa kasus sedang ditahan
- manager dan admin bisa melihat bahwa kasus belum selesai

## 3. Recount

### Effect on discrepancy

Discrepancy:
- tetap open
- latest action = `recount`

### Effect on shipment

Shipment:
- tetap di jalur `discrepancy` atau kembali ke state review ulang tergantung model akhir

Rekomendasi sederhana:
- shipment tetap `discrepancy` sampai hasil recount selesai

### Effect on inbound / receiving

Inbound:
- receiving terkait harus bisa dibuka lagi untuk verifikasi ulang
- box atau detail terkait kembali ke jalur verification

Ini penting:
- recount harus punya target yang jelas
- jangan recount seluruh shipment jika hanya satu issue

### Effect on notification

Notifikasi:
- receiving officer atau user gudang terkait harus diberi tahu ada recount request
- manager tetap bisa lihat status issue masih pending

## 4. Return

### Effect on discrepancy

Discrepancy:
- dianggap resolved dengan outcome `return`

### Effect on shipment

Shipment:
- bisa tetap `completed` jika model menganggap proses selesai walau ada retur
- atau bisa `returned` jika ingin final state khusus

Rekomendasi untuk MVP:
- shipment cukup bisa `completed`
- outcome `return` dilihat dari discrepancy action

Kalau butuh final state khusus nanti:
- baru tambah `returned`

### Effect on inbound / receiving

Inbound:
- tidak perlu verifikasi ulang

### Effect on notification

Notifikasi:
- vendor perlu diberi tahu ada item/box yang ditolak / diretur

### Effect on document

`R1` atau dokumen retur lebih masuk akal muncul di action ini dibanding di semua approve.

## Recommended Source of Truth for Resolution

Jangan ubah `Discrepancy.status` menjadi status bisnis resolution.

Biarkan:
- `Discrepancy.status` = hasil comparison teknis
- `DiscrepancyAction.latest_action` = hasil tindak lanjut bisnis

Dengan begitu:
- mismatch tetap mismatch
- tapi mismatch itu bisa dianggap resolved karena `approve`

Ini lebih sehat untuk audit.

## Recommended Notification Events

Minimal event yang direkomendasikan:
- discrepancy detected
- discrepancy approved
- discrepancy put on hold
- discrepancy sent for recount
- discrepancy returned
- R1 generated

## Notification Recipients

### Vendor

Vendor sebaiknya menerima:
- discrepancy detected
- discrepancy resolved by approve
- discrepancy returned
- R1 generated / sent

Optional:
- hold notification

### Manager

Manager sebaiknya menerima:
- queue count change
- new discrepancy detected

### Receiving Officer / Warehouse User

Receiving officer sebaiknya menerima:
- recount requested

### Admin

Optional:
- untuk monitoring atau audit exception

## Recommended Notification Payload Shape

Minimal payload:

```json
{
  "type": "discrepancy_recount_requested",
  "title": "Recount requested",
  "message": "Shipment DO-2026-0001 requires recount for item Printer Housing Cover.",
  "related_type": "discrepancy",
  "related_id": 501,
  "severity": "warning"
}
```

## Recommended Notification Types

Usulan type:
- `discrepancy_detected`
- `discrepancy_approved`
- `discrepancy_hold`
- `discrepancy_recount_requested`
- `discrepancy_returned`
- `r1_generated`

## Recommended UI Semantics

Frontend sebaiknya menampilkan:
- comparison status dari discrepancy
- resolution status dari latest action

Contoh:
- `Mismatch`
- `Resolved by approve`

atau

- `Over`
- `Pending recount`

Ini jauh lebih jelas daripada mencampur semuanya dalam satu status.

## Recommended Backend Contract for Manager Action

Contoh endpoint:
- `POST /api/discrepancy/{id}/action`

Request:

```json
{
  "action_type": "recount",
  "notes": "Recheck box 3 quantity.",
  "target_scope": "related_box_only"
}
```

Minimal valid request:
- `action_type`
- optional `notes`

Optional future fields:
- `target_scope`
- `requires_r1`

## Recommended Manager Action Response

```json
{
  "success": true,
  "data": {
    "ID_discrepancy": 501,
    "comparison_status": "mismatch",
    "latest_action": {
      "action_type": "recount",
      "status_action": "pending",
      "action_time": "2026-06-03T10:20:00Z",
      "notes": "Recheck box 3 quantity."
    },
    "shipment_status": "discrepancy",
    "notification_triggered": true
  }
}
```

## Recommended Recount Behavior

Ini salah satu area penting yang harus eksplisit.

Jika action `recount` dibuat:
- discrepancy tetap open
- box atau detail terkait harus ditandai perlu verify ulang
- receiving workflow harus bisa melanjutkan dari context yang benar

Rekomendasi MVP:
- recount berlaku untuk issue terkait saja
- bukan reset seluruh shipment

## Recommended Hold Behavior

Jika action `hold` dibuat:
- jangan ubah hasil comparison
- jangan close issue
- cukup tandai issue sedang ditahan

## Recommended Approve Behavior

Jika action `approve` dibuat:
- issue close secara bisnis
- discrepancy row tetap menyimpan comparison asli
- shipment bisa selesai jika tidak ada issue terbuka lain

## Recommended Return Behavior

Jika action `return` dibuat:
- issue close secara bisnis
- simpan outcome return
- optionally trigger document flow

## Open Questions To Lock

Masih perlu diputuskan:

1. apakah `R1` dibuat untuk `approve`, `return`, atau keduanya
2. apakah `hold` memberi notifikasi ke vendor
3. apakah `recount` target-nya per box, per detail, atau per shipment
4. apakah shipment final state perlu `returned`
5. apakah action baru boleh dibuat jika masih ada action pending sebelumnya

## Recommendation

Untuk backend session:
- jadikan `Discrepancy.status` sebagai comparison truth
- jadikan `DiscrepancyAction.latest_action` sebagai business resolution truth
- jangan campur keduanya
- notifikasi dipicu dari action outcome dan discrepancy event
