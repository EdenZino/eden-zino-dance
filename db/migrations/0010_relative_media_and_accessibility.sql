-- Canonical R2 object keys, relative media URLs, and workshop accessibility metadata.

-- Uploaded media is canonical by object_key. public_url is retained for backwards
-- compatibility but is rewritten to a host-independent relative URL.
update uploaded_assets
set public_url = '/api/media/' || object_key
where object_key is not null and trim(object_key) <> '';

-- Rewrite historical absolute media URLs stored directly on entities.
update workshops
set image_url = regexp_replace(image_url, '^https?://[^/]+', '')
where image_url ~ '^https?://[^/]+/api/media/';

update instructors
set image_url = regexp_replace(image_url, '^https?://[^/]+', '')
where image_url ~ '^https?://[^/]+/api/media/';

update site_content
set value = jsonb_set(value, '{heroImage}', to_jsonb(regexp_replace(value->>'heroImage', '^https?://[^/]+', '')), true), updated_at = now()
where key='home' and coalesce(value->>'heroImage','') ~ '^https?://[^/]+/api/media/';

update site_content
set value = jsonb_set(value, '{portraitUrl}', to_jsonb(regexp_replace(value->>'portraitUrl', '^https?://[^/]+', '')), true), updated_at = now()
where key='instructor' and coalesce(value->>'portraitUrl','') ~ '^https?://[^/]+/api/media/';

-- Rewrite legacy workshop gallery URL arrays while preserving non-media values.
update workshops w
set gallery = coalesce((
  select jsonb_agg(
    case
      when jsonb_typeof(item)='string' and trim(both '"' from item::text) ~ '^https?://[^/]+/api/media/'
        then to_jsonb(regexp_replace(trim(both '"' from item::text), '^https?://[^/]+', ''))
      else item
    end
  )
  from jsonb_array_elements(w.gallery) item
), '[]'::jsonb)
where jsonb_typeof(w.gallery)='array';

-- Accessibility contact details are editable in business settings and are used to
-- replace the placeholders in the public accessibility statement. Empty values
-- deliberately keep the placeholders visible until the business completes them.
alter table business_settings add column if not exists accessibility_contact_name text not null default '';
alter table business_settings add column if not exists accessibility_email text not null default '';
alter table business_settings add column if not exists accessibility_phone text not null default '';
alter table business_settings add column if not exists mailing_address text not null default '';
alter table business_settings add column if not exists mailing_address_en text not null default '';
alter table business_settings add column if not exists accessibility_known_limitations text not null default '';
alter table business_settings add column if not exists accessibility_known_limitations_en text not null default '';

-- Workshop accessibility information. UNKNOWN is deliberate: never claim a venue
-- is accessible before its details have been verified.
alter table workshops add column if not exists accessibility_entrance text not null default 'UNKNOWN';
alter table workshops add column if not exists accessibility_elevator text not null default 'UNKNOWN';
alter table workshops add column if not exists accessibility_restroom text not null default 'UNKNOWN';
alter table workshops add column if not exists accessibility_parking text not null default 'UNKNOWN';
alter table workshops add column if not exists accessibility_passages text not null default '';
alter table workshops add column if not exists accessibility_passages_en text;
alter table workshops add column if not exists accessibility_notes text not null default '';
alter table workshops add column if not exists accessibility_notes_en text;
alter table workshops add column if not exists accessibility_verified_at timestamptz;
alter table workshops add column if not exists accessibility_source text not null default '';

alter table workshops drop constraint if exists workshops_accessibility_entrance_check;
alter table workshops add constraint workshops_accessibility_entrance_check check (accessibility_entrance in ('UNKNOWN','YES','NO','NOT_APPLICABLE'));
alter table workshops drop constraint if exists workshops_accessibility_elevator_check;
alter table workshops add constraint workshops_accessibility_elevator_check check (accessibility_elevator in ('UNKNOWN','YES','NO','NOT_APPLICABLE'));
alter table workshops drop constraint if exists workshops_accessibility_restroom_check;
alter table workshops add constraint workshops_accessibility_restroom_check check (accessibility_restroom in ('UNKNOWN','YES','NO','NOT_APPLICABLE'));
alter table workshops drop constraint if exists workshops_accessibility_parking_check;
alter table workshops add constraint workshops_accessibility_parking_check check (accessibility_parking in ('UNKNOWN','YES','NO','NOT_APPLICABLE'));

