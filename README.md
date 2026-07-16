# Eden Zino Dance Platform

Production-oriented, mobile-first workshop registration platform for Cloudflare Workers, React, Neon PostgreSQL and R2, with PayMe hosted-payment integration.

The full setup guide is in [README_HE.md](README_HE.md).

## Commands

```bash
npm install
npm run migrate
npm run dev
npm run build
npm run deploy
```

The project starts in `PAYMENT_PROVIDER=mock`. Real payments require an activated PayMe merchant account, seller and client API keys, a production API endpoint, end-to-end testing and approved legal texts. See `docs/PAYME_SETUP_HE.md`.
