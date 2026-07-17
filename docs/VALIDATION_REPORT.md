# Validation Report — Release 1.4.0

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
- Migrations `0001` through `0006` loaded successfully.
- Classic/Modern theme default and database update.
- Five Classic palette values, default selection and database constraint.
- 36 public PostgreSQL tables detected.
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


## Classic palette validation

The following minimum contrast ratios were calculated for each palette against its primary reading background:

| Palette | Secondary text | Accent text | Spotlight on stage |
|---|---:|---:|---:|
| Rosin | 5.60:1 | 5.38:1 | 9.48:1 |
| Plum | 5.80:1 | 7.74:1 | 11.30:1 |
| Ocean | 5.31:1 | 6.12:1 | 9.31:1 |
| Sage | 5.12:1 | 6.39:1 | 7.41:1 |
| Midnight | 5.54:1 | 6.59:1 | 9.98:1 |

All listed text combinations exceed the WCAG AA 4.5:1 threshold for normal text. Image overlays still require manual review with final uploaded imagery.

## Cloudflare package validation

`npx wrangler deploy --config wrangler.toml --dry-run` passed. The dry run recognized:

- Static asset bundle.
- R2 media binding.
- Public rate limiter: 120 requests per 60 seconds.
- Authentication rate limiter: 10 requests per 60 seconds.
- PayMe configuration variables.

## Mobile drawer validation

The public drawer is rendered through a React Portal under `document.body`, outside the sticky/backdrop-filtered header.

A headless Chromium CSS/layout test at a `390×844` mobile viewport measured:

- Drawer: approximately `343×844px`.
- Position: `fixed`.
- Flex shrink: `0`.
- Six visible navigation links.
- Each link: approximately `311×49px`, above the 44px touch-height target.
- Internal vertical scrolling and full-height viewport behavior.

## Dependency audit

```text
npm audit --omit=dev --audit-level=high
found 0 vulnerabilities
```

## External validation still required

Automated local validation cannot replace:

- A real PayMe merchant Sandbox payment.
- A real PayMe production payment.
- Full and partial refunds against the merchant's enabled refund API.
- Delivery tests through the real email domain.
- Invoice-provider document generation.
- Legal review and OWNER approval of final documents.
- Manual testing on the exact iPhone/Android devices used by the business.
- VoiceOver/NVDA, keyboard, contrast and zoom checks for both themes.
- Backup restore, load and penetration testing.
