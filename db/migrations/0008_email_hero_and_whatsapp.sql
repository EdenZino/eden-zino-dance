-- v1.6.0: styled email rollout, WhatsApp disabled by default, richer editable hero title.

update notification_jobs
set status='CANCELLED', last_error='WHATSAPP_DISABLED_BY_CONFIGURATION', processed_at=now()
where channel='WHATSAPP' and status in ('PENDING','PROCESSING','CONFIGURATION_ERROR');

update site_content
set value = coalesce(value,'{}'::jsonb)
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleTop') then jsonb_build_object('heroTitleTop','COME DANCE WITH') else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleMain') then jsonb_build_object('heroTitleMain','EDEN ZINO') else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleTopFont') then jsonb_build_object('heroTitleTopFont','BODY') else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleMainFont') then jsonb_build_object('heroTitleMainFont','DISPLAY') else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleTopSize') then jsonb_build_object('heroTitleTopSize','MEDIUM') else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleMainSize') then jsonb_build_object('heroTitleMainSize','XL') else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroTitleMainBold') then jsonb_build_object('heroTitleMainBold',true) else '{}'::jsonb end
  || case when not (coalesce(value,'{}'::jsonb) ? 'heroImageSource') then jsonb_build_object('heroImageSource','GALLERY') else '{}'::jsonb end,
  updated_at=now()
where key='home';
