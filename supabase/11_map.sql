-- Stage 7d: Map
-- 1) Order of each peringkat inside a blok on the sketch (1 = top, next to the back of the lot; the road is at the bottom).
alter table public.batch_blocks add column if not exists map_order int;

-- Default order: planting number. Blok 2 follows the planter's sketch: P7 at the top, then P6, then the Blok 2 part of P4.
update public.batch_blocks x set map_order = b.no
from public.batches b where b.id = x.batch_id and x.map_order is null;
update public.batch_blocks x set map_order = case b.no when 7 then 1 when 6 then 2 when 4 then 3 end
from public.batches b, public.blocks k
where b.id = x.batch_id and k.id = x.block_id and k.code = '2' and b.no in (4, 6, 7);

-- 2) A partner may delete a mark they made (the admin may delete any, from the standard rules).
create policy "creator deletes" on public.map_marks for delete to authenticated
  using (public.is_member(plantation_id) and created_by = public.my_member_id(plantation_id));

-- 3) The pond (kolam) in Blok 2 as a Water mark (x and y are 0–1 across the sketch, left→right and back→road).
insert into public.map_marks (plantation_id, type, x, y, note)
select k.plantation_id, 'Water', 0.49, 0.46, 'Kolam (pond)'
from public.blocks k
where k.code = '2' and not exists (select 1 from public.map_marks m where m.plantation_id = k.plantation_id and m.note = 'Kolam (pond)');

-- 4) Tidy-up from Stage 7b: register pg_net under the extensions schema instead of public.
--    Its functions stay in schema "net", so the alert trigger (net.http_post) keeps working.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
