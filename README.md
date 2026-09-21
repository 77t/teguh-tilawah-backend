# Backend Vercel untuk Tab Belanja & Tiker Donasi

File-file di sini TERPISAH dari `quran-app.html` Anda — ini kode yang
berjalan di SERVER (Vercel), bukan di HP pengunjung. Alasannya: token/secret
seperti APIFY_TOKEN tidak boleh ada di file HTML yang didownload publik.

## Struktur folder

```
vercel-api/
  api/
    search.js              <- dipanggil dari kolom pencarian universal
    image.js                <- proxy kompresi foto produk jadi .webp 300x300
    saweria-webhook.js      <- menerima notifikasi donasi dari Saweria
    recent-donations.js     <- dibaca oleh tiker donasi di web
  lib/
    shopeeAffiliate.js       <- helper konversi link ke link afiliasi Shopee
  package.json
  .env.example
```

## Langkah setup

1. **Buat repo GitHub baru** (atau pakai repo yang sudah ada), lalu upload
   seluruh isi folder `vercel-api/` ini ke root repo tersebut.
2. **Hubungkan repo itu ke Vercel** (vercel.com -> New Project -> Import dari
   GitHub Anda). Vercel otomatis mengenali folder `api/` sebagai serverless
   functions, tidak perlu konfigurasi tambahan.
3. **Isi Environment Variables** di Vercel: Project -> Settings ->
   Environment Variables. Lihat `.env.example` untuk daftar lengkap nama
   variabelnya beserta penjelasan masing-masing.
4. **Deploy**. Setelah selesai, Anda akan dapat URL seperti
   `https://nama-app-anda.vercel.app`.
5. **Sambungkan ke `quran-app.html`**: kolom pencarian di tab Belanja sudah
   otomatis memanggil `/api/search` -- asalkan `quran-app.html` Anda dibuka
   dari domain Vercel yang sama (atau di-deploy juga lewat Vercel, bukan
   Netlify terpisah). Kalau app utama Anda tetap di Netlify, ganti baris
   `fetch('/api/search?q=...')` di `quran-app.html` jadi URL penuh, misalnya
   `fetch('https://nama-app-anda.vercel.app/api/search?q=...')`.
6. **Aktifkan webhook Saweria** (untuk tiker donasi): dashboard Saweria ->
   Integrations -> Webhook -> isi dengan
   `https://nama-app-anda.vercel.app/api/saweria-webhook`.

## Tentang APIFY_ACTOR_ID

Anda perlu pilih/beli akses ke sebuah "actor" Apify yang men-scrape Shopee
Indonesia (cari di Apify Store, kata kunci "Shopee scraper"). Setelah
dipilih, salin ID actor-nya (format `namaUser~namaActor`, terlihat di URL
halaman actor tsb) ke `APIFY_ACTOR_ID`. Setiap actor punya nama field input
yang mungkin berbeda -- sesuaikan bagian `body: JSON.stringify({ search: q })`
di `api/search.js` dengan skema input actor pilihan Anda (lihat tab "Input"
di halaman actor tersebut).

## Tentang SHOPEE_APP_ID / SHOPEE_APP_SECRET

Ini KREDENSIAL API RESMI dari Shopee Affiliate Open Platform -- beda dari
sekadar username "teguhusaha" biasa. Cek di dashboard Shopee Affiliates Anda
apakah ada bagian "API" / "Developer Access". Kalau tidak ada, kemungkinan
perlu pengajuan terpisah ke Shopee. Tanpa ini, `/api/search` tetap berfungsi
menampilkan hasil pencarian, hanya saja link produknya belum otomatis
menjadi link ber-komisi (field `affiliateReady` akan bernilai `false`).

## Tentang kompresi gambar otomatis (api/image.js)

`api/search.js` sekarang otomatis mengarahkan setiap foto produk lewat
`/api/image?url=...` sebelum dikirim ke browser. Route ini men-download foto
aslinya, mengubahnya jadi `.webp` maksimal 300x300 piksel di server (pakai
paket `sharp`, sudah didaftarkan di `package.json` -- Vercel otomatis
meng-install-nya saat deploy, tidak perlu langkah manual tambahan), lalu
mengirim hasilnya dengan cache 7 hari supaya foto yang sama tidak diproses
ulang berkali-kali. Kalau prosesnya gagal (mis. gambar sumber tak bisa
diakses), sistem otomatis mengalihkan ke foto aslinya apa adanya -- supaya
kartu produk tidak pernah tampil rusak/kosong.

Di sisi `quran-app.html`, tag `<img>` kartu produk sudah diberi
`loading="lazy"` -- browser hanya akan benar-benar meminta gambarnya saat
kartu itu mulai terlihat di layar pengunjung, bukan langsung semua sekaligus
saat halaman dibuka.

## Biaya

Baik Apify maupun Vercel punya paket gratis dengan batas pemakaian bulanan.
Karena kredensial disimpan aman di server (bukan di HTML publik), risiko
"disedot orang lain sampai jebol kuota" jauh berkurang -- tapi tetap pantau
penggunaan Anda di dashboard masing-masing secara berkala.
