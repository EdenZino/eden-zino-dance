create extension if not exists pgcrypto;

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text not null,
  role text not null default 'ADMIN' check (role in ('OWNER','ADMIN','INSTRUCTOR','VIEW_ONLY')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_sessions_expiry on admin_sessions(expires_at);

create table if not exists business_settings (
  singleton boolean primary key default true check (singleton),
  business_name text not null default 'Eden Zino Dance',
  legal_business_name text not null default '',
  business_number text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  address text not null default '',
  instagram_url text not null default 'https://www.instagram.com/eden_zinooo/?hl=en',
  default_currency text not null default 'ILS',
  timezone text not null default 'Asia/Jerusalem',
  default_hold_minutes integer not null default 10 check (default_hold_minutes between 3 and 60),
  retention_months integer not null default 36 check (retention_months between 1 and 120),
  invoice_provider text not null default 'WEBHOOK',
  whatsapp_provider text not null default 'WEBHOOK',
  updated_at timestamptz not null default now()
);
insert into business_settings(singleton) values(true) on conflict do nothing;

create table if not exists site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into site_content(key, value) values
('home', jsonb_build_object(
  'eyebrow','MOVE. FEEL. GROW.',
  'heroTitle','לרקוד בביטחון. להשתחרר באמת.',
  'heroSubtitle','סדנאות ריקוד מקצועיות, אנרגטיות ומדויקות בהנחיית עדן זינו.',
  'heroImage','',
  'ctaPrimary','לסדנאות הקרובות',
  'ctaSecondary','יש לי קוד סדנה',
  'announcement','',
  'testimonials', jsonb_build_array(),
  'faq', jsonb_build_array()
)),
('instructor', jsonb_build_object(
  'name','עדן זינו',
  'nameEnglish','Eden Zino',
  'headline','מדריכה, יוצרת ורקדנית',
  'bio','הוסיפי כאן דרך ממשק הניהול את הרקע המקצועי והאישי של עדן.',
  'teachingApproach','הוסיפי כאן את שיטת הלימוד, הערכים והחוויה שהתלמידים מקבלים.',
  'portraitUrl','',
  'gallery',jsonb_build_array(),
  'instagramUrl','https://www.instagram.com/eden_zinooo/?hl=en'
)),
('legal', jsonb_build_object(
  'privacySummary','השלימי נוסח פרטיות מאושר לפני מעבר לייצור.',
  'cancellationSummary','השלימי מדיניות ביטולים מאושרת לפני מעבר לייצור.',
  'accessibilityContact',''
))
on conflict (key) do nothing;

create table if not exists legal_documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('TERMS','PRIVACY','CANCELLATION','ACCESSIBILITY')),
  version text not null,
  title text not null,
  content text not null,
  is_active boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(type, version)
);

