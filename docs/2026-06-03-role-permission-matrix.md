# Role Permission Matrix

Date: 2026-06-03
Purpose: define role-based access, actions, visibility, and restrictions for the shipment verification system
Audience:
- Backend
- Frontend
- Product / flow alignment

Related docs:
- `docs/2026-06-03-backend-final-decisions.md`
- `docs/2026-06-03-dokumen-r1-role-flow-and-access-notes.md`
- `docs/superpowers/specs/2026-06-02-shipment-verification-flow-audit-notes.md`

## Active Roles

Role yang dipakai:
- `vendor`
- `petugas` (`receiving officer` / `scan officer`)
- `manager`
- `admin`

## System Areas

Area utama sistem:
- shipment manifest / outbound
- QR per box
- receiving / scan / verify
- discrepancy
- Dokumen R1
- dashboard / analytics
- notification
- master data

## 1. Vendor

### Main goal

Vendor bertugas membuat shipment yang valid, submit manifest, dan memantau hasil proses penerimaan.

### Main screens

- create / edit shipment form
- shipment list
- shipment detail
- QR list per shipment
- notification center
- discrepancy / shipment outcome view
- R1 detail view

### Allowed actions

- create shipment draft
- edit own draft shipment
- delete own draft shipment
- choose target warehouse
- input item, total qty, qty per box
- submit shipment
- view generated QR per box
- view own shipments
- view own discrepancy outcomes
- view own R1 documents
- read notifications

### Not allowed

- scan or verify incoming boxes
- access receiving queue
- create discrepancy actions
- create or update R1
- access vendor lain
- modify shipment after `submitted`
- access master data admin

### Data visibility

Vendor hanya boleh melihat:
- shipment miliknya sendiri
- discrepancy yang terkait shipment miliknya
- R1 yang terkait discrepancy shipment miliknya
- notifikasi yang dikirim ke akun/vendor-nya

### Backend surface

Expected allowed endpoints:
- `GET /api/outbound`
- `POST /api/outbound`
- `GET /api/outbound/{id}`
- `PUT /api/outbound/{id}` only if own + `draft`
- `DELETE /api/outbound/{id}` only if own + `draft`
- `POST /api/outbound/{id}/submit` only if own + `draft`
- `GET /api/outbound/{id}/qr-token` only if own shipment
- `GET /api/dashboard/summary`
- `GET /api/dashboard/vendor-overview`
- `GET /api/dashboard/vendor-analytics`
- `GET /api/discrepancy` scoped to own shipment/vendor
- `GET /api/dokumen-r1` scoped to own shipment/vendor
- `GET /api/dokumen-r1/{id}` scoped to own shipment/vendor
- `GET /api/notifikasi`
- `POST /api/notifikasi/{id}/read`

### Key restrictions

- vendor identity resolved from auth, not payload
- cannot submit shipment without `target_warehouse_id`
- cannot see data from other vendors
- cannot reopen submitted shipment unless business rule explicitly adds cancel/revise flow

## 2. Petugas / Receiving Officer

### Main goal

Petugas bertugas menerima box fisik, scan QR, verifikasi kondisi dan qty aktual, lalu finalize receiving.

### Main screens

- receiving queue
- active shipment workspace
- scan box screen
- verify box screen
- shipment summary
- minimal recent activity / logs

### Main UX direction

Petugas tidak memakai dashboard analitik penuh.

Workspace utama:
- `Queue`
- `Scan + Verify`
- `Shipment Summary`

### Allowed actions

- view queue for assigned warehouse
- start receiving
- continue receiving
- scan box QR
- manual token input if scan fails
- view expected box content
- input actual qty
- input condition status
- attach notes
- attach photo evidence
- submit verification per box
- finalize receiving

### Not allowed

- create shipment manifest
- edit vendor shipment
- access shipment from warehouse lain outside scope
- approve / hold / recount / return discrepancy
- create or update R1
- access manager analytics
- access admin master data

### Data visibility

Petugas hanya boleh melihat:
- shipment yang `target_warehouse_id` sesuai scope gudangnya
- box dan inbound data untuk shipment di gudangnya
- evidence dan progress yang relevan untuk shipment aktif

### Backend surface

Expected allowed endpoints:
- `GET /api/receiving/queue`
- `GET /api/receiving/{outboundId}`
- `POST /api/receiving/scan-box`
- `POST /api/receiving/verify-box`
- `POST /api/receiving/{inboundId}/finalize`
- legacy compatibility:
  - `POST /api/inbound/scan-qr`
  - `PUT /api/inbound/{id}/manual-verification/{detailId}`
  - `POST /api/inbound/{id}/manual-verification/{detailId}/photo`
  - `POST /api/inbound/{id}/manual-verification/finalize`

### Key restrictions

- warehouse scope mandatory
- no cross-warehouse processing
- cannot process shipment not yet submitted
- cannot finalize before required receiving conditions are met

## 3. Manager

### Main goal

Manager bertugas memonitor shipment dan discrepancy, mengambil keputusan bisnis, dan mengelola tindak lanjut formal.

### Main screens

- manager dashboard
- discrepancy list
- discrepancy detail
- action modal / panel
- R1 document list
- R1 detail
- analytics view

### Allowed actions

- view shipment monitoring
- view discrepancy queue
- filter by vendor / date / warehouse / part / status
- review evidence and verification result
- take discrepancy action:
  - `approve`
  - `hold`
  - `recount`
  - `return`
