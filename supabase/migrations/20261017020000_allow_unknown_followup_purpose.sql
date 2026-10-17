-- The analyzer can identify an action without enough evidence to state why it
-- should be done. Preserve that uncertainty instead of inventing a purpose.
alter table public.follow_up_actions
  alter column purpose drop not null;
