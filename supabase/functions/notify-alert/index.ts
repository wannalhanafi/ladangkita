// LadangKita · notify-alert
// - { action: 'key' }            -> the public key phones need to turn notifications on (no secret)
// - { action: 'test' } + login   -> a test notification to the signed-in partner's own phones
// - { alert_id } + x-lk-token    -> called by the database for every new urgent alert; notifies the other partners
// - { claim_id } + x-lk-token    -> a partner submitted an expense claim; tells the other partners
// - { action: 'daily' } + token  -> called by pg_cron at 08:05 Malaysia time: jobs due/late, claims waiting, rent, buyers overdue, lease, Monday summary
// Each partner chooses what they get in Settings → Notifications (members.notify; missing key = on, default timing).
// The private signing key is created on first use and kept in public.app_secrets (no app access).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
let KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); if (k.default) KEY = k.default; } catch (_) { /* keep the legacy key */ }
const admin = createClient(SB_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const APP = 'https://ladangkita.pages.dev';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function secret(name: string): Promise<string | null> {
  const { data } = await admin.from('app_secrets').select('value').eq('name', name).maybeSingle();
  return data?.value ?? null;
}

async function vapid(): Promise<string> {
  let pub = await secret('vapid_public');
  let priv = await secret('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await admin.from('app_secrets').upsert([{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }], { onConflict: 'name', ignoreDuplicates: true });
    pub = await secret('vapid_public');
    priv = await secret('vapid_private');
  }
  webpush.setVapidDetails(APP, pub!, priv!);
  return pub!;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
async function sendAll(subs: Sub[], payload: Record<string, unknown>) {
  await vapid();
  let sent = 0, removed = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 24 * 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await admin.from('push_subscriptions').delete().eq('id', s.id); removed++; }
      else { failed++; console.error('push failed', code, String(e)); }
    }
  }));
  return { sent, removed, failed };
}

// ---------- partners' own choices (Settings → Notifications) ----------
type Mem = { id: string; display_name?: string; notify?: Record<string, unknown> | null };
const DEFAULT_DAYS: Record<string, number> = { job: 3, rent: 7, buyer: 7, lease: 90 };
function wants(m: Mem, key: string) { return (m.notify ?? {})[key] !== false; }
function daysFor(m: Mem, key: string) { const v = Number((m.notify ?? {})[key + '_days']); return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAYS[key]; }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dstr = (d: string) => { const [y, m, x] = d.slice(0, 10).split('-').map(Number); return `${x} ${MON[m - 1]} ${y}`; };
const rm = (n: number) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const myToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()); // YYYY-MM-DD
const dayNo = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
const addMonths = (d: string, n: number) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, +d.slice(8, 10))); return x.toISOString().slice(0, 10); };

async function subsFor(memberIds: string[]) {
  if (!memberIds.length) return [] as (Sub & { member_id: string })[];
  const { data } = await admin.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth').in('member_id', memberIds);
  return (data ?? []) as (Sub & { member_id: string })[];
}

async function claimSubmitted(id: string) {
  const { data: c } = await admin.from('claims').select('id, ref, member_id, amount, plantation_id').eq('id', id).maybeSingle();
  if (!c) return { error: 'claim not found' };
  const { data: mems } = await admin.from('members').select('id, display_name, notify').eq('plantation_id', c.plantation_id).eq('active', true);
  const who = (mems ?? []).find((m) => m.id === c.member_id)?.display_name ?? 'A partner';
  const ids = (mems ?? []).filter((m) => m.id !== c.member_id && wants(m, 'claim')).map((m) => m.id);
  const subs = await subsFor(ids);
  if (!subs.length) return { sent: 0, note: 'nobody to tell' };
  return await sendAll(subs, { title: `Claim ${c.ref} waiting: ${rm(Number(c.amount))}`, body: `${who} paid from their own pocket and claimed it back. Another partner marks it paid.`, url: `${APP}/#cl-${c.ref}`, tag: 'lk-claim-' + c.ref });
}

type Msg = { key: string; title: string; body: string; url: string; tag: string; only?: string[]; not?: string };

