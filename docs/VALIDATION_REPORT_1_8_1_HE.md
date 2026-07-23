# דוח אימות v1.8.1

## עבר

- `scripts/validate-static.mjs` עבר.
- 37 קבצי TypeScript/TSX עברו Parsing באמצעות TypeScript compiler ללא שגיאות תחביר.
- הבדיקה הסטטית מאמתת שקיימים:
  - endpoint לחיפוש ספריית המדיה.
  - endpoint לשימוש מחדש ב-asset קיים בגלריה.
  - Media Picker עם Focus Trap.
  - חיפוש לפי metadata / object key.
  - חיבור Media Picker לשדות תמונה.
- לא נוספה Migration ולכן סכמת v1.8.0 נשארת תקפה.

## Build מלא בסביבת האריזה

לא ניתן היה להשלים `npm ci` בסביבת האריזה משום ש-NPM registry הפנימי לא החזיר את כל החבילות בזמן, והגישה הישירה ל-registry הציבורי אינה זמינה בסביבה זו. לכן אין לטעון ש-Build מלא של v1.8.1 עבר כאן.

לפני Deploy יש להריץ ב-Codespaces:

```bash
npm ci
npm run validate
```

ורק אם מתקבל:

```text
ALL VALIDATION TESTS PASSED
```

להמשיך ל-Development Deploy.
