# ניקוי מבנה הפרויקט — v1.7.0

## הוסר

- `.github/workflows/deploy.yml` — Workflow ישן וכללי שפרס את `main` ללא `--env production`. הוא היה כפול ל-`deploy-production.yml` ועלול היה לפרוס את קונפיגורציית Development בטעות.
- `wrangler.toml.backup` — גיבוי היסטורי של קונפיגורציה. Git כבר מספק היסטוריית גרסאות ולכן אין הצדקה להחזיק גיבוי ידני בקוד.
- `wrangler.toml.example` — הקובץ כבר לא תאם את מבנה ה-Development/Production שב-`wrangler.toml` הפעיל ולכן היה מקור סביר לטעויות.

- `apps/web/dist/` ותוצרי `*.tsbuildinfo` — תוצרי Build מקומיים שאינם מקור. הם נוצרים מחדש על ידי `npm run build` וממילא מוחרגים ב-`.gitignore`.

## הועבר ל-`docs/archive/`

מסמכי יישום היסטוריים שאינם נדרשים להפעלה שוטפת:

- `CLASSIC_COLOR_PALETTES_HE.md`
- `DEVELOPMENT_GAP_AUDIT_HE.md`
- `DUAL_THEME_AND_MOBILE_MENU_HE.md`
- `EMAIL_HERO_UPLOAD_UPDATE_HE.md`
- `GALLERY_MANAGEMENT_HE.md`
- `MOBILE_ACCESSIBILITY_HE.md`
- `P0_CLOSURE_REPORT_HE.md`

הם נשמרו לצורכי היסטוריה ולא נמחקו.

## נשאר בכוונה

- `.env.example` — שימושי לפקודות Node מקומיות כמו migrations.
- `.dev.vars.example` — שימושי לסודות מקומיים של Wrangler. למרות הדמיון בין השניים, אלה שני consumers שונים ולכן איחוד שלהם ייצור יותר בלבול מתועלת.
- `RELEASE_NOTES_HE.md` ו-`RELEASE_MANIFEST.txt` — נשארו כמידע Release. מומלץ בעתיד לעבור לתיקיית `docs/releases/` אם מספר גרסאות ההפצה גדל.
- `deploy-development.yml` — פריסה אוטומטית של branch `develop`.
- `deploy-production.yml` — פריסה ידנית ומבוקרת של `main` בלבד.

## כלל תחזוקה מומלץ

אל תשמור קבצים בשם `.backup`, `.old`, `copy`, `final2` וכדומה בתוך repository. Git הוא מנגנון הגיבוי וההיסטוריה. קבצים כאלה הופכים מהר מאוד למלכודת שבה לא ברור איזו קונפיגורציה אמיתית.
