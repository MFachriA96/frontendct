# Presenter Cheat Sheet

Date: 2026-06-11

## 1. Opening 30 Detik

> Website ini adalah sistem verifikasi shipment dari vendor ke gudang. Vendor membuat shipment dan QR per box, petugas scanner memverifikasi box saat barang datang, lalu jika ada selisih manager menindaklanjuti lewat dokumen R1 ke vendor.

## 2. Struktur Cerita Presentasi

Urutan paling aman:
1. masalah
2. solusi
3. role
4. flow end-to-end
5. demo
6. nilai sistem

## 3. Role Singkat

### Admin
- kelola user
- kelola vendor

### Vendor
- buat shipment
- lihat QR
- proses R1

### Scanner
- scan box
- input quantity aktual
- selesaikan receiving

### Manager
- monitor dashboard
- review discrepancy
- kirim dan tutup R1

## 4. Flow Demo Singkat

1. login admin
2. tunjuk data user/vendor
3. login vendor
4. buat shipment
5. tampilkan QR
6. login scanner
7. scan dan verifikasi
8. login manager
9. review discrepancy
10. kirim R1
11. balik ke vendor
12. buka tindak lanjut R1

## 5. Poin yang Harus Diucapkan Saat Demo

### Saat vendor create shipment

> Vendor menjadi sumber data awal pengiriman.

### Saat QR tampil

> QR dibuat per box agar receiving bisa dilakukan secara granular.

### Saat scanner verifikasi

> Petugas membandingkan quantity aktual dengan quantity yang diharapkan.

### Saat discrepancy muncul

> Selisih tidak berhenti sebagai data, tetapi diteruskan ke alur keputusan manager.

### Saat manager buka R1

> Dokumen R1 adalah tindak lanjut resmi ke vendor.

## 6. Jawaban Cepat untuk Pertanyaan Umum

### Kenapa ada scanner?

Karena receiving butuh audit trail dan scope gudang.

### Kenapa QR per box?

Karena verifikasi dilakukan per box, bukan hanya per shipment.

### Apa bedanya discrepancy dan R1?

Discrepancy adalah temuan selisih. R1 adalah dokumen tindak lanjut.

### Kalau kamera scan gagal?

Ada manual token fallback.

## 7. Kalimat Aman Saat Ditanya Kekurangan

> Flow inti sudah berjalan end-to-end, tetapi performa backend dan beberapa hardening operasional masih bisa dioptimalkan lebih lanjut.

## 8. Poin Penutup

> Inti dari sistem ini adalah membuat alur shipment, verifikasi, dan tindak lanjut discrepancy menjadi lebih jelas, terstruktur, dan terdokumentasi.
