# Yanz Shop — Toko Akun FF ID Cantik (Cloudflare Pages + D1)

Fitur: login/daftar, katalog 5 tingkat (Mythic, Legendary, Epic, Rare, Unik), pencarian ID,
popup konfirmasi beli → popup sukses (download file akun + tutorial video + close), riwayat pembelian,
deposit + voucher diskon, profil, notifikasi broadcast, kontak admin (t.me/yanzstoru), dan panel admin
(stok, saldo user, deposit, voucher, broadcast, pesanan, pengaturan).

## Struktur
```
public/            -> frontend (index.html, style.css, app.js)
public/media/      -> TARUH intro.mp4 dan tutorial.mp4 DI SINI
functions/api/     -> backend (Cloudflare Pages Functions)
schema.sql         -> tabel database D1
wrangler.toml      -> konfigurasi
```

## Cara deploy
Butuh Node.js dan akun Cloudflare (gratis).

```bash
npm i -g wrangler
wrangler login

# 1) Buat database, lalu salin database_id ke wrangler.toml
wrangler d1 create yanz-shop-db

# 2) Buat tabel
wrangler d1 execute yanz-shop-db --remote --file=schema.sql

# 3) Taruh video: public/media/intro.mp4 dan public/media/tutorial.mp4 (maks 25 MB per file)

# 4) Ganti ADMIN_USERNAME di wrangler.toml (username yang akan jadi admin)

# 5) Deploy
wrangler pages deploy
```
Setelah deploy, buka web lalu **daftar memakai username ADMIN_USERNAME** — akun itu otomatis
menjadi admin (hanya jika belum ada admin). Menu "Admin" akan muncul di navigasi.

## Tes lokal
```bash
wrangler d1 execute yanz-shop-db --local --file=schema.sql
wrangler pages dev
```

## Cara kerja alur beli
1. User isi saldo di menu Deposit (kirim permintaan) → admin setujui di Admin → Deposit
   (atau admin langsung tambah saldo di Admin → User & Saldo).
2. User klik Beli → popup "Apakah Anda yakin?" (bisa isi kode voucher) → saldo dipotong →
   popup sukses dengan tombol Download File Akun & Tutorial Login FF.
3. Semua pembelian tersimpan di menu Riwayat.

## Catatan
- File akun disimpan di database D1 (base64), batas ±1 MB per file. Untuk file lebih besar, pakai R2.
- Pembayaran memakai saldo + konfirmasi manual admin. Untuk pembayaran otomatis (QRIS dll.)
  perlu integrasi payment gateway (Tripay/Midtrans/dll.) dengan API key milikmu.
- Jual-beli akun game melanggar syarat layanan Garena; akun bisa dibekukan oleh pihak game.
