# Feature Matrix — Release 1.6.0

| Capability | Database/API | Public UI | Admin UI | Validation | Status |
|---|---:|---:|---:|---:|---|
| Multiple workshops and public codes | Yes | Yes | Yes | Yes | Complete |
| Responsive workshop filtering and levels | Yes | Yes | Yes | Build | Complete |
| Public/admin mobile drawers | — | Yes | Yes | Build/CSS audit | Complete in 1.2.0 |
| Atomic capacity reservation | Yes | Yes | Yes | Yes | Complete |
| Hosted PayMe sale and callback | Yes | Yes | Status | Mocked provider + DB | Code complete; merchant test required |
| Full/partial PayMe refund orchestration | Yes | Status | Yes | DB/provider mock | Code complete; merchant endpoint test required |
| Refund retry/idempotency/double-refund protection | Yes | — | Yes | Yes | Complete |
| Cancellation + entitlement restoration + waitlist | Yes | Request | Yes | Yes | Complete |
| Atomic workshop transfer | Yes | — | Yes | Yes | Complete; equal-price policy |
| Secure customer portal | Yes | Magic link | — | Schema/typecheck | Complete |
| Registration/order status token protection | Yes | Yes | — | Typecheck | Complete |
| Admin lockout and password reset | Yes | — | Yes | Schema/typecheck | Complete |
| Admin email OTP | Yes | — | Yes | Schema/typecheck | Complete; email provider required |
| Cloudflare Turnstile server validation | Yes | Yes | Yes | Typecheck | Complete; keys required |
| Cloudflare rate-limit bindings | Yes | — | — | Wrangler dry-run | Complete |
| Truthful notification delivery states | Yes | — | Operations | Yes | Complete |
| Legal draft/version/OWNER approval | Yes | Active docs | Yes | Schema/typecheck | Complete technically |
| Production readiness gate | Yes | — | Yes | Typecheck | Complete |
| Coupons and Early Bird | Yes | Yes | Create | DB tests | Usable; richer lifecycle UI is P1 |
| Waitlist invitation expiry/capacity hold | Yes | Yes | Yes | Yes | Complete |
| Passes and memberships | Yes | Yes | Create | Yes | Usable; recurring charge is external/P1 |
| Attendance | Yes | Code flow | Yes | Build | Complete |
| CSV exports and reports | Yes | — | Yes | Build | Complete |
| Managed R2 image/video gallery | Yes | Gallery, lightbox, direct playback | Upload, edit, publish, reorder, delete | Build + DB tests + Wrangler | Complete |
| Legal advice / final accessibility certification | No | — | Approval record | External | Must be supplied by qualified professionals |
