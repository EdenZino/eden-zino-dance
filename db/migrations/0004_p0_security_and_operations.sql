-- P0 production hardening: secure customer access, administrator protection,
-- truthful notification delivery, atomic cancellation/transfer and refund accounting.

alter table admins add column if not exists failed_login_count integer not null default 0;
alter table admins add column if not exists locked_until timestamptz;
alter table admins add column if not exists password_changed_at timestamptz not null default now();

create table if not exists admin_password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_password_reset_expiry on admin_password_reset_tokens(expires_at);

create table if not exists admin_login_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admins(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_login_challenge_expiry on admin_login_challenges(expires_at);

create table if not exists customer_magic_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_magic_expiry on customer_magic_tokens(expires_at);

create table if not exists customer_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_customer_sessions_expiry on customer_sessions(expires_at);

alter table registrations add column if not exists public_access_token_hash text;
alter table registrations add column if not exists public_access_expires_at timestamptz;
create unique index if not exists idx_registration_public_access on registrations(public_access_token_hash) where public_access_token_hash is not null;

alter table commerce_orders add column if not exists public_access_token_hash text;
alter table commerce_orders add column if not exists public_access_expires_at timestamptz;
create unique index if not exists idx_order_public_access on commerce_orders(public_access_token_hash) where public_access_token_hash is not null;

alter table payments add column if not exists provider_environment text not null default 'unknown';
create index if not exists idx_payments_provider_environment on payments(provider,provider_environment,status);
alter table payments add column if not exists refunded_agorot integer not null default 0;
alter table payments drop constraint if exists payments_refunded_amount_check;
alter table payments add constraint payments_refunded_amount_check check (refunded_agorot >= 0 and refunded_agorot <= amount_agorot);

alter table refunds add column if not exists provider_environment text not null default 'unknown';
create index if not exists idx_refunds_provider_environment on refunds(provider_environment,status);
alter table refunds add column if not exists idempotency_key text;
alter table refunds add column if not exists last_error text;
alter table refunds add column if not exists updated_at timestamptz not null default now();
alter table refunds add column if not exists cancel_registration boolean not null default false;
create unique index if not exists idx_refunds_idempotency on refunds(idempotency_key) where idempotency_key is not null;

alter table notification_jobs drop constraint if exists notification_jobs_status_check;
alter table notification_jobs add constraint notification_jobs_status_check check (status in ('PENDING','PROCESSING','SENT','FAILED','CANCELLED','SKIPPED','CONFIGURATION_ERROR'));
alter table notification_jobs add column if not exists provider_response jsonb not null default '{}'::jsonb;
alter table notification_jobs add column if not exists processed_at timestamptz;
alter table notification_jobs add column if not exists waitlist_entry_id uuid references waitlist_entries(id) on delete cascade;

create or replace function public.restore_registration_entitlement(p_registration_id uuid)
returns boolean language plpgsql security definer as $$
declare
  pass_row pass_usages%rowtype;
  membership_row membership_usages%rowtype;
  restored boolean := false;
begin
  select * into pass_row from pass_usages where registration_id=p_registration_id for update;
  if found then
    update passes set credits_remaining=least(credits_total,credits_remaining+pass_row.credits_used),
      status=case when expires_at<=now() then 'EXPIRED' else 'ACTIVE' end
      where id=pass_row.pass_id;
    delete from pass_usages where id=pass_row.id;
    restored:=true;
  end if;

  select * into membership_row from membership_usages where registration_id=p_registration_id for update;
  if found then
    update memberships set credits_remaining=credits_remaining+membership_row.credits_used,updated_at=now()
      where id=membership_row.membership_id;
    delete from membership_usages where id=membership_row.id;
    restored:=true;
  end if;
  return restored;
end; $$;

create or replace function public.cancel_registration_atomic(
  p_registration_id uuid,
  p_reason text,
  p_admin_id uuid default null
) returns table(workshop_id uuid, registration_status text, refundable_agorot integer, entitlement_restored boolean)
language plpgsql security definer as $$
declare
  reg registrations%rowtype;
  already_refunded integer;
  remaining integer;
  restored boolean := false;
begin
  select * into reg from registrations where id=p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;

  select coalesce(sum(amount_agorot) filter(where status='SUCCEEDED'),0)::int into already_refunded
    from refunds where registration_id=reg.id;
  remaining:=greatest(0,reg.amount_paid_agorot-already_refunded);

  if reg.status in ('REFUNDED','CANCELLED','TRANSFERRED','EXPIRED') then
    return query select reg.workshop_id,reg.status,remaining,false;
    return;
  end if;

  update payments set status='CANCELLED',updated_at=now()
    where registration_id=reg.id and status in ('CREATED','PENDING');

  restored:=restore_registration_entitlement(reg.id);

  if remaining>0 then
    update registrations set status='REFUND_PENDING',notes=concat(notes,E'\nביטול: ',coalesce(p_reason,'')),hold_expires_at=null,updated_at=now() where id=reg.id;
  else
    update registrations set status='CANCELLED',notes=concat(notes,E'\nביטול: ',coalesce(p_reason,'')),hold_expires_at=null,updated_at=now() where id=reg.id;
    insert into notification_jobs(registration_id,channel,template_key,payload)
      values(reg.id,'EMAIL','REGISTRATION_CANCELLED',jsonb_build_object('registrationId',reg.id,'reason',p_reason)),
            (reg.id,'WHATSAPP','REGISTRATION_CANCELLED',jsonb_build_object('registrationId',reg.id,'reason',p_reason));
  end if;

  if p_admin_id is not null then
    insert into audit_logs(admin_id,action,entity_type,entity_id,new_value)
      values(p_admin_id,'CANCEL','REGISTRATION',reg.id::text,jsonb_build_object('reason',p_reason,'refundableAgorot',remaining));
  end if;

  return query select reg.workshop_id,case when remaining>0 then 'REFUND_PENDING' else 'CANCELLED' end,remaining,restored;
end; $$;

create or replace function public.complete_refund_atomic(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_raw jsonb
) returns table(registration_id uuid, registration_status text, workshop_id uuid, refunded_total integer)
language plpgsql security definer as $$
declare
  ref refunds%rowtype;
  reg registrations%rowtype;
  pay payments%rowtype;
  total integer;
  final_status text;
  was_already_complete boolean := false;
begin
  select * into ref from refunds where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  select * into reg from registrations where id=ref.registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;

  was_already_complete := ref.status='SUCCEEDED';
  if not was_already_complete then
    update refunds set status='SUCCEEDED',provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),raw_response=coalesce(p_raw,'{}'),last_error=null,completed_at=now(),updated_at=now() where id=ref.id;
    if ref.payment_id is not null then
      select * into pay from payments where id=ref.payment_id for update;
      update payments set refunded_agorot=least(amount_agorot,refunded_agorot+ref.amount_agorot),
        status=case when refunded_agorot+ref.amount_agorot>=amount_agorot then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
        updated_at=now() where id=ref.payment_id;
    end if;
  end if;

  select coalesce(sum(f.amount_agorot) filter(where f.status='SUCCEEDED'),0)::int into total from refunds f where f.registration_id=reg.id;
  final_status:=case when ref.cancel_registration then 'CANCELLED' when total>=reg.amount_paid_agorot then 'REFUNDED' else 'PARTIALLY_REFUNDED' end;
  if final_status in ('REFUNDED','CANCELLED') then perform restore_registration_entitlement(reg.id); end if;
  update registrations set status=final_status,hold_expires_at=null,updated_at=now() where id=reg.id;

  if not was_already_complete then
    insert into notification_jobs(registration_id,channel,template_key,payload)
      values(reg.id,'EMAIL','REFUND_CONFIRMED',jsonb_build_object('registrationId',reg.id,'refundId',ref.id,'amountAgorot',ref.amount_agorot)),
            (reg.id,'WHATSAPP','REFUND_CONFIRMED',jsonb_build_object('registrationId',reg.id,'refundId',ref.id,'amountAgorot',ref.amount_agorot)),
            (reg.id,'INVOICE','REFUND_SUCCEEDED',jsonb_build_object('registrationId',reg.id,'refundId',ref.id,'amountAgorot',ref.amount_agorot));
  end if;

  return query select reg.id,final_status,reg.workshop_id,total;