create table if not exists instructors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bio text not null default '',
  image_url text not null default '',
  instagram_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workshops (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  slug text not null unique,
  title text not null,
  short_description text not null default '',
  full_description text not null default '',
  image_url text not null default '',
  gallery jsonb not null default '[]'::jsonb,
  location_name text not null default '',
  location_address text not null default '',
  map_url text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  capacity integer not null check (capacity > 0),
  min_participants integer not null default 1 check (min_participants > 0),
  max_participants_per_order integer not null default 1 check (max_participants_per_order between 1 and 10),
  price_agorot integer not null check (price_agorot >= 0),
  early_bird_price_agorot integer check (early_bird_price_agorot >= 0),
  early_bird_ends_at timestamptz,
  deposit_agorot integer check (deposit_agorot >= 0),
  currency text not null default 'ILS',
  level text not null default '',
  audience text not null default '',
  minimum_age integer,
  allow_waitlist boolean not null default true,
  allow_coupons boolean not null default true,
  allow_transfers boolean not null default true,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','FULL','CLOSED','CANCELLED','COMPLETED')),
  cancellation_policy_version text not null default '',
  terms_version text not null default '',
  privacy_version text not null default '',
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_workshops_date_status on workshops(starts_at, status);

create table if not exists workshop_instructors (
  workshop_id uuid not null references workshops(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  primary key(workshop_id, instructor_id)
);

create table if not exists workshop_fields (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  field_key text not null,
  field_type text not null check (field_type in ('TEXT','TEXTAREA','SELECT','MULTISELECT','CHECKBOX','NUMBER','DATE')),
  label text not null,
  help_text text not null default '',
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  display_order integer not null default 0,
  unique(workshop_id, field_key)
);

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null default '',
  discount_type text not null check (discount_type in ('PERCENT','FIXED')),
  discount_value integer not null check (discount_value > 0),
  max_redemptions integer,
  per_email_limit integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_amount_agorot integer not null default 0,
  workshop_id uuid references workshops(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  registration_code text not null unique,
  workshop_id uuid not null references workshops(id) on delete restrict,
  status text not null check (status in ('SEAT_HELD','PENDING_PAYMENT','PAID','PAYMENT_FAILED','EXPIRED','WAITLIST','CANCELLED','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED','TRANSFERRED','CHECKED_IN','NO_SHOW')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  notes text not null default '',
  guardian jsonb not null default '{}'::jsonb,
  custom_answers jsonb not null default '{}'::jsonb,
  participant_count integer not null default 1,
  unit_price_agorot integer not null,
  subtotal_agorot integer not null,
  discount_agorot integer not null default 0,
  amount_agorot integer not null,
  amount_paid_agorot integer not null default 0,
  coupon_id uuid references coupons(id) on delete set null,
  hold_expires_at timestamptz,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  accepted_terms_version text not null,
  accepted_privacy_version text not null,
  accepted_cancellation_version text not null,
  accepted_at timestamptz not null default now(),
  payment_due_type text not null default 'FULL' check (payment_due_type in ('FULL','DEPOSIT')),
  source text not null default 'WEB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_registrations_workshop_status on registrations(workshop_id, status);
create index if not exists idx_registrations_email on registrations(lower(email));
create index if not exists idx_registrations_hold on registrations(hold_expires_at) where status in ('SEAT_HELD','PENDING_PAYMENT');

create table if not exists registration_participants (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_year integer,
  experience_level text not null default '',
  partner_name text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete restrict,
  provider text not null,
  provider_session_id text,
  provider_transaction_id text,
  status text not null check (status in ('CREATED','PENDING','SUCCEEDED','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED')),
  amount_agorot integer not null,
  currency text not null default 'ILS',
  payment_method text,
  confirmation_code text,
  raw_response jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_transaction_id)
);
create index if not exists idx_payments_registration on payments(registration_id);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete restrict,
  payment_id uuid references payments(id) on delete set null,
  amount_agorot integer not null check (amount_agorot > 0),
  reason text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED','MANUAL_ACTION_REQUIRED','PROCESSING','SUCCEEDED','FAILED')),
  provider_refund_id text,
  requested_by uuid references admins(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_response jsonb not null default '{}'::jsonb
);

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  registration_id uuid not null unique references registrations(id) on delete cascade,
  email text not null,
  amount_agorot integer not null,
  redeemed_at timestamptz not null default now()
);

create table if not exists waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  participant_count integer not null default 1,
  status text not null default 'WAITING' check (status in ('WAITING','INVITED','REGISTERED','EXPIRED','CANCELLED')),
  invite_token text unique,
  invited_at timestamptz,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workshop_id, email)
);

