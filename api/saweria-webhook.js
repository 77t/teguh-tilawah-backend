// api/saweria-webhook.js  (Vercel Serverless Function)
//
// CARA MENGAKTIFKAN:
//   1. Buka dashboard Saweria Anda -> Integrations -> Webhook.
//   2. Isi URL webhook dengan: https://NAMA-APP-ANDA.vercel.app/api/saweria-webhook
//   3. Simpan. Setiap ada donasi baru, Saweria akan mengirim data ke sini.
//
// Fungsi ini menyimpan 10 donasi terbaru ke sebuah file JSON di repo GitHub
// Anda (dipakai sebagai "database" ringan -- cocok untuk volume donasi
// personal, bukan untuk trafik sangat tinggi). File itu lalu dibaca oleh
// /api/recent-donations.js untuk ditampilkan sebagai tiker di web.
//
// Environment variables yang dibutuhkan di Vercel:
//   GITHUB_TOKEN       -> Personal Access Token GitHub (scope: repo)
//   GITHUB_REPO        -> format "namaUser/namaRepo"
//   GITHUB_FILE_PATH   -> mis. "data/donations.json"
//   GITHUB_BRANCH      -> opsional, default "main"

const GITHUB_API = 'https://api.github.com';

async function getFile(repo, path, branch, token) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}?ref=${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return { sha: null, data: [] };
  if (!res.ok) throw new Error(`GitHub GET error ${res.status}`);
  const json = await res.json();
  const content = Buffer.from(json.content, 'base64').toString('utf-8');
  let data = [];
  try { data = JSON.parse(content); } catch (e) { data = []; }
  return { sha: json.sha, data };
}

async function putFile(repo, path, branch, token, sha, data, message) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message, content, sha: sha || undefined, branch }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub PUT error ${res.status}: ${text}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Hanya menerima POST (dari webhook Saweria).' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const path = process.env.GITHUB_FILE_PATH || 'data/donations.json';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token || !repo) {
    res.status(500).json({ error: 'GITHUB_TOKEN / GITHUB_REPO belum diatur di environment variables Vercel.' });
    return;
  }

  try {
    const body = req.body || {};
    // Bentuk payload webhook Saweria: donator_name, amount_raw (atau
    // amount_to_display di dalam etc), message. Lihat dokumentasi Saweria
    // Integrations -> Webhook untuk bentuk persis yang mereka kirim.
    const newDonation = {
      name: body.donator_name || 'Seorang donatur',
      amount: body.amount_raw || (body.etc && body.etc.amount_to_display) || 0,
      message: body.message || '',
      at: new Date().toISOString(),
    };

    const { sha, data } = await getFile(repo, path, branch, token);
    const updated = [newDonation, ...data].slice(0, 10); // simpan 10 terbaru saja
    await putFile(repo, path, branch, token, sha, updated, 'Update donasi terbaru dari Saweria webhook');

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('api/saweria-webhook error:', err);
    res.status(500).json({ error: String(err.message || err) });
  }
};
