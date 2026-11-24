-- LadangKita · Stage 3 · sales: harvest picks and money received from buyers
-- Money received is recorded in one step: receipt row + linked picks, or nothing at all.

alter table public.buyer_receipts add column if not exists amount numeric(12,2) not null default 0;
alter table public.buyer_receipts add column if not exists note text;
create index if not exists pick_batches_batch_idx on public.pick_batches (batch_id);
create index if not exists harvest_picks_buyer_idx on public.harvest_picks (buyer_id);

-- Record money received from one buyer for picks not yet paid.
create or replace function public.record_buyer_receipt(p_pick_ids uuid[], p_received_by text, p_method text, p_received_on date default current_date, p_note text default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_plant uuid; v_buyer uuid; v_name text; v_total numeric; v_n int; v_mix int; v_ref text; v_id uuid;
begin
  if p_pick_ids is null or array_length(p_pick_ids, 1) is null then raise exception 'Choose at least one harvest pick'; end if;
  select count(*), min(plantation_id::text)::uuid, min(buyer_id::text)::uuid,
         sum(grade_a * price_a + grade_b * price_b + grade_c * price_c),
         count(distinct plantation_id) + count(distinct buyer_id) - 2 + (count(*) - count(buyer_id))
    into v_n, v_plant, v_buyer, v_total, v_mix
    from harvest_picks where id = any(p_pick_ids);
  if v_n <> array_length(p_pick_ids, 1) then raise exception 'Some picks were not found'; end if;
  if v_mix <> 0 or v_buyer is null then raise exception 'All picks in one payment must be for the same buyer'; end if;
  if not public.is_member(v_plant) then raise exception 'Not a partner of this plantation'; end if;
  if exists (select 1 from receipt_picks where pick_id = any(p_pick_ids)) then raise exception 'One of these picks is already paid'; end if;
  select name into v_name from buyers where id = v_buyer;
  perform pg_advisory_xact_lock(hashtext('rc' || v_plant::text));
  select 'RC-' || lpad((coalesce(max(nullif(regexp_replace(ref, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
    into v_ref from buyer_receipts where plantation_id = v_plant;
  insert into buyer_receipts (plantation_id, ref, buyer_id, buyer_name, received_on, received_by, method, amount, note, created_by)
  values (v_plant, v_ref, v_buyer, v_name, coalesce(p_received_on, current_date), p_received_by, p_method, v_total, p_note, public.my_member_id(v_plant))
  returning id into v_id;
  insert into receipt_picks (receipt_id, pick_id, plantation_id) select v_id, unnest(p_pick_ids), v_plant;
  return v_id;
end $$;

-- Admin only: cancel money received recorded by mistake; its picks become unpaid again.
create or replace function public.cancel_buyer_receipt(p_receipt uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare v_plant uuid;
begin
  select plantation_id into v_plant from buyer_receipts where id = p_receipt;
  if v_plant is null then raise exception 'Payment not found'; end if;
  if not public.is_admin(v_plant) then raise exception 'Only the admin partner can cancel a payment'; end if;
  delete from buyer_receipts where id = p_receipt;  -- its receipt_picks links go with it
end $$;

-- A paid pick keeps its fruit counts, prices and buyer; cancel the payment first to change them.
create or replace function public.guard_paid_pick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from receipt_picks where pick_id = old.id)
     and (new.grade_a, new.grade_b, new.grade_c, new.price_a, new.price_b, new.price_c, new.buyer_id)
         is distinct from (old.grade_a, old.grade_b, old.grade_c, old.price_a, old.price_b, old.price_c, old.buyer_id) then
    raise exception 'This pick is already paid. Cancel the payment first to change fruit, prices or buyer.';
  end if;
  return new;
end $$;
drop trigger if exists picks_paid_guard on public.harvest_picks;
create trigger picks_paid_guard before update on public.harvest_picks for each row execute function public.guard_paid_pick();

revoke execute on function public.record_buyer_receipt(uuid[], text, text, date, text), public.cancel_buyer_receipt(uuid), public.guard_paid_pick() from public, anon;
revoke execute on function public.guard_paid_pick() from authenticated;
grant execute on function public.record_buyer_receipt(uuid[], text, text, date, text), public.cancel_buyer_receipt(uuid) to authenticated;
