-- Extended commerce, recurring workshops, customer portal, passes, memberships and privacy operations.

create table if not exists workshop_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  frequency text not null default 'CUSTOM' check (frequency in ('WEEKLY','BIWEEKLY','MONTHLY','CUSTOM')),
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workshops add column if not exists series_id uuid references workshop_series(id) on delete set null;
alter table workshops add column if not exists recurrence_label text not null default '';
alter table workshops add column if not exists max_registrations_per_phone integer not null default 2;
alter table workshops add column if not exists balance_due_days_before integer not null default 0;
alter table workshops add column if not exists is_private boolean not null default false;
alter table workshops add column if not exists required_pass_credits integer not null default 1;

alter table workshop_instructors add column if not exists revenue_share_percent numeric(5,2) not null default 100.00;

alter table memberships add column if not exists membership_code text;
alter table memberships add column if not exists billing_mode text not null default 'MANUAL_RENEWAL' check (billing_mode in ('MANUAL_RENEWAL','PROVIDER_STO'));
alter table memberships add column if not exists next_billing_at timestamptz;
alter table memberships add column if not exists auto_renew boolean not null default false;
create unique index if not exists idx_memberships_code on memberships(membership_code) where membership_code is not null;
create unique index if not exists idx_memberships_provider_subscription on memberships(provider_subscription_id) where provider_subscription_id is not null;

create table if not exists membership_usages (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete restrict,
  registration_id uuid not null unique references registrations(id) on delete restrict,
  credits_used integer not null default 1,
  used_at timestamptz not null default now()
);

alter table registrations add column if not exists total_amount_agorot integer not null default 0;
alter table registrations add column if not exists balance_due_at timestamptz;
alter table registrations add column if not exists phone_normalized text not null default '';
alter table registrations add column if not exists source_pass_id uuid references passes(id) on delete set null;
alter table registrations add column if not exists source_membership_id uuid references memberships(id) on delete set null;
alter table registrations drop constraint if exists registrations_status_check;
alter table registrations add constraint registrations_status_check check (status in ('SEAT_HELD','PENDING_PAYMENT','DEPOSIT_PAID','PAID','PAYMENT_FAILED','EXPIRED','WAITLIST','CANCELLED','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED','TRANSFERRED','CHECKED_IN','NO_SHOW'));
update registrations set total_amount_agorot = greatest(amount_agorot, subtotal_agorot-discount_agorot) where total_amount_agorot=0;

create table if not exists commerce_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  order_type text not null check (order_type in ('PASS_PURCHASE','MEMBERSHIP_PURCHASE','MEMBERSHIP_RENEWAL')),
  pass_product_id uuid references pass_products(id) on delete restrict,
  membership_plan_id uuid references membership_plans(id) on delete restrict,
  membership_id uuid references memberships(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  amount_agorot integer not null check (amount_agorot >= 0),
  currency text not null default 'ILS',
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT','PAID','FAILED','CANCELLED','REFUNDED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((order_type='PASS_PURCHASE' and pass_product_id is not null) or
         (order_type='MEMBERSHIP_PURCHASE' and membership_plan_id is not null) or
         (order_type='MEMBERSHIP_RENEWAL' and membership_id is not null))
);

alter table payments alter column registration_id drop not null;
alter table payments add column if not exists order_id uuid references commerce_orders(id) on delete restrict;
alter table payments add column if not exists checkout_code text;
alter table payments add column if not exists purpose text not null default 'WORKSHOP_FULL' check (purpose in ('WORKSHOP_FULL','WORKSHOP_DEPOSIT','WORKSHOP_BALANCE','PASS_PURCHASE','MEMBERSHIP_PURCHASE','MEMBERSHIP_RENEWAL'));
create unique index if not exists idx_payments_checkout_code on payments(checkout_code) where checkout_code is not null;
alter table payments drop constraint if exists payments_registration_or_order_check;
alter table payments add constraint payments_registration_or_order_check check ((registration_id is not null)::int + (order_id is not null)::int = 1);

alter table waitlist_entries add column if not exists registration_id uuid references registrations(id) on delete set null;

alter table notification_jobs add column if not exists order_id uuid references commerce_orders(id) on delete cascade;


