# Presentation Briefing

Date: 2026-06-11  
Project: Sistem Verifikasi Shipment Vendor ke Gudang Epson  
Audience: Rekan tim yang akan presentasi ke dosen / penguji

## 1. Tujuan Dokumen

Dokumen ini dibuat sebagai pegangan presentasi agar pembawa materi:
- paham gambaran besar sistem
- tahu urutan penjelasan yang paling aman
- bisa menjelaskan hubungan antar role
- bisa demo tanpa terdengar seperti hanya menunjukkan tampilan halaman

Dokumen ini bukan dokumen teknis backend murni. Fokusnya adalah bagaimana menjelaskan produk secara jelas, runtut, dan meyakinkan.

## 2. Ringkasan Sistem

### Jawaban singkat: sistem ini apa?

Sistem ini adalah website operasional untuk membantu proses pengiriman barang dari vendor ke gudang menjadi lebih terstruktur, terlacak, dan mudah diverifikasi.

### Masalah yang diselesaikan

Sebelum ada sistem:
- vendor membuat pengiriman tanpa alur digital yang rapi
- box barang sulit dilacak satu per satu
- proses scan dan verifikasi di gudang rawan salah input
- saat ada selisih jumlah barang, tindak lanjut ke vendor tidak terdokumentasi dengan jelas
- manager sulit melihat insight dan memutuskan tindakan dengan cepat

### Solusi yang dibangun

Sistem ini membangun alur end-to-end:
1. admin mengelola user dan vendor
2. vendor membuat shipment
3. sistem menghasilkan QR per box
4. petugas scanner menerima dan memverifikasi box
5. jika ada selisih, manager mereview discrepancy
6. manager mengirim dokumen R1 ke vendor sebagai tindak lanjut
7. vendor memproses pengembalian atau pengiriman ulang barang

## 3. Value Utama Sistem

Kalau ditanya "apa manfaat utamanya?", jawab dengan tiga poin ini:

1. `Traceability`
Setiap shipment dan box punya jejak yang lebih jelas.

2. `Verification`
Jumlah aktual barang yang diterima bisa dibandingkan dengan jumlah yang diharapkan.

3. `Follow-up`
Saat ada discrepancy, tindak lanjut ke vendor tidak hilang begitu saja, tetapi masuk ke dokumen dan status proses yang jelas.

## 4. Role dan Tanggung Jawab

### Admin

Tugas utama:
- membuat akun user sesuai role
- mengelola data vendor
- memastikan master data dasar tersedia

Cara menjelaskan:
Admin bukan pengguna operasional pengiriman, tetapi penyiap akses dan master data agar role lain bisa bekerja.

### Vendor

Tugas utama:
- membuat shipment outbound
- mengisi item dan quantity
- submit shipment
- melihat dan mencetak QR per box
- menerima dokumen R1 dan memproses tindak lanjut

Cara menjelaskan:
Vendor adalah sumber data pengiriman. Mereka memulai alur dengan membuat shipment dan menghasilkan QR untuk box yang akan dikirim.

### Petugas Scanner

Tugas utama:
- menerima shipment di gudang
- scan QR box
- mengisi quantity aktual
- menyelesaikan receiving shipment

Cara menjelaskan:
Petugas scanner fokus pada operasional lapangan. Flow-nya dibuat sederhana, mobile-first, dan scan-first.

### Manager

Tugas utama:
- memantau dashboard operasional
- melihat shipment dan discrepancy
- membuat keputusan atas selisih
- mengirim dokumen R1 ke vendor
- menutup tindak lanjut saat proses selesai

Cara menjelaskan:
Manager adalah pengambil keputusan. Dashboard manager bukan sekadar daftar data, tetapi tempat melihat insight dan kasus prioritas.

## 5. Istilah Penting yang Harus Dipahami

### Shipment

Satu pengiriman dari vendor ke gudang.

### Outbound

Data pengiriman yang dibuat vendor sebelum barang diterima gudang.

### Box

Unit fisik per bagian dari shipment. Satu shipment bisa punya banyak box.

### QR Token

Identitas unik yang melekat pada tiap box dan digunakan saat scan.

### Inbound / Receiving

Data penerimaan barang di gudang saat box discan dan diverifikasi.

### Discrepancy

Selisih antara jumlah barang yang dikirim dan jumlah yang diterima / diverifikasi.

### Dokumen R1

Dokumen tindak lanjut resmi yang dikirim manager ke vendor untuk memproses pengembalian atau pengiriman ulang barang.

## 6. Flow Bisnis End-to-End

Ini adalah alur paling penting saat presentasi.

### Tahap 1: Setup awal oleh admin

