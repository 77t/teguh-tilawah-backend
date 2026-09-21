// api/image.js  (Vercel Serverless Function)
//
// Proxy + kompresi otomatis untuk foto produk. Dipanggil langsung dari tag
// <img> di quran-app.html, contoh:
//   <img src="/api/image?url=https://cf.shopee.co.id/file/xxxx" loading="lazy">
//
// Alurnya:
//   1. Ambil gambar asli dari URL sumber (mis. hasil scraping Apify).
//   2. Ubah jadi .webp, dipaskan ke maksimal 300x300 piksel.
//   3. Kirim ke browser dengan header cache supaya tidak diproses ulang
//      setiap kali gambar yang sama diminta lagi (hemat kuota & waktu).
//
// Kenapa target di bawah 20KB: dicapai lewat kombinasi resolusi kecil
// (300x300) + kualitas WebP yang diseimbangkan (quality 72) -- untuk foto
// produk pada umumnya ini biasanya sudah cukup untuk masuk di bawah 20KB,
// tapi ukuran akhir tetap bergantung kerumitan gambar aslinya; fungsi ini
// TIDAK memaksa ukuran file secara mutlak, hanya menjaga resolusi & kualitas
// tetap kecil secara konsisten.
//
// Dependency: paket "sharp" (lihat package.json) -- library pengolah gambar
// performa tinggi yang umum dipakai di Vercel Functions.

const sharp = require('sharp');

// Cache di memori proses (best-effort saja -- serverless bisa "dingin" dan
// mulai dari nol lagi, tapi lumayan membantu untuk permintaan yang beruntun
// dalam sesi/region yang sama).
const memCache = new Map();
const MAX_CACHE_ITEMS = 200;

module.exports = async (req, res) => {
  const srcUrl = (req.query.url || '').toString();
  if (!srcUrl || !/^https?:\/\//i.test(srcUrl)) {
    res.status(400).json({ error: 'Parameter url (link gambar asli) wajib diisi dan harus http/https.' });
    return;
  }

  try {
    if (memCache.has(srcUrl)) {
      const cached = memCache.get(srcUrl);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // 7 hari
      res.status(200).send(cached);
      return;
    }

    const imgRes = await fetch(srcUrl);
    if (!imgRes.ok) throw new Error(`Gagal mengambil gambar sumber (${imgRes.status})`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const webp = await sharp(buffer)
      .resize(300, 300, { fit: 'cover', position: 'attention' })
      .webp({ quality: 72 })
      .toBuffer();

    if (memCache.size >= MAX_CACHE_ITEMS) {
      memCache.delete(memCache.keys().next().value); // buang entri paling lama
    }
    memCache.set(srcUrl, webp);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.status(200).send(webp);
  } catch (err) {
    console.error('api/image error:', err);
    // Kalau gagal diproses, alihkan browser langsung ke gambar asli supaya
    // kartu produk tidak tampil rusak/kosong -- kompresi memang gagal untuk
    // kasus ini, tapi foto tetap tampil.
    res.redirect(302, srcUrl);
  }
};
