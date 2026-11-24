-- LadangKita · Stage 4 · partner expenses and claims
-- A claim is made in one step; another partner marks it paid (rule from 02_security: guard_claim_paid).

alter table public.claims add column if not exists amount numeric(12,2) not null default 0;
create index if not exists expenses_member_idx on public.expenses (member_id);

-- Make a claim for one partner's unclaimed own-pocket expenses. The partner themself or the admin may do this.
create or replace function public.create_claim(p_expense_ids uuid[], p_note text default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_plant uuid; v_member uuid; v_total numeric; v_n int; v_mix int; v_ref text; v_id uuid;
begin
  if p_expense_ids is null or array_length(p_expense_ids, 1) is null then raise exception 'Choose at least one expense to claim'; end if;
  select count(*), min(plantation_id::text)::uuid, min(member_id::text)::uuid, sum(amount),
         count(distinct plantation_id) + count(distinct member_id) - 2 + (count(*) - count(member_id)) + count(*) filter (where paid_from_pool)
    into v_n, v_plant, v_member, v_total, v_mix
    from expenses where id = any(p_expense_ids);
  if v_n <> array_length(p_expense_ids, 1) then raise exception 'Some expenses were not found'; end if;
  if v_mix <> 0 or v_member is null then raise exception 'A claim is for one partner''s own-pocket expenses only'; end if;
  if not public.is_member(v_plant) then raise exception 'Not a partner of this plantation'; end if;
  if public.my_member_id(v_plant) is distinct from v_member and not public.is_admin(v_plant) then
    raise exception 'Only the partner who paid, or the admin, can claim these expenses';
  end if;
  if exists (select 1 from claim_expenses where expense_id = any(p_expense_ids)) then raise exception 'One of these expenses is already claimed'; end if;
  perform pg_advisory_xact_lock(hashtext('cl' || v_plant::text));
  select 'CL-' || lpad((coalesce(max(nullif(regexp_replace(ref, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
    into v_ref from claims where plantation_id = v_plant;
  insert into claims (plantation_id, ref, member_id, amount, note) values (v_plant, v_ref, v_member, v_total, p_note) returning id into v_id;
  insert into claim_expenses (claim_id, expense_id, plantation_id) select v_id, unnest(p_expense_ids), v_plant;
  return v_id;
end $$;

-- Withdraw an unpaid claim (the claimant or the admin). Its expenses become unclaimed again.
create or replace function public.withdraw_claim(p_claim uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare c claims%rowtype;
begin
  select * into c from claims where id = p_claim;
  if c.id is null or not public.is_member(c.plantation_id) then raise exception 'Claim not found'; end if;
  if c.status <> 'Claimed' then raise exception 'This claim is already paid. Ask the admin partner to mark it unpaid first.'; end if;
  if public.my_member_id(c.plantation_id) is distinct from c.member_id and not public.is_admin(c.plantation_id) then
    raise exception 'Only the partner who claimed, or the admin, can withdraw this claim';
  end if;
  delete from claims where id = p_claim;  -- its claim_expenses links go with it
end $$;

-- Admin only: a claim marked paid by mistake goes back to unpaid.
create or replace function public.reopen_claim(p_claim uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare v_plant uuid;
begin
  select plantation_id into v_plant from claims where id = p_claim;
  if v_plant is null then raise exception 'Claim not found'; end if;
  if not public.is_admin(v_plant) then raise exception 'Only the admin partner can mark a claim unpaid'; end if;
  update claims set status = 'Claimed', paid_on = null, paid_by = null where id = p_claim;
end $$;

-- A claim keeps its partner and amount; once paid, only the admin may change it.
create or replace function public.guard_claim_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is distinct from old.member_id or new.amount is distinct from old.amount then
    raise exception 'A claim''s partner and amount cannot be changed. Withdraw it and claim again.';
  end if;
  if old.status = 'Paid' and not public.is_admin(old.plantation_id) then
    raise exception 'This claim is paid. Only the admin partner can change it.';
  end if;
  return new;
end $$;
drop trigger if exists claims_lock on public.claims;
create trigger claims_lock before update on public.claims for each row execute function public.guard_claim_edit();

-- A claimed expense keeps its amount, partner, date and type; withdraw the claim first to change them.
create or replace function public.guard_claimed_expense() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from claim_expenses where expense_id = old.id)
     and (new.amount, new.member_id, new.paid_from_pool, new.spent_on, new.type)
         is distinct from (old.amount, old.member_id, old.paid_from_pool, old.spent_on, old.type) then
    raise exception 'This expense is in a claim. Withdraw the claim first to change it.';
  end if;
  return new;
end $$;
drop trigger if exists expenses_claim_guard on public.expenses;
create trigger expenses_claim_guard before update on public.expenses for each row execute function public.guard_claimed_expense();

revoke execute on function public.create_claim(uuid[], text), public.withdraw_claim(uuid), public.reopen_claim(uuid),
  public.guard_claim_edit(), public.guard_claimed_expense() from public, anon;
revoke execute on function public.guard_claim_edit(), public.guard_claimed_expense() from authenticated;
grant execute on function public.create_claim(uuid[], text), public.withdraw_claim(uuid), public.reopen_claim(uuid) to authenticated;
