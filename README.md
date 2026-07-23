# Eden Zino Platform — 1.7.0

Production-oriented, mobile-first workshop registration platform for Cloudflare Workers, React, Neon PostgreSQL and R2, with PayMe hosted-payment and refund orchestration.

The code-side P0 security and money-flow gaps are closed. Release 1.7.0 adds Hebrew/English public-site switching, language-aware RTL/LTR branded email, Eden Zino SEO/favicon branding, bilingual dynamic content fields, and repository cleanup. Production remains deliberately blocked until the merchant completes real PayMe payment/refund verification, Turnstile and email configuration, business details, and legal approval.

The full setup guide is in [README_HE.md](README_HE.md). See [P0 closure report](docs/archive/P0_CLOSURE_REPORT_HE.md) and [v1.7 validation report](docs/VALIDATION_REPORT_1_7_HE.md).

## Commands

```bash
npm ci
npm run migrate
npm run dev
npm run validate
npx wrangler deploy --dry-run
npm run deploy
```

The repository starts with `PAYMENT_PROVIDER=mock`. Never commit real secrets or database credentials.

## Public themes

The public site supports `Classic` and `Modern` themes selectable under **Admin → Settings**. Theme changes are stored in the database and do not require a new deployment. See `docs/archive/DUAL_THEME_AND_MOBILE_MENU_HE.md`.


## Classic color palettes

The Classic public theme includes five admin-selectable palettes: Rosin, Plum, Ocean, Sage, and Midnight. Run migration `0006_classic_color_palettes.sql` and see `docs/archive/CLASSIC_COLOR_PALETTES_HE.md`.


## Managed gallery

Admin users can upload, publish, reorder, edit and permanently delete images and MP4/WebM videos stored in R2. The public site includes a gallery page, direct playback, image lightbox and byte-range media delivery. Run migration `0007_gallery_library.sql`; see `docs/archive/GALLERY_MANAGEMENT_HE.md`.
