# חיבור PayMe — תשלום והחזר

## מה ממומש בגרסה 1.2.0

### תשלום

1. השרת יוצר הרשמה ורשומת Payment פנימית.
2. הסכום מחושב בשרת מתוך הסדנה, הקופון, המקדמה והזכאויות.
3. ה־Worker שולח ל־PayMe בקשת יצירת עסקה.
4. הלקוח מופנה ל־Hosted Payment Page.
5. PayMe שולחת Callback לשרת.
6. השרת מאמת Secret, מזהה מוכר, Payment UUID וסכום.
7. רק Callback מוצלח מאשר את ההרשמה.
8. Callback כפול אינו יוצר אישור כפול.

Return URL אינו הוכחת תשלום ואינו משנה סטטוס כספי.

### החזר

1. ההחזר מוקצה אטומית לתשלומים ששולמו.
2. סכום שכבר הוקצה או הוחזר אינו ניתן להקצאה חוזרת.
3. לכל Refund נשמר `idempotency_key` קבוע.
4. המערכת שולחת בקשת החזר לנתיב המוגדר ב־`PAYME_REFUND_PATH`.
5. הצלחה משלימה את ההחזר במסד.
6. כישלון נשמר ומופיע במסך התפעול.
7. ניתן לבצע Retry באותו מפתח Idempotency.
8. כאשר המסוף אינו מאפשר API אוטומטי, ניתן לבצע החזר ידני ב־PayMe ולסמן השלמה רק לאחר קבלת מזהה החזר.
9. Callback מסוג refund יכול להשלים Refund קיים.

## מידע שצריך לקבל מ־PayMe

- `PAYME_SELLER_ID`.
- `PAYME_CLIENT_KEY`.
- כתובת API ל־Sandbox ולייצור.
- הרשאת Hosted Payment Page.
- הרשאת Refund API מלא וחלקי.
- נתיב Refund המדויק למסוף, כאשר הוא שונה מ־`refund-sale`.
- שמות השדות וסטטוס ההצלחה למסוף שלך.
- אמצעי התשלום שהופעלו בחשבון.

## הגדרת Wrangler

```toml
[vars]
PUBLIC_APP_URL = "https://dance.example.co.il"
PAYMENT_PROVIDER = "payme"
PAYME_API_BASE = "https://sandbox.payme.io/api"
PAYME_REFUND_PATH = "refund-sale"
PAYME_LANGUAGE = "he"
PAYME_PAYMENT_METHOD = ""
```

## סודות

```bash
npx wrangler secret put PAYME_SELLER_ID
npx wrangler secret put PAYME_CLIENT_KEY
npx wrangler secret put PAYME_CALLBACK_SECRET
```

צור Secret אקראי:

```bash
openssl rand -base64 48
```

## Callback

המערכת בונה כתובת במבנה:

```text
https://YOUR-DOMAIN/api/public/payments/payme/callback?token=<SECRET>
```

אין לפרסם את הסוד ואין להכניסו ל־Git.

## בדיקת Sandbox חובה

- תשלום מוצלח.
- תשלום שנדחה.
- סגירת דף התשלום.
- Callback לפני ואחרי Return URL.
- Callback כפול.
- Callback עם Secret שגוי.
- Callback עם סכום שגוי.
- מקדמה ולאחר מכן יתרה.
- החזר מלא.
- החזר חלקי.
- שני החזרים חלקיים על אותה עסקה.
- ניסיון החזר שחורג מהיתרה.
- Retry לאחר timeout.
- Callback refund כפול.

## מעבר לייצור

1. החלף את `PAYME_API_BASE` לכתובת הייצור שקיבלת מ־PayMe.
2. החלף את סודות Sandbox בסודות הייצור.
3. פרוס מחדש.
4. בצע עסקה אמיתית בסכום נמוך.
5. בצע החזר אמיתי מלא או חלקי.
6. פתח בממשק הניהול את "בדיקת מוכנות לייצור".
7. ודא שאין חסימות `PAYME_SANDBOX_MODE_ACTIVE`, `PAYME_PAYMENT_FLOW_NOT_VERIFIED` או `PAYME_REFUND_FLOW_NOT_VERIFIED`.

המערכת בכוונה אינה מאפשרת להסתפק ב־Build או ב־Mock כהוכחה שזרימת הכסף אמיתית.
