# Validation Report — Release 1.2.0

**Date:** 17 July 2026

## Result

`npm run validate` completed successfully with:

```text
ALL VALIDATION TESTS PASSED
```

## Automated checks passed

- Web TypeScript compilation.
- React/Vite production build.
- Worker TypeScript compilation.
- Migrations `0001` through `0004` loaded successfully.
- 36 public PostgreSQL tables detected.
- Atomic reservation and deposit calculation.
- Deposit confirmation and later balance confirmation.
- Last-seat overbooking protection.
- Pass purchase and entitlement issuance.
- Duplicate payment callback idempotency.
- Secure customer portal, password-reset, MFA, provider-environment tracking and legal-approval schema.
- Notification configuration failures remain visible and are not marked as sent.
- Atomic cancellation and entitlement restoration.
- Split refund allocation and duplicate-allocation protection.
- Refund completion idempotency.
- Waitlist invitation capacity hold.
- Atomic transfer capacity and price protection.

## Cloudflare package validation

`npx wrangler deploy --dry-run` passed. The dry run recognized:

- Static asset bundle.
- R2 media binding.
- Public rate limiter: 120 requests per 60 seconds.
- Authentication rate limiter: 10 requests per 60 seconds.
- Scheduled triggers.

## Mobile-menu validation

The production CSS build includes fixed viewport-relative widths, disabled flex shrinking, full-width navigation items, internal vertical scrolling and a 100vw fallback below 380px for both public and admin drawers.

## Dependency-audit note

The final `npm audit --audit-level=high` request did not return a vulnerability report because the package-registry audit endpoint returned HTTP 502. This is an infrastructure failure, not a clean audit. Run the command again from a normal network before production deployment.

## External validation still required

Automated local validation cannot replace:

- A real PayMe merchant Sandbox payment.
- A real PayMe production payment.
- Full and partial refunds against the merchant's enabled refund API.
- Delivery tests through the real Resend domain.
- Invoice-provider document generation.
- Legal review and OWNER approval of final documents.
- Manual mobile, keyboard, VoiceOver/NVDA and contrast testing.
- Backup restore, load and penetration testing.
