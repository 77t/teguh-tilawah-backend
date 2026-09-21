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
    'https://s.shopee.co.id/4qFmI1dq4Z',
    'https://s.shopee.co.id/1Lfu7m8RXv',
    'https://s.shopee.co.id/qjdWta8xD',
    'https://s.shopee.co.id/5fotHp3TBq',
    'https://s.shopee.co.id/2gBHiMDofT',
  ],
  quran: [
    'https://s.shopee.co.id/5VVT47PQiK',
    'https://s.shopee.co.id/20vavWwUfK',
    'https://s.shopee.co.id/4LJVhrMTyC',
    'https://s.shopee.co.id/50ZCV8J0Uy',
    'https://s.shopee.co.id/5q8JUiwYEn',
  ],
  koko: [
    'https://s.shopee.co.id/7Kx7HiBzpm',
    'https://s.shopee.co.id/80Co4yZ35M',
    'https://s.shopee.co.id/8plv4YhWIS',
    'https://s.shopee.co.id/6Al9tiTIje',
    'https://s.shopee.co.id/7Adh4vx3Mh',
    'https://s.shopee.co.id/1AWXnkQ8k',
  ],
  gamis: [
    'https://s.shopee.co.id/W6n8QXulg',
    'https://s.shopee.co.id/LnMwCiu4M',
    'https://s.shopee.co.id/1VzKKRC7Zl',
    'https://s.shopee.co.id/4LJVi1RW6P',
    'https://s.shopee.co.id/9V1brY7B3X',
    'https://s.shopee.co.id/9zxsSW8KB1',
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

module.exports = async (req, res) => {
  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;
  if (!token || !actorId) {
    res.status(500).json({ error: 'APIFY_TOKEN / APIFY_ACTOR_ID belum diatur di environment variables Vercel.' });
    return;
  }

  const result = {};
  const errors = [];

  for (const category of Object.keys(SHORT_LINKS)) {
    result[category] = [];
    for (const link of SHORT_LINKS[category]) {
      try {
        const product = await fetchOneProduct(link, token, actorId);
        result[category].push(product);
      } catch (err) {
        errors.push({ category, link, error: String(err.message || err) });
        // Tetap masukkan entri kosong dengan link asli supaya urutan/jumlah
        // produk di kategori itu tidak berubah -- Anda bisa isi manual nanti
        // khusus untuk yang gagal ini saja.
        result[category].push({ title: null, price: null, img: null, link, failed: true });
      }
    }
  }

  res.status(200).json({
    note: 'Salin bagian "result" di bawah, kirim ke Claude untuk ditanam ke LOCAL_PRODUCTS di quran-app.html. Cek juga "errors" untuk link yang gagal diambil datanya.',
    result,
    errors,
  });
};
