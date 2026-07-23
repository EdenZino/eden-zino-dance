# שדרוג לגרסה 1.8 — R2 Object Keys + נגישות

## מה משתנה

גרסה 1.8 מפסיקה לשמור כתובת מלאה של Worker/Domin עבור מדיה שהועלתה ל-R2.

המקור הקנוני הוא:

```text
uploaded_assets.object_key
```

לדוגמה:

```text
media/2026/07/23/uuid-photo.webp
```

וה-URL המוגש לדפדפן נבנה יחסית:

```text
/api/media/media/2026/07/23/uuid-photo.webp
```

כך מעבר בין `workers.dev`, דומיין מותאם, Development ו-Production אינו שובר את הקישור בגלל hostname ישן.

> חשוב: Relative URL אינו מעתיק קובץ בין Buckets. אם מסד Development מצביע ל-object key שקיים רק ב-`eden-dance-media`, אבל ה-Worker מחובר ל-`eden-dance-media-preview`, הקובץ עדיין יהיה חסר. בממשק הגלריה נוסף כפתור **בדיקת תקינות קבצי R2** שמאתר object keys שחסרים ב-Bucket המחובר בפועל.

## לפני השדרוג

1. בצע גיבוי/Restore Point של Neon.
2. אל תמחק תמונות מ-R2.
3. ודא ששני ה-Buckets קיימים:

```text
eden-dance-media-preview
eden-dance-media
```

4. ודא שה-branch הוא `develop` לפני בדיקת Development.

## בדיקה מקומית / Codespaces

```bash
npm ci
npm run validate
```

`validate` כולל גם `validate:static` שבודק safeguards מרכזיים של נגישות ומדיה.

## Migration

המיגרציה החדשה היא:

```text
db/migrations/0010_relative_media_and_accessibility.sql
```

היא:

- הופכת `uploaded_assets.public_url` ל-relative URL שמבוסס על `object_key`.
- מסירה hostname מכתובות `/api/media/...` היסטוריות בסדנאות, Instructor, Hero וגלריה ישנה.
- מוסיפה נתוני נגישות לכל סדנה.
- מוסיפה פרטי קשר לנגישות להגדרות העסק.
- מוסיפה הצהרת נגישות בעברית ובאנגלית בהתאם לנוסח שסופק.
- אינה מפרסמת סעיף פטור משוער.

### Development דרך GitHub Actions

הדרך המומלצת היא Push ל-`develop`. ה-Workflow `Deploy Development` מבצע:

```text
npm ci
npm run validate
npm run migrate   (DATABASE_URL_DEVELOPMENT)
npm run build
wrangler deploy --env=""
```

### Migration ידני

רק אם צריך:

```bash
export DATABASE_URL='postgresql://...'
npm run migrate
unset DATABASE_URL
```

## פריסה ידנית — אין יותר deploy עמום

Development:

```bash
npm run deploy:dev
```

Production:

```bash
npm run deploy:prod
```

הפקודה הישנה `npm run deploy` הוסרה בכוונה כדי למנוע פריסה לסביבה הלא נכונה.

## לאחר Migration

### 1. הגדרות → פרטי קשר לנגישות

יש להשלים:

- איש/אשת קשר לנגישות.
- דוא"ל נגישות.
- טלפון נגישות.
- כתובת למשלוח דואר רשום.
- מגבלות נגישות ידועות בפועל.
- כתובת ומגבלות באנגלית עבור האתר האנגלי.

המערכת מחליפה את ה-placeholders בהצהרת הנגישות בזמן הצגה. אם השדות ריקים, ה-placeholders נשארים גלויים כדי שלא תפורסם טענה מומצאת.

### 2. מסמכים משפטיים

נוספה גרסת ACCESSIBILITY:

```text
2026-07-17
```

היא אינה מקבלת `approved_at` אוטומטית. OWNER צריך לבדוק את הנוסח והפרטים ורק אז לאשר ולפרסם דרך ממשק הניהול. שער Production יישאר חסום עד להשלמת פרטי הנגישות ואישור המסמך.

### 3. כל סדנה → נגישות מקום הסדנה

לכל אחד מהפריטים ניתן לבחור:

```text
לא אומת
כן
לא
לא רלוונטי
```

עבור:

- כניסה ללא מדרגות.
- מעלית.
- שירותים נגישים.
- חניה נגישה.

בנוסף קיימים:

- מעברים ורוחבים.
- מגבלות/מידע נוסף.
- תאריך אימות.
- מקור המידע.

אל תסמן `כן` לפני בירור מול בעל המקום.

### 4. גלריה → בדיקת R2

בממשק הניהול פתח גלריה ולחץ:

```text
בדיקת תקינות קבצי R2
```

אם `missingCount > 0`, המערכת מציגה את ה-`object_key` החסר. יש להעתיק את הקובץ ל-Bucket של הסביבה או לתקן את הרשומה; אין צורך להעלות מחדש תמונות שעוד קיימות ב-Bucket האחר.

## Production

לאחר ש-Development עבר:

1. Merge ל-`main`.
2. GitHub → Actions → **Deploy Production**.
3. ה-Workflow מריץ את Migration 0010 על `DATABASE_URL_PRODUCTION`.
4. הוא פורס עם `--env production`, ולכן `MEDIA` מחובר ל-`eden-dance-media`.

## בדיקות ידניות מומלצות

- פתח תמונה ישנה שהועלתה לפני v1.8 וודא שה-URL מתחיל ב-`/api/media/`.
- העלה תמונה חדשה וודא שה-API מחזיר `object_key` + `public_url` יחסי.
- החלף בין Development/Production וודא שאין hostname ישן בנתוני המדיה.
- נווט באתר באמצעות Tab/Shift+Tab בלבד.
- פתח וסגור Registration, Gallery Lightbox ו-Product Checkout עם מקלדת ו-Escape.
- הגדל Zoom ל-200% ובדוק שאין אובדן תוכן/פעולה.
- עבור על עמוד סדנה עם נגישות `UNKNOWN` וודא שלא מופיעה טענה שהמקום נגיש.
- מלא Alt text בגלריה ובדוק שהוא מופיע בתמונה הציבורית.
