# Eden Zino Dance Platform — 1.2.0

Production-oriented, mobile-first workshop registration platform for Cloudflare Workers, React, Neon PostgreSQL and R2, with PayMe hosted-payment and refund orchestration.

The code-side P0 security and money-flow gaps are closed in 1.2.0. Production remains deliberately blocked until the merchant completes real PayMe payment/refund verification, Turnstile and email configuration, business details, and legal approval.

The full setup guide is in [README_HE.md](README_HE.md). See [P0 closure report](docs/P0_CLOSURE_REPORT_HE.md) and [validation report](docs/VALIDATION_REPORT.md).

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
