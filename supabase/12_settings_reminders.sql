-- Settings and reminders
-- 1) Each partner's own notification choices: { "claim": false, "job_days": 3, ... } – missing keys mean "on" with the default timing.
alter table public.members add column if not exists notify jsonb not null default '{}'::jsonb;

-- 2) Next land rent date (reminder before it; rolled forward by the rent period once it has passed).
alter table public.plantations add column if not exists rent_due_on date;

-- 3) Tell the other partners straight away when a claim is submitted.
create or replace function public.notify_new_claim() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  select value into v_token from public.app_secrets where name = 'hook_token';
  perform net.http_post(
    url := 'https://qrxmeuutobncpwgdvtgo.supabase.co/functions/v1/notify-alert',
    body := jsonb_build_object('claim_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-lk-token', v_token));
  return new;
exception when others then
  return new; -- a notification problem must never block saving the claim
end $$;
revoke execute on function public.notify_new_claim() from public, anon, authenticated;
drop trigger if exists claims_notify on public.claims;
create trigger claims_notify after insert on public.claims for each row execute function public.notify_new_claim();

-- 4) Daily reminders at 08:05 Malaysia time (00:05 UTC): jobs due or late, claims waiting, rent, buyers overdue, lease, Monday summary.
create extension if not exists pg_cron;
create or replace function public.lk_daily_ping() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  select value into v_token from public.app_secrets where name = 'hook_token';
  perform net.http_post(
    url := 'https://qrxmeuutobncpwgdvtgo.supabase.co/functions/v1/notify-alert',
    body := jsonb_build_object('action', 'daily'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-lk-token', v_token),
    timeout_milliseconds := 30000);
end $$;
revoke execute on function public.lk_daily_ping() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'lk-daily-reminders';
select cron.schedule('lk-daily-reminders', '5 0 * * *', 'select public.lk_daily_ping()');
