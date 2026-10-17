-- Fictional data for the public hackathon demo. No real customer PII.
-- Abort rather than converting a colliding real row into public demo data.

begin;

do $$
begin
  if exists (
    select 1 from public.customers where id in ('cust_acme', 'cust_brightcare', 'cust_northstar') and not is_demo
    union all
    select 1 from public.contacts where id in ('contact_acme', 'contact_brightcare', 'contact_northstar') and not is_demo
    union all
    select 1 from public.products where id = 'product_sales_copilot' and not is_demo
    union all
    select 1 from public.opportunities where id in ('opp_acme', 'opp_brightcare', 'opp_northstar') and not is_demo
    union all
    select 1 from public.calls where id in ('call_acme', 'call_brightcare', 'call_northstar') and not is_demo
    union all
    select 1 from public.transcript_turns where id in (
      'acme_t1', 'acme_t2', 'acme_t3', 'bright_t1', 'bright_t2', 'bright_t3',
      'north_t1', 'north_t2', 'north_t3'
    ) and not is_demo
    union all
    select 1 from public.analysis_runs where id in ('run_acme_v1', 'run_brightcare_v1', 'run_northstar_v1') and not is_demo
    union all
    select 1 from public.objections where id in ('obj_acme', 'obj_bright', 'obj_north') and not is_demo
    union all
    select 1 from public.strategies where id in ('strat_acme', 'strat_bright', 'strat_north') and not is_demo
    union all
    select 1 from public.follow_up_actions where id in ('action_acme_1', 'action_bright_1', 'action_north_1') and not is_demo
    union all
    select 1 from public.customer_messages where id in ('msg_acme', 'msg_bright', 'msg_north') and not is_demo
    union all
    select 1 from public.commercial_policies where id = 'policy_demo_v1' and not is_demo
  ) then
    raise exception 'Seed aborted: a reserved demo ID belongs to non-demo data';
  end if;
end;
$$;

insert into public.customers
  (id, company_name, industry, company_size, region, lifecycle_stage, account_owner, notes, is_demo)
values
  ('cust_acme', 'Acme Logistics', 'Logistics', '201-500', 'North America', 'Exploring', 'Eva',
   'Manual dispatch reporting creates delays, but the impact is not quantified yet.', true),
  ('cust_brightcare', 'BrightCare Clinics', 'Healthcare', '501-1000', 'North America', 'Comparing', 'Eva',
   'Annual value is accepted; current-quarter cash flow is the constraint.', true),
  ('cust_northstar', 'Northstar Analytics', 'Software', '51-200', 'North America', 'Ready to Buy', 'Eva',
   'Product, security, timing, and value are confirmed. Commercial terms are the last blocker.', true)
on conflict (id) do update set
  company_name = excluded.company_name,
  lifecycle_stage = excluded.lifecycle_stage,
  notes = excluded.notes,
  is_demo = true;

insert into public.contacts
  (id, customer_id, full_name, job_title, email, decision_role, is_primary, is_demo)
values
  ('contact_acme', 'cust_acme', 'Jordan Lee', 'Operations Director', 'jordan@example.invalid', 'champion', true, true),
  ('contact_brightcare', 'cust_brightcare', 'Priya Shah', 'Finance Director', 'priya@example.invalid', 'economic_buyer', true, true),
  ('contact_northstar', 'cust_northstar', 'Marco Ruiz', 'VP Revenue Operations', 'marco@example.invalid', 'economic_buyer', true, true)
on conflict (id) do update set is_demo = true;

insert into public.products
  (id, name, description, list_price_note, active, is_demo)
values
  ('product_sales_copilot', 'Sales Conversation Copilot',
   'Realtime call guidance plus post-call analysis and strategic follow-up.',
   'Demo pricing comes from commercial policy, never model invention.', true, true)
on conflict (id) do update set is_demo = true;

insert into public.opportunities
  (id, customer_id, product_id, name, stage, status, economic_buyer_contact_id,
   champion_contact_id, next_decision_event, is_demo)
values
  ('opp_acme', 'cust_acme', 'product_sales_copilot', 'Acme sales workflow', 'Exploring', 'open', null,
   'contact_acme', null, true),
  ('opp_brightcare', 'cust_brightcare', 'product_sales_copilot', 'BrightCare rollout', 'Comparing', 'open',
   'contact_brightcare', null, 'Confirm approved payment structure', true),
  ('opp_northstar', 'cust_northstar', 'product_sales_copilot', 'Northstar revenue team', 'Ready to Buy', 'open',
   'contact_northstar', 'contact_northstar', 'Resolve final commercial terms', true)
on conflict (id) do update set stage = excluded.stage, next_decision_event = excluded.next_decision_event, is_demo = true;

insert into public.calls
  (id, customer_id, opportunity_id, primary_contact_id, title, source, status, started_at, ended_at, is_demo)