async function daily(todayArg?: string, dry = false) {
  const today = todayArg ?? myToday();
  const t = dayNo(today);
  const monday = new Date(t * 86400000).getUTCDay() === 1;
  const { data: plants } = await admin.from('plantations').select('id, name, rent_amount, rent_period, rent_due_on, lease_ends_on');
  const out: unknown[] = [];
  for (const p of plants ?? []) {
    const P = p.id;
    const [{ data: mems }, { data: jobs }, { data: jb }, { data: batches }, { data: claims }, { data: picks }, { data: rp }, { data: rcs }, { data: pays }, { data: purchases }, { data: exps }] = await Promise.all([
      admin.from('members').select('id, display_name, notify').eq('plantation_id', P).eq('active', true),
      admin.from('jobs').select('id, ref, category, other_note, status, start_on, contractor_id, contractor_name, price').eq('plantation_id', P),
      admin.from('job_batches').select('job_id, batch_id').eq('plantation_id', P),
      admin.from('batches').select('id, no').eq('plantation_id', P),
      admin.from('claims').select('id, ref, member_id, amount, submitted_on, status').eq('plantation_id', P),
      admin.from('harvest_picks').select('id, ref, picked_on, buyer_name, grade_a, grade_b, grade_c, price_a, price_b, price_c').eq('plantation_id', P),
      admin.from('receipt_picks').select('pick_id').eq('plantation_id', P),
      admin.from('buyer_receipts').select('amount, received_on').eq('plantation_id', P),
      admin.from('contractor_payments').select('amount, paid_on').eq('plantation_id', P),
      admin.from('purchases').select('amount, purchased_on').eq('plantation_id', P),
      admin.from('expenses').select('amount, spent_on').eq('plantation_id', P),
    ]);
    const members = (mems ?? []) as Mem[];
    const msgs: Msg[] = [];
    const plots = (jobId: string) => (jb ?? []).filter((x) => x.job_id === jobId).map((x) => 'P' + ((batches ?? []).find((b) => b.id === x.batch_id)?.no ?? '?')).join(', ');
    const jname = (j: { category: string; other_note?: string | null }) => (j.category === 'Upah Lain-lain' && j.other_note ? 'Upah Lain-lain: ' + j.other_note : j.category);

    // jobs due in N days (each partner's own N) or late (the day after, then weekly)
    for (const j of jobs ?? []) {
      if (!['Planned', 'Quoted', 'In progress'].includes(j.status) || !j.start_on) continue;
      const until = dayNo(j.start_on) - t;
      const who = j.contractor_name ? `Contractor: ${j.contractor_name}.` : 'No contractor yet.';
      const where = plots(j.id) || 'no peringkat';
      if (until > 0) for (const m of members) { if (daysFor(m, 'job') === until) msgs.push({ key: 'job', only: [m.id], title: `Job due in ${until} day${until > 1 ? 's' : ''}: ${jname(j)}`, body: `${j.ref} · ${where} · ${dstr(j.start_on)}. ${who}`, url: `${APP}/#job-${j.ref}`, tag: 'lk-job-' + j.ref }); }
      else if (until < 0 && (-until) % 7 === 1) msgs.push({ key: 'job', title: `Job late: ${jname(j)}`, body: `${j.ref} · ${where} · was due ${dstr(j.start_on)}. ${who} Mark it done or change the date.`, url: `${APP}/#job-${j.ref}`, tag: 'lk-job-' + j.ref });
    }
    // claims still unpaid: weekly reminder to the other partners
    for (const c of claims ?? []) {
      if (c.status !== 'Claimed' || !c.submitted_on) continue;
      const age = t - dayNo(c.submitted_on);
      if (age > 0 && age % 7 === 0) msgs.push({ key: 'claim', not: c.member_id, title: `Claim ${c.ref} still unpaid: ${rm(Number(c.amount))}`, body: `Claimed by ${members.find((m) => m.id === c.member_id)?.display_name ?? 'a partner'} on ${dstr(c.submitted_on)}.`, url: `${APP}/#cl-${c.ref}`, tag: 'lk-claim-' + c.ref });
    }
    // buyers who have not paid: N days after the pick, then weekly
    const paidPicks = new Set((rp ?? []).map((x) => x.pick_id));
    for (const k of picks ?? []) {
      if (paidPicks.has(k.id)) continue;
      const age = t - dayNo(k.picked_on);
      const amt = k.grade_a * Number(k.price_a) + k.grade_b * Number(k.price_b) + k.grade_c * Number(k.price_c);
      for (const m of members) { const n = daysFor(m, 'buyer'); if (age === n || (age > n && (age - n) % 7 === 0)) msgs.push({ key: 'buyer', only: [m.id], title: `Buyer has not paid: ${rm(amt)}`, body: `${k.buyer_name ?? 'Buyer'} · ${k.ref} picked ${dstr(k.picked_on)} (${age} days ago).`, url: `${APP}/#pick-${k.ref}`, tag: 'lk-pick-' + k.ref }); }
    }
    // land rent: roll the date forward once it has passed, then remind N days before
    let due = p.rent_due_on as string | null;
    const step = p.rent_period === 'Month' ? 1 : p.rent_period === 'Year' ? 12 : 0;
    if (due && step) { let moved = false; while (dayNo(due) < t) { due = addMonths(due, step); moved = true; } if (moved && !dry) await admin.from('plantations').update({ rent_due_on: due }).eq('id', P); }
    if (due) for (const m of members) { if (dayNo(due) - t === daysFor(m, 'rent')) msgs.push({ key: 'rent', only: [m.id], title: `Land rent due ${dstr(due)}`, body: `${p.rent_amount != null ? rm(Number(p.rent_amount)) + ' · ' : ''}${p.name}. Record it in Finance once paid.`, url: `${APP}/#finance`, tag: 'lk-rent' }); }
    // lease ending
    if (p.lease_ends_on) for (const m of members) { const left = dayNo(p.lease_ends_on) - t; if (left === daysFor(m, 'lease')) msgs.push({ key: 'lease', only: [m.id], title: `Lease ends ${dstr(p.lease_ends_on)}`, body: `${p.name}: about ${Math.round(left / 30)} months left. Talk to the landowner about renewing.`, url: `${APP}/#settings-profile`, tag: 'lk-lease' }); }
    // Monday: last week in numbers
    if (monday) {
      const inWeek = (d?: string | null) => !!d && t - dayNo(d) >= 1 && t - dayNo(d) <= 7;
      const done = (jobs ?? []).filter((j) => ['Done', 'To pay', 'Paid'].includes(j.status) && inWeek(j.start_on)).length;
      const fruit = (picks ?? []).filter((k) => inWeek(k.picked_on)).reduce((s, k) => s + k.grade_a + k.grade_b + k.grade_c, 0);
      const inn = (rcs ?? []).filter((r) => inWeek(r.received_on)).reduce((s, r) => s + Number(r.amount || 0), 0);
      const outt = [...(pays ?? []).filter((x) => inWeek(x.paid_on)), ...(purchases ?? []).filter((x) => inWeek(x.purchased_on)), ...(exps ?? []).filter((x) => inWeek(x.spent_on))].reduce((s, x) => s + Number(x.amount || 0), 0);
      const open = (jobs ?? []).filter((j) => ['Planned', 'Quoted', 'In progress'].includes(j.status)).length;
      msgs.push({ key: 'weekly', title: `${p.name}: last week`, body: `${done} job(s) done · ${fruit.toLocaleString('en-MY')} fruit picked · in ${rm(inn)} · out ${rm(outt)} · ${open} job(s) still open.`, url: `${APP}/#`, tag: 'lk-weekly' });
    }

    // send each message to the partners who want it
    const subs = await subsFor(members.map((m) => m.id));
    const res: unknown[] = [];
    for (const g of msgs) {
      const to = members.filter((m) => wants(m, g.key) && (!g.only || g.only.includes(m.id)) && m.id !== g.not).map((m) => m.id);
      const s = subs.filter((x) => to.includes(x.member_id));
      res.push({ key: g.key, title: g.title, partners: to.length, phones: s.length, ...(dry || !s.length ? {} : await sendAll(s, { title: g.title, body: g.body, url: g.url, tag: g.tag })) });
    }
    out.push({ plantation: p.name, today, messages: res });
  }
  return { dry, out };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* empty body */ }

  try {
    if (body.action === 'key') return json({ publicKey: await vapid() });

    if (body.action === 'test') {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return json({ error: 'Please sign in again.' }, 401);
      const { data: mems } = await admin.from('members').select('id').eq('user_id', u.user.id).eq('active', true);
      const ids = (mems ?? []).map((m) => m.id);
      const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('member_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      if (!subs?.length) return json({ error: 'This phone is not signed up for notifications yet.' }, 400);
      const r = await sendAll(subs, { title: 'LadangKita test', body: 'Notifications work on this phone. Urgent alerts will arrive like this.', url: APP + '/#', tag: 'lk-test' });
      return json(r);
    }

    if (body.alert_id) {
      const token = req.headers.get('x-lk-token');
      if (!token || token !== (await secret('hook_token'))) return json({ error: 'not allowed' }, 401);
      const { data: a } = await admin.from('alerts').select('id, ref, type, location, urgency, description, reported_by, plantation_id').eq('id', body.alert_id).maybeSingle();
      if (!a) return json({ error: 'alert not found' }, 404);
      const [{ data: p }, { data: who }, { data: mems }] = await Promise.all([
        admin.from('plantations').select('name').eq('id', a.plantation_id).maybeSingle(),
        admin.from('members').select('display_name').eq('id', a.reported_by).maybeSingle(),
        admin.from('members').select('id, notify').eq('plantation_id', a.plantation_id).eq('active', true).neq('id', a.reported_by ?? '00000000-0000-0000-0000-000000000000'),
      ]);
      const ids = (mems ?? []).filter((m) => wants(m, 'alert')).map((m) => m.id);
      if (!ids.length) return json({ sent: 0, note: 'no other partners' });
      const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('member_id', ids);
      if (!subs?.length) return json({ sent: 0, note: 'no phones signed up' });
      const desc = String(a.description ?? '').slice(0, 140);
      const r = await sendAll(subs, {
        title: `${a.urgency === 'Critical' ? 'CRITICAL' : 'Urgent'}: ${a.type}`,
        body: `${p?.name ?? 'Plantation'} · ${a.location ?? 'Whole plantation'} · reported by ${who?.display_name ?? 'a partner'}${desc ? '\n' + desc : ''}`,
        url: `${APP}/#alert-${a.ref}`, tag: 'lk-alert-' + a.ref,
      });
      return json(r);
    }

    if (body.claim_id || body.action === 'daily') {
      const token = req.headers.get('x-lk-token');
      if (!token || token !== (await secret('hook_token'))) return json({ error: 'not allowed' }, 401);
      if (body.claim_id) return json(await claimSubmitted(String(body.claim_id)));
      return json(await daily(typeof body.today === 'string' ? body.today : undefined, body.dry === true));
    }

    return json({ error: 'unknown request' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