end; $$;

create or replace function public.transfer_registration_atomic(
  p_registration_id uuid,
  p_target_workshop_id uuid,
  p_admin_id uuid default null
) returns table(source_workshop_id uuid, target_workshop_id uuid, registration_status text)
language plpgsql security definer as $$
declare
  reg registrations%rowtype;
  target workshops%rowtype;
  occupied integer;
begin
  select * into reg from registrations where id=p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if reg.workshop_id=p_target_workshop_id then raise exception 'SAME_WORKSHOP'; end if;
  if reg.status not in ('DEPOSIT_PAID','PAID','PARTIALLY_REFUNDED','CHECKED_IN') then raise exception 'REGISTRATION_NOT_TRANSFERABLE'; end if;

  select * into target from workshops where id=p_target_workshop_id for update;
  if not found or not target.allow_transfers or target.status not in ('PUBLISHED','FULL') or target.starts_at<=now() then raise exception 'TARGET_NOT_AVAILABLE'; end if;

  select coalesce(sum(participant_count),0)::int into occupied from registrations
    where workshop_id=target.id and (
      status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
      (status in ('SEAT_HELD','PENDING_PAYMENT') and hold_expires_at>now())
    );
  if occupied+reg.participant_count>target.capacity then raise exception 'TARGET_NOT_AVAILABLE'; end if;

  update registrations set workshop_id=target.id,updated_at=now() where id=reg.id;
  insert into notification_jobs(registration_id,channel,template_key,payload)
    values(reg.id,'EMAIL','REGISTRATION_TRANSFERRED',jsonb_build_object('registrationId',reg.id,'sourceWorkshopId',reg.workshop_id,'targetWorkshopId',target.id)),
          (reg.id,'WHATSAPP','REGISTRATION_TRANSFERRED',jsonb_build_object('registrationId',reg.id,'sourceWorkshopId',reg.workshop_id,'targetWorkshopId',target.id));
  if p_admin_id is not null then
    insert into audit_logs(admin_id,action,entity_type,entity_id,old_value,new_value)
      values(p_admin_id,'TRANSFER','REGISTRATION',reg.id::text,jsonb_build_object('workshopId',reg.workshop_id),jsonb_build_object('workshopId',target.id));
  end if;
  return query select reg.workshop_id,target.id,reg.status;
