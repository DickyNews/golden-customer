# Dicky News TikTok Analytics Worker

Serverless endpoint terpisah dari Golden API/VPS. Worker ini membaca metadata publik TikTok dan tidak mengakses Golden Engine, database pelanggan, wallet, upload, job queue, atau VPS.

## Endpoint
- `GET /health`
- `GET /public/tiktok-analytics?url=https%3A%2F%2Fwww.tiktok.com%2F%40account%2Fvideo%2F123`

Hanya URL TikTok yang diterima. Data teknis hanya dikembalikan bila benar-benar ditemukan pada metadata publik. Region, status review, dan visibility indeks tidak dapat disimpulkan secara andal dari halaman publik dan tidak akan direkayasa.

## Deploy otomatis dari GitHub
Workflow `.github/workflows/deploy-tiktok-analytics.yml` menggunakan GitHub Actions dan Cloudflare Workers. Tambahkan repository secrets:
- `CLOUDFLARE_API_TOKEN`: token dengan izin edit Workers Scripts.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.

Setelah workflow berhasil, lihat log deploy untuk URL `workers.dev`. Masukkan URL itu sebagai GitHub repository variable `TIKTOK_ANALYTICS_API_BASE`, tanpa trailing slash. Workflow memperbarui `analytics-config.js` otomatis jika URL berhasil dikenali dan token GitHub Actions memiliki izin contents:write.

## Batasan penting
GitHub Pages adalah hosting statis, bukan runtime HTTP. GitHub Actions bukan API publik yang selalu aktif. Worker memerlukan Cloudflare account/secrets dan TikTok dapat membatasi akses otomatis. Worker ini tidak mengunduh ulang atau memodifikasi video dan tidak mengklaim bisa melihat review internal, distribusi, atau status indeks TikTok.
