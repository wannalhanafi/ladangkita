-- LadangKita · Stage 1 · security
-- Rule: you only see a plantation's data if you are one of its partners.

create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.plantation_id = p and m.user_id = auth.uid() and m.active)
$$;

create or replace function public.is_admin(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.plantation_id = p and m.user_id = auth.uid() and m.active and m.role = 'admin')
$$;

create or replace function public.my_member_id(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from members m where m.plantation_id = p and m.user_id = auth.uid() and m.active limit 1
$$;

-- After a partner signs in for the first time, link their login to the partner record with the same email.
create or replace function public.claim_membership() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update members set user_id = auth.uid()
   where user_id is null and lower(email) = lower(auth.email());
  get diagnostics n = row_count;
  return n;
end $$;

-- Only the admin may change a partner's role or capital.
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.capital is distinct from old.capital or new.active is distinct from old.active)
     and not public.is_admin(old.plantation_id) then
    raise exception 'Only the admin partner can change role, capital or active status';
  end if;
  return new;
end $$;
create trigger members_guard before update on public.members for each row execute function public.guard_member_update();

-- A claim must be marked paid by a different partner from the one who claimed.
create or replace function public.guard_claim_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Paid' and old.status is distinct from 'Paid' then
    new.paid_by := public.my_member_id(new.plantation_id);
    if new.paid_by is null or new.paid_by = new.member_id then
      raise exception 'A claim must be marked paid by another partner';
    end if;
    new.paid_on := coalesce(new.paid_on, current_date);
  end if;
  return new;
end $$;
create trigger claims_guard before update on public.claims for each row execute function public.guard_claim_paid();

-- Turn on row security and add the standard rules to every plantation table.
do $$
declare t text;
begin
  foreach t in array array['blocks','batches','batch_blocks','crop_templates','cost_categories','contractors','buyers','suppliers',
    'agencies','agency_requirements','grants','material_receipts','material_uses','purchases','jobs','job_batches','job_blocks',
    'contractor_payments','payment_jobs','harvest_picks','pick_batches','buyer_receipts','receipt_picks','expenses','claims',
    'claim_expenses','alerts','alert_actions','map_marks','attachments','reports','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "partners read" on public.%I for select to authenticated using (public.is_member(plantation_id))', t);
    execute format('create policy "partners add" on public.%I for insert to authenticated with check (public.is_member(plantation_id))', t);
    execute format('create policy "partners edit" on public.%I for update to authenticated using (public.is_member(plantation_id)) with check (public.is_member(plantation_id))', t);
    execute format('create policy "admin deletes" on public.%I for delete to authenticated using (public.is_admin(plantation_id))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Plantations: partners read; admin edits; anyone signed in may create a new plantation (for future customers).
alter table public.plantations enable row level security;
create policy "partners read" on public.plantations for select to authenticated using (public.is_member(id));
create policy "admin edits" on public.plantations for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
grant select, update on public.plantations to authenticated;

-- Members: partners see each other; admin adds and removes; a partner may edit their own phone and name.
alter table public.members enable row level security;
create policy "partners read" on public.members for select to authenticated using (public.is_member(plantation_id) or user_id = auth.uid());
create policy "admin adds" on public.members for insert to authenticated with check (public.is_admin(plantation_id));
create policy "admin or self edits" on public.members for update to authenticated
  using (public.is_admin(plantation_id) or user_id = auth.uid()) with check (public.is_admin(plantation_id) or user_id = auth.uid());
create policy "admin deletes" on public.members for delete to authenticated using (public.is_admin(plantation_id));
grant select, insert, update, delete on public.members to authenticated;

-- Private partner details (IC, bank, address): admin, or the partner themself, only.
alter table public.member_private enable row level security;
create policy "admin or self reads" on public.member_private for select to authenticated
  using (public.is_admin(plantation_id) or member_id = public.my_member_id(plantation_id));
create policy "admin or self adds" on public.member_private for insert to authenticated
  with check (public.is_admin(plantation_id) or member_id = public.my_member_id(plantation_id));
create policy "admin or self edits" on public.member_private for update to authenticated
  using (public.is_admin(plantation_id) or member_id = public.my_member_id(plantation_id))
  with check (public.is_admin(plantation_id) or member_id = public.my_member_id(plantation_id));
grant select, insert, update on public.member_private to authenticated;

-- Nothing is open to people who are not signed in.
revoke all on all tables in schema public from anon;
grant execute on function public.claim_membership() to authenticated;

-- Private file store: photos, receipts and reports, in a folder per plantation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy "partners read files" on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "partners add files" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "admin deletes files" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.is_admin(((storage.foldername(name))[1])::uuid));