- create R1 document
- update R1 status
- view R1 lifecycle
- view manager analytics
- read notifications

### Not allowed

- edit vendor manifest directly
- perform core receiving scan flow as main role
- maintain system master data unless also granted admin role

### Data visibility

Manager boleh melihat:
- shipment lintas vendor
- discrepancy lintas vendor
- receiving outcomes
- R1 documents
- analytics and trend data

Scope bisa seluruh sistem atau area tertentu, tergantung kebijakan implementasi.

### Backend surface

Expected allowed endpoints:
- `GET /api/dashboard/summary`
- `GET /api/dashboard/manager-overview`
- `GET /api/dashboard/manager-analytics`
- `GET /api/dashboard/discrepancy-stats`
- `GET /api/dashboard/pending-actions`
- `GET /api/outbound`
- `GET /api/discrepancy`
- `GET /api/discrepancy/{id}`
- `POST /api/discrepancy/{id}/action`
- `GET /api/discrepancy/{id}/actions`
- `GET /api/dokumen-r1`
- `POST /api/dokumen-r1`
- `GET /api/dokumen-r1/{id}`
- `PUT /api/dokumen-r1/{id}/status`
- `GET /api/notifikasi`

### Key restrictions

- manager action should be allowed only on valid discrepancy
- manager should not bypass source-of-truth receiving data
- R1 should be created only from valid discrepancy context

## 4. Admin

### Main goal

Admin bertugas menjaga konfigurasi, master data, dan governance akses sistem.

### Main screens

- admin dashboard
- user management
- vendor management
- warehouse management
- master product / barang management
- system activity / oversight view

### Allowed actions

- create / update / disable user
- create / update vendor
- create / update warehouse
- create / update master barang
- review system-wide data
- support troubleshooting and auditing
- optionally view all R1 and discrepancy records

### Not allowed

- admin tidak harus menjadi pelaku utama receiving atau discrepancy handling sehari-hari
- action operasional harian sebaiknya tetap di role masing-masing

### Data visibility

Admin dapat melihat seluruh data sistem untuk keperluan pengelolaan dan audit.

### Backend surface

Expected allowed endpoints:
- `/api/master/barang/*`
- `/api/master/vendor/*`
- `/api/master/gudang/*`
- `/api/master/user`
- `GET /api/dashboard/summary`
- `GET /api/outbound`
- `GET /api/discrepancy`
- `GET /api/dokumen-r1`
- optional support read for notifications and analytics

### Key restrictions

- admin access should be explicit and auditable
- avoid using admin as shortcut for everyday business flow

## Cross-Role Visibility Rules

### Shipment

- vendor: own shipments only
- petugas: shipment for assigned warehouse only
- manager: all relevant shipments for monitoring
- admin: full visibility

### Discrepancy

- vendor: only discrepancies tied to own shipment
- petugas: optional read-only for shipments being processed, not action owner
- manager: full discrepancy action owner
- admin: full oversight

### R1

- vendor: own R1 only, read-only
- petugas: no R1 management
- manager: create + update + close
- admin: oversight, optional support access

### Warehouse Scope

- vendor: choose from allowed warehouses
- petugas: process only assigned warehouse
- manager: broad monitoring
- admin: config and oversight

## Recommended Permission Summary

### Vendor
- create shipment: yes
- submit shipment: yes
- edit draft: yes
- delete draft: yes
- view own QR: yes
- scan receiving: no
- verify box: no
- finalize receiving: no
- action discrepancy: no
- create R1: no
- update R1 status: no

### Petugas
- create shipment: no
- submit shipment: no
- view receiving queue: yes
- scan box: yes
- verify box: yes
- finalize receiving: yes
- action discrepancy: no
- create R1: no
- update R1 status: no

### Manager
- create shipment: optional no by default
- submit shipment: optional no by default
- view discrepancy queue: yes
- action discrepancy: yes
- create R1: yes
- update R1 status: yes
- analytics: yes

### Admin
- master data management: yes
- full oversight read: yes
- create R1: optional support
- update R1 status: optional support
- everyday receiving flow: not primary

## Recommended FE Routing by Role

### Vendor
- `/vendor`
- `/vendor/shipments`
- `/vendor/shipments/:id`
- `/vendor/notifications`

### Petugas
- `/receiving`
- `/receiving/:shipmentId`
- `/receiving/:shipmentId/summary`

### Manager
- `/manager`
- `/manager/discrepancies`
- `/manager/discrepancies/:id`
- `/manager/r1`

### Admin
- `/admin`
- `/admin/users`
- `/admin/vendors`
- `/admin/warehouses`
- `/admin/products`

## Recommended Backend Enforcement Priorities

1. Enforce vendor ownership on outbound endpoints
2. Enforce warehouse scope on receiving endpoints
3. Enforce manager ownership on discrepancy action endpoints
4. Enforce manager/admin restriction on R1 create/update endpoints
5. Enforce vendor read-only scoping on discrepancy and R1 endpoints

## Final Baseline

Simple baseline yang dikunci:
- `Vendor` creates and monitors shipment
- `Petugas` receives and verifies shipment
- `Manager` reviews and decides discrepancy
- `Admin` maintains system and master data

Kalau nanti ada role baru seperti QC atau warehouse lead, itu ditambahkan sebagai ekstensi, bukan mengubah empat role inti ini.
