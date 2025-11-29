
# 🔥 DATA MODEL POS — RETAIL MULTI-CABANG

**Tujuan desain:**

* POS bisa **offline**, ERPNext jadi **source of truth**
* Tidak ada **double posting**
* Semua promo dan override **terekam**
* Audit lengkap: siapa → kapan → apa yang diubah

---

## 1️⃣ POS Cart (hold transactions)

> Tempat transaksi tinggal disimpan sebelum menjadi Invoice

| Field          | Type                        | Rules                               |
| -------------- | --------------------------- | ----------------------------------- |
| name           | Auto                        | QR-shareable identifier             |
| cashier        | Link → User                 | Required                            |
| branch         | Link → Warehouse            | Required                            |
| customer       | Link → Customer             | Default: “Umum”                     |
| status         | Select(Hold/Draft/Conflict) | Only Hold used                      |
| total_qty      | Float                       | Auto calc                           |
| subtotal       | Currency                    | Auto calc                           |
| total_discount | Currency                    | Auto calc                           |
| total_payable  | Currency                    | Auto calc                           |
| override_flag  | Check                       | True bila ada override harga/diskon |
| modified_at    | Datetime                    | Local machine time                  |
| source_device  | Data                        | For fraud tracking                  |

📌 **Tidak pernah** push ini menjadi Sales Invoice.
Saat lanjut transaksi → copy cart → buat Sales Invoice baru saat sync.

---

## 2️⃣ POS Cart Item

> Detail produk dalam cart

| Field              | Type            | Rules                       |
| ------------------ | --------------- | --------------------------- |
| parent             | Link → POS Cart | Required                    |
| item_code          | Link → Item     | Required                    |
| item_name          | Data            | Freeze saat add             |
| qty                | Float           | Required                    |
| rate               | Currency        | Harga berlaku setelah promo |
| discount_amount    | Currency        | Per item                    |
| promo_applied      | Data            | JSON: rule id + breakdown   |
| is_manual_override | Check           | Requires authorization      |
| override_by        | Link → User     | Required if overridden      |

📌 Semua perubahan harga → wajib terekam → **tidak boleh silent**.

---

## 3️⃣ POS Sync Queue

> Kumpulan transaksi siap post ke ERPNext

| Field         | Type                           | Rules                         |
| ------------- | ------------------------------ | ----------------------------- |
| name          | Auto                           | UUID                          |
| data          | Long JSON                      | Snapshot final POS -> Invoice |
| branch        | Link → Warehouse               | Required                      |
| cashier       | Link → User                    | Required                      |
| status        | Select(Pending/Success/Failed) | Default: Pending              |
| retries       | Int                            | Max 5                         |
| error_message | Small Text                     | If failed                     |
| synced_at     | Datetime                       | If success                    |

📌 JSON di sini harus **final**, tidak boleh diedit kasir lagi.

---

## 4️⃣ Cashier Authorization Log

> Override approval untuk audit

| Field      | Type                                                            | Rules     |
| ---------- | --------------------------------------------------------------- | --------- |
| action     | Select(price override / remove item / void cart / big discount) | Required  |
| cashier    | Link → User                                                     | Required  |
| supervisor | Link → User                                                     | Required  |
| item_code  | Link → Item                                                     | Optional  |
| old_value  | Currency                                                        | —         |
| new_value  | Currency                                                        | —         |
| reason     | Small Text                                                      | Mandatory |
| timestamp  | Datetime                                                        | Required  |

📌 Supervisor bisa login PIN cepat di kasir.

---

## 5️⃣ Branch Promotion Rule (Phase 2)

> Promo override khusus cabang

| Field     | Type                | Rules    |
| --------- | ------------------- | -------- |
| promotion | Link → Pricing Rule | Required |
| branch    | Link → Warehouse    | Required |
| is_active | Check               | Required |

📌 Jangan sentuh dulu — **Phase 2** setelah sistem berjalan stabil.

---

## 6️⃣ Daily Cash Report (Settlement)

> Rekonsiliasi uang fisik vs sistem

| Field             | Type             | Rules              |
| ----------------- | ---------------- | ------------------ |
| cashier           | Link → User      | Required           |
| branch            | Link → Warehouse | Required           |
| date              | Date             | Required           |
| cash_total_system | Currency         | Auto               |
| cash_total_actual | Currency         | Input kasir        |
| variance          | Currency         | Auto calc          |
| qris_total        | Currency         | Auto from invoices |
| notes             | Text             | —                  |

