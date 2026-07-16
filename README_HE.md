# Eden Zino Dance — מערכת סדנאות מלאה

מערכת מלאה לניהול ושיווק סדנאות ריקוד: אתר ציבורי, קוד סדנה, הרשמה, שמירת מקום אטומית, תשלום, קופונים, Early Bird, מקדמות, מספר משתתפים, רשימת המתנה, נוכחות, ביטולים, החזרים, העברות, מנויים, כרטיסיות, דוחות, תוכן ותמונות.

## מה כלול

- אתר React בגישת mobile-first בעברית ו-RTL, כולל ניווט וטפסים נגישים לטלפון.
- ממשק ניהול עם הרשאות OWNER / ADMIN / INSTRUCTOR / VIEW_ONLY.
- Cloudflare Worker שמגיש גם את האתר וגם את ה-API.
- Neon PostgreSQL עם Migration מלא ופונקציות אטומיות.
- Cloudflare R2 לתמונות.
- מצב Mock לבדיקת תשלום ללא חיוב.
- חיבור PayMe באמצעות Hosted Payment Page ו-Callback בצד השרת.
- תמיכה קיימת גם ב-Tranzila ובמצב Mock לצורכי פיתוח.
- דוא״ל דרך Resend.
- Webhooks חתומים לחיבור WhatsApp ולמערכת חשבוניות.
- Cron לשחרור מקומות שפג תוקפם ולשליחת תזכורות.
- GitHub Actions לפריסה אוטומטית.

## חשוב לפני שמתחילים

הקוד אינו יכול לפתוח עבורך חשבון סליקה, חשבון חשבוניות, חשבון דוא״ל או מסד נתונים. בלי פרטי החשבונות והסודות שלהם המערכת תפעל במצב בדיקות בלבד. אין להפעיל גבייה אמיתית לפני החלפת מסמכי DRAFT בנוסחים שנבדקו משפטית.

## דרישות

- Node.js 22 ומעלה.
- חשבון Cloudflare עם Workers ו-R2.
- מסד Neon PostgreSQL.
- לסליקה אמיתית: חשבון PayMe פעיל, `seller_payme_id`, `payme_client_key` וכתובת API לסביבת הייצור.
- לדוא״ל: חשבון Resend ודומיין מאומת.

## התקנה מקומית

```bash
npm install
cp .env.example .env
cp wrangler.toml.example wrangler.toml
```

הגדר `DATABASE_URL` ואז:

```bash
set -a
source .env
set +a
npm run migrate
```

ל-Wrangler מקומי צור `.dev.vars` בשורש:

```dotenv
DATABASE_URL=postgresql://...
SETUP_TOKEN=...
SESSION_SECRET=...
PUBLIC_APP_URL=http://localhost:5173
PAYMENT_PROVIDER=mock
```

הפעלה:

```bash
npm run dev
```

- אתר: `http://localhost:5173`
- Worker: `http://localhost:8787`
- ניהול: `http://localhost:5173/admin`

בכניסה הראשונה בחר "הקמה ראשונית" והזן את `SETUP_TOKEN`.

## פריסה ל-Cloudflare

### 1. יצירת Neon

העתק Connection String מאובטח של Neon. להרצה Serverless מומלץ חיבור pooled. הרץ:

```bash
DATABASE_URL="postgresql://..." npm run migrate
```

### 2. יצירת R2

```bash
npx wrangler login
npx wrangler r2 bucket create eden-dance-media
npx wrangler r2 bucket create eden-dance-media-preview
```

### 3. עריכת Wrangler

ערוך את `wrangler.toml`:

- שנה `name` אם נדרש.
- שנה `PUBLIC_APP_URL` לדומיין הסופי.
- ודא ששמות דליי R2 נכונים.
- השאר `PAYMENT_PROVIDER = "mock"` עד שהסליקה נבדקה.

### 4. הגדרת סודות

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PAYME_SELLER_ID
npx wrangler secret put PAYME_CLIENT_KEY
npx wrangler secret put PAYME_CALLBACK_SECRET
npx wrangler secret put INVOICE_WEBHOOK_SECRET
npx wrangler secret put WHATSAPP_WEBHOOK_SECRET
```

### 5. Build ופריסה

```bash
npm run build
npm run deploy
```

### 6. מעבר מסליקה מדומה לאמיתית

ב-`wrangler.toml`:

```toml
PAYMENT_PROVIDER = "payme"
PAYME_API_BASE = "https://sandbox.payme.io/api"
```

הגדר את שלושת סודות PayMe ב-Cloudflare. בסביבת הייצור החלף את `PAYME_API_BASE` בכתובת שקיבלת מ-PayMe. בצע עסקת בדיקה מלאה וודא שהסטטוס משתנה ל-PAID רק לאחר Callback מהשרת. הוראות מלאות נמצאות ב-`docs/PAYME_SETUP_HE.md`.

## GitHub Actions

הוסף ל-Secrets של GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

ה-Workflow נמצא ב-`.github/workflows/deploy.yml`.

## תוכן של עדן

בממשק הניהול, תחת "תוכן ותמונות", ניתן לערוך:

- כותרת ותיאור Hero.
- הודעה עליונה.
- ביוגרפיה של עדן.
- גישת ההוראה.
- תמונת תדמית.
- קישור Instagram.

לא הוכנסו תמונות מהאינסטגרם לקוד. יש להעלות תמונות שבבעלות העסק או שקיימת הרשאה מפורשת להשתמש בהן.

## תשלום, החזרים וחשבוניות

- תשלום חדש נוצר רק בצד השרת.
- המחיר נשלף מהמסד ולא מתקבל מהדפדפן.
- המקום נשמר לזמן מוגבל.
- Callback מאמת סוד ייעודי, מזהה תשלום, מזהה מוכר וסכום לפני אישור.
- החזר נפתח במערכת כ-`MANUAL_ACTION_REQUIRED`, מבוצע אצל ספק הסליקה ואז מסומן כהושלם בניהול.
- חשבוניות נשלחות ל-`INVOICE_WEBHOOK_URL`; יש לחבר ספק חשבוניות ישראלי ולמפות את ה-Payload.

## מבנה הפרויקט

```text
apps/web        אתר React וממשק ניהול
apps/api        Cloudflare Worker ו-API
db/migrations   סכמת PostgreSQL ופונקציות אטומיות
scripts         Migration וזריעה
.github         פריסה אוטומטית
docs            מסמכי הפעלה, משפט ואבטחה
```

## בדיקות חובה לפני ייצור

קרא את `docs/PRODUCTION_CHECKLIST_HE.md`, את `docs/PAYME_SETUP_HE.md` ואת `docs/MOBILE_ACCESSIBILITY_HE.md`. אל תדלג על בדיקות סליקה, ביטול, תחרות על המקום האחרון, הרשאות מנהלים, נגישות וגיבוי.