-- Accessibility statement supplied by the business. It intentionally does not
-- claim a professional accessibility certification.
insert into legal_documents(type,version,title,title_en,content,content_en,is_active,published_at)
values(
  'ACCESSIBILITY',
  '2026-07-17',
  'הצהרת נגישות',
  'Accessibility Statement',
  $he$
## מחויבות לנגישות

`עדן זינו`, המפעילה את `Eden Zino (עדן זינו)`, פועלת לאפשר לאנשים עם מוגבלות לקבל שירות שוויוני, מכבד, עצמאי ובטוח, באתר ובפעילויות שהיא מפעילה.

## נגישות האתר

האתר נבנה מתוך מטרה לאפשר שימוש נוח גם לאנשים עם מוגבלות ובהתאם לעקרונות ת״י 5568 ורמת AA, ככל שהם חלים על העסק. נכון למועד נוסח זה טרם נמסר אישור על בדיקת נגישות מקצועית מלאה, ולכן אין לראות בהצהרה זו אישור או תו תקן. בין ההתאמות שנכללו בתכנון האתר:

- מבנה כותרות וסדר תוכן ברור.
- אפשרות ניווט באמצעות מקלדת.
- תוויות לשדות טופס והודעות שגיאה טקסטואליות.
- ניגודיות צבעים ויכולת הגדלת תצוגה באמצעות הדפדפן.
- טקסט חלופי לתמונות תוכן, כאשר הוזן במערכת.
- התאמה למסכים ניידים.
- שימוש בקישורים וכפתורים בעלי שמות ברורים.
- הימנעות מהסתמכות בלעדית על צבע להעברת מידע.

**הצהרה זו אינה טענה שהאתר עבר בדיקת נגישות מקצועית מלאה, אלא אם אכן נערכה בדיקה ותוצאותיה תועדו.** לאחר בדיקה מקצועית יש לעדכן כאן את מועד הבדיקה, הדפדפנים והטכנולוגיות המסייעות שנבדקו.

## נגישות הסדנאות והמקומות

הסדנאות עשויות להתקיים במקומות שונים. בעמוד כל סדנה יפורסמו פרטי נגישות שנמסרו למפעילה, כגון כניסה נגישה, מעלית, שירותים נגישים, חניה נגישה ומגבלות ידועות.

אדם הזקוק להתאמה מסוימת מתבקש לפנות מראש. המפעילה תבדוק את הבקשה עם מפעיל המקום ותעשה מאמץ סביר לספק התאמה מתאימה, בכפוף לאופי הפעילות, בטיחות והוראות הדין.

## נגישות מקום הפעילות

הפעילויות מתקיימות במיקומים משתנים בתל אביב-יפו ולעיתים במקומות אחרים. פרטי הנגישות אינם אחידים בין המקומות. בעמוד כל סדנה יש לפרסם, לאחר בירור מול בעל המקום, מידע בדבר כניסה ללא מדרגות, מעלית, רוחב מעברים, שירותים נגישים, חניה נגישה ומגבלות ידועות. משתתף הזקוק להתאמה מתבקש לפנות מראש; עדן זינו תבדוק התאמה סבירה מול המקום, אך אין להצהיר שמקום מסוים נגיש לפני שהמידע אומת.

## פנייה בנושא נגישות

אם נתקלתם בקושי באתר, אם מידע אינו נגיש, או אם נדרשת התאמה להשתתפות בסדנה, ניתן לפנות אל:

- איש/אשת קשר: `[[שם איש/אשת קשר לנגישות]]`
- דוא״ל: `[[דוא״ל נגישות]]`
- טלפון: `[[טלפון נגישות]]`
- כתובת: `תל אביב-יפו. הפעילויות מתקיימות במיקומים משתנים, והכתובת המדויקת של כל פעילות מפורסמת בעמוד הסדנה. כתובת מלאה למשלוח דואר רשום: [[יש להשלים כתובת למשלוח דואר]]`

בפנייה מומלץ לציין:

- תיאור הקושי.
- העמוד או הסדנה הרלוונטיים.
- המכשיר והדפדפן שבהם נעשה שימוש.
- ההתאמה המבוקשת ודרך מועדפת לקבלת מענה.

המפעילה תעשה מאמץ להשיב בתוך זמן סביר ולספק פתרון נגיש חלופי כאשר הדבר אפשרי.

## מגבלות ידועות

`[[יש לפרט כאן מגבלות נגישות ידועות בפועל. אם אין מידע — אין לכתוב "אין מגבלות" לפני בדיקה.]]`

עודכן לאחרונה: `17.07.2026`
$he$,
  $en$
## Commitment to accessibility

Eden Zino, operator of Eden Zino, works to provide people with disabilities with equal, respectful, independent and safe access to the website and to the activities she operates.

## Website accessibility

The website was designed to support comfortable use by people with disabilities and with the principles of Israeli Standard 5568 and AA level, insofar as they apply to the business. As of this statement, no confirmation of a complete professional accessibility audit has been provided, so this statement must not be treated as a certification or accessibility seal.

The design includes, among other things, a clear heading structure and content order, keyboard navigation, form labels and textual error messages, sufficient color contrast, browser zoom support, alternative text for content images when entered in the system, responsive layouts, clearly named links and buttons, and avoiding reliance on color alone to convey information.

This statement does not claim that the website has passed a complete professional accessibility audit unless such an audit has actually been performed and documented. After a professional audit, the audit date, tested browsers and tested assistive technologies should be added here.

## Workshop and venue accessibility

Workshops may take place at different venues. Each workshop page will publish accessibility information provided to the operator, such as step-free entrance, elevator availability, accessible toilets, accessible parking and known limitations.

A participant who needs a specific accommodation is asked to contact the operator in advance. Eden Zino will check the request with the venue operator and make a reasonable effort to provide an appropriate accommodation, subject to the nature of the activity, safety and applicable law.

## Activity venues

Activities take place at changing locations in Tel Aviv-Yafo and occasionally elsewhere. Accessibility details are not uniform between venues. After checking with the venue owner, each workshop page should publish information about step-free access, elevator, passage widths, accessible toilets, accessible parking and known limitations. No venue should be described as accessible before the information has been verified.

## Accessibility contact

If you encounter a difficulty on the website, information that is not accessible, or need an accommodation in order to participate in a workshop, please contact:

- Accessibility contact: `[[accessibility contact name]]`
- Email: `[[accessibility email]]`
- Phone: `[[accessibility phone]]`
- Address: `Tel Aviv-Yafo. Activities take place at changing locations and each activity page lists its exact venue. Registered-mail address: [[complete mailing address]]`

When contacting us, it is helpful to include a description of the difficulty, the relevant page or workshop, the device and browser used, the requested accommodation and the preferred way to receive a response.

The operator will make a reasonable effort to reply within a reasonable time and provide an accessible alternative when possible.

## Known limitations

`[[List actual known accessibility limitations here. If no information is available, do not state that there are no limitations before an audit.]]`

Last updated: `17 July 2026`
$en$,
  true,
  now()
)
on conflict(type,version) do update set
  title=excluded.title,title_en=excluded.title_en,content=excluded.content,content_en=excluded.content_en,is_active=true,published_at=coalesce(legal_documents.published_at,excluded.published_at);

-- Keep only this statement active for accessibility.
update legal_documents set is_active=false where type='ACCESSIBILITY' and version<>'2026-07-17';