create table if not exists cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references registrations(id) on delete restrict,
  email text not null,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN','APPROVED','REJECTED','COMPLETED')),
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  request_type text not null check (request_type in ('ACCESS','CORRECTION','DELETION','MARKETING_OPT_OUT')),
  details text not null default '',
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETED','REJECTED')),
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create or replace function public.normalize_phone(value text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(value,''), '[^0-9]', '', 'g');
$$;

-- Replace the original reservation function with an extended version.
drop function if exists public.reserve_registration(text,text,text,text,text,text,jsonb,text,boolean,jsonb,jsonb,text,text,text,text);

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
  p_payment_due_type text default 'FULL',
  p_pass_code text default null,
  p_membership_code text default null,
  p_hold_minutes integer default null
) returns table(
  registration_id uuid,
  registration_code text,
  amount_agorot integer,
  total_amount_agorot integer,
  hold_expires_at timestamptz,
  workshop_title text,
  registration_status text
)
language plpgsql security definer as $$
declare
  w workshops%rowtype;
  participant_total integer;
  occupied integer;
  phone_occupied integer;
  unit_price integer;
  subtotal integer;
  discount integer := 0;
  total_amount integer;
  charge_now integer;
  c coupons%rowtype;
  selected_pass passes%rowtype;
  selected_membership memberships%rowtype;
  credits_needed integer;
  reg_id uuid;
  reg_code text;
  hold_until timestamptz;
  item jsonb;
  settings business_settings%rowtype;
  reg_status text;