📌 **Penting untuk mencegah kebocoran uang**.

---

# ⚠️ RULE BISNIS KUNCI (Bukan opsional)

| Area               | Rule                                              |
| ------------------ | ------------------------------------------------- |
| Override harga     | Harus ada otorisasi + log                         |
| Promo              | POS hitung → kirim breakdown ke Invoice line item |
| Offline            | Hanya pending → sync create Sales Invoice         |
| Conflict           | Duplicate invoice attempt → lock + manual resolve |
| Return             | Always reference original invoice                 |
| Multi-branch price | Controlled by Price List per Warehouse            |

---
# 🔥 KEBIJAKAN RETURN, OVERRIDE, VOID DI POS
---

# 🎯 Kebijakan Optimal yang Tidak Menyiksa Operasional

## 1️⃣ Return: Reference diutamakan → tapi ada fallback

* Kalau ada nomor invoice → proses full refund aman
* Kalau **tidak ada reference**:

  * Refund **hanya dalam bentuk store credit/voucher**
  * Jumlah refund mengikuti **harga promo asli paling rendah**
  * Supervisor approval wajib

Hasilnya:

* Pelanggan tidak “mentok”
* Risiko kehilangan uang **sangat kecil**
* Tidak perlu banyak debat di kasir

---

## 2️⃣ Override harga saat offline

* Override **tetap boleh** tapi:

  * Maksimal potongan: **5–10%**
  * Harus input **alasan override**
  * Log dikirim ke supervisor saat online
  * Jika supervisor menolak → adjustment di settlement kasir

**Kamu tetap punya kontrol.**
Tapi kasir tidak berhenti kerja hanya karena WiFi putus.

---

## 3️⃣ Void transaksi setelah payment

* Diperbolehkan **di kasir**
* Refund hanya **kas kecil limit** (misal ≤ 100 ribu)
* > 100 ribu → supervisor approval wajib
* Semua void → **langsung masuk dashboard admin untuk audit**

Ini sangat mengendalikan fraud internal **tanpa membuat antrian tersendat**.

---

## 4️⃣ Member price otomatis + verifikasi instan

* Harga member otomatis aktif
* Tapi kasir **harus verifikasi nomor HP atau barcode member**
* Jika kasir salah pilih member → mudah dilacak indeks penipuan

Customer happy, accuracy tetap ada.

---

# 🔥 Perubahan Kebijakan Final (Recommended)

| Area               | Kebijakan Final                                                  |
| ------------------ | ---------------------------------------------------------------- |
| Return             | Reference wajib → Jika tidak ada → store credit + promo terendah |
| Override offline   | Boleh tapi dibatasi & dicatat                                    |
| Void setelah bayar | Boleh up to limit kecil tanpa spv                                |
| Promo member       | Otomatis dengan verifikasi cepat                                 |
| Logging & audit    | Wajib detail: device, kasir, waktu, alasan                       |

---

## 📌 Dampak

| Dampak Positif                   | Risiko Terkendali                          |
| -------------------------------- | ------------------------------------------ |
| Antrian tetap lancar             | Fraud override dibatasi                    |
| Pelanggan tetap bisa retur       | tanpa risiko abuse besar                   |
| Kasir tidak panik saat offline   | Semua tercatat → mudah investigasi         |
| Supervisor tidak jadi bottleneck | tapi tetap pegang kendali pada kasus besar |

Kamu **mencegah kebangkrutan operasional** tanpa membuat toko jadi penjara.

---


# POS → ERPNext: System Flow (narasi + diagram sederhana)

## Ringkasan singkat

1. Perangkat (Device) **diregister** ke cabang → mendapat `device_id` & `api_key`.
2. Saat startup: POS (PWA) melakukan **initial sync** (master data: items, prices, pricing_rules, customers subset) ke IndexedDB.
3. Kasir bekerja: scan → cart → hold → payment. Semua tindakan ditulis lokal ke `POS Cart` + `sales_queue`.
4. Setelah payment: POS menyimpan `local_tx` (immutable snapshot) ke `sales_queue`, memicu **print** (QZ Tray).
5. Sync engine (background) mengirim batch `sales_queue` ke ERPNext via endpoint secure `pos_api.sync_sales_batch`. Server mengecek idempotency dan validasi.
6. Server mengembalikan mapping `local_tx_id -> frappe_docname` + status. POS update local record.
7. Konflik (stock/pricing) → server response `needs_review` / `needs_attention`. POS menandai dan admin/ supervisor menangani melalui ERPNext desk.
8. Monitoring/alerts dipicu jika queue panjang / retries gagal.