end; $$;

create or replace function public.invite_next_waitlist(
  p_workshop_id uuid,
  p_invite_token text,
  p_expiry_hours integer default 24
) returns table(entry_id uuid, entry_email text, entry_phone text, participant_count integer)
language plpgsql security definer as $$
declare
  w workshops%rowtype;
  occupied integer;
  available integer;
  entry waitlist_entries%rowtype;
begin
  select * into w from workshops where id=p_workshop_id for update;
  if not found or not w.allow_waitlist or w.status not in ('PUBLISHED','FULL') then return; end if;

  select coalesce(sum(r.participant_count),0)::int into occupied from registrations r
    where r.workshop_id=w.id and (
      r.status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
      (r.status in ('SEAT_HELD','PENDING_PAYMENT') and r.hold_expires_at>now())
    );
  available:=greatest(0,w.capacity-occupied);
  if available=0 then return; end if;

  select we.* into entry from waitlist_entries we
    where we.workshop_id=w.id and we.status='WAITING' and we.participant_count<=available
    order by we.created_at for update of we skip locked limit 1;
  if not found then return; end if;

  update waitlist_entries set status='INVITED',invite_token=p_invite_token,invited_at=now(),invite_expires_at=now()+make_interval(hours=>greatest(1,p_expiry_hours)) where id=entry.id;
  insert into notification_jobs(waitlist_entry_id,channel,template_key,payload)
    values(entry.id,'EMAIL','WAITLIST_INVITE',jsonb_build_object('waitlistEntryId',entry.id,'inviteToken',p_invite_token));
  return query select entry.id,entry.email,entry.phone,entry.participant_count;
