-- LadangKita · Stage 2 · jobs and contractor payments
-- A payment is recorded in one step: payment row + linked jobs + jobs marked Paid, or nothing at all.

alter table public.contractor_payments add column if not exists amount numeric(12,2) not null default 0;
alter table public.contractor_payments add column if not exists note text;
create index if not exists job_batches_batch_idx on public.job_batches (batch_id);
create index if not exists jobs_contractor_idx on public.jobs (contractor_id);

-- Record a payment to one contractor for jobs that are done and priced ('To pay').
create or replace function public.record_contractor_payment(p_job_ids uuid[], p_paid_by text, p_method text, p_paid_on date default current_date, p_note text default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_plant uuid; v_contr uuid; v_name text; v_total numeric; v_n int; v_mix int; v_ref text; v_id uuid;
begin
  if p_job_ids is null or array_length(p_job_ids, 1) is null then raise exception 'Choose at least one job to pay'; end if;
  select count(*), min(plantation_id::text)::uuid, min(contractor_id::text)::uuid, sum(price),
         count(distinct plantation_id) + count(distinct contractor_id) - 2 + (count(*) - count(contractor_id))
    into v_n, v_plant, v_contr, v_total, v_mix
    from jobs where id = any(p_job_ids);
  if v_n <> array_length(p_job_ids, 1) then raise exception 'Some jobs were not found'; end if;
  if v_mix <> 0 or v_contr is null then raise exception 'All jobs in one payment must be for the same contractor'; end if;
  if not public.is_member(v_plant) then raise exception 'Not a partner of this plantation'; end if;
  if exists (select 1 from jobs where id = any(p_job_ids) and (status <> 'To pay' or price is null)) then
    raise exception 'Only jobs that are done and have a price can be paid';
  end if;
  if exists (select 1 from payment_jobs where job_id = any(p_job_ids)) then raise exception 'One of these jobs is already paid'; end if;
  select name into v_name from contractors where id = v_contr;
  perform pg_advisory_xact_lock(hashtext('pv' || v_plant::text));
  select 'PV-' || lpad((coalesce(max(nullif(regexp_replace(ref, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0')
    into v_ref from contractor_payments where plantation_id = v_plant;
  insert into contractor_payments (plantation_id, ref, contractor_id, contractor_name, paid_on, paid_by, method, amount, note, created_by)
  values (v_plant, v_ref, v_contr, v_name, coalesce(p_paid_on, current_date), p_paid_by, p_method, v_total, p_note, public.my_member_id(v_plant))
  returning id into v_id;
  insert into payment_jobs (payment_id, job_id, plantation_id) select v_id, unnest(p_job_ids), v_plant;
  update jobs set status = 'Paid' where id = any(p_job_ids);
  return v_id;
end $$;

-- Admin only: cancel a payment recorded by mistake; its jobs go back to 'To pay'.
create or replace function public.cancel_contractor_payment(p_payment uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare v_plant uuid; v_jobs uuid[];
begin
  select plantation_id into v_plant from contractor_payments where id = p_payment;
  if v_plant is null then raise exception 'Payment not found'; end if;
  if not public.is_admin(v_plant) then raise exception 'Only the admin partner can cancel a payment'; end if;
  select array_agg(job_id) into v_jobs from payment_jobs where payment_id = p_payment;
  delete from contractor_payments where id = p_payment;  -- its payment_jobs links go with it
  update jobs set status = 'To pay' where id = any(v_jobs);
end $$;

-- A paid job keeps its price and contractor; cancel the payment first to change them.
create or replace function public.guard_paid_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from payment_jobs where job_id = old.id)
     and (new.price is distinct from old.price or new.contractor_id is distinct from old.contractor_id or new.status <> 'Paid') then
    raise exception 'This job is already paid. Cancel the payment first to change its price, contractor or status.';
  end if;
  return new;
end $$;
drop trigger if exists jobs_paid_guard on public.jobs;
create trigger jobs_paid_guard before update on public.jobs for each row execute function public.guard_paid_job();

revoke execute on function public.record_contractor_payment(uuid[], text, text, date, text), public.cancel_contractor_payment(uuid), public.guard_paid_job() from public, anon;
revoke execute on function public.guard_paid_job() from authenticated;
grant execute on function public.record_contractor_payment(uuid[], text, text, date, text), public.cancel_contractor_payment(uuid) to authenticated;
