// api/search.js  (Vercel Serverless Function)
//
// Dipanggil dari kolom pencarian universal di tab Belanja:
//   fetch('/api/search?q=oli+motor')
//
// Actor yang dipakai: xtracto/shopee-search ("Shopee Search & Category
// Scraper"). Skema input actor ini (dicek langsung dari tab "Input"-nya):
//   mode          -> wajib, salah satu dari: keyword | category | url
//   keyword       -> wajib kalau mode=keyword
//   country       -> opsional, default "id" (Indonesia, sudah pas)
//   maxProducts   -> opsional, jumlah maksimal hasil
//   sort          -> opsional, default "relevancy"
//
// Environment variables yang dibutuhkan di Vercel:
//   APIFY_TOKEN        -> token API Apify Anda
//   APIFY_ACTOR_ID      -> xtracto~shopee-search
//   SHOPEE_APP_ID       -> (opsional) lihat lib/shopeeAffiliate.js
//   SHOPEE_APP_SECRET   -> (opsional)
//
// HEMAT KUOTA (supaya tetap Rp0 selama mungkin):
//   1. maxProducts dibatasi kecil (8) -- actor ini ditagih per hasil, makin
//      sedikit diminta, makin murah tiap pencarian.
//   2. Cache di memori proses: kata kunci yang SAMA dalam 1 jam terakhir
//      tidak menembak Apify lagi, langsung pakai hasil yang disimpan.
//      (Cache ini "best effort" -- bisa kosong lagi kalau server sedang
//      "dingin"/baru mulai, itu normal untuk arsitektur serverless.)
//   3. Untuk kunci mutlak Rp0, atur juga batas pengeluaran bulanan di
//      Apify Console sendiri (Settings -> Limits) -- lihat README.

const { generateShortLink } = require('../lib/shopeeAffiliate');

const cache = new Map(); // key: keyword lowercase -> { items, at }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 jam
const MAX_CACHE_ITEMS = 100;

module.exports = async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) {
    res.status(400).json({ error: 'Parameter q (kata kunci) wajib diisi.' });
    return;
  }

  const cacheKey = q.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && !req.query.debug && (Date.now() - cached.at) < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    res.status(200).json({ items: cached.items });
    return;
  }

  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) {
    res.status(500).json({ error: 'APIFY_TOKEN / APIFY_ACTOR_ID belum diatur di environment variables Vercel.' });
    return;
  }

  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
    const apifyRes = await fetch(apifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'keyword',
        keyword: q,
        country: 'id',
        maxProducts: 8, // dijaga kecil demi hemat kuota -- naikkan kalau kuota longgar
      }),
    });

    if (!apifyRes.ok) {
      const text = await apifyRes.text().catch(() => '');
      throw new Error(`Apify error ${apifyRes.status}: ${text}`);
    }
    const rawItems = await apifyRes.json();

    // MODE DIAGNOSTIK: /api/search?q=peci&debug=1 -- lihat data mentah asli,
    // lewati cache, untuk mencocokkan nama field kalau hasil masih kosong.
    if (req.query.debug) {
      res.status(200).json({
        debug: true,
        totalRawItems: Array.isArray(rawItems) ? rawItems.length : 0,
        sample: Array.isArray(rawItems) ? rawItems.slice(0, 2) : rawItems,
      });
      return;
    }

    // Pemetaan field -- mencoba beberapa kemungkinan nama umum untuk actor
    // ini (berdasar deskripsi resminya: title, price, primary image, rating,
    // sold count). Kalau ternyata masih ada yang kosong, buka mode debug di
    // atas untuk lihat nama field persisnya lalu kabari saya.
    const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 8).map((it) => ({
      title: it.title || it.name || it.productName || 'Produk Shopee',
      image: it.image || it.primaryImage || it.imageUrl || it.thumbnail || (it.images && it.images[0]) || null,
      price: it.price || it.priceText || it.priceRange || null,
      originUrl: it.url || it.productUrl || it.link || it.itemUrl || null,
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
        // 300x300 dulu di server SEBELUM sampai ke HP pengunjung.
        image: it.image ? `/api/image?url=${encodeURIComponent(it.image)}` : null,
        price: it.price,
        link: it.originUrl,
        affiliateLink,
        affiliateReady,
      };
    }));

    if (cache.size >= MAX_CACHE_ITEMS) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, { items: results, at: Date.now() });

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json({ items: results });
  } catch (err) {
    console.error('api/search error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