## Sequence (ASCII)

```
[Device] -> (1) Register -> [ERPNext: POS Device]
[Device] -> (2) Initial Sync -> [ERPNext: Master Data]
User -> (3) Create Cart -> [IndexedDB: POS Cart]
User -> (4) Payment -> [IndexedDB: sales_queue(local_tx)]
[Device Sync Engine] -> (5) POST batch -> [ERPNext: pos_api.sync_sales_batch]
[ERPNext] -> (6) Validate & Create Invoice/Payment -> returns mapping
[Device] -> (7) update local -> print ack / show success
If error: [ERPNext] -> status needs_review -> [Admin handles in ERPNext]
```

# API & Endpoint Spec (server-side — Frappe app)

> Endpoint final: `POST /api/method/pos_integration.api.sync_sales_batch`

## Auth

* TLS only (HTTPS)
* `device_id` + `api_key` in JSON body OR `Authorization: ApiKey device_id:api_key`
* Server verifies `POS Device` DocType (`is_active`)

## Request payload (batch)

```json
{
  "device_id": "store1-term-02",
  "api_key": "xxxxxxxxxxxxxxxxxxxx",
  "batch": [
    {
      "local_tx_id": "uuid-1234",
      "cart": {
        "cashier": "user@example.com",
        "branch": "BR-001",
        "customer": "CUST-001",
        "items": [
          {"item_code":"ITEM-001","qty":2,"unit_price":15000,"line_discount":0,"promo_applied":["PROMO-1"]},
          {"item_code":"ITEM-002","qty":1,"unit_price":10000,"line_discount":1000}
        ],
        "subtotal": 40000,
        "total_discount": 1000,
        "total_payable": 39000,
        "payments":[ {"mode":"Cash","amount":30000},{"mode":"QRIS","amount":9000} ],
        "price_breakdown":[
          {"item_code":"ITEM-001","base_price":17000,"applied":[{"rule":"BR-PRICE","delta":-2000}]}
        ],
        "is_return": false,
        "meta": {"printed": true, "device_time":"2025-11-29T09:12:00+07:00"}
      }
    }
  ]
}
```

## Response (success)

```json
{
  "results": [
    {"local_tx_id":"uuid-1234","status":"synced","docname":"SINV-0001","synced_at":"2025-11-29T09:12:05Z"}
  ]
}
```

## Response (conflict / needs review)

```json
{
  "results": [
    {"local_tx_id":"uuid-1234","status":"needs_attention","reason":"stock_insufficient","details":"ITEM-001 stock at server:0"}
  ]
}
```

## Server-side guarantees

* Idempotency: check `POS Sync Log` by `local_tx_id`, skip duplicates and return existing mapping.
* Atomic per local_tx: create Sales Invoice + Payment Entry in a transaction; rollback on error.
* Return explicit `status` for each item in batch.

# Local DB (IndexedDB / Dexie) — schema summary

Use Dexie for reliability.

* `items`: `id++`, `item_code`, `name`, `barcodes[]`, `active`, `updated_at`

  * index: `*barcodes`, `item_code`, `name`
* `prices`: `id++`, `item_code`, `branch_id`, `price`, `effective_from`, `effective_to`

  * index composite: `item_code+branch_id`
* `pricing_rules`: `rule_id`, `type`, `priority`, `conditions`, `action`, `valid_from`, `valid_to`

  * index: `rule_id`, `type`
* `customers`: `cust_id`, `name`, `is_member`, `phone`

  * index: `phone`
* `cart_holds`: `hold_id++`, `hold_code`, `payload`, `created_at`
* `sales_queue`: `local_tx_id`, `payload` (immutable), `status` (`pending`, `syncing`, `synced`, `failed`, `needs_attention`), `retries`, `last_error`, `created_at`

  * index: `status`