end; $$;

create or replace function public.expire_security_tokens()
returns integer language plpgsql security definer as $$
declare changed integer := 0; current_count integer;
begin
  delete from admin_password_reset_tokens where expires_at<=now() or used_at<now()-interval '7 days'; get diagnostics current_count=row_count; changed:=changed+current_count;
  delete from admin_login_challenges where expires_at<=now() or used_at<now()-interval '1 day'; get diagnostics current_count=row_count; changed:=changed+current_count;
  delete from customer_magic_tokens where expires_at<=now() or used_at<now()-interval '1 day'; get diagnostics current_count=row_count; changed:=changed+current_count;
  delete from customer_sessions where expires_at<=now(); get diagnostics current_count=row_count; changed:=changed+current_count;
  return changed;
end; $$;

-- Final P0 corrections: legal approval state, atomic refund allocation,
-- repeat-safe cancellations, price-safe transfers and waitlist invitation holds.

alter table refunds drop constraint if exists refunds_status_check;
alter table refunds add constraint refunds_status_check check (status in ('REQUESTED','MANUAL_ACTION_REQUIRED','PROCESSING','SUCCEEDED','FAILED','CANCELLED'));

alter table legal_documents add column if not exists approved_at timestamptz;
alter table legal_documents add column if not exists approved_by uuid references admins(id) on delete set null;
alter table legal_documents add column if not exists approval_note text not null default '';

create or replace function public.allocate_registration_refund(
  p_registration_id uuid,
  p_amount_agorot integer,
  p_reason text,
  p_admin_id uuid default null,
  p_cancel_registration boolean default false
) returns table(
  refund_id uuid,
  payment_id uuid,
  amount_agorot integer,
  provider text,
  provider_session_id text,
  provider_transaction_id text,
  idempotency_key text
)
language plpgsql security definer as $$
declare
  reg registrations%rowtype;
  pay record;
  allocated_total integer;
  available_total integer;
  remaining integer;
  part integer;
  new_refund_id uuid;
  new_key text;
begin
  if p_amount_agorot is null or p_amount_agorot <= 0 then raise exception 'INVALID_REFUND_AMOUNT'; end if;
  select * into reg from registrations where id=p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;

  select coalesce(sum(f.amount_agorot) filter(where f.status<>'CANCELLED'),0)::int
    into allocated_total from refunds f where f.registration_id=reg.id;
  available_total:=greatest(0,reg.amount_paid_agorot-allocated_total);
  if p_amount_agorot>available_total then raise exception 'INVALID_REFUND_AMOUNT'; end if;

  remaining:=p_amount_agorot;
  for pay in
    select p.id,p.provider,p.provider_session_id,p.provider_transaction_id,p.amount_agorot,
      greatest(0,p.amount_agorot-coalesce((select sum(f.amount_agorot) from refunds f where f.payment_id=p.id and f.status<>'CANCELLED'),0))::int as available
    from payments p
    where p.registration_id=reg.id and p.status in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
    order by p.paid_at desc nulls last,p.created_at desc
    for update of p
  loop
    exit when remaining<=0;
    part:=least(remaining,pay.available);
    if part<=0 then continue; end if;
    new_refund_id:=gen_random_uuid();
    new_key:=concat('refund-',reg.id,'-',pay.id,'-',new_refund_id);
    insert into refunds(id,registration_id,payment_id,amount_agorot,reason,status,requested_by,idempotency_key,cancel_registration)
      values(new_refund_id,reg.id,pay.id,part,p_reason,'PROCESSING',p_admin_id,new_key,p_cancel_registration);
    refund_id:=new_refund_id;
    payment_id:=pay.id;
    amount_agorot:=part;
    provider:=pay.provider;
    provider_session_id:=pay.provider_session_id;
    provider_transaction_id:=pay.provider_transaction_id;
    idempotency_key:=new_key;
    return next;
    remaining:=remaining-part;
  end loop;
  if remaining>0 then raise exception 'REFUND_PAYMENT_ALLOCATION_FAILED'; end if;