begin
  select * into settings from business_settings where singleton = true;
  select * into w from workshops where upper(public_code) = upper(trim(p_workshop_code)) for update;
  if not found then raise exception 'WORKSHOP_NOT_FOUND'; end if;
  if w.status not in ('PUBLISHED','FULL') then raise exception 'WORKSHOP_NOT_OPEN'; end if;
  if w.registration_opens_at is not null and now() < w.registration_opens_at then raise exception 'REGISTRATION_NOT_OPEN'; end if;
  if w.registration_closes_at is not null and now() >= w.registration_closes_at then raise exception 'REGISTRATION_CLOSED'; end if;

  participant_total := greatest(1, coalesce(jsonb_array_length(p_participants), 0));
  if participant_total > w.max_participants_per_order then raise exception 'TOO_MANY_PARTICIPANTS'; end if;

  select coalesce(sum(r.participant_count),0)::integer into occupied
  from registrations r
  where r.workshop_id = w.id and (
    r.status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
    (r.status in ('SEAT_HELD','PENDING_PAYMENT') and r.hold_expires_at > now())
  );
  if occupied + participant_total > w.capacity then raise exception 'WORKSHOP_FULL'; end if;

  select coalesce(sum(r.participant_count),0)::integer into phone_occupied
  from registrations r
  where r.workshop_id=w.id and r.phone_normalized=normalize_phone(p_phone)
    and (r.status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
         (r.status in ('SEAT_HELD','PENDING_PAYMENT') and r.hold_expires_at>now()));
  if phone_occupied + participant_total > w.max_registrations_per_phone then raise exception 'PHONE_REGISTRATION_LIMIT'; end if;

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

  total_amount := greatest(0, subtotal-discount);
  credits_needed := greatest(1,w.required_pass_credits) * participant_total;

  if p_pass_code is not null and trim(p_pass_code)<>'' then
    select * into selected_pass from passes
      where upper(pass_code)=upper(trim(p_pass_code)) and lower(email)=lower(trim(p_email))
        and status='ACTIVE' and expires_at>now() and credits_remaining>=credits_needed
      for update;
    if not found then raise exception 'PASS_NOT_VALID'; end if;
  elsif p_membership_code is not null and trim(p_membership_code)<>'' then
    select * into selected_membership from memberships
      where upper(membership_code)=upper(trim(p_membership_code)) and lower(email)=lower(trim(p_email))
        and status='ACTIVE' and (current_period_end is null or current_period_end>now()) and credits_remaining>=credits_needed
      for update;
    if not found then raise exception 'MEMBERSHIP_NOT_VALID'; end if;
  end if;

  if selected_pass.id is not null or selected_membership.id is not null then
    charge_now := 0;
  elsif p_payment_due_type='DEPOSIT' and w.deposit_agorot is not null then
    charge_now := least(total_amount, w.deposit_agorot*participant_total);
  else
    charge_now := total_amount;
  end if;

  hold_until := now() + make_interval(mins => coalesce(p_hold_minutes,settings.default_hold_minutes,10));
  reg_code := make_code('EZ-',7);
  reg_status := case when charge_now=0 then 'PAID' else 'SEAT_HELD' end;

  insert into registrations(
    registration_code,workshop_id,status,first_name,last_name,email,phone,phone_normalized,notes,guardian,custom_answers,
    participant_count,unit_price_agorot,subtotal_agorot,discount_agorot,total_amount_agorot,amount_agorot,amount_paid_agorot,
    coupon_id,hold_expires_at,marketing_consent,marketing_consent_at,accepted_terms_version,accepted_privacy_version,
    accepted_cancellation_version,payment_due_type,balance_due_at,source_pass_id,source_membership_id
  ) values (
    reg_code,w.id,reg_status,trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_phone),normalize_phone(p_phone),coalesce(p_notes,''),coalesce(p_guardian,'{}'),coalesce(p_custom_answers,'{}'),
    participant_total,unit_price,subtotal,discount,total_amount,charge_now,0,case when c.id is not null and discount>0 then c.id else null end,
    case when charge_now=0 then null else hold_until end,coalesce(p_marketing_consent,false),case when p_marketing_consent then now() else null end,
    p_terms_version,p_privacy_version,p_cancellation_version,p_payment_due_type,
    case when w.balance_due_days_before>0 then w.starts_at-make_interval(days=>w.balance_due_days_before) else null end,
    selected_pass.id,selected_membership.id
  ) returning id into reg_id;

  if jsonb_array_length(coalesce(p_participants,'[]'))=0 then
    insert into registration_participants(registration_id,first_name,last_name) values(reg_id,trim(p_first_name),trim(p_last_name));
  else
    for item in select * from jsonb_array_elements(p_participants) loop
      insert into registration_participants(registration_id,first_name,last_name,birth_year,experience_level,partner_name,metadata)
      values(reg_id,coalesce(item->>'firstName',p_first_name),coalesce(item->>'lastName',p_last_name),
             nullif(item->>'birthYear','')::integer,coalesce(item->>'experienceLevel',''),coalesce(item->>'partnerName',''),item);
    end loop;
  end if;

  if selected_pass.id is not null then
    update passes set credits_remaining=credits_remaining-credits_needed,
      status=case when credits_remaining-credits_needed<=0 then 'EXHAUSTED' else status end
      where id=selected_pass.id;
    insert into pass_usages(pass_id,registration_id,credits_used) values(selected_pass.id,reg_id,credits_needed);
  elsif selected_membership.id is not null then
    update memberships set credits_remaining=credits_remaining-credits_needed,updated_at=now() where id=selected_membership.id;
    insert into membership_usages(membership_id,registration_id,credits_used) values(selected_membership.id,reg_id,credits_needed);
  end if;

  if charge_now=0 then
    if c.id is not null and discount>0 then
      insert into coupon_redemptions(coupon_id,registration_id,email,amount_agorot)
      values(c.id,reg_id,lower(trim(p_email)),discount) on conflict do nothing;
    end if;
    insert into notification_jobs(registration_id,channel,template_key,payload)
    values(reg_id,'EMAIL','REGISTRATION_CONFIRMED',jsonb_build_object('registrationId',reg_id)),
          (reg_id,'WHATSAPP','REGISTRATION_CONFIRMED',jsonb_build_object('registrationId',reg_id));
  end if;

  return query select reg_id,reg_code,charge_now,total_amount,case when charge_now=0 then null else hold_until end,w.title,reg_status;
end; $$;

create or replace function public.confirm_checkout_payment(
  p_payment_id uuid,
  p_provider_transaction_id text,
  p_amount_agorot integer,
  p_confirmation_code text,
  p_method text,
  p_raw jsonb
) returns table(entity_type text, entity_code text, entity_status text)
language plpgsql security definer as $$
declare
  pay payments%rowtype;
  reg registrations%rowtype;
  ord commerce_orders%rowtype;
  new_paid integer;
  new_status text;
  plan membership_plans%rowtype;
  product pass_products%rowtype;
  created_code text;
  period_end timestamptz;
