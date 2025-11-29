# 📘 POS PWA Retail — Product & Development Blueprint

**Versi 1.0 — Final Business + Technical Specification**
(Integrasi ERPNext, Multi-Cabang, Offline-First)

---

## 1️⃣ Visi Operasional

Software ini hadir untuk **mempercepat transaksi**, **menjaga akurasi harga**, dan **menghilangkan downtime** di toko retail multi-cabang.
Kasir harus:

* cepat (≤100 ms item masuk)
* tidak terhambat internet
* tidak pernah ragu harga mana yang benar

Owner harus:

* yakin stok & uang tidak bocor
* punya audit kuat tanpa bullshit

> Kalau POS bikin antrian panjang atau salah harga → mati.

---

## 2️⃣ Scope & Release Rules

### Termasuk di Fase 1:

* POS PWA offline-first
* Multi-cabang (1 database ERPNext)
* Barcode scan & search cepat
* Hold & recall multiple baskets
* Split payment (Cash + QRIS manual input)
* Return full cash < 7 hari
* Price override dengan SPV approval
* Detailed receipt promo breakdown
* Local transaction queue + background sync
* Local audit log anti-hapus

### Tidak Termasuk di Fase 1:

* Integrasi otomatis QRIS atau EDC
* Loyalty point & voucher pusat
* Promo bundling komplisitif campuran kategori
* Self-checkout

> Kalau kamu coba masukin semua ini di fase 1 → proyek kamu **tidak akan pernah selesai**.

---

## 3️⃣ Roles & Permissions

| Role         | Akses                                       | Catatan                                |
| ------------ | ------------------------------------------- | -------------------------------------- |
| Kasir        | transaksi normal                            | tidak boleh ubah harga                 |
| Supervisor   | override harga, void item, cancel transaksi | require PIN                            |
| Admin Cabang | pengaturan device, laporan lokal            | tidak bisa edit transaksi setelah sync |
| HQ/ERP Admin | pricing master & promo control              | sumber pricing resmi                   |

Override = **selalu** simpan siapa, kapan, dan kenapa.

---

## 4️⃣ Business Feature Spec

### 4.1 Scan & Add Behavior

* Barcode scan → **O(1)** lookup local
* Kalau item sudah di cart → +1 qty auto
* Kalau item tidak ditemukan → alert instant (bukan freeze)

### 4.2 Hold / Recall

* Max 20 baskets
* Visible count indicator
* Stored in IndexedDB
* Tidak sync ke server
* Recoverable setelah crash

### 4.3 Return

* Valid 7 hari berdasarkan nomor struk
* Refund **cash only**
* Barcode on receipt → fetch original transaction detail
* Return logged as **negative sale**
* Tidak perlu persetujuan SPV **kecuali**:

  * item berbeda
  * harga beda saat return
  * qty > original

> Return = proses yang paling sering disalahgunakan.
> Audit harus **sejelas mayat di meja otopsi**.

### 4.4 Split Payment

* Cash + QRIS (manual nominal)
* Harus balanced 0
* Receipt menjelaskan pembagian

### 4.5 Price Override

* Require supervisor PIN
* Harus jelaskan **alasan**
* Simpan harga asli + override delta

---

## 5️⃣ Pricing Engine Business Logic

### Rule Hierarchy (paku mati)

```
1) Base Item Price
2) Branch Price Override
3) Member Price
4) Time Limited Promo
5) Quantity Break Discount
6) Spend X Discount
7) Buy X Get Y (free item)
8) Manual Override (with audit)
```

**Result** = harga **terendah valid**

* keep **all rule contributions** for audit + receipt.

> Kalau kamu tidak log penyebab harga akhir → kamu akan kalah dalam perang audit.

---

## 6️⃣ Offline-First Architecture

### Prinsip utama:

> Tidak ada aksi POS yang boleh menunggu server.

Semua transaksi → **Local Queue**
Sync → **background retry** setiap 5–10 detik
Duplicate posting → idempotent check di server