* `pos_logs`: `id++`, `type`, `detail`, `timestamp`, `meta`
* `auth_cache`: `device_id`, `api_key_encrypted`, `last_validated_at`
* `audit_records`: per-transaction full audit (price_breakdown, applied_rules, overrides, supervisor_approval)

# Device Registration Flow (onboarding)

1. Admin (ERPNext) creates `POS Device` doc with `device_id` and generated `api_key`. Or
2. Device requests registration: POST `/api/method/pos_integration.api.register_device` with `branch`, `device_name`, `registration_code` (generated by ERP).
3. ERP creates `POS Device`, returns `api_key` (store encrypted in device).
4. Device stores `api_key` in local secure storage (IndexedDB encrypted via Web Crypto) and marks `registered=true`.
5. Device binds to branch; admin can revoke via ERPNext.

# Sync Engine (client) — behavior

* Trigger: event-driven (after payment) + periodic (every 5–10s if online) + on regained connectivity.
* Batch policy: send up to `N=25` `pending` transactions per request (tuneable). Smaller batch = less rollback cost.
* Retry/backoff: exponential backoff with jitter: initial 2s, 8s, 30s, 2m, 10m. After 5 failures mark `failed` with visible UI alert.
* Idempotency: use `local_tx_id` UUID sent to server; client must not modify `payload` after setting status `pending`.
* Conflict handling: if server returns `needs_attention`:

  * Mark local record `needs_attention`
  * Surface in UI: `SUPERVISOR REQUIRED: X`
  * Optionally open a local "escalation" form to add note and send to admin.

# Pricing & Promo evaluation on client

* Evaluate all rules strictly using the `rule priority` stack (as designed earlier).
* Produce `price_breakdown` JSON for each line and cart-level.
* Attach `applied_rule_ids` to `sales_queue.payload` — server uses for audit but server must **not** alter price amounts silently. If server finds price mismatch because pricing rules stale, it returns `price_mismatch` and `needs_review`.

# Printing & Hardware (QZ Tray)

* POS prints via QZ Tray: device communicates to `localhost:port` to send ESC/POS commands.
* On payment completion:

  1. Save `local_tx` to `sales_queue`
  2. Call Print API with `payload` formatted into ESC/POS template (show price breakdown lines)
  3. Print must be non-blocking; if print fails, keep `print_status: failed` and surface button `Retry Print`
* Cash drawer command: send ESC/POS kick drawer sequence (e.g. `\x1B\x70\x00\x19\xFA` or as per printer)
* QZ Tray certificate: device admin must install QZ certificate once.

# Supervisor Approval Flow (override / void)

* Approval request includes: `action_type`, `target_tx` or `item`, `old_value`, `new_value`, `reason`.
* Supervisor authenticates via PIN or OTP. If online, verify against ERPNext; if offline, check local hashed PIN with expiry policy (allow offline small overrides only per agreed limit).
* Record `Cashier Authorization Log` both local and push to server when online.

# Return flow (final rules from agreement)

* Require `reference_invoice` (number on struk). POS fetches local cache or calls server to verify invoice details.
* Refund computes value using rule A (refund equals original paid amounts and original discounts).
* For missing invoice, create store-credit flow (requires supervisor approval).

# Error codes (client-server contract)

* `200` OK with result array
* `400` Bad request (malformed JSON)
* `401` Unauthorized (invalid device)
* `422` Unprocessable (validation failed)
* `207` Multi-status (batch has mixed results — but prefer 200 with results per tx)
* In-results `status` fields: `synced`, `failed`, `needs_attention`, `duplicate`.

# UI Indicators (must-have)

* Top bar: `ONLINE` / `OFFLINE` status with last sync time
* Pending queue indicator: count + oldest pending age
* Big red alert: `Supervisor required` with reason
* Hold list always visible, fast switch
* Print retry button visible on failed prints
* Supervisor PIN modal accessible and logs reason mandatory

# Acceptance Tests (must pass)