begin
  select * into pay from payments where id=p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if pay.status='SUCCEEDED' then
    if pay.registration_id is not null then
      select r.registration_code,r.status into entity_code,entity_status from registrations r where r.id=pay.registration_id;
      entity_type:='REGISTRATION';
    else
      select o.order_code,o.status into entity_code,entity_status from commerce_orders o where o.id=pay.order_id;
      entity_type:='ORDER';
    end if;
    return next; return;
  end if;
  if p_amount_agorot<>pay.amount_agorot then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if exists(select 1 from payments where provider=pay.provider and provider_transaction_id=p_provider_transaction_id and id<>pay.id) then
    raise exception 'DUPLICATE_PROVIDER_TRANSACTION';
  end if;

  update payments set status='SUCCEEDED',provider_transaction_id=p_provider_transaction_id,payment_method=p_method,
    confirmation_code=p_confirmation_code,raw_response=coalesce(p_raw,'{}'),paid_at=now(),updated_at=now()
    where id=pay.id;

  if pay.registration_id is not null then
    select * into reg from registrations where id=pay.registration_id for update;
    if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
    new_paid:=reg.amount_paid_agorot+pay.amount_agorot;
    new_status:=case when new_paid>=reg.total_amount_agorot then 'PAID' else 'DEPOSIT_PAID' end;
    update registrations set amount_paid_agorot=new_paid,status=new_status,hold_expires_at=null,updated_at=now() where id=reg.id;
    if reg.coupon_id is not null and reg.discount_agorot>0 then
      insert into coupon_redemptions(coupon_id,registration_id,email,amount_agorot)
      values(reg.coupon_id,reg.id,reg.email,reg.discount_agorot) on conflict do nothing;
    end if;
    update waitlist_entries set status='REGISTERED' where registration_id=reg.id;
    insert into notification_jobs(registration_id,channel,template_key,payload)
    values(reg.id,'EMAIL',case when new_status='PAID' then 'REGISTRATION_CONFIRMED' else 'DEPOSIT_CONFIRMED' end,jsonb_build_object('registrationId',reg.id,'paymentId',pay.id)),
          (reg.id,'WHATSAPP',case when new_status='PAID' then 'REGISTRATION_CONFIRMED' else 'DEPOSIT_CONFIRMED' end,jsonb_build_object('registrationId',reg.id,'paymentId',pay.id)),
          (reg.id,'INVOICE','PAYMENT_SUCCEEDED',jsonb_build_object('registrationId',reg.id,'paymentId',pay.id));
    entity_type:='REGISTRATION'; entity_code:=reg.registration_code; entity_status:=new_status;
    return next; return;
  end if;

  select * into ord from commerce_orders where id=pay.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  update commerce_orders set status='PAID',updated_at=now() where id=ord.id;

  if ord.order_type='PASS_PURCHASE' then
    select * into product from pass_products where id=ord.pass_product_id;
    created_code:=make_code('PASS-',8);
    insert into passes(pass_code,product_id,email,full_name,credits_total,credits_remaining,status,expires_at)
    values(created_code,product.id,lower(ord.email),ord.full_name,product.credits,product.credits,'ACTIVE',now()+make_interval(days=>product.validity_days));
  elsif ord.order_type='MEMBERSHIP_PURCHASE' then
    select * into plan from membership_plans where id=ord.membership_plan_id;
    created_code:=make_code('MEM-',8);
    period_end:=case plan.billing_interval when 'MONTHLY' then now()+interval '1 month' when 'QUARTERLY' then now()+interval '3 months' else now()+interval '1 year' end;
    insert into memberships(plan_id,email,full_name,phone,status,current_period_start,current_period_end,credits_remaining,membership_code,next_billing_at)
    values(plan.id,lower(ord.email),ord.full_name,ord.phone,'ACTIVE',now(),period_end,plan.included_credits,created_code,period_end);
  elsif ord.order_type='MEMBERSHIP_RENEWAL' then
    select mp.* into plan from memberships m join membership_plans mp on mp.id=m.plan_id where m.id=ord.membership_id;
    period_end:=case plan.billing_interval when 'MONTHLY' then greatest(now(),(select current_period_end from memberships where id=ord.membership_id))+interval '1 month'
                    when 'QUARTERLY' then greatest(now(),(select current_period_end from memberships where id=ord.membership_id))+interval '3 months'
                    else greatest(now(),(select current_period_end from memberships where id=ord.membership_id))+interval '1 year' end;
    update memberships set status='ACTIVE',current_period_start=coalesce(current_period_end,now()),current_period_end=period_end,
      next_billing_at=period_end,credits_remaining=credits_remaining+plan.included_credits,updated_at=now() where id=ord.membership_id returning membership_code into created_code;
  end if;

  update commerce_orders set metadata=metadata||jsonb_build_object('issuedCode',created_code),updated_at=now() where id=ord.id;
  insert into notification_jobs(order_id,channel,template_key,payload)
  values(ord.id,'EMAIL','PRODUCT_PURCHASE_CONFIRMED',jsonb_build_object('orderId',ord.id,'issuedCode',created_code)),
        (ord.id,'INVOICE','PAYMENT_SUCCEEDED',jsonb_build_object('orderId',ord.id,'paymentId',pay.id));
  entity_type:='ORDER'; entity_code:=ord.order_code; entity_status:='PAID';
  return next;
