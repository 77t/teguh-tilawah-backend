// lib/shopeeAffiliate.js
//
// Pembungkus kecil untuk Shopee Affiliate Open API (GraphQL, ditandatangani
// dengan HMAC-SHA256). Ini API RESMI Shopee untuk affiliate — beda dari
// sekadar username "teguhusaha" yang Anda pakai di dashboard biasa.
//
// SEBELUM DIPAKAI, Anda WAJIB punya App ID + App Secret dari Shopee
// Affiliate Open Platform (biasanya di bagian "API" / "Developer" pada
// dashboard Shopee Affiliates Anda, atau lewat pengajuan terpisah kalau
// belum tersedia di akun Anda). Tanpa dua nilai ini, fungsi generateShortLink
// di bawah tidak bisa dipakai — TAPI /api/search.js tetap akan jalan
// menampilkan produk hasil pencarian, hanya saja link-nya belum otomatis
// jadi link afiliasi (lihat catatan fallback di search.js).
//
// Environment variables yang dibutuhkan (isi di Vercel -> Project Settings
// -> Environment Variables):
//   SHOPEE_APP_ID      -> App ID dari Shopee Affiliate Open Platform
//   SHOPEE_APP_SECRET  -> App Secret (RAHASIA, jangan pernah taruh di kode)

const crypto = require('crypto');

const SHOPEE_GRAPHQL_ENDPOINT = 'https://open-api.affiliate.shopee.co.id/graphql';

function buildSignature(appId, timestamp, payload, secret) {
  // Pola umum Shopee Open API: SHA256(appId + timestamp + payload + secret)
  const base = `${appId}${timestamp}${payload}${secret}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

async function callShopeeGraphQL(query, variables) {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) {
    throw new Error('SHOPEE_APP_ID / SHOPEE_APP_SECRET belum diisi di environment variables Vercel.');
  }

  const payload = JSON.stringify({ query, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature(appId, timestamp, payload, secret);

  const res = await fetch(SHOPEE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Shopee Open API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error('Shopee Open API GraphQL error: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

// Ubah URL produk Shopee biasa menjadi short link afiliasi ber-komisi.
// originUrl: link produk asli (mis. hasil dari Apify scraper)
// subIds: opsional, sampai 5 label pelacakan (mis. ['tilawah-app'])
async function generateShortLink(originUrl, subIds) {
  const query = `
    mutation generateShortLink($input: ShortLinkInput!) {
      generateShortLink(input: $input) {
        shortLink
      }
    }
  `;
  const variables = {
    input: {
      originUrl,
      subIds: subIds || [],
    },
  };
  const data = await callShopeeGraphQL(query, variables);
  return data && data.generateShortLink && data.generateShortLink.shortLink;
}

module.exports = { generateShortLink };
