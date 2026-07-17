-- Selectable, accessibility-reviewed color palettes for the Classic public theme.
alter table business_settings
  add column if not exists classic_palette text not null default 'ROSIN';

update business_settings
set classic_palette = 'ROSIN'
where classic_palette is null
   or classic_palette not in ('ROSIN','PLUM','OCEAN','SAGE','MIDNIGHT');

alter table business_settings
  drop constraint if exists business_settings_classic_palette_check;

alter table business_settings
  add constraint business_settings_classic_palette_check
  check (classic_palette in ('ROSIN','PLUM','OCEAN','SAGE','MIDNIGHT'));
