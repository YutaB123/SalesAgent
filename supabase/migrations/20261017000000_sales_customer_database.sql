-- Cloud customer database for the public sales-assistant demo.
-- Public clients can only read rows explicitly marked is_demo = true.
-- Writes require a server-side Supabase secret key.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.customers (
  id text primary key,
  company_name text not null,
  industry text,
  company_size text,
  website text,
  region text,
  lifecycle_stage text not null default 'Exploring'
    check (lifecycle_stage in ('Exploring', 'Comparing', 'Ready to Buy', 'Not Considering')),
  account_owner text,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.contacts (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  full_name text not null,
  job_title text,
  email text,
  phone text,
  decision_role text not null default 'unknown'
    check (decision_role in (
      'economic_buyer', 'champion', 'influencer', 'end_user',
      'procurement', 'blocker', 'unknown'
    )),
  is_primary boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique(customer_id, email)
);

create table public.products (
  id text primary key,
  name text not null,
  description text,
  list_price_note text,
  active boolean not null default true,
  is_demo boolean not null default false
);

create table public.opportunities (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  name text not null,
  stage text not null default 'Exploring'
    check (stage in ('Exploring', 'Comparing', 'Ready to Buy', 'Not Considering')),
  status text not null default 'open'
    check (status in ('open', 'won', 'lost', 'paused')),
  estimated_value numeric,
  currency text default 'USD',
  target_close_date date,
  economic_buyer_contact_id text references public.contacts(id) on delete set null,
  champion_contact_id text references public.contacts(id) on delete set null,
  next_decision_event text,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.calls (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  opportunity_id text references public.opportunities(id) on delete set null,
  primary_contact_id text references public.contacts(id) on delete set null,
  title text not null,
  source text not null default 'demo',
  status text not null default 'completed'
    check (status in ('scheduled', 'in_progress', 'completed', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.transcript_turns (
  id text primary key,
  call_id text not null references public.calls(id) on delete cascade,
  sequence_no integer not null,
  speaker_role text not null check (speaker_role in ('customer', 'seller', 'unknown')),
  speaker_name text,
  start_ms integer,
  end_ms integer,
  text text not null,
  is_final boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique(call_id, sequence_no)
);

create table public.analysis_runs (
  id text primary key,
  call_id text not null references public.calls(id) on delete cascade,
  status text not null default 'completed'
    check (status in ('pending', 'running', 'completed', 'failed')),
  model_name text,
  prompt_version text not null,
  summary text,
  purchase_stage text check (
    purchase_stage is null or purchase_stage in (
      'Exploring', 'Comparing', 'Ready to Buy', 'Not Considering'
    )
  ),
  momentum text check (momentum is null or momentum in ('advancing', 'neutral', 'at_risk', 'stalled')),
  primary_blocker_category text,
  primary_blocker_subtype text,
  primary_blocker_summary text,
  result_json jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.objections (
  id text primary key,
  analysis_run_id text not null references public.analysis_runs(id) on delete cascade,
  call_id text not null references public.calls(id) on delete cascade,
  category text not null,
  subtype text,
  status text not null
    check (status in ('raised', 'clarifying', 'addressed', 'customer_confirmed', 'unresolved')),
  evidence_turn_id text references public.transcript_turns(id) on delete set null,
  evidence_quote text not null,
  resolution_note text,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.seller_scores (
  id text primary key,
  analysis_run_id text not null references public.analysis_runs(id) on delete cascade,
  dimension text not null check (dimension in (
    'Understanding Needs', 'Answer Quality', 'Objection Handling', 'Next-Step Clarity'
  )),
  score integer not null check (score between 1 and 5),
  rationale text not null,
  evidence_turn_id text references public.transcript_turns(id) on delete set null,
  evidence_quote text not null,
  is_demo boolean not null default false,
  unique(analysis_run_id, dimension)
);

create table public.strategies (
  id text primary key,
  analysis_run_id text not null references public.analysis_runs(id) on delete cascade,
  rank integer not null default 1 check (rank >= 1),
  strategy_type text not null,
  headline text not null,
  why_now text not null,
  objective text,
  seller_move text not null,
  customer_ask text,
  suggested_language text,
  why_not_alternative text,
  commercial_move_type text not null default 'none',
  seller_gives text,
  customer_gives text,
  approval_required boolean not null default false,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_turn_id text references public.transcript_turns(id) on delete set null,
  is_demo boolean not null default false,
  unique(analysis_run_id, rank)
);

create table public.follow_up_actions (
  id text primary key,
  analysis_run_id text not null references public.analysis_runs(id) on delete cascade,
  action_text text not null,
  owner_type text not null check (owner_type in ('seller', 'customer', 'shared')),
  owner_name text,
  purpose text not null,
  dependency text,
  expected_customer_commitment text,
  due_at timestamptz,
  due_status text not null default 'seller_to_confirm'
    check (due_status in ('confirmed', 'seller_to_confirm')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  evidence_turn_id text references public.transcript_turns(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (due_status = 'confirmed' and due_at is not null)
    or (due_status = 'seller_to_confirm' and due_at is null)
  )
);

create table public.customer_messages (
  id text primary key,
  analysis_run_id text not null references public.analysis_runs(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'sms', 'chat', 'call_script')),
  subject text,
  body text not null,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'approved', 'sent')),
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.commercial_policies (
  id text primary key,
  name text not null,
  description text,
  policy_json jsonb not null,
  is_demo_only boolean not null default true,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index contacts_customer_idx on public.contacts(customer_id);
create index opportunities_customer_idx on public.opportunities(customer_id);
create index calls_customer_idx on public.calls(customer_id);
create index calls_opportunity_idx on public.calls(opportunity_id);
create index transcript_turns_call_sequence_idx on public.transcript_turns(call_id, sequence_no);
create index analysis_runs_call_created_idx on public.analysis_runs(call_id, created_at desc);
create index objections_call_idx on public.objections(call_id);
create index follow_up_actions_status_due_idx on public.follow_up_actions(status, due_at);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

-- Convenience views for Member 3. security_invoker keeps the underlying RLS active.
create view public.demo_customer_overview
with (security_invoker = true)
as
select
  c.id,
  c.company_name,
  c.industry,
  c.company_size,
  c.lifecycle_stage,
  c.account_owner,
  count(distinct o.id)::integer as opportunity_count,
  count(distinct ca.id)::integer as call_count
from public.customers c
left join public.opportunities o on o.customer_id = c.id and o.is_demo
left join public.calls ca on ca.customer_id = c.id and ca.is_demo
where c.is_demo
group by c.id;

create view public.demo_strategy_cards
with (security_invoker = true)
as
select
  ca.id as call_id,
  ca.title as call_title,
  ca.started_at,
  c.id as customer_id,
  c.company_name,
  ar.id as analysis_run_id,
  ar.purchase_stage,
  ar.momentum,
  ar.primary_blocker_category,
  ar.primary_blocker_subtype,
  ar.primary_blocker_summary,
  s.strategy_type,
  s.headline,
  s.why_now,
  s.seller_move,
  s.customer_ask,
  s.suggested_language,
  s.why_not_alternative,
  s.commercial_move_type,
  s.seller_gives,
  s.customer_gives,
  s.approval_required,
  s.confidence
from public.calls ca
join public.customers c on c.id = ca.customer_id
join public.analysis_runs ar on ar.call_id = ca.id and ar.is_demo
join public.strategies s on s.analysis_run_id = ar.id and s.rank = 1 and s.is_demo
where ca.is_demo and c.is_demo;

-- Explicit grants are required for new Supabase projects created in 2026.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.customers, public.contacts, public.products,
  public.opportunities, public.calls, public.transcript_turns,
  public.analysis_runs, public.objections, public.seller_scores,
  public.strategies, public.follow_up_actions, public.customer_messages,
  public.commercial_policies, public.demo_customer_overview,
  public.demo_strategy_cards to anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- RLS makes publishable-key access read-only and demo-only.
alter table public.customers enable row level security;
alter table public.contacts enable row level security;
alter table public.products enable row level security;
alter table public.opportunities enable row level security;
alter table public.calls enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.objections enable row level security;
alter table public.seller_scores enable row level security;
alter table public.strategies enable row level security;
alter table public.follow_up_actions enable row level security;
alter table public.customer_messages enable row level security;
alter table public.commercial_policies enable row level security;

create policy demo_read_customers on public.customers for select to anon, authenticated using (is_demo);
create policy demo_read_contacts on public.contacts for select to anon, authenticated using (is_demo);
create policy demo_read_products on public.products for select to anon, authenticated using (is_demo);
create policy demo_read_opportunities on public.opportunities for select to anon, authenticated using (is_demo);
create policy demo_read_calls on public.calls for select to anon, authenticated using (is_demo);
create policy demo_read_transcript_turns on public.transcript_turns for select to anon, authenticated using (is_demo);
create policy demo_read_analysis_runs on public.analysis_runs for select to anon, authenticated using (is_demo);
create policy demo_read_objections on public.objections for select to anon, authenticated using (is_demo);
create policy demo_read_seller_scores on public.seller_scores for select to anon, authenticated using (is_demo);
create policy demo_read_strategies on public.strategies for select to anon, authenticated using (is_demo);
create policy demo_read_follow_up_actions on public.follow_up_actions for select to anon, authenticated using (is_demo);
create policy demo_read_customer_messages on public.customer_messages for select to anon, authenticated using (is_demo);
create policy demo_read_commercial_policies on public.commercial_policies for select to anon, authenticated using (is_demo);