end; $$;

create or replace function public.cancel_registration_atomic(
  p_registration_id uuid,
  p_reason text,
  p_admin_id uuid default null
) returns table(workshop_id uuid, registration_status text, refundable_agorot integer, entitlement_restored boolean)
language plpgsql security definer as $$
declare
  reg registrations%rowtype;
  allocated_refunds integer;
  remaining integer;
  restored boolean := false;
begin
  select * into reg from registrations where id=p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;

  select coalesce(sum(amount_agorot) filter(where status<>'CANCELLED'),0)::int into allocated_refunds
    from refunds where registration_id=reg.id;
  remaining:=greatest(0,reg.amount_paid_agorot-allocated_refunds);

  if reg.status in ('REFUNDED','CANCELLED','TRANSFERRED','EXPIRED') then
    return query select reg.workshop_id,reg.status,0,false;
    return;
  end if;
  if reg.status='REFUND_PENDING' then
    return query select reg.workshop_id,reg.status,remaining,false;
    return;
  end if;

  update payments set status='CANCELLED',updated_at=now()
    where registration_id=reg.id and status in ('CREATED','PENDING');
  restored:=restore_registration_entitlement(reg.id);

  if reg.amount_paid_agorot>0 then
    update registrations set status='REFUND_PENDING',notes=concat(notes,E'\nביטול: ',coalesce(p_reason,'')),hold_expires_at=null,updated_at=now() where id=reg.id;
    insert into notification_jobs(registration_id,channel,template_key,payload)
      values(reg.id,'EMAIL','REGISTRATION_CANCELLATION_PENDING',jsonb_build_object('registrationId',reg.id,'reason',p_reason,'refundAgorot',remaining)),
            (reg.id,'WHATSAPP','REGISTRATION_CANCELLATION_PENDING',jsonb_build_object('registrationId',reg.id,'reason',p_reason,'refundAgorot',remaining));
  else
    update registrations set status='CANCELLED',notes=concat(notes,E'\nביטול: ',coalesce(p_reason,'')),hold_expires_at=null,updated_at=now() where id=reg.id;
    insert into notification_jobs(registration_id,channel,template_key,payload)
      values(reg.id,'EMAIL','REGISTRATION_CANCELLED',jsonb_build_object('registrationId',reg.id,'reason',p_reason)),
            (reg.id,'WHATSAPP','REGISTRATION_CANCELLED',jsonb_build_object('registrationId',reg.id,'reason',p_reason));
  end if;

  if p_admin_id is not null then
    insert into audit_logs(admin_id,action,entity_type,entity_id,new_value)
      values(p_admin_id,'CANCEL','REGISTRATION',reg.id::text,jsonb_build_object('reason',p_reason,'refundableAgorot',remaining));
  end if;
  return query select reg.workshop_id,case when reg.amount_paid_agorot>0 then 'REFUND_PENDING' else 'CANCELLED' end,remaining,restored;
end; $$;