values
  ('call_acme', 'cust_acme', 'opp_acme', 'contact_acme', 'Discovery call', 'demo', 'completed',
   '2026-10-15T17:00:00Z', '2026-10-15T17:20:00Z', true),
  ('call_brightcare', 'cust_brightcare', 'opp_brightcare', 'contact_brightcare', 'Commercial review', 'demo', 'completed',
   '2026-10-16T18:00:00Z', '2026-10-16T18:25:00Z', true),
  ('call_northstar', 'cust_northstar', 'opp_northstar', 'contact_northstar', 'Final proposal review', 'demo', 'completed',
   '2026-10-17T16:00:00Z', '2026-10-17T16:30:00Z', true)
on conflict (id) do update set status = excluded.status, is_demo = true;

insert into public.transcript_turns
  (id, call_id, sequence_no, speaker_role, speaker_name, start_ms, end_ms, text, is_final, is_demo)
values
  ('acme_t1', 'call_acme', 1, 'customer', 'Jordan Lee', 0, 7000,
   'Our reps spend a lot of time creating dispatch reports manually.', true, true),
  ('acme_t2', 'call_acme', 2, 'seller', 'Eva', 7100, 14000,
   'We can automate those reports and give managers a live dashboard.', true, true),
  ('acme_t3', 'call_acme', 3, 'customer', 'Jordan Lee', 14100, 19000,
   'It sounds useful, but the price is higher than we expected.', true, true),
  ('bright_t1', 'call_brightcare', 1, 'customer', 'Priya Shah', 0, 8500,
   'The annual value works for us and the team wants the full rollout.', true, true),
  ('bright_t2', 'call_brightcare', 2, 'customer', 'Priya Shah', 8600, 15500,
   'The issue is that we cannot spend the full amount this quarter.', true, true),
  ('bright_t3', 'call_brightcare', 3, 'seller', 'Eva', 15600, 23000,
   'I will check what payment structures are available, but I cannot promise one yet.', true, true),
  ('north_t1', 'call_northstar', 1, 'customer', 'Marco Ruiz', 0, 7500,
   'The product, security review, and implementation plan all work for us.', true, true),
  ('north_t2', 'call_northstar', 2, 'customer', 'Marco Ruiz', 7600, 16000,
   'I am the final approver. If we can improve the commercial terms, we are ready to sign.', true, true),
  ('north_t3', 'call_northstar', 3, 'seller', 'Eva', 16100, 23000,
   'I can request an approved adjustment if we agree on a longer commitment, but I need manager approval.', true, true)
on conflict (id) do update set text = excluded.text, is_demo = true;

insert into public.analysis_runs
  (id, call_id, status, model_name, prompt_version, summary, purchase_stage, momentum,
   primary_blocker_category, primary_blocker_subtype, primary_blocker_summary, result_json, is_demo)
values
  ('run_acme_v1', 'call_acme', 'completed', 'demo-model', 'strategy-v1',
   'The buyer has not quantified the impact of manual reporting. Price was raised before ROI was established.',
   'Exploring', 'at_risk', 'price', 'value_gap',
   'Potential usefulness is understood, but measurable value is missing.',
   '{"missing_information":["Hours spent per week","Cost of reporting delays"]}', true),
  ('run_brightcare_v1', 'call_brightcare', 'completed', 'demo-model', 'strategy-v1',
   'The buyer accepts value and scope. The blocker is payment timing in the current quarter.',
   'Comparing', 'advancing', 'price', 'cash_flow',
   'The total value is acceptable; the customer cannot pay the full amount this quarter.',
   '{"missing_information":["Approved payment schedules","Finance approval process"]}', true),
  ('run_northstar_v1', 'call_northstar', 'completed', 'demo-model', 'strategy-v1',
   'Product and security evaluation are complete. Commercial terms are the final barrier.',
   'Ready to Buy', 'advancing', 'price', 'procurement_tactic',
   'The economic buyer is ready to sign if an approved commercial trade is reached.',
   '{"missing_information":["Manager-approved adjustment range"]}', true)
on conflict (id) do update set
  summary = excluded.summary,
  primary_blocker_subtype = excluded.primary_blocker_subtype,
  result_json = excluded.result_json,
  is_demo = true;

insert into public.strategies
  (id, analysis_run_id, rank, strategy_type, headline, why_now, objective, seller_move,
   customer_ask, suggested_language, why_not_alternative, commercial_move_type,
   seller_gives, customer_gives, approval_required, confidence, evidence_turn_id, is_demo)
