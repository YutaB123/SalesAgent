-- Additive, dedicated public-offer catalog. Does not touch customer/call tables.
create table if not exists public.carrier_plan_catalog (
  id text primary key,
  record jsonb not null check (jsonb_typeof(record) = 'object' and record->>'id' = id),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.carrier_plan_updates (
  id text primary key,
  plan_id text not null references public.carrier_plan_catalog(id),
  revision integer not null check (revision > 0),
  previous_record jsonb,
  record jsonb not null,
  updated_at timestamptz not null default now(),
  unique (plan_id, revision)
);
alter table public.carrier_plan_catalog enable row level security;
alter table public.carrier_plan_updates enable row level security;
revoke all on public.carrier_plan_catalog from anon, authenticated;
revoke all on public.carrier_plan_updates from anon, authenticated;
grant select on public.carrier_plan_catalog to anon, authenticated;
grant all on public.carrier_plan_catalog to service_role;
grant all on public.carrier_plan_updates to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='carrier_plan_catalog' and policyname='official_plan_catalog_read') then
    create policy official_plan_catalog_read on public.carrier_plan_catalog for select to anon, authenticated using (true);
  end if;
end $$;
