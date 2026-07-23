# שדרוג לגרסה 1.7 — עברית/אנגלית, מיילים ומיתוג Eden Zino

## לפני פריסה

```bash
npm ci
npm run validate
```

> `validate` טוען את כל המיגרציות כולל `0009_bilingual_branding.sql` למסד בדיקות מקומי, בודק את שדות השפה והמיתוג, ואז מריץ את בדיקות הליבה הקיימות.

## עדכון Development

1. Merge/Pull של הקוד ל-`develop`.
2. Workflow בשם **Deploy Development** מריץ Validation, Migration ו-Deploy.
3. בדוק באתר Development:
   - מעבר HE/EN בכותרת.
   - RTL בעברית ו-LTR באנגלית.
   - הרשמה באנגלית ושליחת מייל באנגלית.
   - הרשמה בעברית ושליחת מייל בעברית.
   - עריכת סדנה והזנת שדות English בממשק הניהול.
   - favicon בכרטיסיית הדפדפן.

## עדכון Production

ה-Production אינו נפרס אוטומטית מ-main. לאחר בדיקה ב-Development:

1. Merge ל-`main`.
2. GitHub → Actions → **Deploy Production** → Run workflow.
3. ה-Workflow מריץ את `0009_bilingual_branding.sql` על מסד Production לפני הפריסה.

## מילוי תרגומים לתוכן עסקי

הממשק הקבוע תורגם בקוד. תוכן עסקי חדש נשמר בשדות נפרדים:

- Workshop: title, description, location, level, audience — Hebrew + English.
- Instructor/About: Hebrew + English.
- Gallery captions/alt text: Hebrew + English.
- Memberships/passes: Hebrew + English.
- Legal documents: Hebrew + English.

כאשר שדה English ריק, האתר מציג את הטקסט העברי כ-Fallback כדי שלא יוצג תוכן ריק.

### מה לא תורגם אוטומטית בכוונה

לא שולב תרגום AI אוטומטי לתוכן חדש. תרגום כזה דורש ספק חיצוני, עולה כסף ועלול להכניס טעויות למסמכים משפטיים. אם יתווסף בעתיד, עדיף ככפתור **Generate English draft** בממשק הניהול ולא כפרסום אוטומטי ללא ביקורת.

## Google / SEO

לאחר Production:

1. ודא שהעמוד `https://www.edenzino.com/favicon.svg` נגיש.
2. פתח Google Search Console.
3. URL Inspection על `https://www.edenzino.com/`.
4. Request indexing.
5. המתן לסריקה מחדש. Google קובעת בפועל את ה-site name וה-favicon ואין אפשרות לכפות רענון מיידי.

## SEO רב-לשוני

גרסה 1.7 משתמשת באותו URL ובורר שפה כדי לשמור את השינוי פשוט ויציב. זה מצוין למשתמש, אבל אם המטרה בהמשך היא דירוג אורגני עצמאי באנגלית ובעברית, השלב הבא צריך להיות URLs נפרדים (`/he/...`, `/en/...`) ו-`hreflang`.
