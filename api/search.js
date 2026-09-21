// api/search.js  (Vercel Serverless Function)
//
// Dipanggil dari kolom pencarian universal di tab Belanja:
//   fetch('/api/search?q=oli+motor')
//
// Alurnya:
//   1. Baca APIFY_TOKEN dari environment variable (aman, tak pernah
//      dikirim ke browser pengunjung).
//   2. Panggil actor Apify yang men-scrape Shopee Indonesia dengan kata
//      kunci dari pengguna.
//   3. Untuk tiap produk hasilnya, coba ubah link aslinya jadi link
//      afiliasi lewat Shopee Affiliate Open API (generateShortLink).
//   4. Kirim balik daftar produk siap tampil ke browser.
//
// Environment variables yang dibutuhkan di Vercel:
//   APIFY_TOKEN        -> token API Apify Anda
//   APIFY_ACTOR_ID      -> ID actor Apify Shopee yang Anda pakai
//                          (format "namaUser~namaActor", cek di halaman actor Apify Anda)
//   SHOPEE_APP_ID       -> (opsional tapi disarankan) lihat lib/shopeeAffiliate.js
//   SHOPEE_APP_SECRET   -> (opsional tapi disarankan)
//
// CATATAN JUJUR: kalau SHOPEE_APP_ID/SECRET belum diisi (karena akun Anda
// belum punya akses Shopee Affiliate Open API), route ini TETAP mengembalikan
// produknya dengan link ASLI (belum ber-komisi) plus flag "affiliateReady:false"
// -- supaya pencarian tetap berguna sambil Anda mengurus akses API itu.

const { generateShortLink } = require('../lib/shopeeAffiliate');

module.exports = async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) {
    res.status(400).json({ error: 'Parameter q (kata kunci) wajib diisi.' });
    return;
  }

  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) {
    res.status(500).json({ error: 'APIFY_TOKEN / APIFY_ACTOR_ID belum diatur di environment variables Vercel.' });
    return;
  }

  try {
    // Jalankan actor secara sinkron dan langsung ambil hasilnya.
    // Sesuaikan nama field input (mis. "search", "keyword") dengan actor
    // Apify Shopee yang Anda pilih -- tiap actor bisa beda skema inputnya,
    // cek tab "Input" di halaman actor tsb di Apify Console.
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
    const apifyRes = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: q, maxItems: 12 }),
    });

    if (!apifyRes.ok) {
      const text = await apifyRes.text().catch(() => '');
      throw new Error(`Apify error ${apifyRes.status}: ${text}`);
    }
    const rawItems = await apifyRes.json();

    // Petakan field mentah dari Apify ke bentuk yang seragam. Nama field di
    // sini (title/image/price/url) adalah TEBAKAN UMUM -- sesuaikan dengan
    // field asli yang dikembalikan actor Apify Shopee pilihan Anda (lihat
    // contoh hasil di tab "Dataset" actor tsb di Apify Console).
    const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 12).map((it) => ({
      title: it.title || it.name || 'Produk Shopee',
      image: it.image || it.imageUrl || (it.images && it.images[0]) || null,
      price: it.price || it.priceText || null,
      originUrl: it.url || it.link || it.productUrl || null,
    })).filter((it) => it.originUrl);

    // Coba ubah tiap link jadi link afiliasi. Kalau App ID/Secret belum ada
    // atau salah satu gagal, tetap kirim link aslinya (jangan sampai error
    // satu produk menggagalkan seluruh pencarian).
    const results = await Promise.all(items.map(async (it) => {
      let affiliateLink = it.originUrl;
      let affiliateReady = false;
      try {
        const short = await generateShortLink(it.originUrl, ['tilawah-app']);
        if (short) { affiliateLink = short; affiliateReady = true; }
      } catch (e) {
        console.warn('generateShortLink gagal untuk', it.originUrl, e.message);
      }
      return {
        title: it.title,
        // Gambar dialihkan lewat /api/image supaya dikompresi jadi .webp
        // 300x300 dulu di server SEBELUM sampai ke HP pengunjung -- hemat
        // kuota mereka, dan <img loading="lazy"> di HTML baru memuatnya
        // saat kartu produk ini benar-benar terlihat di layar.
        image: it.image ? `/api/image?url=${encodeURIComponent(it.image)}` : null,
        price: it.price,
        link: it.originUrl,
        affiliateLink,
        affiliateReady,
      };
    }));

    res.status(200).json({ items: results });
  } catch (err) {
    console.error('api/search error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
