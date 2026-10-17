-- Publish exactly one complete analysis version per call.

alter table public.analysis_runs
  add column if not exists version integer;

-- Existing projects may already have several runs for one call. Give the
-- oldest run version 1 so the newest historical run receives the highest
-- version before the uniqueness constraint is added.
with ranked as (
  select
    id,
    row_number() over (
      partition by call_id
      order by created_at asc, id asc
    )::integer as inferred_version
  from public.analysis_runs
  where version is null
)
update public.analysis_runs target
set version = ranked.inferred_version
from ranked
where target.id = ranked.id;

alter table public.analysis_runs alter column version set default 1;
alter table public.analysis_runs alter column version set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_runs_version_positive'
      and conrelid = 'public.analysis_runs'::regclass
  ) then
    alter table public.analysis_runs
      add constraint analysis_runs_version_positive check (version >= 1);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_runs_call_version_unique'
      and conrelid = 'public.analysis_runs'::regclass
  ) then
    alter table public.analysis_runs
      add constraint analysis_runs_call_version_unique unique (call_id, version);
  end if;
end;
$$;

create or replace view public.demo_strategy_cards
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
  s.confidence,
  ar.version as analysis_version
from public.calls ca
join public.customers c on c.id = ca.customer_id
join lateral (
  select candidate.*
  from public.analysis_runs candidate
  where candidate.call_id = ca.id
    and candidate.is_demo
    and candidate.status = 'completed'
  order by candidate.version desc, candidate.created_at desc, candidate.id desc
  limit 1
) ar on true
join public.strategies s
  on s.analysis_run_id = ar.id
  and s.rank = 1
  and s.is_demo
where ca.is_demo and c.is_demo;

grant select on public.demo_strategy_cards to anon, authenticated;