create table if not exists membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_agorot integer not null,
  billing_interval text not null check (billing_interval in ('MONTHLY','QUARTERLY','YEARLY')),
  included_credits integer not null default 0,
  discount_percent integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references membership_plans(id) on delete restrict,
  email text not null,
  full_name text not null,
  phone text not null,
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED')),
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  credits_remaining integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pass_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  credits integer not null check (credits > 0),
  price_agorot integer not null check (price_agorot >= 0),
  validity_days integer not null default 180,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists passes (
  id uuid primary key default gen_random_uuid(),
  pass_code text not null unique,
  product_id uuid not null references pass_products(id) on delete restrict,
  email text not null,
  full_name text not null,
  credits_total integer not null,
  credits_remaining integer not null,
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','EXHAUSTED','EXPIRED','CANCELLED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists pass_usages (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references passes(id) on delete restrict,
  registration_id uuid not null unique references registrations(id) on delete restrict,
  credits_used integer not null default 1,
  used_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references registrations(id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references admins(id) on delete set null,
  notes text not null default ''
);

create table if not exists uploaded_assets (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique,
  public_url text not null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  admin_id uuid references admins(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_created on audit_logs(created_at desc);

create table if not exists notification_jobs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id) on delete cascade,
  channel text not null check (channel in ('EMAIL','WHATSAPP','INVOICE')),
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  scheduled_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_jobs_pending on notification_jobs(status, scheduled_at);

create or replace function public.make_code(prefix text, code_length integer default 6)
returns text language plpgsql as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := coalesce(prefix,''); i integer;
begin
  for i in 1..code_length loop
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return result;
end; $$;

create or replace function public.reserve_registration(
  p_workshop_code text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_participants jsonb,
  p_coupon_code text,
  p_marketing_consent boolean,
  p_guardian jsonb,
  p_custom_answers jsonb,
  p_terms_version text,
  p_privacy_version text,
  p_cancellation_version text,
  p_payment_due_type text default 'FULL'
) returns table(registration_id uuid, registration_code text, amount_agorot integer, hold_expires_at timestamptz, workshop_title text)
language plpgsql security definer as $$
declare
  w workshops%rowtype;
  participant_total integer;
  occupied integer;
  unit_price integer;
  subtotal integer;
  discount integer := 0;
  final_amount integer;
  c coupons%rowtype;
  reg_id uuid;
  reg_code text;
  hold_until timestamptz;
  item jsonb;
  settings business_settings%rowtype;
begin
  select * into settings from business_settings where singleton = true;
  select * into w from workshops where upper(public_code) = upper(trim(p_workshop_code)) for update;
  if not found then raise exception 'WORKSHOP_NOT_FOUND'; end if;
  if w.status not in ('PUBLISHED','FULL') then raise exception 'WORKSHOP_NOT_OPEN'; end if;
  if w.registration_opens_at is not null and now() < w.registration_opens_at then raise exception 'REGISTRATION_NOT_OPEN'; end if;
  if w.registration_closes_at is not null and now() >= w.registration_closes_at then raise exception 'REGISTRATION_CLOSED'; end if;

  participant_total := greatest(1, coalesce(jsonb_array_length(p_participants), 0));
  if participant_total > w.max_participants_per_order then raise exception 'TOO_MANY_PARTICIPANTS'; end if;

  select coalesce(sum(participant_count),0)::integer into occupied
  from registrations
  where workshop_id = w.id and (
    status in ('PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
    (status in ('SEAT_HELD','PENDING_PAYMENT') and hold_expires_at > now())
  );
  if occupied + participant_total > w.capacity then raise exception 'WORKSHOP_FULL'; end if;

  unit_price := case when w.early_bird_price_agorot is not null and w.early_bird_ends_at is not null and now() < w.early_bird_ends_at
                     then w.early_bird_price_agorot else w.price_agorot end;
  subtotal := unit_price * participant_total;

  if p_coupon_code is not null and trim(p_coupon_code) <> '' and w.allow_coupons then
    select * into c from coupons
      where upper(code) = upper(trim(p_coupon_code)) and is_active = true
        and (workshop_id is null or workshop_id = w.id)
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
      for update;
    if found then
      if c.minimum_amount_agorot <= subtotal
         and (c.max_redemptions is null or (select count(*) from coupon_redemptions where coupon_id = c.id) < c.max_redemptions)
         and (select count(*) from coupon_redemptions where coupon_id = c.id and lower(email) = lower(p_email)) < c.per_email_limit then
        discount := case when c.discount_type = 'PERCENT' then floor(subtotal * least(c.discount_value,100) / 100.0)::integer
                         else least(c.discount_value, subtotal) end;
      end if;
    end if;
  end if;

  final_amount := greatest(0, subtotal - discount);
  if p_payment_due_type = 'DEPOSIT' and w.deposit_agorot is not null then final_amount := least(final_amount, w.deposit_agorot * participant_total); end if;
  hold_until := now() + make_interval(mins => coalesce(settings.default_hold_minutes,10));
  reg_code := make_code('EZ-', 7);

  insert into registrations(
    registration_code, workshop_id, status, first_name, last_name, email, phone, notes, guardian, custom_answers,
    participant_count, unit_price_agorot, subtotal_agorot, discount_agorot, amount_agorot, coupon_id, hold_expires_at,
    marketing_consent, marketing_consent_at, accepted_terms_version, accepted_privacy_version, accepted_cancellation_version,
    payment_due_type
  ) values (
    reg_code, w.id, case when final_amount = 0 then 'PAID' else 'SEAT_HELD' end,
    trim(p_first_name), trim(p_last_name), lower(trim(p_email)), trim(p_phone), coalesce(p_notes,''), coalesce(p_guardian,'{}'), coalesce(p_custom_answers,'{}'),
    participant_total, unit_price, subtotal, discount, final_amount, case when c.id is not null and discount > 0 then c.id else null end,
    case when final_amount = 0 then null else hold_until end,
    coalesce(p_marketing_consent,false), case when p_marketing_consent then now() else null end,
    p_terms_version, p_privacy_version, p_cancellation_version, p_payment_due_type
  ) returning id into reg_id;

  if jsonb_array_length(coalesce(p_participants,'[]')) = 0 then
    insert into registration_participants(registration_id, first_name, last_name)
    values(reg_id, trim(p_first_name), trim(p_last_name));
  else
    for item in select * from jsonb_array_elements(p_participants) loop
      insert into registration_participants(registration_id, first_name, last_name, birth_year, experience_level, partner_name, metadata)
      values(reg_id, coalesce(item->>'firstName', p_first_name), coalesce(item->>'lastName', p_last_name),
             nullif(item->>'birthYear','')::integer, coalesce(item->>'experienceLevel',''), coalesce(item->>'partnerName',''), item);
    end loop;
  end if;

  if final_amount = 0 and c.id is not null and discount > 0 then
    insert into coupon_redemptions(coupon_id, registration_id, email, amount_agorot)
    values(c.id, reg_id, lower(trim(p_email)), discount) on conflict do nothing;
  end if;

  return query select reg_id, reg_code, final_amount, case when final_amount = 0 then null else hold_until end, w.title;
end; $$;

create or replace function public.confirm_payment(
  p_registration_id uuid,
  p_provider text,
  p_transaction_id text,
  p_amount_agorot integer,
  p_confirmation_code text,
  p_method text,
  p_raw jsonb
) returns boolean language plpgsql security definer as $$
declare r registrations%rowtype; existing uuid;
begin
  select id into existing from payments where provider = p_provider and provider_transaction_id = p_transaction_id;
  if found then return true; end if;
  select * into r from registrations where id = p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if p_amount_agorot <> r.amount_agorot then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if r.status in ('CANCELLED','REFUNDED','EXPIRED') then raise exception 'REGISTRATION_NOT_PAYABLE'; end if;
  insert into payments(registration_id, provider, provider_transaction_id, status, amount_agorot, payment_method, confirmation_code, raw_response, paid_at)
  values(r.id, p_provider, p_transaction_id, 'SUCCEEDED', p_amount_agorot, p_method, p_confirmation_code, coalesce(p_raw,'{}'), now());
  update registrations set status = 'PAID', amount_paid_agorot = p_amount_agorot, hold_expires_at = null, updated_at = now() where id = r.id;
  if r.coupon_id is not null and r.discount_agorot > 0 then
    insert into coupon_redemptions(coupon_id, registration_id, email, amount_agorot)
    values(r.coupon_id, r.id, r.email, r.discount_agorot) on conflict do nothing;
  end if;
  insert into notification_jobs(registration_id, channel, template_key, payload)
  values(r.id,'EMAIL','REGISTRATION_CONFIRMED',jsonb_build_object('registrationId',r.id)),
        (r.id,'WHATSAPP','REGISTRATION_CONFIRMED',jsonb_build_object('registrationId',r.id)),
        (r.id,'INVOICE','PAYMENT_SUCCEEDED',jsonb_build_object('registrationId',r.id));
  return true;
end; $$;

create or replace function public.expire_registration_holds()
returns integer language plpgsql security definer as $$
declare changed integer;
begin
  update registrations set status='EXPIRED', updated_at=now()
  where status in ('SEAT_HELD','PENDING_PAYMENT') and hold_expires_at <= now();
  get diagnostics changed = row_count;
  delete from admin_sessions where expires_at <= now();
  return changed;
end; $$;

create or replace view workshop_availability as
select w.id, w.public_code, w.capacity,
  coalesce(sum(r.participant_count) filter (where r.status in ('PAID','CHECKED_IN','PARTIALLY_REFUNDED') or (r.status in ('SEAT_HELD','PENDING_PAYMENT') and r.hold_expires_at > now())),0)::integer as occupied,
  greatest(0, w.capacity - coalesce(sum(r.participant_count) filter (where r.status in ('PAID','CHECKED_IN','PARTIALLY_REFUNDED') or (r.status in ('SEAT_HELD','PENDING_PAYMENT') and r.hold_expires_at > now())),0))::integer as available
from workshops w left join registrations r on r.workshop_id = w.id
group by w.id;
