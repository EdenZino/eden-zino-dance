-- Public Hebrew/English content, language-aware communication, and Eden Zino branding.

alter table registrations add column if not exists preferred_language text not null default 'he';
alter table registrations drop constraint if exists registrations_preferred_language_check;
alter table registrations add constraint registrations_preferred_language_check check (preferred_language in ('he','en'));

alter table waitlist_entries add column if not exists preferred_language text not null default 'he';
alter table waitlist_entries drop constraint if exists waitlist_entries_preferred_language_check;
alter table waitlist_entries add constraint waitlist_entries_preferred_language_check check (preferred_language in ('he','en'));

alter table commerce_orders add column if not exists preferred_language text not null default 'he';
alter table commerce_orders drop constraint if exists commerce_orders_preferred_language_check;
alter table commerce_orders add constraint commerce_orders_preferred_language_check check (preferred_language in ('he','en'));

alter table workshops add column if not exists title_en text;
alter table workshops add column if not exists short_description_en text;
alter table workshops add column if not exists full_description_en text;
alter table workshops add column if not exists location_name_en text;
alter table workshops add column if not exists location_address_en text;
alter table workshops add column if not exists level_en text;
alter table workshops add column if not exists audience_en text;
alter table workshops add column if not exists recurrence_label_en text;

alter table instructors add column if not exists name_en text;
alter table instructors add column if not exists bio_en text;

alter table workshop_fields add column if not exists label_en text;
alter table workshop_fields add column if not exists help_text_en text;
alter table workshop_fields add column if not exists options_en jsonb not null default '[]'::jsonb;

alter table legal_documents add column if not exists title_en text;
alter table legal_documents add column if not exists content_en text;

alter table membership_plans add column if not exists name_en text;
alter table membership_plans add column if not exists description_en text;
alter table pass_products add column if not exists name_en text;
alter table pass_products add column if not exists description_en text;

alter table gallery_items add column if not exists title_en text;
alter table gallery_items add column if not exists caption_en text;
alter table gallery_items add column if not exists alt_text_en text;

update business_settings
set business_name = 'Eden Zino', updated_at = now()
where singleton = true and (business_name is null or trim(business_name) = '' or business_name = 'Eden Zino Dance');

update site_content
set value = value || jsonb_build_object(
  'eyebrowEn', coalesce(nullif(value->>'eyebrowEn',''), 'MOVE · FEEL · GROW'),
  'heroTitleTopEn', coalesce(nullif(value->>'heroTitleTopEn',''), 'COME DANCE WITH'),
  'heroTitleMainEn', coalesce(nullif(value->>'heroTitleMainEn',''), 'EDEN ZINO'),
  'heroSubtitleEn', coalesce(nullif(value->>'heroSubtitleEn',''), 'Dance workshops built around technique, confidence and freedom of movement.'),
  'ctaPrimaryEn', coalesce(nullif(value->>'ctaPrimaryEn',''), 'Upcoming workshops'),
  'ctaSecondaryEn', coalesce(nullif(value->>'ctaSecondaryEn',''), 'I have a workshop code'),
  'announcementEn', coalesce(value->>'announcementEn','')
), updated_at = now()
where key = 'home';

update site_content
set value = value || jsonb_build_object(
  'nameEn', coalesce(nullif(value->>'nameEn',''), 'Eden Zino'),
  'headlineEn', coalesce(nullif(value->>'headlineEn',''), 'Instructor, creator and dancer'),
  'bioEn', coalesce(nullif(value->>'bioEn',''), 'Add Eden’s professional and personal background here from the admin area.'),
  'teachingApproachEn', coalesce(nullif(value->>'teachingApproachEn',''), 'Add Eden’s teaching approach, values and the experience students can expect here.')
), updated_at = now()
where key = 'instructor';
