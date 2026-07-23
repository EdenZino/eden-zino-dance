# דוח אימות v1.8.0

תאריך: 23.07.2026

## עבר

### Static validation

```text
npm run validate:static
✓ static accessibility safeguards: keyboard, focus, announcements, zoom and modal behavior
✓ workshop venue accessibility metadata and truthful statement are present
✓ media storage is canonical by R2 object_key and served with relative URLs
STATIC VALIDATION PASSED
```

### TypeScript / TSX syntax parsing

36 קבצי TypeScript/TSX עברו Parsing באמצעות TypeScript compiler API ללא שגיאות תחביר.

### Media helper unit check

נבדק:

```text
media/2026/07/test image.webp
→ /api/media/media/2026/07/test%20image.webp
```

וכן URL היסטורי:

```text
https://old.example/api/media/media%2F2026%2F07%2Ftest.webp
→ /api/media/media%2F2026%2F07%2Ftest.webp
```

### Source hygiene

- לא נמצא `.env` אמיתי או `.dev.vars` אמיתי.
- אין בניית URL חדש למדיה באמצעות `PUBLIC_APP_URL`.
- כתובות `https://.../api/media` קיימות ב-Migration 0010 רק לצורך זיהוי והמרת נתונים ישנים.

## לא בוצע בסביבת היצירה

`npm ci` מלא לא הושלם בסביבה זו משום ש-Registry הפנימי החזיר HTTP 503. לכן לא נטען כאן מחדש כל dependency graph ולא הורץ Build מלא של v1.8 או PGlite Migration suite.

הגרסה מבוססת על v1.7.0 שהמשתמש עצמו הריץ ב-Codespaces ב-23.07.2026 עם:

```text
npm ci        — הצליח
npm run validate — ALL VALIDATION TESTS PASSED
37 public tables
```

ל-v1.8 נוספו בדיקות ל-Migration 0010 בתוך `scripts/validate.mjs`. לפני Deploy יש להריץ ב-Codespaces:

```bash
npm ci
npm run validate
```

ולא להמשיך ל-Migration/Deploy אם הפקודה אינה מסתיימת ב-`ALL VALIDATION TESTS PASSED`.

## נגישות

הבדיקות שבוצעו הן בדיקות קוד/Static בלבד. הן אינן בדיקת נגישות מקצועית מלאה ואינן אישור ת"י 5568/AA. מסמך `docs/ACCESSIBILITY_REVIEW_1_8_HE.md` מפרט את הבדיקות הידניות שעדיין נדרשות על Production.