Admin:
- membuat akun user
- menetapkan role
- mengelola data vendor

Poin presentasi:
Sistem sudah punya role-based access. User tidak masuk ke halaman yang sama, tetapi ke workspace sesuai perannya.

### Tahap 2: Vendor membuat shipment

Vendor:
- membuka halaman buat shipment
- memilih gudang tujuan
- mengisi item dan quantity
- submit shipment

Setelah submit:
- QR per box tersedia
- vendor bisa melihat detail shipment
- vendor bisa download atau print QR

Poin presentasi:
Website tidak berhenti di input form. Sistem langsung menurunkan manifest ke level box agar proses receiving bisa lebih granular.

### Tahap 3: Gudang menerima shipment

Petugas scanner:
- melihat daftar shipment untuk gudang yang menjadi scope-nya
- memilih shipment
- scan box satu per satu
- melihat quantity ekspektasi
- mengisi quantity aktual
- lanjut scan box berikutnya
- menyelesaikan receiving

Poin presentasi:
Scanner dibuat untuk operasional nyata: scan-first, ada fallback manual, progress box terlihat, dan session aktif bisa dilanjutkan.

### Tahap 4: Jika ada selisih

Jika quantity aktual tidak sesuai:
- sistem akan mencatat discrepancy
- discrepancy dapat naik ke manager untuk direview

Poin presentasi:
Sistem tidak hanya mencatat mismatch, tetapi meneruskan mismatch ke tahap keputusan.

### Tahap 5: Manager menindaklanjuti

Manager:
- melihat dashboard
- membuka kasus yang perlu keputusan
- mereview discrepancy
- memilih tindakan
- jika perlu, membuat dan mengirim dokumen R1 ke vendor

Poin presentasi:
Manager tidak hanya melihat data, tetapi punya alur keputusan yang terdokumentasi.

### Tahap 6: Vendor memproses R1

Vendor:
- membuka tindak lanjut R1
- melihat ringkasan selisih
- membaca instruksi manager
- memperbarui status proses
- menandai saat barang sudah dikirim ulang

Manager:
- memantau progres
- menutup tindak lanjut saat selesai

Poin presentasi:
R1 adalah jembatan antara discrepancy dan aksi nyata vendor.

## 7. Penjelasan Halaman per Role

### Login

Hal penting:
- satu halaman login
- setelah login, user diarahkan ke dashboard sesuai role
- user yang sudah login tidak bisa kembali ke halaman login dengan tombol back

Kalau ditanya:
"Kenapa satu login cukup?"
Jawab:
Karena autentikasi dipisahkan dari workspace. Role menentukan halaman tujuan setelah login.

### Admin Dashboard

Hal penting:
- manajemen user
- manajemen vendor
- aktivitas terbaru
- skeleton/loading state sudah jelas saat data belum selesai dimuat

Cara menjelaskan:
Admin dashboard berperan sebagai kontrol data dasar, bukan pusat operasional pengiriman.

### Vendor Dashboard

Hal penting:
- dashboard progress shipment
- create shipment
- daftar shipment
- modal detail shipment
- QR per box
- download semua / print semua QR
- tindak lanjut R1

Cara menjelaskan:
Vendor adalah titik awal data, jadi workflow vendor harus kuat dari create shipment sampai tindak lanjut setelah discrepancy.

### Scanner Dashboard

Hal penting:
- mobile-first
- daftar shipment untuk gudang
- scan kamera dan manual fallback
- quantity aktual
- progress scan
- shipment aktif tetap terlihat di tab riwayat

Cara menjelaskan:
Scanner dibuat sesederhana mungkin, karena yang penting adalah kecepatan dan kejelasan tindakan.

### Manager Dashboard

Hal penting:
- KPI dan insight visual
- shipment list
- discrepancy review
- laporan R1
- preview dokumen tindak lanjut

Cara menjelaskan:
Manager dashboard menekankan insight dan prioritas, bukan hanya tabel data.

## 8. Demo Flow yang Direkomendasikan

Gunakan urutan ini agar demo terasa seperti sistem, bukan sekadar tur halaman.

### Flow demo 1: end-to-end singkat

1. login admin
2. tunjuk user/vendor management
3. login vendor
4. buat shipment
5. buka QR box
6. login scanner
7. scan box dan verifikasi
8. login manager
9. buka dashboard dan review discrepancy
10. kirim R1 ke vendor
11. login vendor lagi
12. buka tindak lanjut R1

### Flow demo 2: jika waktu sangat pendek

1. jelaskan role
2. vendor create shipment + QR
3. scanner verifikasi
4. manager review
5. vendor tindak lanjut R1