create or replace function public.complete_refund_atomic(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_raw jsonb
) returns table(registration_id uuid, registration_status text, workshop_id uuid, refunded_total integer)
language plpgsql security definer as $$
declare
  ref refunds%rowtype;
  reg registrations%rowtype;
  pay payments%rowtype;
  total integer;
  final_status text;
  was_already_complete boolean := false;
  previous_status text;
begin
  select * into ref from refunds where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  select * into reg from registrations where id=ref.registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  previous_status:=reg.status;

  was_already_complete := ref.status='SUCCEEDED';
  if not was_already_complete then
    update refunds set status='SUCCEEDED',provider_refund_id=coalesce(p_provider_refund_id,provider_refund_id),raw_response=coalesce(p_raw,'{}'),last_error=null,completed_at=now(),updated_at=now() where id=ref.id;
    if ref.payment_id is not null then
      select * into pay from payments where id=ref.payment_id for update;
      update payments set refunded_agorot=least(amount_agorot,refunded_agorot+ref.amount_agorot),
        status=case when refunded_agorot+ref.amount_agorot>=amount_agorot then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
        updated_at=now() where id=ref.payment_id;
    end if;
  end if;

  select coalesce(sum(f.amount_agorot) filter(where f.status='SUCCEEDED'),0)::int into total from refunds f where f.registration_id=reg.id;
  if ref.cancel_registration then
    final_status:=case when total>=reg.amount_paid_agorot then 'CANCELLED' else 'REFUND_PENDING' end;
  else
    final_status:=case when total>=reg.amount_paid_agorot then 'REFUNDED' else 'PARTIALLY_REFUNDED' end;
  end if;
  if final_status in ('REFUNDED','CANCELLED') then perform restore_registration_entitlement(reg.id); end if;
  update registrations set status=final_status,hold_expires_at=null,updated_at=now() where id=reg.id;

  if not was_already_complete then
    insert into notification_jobs(registration_id,channel,template_key,payload)
      values(reg.id,'EMAIL','REFUND_CONFIRMED',jsonb_build_object('registrationId',reg.id,'refundId',ref.id,'amountAgorot',ref.amount_agorot)),
            (reg.id,'WHATSAPP','REFUND_CONFIRMED',jsonb_build_object('registrationId',reg.id,'refundId',ref.id,'amountAgorot',ref.amount_agorot)),
            (reg.id,'INVOICE','REFUND_SUCCEEDED',jsonb_build_object('registrationId',reg.id,'refundId',ref.id,'amountAgorot',ref.amount_agorot));
    if final_status='CANCELLED' and previous_status<>'CANCELLED' then
      insert into notification_jobs(registration_id,channel,template_key,payload)
        values(reg.id,'EMAIL','REGISTRATION_CANCELLED',jsonb_build_object('registrationId',reg.id,'reason',ref.reason)),
              (reg.id,'WHATSAPP','REGISTRATION_CANCELLED',jsonb_build_object('registrationId',reg.id,'reason',ref.reason));
    end if;
  end if;
  return query select reg.id,final_status,reg.workshop_id,total;
end; $$;

create or replace function public.transfer_registration_atomic(
  p_registration_id uuid,
  p_target_workshop_id uuid,
  p_admin_id uuid default null
) returns table(source_workshop_id uuid, target_workshop_id uuid, registration_status text)
language plpgsql security definer as $$
declare
  reg registrations%rowtype;
  target workshops%rowtype;
  occupied integer;
  target_unit_price integer;
  target_total integer;
