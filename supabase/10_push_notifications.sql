-- LadangKita · Stage 7b · phone notifications for urgent alerts
-- When an alert row is added (online or synced from offline), the database asks the notify-alert Edge Function
-- to send a phone notification to every other partner who turned notifications on.

create extension if not exists pg_net;

-- Private values used only by the database and the Edge Function (never by the app). No policies = no app access.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value) values ('hook_token', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- One row per phone that turned notifications on.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  plantation_id uuid not null references public.plantations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own phones read" on public.push_subscriptions for select to authenticated
  using (member_id = public.my_member_id(plantation_id));
create policy "own phones add" on public.push_subscriptions for insert to authenticated
  with check (member_id = public.my_member_id(plantation_id));
create policy "own phones edit" on public.push_subscriptions for update to authenticated
  using (member_id = public.my_member_id(plantation_id)) with check (member_id = public.my_member_id(plantation_id));
create policy "own phones remove" on public.push_subscriptions for delete to authenticated
  using (member_id = public.my_member_id(plantation_id));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- New alert -> ask the Edge Function to notify partners. Never blocks or fails the alert itself.
create or replace function public.notify_new_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_token text;
begin
  select value into v_token from app_secrets where name = 'hook_token';
  begin
    perform net.http_post(
      url := 'https://qrxmeuutobncpwgdvtgo.supabase.co/functions/v1/notify-alert',
      body := jsonb_build_object('alert_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-lk-token', v_token),
      timeout_milliseconds := 8000);
  exception when others then
    raise log 'notify_new_alert: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists alerts_notify on public.alerts;
create trigger alerts_notify after insert on public.alerts for each row execute function public.notify_new_alert();
revoke execute on function public.notify_new_alert() from public, anon, authenticated;
