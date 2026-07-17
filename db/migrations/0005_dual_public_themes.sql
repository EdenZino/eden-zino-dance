-- Public visual theme selection. Business logic and data remain shared.
alter table business_settings
  add column if not exists public_theme text not null default 'CLASSIC';

update business_settings
set public_theme = 'CLASSIC'
where public_theme is null or public_theme not in ('CLASSIC','MODERN');
