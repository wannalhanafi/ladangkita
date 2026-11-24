// LadangKita · notify-alert
// - { action: 'key' }            -> the public key phones need to turn notifications on (no secret)
// - { action: 'test' } + login   -> a test notification to the signed-in partner's own phones
// - { alert_id } + x-lk-token    -> called by the database for every new urgent alert; notifies the other partners
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
        admin.from('members').select('id').eq('plantation_id', a.plantation_id).eq('active', true).neq('id', a.reported_by ?? '00000000-0000-0000-0000-000000000000'),
      ]);
      const ids = (mems ?? []).map((m) => m.id);
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

    return json({ error: 'unknown request' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