values
  ('strat_acme', 'run_acme_v1', 1, 'quantify_business_case',
   'Quantify value before discussing discount',
   'The buyer described manual work but gave no measurable impact, so a discount may not solve the value gap.',
   'Connect the reporting problem to time, cost, and operational impact.',
   'Ask two impact questions before revisiting commercial terms.',
   'Estimate weekly hours and the consequence of delayed reports.',
   'How many hours does the team spend on these reports each week, and what happens when they are late?',
   'A discount would lower price without proving why the purchase matters.',
   'none', null, null, false, 0.91, 'acme_t3', true),
  ('strat_bright', 'run_brightcare_v1', 1, 'change_payment_terms',
   'Solve payment timing before reducing total price',
   'The buyer accepted annual value and full scope; the constraint is current-quarter cash flow.',
   'Preserve deal value while removing the timing barrier.',
   'Check policy and present one authorized payment schedule.',
   'Confirm that payment timing is the final blocker.',
   'If an approved payment schedule solves the quarter constraint, would the full rollout move forward?',
   'A lower total price does not directly address when cash leaves the budget.',
   'payment_schedule', 'Flexible payment timing', 'Confirmation that total price and scope are accepted',
   true, 0.94, 'bright_t2', true),
  ('strat_north', 'run_northstar_v1', 1, 'conditional_discount',
   'Trade an approved adjustment for commitment',
   'Value, fit, timing, authority, and readiness are confirmed; commercial terms are the final blocker.',
   'Reach a balanced agreement without an unconditional concession.',
   'Request manager approval for a policy-compliant term-based adjustment.',
   'Commit to a longer term and confirm readiness to sign after approval.',
   'If an approved term-based adjustment is available, can we treat commercial terms as resolved and proceed?',
   'An unconditional discount gives away value without securing buyer commitment.',
   'term_commitment_discount', 'Policy-approved adjustment', 'Longer commitment and signature readiness',
   true, 0.89, 'north_t2', true)
on conflict (id) do update set
  strategy_type = excluded.strategy_type,
  headline = excluded.headline,
  commercial_move_type = excluded.commercial_move_type,
  is_demo = true;

insert into public.objections
  (id, analysis_run_id, call_id, category, subtype, status, evidence_turn_id, evidence_quote, resolution_note, is_demo)
values
  ('obj_acme', 'run_acme_v1', 'call_acme', 'price', 'value_gap', 'unresolved', 'acme_t3',
   'It sounds useful, but the price is higher than we expected.', null, true),
  ('obj_bright', 'run_brightcare_v1', 'call_brightcare', 'price', 'cash_flow', 'clarifying', 'bright_t2',
   'The issue is that we cannot spend the full amount this quarter.',
   'Seller committed only to checking authorized structures.', true),
  ('obj_north', 'run_northstar_v1', 'call_northstar', 'price', 'procurement_tactic', 'addressed', 'north_t2',
   'If we can improve the commercial terms, we are ready to sign.',
   'A conditional trade was proposed but still requires approval.', true)
on conflict (id) do update set status = excluded.status, is_demo = true;

insert into public.follow_up_actions
  (id, analysis_run_id, action_text, owner_type, owner_name, purpose, dependency,
   expected_customer_commitment, due_at, due_status, status, evidence_turn_id, is_demo)
values
  ('action_acme_1', 'run_acme_v1', 'Quantify weekly reporting effort and cost of delay', 'seller', 'Eva',
   'Establish the business case before negotiating price', null, 'Customer provides operating metrics',
   null, 'seller_to_confirm', 'open', 'acme_t3', true),
  ('action_bright_1', 'run_brightcare_v1', 'Check authorized payment schedule options', 'seller', 'Eva',
   'Remove the stated cash-flow blocker', 'Demo commercial policy',
   'Customer confirms total value remains acceptable', null, 'seller_to_confirm', 'open', 'bright_t3', true),
  ('action_north_1', 'run_northstar_v1', 'Request approval for a term-based adjustment', 'seller', 'Eva',
   'Prepare an authorized conditional offer', 'Longer commitment must be acceptable',
   'Customer confirms signature readiness', null, 'seller_to_confirm', 'open', 'north_t3', true)
on conflict (id) do update set action_text = excluded.action_text, is_demo = true;

insert into public.customer_messages
  (id, analysis_run_id, channel, subject, body, approval_status, is_demo)
values
  ('msg_acme', 'run_acme_v1', 'email', 'Next step on reporting impact',
   'Before revisiting pricing, let us quantify the team time and operational impact of the current reporting process.',
   'draft', true),
  ('msg_bright', 'run_brightcare_v1', 'email', 'Payment structure and agreed next step',
   'You confirmed the annual value and full rollout work. I will check authorized payment structures; could you confirm whether timing is the final blocker?',
   'draft', true),
  ('msg_north', 'run_northstar_v1', 'email', 'Final commercial step',
   'I will request approval for a term-based commercial adjustment. No adjustment is promised until approval is complete.',
   'draft', true)
on conflict (id) do update set body = excluded.body, is_demo = true;

insert into public.commercial_policies
  (id, name, description, policy_json, is_demo_only, active, is_demo)
values
  ('policy_demo_v1', 'Demo commercial policy',
   'Fictional policy for hackathon demonstration only.',
   '{"label":"DEMO_ONLY","allowed_moves":[{"type":"payment_schedule","approval_required":true},{"type":"phased_rollout","approval_required":true},{"type":"term_commitment_discount","approval_required":true},{"type":"scope_reduction","approval_required":false}],"rule":"Never generate a percentage or promise a concession without an approved value."}',
   true, true, true)
on conflict (id) do update set policy_json = excluded.policy_json, is_demo = true;

commit;