end; $$;

create or replace function public.expire_registration_holds()
returns integer language plpgsql security definer as $$
declare changed integer;
begin
  update registrations set status='EXPIRED',updated_at=now()
  where status in ('SEAT_HELD','PENDING_PAYMENT') and hold_expires_at<=now();
  get diagnostics changed=row_count;
  update waitlist_entries e set status='EXPIRED'
  where status='INVITED' and invite_expires_at<=now() and not exists(select 1 from registrations r where r.id=e.registration_id and r.status in ('DEPOSIT_PAID','PAID','CHECKED_IN'));
  delete from admin_sessions where expires_at<=now();
  return changed;
end; $$;

create or replace view customer_entitlements as
select 'PASS'::text as type,p.id,p.pass_code as code,p.email,p.full_name,p.status,p.credits_remaining,p.expires_at as valid_until,null::uuid as plan_id
from passes p
union all
select 'MEMBERSHIP',m.id,m.membership_code,m.email,m.full_name,m.status,m.credits_remaining,m.current_period_end,m.plan_id
from memberships m;

create or replace function public.apply_data_retention()
returns integer language plpgsql security definer as $$
declare changed integer; months_to_keep integer;
begin
  select retention_months into months_to_keep from business_settings where singleton=true;
  with targets as (
    select r.id from registrations r join workshops w on w.id=r.workshop_id
    where w.ends_at < now()-make_interval(months=>coalesce(months_to_keep,36))
      and r.email not like 'deleted-%@example.invalid'
      and r.status in ('PAID','CHECKED_IN','NO_SHOW','CANCELLED','PARTIALLY_REFUNDED','REFUNDED','TRANSFERRED')
  )
  update registration_participants p set first_name='Deleted',last_name='User',experience_level='',partner_name='',metadata='{}'::jsonb
  where p.registration_id in (select id from targets);

  update registrations r set first_name='Deleted',last_name='User',email='deleted-'||left(r.id::text,8)||'@example.invalid',phone='',phone_normalized='',notes='',guardian='{}'::jsonb,custom_answers='{}'::jsonb,marketing_consent=false,marketing_consent_at=null,updated_at=now()
  from workshops w where w.id=r.workshop_id and w.ends_at < now()-make_interval(months=>coalesce(months_to_keep,36))
    and r.email not like 'deleted-%@example.invalid'
    and r.status in ('PAID','CHECKED_IN','NO_SHOW','CANCELLED','PARTIALLY_REFUNDED','REFUNDED','TRANSFERRED');
  get diagnostics changed=row_count;
  delete from waitlist_entries e using workshops w where w.id=e.workshop_id and w.ends_at < now()-make_interval(months=>coalesce(months_to_keep,36));
  return changed;
end; $$;