begin
  select * into reg from registrations where id=p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if reg.workshop_id=p_target_workshop_id then raise exception 'SAME_WORKSHOP'; end if;
  if reg.status not in ('DEPOSIT_PAID','PAID','PARTIALLY_REFUNDED','CHECKED_IN') then raise exception 'REGISTRATION_NOT_TRANSFERABLE'; end if;

  select * into target from workshops where id=p_target_workshop_id for update;
  if not found or not target.allow_transfers or target.status not in ('PUBLISHED','FULL') or target.starts_at<=now() then raise exception 'TARGET_NOT_AVAILABLE'; end if;

  target_unit_price:=case when target.early_bird_price_agorot is not null and target.early_bird_ends_at is not null and now()<target.early_bird_ends_at then target.early_bird_price_agorot else target.price_agorot end;
  target_total:=target_unit_price*reg.participant_count;
  if target_total<>reg.total_amount_agorot then raise exception 'TRANSFER_PRICE_MISMATCH'; end if;

  select coalesce(sum(participant_count),0)::int into occupied from registrations
    where workshop_id=target.id and (
      status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
      (status in ('SEAT_HELD','PENDING_PAYMENT') and hold_expires_at>now())
    );
  if occupied+reg.participant_count>target.capacity then raise exception 'TARGET_NOT_AVAILABLE'; end if;

  update registrations set workshop_id=target.id,updated_at=now() where id=reg.id;
  insert into notification_jobs(registration_id,channel,template_key,payload)
    values(reg.id,'EMAIL','REGISTRATION_TRANSFERRED',jsonb_build_object('registrationId',reg.id,'sourceWorkshopId',reg.workshop_id,'targetWorkshopId',target.id)),
          (reg.id,'WHATSAPP','REGISTRATION_TRANSFERRED',jsonb_build_object('registrationId',reg.id,'sourceWorkshopId',reg.workshop_id,'targetWorkshopId',target.id));
  if p_admin_id is not null then
    insert into audit_logs(admin_id,action,entity_type,entity_id,old_value,new_value)
      values(p_admin_id,'TRANSFER','REGISTRATION',reg.id::text,jsonb_build_object('workshopId',reg.workshop_id),jsonb_build_object('workshopId',target.id));
  end if;
  return query select reg.workshop_id,target.id,reg.status;
end; $$;

create or replace function public.invite_next_waitlist(
  p_workshop_id uuid,
  p_invite_token text,
  p_expiry_hours integer default 24
) returns table(entry_id uuid, entry_email text, entry_phone text, participant_count integer)
language plpgsql security definer as $$
declare
  w workshops%rowtype;
  occupied integer;
  invited integer;
  available integer;
  entry waitlist_entries%rowtype;
begin
  select * into w from workshops where id=p_workshop_id for update;
  if not found or not w.allow_waitlist or w.status not in ('PUBLISHED','FULL') then return; end if;

  select coalesce(sum(r.participant_count),0)::int into occupied from registrations r
    where r.workshop_id=w.id and (
      r.status in ('DEPOSIT_PAID','PAID','CHECKED_IN','PARTIALLY_REFUNDED') or
      (r.status in ('SEAT_HELD','PENDING_PAYMENT') and r.hold_expires_at>now())
    );
  select coalesce(sum(we.participant_count),0)::int into invited from waitlist_entries we
    where we.workshop_id=w.id and we.status='INVITED' and we.invite_expires_at>now();
  available:=greatest(0,w.capacity-occupied-invited);
  if available=0 then return; end if;

  select we.* into entry from waitlist_entries we
    where we.workshop_id=w.id and we.status='WAITING' and we.participant_count<=available
    order by we.created_at for update of we skip locked limit 1;
  if not found then return; end if;

  update waitlist_entries set status='INVITED',invite_token=p_invite_token,invited_at=now(),invite_expires_at=now()+make_interval(hours=>greatest(1,p_expiry_hours)) where id=entry.id;
  insert into notification_jobs(waitlist_entry_id,channel,template_key,payload)
    values(entry.id,'EMAIL','WAITLIST_INVITE',jsonb_build_object('waitlistEntryId',entry.id,'inviteToken',p_invite_token));
  return query select entry.id,entry.email,entry.phone,entry.participant_count;
end; $$;

create unique index if not exists idx_cancellation_requests_active_registration
  on cancellation_requests(registration_id) where status in ('OPEN','APPROVED');
