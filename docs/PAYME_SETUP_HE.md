# חיבור PayMe למערכת Eden Zino Dance

## מה כבר ממומש בקוד

המערכת משתמשת בזרימת Hosted Payment Page:

1. השרת יוצר רשומת תשלום פנימית ומקצה לה UUID.
2. ה-Cloudflare Worker שולח ל-PayMe בקשת `generate-sale` בצד השרת בלבד.
3. PayMe מחזירה `sale_url` ו-`payme_sale_id`.
4. הדפדפן מופנה לדף התשלום של PayMe. פרטי הכרטיס אינם עוברים דרך האתר.
5. PayMe שולחת Callback לשרת.
6. השרת מאמת את סוד ה-Callback, מזהה העסקה, מזהה המוכר והסכום.
7. רק Callback בסטטוס `completed` מאשר את ההרשמה או את רכישת המוצר.
8. הטיפול אידמפוטנטי: Callback כפול לא ייצור חיוב או זיכוי כפול במסד.

## פרטים שצריך לקבל מ-PayMe

- חשבון עסק פעיל ומאושר לסליקה באינטרנט.
- `seller_payme_id` / API Key שמתחיל בדרך כלל ב-`MPL`.
- `payme_client_key` המתאים לאינטגרציית API.
- כתובת API לסביבת הייצור. סביבת הבדיקות המוגדרת בחבילה היא `https://sandbox.payme.io/api`.
- אישור אמצעי התשלום הרצויים בחשבון: כרטיס אשראי, Bit, Apple Pay או אמצעים אחרים הנתמכים בחשבון.
- פרטי בדיקה או הרשאה לסביבת Sandbox.

אין להכניס את המפתחות לקוד, ל-GitHub או ל-`wrangler.toml`.

## הגדרת Cloudflare

תחילה קבעו ב-`wrangler.toml`:

```toml
[vars]
PUBLIC_APP_URL = "https://dance.your-domain.co.il"
PAYMENT_PROVIDER = "payme"
PAYME_API_BASE = "https://sandbox.payme.io/api"
PAYME_LANGUAGE = "he"
PAYME_PAYMENT_METHOD = ""
```

בייצור יש להחליף את `PAYME_API_BASE` בכתובת שסופקה על ידי PayMe.

לאחר מכן הגדירו סודות:

```bash
npx wrangler secret put PAYME_SELLER_ID
npx wrangler secret put PAYME_CLIENT_KEY
npx wrangler secret put PAYME_CALLBACK_SECRET
```

עבור `PAYME_CALLBACK_SECRET` השתמשו במחרוזת אקראית ארוכה, לדוגמה:

```bash
openssl rand -base64 48
```

## כתובות המערכת

Callback ש-PayMe תקבל אוטומטית בעת יצירת העסקה:

```text
https://dance.your-domain.co.il/api/public/payments/payme/callback?token=<SECRET>
```

אין צורך להדביק את ה-Secret במסמכים או לשלוח אותו בדוא"ל. הקוד בונה את הכתובת מתוך הסוד השמור ב-Cloudflare.

Return URL ללקוח נבנה בהתאם לסוג העסקה:

```text
https://dance.your-domain.co.il/payment/result?registration=...
https://dance.your-domain.co.il/products/result?order=...
```

Return URL אינו מאשר תשלום. הוא רק מחזיר את הלקוח לאתר. האישור מגיע מה-Callback בלבד.

## מעבר מ-Sandbox לייצור

1. השאירו `PAYMENT_PROVIDER = "mock"` בזמן בדיקות מערכת ללא סליקה.
2. עברו ל-`PAYMENT_PROVIDER = "payme"` ולכתובת Sandbox.
3. בצעו תרחישי הצלחה, כישלון, סגירת דפדפן, Callback כפול וסכום שגוי.
4. בקשו מ-PayMe לאשר את האינטגרציה ולמסור את כתובת ה-API לייצור.
5. החליפו רק את `PAYME_API_BASE` ואת הסודות של סביבת הייצור.
6. בצעו עסקה אמיתית בסכום נמוך ובדקו שההרשמה עוברת ל-`PAID` ושנוצר מסמך חשבונאי.
7. בדקו החזר מלא וחלקי דרך תהליך התפעול שאושר מול PayMe.

## אמצעי תשלום

כאשר `PAYME_PAYMENT_METHOD` ריק, המערכת אינה כופה אמצעי תשלום אחד; דף PayMe מציג את האמצעים שהופעלו לחשבון. כפו ערך רק לאחר ש-PayMe מסרה את הערך המדויק הנדרש ל-API שלכם.

## החזרים

המערכת מנהלת בקשת החזר, סכום, סטטוס ו-Audit Log. החזר כספי אוטומטי מול PayMe לא הופעל בלי הרשאות ותיעוד API ספציפיים לחשבון. עד לקבלת פרטי Refund API מאושרים, יש לבצע את ההחזר ב-PayMe ולסגור אותו בממשק הניהול. אין לסמן החזר במסד לפני שההחזר בוצע בפועל אצל הסולק.

## בדיקות חובה לפני מכירה

- עסקה מוצלחת בכרטיס.
- עסקה שנדחתה.
- ביטול בדף התשלום.
- סגירת הטלפון לפני החזרה לאתר.
- Callback שמגיע לפני ה-Return URL ואחריו.
- Callback כפול.
- סכום Callback שאינו תואם.
- רכישת סדנה מלאה, מקדמה, יתרה, כרטיסייה ומנוי.
- תצוגה ב-iPhone וב-Android ברוחב 320–430 פיקסלים.
- שימוש מלא באמצעות מקלדת וקורא מסך בסיסי.
