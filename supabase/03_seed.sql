-- LadangKita · Stage 1 · real data from the planter's records (Kronologi Penanaman Nanas, Lakaran Kebun)
do $$
declare
  p uuid; b1 uuid; b2 uuid; b3 uuid; b4 uuid; lp uuid; g uuid; r uuid; j uuid;
  bt uuid[] := '{}';
  i int;
begin
  insert into plantations (name, area_acres, length_m, width_m, currency, started_on)
  values ('Kebun Nenas', 4.48, 159, 114, 'MYR', '2025-09-11') returning id into p;

  insert into settings (plantation_id) values (p);

  insert into blocks (plantation_id, code, name, est_acres, sort, notes) values
    (p, '1', 'Blok 1', 1.11, 1, 'Fully planted'),
    (p, '2', 'Blok 2', 1.22, 2, 'Has the pond (kolam)'),
    (p, '3', 'Blok 3', 1.10, 3, 'Planted at the top only; rest not planted yet'),
    (p, '4', 'Blok 4', 1.06, 4, 'Planted at the top only; rest not planted yet');
  select id into b1 from blocks where plantation_id = p and code = '1';
  select id into b2 from blocks where plantation_id = p and code = '2';
  select id into b3 from blocks where plantation_id = p and code = '3';
  select id into b4 from blocks where plantation_id = p and code = '4';

  insert into batches (plantation_id, no, name, planted_on, finished_on, plants, material, source_note, est_acres) values
    (p, 1, 'Peringkat 1', '2025-09-11', null, 1600, 'Sulur', 'Bought: Hj. Mahmud', 0.09),
    (p, 2, 'Peringkat 2', '2025-09-19', '2025-09-22', 5000, 'Sulur', 'LPNM delivery 1', 0.27),
    (p, 3, 'Peringkat 3', '2025-10-08', '2025-10-10', 10360, 'Sulur 10,000 + jambul 360', 'LPNM delivery 2 + 360 free crowns', 0.57),
    (p, 4, 'Peringkat 4', '2025-10-13', '2025-10-17', 5500, 'Sulur', 'LPNM delivery 3', 0.36),
    (p, 5, 'Peringkat 5', '2025-10-26', null, 1400, 'Sulur', 'Bought: Hj. Mahmud', 0.08),
    (p, 6, 'Peringkat 6', '2025-11-08', null, 5000, 'Sulur', 'LPNM delivery 4', 0.36),
    (p, 7, 'Peringkat 7', '2025-11-13', null, 8500, 'Sulur', 'LPNM delivery 5', 0.61),
    (p, 8, 'Peringkat 8', '2025-12-10', null, 4400, 'Jambul', 'Bought: Jutawan Enterprise (M)', 0.24),
    (p, 9, 'Peringkat 9', '2026-02-12', null, 1300, 'Sulur', 'Bought: Parlan', 0.07),
    (p, 10, 'Peringkat 10', '2026-03-12', null, 1000, 'Sulur', 'Bought: MARDI', 0.06);
  for i in 1..10 loop
    bt := bt || (select id from batches where plantation_id = p and no = i);
  end loop;

  insert into batch_blocks (batch_id, block_id, plantation_id, plants) values
    (bt[1], b1, p, 1600), (bt[2], b1, p, 5000), (bt[3], b1, p, 10360), (bt[4], b1, p, 2000), (bt[5], b1, p, 1400),
    (bt[4], b2, p, 3500), (bt[6], b2, p, 5000), (bt[7], b2, p, 8500),
    (bt[9], b3, p, 1300), (bt[10], b3, p, 1000),
    (bt[8], b4, p, 4400);

  insert into agencies (plantation_id, name, type, programme)
  values (p, 'LPNM (Lembaga Perindustrian Nanas Malaysia)', 'Government agency', 'Free suckers') returning id into lp;
  insert into agency_requirements (agency_id, plantation_id, text, done) values (lp, p, 'Registered as a grower with LPNM (to confirm)', true);

  insert into grants (plantation_id, ref, agency_id, title, status, quantity, value_note, conditions)
  values (p, 'GR-001', lp, 'LPNM free suckers', 'Completed', '34,000 sulur in 5 deliveries', 'Free, no charge', 'None') returning id into g;

  -- planting material received
  insert into material_receipts (plantation_id, ref, received_on, source, how, type, qty, grant_id, notes) values
    (p, 'BT-01', null, 'Hj. Mahmud', 'Bought', 'Sulur', 1600, null, 'Planted 11 Sep 2025'),
    (p, 'BT-02', '2025-09-18', 'LPNM', 'Grant', 'Sulur', 5000, g, 'LPNM delivery 1'),
    (p, 'BT-03', '2025-10-07', 'LPNM', 'Grant', 'Sulur', 10000, g, 'LPNM delivery 2'),
    (p, 'BT-04', null, 'Pineapple seller, Wangsa Maju', 'Free', 'Jambul', 360, null, 'Free crowns'),
    (p, 'BT-05', '2025-10-13', 'LPNM', 'Grant', 'Sulur', 5500, g, 'LPNM delivery 3'),
    (p, 'BT-06', null, 'Hj. Mahmud', 'Bought', 'Sulur', 1400, null, 'Planted 26 Oct 2025'),
    (p, 'BT-07', '2025-11-07', 'LPNM', 'Grant', 'Sulur', 5000, g, 'LPNM delivery 4'),
    (p, 'BT-08', '2025-11-12', 'LPNM', 'Grant', 'Sulur', 8500, g, 'LPNM delivery 5'),
    (p, 'BT-09', '2025-11-24', 'Jutawan Enterprise (M)', 'Bought', 'Jambul', 4400, null, 'Planted 10 Dec 2025'),
    (p, 'BT-10', null, 'Parlan', 'Bought', 'Sulur', 1700, null, '1,300 planted in P9; 400 used for sulam'),
    (p, 'BT-11', null, 'MARDI', 'Bought', 'Sulur', 1000, null, 'Planted 12 Mar 2026');

  insert into material_uses (receipt_id, plantation_id, batch_id, use, qty)
  select mr.id, p, bt[u.batch_no], u.use, u.qty
  from (values ('BT-01', 1, 'Planting', 1600), ('BT-02', 2, 'Planting', 5000), ('BT-03', 3, 'Planting', 10000), ('BT-04', 3, 'Planting', 360),
               ('BT-05', 4, 'Planting', 5500), ('BT-06', 5, 'Planting', 1400), ('BT-07', 6, 'Planting', 5000), ('BT-08', 7, 'Planting', 8500),
               ('BT-09', 8, 'Planting', 4400), ('BT-10', 9, 'Planting', 1300), ('BT-11', 10, 'Planting', 1000)) as u(ref, batch_no, use, qty)
  join material_receipts mr on mr.plantation_id = p and mr.ref = u.ref;
  insert into material_uses (receipt_id, plantation_id, batch_id, use, qty)
  select id, p, null, 'Sulam', 400 from material_receipts where plantation_id = p and ref = 'BT-10';

  -- purchases waiting for prices
  insert into purchases (plantation_id, ref, category, item, supplier, amount, date_note, for_batches, material_receipt_id)
  select p, x.ref, x.cat, x.item, x.sup, null, x.dn, x.fb, mr.id
  from (values ('PB-001', 'BT-01', 'Beli Sulur', '1,600 sulur', 'Hj. Mahmud', 'Sep 2025', 'P1'),
               ('PB-002', 'BT-06', 'Beli Sulur', '1,400 sulur', 'Hj. Mahmud', 'Oct 2025', 'P5'),
               ('PB-003', 'BT-09', 'Beli Jambul', '4,400 jambul', 'Jutawan Enterprise (M)', '24 Nov 2025', 'P8'),
               ('PB-004', 'BT-10', 'Beli Sulur', '1,700 sulur', 'Parlan', 'Feb 2026', 'P9 + sulam'),
               ('PB-005', 'BT-11', 'Beli Sulur', '1,000 sulur', 'MARDI', 'Mar 2026', 'P10')) as x(ref, br, cat, item, sup, dn, fb)
  join material_receipts mr on mr.plantation_id = p and mr.ref = x.br;

  -- cost categories
  insert into cost_categories (plantation_id, grp, name, sort)
  select p, c.grp, c.name, c.sort from (values
    ('Beli', 'Beli Sulur', 1), ('Beli', 'Beli Jambul', 2), ('Beli', 'Beli Baja', 3), ('Beli', 'Beli Racun Serangga/Kulat', 4), ('Beli', 'Beli Racun Rumput', 5), ('Beli', 'Beli Hormon', 6), ('Beli', 'Beli Peralatan', 7),
    ('Upah', 'Upah Tanam', 11), ('Upah', 'Upah Sulam', 12), ('Upah', 'Upah Sembur Baja', 13), ('Upah', 'Upah Tabur Baja', 14), ('Upah', 'Upah Sembur Racun Serangga/Kulat', 15),
    ('Upah', 'Upah Racun Rumput', 16), ('Upah', 'Upah Hormon', 17), ('Upah', 'Upah Tuai', 18), ('Upah', 'Upah Gali Parit', 19), ('Upah', 'Upah Lain-lain', 20),
    ('Lain', 'Sewa Tanah', 31), ('Lain', 'Pengangkutan', 32), ('Lain', 'Perbelanjaan Rakan Kongsi', 33), ('Lain', 'Lain-lain', 34)) as c(grp, name, sort);

  -- crop calendar templates (placeholders; partners set their own months)
  insert into crop_templates (plantation_id, variety, months_to_induction, months_induction_to_harvest, fruit_per_acre, tasks) values
    (p, 'MD2', 9, 5, null, '[]'), (p, 'Josapine', 8, 5, null, '[]'), (p, 'Morris', 10, 5, null, '[]');

  -- work done, from the planter's timeline (contractor and cost still to enter)
  for i in 1..10 loop
    insert into jobs (plantation_id, ref, category, start_on, date_note, status, products, method, contractor_name, note)
    select p, 'J-' || lpad(i::text, 3, '0'), x.cat, x.d::date, x.dn, x.st, x.prod, x.meth, null, x.note
    from (values
      (1, 'Upah Sembur Baja', '2025-10-25', null, 'Done', 'Urea + kapur; Malathion', 'Sembur', null),
      (2, 'Upah Sembur Baja', '2025-10-27', null, 'Done', 'Baja organik Azman', 'Sembur', null),
      (3, 'Upah Tabur Baja', '2025-12-15', null, 'Done', 'Vintage 15-15-15 + TE', 'Tabur', null),
      (4, 'Upah Sembur Baja', '2026-01-13', null, 'Done', 'Urea + kapur; Malathion', 'Sembur', null),
      (5, 'Upah Tabur Baja', '2026-01-20', null, 'Done', 'Vintage 15-15-15 + TE', 'Tabur', null),
      (6, 'Upah Sembur Baja', '2026-01-25', null, 'Done', 'Urea + kapur; Malathion', 'Sembur', null),
      (7, 'Upah Tabur Baja', '2026-02-23', null, 'Done', 'Vintage 15-15-15', 'Tabur', null),
      (8, 'Upah Sembur Baja', '2026-05-25', null, 'Done', 'Urea + kapur', 'Sembur', null),
      (9, 'Upah Sembur Baja', '2026-05-26', null, 'Done', 'Urea + kapur; Malathion', 'Sembur', null),
      (10, 'Upah Hormon', null, 'Week of 1 Dec 2026', 'Planned', 'Hormon', 'Manual', 'Flower induction for the earlier plants')
    ) as x(n, cat, d, dn, st, prod, meth, note) where x.n = i
    returning id into j;
    insert into job_batches (job_id, batch_id, plantation_id)
    select j, bt[k], p from unnest(case i
      when 1 then array[1,2] when 2 then array[1,2] when 3 then array[1,2]
      when 4 then array[3,4,5] when 5 then array[3,4,5] when 6 then array[6,7] when 7 then array[6,7]
      when 8 then array[1,2,3,4,5] when 9 then array[6,7,8,9,10] else array[1,2,3,4,5] end) as k;
  end loop;
end $$;
