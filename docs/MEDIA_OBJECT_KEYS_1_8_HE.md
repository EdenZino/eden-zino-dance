# מדיה ב-v1.8 — Object Keys ו-Relative URLs

## כלל המערכת

R2 `object_key` הוא המקור הקנוני. Hostname לעולם אינו חלק מזהות הקובץ.

```text
object_key: media/2026/07/23/uuid-file.webp
public_url: /api/media/media/2026/07/23/uuid-file.webp
```

`public_url` נשאר בעמודת DB רק לצורך תאימות לאחור, אך הוא יחסי ומחושב מחדש מתוך `object_key` כאשר ה-API מחזיר Asset.

## למה זה פותר את בעיית הדומיין

אותו Relative URL עובד תחת:

```text
https://development.workers.dev/api/media/...
https://production.workers.dev/api/media/...
https://www.edenzino.com/api/media/...
```

בלי לשנות רשומה במסד.

## מה זה לא פותר

R2 Buckets הם אחסון נפרד. אם object key קיים ב-Production bucket ולא ב-Preview bucket, Development עדיין יחזיר 404. לכן נוספה בדיקת Integrity שמבצעת `MEDIA.head(object_key)` מול ה-Bucket המחובר כרגע.

## API

העלאה חדשה מחזירה:

```json
{
  "asset": {
    "object_key": "media/2026/07/23/...webp",
    "public_url": "/api/media/media/2026/07/23/...webp"
  }
}
```

השרת מנרמל גם URL היסטורי מהצורה:

```text
https://old-domain.example/api/media/...
```

ל:

```text
/api/media/...
```

כאשר נשמר תוכן חדש.
