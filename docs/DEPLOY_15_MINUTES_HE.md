# פריסה ראשונית — הוראות מדויקות

המסמך מניח שיש ברשותך חשבונות Cloudflare ו-Neon. מצב התשלום הראשוני הוא `mock`; אין לעבור לגבייה אמיתית לפני השלמת רשימת ה-Go-Live.

## 1. הכנת הקוד

```bash
unzip eden-zino-dance-platform.zip
cd eden-dance-platform
npm ci
npm run validate
```

נדרש Node.js 22 ומעלה.

## 2. יצירת מסד Neon

1. צור Project ו-Database ב-Neon.
2. העתק Connection String עם SSL. בחיבור Serverless העדף כתובת pooled.
3. הרץ את המיגרציות:

```bash
DATABASE_URL='postgresql://...' npm run migrate
```

המיגרציות ניתנות להרצה חוזרת ואינן אמורות למחוק נתוני ייצור.

## 3. Cloudflare ו-R2

```bash
npx wrangler login
npx wrangler r2 bucket create eden-dance-media
npx wrangler r2 bucket create eden-dance-media-preview
```

ערוך `wrangler.toml` והחלף:

- `name` — שם ה-Worker.
- `PUBLIC_APP_URL` — כתובת האתר הסופית.
- `EMAIL_FROM` — כתובת שולח מאומתת.
- שמות דליי R2, אם בחרת שמות אחרים.

## 4. סודות

צור ערכים אקראיים ארוכים ל-`SETUP_TOKEN` ול-`SESSION_SECRET` ושמור אותם במנהל סיסמאות.

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put SESSION_SECRET
```

רק לאחר חיבור השירותים החיצוניים:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TRANZILA_TERMINAL
npx wrangler secret put INVOICE_WEBHOOK_SECRET
npx wrangler secret put WHATSAPP_WEBHOOK_SECRET
```

כתובות Webhook שאינן סוד יכולות להיות משתני `[vars]`, אך ניתן לשמור גם אותן כסודות.

## 5. פריסה

```bash
npm run deploy
```

בדוק:

```text
https://YOUR-DOMAIN/api/health
https://YOUR-DOMAIN/
https://YOUR-DOMAIN/admin
```

## 6. הקמת מנהל ראשון

1. פתח `/admin`.
2. בחר הקמה ראשונית.
3. הזן את `SETUP_TOKEN`.
4. צור OWNER עם סיסמה ייחודית וחזקה.
5. לאחר ההקמה, החלף את `SETUP_TOKEN` בערך חדש שאינו נשמר אצל משתמשים אחרים.

## 7. הגדרות מתוך ממשק הניהול

לפני פרסום סדנה:

1. הזן את פרטי העסק ופרטי הקשר.
2. השלם ביוגרפיה, גישת הוראה ותמונות של עדן.
3. החלף את כל המסמכים שמסומנים DRAFT.
4. צור סדנת בדיקה עם מחיר של 1 ש"ח רק בסביבת סליקה מאושרת לבדיקה.
5. בדוק הרשמה, תשלום, אישור, תזכורת, ביטול והחזר.

## 8. מעבר מ-Mock לסליקה

רק לאחר שקיבלת חשבון PayMe פעיל, מפתח מוכר, Client Key וסביבת API:

```toml
PAYMENT_PROVIDER = "payme"
PAYME_API_BASE = "https://sandbox.payme.io/api"
```

לאחר השינוי:

```bash
npm run deploy
```

הגדר לפני הפריסה:

```bash
npx wrangler secret put PAYME_SELLER_ID
npx wrangler secret put PAYME_CLIENT_KEY
npx wrangler secret put PAYME_CALLBACK_SECRET
```

בצע לפחות את הבדיקות הבאות:

- תשלום מוצלח.
- תשלום שנכשל.
- Callback כפול.
- Callback עם Token שגוי.
- Callback עם סכום שגוי.
- סגירת חלון התשלום לפני חזרה לאתר.
- מקדמה ולאחר מכן יתרה.
- רכישת כרטיסייה.
- החזר מלא וחלקי בתהליך הספק.

## 9. GitHub Actions

דחוף את התיקייה ל-Repository פרטי והוסף Secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

ה-Workflow ב-`.github/workflows/deploy.yml` מריץ `npm ci`, את כל בדיקות האימות ורק לאחר מכן פריסה.

## 10. דומיין

חבר Custom Domain ל-Worker דרך Cloudflare. לאחר מכן עדכן את `PUBLIC_APP_URL`, פרוס שוב, ובדוק שכל קישורי התשלום, ההזמנות והתזכורות משתמשים בדומיין החדש.
