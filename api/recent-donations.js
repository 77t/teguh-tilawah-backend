// api/recent-donations.js  (Vercel Serverless Function)
//
// Dipanggil otomatis oleh tiker donasi di tab Belanja:
//   fetch('/api/recent-donations')
//
// Membaca file JSON donasi terbaru yang ditulis oleh api/saweria-webhook.js.
// Kalau webhook belum pernah menerima donasi (file belum ada), balas dengan
// daftar kosong -- front-end akan otomatis menampilkan pesan ajakan umum.
//
// Environment variables (sama seperti saweria-webhook.js):
//   GITHUB_TOKEN, GITHUB_REPO, GITHUB_FILE_PATH, GITHUB_BRANCH

const GITHUB_API = 'https://api.github.com';

module.exports = async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const path = process.env.GITHUB_FILE_PATH || 'data/donations.json';
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !repo) {
    // Belum diatur -- balas kosong saja, jangan error, supaya front-end
    // tetap tenang menampilkan pesan ajakan umum.
    res.status(200).json({ donations: [] });
    return;
  }

  try {
    const ghRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}?ref=${branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (ghRes.status === 404) {
      res.status(200).json({ donations: [] });
      return;
    }
    if (!ghRes.ok) throw new Error(`GitHub GET error ${ghRes.status}`);
    const json = await ghRes.json();
    const content = Buffer.from(json.content, 'base64').toString('utf-8');
    const data = JSON.parse(content || '[]');

    // Cache pendek di CDN Vercel supaya tidak menembak GitHub API di setiap
    // pemuatan halaman (donasi baru tetap muncul dalam hitungan menit).
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json({ donations: data });
  } catch (err) {
    console.error('api/recent-donations error:', err);
    res.status(200).json({ donations: [] }); // gagal diam-diam, jangan sampai tiker error di layar
  }
};