## 9. Narasi Presentasi yang Aman

Kalau presenter bingung mulai dari mana, pakai narasi ini:

> Sistem ini dirancang untuk mengelola alur pengiriman barang dari vendor ke gudang secara end-to-end. Dimulai dari vendor yang membuat shipment dan QR per box, lalu petugas scanner menerima dan memverifikasi box di gudang, kemudian manager mereview discrepancy jika terjadi selisih, dan mengirim dokumen R1 ke vendor sebagai tindak lanjut resmi. Dengan begitu, sistem ini tidak hanya mencatat pengiriman, tetapi juga membantu proses verifikasi dan penyelesaian masalah secara operasional.

## 10. Hal yang Layak Dibanggakan

Ini poin yang boleh ditekankan saat presentasi:

- role-based workspace sudah jelas
- flow shipment sampai tindak lanjut sudah nyambung
- QR per box sudah bisa diunduh dan diprint
- scanner punya fallback manual
- discrepancy punya alur keputusan, bukan berhenti di status
- R1 sudah menjadi workflow tindak lanjut yang bisa dipantau
- dashboard manager dan vendor sudah lebih visual dan fokus

## 11. Hal yang Harus Dijawab dengan Jujur

Kalau dosen bertanya tentang kekurangan, jangan defensif. Jawab seperti ini:

### Soal performa

Jawaban:
Masih ada ruang optimasi di backend, terutama pada beberapa endpoint dashboard dan data list, tetapi struktur flow dan fitur utamanya sudah berjalan.

### Soal scanner lintas device

Jawaban:
Scanner sudah mendukung kamera dan manual fallback. Untuk kompatibilitas perangkat yang lebih luas, sudah ditambahkan fallback berbasis library QR, namun tetap perlu validasi langsung di device target.

### Soal kualitas dokumen / tindak lanjut

Jawaban:
Flow R1 sudah mendukung proses tindak lanjut, tetapi masih bisa dikembangkan lebih jauh jika ingin menambah bukti operasional seperti nomor resi atau metadata pengiriman ulang.

## 12. Pertanyaan Dosen yang Paling Mungkin Muncul

### "Kenapa perlu ada role scanner sendiri?"

Jawaban:
Karena proses receiving butuh audit trail, pembatasan gudang, dan pemisahan tanggung jawab. Scanner bukan admin dan bukan vendor; dia fokus pada verifikasi operasional di gudang.

### "Apa bedanya discrepancy dan dokumen R1?"

Jawaban:
Discrepancy adalah temuan selisih. Dokumen R1 adalah tindak lanjut resmi yang dibuat manager untuk meminta vendor memproses pengembalian atau pengiriman ulang.

### "Kenapa pakai QR per box, bukan per shipment?"

Jawaban:
Karena verifikasi dilakukan di level box, bukan hanya level shipment. Dengan QR per box, proses scan dan pencatatan quantity aktual jadi lebih granular.

### "Apa yang terjadi kalau scan gagal?"

Jawaban:
Scanner tetap bisa lanjut lewat manual token input, jadi proses receiving tidak sepenuhnya bergantung pada kamera.

### "Apa kontribusi dashboard manager?"

Jawaban:
Dashboard manager membantu melihat shipment, kasus prioritas, dan tindak lanjut discrepancy secara ringkas agar keputusan lebih cepat diambil.

## 13. Checklist Sebelum Presentasi

Pastikan hal ini siap:

- semua akun login tersedia
- data vendor dan user sudah ada
- ada minimal satu shipment yang siap dipakai demo
- ada QR yang bisa dibuka
- scanner bisa scan atau minimal manual input bisa dipakai
- ada satu contoh discrepancy
- ada satu dokumen R1 untuk diperlihatkan
- pop-up print tidak diblokir browser
- jaringan dan backend sedang stabil

## 14. Urutan Belajar untuk Presenter

Kalau rekanmu belum terlalu hafal, suruh dia baca urutan ini:

1. baca bagian ringkasan sistem
2. pahami role
3. hafal flow end-to-end
4. pahami arti discrepancy dan R1
5. latihan demo dengan urutan yang direkomendasikan
6. baca daftar pertanyaan dosen

## 15. Penutup Singkat untuk Presentasi

Presenter bisa menutup dengan kalimat ini:

> Secara keseluruhan, sistem ini membantu menjembatani proses pengiriman, penerimaan, verifikasi, dan tindak lanjut discrepancy dalam satu alur yang terintegrasi. Jadi nilai utamanya bukan hanya digitalisasi input data, tetapi juga keterlacakan dan pengambilan keputusan operasional yang lebih jelas.