Jika server mati 5 jam:
Kasir tetap transaksi → Sync setelah kembali online
Tidak ada data terbuang.

---

## 7️⃣ Local Storage Schema (IndexedDB)

**Tables:**

* `items` (SKU, barcodes[], name, branchActiveFlag…)
* `prices` (price_by_branch, promo metadata)
* `pricing_rules` (conditions, priority, discount formula)
* `cart_hold`
* `sales_queue`
* `returns`
* `audit_logs`
* `sync_status`

Indexing:

* barcodes primary index
* name tokens for full-text fast search

> Tidak ada query linear yang iterasi 2500 SKU saat user mengetik.

---

## 8️⃣ ERPNext Integration Rules

### Master Data Sync

Pull periodic by:

```
updated_at > last_sync_time
```

Object yang disync:

* Item
* Pricing Rule
* Stock snapshot optional

### Transaction Posting

Push:

* Sales
* Returns
* Override metadata
* Payment breakdown

Tidak ada modify transaksi setelah posted.
Jika salah → buat adjustment baru.

---

## 9️⃣ Security & Anti-Fraud

Wajib:

* PIN hashing local + server verify on online
* Override log immutable (append-only)
* Return → cek original invoice + prevent double return
* Device registration per cabang → track machine identity

> POS adalah medan perang kehilangan uang.
> Kalau kamu tidak paranoid → kamu kalah.

---

## 🔟 UI Performance Requirements (Non-Negotable)

| Aksi           |                 Target |           Status jika gagal |
| -------------- | ---------------------: | --------------------------: |
| Scan → tampil  |                <100 ms |                 **Blocker** |
| Search item    |                <200 ms | Kasir akan berhenti mencari |
| Load startup   |               <2 detik |         Kasir membenci kamu |
| Recovery crash | restore dalam <3 detik |            Panic at cashier |

Jika kamu tidak **ukur**, kamu **halu**.

---

## 1️⃣1️⃣ Testing Plan (Real Retail Scenario)

* Stress test 400 scanning beruntun
* Simulate network on/off setiap 3 transaksi
* Shutdown browser saat transaksi 80% selesai → harus recovery
* Override abuse attempt
* Double return attempt
* Pricing rule conflict testing

> Kalau tidak lulus stress test ini → software kamu **belum pantas dipakai orang nyata**.

---

## 1️⃣2️⃣ Deployment & Devices

Minimum hardware:

* RAM 4GB
* Chrome-based browser terbaru
* Printer ESC/POS via QZ Tray
* Cash drawer through printer kick

Auto update PWA → force reload di luar jam operasional.

---

## 1️⃣3️⃣ Versioning & Rollback

* Semantic versioning
* Silent rollback mechanism jika update fatal
* Data schema migrations **must be reversible**

---

# ⚙️ Development Roadmap (4 Minggu Brutal)

| Minggu | Target Keras                                  | Tidak Lulus → Tidak Lanjut |
| ------ | --------------------------------------------- | -------------------------- |
| 1      | Local DB + Item lookup + Cart + Hold          | Scan < 100ms               |
| 2      | Pricing Engine + Receipt breakdown + Override | Audit fields complete      |
| 3      | Sync Queue + Return + Split Payment           | Crash recovery tested      |
| 4      | Chaos testing + stability + deployment        | 3 hari tanpa restart       |

Kalau kamu kendor 1 minggu → **semua akan mundur 2 bulan**.

---

# 📌 Kesimpulan Tajam

Kamu sekarang **punya blueprint** untuk product POS yang:

* Offline-first
* Multi-cabang
* Pricing kompleks
* Integrasi ERPNext
* Aman dari fraud dasar
* Siap audit
* Kasir-proof
Ikuti spesifikasi ini dengan ketat.
Jangan tambal sulam fitur.
Jangan kompromi prinsip.
Hasilnya: software POS yang **bekerja di dunia nyata**.