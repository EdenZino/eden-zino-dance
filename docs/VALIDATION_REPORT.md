# Validation Report — Release 1.1.0

Validation date: 2026-07-16

## Automated checks completed

- React production build completed successfully.
- Cloudflare Worker TypeScript typecheck completed successfully.
- All three PostgreSQL migrations loaded into an embedded PostgreSQL-compatible engine.
- Atomic workshop reservation and deposit calculation passed.
- Deposit confirmation passed.
- Balance-payment confirmation passed.
- Capacity overbooking prevention passed.
- Pass purchase and entitlement-code issuance passed.
- Duplicate payment notification remained idempotent.
- PayMe `generate-sale` adapter was executed with a mocked network response; URL, amount, merchant transaction ID, return URL and callback URL were checked.
- Cloudflare Wrangler dry-run bundle completed successfully with static assets and R2 binding.
- `npm audit --omit=dev` reported zero known vulnerabilities at validation time.

## PayMe behavior validated in source and build

- Payment provider can be selected with `PAYMENT_PROVIDER=payme`.
- PayMe credentials remain server-side Cloudflare secrets.
- `sale_price` is sent in agorot from the database amount.
- The internal payment UUID is sent as `transaction_id`.
- `payme_sale_id` is saved as the provider session identifier.
- Callback requests require a dedicated callback token.
- A completed callback is passed to the same atomic and idempotent payment-confirmation function used by other providers.
- Callback amount mismatch is rejected by the database confirmation function.
- Failed or cancelled callbacks do not confirm a registration.

## Mobile and accessibility implementation checks

- RTL viewport includes `viewport-fit=cover`.
- Public and admin navigation expose expanded state and controlled navigation IDs.
- Skip-to-content link is present.
- Main content has a stable focus target.
- Primary touch controls use mobile-sized hit areas.
- Mobile registration modal uses the full dynamic viewport height.
- Inputs use mobile-friendly font sizing, autocomplete and input modes.
- Reduced-motion and increased-contrast media queries are present.
- Workshop registration remains reachable through a fixed mobile action bar.

## Validated database footprint

- 32 public tables loaded by the migration suite.
- Core transactional functions exercised:
  - `reserve_registration`
  - `confirm_checkout_payment`
  - `expire_registration_holds`
  - `apply_data_retention`

## Scope limitations

The validation does not certify production readiness by itself. The following require external accounts or human approval:

- Real PayMe Sandbox and production transactions using the merchant's credentials.
- Refund API activation and mapping for the merchant's PayMe account.
- Real invoice/receipt provider integration mapping.
- Real WhatsApp provider integration mapping.
- Domain-authenticated email delivery and reputation testing.
- Legal approval of terms, privacy, cancellation and accessibility text.
- Manual WCAG audit with VoiceOver/NVDA, keyboard-only navigation and final images.
- Production load test, penetration test, backup restore drill and incident-response drill.

Run before every deployment:

```bash
npm ci
npm run validate
npx wrangler deploy --dry-run
```
