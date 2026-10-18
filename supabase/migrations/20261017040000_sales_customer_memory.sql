-- Private phone-first memory for the local sales workspace. Existing CRM tables are untouched.
create table if not exists public.sales_customer_memory (
 id text primary key,
 phone text unique,
 record jsonb not null check(jsonb_typeof(record)='object'),
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.sales_customer_memory enable row level security;
revoke all on public.sales_customer_memory from anon, authenticated;
grant all on public.sales_customer_memory to service_role;
