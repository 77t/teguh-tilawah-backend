// api/enrich-products.js  (Vercel Serverless Function)
//
// SKRIP SEKALI-JALAN -- bukan dipanggil otomatis oleh app, Anda buka
// sendiri di browser saat mau memperbarui data 22 produk pilihan di
// halaman depan tab Belanja:
//
//   https://nama-project-anda.vercel.app/api/enrich-products
//
// Yang terjadi: untuk SETIAP link di daftar SHORT_LINKS di bawah, skrip ini
// memanggil actor Apify (mode=url) untuk mencoba mengambil judul, foto, dan
// harga ASLI dari link itu -- BUKAN data karangan. Hasilnya ditampilkan
// sebagai JSON yang bisa Anda salin, lalu kirim ke saya untuk ditanam ke
// LOCAL_PRODUCTS di quran-app.html menggantikan judul generik "Pilihan #1"
// dkk yang sekarang.
//
// CATATAN JUJUR: actor Apify Anda (xtracto/shopee-search) didesain utamanya
// untuk mode=keyword/category. Mode=url dijelaskan sebagai "Any Shopee
// search/category URL" -- ada kemungkinan link PRODUK spesifik (bukan
// halaman pencarian/kategori) tidak didukung penuh. Karena itu, tiap link
// diproses TERPISAH dengan try/catch sendiri: kalau satu link gagal, yang
// lain tetap lanjut diproses, dan hasilnya akan menunjukkan jelas link mana
// yang berhasil/gagal berikut alasannya -- bukan gagal total diam-diam.
//
// Route ini SENGAJA tidak dipakai otomatis oleh tab Belanja (beda dari
// api/search.js) supaya tidak memakan kuota Apify setiap ada pengunjung --
// hanya berjalan saat ANDA sendiri yang membuka alamatnya.

const SHORT_LINKS = {
  shalat: [
    'https://s.shopee.co.id/AUuEIy6ZNK',
    'https://s.shopee.co.id/AKao6f7CiJ',
    'https://s.shopee.co.id/9V1h78ANPA',
    'https://s.shopee.co.id/9KiGupB0k9',
    'https://s.shopee.co.id/9peXVk96jG',
  ],
  quran: [
    'https://s.shopee.co.id/6AlF98jL6B',
    'https://s.shopee.co.id/5foyYDlF76',
    'https://s.shopee.co.id/5q8OkWkbm9',
    'https://s.shopee.co.id/5LC89bmVn4',
    'https://s.shopee.co.id/5VVYLulsS7',
  ],
  koko: [
    'https://s.shopee.co.id/5VVYM6GMAa',
    'https://s.shopee.co.id/5LC89nGzVZ',
    'https://s.shopee.co.id/5q8OkiF5Ug',
    'https://s.shopee.co.id/5foyYPFipf',
    'https://s.shopee.co.id/6AlF9KDoom',
    'https://s.shopee.co.id/2BF6O7lgV0',
  ],
  gamis: [
    'https://s.shopee.co.id/1VzPaEEGL3',
    'https://s.shopee.co.id/1gIpmXDd06',
    'https://s.shopee.co.id/1qcFyqCzf9',
    'https://s.shopee.co.id/20vgB9CMKC',
    'https://s.shopee.co.id/2BF6NSBizF',
    'https://s.shopee.co.id/5foyY1YHjPper',
  ],
};

function formatRupiah(n) {
  if (n === null || n === undefined || isNaN(n)) return null;
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

async function fetchOneProduct(link, token, actorId) {
  const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
  const apifyRes = await fetch(apifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'url', url: link, country: 'id', maxProducts: 1 }),
  });
  if (!apifyRes.ok) {
    const text = await apifyRes.text().catch(() => '');
    throw new Error(`Apify HTTP ${apifyRes.status}: ${text.slice(0, 200)}`);
  }
  const raw = await apifyRes.json();
  const first = Array.isArray(raw) ? raw[0] : null;
  if (!first) throw new Error('Actor tidak mengembalikan data apa pun untuk link ini.');
  return {
    title: first.name || first.title || 'Produk Shopee',
    price: formatRupiah(first.price),
    img: first.image_url || first.image || null,
    link, // tetap pakai short link afiliasi ASLI Anda, bukan link hasil actor
  };
}

// Perpanjang batas waktu fungsi ini ke 60 detik (maksimal yang diizinkan
// paket gratis Vercel) -- jaga-jaga meski sudah diproses paralel, supaya
// tidak terpotong di tengah jalan kalau Apify sedang lambat merespons.
module.exports = async (req, res) => {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) {
    res.status(500).json({ error: 'APIFY_TOKEN / APIFY_ACTOR_ID belum diatur di environment variables Vercel.' });
    return;
  }

  const result = {};
  const errors = [];

  // Diproses PARALEL (bukan satu-satu berurutan) supaya total waktu tak
  // melebihi batas 60 detik yang sudah diperpanjang di bawah -- 22 link
  // sekaligus jauh lebih cepat daripada menunggu satu-satu selesai dulu.
  await Promise.all(
    Object.keys(SHORT_LINKS).map(async (category) => {
      const settled = await Promise.allSettled(
        SHORT_LINKS[category].map((link) => fetchOneProduct(link, token, actorId))
      );
      result[category] = settled.map((r, i) => {
        const link = SHORT_LINKS[category][i];
        if (r.status === 'fulfilled') return r.value;
        errors.push({ category, link, error: String(r.reason && r.reason.message || r.reason) });
        return { title: null, price: null, img: null, link, failed: true };
      });
    })
  );

  res.status(200).json({
    note: 'Salin bagian "result" di bawah, kirim ke Claude untuk ditanam ke LOCAL_PRODUCTS di quran-app.html. Cek juga "errors" untuk link yang gagal diambil datanya.',
    result,
    errors,
  });
};

// Batas waktu 60 detik (maksimal paket gratis Vercel) -- dipasang SETELAH
// fungsinya didefinisikan supaya tidak tertimpa/hilang.
module.exports.config = { maxDuration: 60 };
