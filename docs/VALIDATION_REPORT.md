# Validation Report — Release 1.5.0

**Date:** 17 July 2026

## Result

`npm run validate` completed successfully:

```text
ALL VALIDATION TESTS PASSED
```

## Automated checks passed

- Web TypeScript compilation.
- React/Vite production build.
- Worker TypeScript compilation.
- Migrations `0001` through `0007` loaded successfully.
- 37 public PostgreSQL tables detected.
- Classic/Modern theme selection.
- Five Classic palette values and database constraint.
- Gallery item publishing query.
- Gallery asset deletion with database cascade.
- Atomic reservation and deposit calculation.
- Deposit confirmation and later balance confirmation.
- Last-seat overbooking protection.
- Pass purchase and entitlement issuance.
- Duplicate payment callback idempotency.
- Secure customer portal, password reset, MFA, provider-environment tracking and legal-approval schema.
- Notification configuration failures remain visible and are not marked as sent.
- Atomic cancellation and entitlement restoration.
- Split refund allocation and duplicate-allocation protection.
- Refund completion idempotency.
- Waitlist invitation capacity hold.
- Atomic transfer capacity and price protection.

## Gallery implementation checks

The release includes:

- Public `GET /api/public/gallery` returning only published items.
- Admin list, upload, update and delete endpoints.
- Cloudflare R2 storage for image and video files.
- JPEG, PNG, WebP, GIF, AVIF, MP4 and WebM validation.
- Separate size limits for images and videos.
- Database metadata for title, caption, accessible description, publication state and order.
- Permanent deletion from the database and R2.
- HTTP byte-range responses (`206 Partial Content`) for efficient video playback and seeking.
- Public gallery page, image lightbox and direct video controls.
- Admin gallery management UI.

R2 upload and deletion require the real Cloudflare binding and therefore must also be smoke-tested after deployment with a real image and a short MP4.

## Status-badge correction

All `.status-chip` and workshop `.status-badge` elements now use:

- `inline-flex`.
- Horizontal and vertical centering.
- Fixed minimum height.
- Explicit line height.
- Middle alignment in card headers.

Common administrator statuses are translated to Hebrew while preserving the original status value for CSS state styling.

## Cloudflare package validation

```text
npx wrangler deploy --config wrangler.toml --dry-run
```

passed and recognized:

- Static asset bundle.
- R2 media binding.
- Public rate limiter.
- Authentication rate limiter.
- PayMe environment variables.

## Dependency audit

```text
npm audit --omit=dev --audit-level=high
found 0 vulnerabilities
```

## External validation still required

- Upload one real image and one short MP4 after deployment.
- Verify video playback and seeking in Chrome Android and Safari iPhone.
- Confirm R2 deletion in the Cloudflare dashboard after deleting a gallery item.
- Verify final image alternative text and video captions with the actual media.
- A real PayMe Sandbox and production payment/refund cycle.
- Delivery tests through the real email domain.
- Legal review and OWNER approval of final documents.
- VoiceOver/NVDA, keyboard, contrast and zoom checks for both themes.