1. **Idempotency**: Send same `local_tx_id` 3x -> server creates only one Sales Invoice; returns mapping every time.
2. **Offline robustness**: Create 500 transactions offline, restart browser, recover and successfully sync all without data loss.
3. **Price determinism**: Given same master snapshot & pricing rules, two devices compute identical final totals for same cart.
4. **Return with reference**: Return linked to invoice within 7 days does full refund and adjusts stock.
5. **Override limits offline**: Override up to 10% allowed with reason, logged, and surfaced to supervisor after online.
6. **Split payment**: Cash + QRIS partial payments accepted, totals reconcile, server stores payment breakdown.
7. **Print & drawer**: Print executes and drawer kicks reliably via QZ Tray; failed prints logged.
8. **Supervisor approval flow**: Overrides require supervisor (online for > limit). Audit shows who/when.

# Dev & QA Checklist (step-by-step)

## Pre-development

* [ ] Provision ERPNext instance (staging + prod)
* [ ] Create `POS Device` doctype in ERPNext
* [ ] Create `POS Sync Log` & `POS Cart` doctypes
* [ ] Define API endpoints in Frappe app `pos_integration`
* [ ] Prepare QZ Tray install docs & certificate for all devices

## Development

* [ ] Implement Dexie schema & migrations
* [ ] Implement initial sync job & incremental sync by `updated_at`
* [ ] Implement pricing engine module + unit tests
* [ ] Build core POS UI (scan, cart, hold, override modal)
* [ ] Implement sales_queue + sync engine + retry/backoff
* [ ] Implement Print integration (QZ Tray)
* [ ] Implement supervisor approval flow & local PIN logic
* [ ] Implement device registration UI & flow
* [ ] Implement admin dashboard in ERPNext for `POS Sync Log`, `POS Device` management

## QA

* [ ] Run acceptance tests above
* [ ] Load test scan-to-add under 100ms with 2500 SKU dataset (10% active)
* [ ] Chaos tests: intermittent network, browser crash, power loss
* [ ] Security audit: API key storage, TLS, PIN storage, auth expiry
* [ ] Manual UAT with real cashier for 3 shifts

## Deployment

* [ ] Prepare device image (Chrome + QZ Tray + PWA shortcut + device register script)
* [ ] Document installation & troubleshooting steps for store technician
* [ ] Rollout to 1 pilot store, 1 machine first
* [ ] Observe 7 days; iterate fixes; then multi-machine

# Monitoring & Alerts (operational)

* Alerts:

  * pending queue > 200 for any device → email/Slack admin
  * `needs_attention` entries appear → immediate review
  * high override rate (> X% tx) per cashier → flag
* Logs:

  * Push daily `POS Sync Log` summary to central logging (or ERPNext report)
  * Keep last 90 days of local sales_queue + audit in server

# Security & Data Integrity rules (mandatory)

* All communication over HTTPS
* `api_key` stored encrypted at client (Web Crypto)
* Supervisor PIN hashed + salted; prefer server validation for critical actions
* Local DB must be resistant to casual tampering (but assume physical device can be compromised — hence device-binding + rotate API keys)
* Provide device revoke flow in ERPNext

# Deployment script & device prep (practical)

* Prepare device image that:

  * Has Chrome (auto-launch in kiosk mode)
  * Installs QZ Tray & certificate
  * Creates PWA shortcut pinned to taskbar
  * Runs a lightweight watchdog that ensures QZ Tray and Chrome run on startup
  * A `register_device.sh` script to call `pos_integration.api.register_device` and store `api_key` securely

# Operational playbook (when things go wrong)

* If device offline & queue grows > 200: escalate to IT and move cashier to backup device
* If `needs_attention`: supervisor views ERPNext `POS Sync Log` → decide: approve, adjust stock, or cancel with reason
* If print fails persistently: fall back to PDF receipt saved and print from another machine; admin reprint later

---

## Final words — hal yang harus kamu commit sekarang

1. **Jangan improvisasi** pada sync/idempotency & pricing engine.
2. **Implementasikan device binding** (you chose A) — revoke must be easy.
3. **Start pilot** with 1 store 2 machines for 7 days before rolling to all 6 machines. (Yes, kamu set multi-branch earlier — pilot mitigates risk.)

---

Kalau kamu mau, aku bisa sekarang:

* **Generate lengkap: `pos_integration` Frappe app skeleton** (Doctypes JSON + `api.py` sync endpoint + hooks).
* **Atau**: buat **Dexie schema + pricing engine JS module** + sample unit tests.

Pilih: **Frappe app skeleton** atau **Client (Dexie + Pricing)** — aku deliver langsung kode & payload contoh.
