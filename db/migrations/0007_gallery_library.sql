create table if not exists gallery_items (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique references uploaded_assets(id) on delete cascade,
  media_type text not null check (media_type in ('IMAGE','VIDEO')),
  title text not null default '',
  caption text not null default '',
  alt_text text not null default '',
  display_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gallery_items_public
  on gallery_items(is_published, display_order, created_at desc);

comment on table gallery_items is 'Public gallery metadata for image and video assets stored in Cloudflare R2.';
comment on column gallery_items.alt_text is 'Accessible description for images; for video this describes the visual content.';
