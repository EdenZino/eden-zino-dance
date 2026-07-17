# Eden Zino Dance — פלטפורמת סדנאות גרסה 1.3.0

מערכת מלאה לניהול, שיווק ומכירת סדנאות ריקוד: אתר ציבורי mobile-first, ממשק ניהול, קודי סדנה, הרשמה, קיבולת אטומית, PayMe, קופונים, Early Bird, מקדמות, רשימת המתנה, נוכחות, ביטולים, החזרים, העברות, מנויים, כרטיסיות, תוכן, דוחות ו־Audit Log.

## סטטוס הגרסה

פערי P0 ברמת הקוד נסגרו. נוספו אבטחת אזור לקוח, Rate Limiting אמיתי של Cloudflare, Turnstile, נעילת מנהלים, איפוס סיסמה, OTP, החזרים אטומיים, ביטול שלם, העברה אטומית, סטטוסים אמיתיים להתראות ושער Go-Live.

המערכת אינה מכריזה על עצמה כ־Production Ready רק מפני שה־Build עבר. ממשק הניהול חוסם מוכנות עד שקיימים:

- פרטי עסק מלאים.
- מסמכים משפטיים מאושרים על ידי OWNER.
- Turnstile ו־MFA פעילים.
- Rate Limit bindings פעילים.
- ספק דוא״ל פעיל.
- עסקת PayMe מוצלחת בסביבה הפעילה.
- החזר PayMe מוצלח בסביבה הפעילה.
- סימון סביבת ספק שמונע מנתוני Sandbox להיחשב כבדיקות Production.
- יציאה מ־Sandbox.

קרא את `docs/P0_CLOSURE_REPORT_HE.md` ואת `docs/PRODUCTION_CHECKLIST_HE.md`.

## תיקון מובייל ב־1.3.0

תפריט האתר ותפריט הניהול אינם מתכווצים עוד ב־Chrome בטלפון. ה־Drawer משתמש ברוחב viewport מפורש, אינו רשאי להתכווץ כ־Flex item, כולל גלילה פנימית וקישורים ברוחב מלא. במסכים עד 380px הוא נפתח ברוחב המסך.

## רכיבים

- React/Vite בעברית ו־RTL.
- Cloudflare Worker שמגיש אתר ו־API באותו דומיין.
- Neon PostgreSQL וארבע מיגרציות.
- Cloudflare R2 לתמונות.
- PayMe Hosted Payment ו־Callback שרת.
- Refund orchestration מלא ברמת המערכת.
- Magic Link ו־Session מאובטח ללקוחות.
- OWNER / ADMIN / INSTRUCTOR / VIEW_ONLY.
- Resend לדוא״ל ו־Webhooks חתומים לחשבוניות ול־WhatsApp.
- Cron לשחרור מקומות, Waitlist, תזכורות ותחזוקה.

## דרישות

- Node.js 22 ומעלה.
- Cloudflare Workers + R2.
- Neon PostgreSQL.
- חשבון PayMe מאושר לסליקה והחזרים.
- Cloudflare Turnstile.
- Resend עם דומיין שולח מאומת.
- ספק חשבוניות ישראלי.

## התקנה מקומית

```bash
npm ci
cp .env.example .env
cp .dev.vars.example .dev.vars
cp wrangler.toml.example wrangler.toml
```

החלף את ערכי הדוגמה בלבד. אין להדביק סודות בקוד או ב־Git.

```bash
set -a
source .env
set +a
npm run migrate
npm run dev
```

- אתר: `http://localhost:5173`
- Worker: `http://localhost:8787`
- ניהול: `http://localhost:5173/admin`

## סודות Cloudflare

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PAYME_SELLER_ID
npx wrangler secret put PAYME_CLIENT_KEY
npx wrangler secret put PAYME_CALLBACK_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put INVOICE_WEBHOOK_SECRET
npx wrangler secret put WHATSAPP_WEBHOOK_SECRET
```

`TURNSTILE_SITE_KEY` הוא מפתח ציבורי ונכנס ל־`wrangler.toml`. סוד Turnstile נשמר רק כ־Secret.

## הגדרת PayMe

בשלב ראשון:

```toml
PAYMENT_PROVIDER = "payme"
PAYME_API_BASE = "https://sandbox.payme.io/api"
PAYME_REFUND_PATH = "refund-sale"
```

יש לבדוק תשלום מוצלח, כישלון, Callback כפול, סכום שגוי, מקדמה, יתרה, החזר מלא והחזר חלקי. רק לאחר אישור PayMe עוברים לכתובת הייצור שסופקה לחשבון.

המערכת אינה מאשרת תשלום דרך Return URL. רק Callback מאומת משנה סטטוס כספי.

## מסמכים משפטיים

שמירת מסמך בממשק יוצרת טיוטה. רק OWNER יכול לאשר גרסה, והאישור נשמר עם תאריך והערה. שינוי תוכן מבטל אישור קודם. זה מנגנון בקרה, לא תחליף לעורך דין.

## בדיקה לפני פריסה

```bash
npm run validate
npx wrangler deploy --dry-run
npm audit --audit-level=high
```

לאחר מכן:

```bash
npm run deploy
```

## אזהרת סודות

בגרסה שהועלתה לבדיקה נמצא `DATABASE_URL` שנראה אמיתי בתוך `.env.example`. הוא הוסר. כאשר המחרוזת הייתה פעילה, יש לסובב מיד את סיסמת Neon. מחיקת הקובץ אינה מבטלת גישה למי שכבר ראה אותו.

## מבנה הפרויקט

```text
apps/web        אתר React וממשק ניהול
apps/api        Cloudflare Worker ו־API
db/migrations   סכמת PostgreSQL ופונקציות אטומיות
scripts         Migration, Seed ואימות
.github         פריסה אוטומטית
docs            תיעוד הפעלה, אבטחה, PayMe ומשפט
```

## בחירת עיצוב

האתר הציבורי תומך בשני עיצובים מתוך **ניהול → הגדרות**: `Classic` ו־`Modern`. השינוי נשמר במסד ואינו דורש Deploy נוסף. ראו `docs/DUAL_THEME_AND_MOBILE_MENU_HE.md`.
