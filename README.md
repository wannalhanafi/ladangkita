# LadangKita

Pineapple plantation operations app (installable web app). Hosted on Cloudflare Pages; data in Supabase project `ladangkita` (ref `qrxmeuutobncpwgdvtgo`).

- Plain HTML/CSS/JS, no build step. Cloudflare Pages settings: framework preset **None**, build command empty, output directory `public`.
- `public/config.js` holds the public Supabase URL and publishable key (safe: row security protects the data). Never put the secret / service_role key here.
- `supabase/` holds the database migrations, applied in order.
- Sign-in: email + 8-digit code (Supabase email OTP; length set in config.js codeLength). The Supabase email templates "Magic Link" and "Confirm signup" must contain `{{ .Token }}`.
