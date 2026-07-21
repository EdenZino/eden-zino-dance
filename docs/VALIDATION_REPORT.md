# Validation Report — v1.6.0

Date: 2026-07-19

## Automated checks

- `npm ci` completed successfully.
- React/Vite production build passed.
- Frontend and Worker TypeScript checks passed.
- Migrations `0001` through `0008` loaded successfully in PGlite.
- Atomic reservation, deposits, balance payments and overbooking protection passed.
- Pass purchase and payment idempotency passed.
- P0 security schema, themes, five Classic palettes and gallery schema passed.
- v1.6 Hero editor defaults were verified.
- v1.6 WhatsApp queued jobs were verified as cancelled by migration.
- Atomic cancellation/refund/waitlist and transfer tests passed.
- Cloudflare Wrangler deploy dry-run passed with `WHATSAPP_ENABLED=false`.
- `npm audit --omit=dev` returned `found 0 vulnerabilities`.

## Changes validated by build/static behavior

- Registration and operational emails now use a responsive branded HTML shell with inline styles and escaped dynamic content.
- WhatsApp delivery is disabled unless `WHATSAPP_ENABLED=true` is explicitly configured.
- Workshop image upload uses a dedicated file picker, explicit supported MIME types, 12MB client guard, preview and same-file reselection support.
- Workshop card/detail facts use stronger weight and contrast.
- Hero headline is split into independently editable top/main fields with font and size presets.
- Hero background can use a managed gallery image or a dedicated upload.

## External checks still required

- Send a real Resend email to Gmail and iPhone Mail and inspect rendering.
- Upload a real workshop image through the deployed Cloudflare Worker/R2 binding.
- Verify the chosen managed gallery image is publicly visible after deployment.

These external checks require the user's production accounts and cannot be proven by local compilation alone.
