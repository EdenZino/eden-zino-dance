# פריסה ראשונית — גרסה 1.2.0

## 1. הכנת הקוד

```bash
unzip eden-zino-dance-p0-v1.2.0.zip
cd eden-zino-dance-p0-v1.2.0
npm ci
npm run validate
npx wrangler deploy --dry-run
```

נדרש Node.js 22 ומעלה.

## 2. Neon

1. צור Project ו־Database.
2. העתק Connection String עם SSL, ועדיף pooled.
3. הרץ ארבע מיגרציות:

```bash
DATABASE_URL='postgresql://...' npm run migrate
```

כאשר השתמשת בעבר במחרוזת שהופיעה בקובץ `.env.example` הישן, סובב את סיסמת Neon לפני כל פריסה.

## 3. R2

```bash
npx wrangler login
npx wrangler r2 bucket create eden-dance-media
npx wrangler r2 bucket create eden-dance-media-preview
```

עדכן את שמות הדליים ב־`wrangler.toml` כאשר בחרת שמות אחרים.

## 4. Turnstile

צור Widget עבור הדומיין וה־localhost.

ב־`wrangler.toml`:

```toml
TURNSTILE_SITE_KEY = "PUBLIC_SITE_KEY"
```

כ־Secret:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

## 5. Rate Limiting

הקובץ כולל שני Bindings:

- `PUBLIC_RATE_LIMITER` — 120 בקשות לדקה.
- `AUTH_RATE_LIMITER` — 10 בקשות לדקה.

`namespace_id` חייב להיות מספר ייחודי בחשבון. שנה את ערכי הדוגמה כאשר הם מתנגשים עם Worker אחר.

## 6. סודות בסיסיים

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CRON_SECRET
```

## 7. דוא״ל ו־OTP

אמת דומיין ב־Resend, עדכן `EMAIL_FROM`, והגדר:

```bash
npx wrangler secret put RESEND_API_KEY
```

`ADMIN_EMAIL_OTP_REQUIRED = "true"` כבר מוגדר. בלי דוא״ל פעיל מנהלים לא יוכלו להשלים OTP בייצור.

## 8. PayMe

```bash
npx wrangler secret put PAYME_SELLER_ID
npx wrangler secret put PAYME_CLIENT_KEY
npx wrangler secret put PAYME_CALLBACK_SECRET
```

בשלב בדיקה:

```toml
PAYMENT_PROVIDER = "payme"
PAYME_API_BASE = "https://sandbox.payme.io/api"
PAYME_REFUND_PATH = "refund-sale"
```

השלם את כל הבדיקות ב־`docs/PAYME_SETUP_HE.md` לפני מעבר לייצור.

## 9. ספק חשבוניות ו־WhatsApp

```bash
npx wrangler secret put INVOICE_WEBHOOK_SECRET
npx wrangler secret put WHATSAPP_WEBHOOK_SECRET
```

הגדר את הכתובות כ־vars או secrets. בדוק שחתימת `X-Eden-Signature` מאומתת אצל המקבל.

## 10. פריסה

```bash
npm run deploy
```

בדוק:

```text
https://YOUR-DOMAIN/api/health
https://YOUR-DOMAIN/
https://YOUR-DOMAIN/admin
```

## 11. הקמת OWNER

1. פתח `/admin`.
2. בחר הקמה ראשונית.
3. הזן `SETUP_TOKEN`.
4. צור OWNER עם סיסמה ייחודית של 12 תווים לפחות.
5. ודא שקוד OTP מגיע בדוא״ל.
6. החלף את `SETUP_TOKEN` לאחר ההקמה.

## 12. שער Go-Live

בממשק: **הגדרות → בדיקת מוכנות לייצור**.

אל תתחיל למכור עד שהשער מציג מוכנות. הוא בודק:

- פרטי עסק.
- ארבעה מסמכים משפטיים מאושרים.
- PayMe מחוץ ל־Sandbox.
- עסקה והחזר מוצלחים.
- דוא״ל.
- Turnstile.
- Rate Limiting.
- OTP למנהלים.

חשבוניות ו־WhatsApp מוצגים כאזהרות כאשר אינם מחוברים.
