// LadangKita – Stage 1: sign-in, app frame, Status, Peringkat, Partners, Agencies, Settings.
// All data comes from Supabase; row security in the database decides what each partner may see or change.
{
  const sb = window.supabase.createClient(LK_CONFIG.supabaseUrl, LK_CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const CODE_LEN = LK_CONFIG.codeLength || 8;

  // ---------- small helpers ----------
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n || 0).toLocaleString('en-MY');
  const CUR = () => (typeof D !== 'undefined' && D && D.plantation && { MYR: 'RM', SGD: 'S$', BND: 'B$', IDR: 'Rp', THB: '฿', PHP: '₱', USD: 'US$' }[D.plantation.currency]) || 'RM';
  const cx = (txt) => String(txt).replace(/\bRM\b/g, CUR());
  const rm = (n) => CUR() + ' ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // ---------- language: Bahasa Melayu by default, English in Settings ----------
  const LANG = (() => { try { return localStorage.getItem('lk_lang') === 'en' ? 'en' : 'ms'; } catch (_) { return 'ms'; } })();
  const MONTHS = LANG === 'ms' ? ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DICT = LANG === 'ms' ? (window.LK_MS || {}) : {};
  // patterns for text with changing parts, e.g. "{0} fruit" → "{0} buah"; longest fixed text first
  const PATS = Object.keys(DICT).filter((k) => /\{\d\}/.test(k)).map((k) => {
    // a changing part never reaches across " · ", so notes are not swallowed by loose patterns
    const re = new RegExp('^' + k.split(/(\{\d\})/).map((x) => (/^\{\d\}$/.test(x) ? '((?:(?! · )[\\s\\S])*?)' : x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
    const order = [...k.matchAll(/\{(\d)\}/g)].map((m) => Number(m[1]));
    return { re, order, to: DICT[k], prefix: k.split('{')[0], fixed: k.replace(/\{\d\}/g, '').length, num: /^\{0\} [a-z(]/.test(k) };
  }).sort((a, b) => b.fixed - a.fixed);
  const trCache = new Map();
  function T(str) {
    if (LANG !== 'ms' || typeof str !== 'string' || !/[A-Za-z]/.test(str)) return str;
    if (trCache.has(str)) return trCache.get(str);
    const m = str.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2];
    let r = DICT[core];
    if (r == null) for (const p of PATS) {
      if (p.prefix && !core.startsWith(p.prefix)) continue;
      const g = core.match(p.re);
      if (!g) continue;
      if (p.num && !/\d/.test(g[1])) continue; // "{0} fruit" needs a number in {0}
      r = p.to.replace(/\{(\d)\}/g, (_, n) => { const v = g[p.order.indexOf(Number(n)) + 1] ?? ''; return DICT[v.trim()] != null ? DICT[v.trim()] : v; });
      break;
    }
    if (r == null) { const c = core.match(/^([\s\S]*\S) \((\d+)\)$/); if (c) { const t = T(c[1]); if (t !== c[1]) r = `${t} (${c[2]})`; } }
    if (r == null && core.includes(' · ')) { const parts = core.split(' · ').map((x) => T(x)); r = parts.join(' · '); if (r === core) r = null; }
    const out = r == null ? str : m[1] + r + m[3];
    if (trCache.size < 5000) trCache.set(str, out);
    return out;
  }
  // translate whatever appears on screen: text, placeholders, labels (user data rarely matches, and stored values stay English)
  function trTree(root) {
    if (LANG !== 'ms') return;
    const doAttr = (el) => { for (const a of ['placeholder', 'aria-label', 'title']) { const v = el.getAttribute && el.getAttribute(a); if (v) { const t = T(v); if (t !== v) el.setAttribute(a, t); } } };
    if (root.nodeType === 3) { const t = T(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; return; }
    if (root.nodeType !== 1 || root.closest?.('[data-notr]')) return;
    doAttr(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) { if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEXTAREA') continue; doAttr(n); }
      else if (n.parentElement && !n.parentElement.closest('[data-notr],textarea,script,style')) { const t = T(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
    }
  }
  if (LANG === 'ms') {
    document.documentElement.lang = 'ms';
    trTree(document.body);
    new MutationObserver((ms) => { for (const mu of ms) { if (mu.type === 'characterData') trTree(mu.target); else for (const n of mu.addedNodes) trTree(n); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    const conf = window.confirm.bind(window);
    window.confirm = (msg) => conf(T(msg));
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const DATE_FMTS = { 'd MMM y': (d) => { const [y, m, x] = d.split('-').map(Number); return `${x} ${MONTHS[m - 1]} ${y}`; }, 'dd/mm/y': (d) => { const [y, m, x] = d.split('-'); return `${x}/${m}/${y}`; }, 'y-mm-dd': (d) => d };
  const dateFmt = () => { try { const v = localStorage.getItem('lk_datefmt'); return DATE_FMTS[v] ? v : 'd MMM y'; } catch (_) { return 'd MMM y'; } };
  const dstr = (d) => { if (!d) return ''; return DATE_FMTS[dateFmt()](String(d).slice(0, 10)); };
  const ageMonths = (d) => { if (!d) return null; const a = new Date(d), b = new Date(); return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0)); };
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const mask = (s) => { s = String(s || ''); return s.length <= 4 ? s : '•••• ' + s.slice(-4); };

  // Build DOM safely: text is always text, never markup.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d; return s; };

  function showErr(id, msg) { const e = $(id); e.textContent = msg; e.hidden = false; }
  function hideErr(id) { $(id).hidden = true; }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

  function friendly(err) {
    const m = (err && (err.message || err.error_description)) || String(err);
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many codes asked for. Please wait a few minutes, then try again.';
    if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m)) return 'That code is wrong or has expired. Check the latest email, or send a new code.';
    if (/fetch|network|failed to/i.test(m)) return 'No internet connection. Please check your signal and try again.';
    if (/duplicate key|unique/i.test(m)) return 'That email is already on this plantation.';
    if (/row-level security|permission denied|violates row/i.test(m)) return 'You are not allowed to make this change. Ask the admin partner.';
    return m;
  }

  // ---------- views ----------
  const views = ['loading', 'email', 'code', 'nomember', 'app'];
  function show(name, title, subtitle) {
    for (const v of views) $('v-' + v).hidden = v !== name;
    document.body.classList.toggle('signed-out', name !== 'app');
    setHead(title, subtitle);
    hideErr('page-err');
  }
  function setHead(title, subtitle, back) {
    $('title').textContent = title || '';
    $('subtitle').textContent = subtitle || '';
    const b = $('back');
    if (back) { b.hidden = false; b.textContent = '‹ ' + T(back[0]); b.href = back[1]; } else b.hidden = true;
  }

  // ================= SIGN IN =================
  let pendingEmail = '';
  let resendAt = 0;

  $('f-email').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr('email-err');
    const email = $('email').value.trim().toLowerCase();
    if (!email) { $('email').focus(); return showErr('email-err', 'The email box is empty. Tap it and type your email first.'); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr('email-err', 'Please type a full email address.');
    const btn = $('email-btn');
    busy(btn, true, 'Sending…');
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    busy(btn, false, 'Send code');
    if (error) return showErr('email-err', friendly(error));
    pendingEmail = email;
    resendAt = Date.now() + 60000;
    try { localStorage.setItem('lk_pending_email', email); } catch (_) {}
    $('code-to').textContent = email;
    $('code').value = '';
    hideErr('code-err');
    show('code', 'Check your email', 'Enter the code we sent you');
    $('code').focus();
  });

  $('code').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, CODE_LEN);
    if (e.target.value.length === CODE_LEN) $('f-code').requestSubmit();
  });

  $('f-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr('code-err');
    const token = $('code').value.trim();
    if (token.length !== CODE_LEN) return showErr('code-err', `The code has ${CODE_LEN} digits.`);
    const btn = $('code-btn');
    busy(btn, true, 'Checking…');
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
    busy(btn, false, 'Sign in');
    if (error) return showErr('code-err', friendly(error));
    try { localStorage.removeItem('lk_pending_email'); } catch (_) {}
    await start();
  });

  $('resend').addEventListener('click', async () => {
    hideErr('code-err');
    const wait = Math.ceil((resendAt - Date.now()) / 1000);
    if (wait > 0) return showErr('code-err', `Please wait ${wait} seconds before asking for a new code.`);
    const { error } = await sb.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: true } });
    if (error) return showErr('code-err', friendly(error));
    resendAt = Date.now() + 60000;
    showErr('code-err', 'A new code is on its way. Use the newest email.');
  });

  $('change-email').addEventListener('click', () => {
    try { localStorage.removeItem('lk_pending_email'); } catch (_) {}
    show('email', 'Sign in', 'Pineapple plantation records');
    $('email').focus();
  });

  async function signOut() {
    closeMenu();
    if (outbox.length && !window.confirm(`${outbox.length} change(s) on this phone have not synced yet and will be lost if you sign out. Sign out anyway?`)) return;
    try { if (D && D.user) localStorage.removeItem(snapKey(D.user.id)); for (const e of outbox) await qDel(e.k); outbox = []; } catch (_) {}
    await sb.auth.signOut();
    D = null;
    $('email').value = '';
    show('email', 'Sign in', 'Pineapple plantation records');
  }
  for (const b of document.querySelectorAll('[data-signout]')) b.addEventListener('click', signOut);
  $('recheck').addEventListener('click', () => start());

  // ================= DATA =================
  let D = null; // everything for the signed-in partner's plantation

  async function loadAll() {
    const fresh = await loadServer();
    if (fresh && fresh.me) { D = fresh; for (const e of outbox) applyLocal(e.ops); saveSnap(); }
    return fresh;
  }
  async function loadServer() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    if (!navigator.onLine) throw new Error('offline');
    const { data: { user }, error: uerr } = await sb.auth.getUser();
    if (uerr && isNetErr(uerr)) throw uerr;
    if (!user) return null;
    const claim = await sb.rpc('claim_membership'); // links first sign-in to the partner record; separate request
    if (claim.error) console.warn('claim_membership', claim.error);
    const mine = await sb.from('members').select('*').eq('user_id', user.id).eq('active', true).limit(1);
    if (mine.error) throw mine.error;
    if (!mine.data.length) return { user, me: null };
    const me = mine.data[0];
    const p = me.plantation_id;
    const q = (t, sel = '*') => sb.from(t).select(sel).eq('plantation_id', p);
    const [pl, members, priv, blocks, batches, bb, jobs, jb, receipts, uses, grants, agencies, alerts, cats, contractors, pays, pj, atts, settings, buyers, picks, pkb, rcs, rp, expenses, claims, ce, purchases, aa, reports, templates, marks, areq] = await Promise.all([
      sb.from('plantations').select('*').eq('id', p).single(),
      q('members').order('created_at'),
      q('member_private'),
      q('blocks').order('sort'),
      q('batches').order('no'),
      q('batch_blocks'),
      q('jobs'),
      q('job_batches'),
      q('material_receipts').order('ref'),
      q('material_uses'),
      q('grants').order('ref'),
      q('agencies'),
      q('alerts'),
      q('cost_categories').order('sort'),
      q('contractors').order('name'),
      q('contractor_payments').order('ref'),
      q('payment_jobs'),
      q('attachments').order('created_at'),
      sb.from('settings').select('*').eq('plantation_id', p).maybeSingle(),
      q('buyers').order('name'),
      q('harvest_picks'),
      q('pick_batches'),
      q('buyer_receipts').order('ref'),
      q('receipt_picks'),
      q('expenses'),
      q('claims').order('ref'),
      q('claim_expenses'),
      q('purchases'),
      q('alert_actions'),
      q('reports').order('created_at', { ascending: false }),
      q('crop_templates'),
      q('map_marks'),
      q('agency_requirements')
    ]);
    const all = [pl, members, priv, blocks, batches, bb, jobs, jb, receipts, uses, grants, agencies, alerts, cats, contractors, pays, pj, atts, settings, buyers, picks, pkb, rcs, rp, expenses, claims, ce, purchases, aa, reports, templates, marks, areq];
    const bad = all.find((r) => r.error);
    if (bad) throw bad.error;
    return {
      user, me, isAdmin: me.role === 'admin', plantation: pl.data,
      members: members.data, priv: Object.fromEntries(priv.data.map((r) => [r.member_id, r])),
      blocks: blocks.data, batches: batches.data, bb: bb.data, jobs: jobs.data, jb: jb.data,
      receipts: receipts.data, uses: uses.data, grants: grants.data, agencies: agencies.data, alerts: alerts.data,
      cats: cats.data, contractors: contractors.data, pays: pays.data, pj: pj.data, atts: atts.data, settings: settings.data || {},
      buyers: buyers.data, picks: picks.data, pkb: pkb.data, rcs: rcs.data, rp: rp.data,
      expenses: expenses.data, claims: claims.data, ce: ce.data, purchases: purchases.data, aa: aa.data, reports: reports.data, templates: templates.data, marks: marks.data, areq: areq.data,
      savedAt: new Date().toISOString()
    };
  }

  // Derived facts about one peringkat
  function batchInfo(b) {
    const parts = D.bb.filter((x) => x.batch_id === b.id).map((x) => ({ block: D.blocks.find((k) => k.id === x.block_id), plants: x.plants }));
    parts.sort((x, y) => (x.block?.sort || 0) - (y.block?.sort || 0));
    const blockNames = parts.map((x) => x.block ? x.block.name : '?');
    const jobIds = D.jb.filter((x) => x.batch_id === b.id).map((x) => x.job_id);
    const jobs = D.jobs.filter((j) => jobIds.includes(j.id)).sort((x, y) => String(x.start_on || '9999').localeCompare(String(y.start_on || '9999')));
    const done = jobs.filter((j) => ['Done', 'To pay', 'Paid'].includes(j.status) && j.start_on);
    const lastWork = done.length ? done[done.length - 1] : null;
    const next = jobs.find((j) => ['Planned', 'Quoted', 'In progress'].includes(j.status));
    const useRows = D.uses.filter((u) => u.batch_id === b.id);
    const grantIds = [...new Set(useRows.map((u) => D.receipts.find((r) => r.id === u.receipt_id)?.grant_id).filter(Boolean))];
    return { parts, blockNames, jobs, lastWork, next, grants: D.grants.filter((g) => grantIds.includes(g.id)), area: b.measured_acres ?? b.est_acres, measured: b.measured_acres != null, age: ageMonths(b.planted_on) };
  }

  // ================= OFFLINE (Stage 7a) =================
  // Last copy of the plantation is kept on the phone; field records made without signal wait in an outbox and sync later.
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  const isNetErr = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|offline|timeout|fetch/i.test(String((e && (e.message || e.error_description)) || e));
  const TABLE_KEY = { jobs: 'jobs', job_batches: 'jb', contractors: 'contractors', harvest_picks: 'picks', pick_batches: 'pkb', buyers: 'buyers',
    expenses: 'expenses', alerts: 'alerts', alert_actions: 'aa', attachments: 'atts', batches: 'batches', map_marks: 'marks' };

  // tiny IndexedDB store for the outbox (photos are kept as blobs)
  let dbp;
  const idb = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('ladangkita', 1); r.onupgradeneeded = () => r.result.createObjectStore('outbox', { keyPath: 'k', autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('outbox', mode); const s = t.objectStore('outbox'); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  const qAll = async () => { try { return await tx('readonly', (s) => s.getAll()); } catch (_) { return []; } };
  const qAdd = (entry) => tx('readwrite', (s) => s.add(entry));
  const qPut = (entry) => tx('readwrite', (s) => s.put(entry));
  const qDel = (k) => tx('readwrite', (s) => s.delete(k));
  let outbox = [];
  const refreshOutbox = async () => { outbox = await qAll(); netBar(); };

  // saved copy of the plantation
  const snapKey = (uid) => 'lk_snap_' + uid;
  function saveSnap() { if (!D || !D.me) return; try { const { user, ...rest } = D; localStorage.setItem(snapKey(D.user.id), JSON.stringify({ ...rest, user: { id: user.id, email: user.email }, savedAt: D.savedAt || new Date().toISOString() })); } catch (_) { /* phone storage full: keep going */ } }
  function readSnap(uid) { try { const s = localStorage.getItem(snapKey(uid)); return s ? JSON.parse(s) : null; } catch (_) { return null; } }

  // apply a list of changes to the copy in memory, so the screens show them straight away
  function applyLocal(ops) {
    for (const o of ops) {
      const key = TABLE_KEY[o.table];
      if (!key || !D[key]) continue;
      if (o.op === 'insert') for (const r of o.rows) { if (!r.id || !D[key].some((x) => x.id === r.id)) D[key].push({ created_at: new Date().toISOString(), ...r }); }
      else if (o.op === 'update') D[key].filter((r) => Object.entries(o.eq).every(([k, v]) => String(r[k]) === String(v))).forEach((r) => Object.assign(r, o.values));
      else if (o.op === 'delete') D[key] = D[key].filter((r) => !(Object.entries(o.eq || {}).every(([k, v]) => String(r[k]) === String(v)) && (!o.in || o.in[1].map(String).includes(String(r[o.in[0]])))));
    }
  }

  async function runOp(o) {
    if (o.op === 'upload') {
      const r = await sb.storage.from('files').upload(o.path, o.blob, { contentType: o.type, upsert: false });
      if (r.error && !/exists|duplicate/i.test(r.error.message)) throw r.error;
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      let q;
      if (o.op === 'insert') q = sb.from(o.table).insert(o.rows);
      else if (o.op === 'update') { q = sb.from(o.table).update(o.values); for (const [k, v] of Object.entries(o.eq)) q = q.eq(k, v); }
      else if (o.op === 'delete') { q = sb.from(o.table).delete(); for (const [k, v] of Object.entries(o.eq || {})) q = q.eq(k, v); if (o.in) q = q.in(o.in[0], o.in[1]); }
      const { error } = await q;
      if (!error) return;
      const m = error.message || '';
      if (o.op === 'insert' && /_pkey|already exists/i.test(m)) return; // it was saved before the signal dropped
      if (o.op === 'insert' && o.refPrefix && /duplicate|unique/i.test(m)) {
        // another partner used the same number meanwhile: take the next free one
        const { data } = await sb.from(o.table).select('ref').eq('plantation_id', o.rows[0].plantation_id);
        const used = (data || []).concat(D[TABLE_KEY[o.table]] || []);
        const old = o.rows[0].ref;
        o.rows[0].ref = nextRef(o.refPrefix, used);
        const local = (D[TABLE_KEY[o.table]] || []).find((x) => x.id === o.rows[0].id); if (local) local.ref = o.rows[0].ref;
        if (location.hash.endsWith('-' + old)) location.hash = location.hash.replace(old, o.rows[0].ref);
        continue;
      }
      throw error;
    }
  }
  async function runOps(ops) { for (let i = 0; i < ops.length; i++) { try { await runOp(ops[i]); } catch (e) { e.done = i; throw e; } } }

  // Save a change: straight to the database when there is signal, otherwise into the outbox.
  async function commit(ops, msg, opts = {}) {
    if (navigator.onLine) {
      try {
        await runOps(ops);
        if (opts.reload === false) { applyLocal(ops); saveSnap(); } else await refresh(msg);
        return 'saved';
      } catch (e) {
        if (!isNetErr(e)) throw e;
        ops = ops.slice(e.done || 0);
      }
    }
    await qAdd({ ops, label: opts.label || msg || 'Change', ts: Date.now() });
    applyLocal(ops); saveSnap(); await refreshOutbox();
    if (opts.reload !== false) { route(); toast('Saved on this phone. It will sync when you have signal.'); }
    return 'queued';
  }

  let syncing = false;
  async function flushOutbox() {
    if (syncing || !navigator.onLine) return;
    const list = await qAll();
    if (!list.length) return;
    syncing = true; netBar();
    try { await sb.auth.getSession(); } catch (_) { /* refreshes an expired login when signal is back */ }
    let sent = 0;
    for (const entry of list) {
      if (entry.error && !entry.retry) continue;
      try { await runOps(entry.ops); await qDel(entry.k); sent++; }
      catch (e) {
        if (isNetErr(e)) break;
        entry.ops = entry.ops.slice(e.done || 0); entry.error = friendly(e); entry.retry = false; await qPut(entry);
      }
    }
    syncing = false;
    await refreshOutbox();
    if (sent && D && D.me) { try { D = await loadAll(); route(); } catch (_) { /* stay on the copy */ } toast(`${sent} change${sent > 1 ? 's' : ''} synced`); }
  }

  function netBar() {
    const b = $('net');
    if (!b || !D || !D.me) { if (b) b.hidden = true; return; }
    const waiting = outbox.filter((e) => !e.error).length;
    const failed = outbox.filter((e) => e.error);
    const parts = [];
    if (!navigator.onLine) parts.push('No signal');
    if (D.offline && D.savedAt) parts.push(`showing your copy from ${ago(D.savedAt)}`);
    if (syncing) parts.push('syncing…');
    else if (waiting) parts.push(`${waiting} change${waiting > 1 ? 's' : ''} waiting to sync`);
    b.replaceChildren();
    b.className = 'net' + (failed.length ? ' bad' : navigator.onLine ? '' : ' off');
    if (parts.length) b.append(h('span', {}, parts.join(' · ')));
    if (failed.length) b.append(h('button', { type: 'button', onclick: showFailed }, `${failed.length} could not be saved · see`));
    b.hidden = !parts.length && !failed.length;
  }
  function showFailed() {
    const f = $('sheet');
    const failed = outbox.filter((e) => e.error);
    f.onsubmit = (e) => e.preventDefault(); f.oninput = null; f.onchange = null;
    f.replaceChildren(h('div', { class: 'h sheet-title' }, 'Changes that could not be saved'),
      h('p', { class: 'muted small' }, 'These were made without signal, but the database refused them when they were sent. Try again, or discard them and enter them again.'),
      ...failed.map((e) => h('div', { class: 'pay-items' }, h('div', { class: 'pi' }, h('b', {}, e.label), h('span', {}, new Date(e.ts).toLocaleString('en-MY'))), h('div', { class: 'err' }, e.error),
        h('div', { class: 'sheet-btns' },
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await qDel(e.k); await refreshOutbox(); closeSheet(); await refresh('Discarded'); } }, 'Discard'),
          h('button', { class: 'btn primary', type: 'button', onclick: async () => { e.retry = true; delete e.error; await qPut(e); closeSheet(); await flushOutbox(); } }, 'Try again')))),
      h('button', { class: 'btn ghost', type: 'button', onclick: closeSheet }, 'Close'));
    $('sheet-wrap').hidden = false; document.body.classList.add('sheet-open');
  }
  window.addEventListener('online', async () => { netBar(); await flushOutbox(); if (D && D.offline) { try { D = await loadAll(); route(); } catch (_) {} } netBar(); });
  window.addEventListener('offline', netBar);
  setInterval(() => { if (navigator.onLine && outbox.some((e) => !e.error)) flushOutbox(); }, 30000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

  // ================= ROUTER =================
  const TABS = { status: 'status', map: 'map', jobs: 'jobs', sales: 'sales', exp: 'exp', finance: 'finance' };
  function route() {
    if (!D || !D.me) return;
    closeMenu();
    closeSheet();
    const hash = decodeURIComponent(location.hash.slice(1));
    const [name, arg] = hash.split(/-(.+)/);
    const page = PAGES[name] || (!name && wide() ? PAGES.dashboard : PAGES.home);
    const tab = (name === 'dashboard' || (!name && wide())) ? 'dashboard' : !name ? 'home' : TABS[name] || { home: 'home', mark: 'map', agency: '', grant: '', mat: '', p: 'status', job: 'jobs', pay: 'jobs', pick: 'sales', rc: 'sales', ex: 'exp', cl: 'exp', buy: 'finance' }[name] || '';
    for (const a of document.querySelectorAll('#tabs a')) a.classList.toggle('on', a.dataset.tab === tab);
    const root = $('v-app');
    root.replaceChildren();
    try { page(root, arg); } catch (e) { console.error(e); root.append(h('div', { class: 'card' }, h('p', { class: 'err' }, 'Something went wrong on this page: ' + e.message))); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('back').addEventListener('click', (e) => { if (history.length > 1 && $('back').dataset.useHistory) { e.preventDefault(); history.back(); } });

  async function refresh(msg) {
    try { D = await loadAll(); } catch (e) { if (isNetErr(e)) { route(); if (msg) toast(msg); return; } return toast(friendly(e)); }
    route(); netBar();
    if (msg) toast(msg);
  }

  // ---------- menu ----------
  function openMenu() { $('menu-wrap').hidden = false; $('menu-btn').setAttribute('aria-expanded', 'true'); $('menu-btn').classList.add('on'); }
  function closeMenu() { $('menu-wrap').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false'); $('menu-btn').classList.remove('on'); }
  $('menu-btn').addEventListener('click', () => ($('menu-wrap').hidden ? openMenu() : closeMenu()));
  $('menu-scrim').addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); closeSheet(); } });

  // ---------- bottom sheet form ----------
  // fields: {key,label,type:'text'|'email'|'tel'|'number'|'date'|'select'|'textarea'|'chips'|'head'|'note'|'info',
  //          value,options,ph,mode,note,required,list,showIf:(vals)=>bool,node}
  function openSheet(title, fields, onSave, saveLabel = 'Save', danger = false, offlineOk = false) {
    const f = $('sheet');
    f.replaceChildren();
    f.append(h('div', { class: 'h sheet-title' }, title));
    const inputs = {}, wraps = [], renders = [];
    const raw = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.getVal ? el.getVal() : el.value]));
    for (const fd of fields) {
      let wrap;
      if (fd.type === 'head') wrap = h('div', { class: 'h sheet-head' }, cx(fd.label));
      else if (fd.type === 'note') wrap = h('div', { class: 'note-box' }, typeof fd.label === 'string' ? cx(fd.label) : fd.label);
      else if (fd.type === 'info') { wrap = fd.node || h('div', {}); if (fd.render) renders.push([fd, wrap]); }
      else {
        const id = 'f_' + fd.key;
        let input;
        if (fd.type === 'chips') {
          const sel = new Set((fd.value || []).map(String));
          input = h('div', { class: 'chipsel', id, role: 'group', 'aria-label': fd.label },
            fd.options.map((o) => h('button', { type: 'button', class: 'chip' + (sel.has(String(o[0])) ? ' on' : ''), 'aria-pressed': String(sel.has(String(o[0]))),
              onclick: (e) => { const k = String(o[0]); if (sel.has(k)) sel.delete(k); else sel.add(k); e.currentTarget.classList.toggle('on', sel.has(k)); e.currentTarget.setAttribute('aria-pressed', String(sel.has(k))); update(); } }, o[1])));
          input.getVal = () => [...sel];
        } else if (fd.type === 'select') input = h('select', { id }, fd.options.map((o) => h('option', { value: o[0], selected: String(o[0]) === String(fd.value ?? '') }, o[1])));
        else if (fd.type === 'textarea') input = h('textarea', { id, rows: 3, placeholder: fd.ph || '' });
        else input = h('input', { id, type: fd.type || 'text', inputmode: fd.mode, placeholder: fd.ph || '', autocomplete: 'off', list: fd.list ? id + '_l' : null, step: fd.type === 'number' ? 'any' : null });
        if (!['select', 'chips'].includes(fd.type)) input.value = fd.value ?? '';
        inputs[fd.key] = input;
        wrap = h(fd.type === 'chips' ? 'div' : 'label', { class: 'field' + (fd.half ? ' half' : ''), for: fd.type === 'chips' ? null : id }, h('span', {}, cx(fd.label), fd.required ? ' *' : ''), input,
          fd.list ? h('datalist', { id: id + '_l' }, fd.list.map((v) => h('option', { value: v }))) : null,
          fd.note ? h('small', {}, fd.note) : null);
      }
      if (fd.showIf) wraps.push([fd, wrap]);
      f.append(wrap);
    }
    function update() { const r = raw(); for (const [fd, w] of wraps) w.hidden = !fd.showIf(r); for (const [fd, w] of renders) w.replaceChildren(fd.render(r)); }
    f.oninput = update; f.onchange = update; update();
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    const save = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'submit' }, saveLabel);
    f.append(err, h('div', { class: 'sheet-btns' }, h('button', { class: 'btn ghost', type: 'button', onclick: closeSheet }, 'Cancel'), save));
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.hidden = true;
      const r = raw();
      const vals = {};
      for (const fd of fields) {
        const el = inputs[fd.key];
        if (!el) continue;
        if (fd.showIf && !fd.showIf(r)) { vals[fd.key] = null; continue; }
        let v = el.getVal ? el.getVal() : el.value.trim();
        const empty = Array.isArray(v) ? !v.length : !v;
        if (fd.required && empty) { err.textContent = `Please fill in ${fd.label}.`; err.hidden = false; if (el.focus) el.focus(); return; }
        if (fd.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = 'Please type a full email address.'; err.hidden = false; return; }
        if (fd.type === 'number') { if (v === '') v = null; else { v = Number(v.replace(/,/g, '')); if (!isFinite(v) || v < 0) { err.textContent = `${fd.label} must be a number.`; err.hidden = false; return; } } }
        else if (v === '') v = null;
        vals[fd.key] = v;
      }
      if (!offlineOk && !navigator.onLine) { err.textContent = 'This needs signal, because it changes money or settings shared by all partners. Do it when you are back online.'; err.hidden = false; return; }
      busy(save, true, 'Saving…');
      try { await onSave(vals); closeSheet(); }
      catch (ex) { err.textContent = friendly(ex); err.hidden = false; }
      finally { busy(save, false, saveLabel); }
    };
    $('sheet-wrap').hidden = false;
    $('sheet').scrollTop = 0;
    document.body.classList.add('sheet-open');
    const first = Object.values(inputs)[0];
    if (first && first.focus && matchMedia('(min-width: 700px)').matches) first.focus();
  }
  function closeSheet() { $('sheet-wrap').hidden = true; document.body.classList.remove('sheet-open'); }
  $('sheet-wrap').querySelector('.sheet-scrim').addEventListener('click', closeSheet);

  // ---------- building blocks ----------
  const card = (...kids) => h('div', { class: 'card' }, ...kids);
  const sec = (title, right) => h('div', { class: 'sec' }, h('div', { class: 'h' }, title), right || null);
  const pill = (text, kind) => h('span', { class: 'pill ' + (kind || '') }, text);
  const kv = (label, value, wide) => h('div', { class: 'kv' + (wide ? ' wide' : '') }, h('div', { class: 'k' }, label), h('div', { class: 'v' }, value == null || value === '' ? '—' : value));
  const linkRow = (href, main, sub, right) => h('a', { class: 'lrow', href }, h('span', { class: 'lmain' }, h('b', {}, main), sub ? h('small', {}, sub) : null), right ? h('span', { class: 'lright' }, right) : null, h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));

  // ================= PAGES =================
  const PAGES = {};

  // ---------- Home ----------
  PAGES.home = (root) => {
    setHead(D.plantation.name, `${D.isAdmin ? 'Admin' : 'Partner'} · ${D.me.display_name}`);
    root.append(alertPanel());
    const plants = D.batches.reduce((s, b) => s + b.plants, 0);
    const toEnter = D.jobs.filter((j) => DONE.includes(j.status) && (j.price == null || !j.contractor_id)).length;
    const toPay = D.jobs.filter((j) => j.status === 'To pay').reduce((s, j) => s + Number(j.price || 0), 0);
    const owed = D.picks.filter((k) => !pickRc(k)).reduce((s, k) => s + pickAmt(k), 0);
    root.append(h('div', { class: 'kpis' },
      kpi('Plants', fmt(plants), `${D.batches.length} peringkat`, '#status'),
      kpi('Area', `${Number(D.plantation.area_acres || 0).toFixed(2)} ac`, `${D.blocks.length} blok`, '#status'),
      D.picks.length ? kpi('Sales', rm(D.picks.reduce((s, k) => s + pickAmt(k), 0)), owed ? `Buyers owe ${rm(owed)}` : 'All paid', '#sales')
        : kpi('Partners', fmt(D.members.filter((m) => m.active).length), D.isAdmin ? 'Tap to add' : 'In this plantation', '#partners'),
      toPay ? kpi('To pay contractors', rm(toPay), (() => { const n = D.jobs.filter((j) => j.status === 'To pay').length; return `${n} job${n > 1 ? 's' : ''} done`; })(), '#jobs')
        : kpi('Jobs', fmt(D.jobs.length), toEnter ? `${toEnter} need contractor and cost` : 'All costs entered', toEnter ? '#jobs-none' : '#jobs')));
    root.append(glance(money()));
    const upcoming = D.jobs.filter((j) => ['Planned', 'Quoted', 'In progress'].includes(j.status));
    root.append(sec('Coming up'));
    root.append(card(upcoming.length ? upcoming.map((j) => {
      const names = D.jb.filter((x) => x.job_id === j.id).map((x) => D.batches.find((b) => b.id === x.batch_id)).filter(Boolean).map((b) => 'P' + b.no);
      return h('a', { class: 'trow', href: '#job-' + j.ref }, h('span', { class: 'dot gold' }), h('span', { class: 'lmain' }, h('b', {}, jobName(j)), h('small', {}, `${jobDate(j)} · ${names.join(', ')}${jobWho(j) ? ' · ' + jobWho(j) : ''}${j.note ? ' · ' + j.note : ''}`)), pill(j.status, 'gold'));
    }) : h('p', { class: 'muted' }, 'Nothing planned yet.')));
    const waitingClaims = D.claims.filter(canPayClaim);
    if (waitingClaims.length) root.append(h('a', { class: 'banner amber-b', href: '#cl-' + waitingClaims[0].ref }, h('span', {}, h('b', {}, `${waitingClaims.length} partner claim${waitingClaims.length > 1 ? 's' : ''} to pay · ${rm(waitingClaims.reduce((s, c) => s + Number(c.amount), 0))}`), h('small', {}, waitingClaims.map((c) => `${c.ref} ${memberName(c.member_id)}`).join(' · '))), h('span', { class: 'chev' }, '›')));
    root.append(pushCard(true));
    root.append(h('div', { class: 'quick' }, h('a', { class: 'btn gold', href: '#jobs' }, 'Jobs'), h('a', { class: 'btn gold', href: '#sales' }, 'Sales'), h('a', { class: 'btn gold', href: '#exp' }, 'Expense')));
    if (toEnter) root.append(h('a', { class: 'banner amber-b', href: '#jobs-none' }, h('span', {}, h('b', {}, `${toEnter} past job${toEnter > 1 ? 's' : ''} need a contractor and price`), h('small', {}, 'From the planter\'s records. Tap to complete them.')), h('span', { class: 'chev' }, '›')));
    root.append(h('div', { class: 'card note' }, h('p', {}, h('strong', {}, 'Being built: '), 'Map, offline recording and phone notifications are coming next. Everything you see here is your real plantation data.')));
  };
  const kpi = (l, v, sub, href) => h('a', { class: 'kpi', href }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), sub ? h('div', { class: 's' }, sub) : null);

  // ---------- Status (blok and peringkat) ----------
  PAGES.status = (root) => {
    setHead('Status', `${D.plantation.name} · blok and peringkat`);
    const plants = D.batches.reduce((s, b) => s + b.plants, 0);
    const planted = D.batches.reduce((s, b) => s + Number(b.measured_acres ?? b.est_acres ?? 0), 0);
    const total = Number(D.plantation.area_acres || 0);
    const matTotal = D.receipts.reduce((s, r) => s + r.qty, 0);
    const matGrant = D.receipts.filter((r) => r.how === 'Grant').reduce((s, r) => s + r.qty, 0);
    root.append(h('a', { class: 'banner', href: '#agencies' },
      h('span', {}, h('b', {}, `${fmt(plants)} plants · ${D.batches.length} peringkat · ${D.blocks.length} blok · ${total.toFixed(2)} acres`),
        h('small', {}, `Planted ~${planted.toFixed(1)} ac · not yet planted ~${Math.max(0, total - planted).toFixed(1)} ac · planting material ${fmt(matTotal)} received${matGrant ? `, ${fmt(matGrant)} from grants` : ''}`)),
      h('span', { class: 'chev' }, '›')));

    root.append(sec('Blok'));
    root.append(h('div', { class: 'blocks' }, D.blocks.map((bk) => {
      const parts = D.bb.filter((x) => x.block_id === bk.id);
      const n = parts.reduce((s, x) => s + x.plants, 0);
      const list = parts.map((x) => D.batches.find((b) => b.id === x.batch_id)).filter(Boolean).sort((a, b) => a.no - b.no);
      return h('div', { class: 'blk-card' },
        h('div', { class: 'blk-top' }, h('div', { class: 'h' }, bk.name), h('div', { class: 'num' }, fmt(n))),
        h('small', {}, `${bk.est_acres ? Number(bk.est_acres).toFixed(2) + ' ac · ' : ''}${bk.notes || ''}`),
        h('div', { class: 'chips' }, list.map((b) => h('a', { class: 'chip', href: '#p-' + b.no }, 'P' + b.no))));
    })));

    root.append(sec('Key dates by peringkat', xpBtn(SPEC.keyDates, 'Key dates by peringkat')));
    const rows = D.batches.map((b) => {
      const i = batchInfo(b);
      return h('a', { class: 'grow', href: '#p-' + b.no },
        h('span', { class: 'c1' }, h('b', {}, b.name), h('small', {}, i.blockNames.join(' + '))),
        h('span', { class: 'c2' }, pill(b.planted_on ? 'Planted ' + dstr(b.planted_on) : 'Not planted', 'green'),
          h('small', {}, i.next ? `Next: ${i.next.category.replace('Upah ', '')} ${i.next.start_on ? dstr(i.next.start_on) : i.next.date_note || ''}` : i.lastWork ? 'Last work ' + dstr(i.lastWork.start_on) : 'No work recorded')),
        h('span', { class: 'c3 num' }, fmt(b.plants)),
        h('span', { class: 'c4' }, i.age == null ? '—' : i.age + ' mo'));
    });
    root.append(h('div', { class: 'card table' }, h('div', { class: 'grow ghead' }, h('span', { class: 'c1' }, 'Peringkat'), h('span', { class: 'c2' }, 'Planted · next step'), h('span', { class: 'c3' }, 'Plants'), h('span', { class: 'c4' }, 'Age')), rows));
    root.append(h('p', { class: 'muted small foot' }, 'Tap a peringkat to see its details and the work done on it.'));
  };

  // ---------- one Peringkat ----------
  PAGES.p = (root, no) => {
    const b = D.batches.find((x) => String(x.no) === String(no));
    if (!b) { location.hash = '#status'; return; }
    const i = batchInfo(b);
    setHead(b.name, i.blockNames.join(' + ') + (b.variety ? ' · ' + b.variety : ''), ['Status', '#status']);
    root.append(h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('small', {}, 'Plants'), h('div', { class: 'h' }, fmt(b.plants))),
      h('div', { class: 'tile' }, h('small', {}, 'Age'), h('div', { class: 'h' }, i.age == null ? '—' : i.age + ' months')),
      h('div', { class: 'tile' }, h('small', {}, i.measured ? 'Measured area' : 'Est. area'), h('div', { class: 'h' }, i.area != null ? Number(i.area).toFixed(2) + ' ac' : '—'))));

    root.append(h('div', { class: 'card kvs' },
      kv('Planted', b.planted_on ? dstr(b.planted_on) + (b.finished_on ? ' – ' + dstr(b.finished_on) : '') : 'Not planted'),
      kv('Variety', b.variety || 'Not set yet'),
      kv('Planting material', b.material),
      kv('Source', b.source_note),
      kv('Blok', i.parts.map((x) => `${x.block?.name}${i.parts.length > 1 ? ' (' + fmt(x.plants) + ')' : ''}`).join(' + '), true),
      kv(i.measured ? 'Area (measured)' : 'Est. area (from plant count; replace with measured)', i.area != null ? Number(i.area).toFixed(2) + ' acres' : '', true),
      b.notes ? kv('Notes', b.notes, true) : null));

    for (const g of i.grants) root.append(h('a', { class: 'banner', href: '#agencies' }, h('span', {}, h('b', {}, `Free suckers from grant ${g.ref}`), h('small', {}, `${g.title} · ${g.quantity || ''}`)), h('span', { class: 'chev' }, '›')));

    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => editBatch(b) }, 'Edit variety, measured area or notes'));

    root.append(sec('Work done and next steps'));
    root.append(card(i.jobs.length ? i.jobs.map((j) => {
      const done = ['Done', 'To pay', 'Paid'].includes(j.status);
      return h('a', { class: 'trow', href: '#job-' + j.ref },
        h('span', { class: 'mark ' + (done ? 'done' : 'todo') }, done ? '✓' : '○'),
        h('span', { class: 'lmain' }, h('b', {}, jobName(j)), h('small', {}, `${j.ref} · ${jobDate(j)}${jobWho(j) ? ' · ' + jobWho(j) : ''}${j.products ? ' · ' + j.products : ''}`)),
        h('span', { class: 'lright' }, j.price != null ? h('span', {}, rm(j.price), h('small', { class: 'st' }, j.status)) : done ? pill('Cost to enter', 'amber') : pill(j.status, 'gold')));
    }) : h('p', { class: 'muted' }, 'No work recorded yet.')));
    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => jobForm(null, { batches: [b.id] }) }, '+ Record a job for this peringkat'));
    const picks = sortPicks(D.picks.filter((k) => D.pkb.some((x) => x.pick_id === k.id && x.batch_id === b.id)));
    { const ct = cropTasksCard(b); if (ct) root.append(ct); }
    root.append(sec('Harvest'));
    root.append(card(picks.length ? picks.map((k) => linkRow('#pick-' + k.ref, `${k.ref} · ${fmt(pickFruit(k))} fruit`, `${dstr(k.picked_on)}${pickWho(k) ? ' · ' + pickWho(k) : ''}${pickBatches(k).length > 1 ? ' · shared with ' + pickPlots(k) : ''}`, rm(pickAmt(k))))
      : h('p', { class: 'muted' }, 'No harvest picked from this peringkat yet.')));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => pickForm(null, { batches: [b.id] }) }, '+ Record a harvest pick'));
  };

  function editBatch(b) {
    const varieties = [...new Set(D.batches.map((x) => x.variety).filter(Boolean).concat(['MD2', 'Josapine', 'Morris', 'Moris Gajah', 'Sarawak', 'N36']))];
    openSheet(`Edit ${b.name}`, [
      { key: 'variety', label: 'Variety', value: b.variety, ph: 'e.g. MD2', list: varieties, note: 'Pick from the list or type your own.' },
      { key: 'measured_acres', label: 'Measured area (acres)', type: 'number', mode: 'decimal', value: b.measured_acres, ph: `Estimated ${b.est_acres ?? '—'} ac`, note: 'Leave empty to keep using the estimate from the plant count.' },
      { key: 'notes', label: 'Notes', type: 'textarea', value: b.notes }
    ], async (v) => {
      await commit([{ op: 'update', table: 'batches', values: v, eq: { id: b.id } }], 'Saved', { label: `${b.name} details` });
    }, 'Save', false, true);
  }

  // ---------- Partners ----------
  PAGES.partners = (root) => {
    setHead('Partners', 'Partners, capital and shares');
    const active = D.members.filter((m) => m.active);
    const totalCap = active.reduce((s, m) => s + Number(m.capital || 0), 0);
    if (D.isAdmin) root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => editPartner(null) }, '+ Add a partner'));
    root.append(card(D.members.map((m) => {
      const share = totalCap > 0 ? (Number(m.capital || 0) / totalCap * 100).toFixed(1) + '%' : '—';
      return h('a', { class: 'prow' + (m.active ? '' : ' off'), href: '#partner-' + m.id },
        h('span', { class: 'avatar' }, initials(m.display_name)),
        h('span', { class: 'lmain' },
          h('b', {}, m.display_name, ' ', h('em', {}, m.role === 'admin' ? 'Admin' : ''), m.active ? '' : h('em', {}, ' Inactive')),
          h('small', {}, `${rm(m.capital)} paid in · ${share} share`),
          h('small', {}, m.user_id ? m.email : `${m.email} · not signed in yet`)),
        h('span', { class: 'chev' }, '›'));
    })));
    root.append(h('p', { class: 'muted small foot' }, totalCap > 0 ? `Total capital ${rm(totalCap)}. Shares follow capital paid in.` : 'Shares follow capital paid in. Enter each partner\'s capital to see their share.'));
    root.append(h('p', { class: 'muted small foot' }, 'IC and bank account numbers are hidden in lists and visible only to the admin partner and to the partner themself.'));
  };

  PAGES.partner = (root, id) => {
    const m = D.members.find((x) => x.id === id);
    if (!m) { location.hash = '#partners'; return; }
    const self = m.id === D.me.id;
    const canEdit = D.isAdmin || self;
    const pv = D.priv[m.id];
    const totalCap = D.members.filter((x) => x.active).reduce((s, x) => s + Number(x.capital || 0), 0);
    setHead(m.display_name, `${m.role === 'admin' ? 'Admin partner' : 'Partner'}${self ? ' · you' : ''}`, ['Partners', '#partners']);
    root.append(h('div', { class: 'tiles two' },
      h('div', { class: 'tile' }, h('small', {}, 'Capital paid in'), h('div', { class: 'h' }, rm(m.capital))),
      h('div', { class: 'tile' }, h('small', {}, 'Share'), h('div', { class: 'h' }, totalCap > 0 && m.active ? (Number(m.capital || 0) / totalCap * 100).toFixed(1) + '%' : '—'))));
    if (!m.user_id) root.append(h('div', { class: 'card note' }, h('p', {}, h('strong', {}, 'Not signed in yet. '), `Ask ${m.display_name} to open ladangkita.pages.dev on their phone and sign in with ${m.email}. They will see this plantation straight away.`)));
    root.append(h('div', { class: 'card kvs' },
      kv('Email', m.email, true), kv('Phone', m.phone), kv('Joined', dstr(m.joined_on)), kv('Role', m.role === 'admin' ? 'Admin partner' : 'Partner'), kv('Status', m.active ? 'Active' : 'Inactive')));
    if (D.isAdmin || self) {
      const shown = { v: false };
      const box = h('div', { class: 'card kvs' });
      const draw = () => {
        box.replaceChildren(
          h('div', { class: 'kv wide' }, h('div', { class: 'sec in' }, h('div', { class: 'h' }, 'Private details'), pv ? h('button', { class: 'btn link', type: 'button', onclick: () => { shown.v = !shown.v; draw(); } }, shown.v ? 'Hide' : 'Show') : null)),
          pv ? [kv('Full name (as in IC)', pv.full_name, true), kv('IC number', shown.v ? pv.ic_no : mask(pv.ic_no)), kv('Next of kin', pv.next_of_kin),
            kv('Bank', pv.bank_name), kv('Account holder', pv.account_holder), kv('Account number', shown.v ? pv.account_no : mask(pv.account_no), true), kv('Address', pv.address, true)]
            : h('p', { class: 'muted kv wide' }, 'No IC or bank details yet. They are needed later to pay profit shares and claims.'));
      };
      draw();
      root.append(box);
    }
    if (canEdit) root.append(h('button', { class: 'btn primary', type: 'button', onclick: () => editPartner(m) }, self && !D.isAdmin ? 'Edit my details' : 'Edit partner'));
  };

  function editPartner(m) {
    const isNew = !m;
    const self = m && m.id === D.me.id;
    const pv = (m && D.priv[m.id]) || {};
    const showPriv = D.isAdmin || self;
    const fields = [
      { key: 'display_name', label: 'Name', required: true, value: m?.display_name, ph: 'Name shown in the app' },
      { key: 'email', label: 'Email (used to sign in)', type: 'email', required: true, value: m?.email, mode: 'email', note: isNew ? 'They sign in at ladangkita.pages.dev with this email and get a code.' : null },
      { key: 'phone', label: 'Phone', type: 'tel', value: m?.phone, mode: 'tel', ph: '01x-xxx xxxx' }
    ];
    if (D.isAdmin) {
      fields.push(
        { key: 'capital', label: 'Capital paid in (RM)', type: 'number', mode: 'decimal', value: m?.capital ?? '' , ph: '0.00' },
        { key: 'joined_on', label: 'Joined on', type: 'date', value: m?.joined_on || (isNew ? today() : '') },
        { key: 'role', label: 'Role', type: 'select', value: m?.role || 'partner', options: [['partner', 'Partner'], ['admin', 'Admin partner (can add partners, change capital)']] });
      if (!isNew && !self) fields.push({ key: 'active', label: 'Status', type: 'select', value: String(m.active), options: [['true', 'Active'], ['false', 'Inactive (left the partnership)']] });
    }
    if (showPriv) {
      fields.push({ type: 'head', label: 'Private details (optional)' },
        { key: 'full_name', label: 'Full name as in IC', value: pv.full_name },
        { key: 'ic_no', label: 'IC number', value: pv.ic_no, mode: 'numeric', ph: '000000-00-0000' },
        { key: 'address', label: 'Address', type: 'textarea', value: pv.address },
        { key: 'bank_name', label: 'Bank', value: pv.bank_name, ph: 'e.g. Maybank' },
        { key: 'account_holder', label: 'Account holder', value: pv.account_holder },
        { key: 'account_no', label: 'Account number', value: pv.account_no, mode: 'numeric' },
        { key: 'next_of_kin', label: 'Next of kin (name and phone)', value: pv.next_of_kin },
        { type: 'note', label: 'IC and bank details are personal data under the PDPA. Only the admin partner and this partner can see them; they are hidden in lists and used only to pay profit shares and claims.' });
    }
    openSheet(isNew ? 'Add a partner' : `Edit ${m.display_name}`, fields, async (v) => {
      const pk = ['full_name', 'ic_no', 'address', 'bank_name', 'account_holder', 'account_no', 'next_of_kin'];
      const row = { display_name: v.display_name, email: String(v.email).toLowerCase(), phone: v.phone };
      if (D.isAdmin) {
        row.capital = v.capital ?? 0; row.joined_on = v.joined_on; row.role = v.role;
        if ('active' in v && v.active != null) row.active = v.active === 'true';
        if (self && row.role !== 'admin' && !D.members.some((x) => x.id !== m.id && x.active && x.role === 'admin')) throw new Error('You are the only admin partner. Make another partner admin first.');
      }
      let id = m?.id;
      if (isNew) {
        const { data, error } = await sb.from('members').insert({ ...row, plantation_id: D.plantation.id }).select('id').single();
        if (error) throw error;
        id = data.id;
      } else {
        const { error } = await sb.from('members').update(row).eq('id', id);
        if (error) throw error;
      }
      if (showPriv) {
        const p = Object.fromEntries(pk.map((k) => [k, v[k] ?? null]));
        if (D.priv[id] || pk.some((k) => p[k])) {
          const { error } = await sb.from('member_private').upsert({ member_id: id, plantation_id: D.plantation.id, ...p, updated_at: new Date().toISOString() });
          if (error) throw error;
        }
      }
      await refresh(isNew ? 'Partner added' : 'Saved');
      if (isNew) location.hash = '#partner-' + id;
    }, isNew ? 'Add partner' : 'Save');
  }

  // ---------- Agencies (read-only for now) ----------
  // ================= AGENCIES, GRANTS AND PLANTING MATERIAL =================
  const GR_STEPS = ['Applied', 'Approved', 'Received', 'Planted', 'Completed'];
  const AG_TYPES = ['Government agency', 'Cooperative', 'Bank or financing', 'NGO', 'Company', 'Other'];
  const agName = (id) => D.agencies.find((a) => a.id === id)?.name || '';
  const grMaterial = (g) => D.receipts.filter((r) => r.grant_id === g.id);
  const matUses = (r) => D.uses.filter((u) => u.receipt_id === r.id);
  const nextBT = () => 'BT-' + String(D.receipts.reduce((m, x) => Math.max(m, parseInt(String(x.ref).replace(/\D/g, ''), 10) || 0), 0) + 1).padStart(2, '0');

  PAGES.agencies = (root) => {
    setHead('Agencies', 'Agencies, grants and aid');
    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => agencyForm(null) }, '+ Add an agency'));
    root.append(card(D.agencies.length ? D.agencies.map((a) => {
      const req = D.areq.filter((r) => r.agency_id === a.id);
      return linkRow('#agency-' + a.id, a.name, [a.type, a.programme].filter(Boolean).join(' · ') || 'Tap to add details', req.length ? `${req.filter((r) => r.done).length}/${req.length} done` : null);
    }) : h('p', { class: 'muted' }, 'No agencies yet.')));
    root.append(sec('Grants and aid received', xpBtn(SPEC.grants, 'Grants and aid')));
    root.append(card(D.grants.length ? [...D.grants].sort((a, b) => a.ref.localeCompare(b.ref)).map((g) => {
      const used = [...new Set(grMaterial(g).flatMap(matUses).map((u) => D.batches.find((b) => b.id === u.batch_id)?.no).filter(Boolean))].sort((a, b) => a - b);
      return linkRow('#grant-' + g.ref, `${g.ref} · ${g.title}`, [agName(g.agency_id), g.quantity, used.length ? 'Peringkat ' + used.join(', ') : ''].filter(Boolean).join(' · '), pill(g.status, g.status === 'Completed' ? 'green' : 'gold'));
    }) : h('p', { class: 'muted' }, 'No grants yet.')));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => grantForm(null) }, '+ Record grant or aid'));
    root.append(sec('Planting material received', xpBtn(SPEC.material, 'Planting material')));
    const tot = D.receipts.reduce((s, r) => s + r.qty, 0);
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'mrow ghead' }, h('span', {}, 'Ref · from'), h('span', {}, 'How'), h('span', { class: 'num' }, 'Qty')),
      [...D.receipts].sort((a, b) => a.ref.localeCompare(b.ref)).map((r) => h('a', { class: 'mrow', href: '#mat-' + r.ref }, h('span', {}, h('b', {}, r.ref), h('small', {}, `${r.source} · ${r.type}${r.received_on ? ' · ' + dstr(r.received_on) : ''}`)), h('span', {}, r.how), h('span', { class: 'num' }, fmt(r.qty)))),
      h('div', { class: 'mrow total' }, h('span', {}, 'Total'), h('span', {}), h('span', { class: 'num' }, fmt(tot)))));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => matForm(null) }, '+ Record planting material received'));
  };

  function agencyForm(a) {
    openSheet(a ? `Edit ${a.name}` : 'Add an agency', [
      { key: 'name', label: 'Name', required: true, value: a?.name, ph: 'e.g. LPNM (Lembaga Perindustrian Nanas Malaysia)' },
      { key: 'type', label: 'Type', type: 'select', value: a?.type || AG_TYPES[0], options: AG_TYPES.map((t) => [t, t]), half: true },
      { key: 'programme', label: 'Programme or scheme', value: a?.programme, ph: 'e.g. Free suckers', half: true },
      { type: 'head', label: 'Contact' },
      { key: 'officer', label: 'Officer', value: a?.officer, half: true },
      { key: 'phone', label: 'Phone', type: 'tel', mode: 'tel', value: a?.phone, half: true },
      { key: 'email', label: 'Email', type: 'email', mode: 'email', value: a?.email },
      { key: 'website', label: 'Website', value: a?.website, ph: 'e.g. www.mpib.gov.my' },
      { key: 'address', label: 'Address', type: 'textarea', value: a?.address }
    ], async (v) => {
      const id = a?.id || uuid();
      const { error } = a ? await sb.from('agencies').update(v).eq('id', a.id) : await sb.from('agencies').insert({ ...v, id, plantation_id: D.plantation.id });
      if (error) throw error;
      await refresh('Agency saved');
      location.hash = '#agency-' + id;
    });
  }

  PAGES.agency = (root, id) => {
    const a = D.agencies.find((x) => x.id === id);
    if (!a) { location.hash = '#agencies'; return; }
    setHead(a.name, [a.type, a.programme].filter(Boolean).join(' · '), ['Agencies', '#agencies']);
    const web = a.website ? (/^https?:\/\//.test(a.website) ? a.website : 'https://' + a.website) : null;
    root.append(h('div', { class: 'card kvs' }, kv('Officer', a.officer), kv('Phone', a.phone ? h('a', { href: 'tel:' + a.phone.replace(/\s/g, '') }, a.phone) : ''),
      kv('Email', a.email ? h('a', { href: 'mailto:' + a.email }, a.email) : '', true), kv('Website', web ? h('a', { href: web, target: '_blank', rel: 'noopener' }, a.website) : '', true), kv('Address', a.address, true)));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => agencyForm(a) }, 'Edit agency details'));
    const reqs = D.areq.filter((r) => r.agency_id === a.id).sort((x, y) => (x.sort || 0) - (y.sort || 0));
    root.append(sec(`What they require (${reqs.filter((r) => r.done).length}/${reqs.length} done)`));
    root.append(card(reqs.length ? reqs.map((r) => h('div', { class: 'trow req' },
      h('button', { type: 'button', class: 'check' + (r.done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(r.done), 'aria-label': r.text, onclick: async () => {
        const nv = !r.done; const { error } = await sb.from('agency_requirements').update({ done: nv }).eq('id', r.id); if (error) return toast(friendly(error)); r.done = nv; saveSnap(); route(); } }, r.done ? '✓' : ''),
      h('span', { class: 'lmain' + (r.done ? ' done' : '') }, r.text),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Remove', onclick: async () => { if (!window.confirm('Remove this item?')) return; const { error } = await sb.from('agency_requirements').delete().eq('id', r.id); if (error) return toast(friendly(error)); await refresh('Removed'); } }, '×'))) : h('p', { class: 'muted' }, 'Nothing listed yet, e.g. "Registered as a grower", "Copy of land lease".'),
      h('button', { class: 'btn link', type: 'button', onclick: () => openSheet('Add a requirement', [{ key: 'text', label: 'What they require', required: true, ph: 'e.g. Registered as a grower with LPNM' }], async (v) => {
        const { error } = await sb.from('agency_requirements').insert({ id: uuid(), agency_id: a.id, plantation_id: D.plantation.id, text: v.text, sort: reqs.length + 1 }); if (error) throw error; await refresh('Added'); }, 'Add') }, '+ Add a requirement')));
    const gs = D.grants.filter((g) => g.agency_id === a.id);
    root.append(sec('Grants and aid from this agency'));
    root.append(card(gs.length ? gs.map((g) => linkRow('#grant-' + g.ref, `${g.ref} · ${g.title}`, g.quantity || '', pill(g.status, g.status === 'Completed' ? 'green' : 'gold'))) : h('p', { class: 'muted' }, 'None yet.'),
      h('button', { class: 'btn link', type: 'button', onclick: () => grantForm(null, a.id) }, '+ Record grant or aid')));
    root.append(attachBox('agency', a.id, 'Documents and letters'));
    if (D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => {
      if (gs.length) return toast('This agency has grants recorded, so it can\'t be deleted.');
      openSheet(`Delete ${a.name}?`, [{ type: 'note', label: 'The agency and its checklist are removed.' }], async () => { const { error } = await sb.from('agencies').delete().eq('id', a.id); if (error) throw error; location.hash = '#agencies'; await refresh('Agency deleted'); }, 'Delete', true);
    } }, 'Delete this agency'));
  };

  function grantForm(g, agencyId) {
    openSheet(g ? `Edit ${g.ref}` : 'Record grant or aid', [
      { key: 'title', label: 'What it is', required: true, value: g?.title, ph: 'e.g. LPNM free suckers' },
      { key: 'agency_id', label: 'From', type: 'select', value: g?.agency_id || agencyId || D.agencies[0]?.id || '', options: [['', '— not from a listed agency —'], ...D.agencies.map((a) => [a.id, a.name])] },
      { key: 'status', label: 'Status', type: 'select', value: g?.status || 'Applied', options: GR_STEPS.map((s) => [s, s]), half: true },
      { key: 'applied_on', label: 'Applied on', type: 'date', value: g?.applied_on, half: true },
      { key: 'approved_on', label: 'Approved on', type: 'date', value: g?.approved_on, half: true },
      { key: 'quantity', label: 'Quantity', value: g?.quantity, ph: 'e.g. 34,000 sulur', half: true },
      { key: 'value_note', label: 'Value or cost to us', value: g?.value_note, ph: 'e.g. Free, no charge / RM 5,000 subsidy' },
      { key: 'conditions', label: 'Conditions and reporting', type: 'textarea', value: g?.conditions, ph: 'e.g. Report planting progress to the officer every 6 months' }
    ], async (v) => {
      v.agency_id = v.agency_id || null;
      const ref = g?.ref || nextRef('GR-', D.grants);
      const { error } = g ? await sb.from('grants').update(v).eq('id', g.id) : await sb.from('grants').insert({ ...v, id: uuid(), ref, plantation_id: D.plantation.id });
      if (error) throw error;
      await refresh(g ? 'Grant saved' : `Grant ${ref} recorded`);
      location.hash = '#grant-' + ref;
    });
  }

  PAGES.grant = (root, ref) => {
    const g = D.grants.find((x) => x.ref === ref);
    if (!g) { location.hash = '#agencies'; return; }
    setHead(`${g.ref} · ${g.title}`, g.status, ['Agencies', '#agencies']);
    const at = GR_STEPS.indexOf(g.status);
    root.append(h('div', { class: 'card' }, h('div', { class: 'steps' }, GR_STEPS.map((s, i) => h('button', { type: 'button', class: 'step' + (i <= at ? ' on' : ''), 'aria-label': `Set status to ${s}`, onclick: async () => {
      if (s === g.status) return; const { error } = await sb.from('grants').update({ status: s }).eq('id', g.id); if (error) return toast(friendly(error)); await refresh(`${g.ref} is now ${s}`); } }, h('i'), h('span', {}, s)))),
      h('p', { class: 'muted small' }, 'Tap a step to update the status.')));
    const mats = grMaterial(g);
    const dates = mats.map((r) => r.received_on).filter(Boolean).sort();
    root.append(h('div', { class: 'card kvs' }, kv('Agency', g.agency_id ? h('a', { href: '#agency-' + g.agency_id }, agName(g.agency_id)) : '', true),
      kv('Applied', dstr(g.applied_on)), kv('Approved', dstr(g.approved_on)),
      kv('Received', dates.length ? `${dstr(dates[0])}${dates.length > 1 ? ' – ' + dstr(dates[dates.length - 1]) : ''} · ${mats.length} deliver${mats.length > 1 ? 'ies' : 'y'}` : ''),
      kv('Quantity', g.quantity), kv('Value or cost to us', g.value_note, true), kv('Conditions', g.conditions, true)));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => grantForm(g) }, 'Edit grant details'));
    root.append(sec(`Deliveries and where they went (${mats.length})`, xpBtn(() => SPEC.material(mats, `${g.ref} · ${g.title}: deliveries`), g.ref)));
    root.append(card(mats.length ? mats.map((r) => linkRow('#mat-' + r.ref, `${r.ref} · ${fmt(r.qty)} ${r.type.toLowerCase()}`, `${r.received_on ? dstr(r.received_on) : 'date not entered'} · ${usesText(r) || 'not linked to a peringkat yet'}`)) : h('p', { class: 'muted' }, 'No deliveries recorded yet.'),
      h('button', { class: 'btn link', type: 'button', onclick: () => matForm(null, g) }, '+ Record a delivery')));
    root.append(attachBox('grant', g.id, 'Letters, forms and photos'));
    if (D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => {
      if (mats.length) return toast('This grant has deliveries recorded, so it can\'t be deleted.');
      openSheet(`Delete ${g.ref}?`, [{ type: 'note', label: 'The grant record is removed.' }], async () => { const { error } = await sb.from('grants').delete().eq('id', g.id); if (error) throw error; location.hash = '#agencies'; await refresh('Grant deleted'); }, 'Delete', true);
    } }, 'Delete this grant'));
  };

  const usesText = (r) => matUses(r).map((u) => `${u.batch_id ? 'P' + (D.batches.find((b) => b.id === u.batch_id)?.no ?? '?') : '—'} ${u.use === 'Sulam' ? 'sulam ' : ''}${fmt(u.qty)}`).join(', ');

  function matForm(r, grant) {
    const fromGrant = grant || (r?.grant_id ? D.grants.find((g) => g.id === r.grant_id) : null);
    openSheet(r ? `Edit ${r.ref}` : 'Planting material received', [
      { key: 'received_on', label: 'Received on', type: 'date', value: r ? r.received_on : today(), half: true },
      { key: 'qty', label: 'Quantity', type: 'number', mode: 'numeric', required: true, value: r?.qty, half: true },
      { key: 'type', label: 'Type', type: 'select', value: r?.type || 'Sulur', options: [['Sulur', 'Sulur (suckers)'], ['Jambul', 'Jambul (crowns)']], half: true },
      { key: 'how', label: 'How we got it', type: 'select', value: r?.how || (fromGrant ? 'Grant' : 'Bought'), options: [['Bought', 'Bought'], ['Grant', 'Grant or aid'], ['Free', 'Free']], half: true },
      { key: 'grant_id', label: 'Which grant', type: 'select', value: fromGrant?.id || '', options: [['', '—'], ...D.grants.map((g) => [g.id, `${g.ref} · ${g.title}`])], showIf: (x) => x.how === 'Grant' },
      { key: 'source', label: 'From (seller or agency)', required: true, value: r?.source || (fromGrant ? agName(fromGrant.agency_id).split(' (')[0] : ''), ph: 'e.g. Hj. Mahmud' },
      { key: 'notes', label: 'Notes', type: 'textarea', value: r?.notes },
      { type: 'note', label: r ? 'Where it was planted is set on the next screen.' : 'Next, record which peringkat it went to. If it was bought, also add the cost in Finance.' }
    ], async (v) => {
      if (!(v.qty > 0)) throw new Error('Quantity must be more than 0.');
      v.qty = Math.round(v.qty); v.grant_id = v.how === 'Grant' ? (v.grant_id || null) : null;
      const ref = r?.ref || nextBT();
      const { error } = r ? await sb.from('material_receipts').update(v).eq('id', r.id) : await sb.from('material_receipts').insert({ ...v, id: uuid(), ref, plantation_id: D.plantation.id });
      if (error) throw error;
      await refresh(r ? 'Saved' : `${ref} recorded`);
      location.hash = '#mat-' + ref;
    });
  }

  PAGES.mat = (root, ref) => {
    const r = D.receipts.find((x) => x.ref === ref);
    if (!r) { location.hash = '#agencies'; return; }
    const g = r.grant_id ? D.grants.find((x) => x.id === r.grant_id) : null;
    setHead(`${r.ref} · ${fmt(r.qty)} ${r.type.toLowerCase()}`, `${r.how} · ${r.source}`, g ? [g.ref, '#grant-' + g.ref] : ['Agencies', '#agencies']);
    root.append(h('div', { class: 'card kvs' }, kv('Received', dstr(r.received_on)), kv('Quantity', `${fmt(r.qty)} ${r.type === 'Sulur' ? 'sulur (suckers)' : 'jambul (crowns)'}`),
      kv('How', r.how), kv('From', r.source), g ? kv('Grant', h('a', { href: '#grant-' + g.ref }, `${g.ref} · ${g.title}`), true) : null, kv('Notes', r.notes, true)));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => matForm(r) }, 'Edit'));
    const us = matUses(r);
    const used = us.reduce((s, u) => s + u.qty, 0);
    root.append(sec(`Where it went (${fmt(used)} of ${fmt(r.qty)})`));
    root.append(card(us.length ? us.map((u) => { const b = D.batches.find((x) => x.id === u.batch_id);
      return h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, b ? b.name : 'No peringkat'), h('small', {}, u.use === 'Sulam' ? 'Sulam (replacing dead plants)' : 'Planting')), h('span', { class: 'lright' }, fmt(u.qty)),
        h('button', { type: 'button', class: 'x', 'aria-label': 'Remove', onclick: async () => { if (!window.confirm('Remove this line?')) return; const { error } = await sb.from('material_uses').delete().eq('id', u.id); if (error) return toast(friendly(error)); await refresh('Removed'); } }, '×')); })
      : h('p', { class: 'muted' }, 'Not linked to a peringkat yet.'),
      used < r.qty ? h('button', { class: 'btn link', type: 'button', onclick: () => openSheet('Where it went', [
        { key: 'batch_id', label: 'Peringkat', type: 'select', value: D.batches[0]?.id, options: [...D.batches].sort((a, b) => a.no - b.no).map((b) => [b.id, b.name]) },
        { key: 'use', label: 'Used for', type: 'select', value: 'Planting', options: [['Planting', 'Planting'], ['Sulam', 'Sulam (replacing dead plants)']], half: true },
        { key: 'qty', label: 'How many', type: 'number', mode: 'numeric', required: true, value: r.qty - used, half: true }
      ], async (v) => {
        if (!(v.qty > 0)) throw new Error('How many must be more than 0.');
        if (used + v.qty > r.qty) throw new Error(`Only ${fmt(r.qty - used)} left from this delivery.`);
        const { error } = await sb.from('material_uses').insert({ id: uuid(), receipt_id: r.id, plantation_id: D.plantation.id, batch_id: v.batch_id, use: v.use, qty: Math.round(v.qty) }); if (error) throw error;
        await refresh('Saved');
      }, 'Add') }, '+ Add where it went') : null));
    root.append(attachBox('material', r.id, 'Delivery note and photos'));
    if (D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${r.ref}?`, [{ type: 'note', label: 'The delivery and where it went are removed.' }], async () => {
      const { error } = await sb.from('material_receipts').delete().eq('id', r.id); if (error) throw error; location.hash = g ? '#grant-' + g.ref : '#agencies'; await refresh('Deleted'); }, 'Delete', true) }, 'Delete this record'));
  };

  // ---------- Settings ----------
  // ================= SETTINGS =================
  const CURS = { MYR: ['RM', 'Malaysian ringgit'], SGD: ['S$', 'Singapore dollar'], BND: ['B$', 'Brunei dollar'], IDR: ['Rp', 'Indonesian rupiah'], THB: ['฿', 'Thai baht'], PHP: ['₱', 'Philippine peso'], USD: ['US$', 'US dollar'] };
  const SET_PAGES = [
    ['profile', 'Plantation profile', () => 'Name, logo, SSM number, location, land and lease'],
    ['currency', 'Currency', () => `${CURS[D.plantation.currency]?.[1] || D.plantation.currency} (${CUR()})`],
    ['crop', 'Crop calendar', () => `Months and tasks per variety: ${(D.templates || []).map((t) => t.variety).join(', ') || 'none yet'}`],
    ['cats', 'Cost categories', () => `${D.cats.length} categories in Beli, Upah and Lain`],
    ['parties', 'Contractors and buyers', () => `${D.contractors.length} contractor(s) · ${D.buyers.length} buyer(s)`],
    ['notif', 'Notifications', () => 'Alerts, claims, jobs due, rent, buyers, weekly summary'],
    ['storage', 'Storage and backup', () => 'Photo size, how long reports are kept, download all data'],
    ['lang', 'Language and dates', () => `${LANG === 'ms' ? 'Bahasa Melayu' : 'English'} · dates like ${dstr(today())}`]
  ];
  const back = ['Settings', '#settings'];
  const adminNote = () => (D.isAdmin ? null : h('p', { class: 'muted small foot' }, 'Only the admin partner can change this.'));
  function radioList(opts, cur, onPick, disabled) {
    return h('div', { class: 'radio-list' }, opts.map(([v, l, s]) => h('button', { type: 'button', class: 'radio' + (String(v) === String(cur) ? ' on' : ''), disabled: !!disabled, 'aria-pressed': String(String(v) === String(cur)), onclick: () => onPick(v) },
      h('span', { class: 'lmain' }, h('b', {}, l), s ? h('small', {}, s) : null), h('span', { class: 'tick' }, String(v) === String(cur) ? '✓' : ''))));
  }
  const toggle = (on, label, onChange, disabled) => h('button', { type: 'button', role: 'switch', class: 'switch' + (on ? ' on' : ''), 'aria-checked': String(!!on), 'aria-label': label, disabled: !!disabled, onclick: () => onChange(!on) }, h('span', {}));

  PAGES.settings = (root, sub) => {
    if (sub && SETTINGS[sub]) return SETTINGS[sub](root);
    setHead('Settings', D.plantation.name);
    root.append(card(SET_PAGES.map(([k, l, s]) => linkRow('#settings-' + k, l, s())), linkRow('#reports', 'Reports', `Saved Excel and PDF files, kept ${D.settings.keep_reports_months || 12} months`)));
    root.append(sec('Me'));
    root.append(card(linkRow('#partner-' + D.me.id, 'My details', `${D.me.display_name} · ${D.user.email}`)));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: signOut }, 'Sign out'));
    root.append(h('p', { class: 'muted small foot center-t' }, 'LadangKita'));
  };

  const SETTINGS = {};
  SETTINGS.profile = (root) => {
    setHead('Plantation profile', D.plantation.name, back);
    const p = D.plantation;
    const logo = h('div', { class: 'logo-box' }, h('span', {}, 'Logo'));
    if (p.logo_path) sb.storage.from('files').createSignedUrl(p.logo_path, 3600).then(({ data }) => { if (data?.signedUrl) logo.replaceChildren(h('img', { src: data.signedUrl, alt: 'Plantation logo' })); });
    const pick = h('input', { type: 'file', accept: 'image/*', class: 'vh', onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (!navigator.onLine) return toast('Uploading the logo needs signal.');
      try {
        const blob = await shrink(f, 512);
        const path = `${p.id}/logo/${uuid()}.jpg`;
        const up = await sb.storage.from('files').upload(path, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
        const { error } = await sb.from('plantations').update({ logo_path: path }).eq('id', p.id); if (error) throw error;
        if (p.logo_path) sb.storage.from('files').remove([p.logo_path]);
        await refresh('Logo saved');
      } catch (ex) { toast(friendly(ex)); }
    } });
    root.append(h('div', { class: 'card logo-row' }, logo, D.isAdmin ? h('label', { class: 'btn ghost' }, pick, p.logo_path ? 'Change logo' : 'Upload plantation logo') : h('small', { class: 'muted' }, 'Shown on reports.')));
    root.append(sec('Details', D.isAdmin ? h('button', { class: 'btn small-btn', type: 'button', onclick: editPlantation }, 'Edit') : null));
    root.append(h('div', { class: 'card kvs' },
      kv('Name', p.name, true), kv('SSM number', p.ssm_no), kv('Business type', p.business_type), kv('Started', dstr(p.started_on)),
      kv('Area', p.area_acres ? `${Number(p.area_acres).toFixed(2)} acres${p.length_m ? ` (${fmt(p.length_m)} m × ${fmt(p.width_m)} m)` : ''}` : ''),
      kv('Address', [p.address, p.district_state].filter(Boolean).join(', '), true), kv('GPS', p.gps, true),
      kv('Landowner', p.landowner), kv('Rent', p.rent_amount != null ? `${rm(p.rent_amount)}${p.rent_period ? ' / ' + p.rent_period.toLowerCase() : ''}` : ''),
      kv('Next rent due', dstr(p.rent_due_on)), kv('Lease ends', dstr(p.lease_ends_on)), kv('Phone', p.phone), kv('Email', p.email, true)));
    root.append(adminNote() || h('p', { class: 'muted small foot' }, 'The next rent date moves forward by itself after each due date (monthly or yearly rent). Partners get a reminder before it.'));
  };

  SETTINGS.currency = (root) => {
    setHead('Currency', 'Used for every amount in the app and in reports', back);
    root.append(radioList(Object.entries(CURS).map(([c, [sym, name]]) => [c, `${name} (${sym})`, c]), D.plantation.currency, async (c) => {
      if (c === D.plantation.currency) return;
      const { error } = await sb.from('plantations').update({ currency: c }).eq('id', D.plantation.id);
      if (error) return toast(friendly(error));
      await refresh('Currency saved');
    }, !D.isAdmin || !navigator.onLine));
    root.append(h('p', { class: 'muted small foot' }, 'Changing it only changes the symbol shown; amounts already entered are not converted.'));
    root.append(adminNote() || h('span'));
  };

  let cropSel = null;
  SETTINGS.crop = (root) => {
    setHead('Crop calendar', 'Months and tasks for each variety', back);
    const list = [...(D.templates || [])].sort((a, b) => a.variety.localeCompare(b.variety));
    if (!list.find((t) => t.id === cropSel)) cropSel = list[0]?.id || null;
    root.append(h('div', { class: 'seg' }, list.map((t) => h('button', { type: 'button', class: t.id === cropSel ? 'on' : '', onclick: () => { cropSel = t.id; route(); } }, t.variety)),
      h('button', { type: 'button', class: 'dash', onclick: () => cropForm(null) }, '+ Variety')));
    const t = list.find((x) => x.id === cropSel);
    if (!t) { root.append(card(h('p', { class: 'muted' }, 'No varieties yet. Add one to start.'))); return; }
    const used = D.batches.filter((b) => b.variety === t.variety);
    const num = (v) => h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: v ?? '' });
    const f1 = num(t.months_to_induction), f2 = num(t.months_induction_to_harvest), f3 = num(t.fruit_per_acre);
    root.append(h('div', { class: 'card crop-facts' },
      h('label', {}, 'Months from planting to hormon', f1), h('label', {}, 'Months from hormon to harvest', f2), h('label', {}, 'Fruit per acre (expected)', f3)));
    const tasks = (Array.isArray(t.tasks) ? t.tasks : []).map((x) => ({ name: x.name ?? x[0] ?? '', month: x.month ?? x[1] ?? '' }));
    const box = h('div', { class: 'card task-edit' });
    const draw = () => box.replaceChildren(h('div', { class: 'te-row te-head' }, h('span', {}, 'Task'), h('span', {}, 'Month'), h('span', {})),
      ...(tasks.length ? tasks.map((x, i) => h('div', { class: 'te-row' },
        h('input', { value: x.name, 'aria-label': 'Task name', placeholder: 'e.g. Tabur baja', oninput: (e) => { x.name = e.target.value; } }),
        h('input', { value: x.month, type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': 'Month after planting', oninput: (e) => { x.month = e.target.value; } }),
        h('button', { type: 'button', class: 'x', 'aria-label': 'Remove task', onclick: () => { tasks.splice(i, 1); draw(); } }, '×'))) : [h('p', { class: 'muted small' }, 'No tasks yet.')]),
      h('button', { type: 'button', class: 'btn link', onclick: () => { tasks.push({ name: '', month: '' }); draw(); box.querySelector('.te-row:last-of-type input')?.focus(); } }, '+ Add task'));
    draw();
    root.append(sec('Tasks, counted from the planting date'));
    root.append(box);
    root.append(h('p', { class: 'muted small foot' }, 'These months are a starting guide; set them from your own experience or the agency\'s advice. Each peringkat with this variety shows these tasks with their dates. The harvest outlook on the Dashboard uses the first two numbers.'));
    const n = (el) => (el.value === '' ? null : Number(el.value));
    root.append(h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (!navigator.onLine) return toast('Saving the calendar needs signal.');
      const clean = tasks.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), month: x.month === '' ? null : Number(x.month) })).sort((a, b) => (a.month ?? 999) - (b.month ?? 999));
      const { error } = await sb.from('crop_templates').update({ months_to_induction: n(f1), months_induction_to_harvest: n(f2), fruit_per_acre: n(f3) == null ? null : Math.round(n(f3)), tasks: clean }).eq('id', t.id);
      if (error) return toast(friendly(error));
      await refresh('Crop calendar saved');
    } }, 'Save calendar'));
    root.append(h('div', { class: 'row-btns' }, h('button', { class: 'btn link', type: 'button', onclick: () => cropForm(t) }, 'Rename'),
      D.isAdmin ? h('button', { class: 'btn link danger-t', type: 'button', onclick: () => {
        if (used.length) return toast(`${t.variety} is set on ${used.map((b) => 'P' + b.no).join(', ')}. Change those first.`);
        openSheet(`Delete ${t.variety}?`, [{ type: 'note', label: 'The months and tasks for this variety are removed.' }], async () => { const { error } = await sb.from('crop_templates').delete().eq('id', t.id); if (error) throw error; cropSel = null; await refresh('Variety deleted'); }, 'Delete', true);
      } }, 'Delete variety') : null));
    root.append(h('p', { class: 'muted small' }, used.length ? `Set on: ${used.map((b) => b.name).join(', ')}` : 'Not set on any peringkat yet (Status → peringkat → Edit).'));
  };

  SETTINGS.cats = (root) => {
    setHead('Cost categories', 'Every cost is filed under one category', back);
    root.append(h('p', { class: 'muted small' }, h('b', {}, 'Beli'), ' = things bought, ', h('b', {}, 'Upah'), ' = paid work (used for Jobs), ', h('b', {}, 'Lain'), ' = everything else. Finance shows the money by these categories.'));
    const usedBy = (name) => D.jobs.filter((j) => j.category === name).length + D.purchases.filter((p) => p.category === name).length;
    for (const [g, title] of [['Beli', 'Beli (bought)'], ['Upah', 'Upah (paid work)'], ['Lain', 'Lain (other)']]) {
      const items = D.cats.filter((c) => c.grp === g).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
      root.append(sec(title));
      root.append(card(items.length ? items.map((c) => { const n = usedBy(c.name); return h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, c.name), n ? h('small', {}, `used ${n} time(s)`) : null),
        D.isAdmin ? h('button', { type: 'button', class: 'x', 'aria-label': `Remove ${c.name}`, onclick: () => {
          if (n) return toast(`${c.name} is used ${n} time(s), so it can't be removed.`);
          openSheet(`Remove ${c.name}?`, [{ type: 'note', label: 'It will no longer be offered when recording costs.' }], async () => { const { error } = await sb.from('cost_categories').delete().eq('id', c.id); if (error) throw error; await refresh('Category removed'); }, 'Remove', true);
        } }, '×') : null); }) : h('p', { class: 'muted' }, 'None.')));
    }
    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => openSheet('Add a category', [
      { key: 'grp', label: 'Group', type: 'select', value: 'Beli', options: [['Beli', 'Beli (bought)'], ['Upah', 'Upah (paid work)'], ['Lain', 'Lain (other)']] },
      { key: 'name', label: 'Name', required: true, ph: 'e.g. Beli Racun Rumput' }
    ], async (v) => {
      if (D.cats.some((c) => c.name.toLowerCase() === v.name.trim().toLowerCase())) throw new Error('That category already exists.');
      const sort = Math.max(0, ...D.cats.filter((c) => c.grp === v.grp).map((c) => c.sort || 0)) + 1;
      const { error } = await sb.from('cost_categories').insert({ plantation_id: D.plantation.id, grp: v.grp, name: v.name.trim(), sort });
      if (error) throw error;
      await refresh('Category added');
    }, 'Add') }, '+ Add a category'));
  };

  let partyTab = 'c';
  const BUYER_TYPES = ['Wholesaler', 'Retailer', 'Factory', 'Exporter', 'Market stall', 'Individual'];
  SETTINGS.parties = (root) => {
    setHead('Contractors and buyers', 'Fills the choices in Jobs and Sales', back);
    root.append(h('div', { class: 'seg' }, [['c', `Contractors (${D.contractors.length})`], ['b', `Buyers (${D.buyers.length})`]].map(([k, l]) => h('button', { type: 'button', class: partyTab === k ? 'on' : '', onclick: () => { partyTab = k; route(); } }, l))));
    const isC = partyTab === 'c';
    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => partyForm(isC, null) }, isC ? '+ Add a contractor' : '+ Add a buyer'));
    const list = isC ? D.contractors : D.buyers;
    root.append(card(list.length ? list.map((x) => {
      const n = isC ? D.jobs.filter((j) => j.contractor_id === x.id).length : D.picks.filter((k) => k.buyer_id === x.id).length;
      const tags = (isC ? x.work_types : x.buyer_types) || [];
      return h('div', { class: 'trow' }, h('a', { class: 'lmain', href: isC ? '#jobs-c-' + x.id : '#sales-b-' + x.id }, h('b', {}, x.name),
        h('small', {}, [x.phone, tags.join(', ')].filter(Boolean).join(' · ') || (isC ? 'No work types set' : 'No buyer type set')),
        h('small', {}, isC ? `${n} job(s)${x.bank_name ? ' · ' + x.bank_name : ''}` : `${n} pick(s)${x.payment_terms ? ' · ' + x.payment_terms : ''}`)),
        h('button', { class: 'btn small-btn', type: 'button', onclick: () => partyForm(isC, x) }, 'Edit'));
    }) : h('p', { class: 'muted' }, 'None added yet. They are also added when you type a new name in a job or harvest pick.')));
  };
  function partyForm(isC, x) {
    const upah = D.cats.filter((c) => c.grp === 'Upah').map((c) => [c.name, c.name.replace(/^Upah /, '')]);
    const fields = isC ? [
      { key: 'name', label: 'Name', required: true, value: x?.name },
      { key: 'phone', label: 'Phone', type: 'tel', mode: 'tel', value: x?.phone, half: true },
      { key: 'ssm_or_ic', label: 'SSM or IC number', value: x?.ssm_or_ic, half: true },
      { key: 'work_types', label: 'Work they do', type: 'chips', value: x?.work_types || [], options: upah },
      { key: 'bank_name', label: 'Bank', value: x?.bank_name, ph: 'e.g. Maybank', half: true },
      { key: 'account_no', label: 'Account number', value: x?.account_no, mode: 'numeric', half: true },
      { key: 'usual_rates', label: 'Usual rates', value: x?.usual_rates, ph: `e.g. Sembur ${CUR()} 250 per acre` },
      { key: 'address', label: 'Address', type: 'textarea', value: x?.address }
    ] : [
      { key: 'name', label: 'Name', required: true, value: x?.name },
      { key: 'phone', label: 'Phone', type: 'tel', mode: 'tel', value: x?.phone },
      { key: 'buyer_types', label: 'Type of buyer', type: 'chips', value: x?.buyer_types || [], options: BUYER_TYPES.map((t) => [t, t]) },
      { key: 'payment_terms', label: 'Payment terms', value: x?.payment_terms, ph: 'e.g. Cash on pick-up / 14 days', half: true },
      { key: 'grades_bought', label: 'Grades bought', value: x?.grades_bought, ph: 'e.g. A and B', half: true },
      { key: 'address', label: 'Address', type: 'textarea', value: x?.address }
    ];
    openSheet(x ? `Edit ${x.name}` : isC ? 'New contractor' : 'New buyer', fields, async (v) => {
      const table = isC ? 'contractors' : 'buyers';
      if (!x && (isC ? D.contractors : D.buyers).some((y) => y.name.toLowerCase() === v.name.trim().toLowerCase())) throw new Error(`${v.name} is already in the list.`);
      const { error } = x ? await sb.from(table).update(v).eq('id', x.id) : await sb.from(table).insert({ ...v, plantation_id: D.plantation.id });
      if (error) throw error;
      if (x && isC) await sb.from('jobs').update({ contractor_name: v.name }).eq('contractor_id', x.id).neq('status', 'Paid');
      await refresh(isC ? 'Contractor saved' : 'Buyer saved');
    });
  }

  const NOTIFS = [
    ['alert', 'Urgent alerts', 'Straight away, when a partner reports one'],
    ['claim', 'Expense claims', 'When a partner claims, then weekly while unpaid'],
    ['job', 'Jobs due or late', 'Before a planned job; the day after it is late, then weekly', [[1, '1 day before'], [3, '3 days before'], [7, '7 days before']]],
    ['buyer', 'Buyer payment overdue', 'When a harvest pick stays unpaid, then weekly', [[7, 'After 7 days'], [14, 'After 14 days'], [30, 'After 30 days']]],
    ['rent', 'Land rent due', 'Before the next rent date (set in the plantation profile)', [[7, '7 days before'], [14, '14 days before'], [30, '30 days before']]],
    ['lease', 'Lease ending', 'Before the lease end date', [[90, '3 months before'], [180, '6 months before']]],
    ['weekly', 'Weekly summary', 'Monday morning: last week in numbers']
  ];
  const NDEF = { job: 3, buyer: 7, rent: 7, lease: 90 };
  SETTINGS.notif = (root) => {
    setHead('Notifications', 'Your own choices; other partners choose theirs', back);
    root.append(sec('This phone'));
    root.append(pushCard(false));
    const pref = { ...(D.me.notify || {}) };
    const save = async () => {
      const { error } = await sb.from('members').update({ notify: pref }).eq('id', D.me.id);
      if (error) return toast(friendly(error));
      D.me.notify = pref; const m = D.members.find((x) => x.id === D.me.id); if (m) m.notify = pref; saveSnap(); route(); toast('Saved');
    };
    root.append(sec('What you get'));
    root.append(card(NOTIFS.map(([k, l, s, days]) => {
      const on = pref[k] !== false;
      return h('div', { class: 'trow notif' }, h('span', { class: 'lmain' }, h('b', {}, l), h('small', {}, s)),
        days ? h('select', { 'aria-label': `${l}: when`, disabled: !on || !navigator.onLine, onchange: (e) => { pref[k + '_days'] = Number(e.target.value); save(); } }, days.map(([v, t]) => h('option', { value: v, selected: Number(pref[k + '_days'] || NDEF[k]) === v }, t))) : null,
        toggle(on, l, (v) => { if (!navigator.onLine) return toast('Changing this needs signal.'); pref[k] = v; save(); }));
    })));
    root.append(h('p', { class: 'muted small foot' }, 'Reminders are checked every morning at about 8 am. They only reach phones where notifications are turned on (above).'));
    root.append(sec('Weekly backup by email'));
    root.append(card(h('p', { class: 'muted' }, 'Sending the full report by email needs the plantation\'s own email sender, which is set up before the other partners join. Until then, use Storage and backup → Download all data now.')));
  };

  SETTINGS.storage = (root) => {
    setHead('Storage and backup', D.plantation.name, back);
    const mb = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
    const photos = D.atts.reduce((s, a) => s + (a.bytes || 0), 0), reps = D.reports.reduce((s, r) => s + (r.bytes || 0), 0);
    root.append(h('div', { class: 'card' }, h('div', { class: 'st-row' }, h('span', {}, 'Storage used'), h('b', {}, mb(photos + reps))),
      h('p', { class: 'muted small' }, `Photos and receipts ${mb(photos)} (${D.atts.length} files) · reports ${mb(reps)} (${D.reports.length} files) · records are tiny.`)));
    root.append(sec('Photo size when uploading'));
    const setS = async (vals, msg) => {
      if (!navigator.onLine) return toast('Changing this needs signal.');
      const { error } = await sb.from('settings').upsert({ plantation_id: D.plantation.id, ...vals }, { onConflict: 'plantation_id' });
      if (error) return toast(friendly(error));
      await refresh(msg);
    };
    root.append(radioList([['Small', 'Small (about 200 KB)', 'Recommended: clear enough for receipts, saves space and data'], ['Medium', 'Medium (about 500 KB)', 'Sharper photos of crops and damage'], ['Original', 'Original', 'As taken by the camera (can be several MB)']],
      D.settings.photo_size || 'Small', (v) => setS({ photo_size: v }, 'Photo size saved'), !D.isAdmin));
    root.append(sec('Keep saved reports for'));
    root.append(radioList([[6, '6 months', ''], [12, '12 months', 'Recommended'], [24, '24 months', '']], D.settings.keep_reports_months || 12, (v) => setS({ keep_reports_months: Number(v) }, 'Saved'), !D.isAdmin));
    root.append(h('p', { class: 'muted small foot' }, 'Older saved reports are removed when the admin opens Reports. Photos and records are never removed automatically.'));
    root.append(adminNote() || h('span'));
    root.append(sec('Backup'));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => exportSheet(fullReport, 'All data') }, 'Download all data now (Excel / PDF)'));
    root.append(h('p', { class: 'muted small foot' }, 'Every table in one file. The data is also kept safe on the server with daily backups.'));
  };

  SETTINGS.lang = (root) => {
    setHead('Language and dates', 'For this phone', back);
    root.append(sec('Language'));
    root.append(radioList([['ms', 'Bahasa Melayu', ''], ['en', 'English', '']], LANG, (v) => {
      if (v === LANG) return;
      try { localStorage.setItem('lk_lang', v); } catch (_) { /* ignore */ }
      location.reload();
    }));
    root.append(h('p', { class: 'muted small foot' }, 'Field words stay in Malay: blok, peringkat, upah, beli…'));
    root.append(sec('Date format'));
    const ex = '2026-11-25';
    root.append(radioList(Object.entries(DATE_FMTS).map(([k, f]) => [k, f(ex), k === 'd MMM y' ? 'Default' : '']), dateFmt(), (v) => { try { localStorage.setItem('lk_datefmt', v); } catch (_) { /* ignore */ } route(); toast('Date format saved on this phone'); }));
  };

  function editPlantation() {
    const p = D.plantation;
    openSheet('Plantation profile', [
      { key: 'name', label: 'Plantation name', required: true, value: p.name },
      { key: 'ssm_no', label: 'SSM registration number', value: p.ssm_no },
      { key: 'business_type', label: 'Business type', type: 'select', value: p.business_type || '', options: [['', '—'], ['Partnership', 'Partnership'], ['Sole proprietor', 'Sole proprietor'], ['Sdn Bhd', 'Sdn Bhd'], ['Cooperative', 'Cooperative'], ['Not registered', 'Not registered']] },
      { key: 'started_on', label: 'Started on', type: 'date', value: p.started_on },
      { key: 'area_acres', label: 'Total area (acres)', type: 'number', mode: 'decimal', value: p.area_acres },
      { type: 'head', label: 'Location' },
      { key: 'address', label: 'Address', type: 'textarea', value: p.address },
      { key: 'district_state', label: 'District, state', value: p.district_state, ph: 'e.g. Pontian, Johor' },
      { key: 'gps', label: 'GPS', value: p.gps, ph: 'e.g. 1.4870, 103.3900' },
      { type: 'head', label: 'Land and lease' },
      { key: 'landowner', label: 'Landowner', value: p.landowner },
      { key: 'rent_amount', label: 'Rent (RM)', type: 'number', mode: 'decimal', value: p.rent_amount },
      { key: 'rent_period', label: 'Rent per', type: 'select', value: p.rent_period || '', options: [['', '—'], ['Month', 'Month'], ['Year', 'Year'], ['Season', 'Season']] },
      { key: 'rent_due_on', label: 'Next rent due on', type: 'date', value: p.rent_due_on },
      { key: 'lease_ends_on', label: 'Lease ends on', type: 'date', value: p.lease_ends_on },
      { type: 'head', label: 'Contact' },
      { key: 'phone', label: 'Phone', type: 'tel', mode: 'tel', value: p.phone },
      { key: 'email', label: 'Email', type: 'email', mode: 'email', value: p.email }
    ], async (v) => {
      const { error } = await sb.from('plantations').update(v).eq('id', p.id);
      if (error) throw error;
      await refresh('Plantation profile saved');
    });
  }

  // ================= JOBS AND CONTRACTOR PAYMENTS (Stage 2) =================
  const OPEN = ['Planned', 'Quoted', 'In progress'];
  const DONE = ['Done', 'To pay', 'Paid'];
  const statusKind = (st) => ({ Planned: 'gold', Quoted: 'gold', 'In progress': 'gold', Done: 'amber', 'To pay': 'amber', Paid: 'green' })[st] || '';
  const statusLabel = (j) => (j.status === 'Done' && j.price == null ? 'Done · cost to enter' : j.status);
  const jobName = (j) => (j.category === 'Upah Lain-lain' && j.other_note ? 'Upah Lain-lain: ' + j.other_note : j.category);
  const jobBatches = (j) => D.jb.filter((x) => x.job_id === j.id).map((x) => D.batches.find((b) => b.id === x.batch_id)).filter(Boolean).sort((a, b) => a.no - b.no);
  const jobPlots = (j) => { const bs = jobBatches(j); return bs.length ? bs.map((b) => 'P' + b.no).join(', ') : 'No peringkat'; };
  const jobPay = (j) => { const l = D.pj.find((x) => x.job_id === j.id); return l ? D.pays.find((p) => p.id === l.payment_id) : null; };
  const jobWho = (j) => D.contractors.find((c) => c.id === j.contractor_id)?.name || j.contractor_name || null;
  const jobDate = (j) => (j.start_on ? dstr(j.start_on) : j.date_note || 'Date to set');
  const sortJobs = (list) => [...list].sort((a, b) => String(b.start_on || '9999').localeCompare(String(a.start_on || '9999')) || b.ref.localeCompare(a.ref));
  const nextRef = (prefix, list) => prefix + String(list.reduce((m, x) => Math.max(m, parseInt(String(x.ref).replace(/\D/g, ''), 10) || 0), 0) + 1).padStart(3, '0');

  PAGES.jobs = (root, arg) => {
    const cid = arg && arg.startsWith('c-') ? arg.slice(2) : null;
    const none = arg === 'none';
    const contractor = cid ? D.contractors.find((c) => c.id === cid) : null;
    if (cid && !contractor) { location.hash = '#jobs'; return; }
    const list = sortJobs(D.jobs.filter((j) => (cid ? j.contractor_id === cid : none ? !j.contractor_id : true)));
    if (contractor) setHead(contractor.name, 'Contractor · jobs and payments', ['All contractors', '#jobs']);
    else if (none) setHead('Contractor not entered', 'Jobs still missing a contractor', ['All contractors', '#jobs']);
    else setHead('Jobs', 'Work by contractors, and paying them');

    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => jobForm(null, { contractor: contractor?.name }) }, '+ New job'));

    if (!cid && !none) {
      const groups = D.contractors.map((c) => ({ name: c.name, href: '#jobs-c-' + c.id, jobs: D.jobs.filter((j) => j.contractor_id === c.id) }));
      const unassigned = D.jobs.filter((j) => !j.contractor_id);
      if (unassigned.length) groups.push({ name: 'Contractor not entered', href: '#jobs-none', jobs: unassigned, muted: true });
      const sum = (js) => ({ open: js.filter((j) => OPEN.includes(j.status)).length, toPay: js.filter((j) => j.status === 'To pay').reduce((s, j) => s + Number(j.price || 0), 0), paid: js.filter((j) => j.status === 'Paid').reduce((s, j) => s + Number(j.price || 0), 0) });
      const tot = sum(D.jobs);
      root.append(sec('Summary by contractor', xpBtn(SPEC.contractors, 'Summary by contractor')));
      root.append(h('div', { class: 'card table' },
        h('div', { class: 'srow ghead' }, h('span', {}, 'Contractor'), h('span', { class: 'num' }, 'Open'), h('span', { class: 'num' }, 'Done, to pay'), h('span', { class: 'num' }, 'Paid')),
        groups.length ? groups.map((g) => { const x = sum(g.jobs); return h('a', { class: 'srow', href: g.href }, h('span', { class: g.muted ? 'lk muted-l' : 'lk' }, g.name), h('span', { class: 'num' }, x.open || '—'), h('span', { class: 'num red-t' }, x.toPay ? rm(x.toPay) : '—'), h('span', { class: 'num green-t' }, x.paid ? rm(x.paid) : '—')); }) : h('p', { class: 'muted' }, 'No contractors yet.'),
        h('div', { class: 'srow total' }, h('span', {}, 'Total'), h('span', { class: 'num' }, tot.open), h('span', { class: 'num red-t' }, rm(tot.toPay)), h('span', { class: 'num green-t' }, rm(tot.paid)))));
      if (tot.toPay > 0) root.append(h('p', { class: 'muted small foot' }, 'To pay a contractor, tap their name above, tick the jobs, then tap Pay.'));
    }

    if (contractor) {
      const js = D.jobs.filter((j) => j.contractor_id === cid);
      root.append(h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('small', {}, 'Open'), h('div', { class: 'h' }, js.filter((j) => OPEN.includes(j.status)).length)),
        h('div', { class: 'tile' }, h('small', {}, 'Done, to pay'), h('div', { class: 'h' }, rm(js.filter((j) => j.status === 'To pay').reduce((s, j) => s + Number(j.price || 0), 0)))),
        h('div', { class: 'tile' }, h('small', {}, 'Paid'), h('div', { class: 'h' }, rm(js.filter((j) => j.status === 'Paid').reduce((s, j) => s + Number(j.price || 0), 0))))));
      root.append(h('div', { class: 'card kvs' }, kv('Phone', contractor.phone), kv('SSM / IC', contractor.ssm_or_ic), kv('Bank', contractor.bank_name), kv('Account number', contractor.account_no), kv('Usual rates', contractor.usual_rates, true), contractor.address ? kv('Address', contractor.address, true) : null,
        h('div', { class: 'kv wide' }, h('button', { class: 'btn small-btn', type: 'button', onclick: () => contractorForm(contractor) }, 'Edit contractor details'))));
      const unused = !js.length && !D.pays.some((p) => p.contractor_id === cid);
      if (D.isAdmin && unused) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${contractor.name}?`, [{ type: 'note', label: 'This contractor has no jobs or payments, so it can be removed from your list.' }], async () => {
        const { error } = await sb.from('contractors').delete().eq('id', cid);
        if (error) throw error;
        location.hash = '#jobs';
        await refresh('Contractor deleted');
      }, 'Delete contractor', true) }, 'Delete this contractor'));
      else if (D.isAdmin) root.append(h('p', { class: 'muted small foot' }, 'A contractor with jobs or payments cannot be deleted, so the records stay complete.'));
    }
    if (none) root.append(h('div', { class: 'card note' }, h('p', {}, 'These jobs came from the planter\'s records. Open each one and tap ', h('strong', {}, 'Edit / complete this record'), ' to add the contractor and the price.')));

    // jobs list, with tick boxes when one contractor is shown
    const sel = new Set();
    const payable = (j) => contractor && j.status === 'To pay' && j.price != null && !jobPay(j);
    const payBtn = h('button', { class: 'btn primary pay-btn', type: 'button', disabled: true, onclick: () => payForm(list.filter((j) => sel.has(j.id))) }, 'Tick jobs to pay');
    const drawPay = () => { const t = list.filter((j) => sel.has(j.id)).reduce((s, j) => s + Number(j.price || 0), 0); payBtn.disabled = !sel.size; payBtn.textContent = sel.size ? `Pay ${contractor.name} · ${sel.size} job${sel.size > 1 ? 's' : ''} · ${rm(t)}` : 'Tick jobs to pay'; };
    root.append(sec(cid || none ? 'Jobs' : 'All jobs', xpBtn(() => SPEC.jobs(list, contractor ? `Jobs · ${contractor.name}` : none ? 'Jobs without a contractor' : 'All jobs'), contractor ? `Jobs ${contractor.name}` : 'Jobs')));
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'jrow ghead' + (contractor ? ' sel' : '') }, contractor ? h('span', {}, '') : null, h('span', {}, 'Date'), h('span', {}, 'Job'), h('span', { class: 'num' }, CUR()), h('span', {}, 'Status')),
      list.length ? list.map((j) => {
        const pv = jobPay(j);
        const box = payable(j) ? h('input', { type: 'checkbox', 'aria-label': 'Select ' + j.ref, onchange: (e) => { if (e.target.checked) sel.add(j.id); else sel.delete(j.id); drawPay(); } }) : null;
        return h('div', { class: 'jrow' + (contractor ? ' sel' : '') }, contractor ? h('span', { class: 'cb' }, box) : null,
          h('span', { class: 'd' }, j.start_on ? dstr(j.start_on).replace(/ \d{4}$/, '') : '—', j.start_on ? h('small', {}, j.start_on.slice(0, 4)) : null),
          h('span', {}, h('a', { href: '#job-' + j.ref }, jobName(j)), h('small', {}, `${j.ref} · ${jobPlots(j)}${!contractor ? ' · ' + (jobWho(j) || 'contractor to enter') : ''}`)),
          h('span', { class: 'num' }, j.price != null ? Number(j.price).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'),
          h('span', {}, pill(statusLabel(j), statusKind(j.status)), pv ? h('a', { class: 'pv', href: '#pay-' + pv.ref }, pv.ref) : null));
      }) : h('p', { class: 'muted' }, 'No jobs yet.')));
    if (contractor && list.some(payable)) root.append(h('div', { class: 'pay-bar' }, payBtn));

    const pays = D.pays.filter((p) => (cid ? p.contractor_id === cid : !none)).sort((a, b) => b.ref.localeCompare(a.ref));
    if (!none) {
      root.append(sec('Payments to contractors', xpBtn(() => SPEC.payments(pays, contractor ? `Payments to ${contractor.name}` : undefined), 'Contractor payments')));
      root.append(card(pays.length ? pays.map((p) => linkRow('#pay-' + p.ref, `${p.ref} · ${rm(p.amount)}`, `${p.contractor_name || ''} · ${dstr(p.paid_on)} · ${p.method} · ${p.paid_by}`, pill('Paid', 'green'))) : h('p', { class: 'muted' }, 'No payments yet.')));
    }
  };

  // ---------- one job ----------
  PAGES.job = (root, ref) => {
    const j = D.jobs.find((x) => x.ref === ref);
    if (!j) { location.hash = '#jobs'; return; }
    const pv = jobPay(j);
    const who = jobWho(j);
    setHead(`${j.ref} · ${jobName(j)}`, statusLabel(j), ['Jobs', '#jobs']);
    root.append(h('div', { class: 'card kvs' },
      kv('Peringkat', jobBatches(j).length ? h('span', { class: 'chips' }, jobBatches(j).map((b) => h('a', { class: 'chip', href: '#p-' + b.no }, 'P' + b.no))) : 'None', true),
      kv('Contractor', who ? (j.contractor_id ? h('a', { href: '#jobs-c-' + j.contractor_id }, who) : who) : 'Not entered yet'),
      kv('Date', jobDate(j)),
      kv('Agreed price', j.price != null ? rm(j.price) : 'Not entered yet'),
      kv('Status', statusLabel(j)),
      kv('Products used', j.products), kv('Method', j.method),
      kv('Payment', pv ? h('a', { href: '#pay-' + pv.ref }, `${pv.ref} · ${dstr(pv.paid_on)}`) : j.status === 'To pay' ? 'Not paid yet' : '—', true),
      j.note ? kv('Notes', j.note, true) : null));

    const step = { Planned: ['Mark as started', 'In progress'], Quoted: ['Mark as started', 'In progress'], 'In progress': ['Mark as done', 'Done'] }[j.status];
    if (step) root.append(h('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
      busy(e.currentTarget, true, 'Saving…');
      const st = step[1] === 'Done' && j.price != null ? 'To pay' : step[1];
      const btn = e.currentTarget;
      try { await commit([{ op: 'update', table: 'jobs', values: { status: st, start_on: j.start_on || (st === 'In progress' ? today() : null) }, eq: { id: j.id } }], step[1] === 'Done' && j.price == null ? 'Marked done. Enter the price so it can be paid.' : 'Saved', { label: `${j.ref} ${step[0].toLowerCase()}` }); }
      catch (ex) { toast(friendly(ex)); busy(btn, false, step[0]); }
    } }, step[0]));
    if (j.status === 'To pay' && j.contractor_id) root.append(h('a', { class: 'btn primary', href: '#jobs-c-' + j.contractor_id }, `Pay ${who}`));
    if (j.status !== 'Paid') root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => jobForm(j) }, 'Edit / complete this record'));
    else root.append(h('p', { class: 'muted small foot' }, 'This job is paid, so its price and contractor are locked. The admin partner can cancel the payment if it was a mistake.'));

    root.append(attachBox('job', j.id));

    if (D.isAdmin && j.status !== 'Paid') root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${j.ref}?`, [{ type: 'note', label: `${jobName(j)} · ${jobDate(j)} will be removed with its photos. This cannot be undone.` }], async () => {
      const paths = D.atts.filter((a) => a.entity === 'job' && a.entity_id === j.id).map((a) => a.storage_path);
      if (paths.length) await sb.storage.from('files').remove(paths);
      await sb.from('attachments').delete().eq('entity', 'job').eq('entity_id', j.id);
      const { error } = await sb.from('jobs').delete().eq('id', j.id);
      if (error) throw error;
      location.hash = '#jobs';
      await refresh('Job deleted');
    }, 'Delete job', true) }, 'Delete this job'));
  };

  // ---------- job form ----------
  function jobForm(j, preset = {}) {
    const upah = D.cats.filter((c) => c.grp === 'Upah').map((c) => c.name);
    const cats = j && !upah.includes(j.category) ? [j.category, ...upah] : upah;
    const isNew = !j;
    const curBatches = j ? jobBatches(j).map((b) => b.id) : (preset.batches || []);
    const status0 = j ? (j.status === 'To pay' ? 'Done' : j.status) : 'Planned';
    openSheet(isNew ? 'Record a job' : `Edit ${j.ref}`, [
      { key: 'batches', label: 'Peringkat (tick all that the job covers)', type: 'chips', value: curBatches, options: [...D.batches].sort((x, y) => x.no - y.no).map((b) => [b.id, 'P' + b.no]) },
      { key: 'category', label: 'Job', type: 'select', value: j?.category || preset.category || 'Upah Sembur Baja', options: cats.map((c) => [c, c]) },
      { key: 'other_note', label: 'Specify the work', required: true, value: j?.other_note, ph: 'e.g. Potong rumput tepi parit, angkut baja', showIf: (v) => v.category === 'Upah Lain-lain' },
      { key: 'products', label: 'Products used', value: j?.products, ph: 'e.g. Urea + kapur; Malathion' },
      { key: 'method', label: 'Method', type: 'select', value: j?.method || '', options: [['', '—'], ['Sembur', 'Sembur (spray)'], ['Tabur', 'Tabur (broadcast)'], ['Manual', 'Manual'], ['Machine', 'Machine']] },
      { key: 'contractor', label: 'Contractor', value: j ? jobWho(j) : preset.contractor, ph: 'Pick or type a new name', list: D.contractors.map((c) => c.name), note: 'A new name is added to your contractors list.' },
      { key: 'start_on', label: 'Date (started, or planned)', type: 'date', value: j?.start_on },
      { key: 'date_note', label: 'Rough date, if no exact date', value: j?.date_note, ph: 'e.g. Week of 1 Dec 2026', showIf: (v) => !v.start_on },
      { key: 'status', label: 'Status', type: 'select', value: status0, options: [['Planned', 'Planned'], ['Quoted', 'Quoted (price agreed, not started)'], ['In progress', 'In progress'], ['Done', 'Done']] },
      { key: 'price', label: 'Agreed price (RM)', type: 'number', mode: 'decimal', value: j?.price, ph: 'e.g. 1800', note: 'When a job is done and has a price, it becomes "To pay".' },
      { key: 'note', label: 'Notes', type: 'textarea', value: j?.note, ph: 'e.g. paid in cash before using the app' }
    ], async (v) => {
      const P = D.plantation.id, ops = [];
      let contractor_id = null, contractor_name = null;
      if (v.contractor) {
        const found = D.contractors.find((c) => c.name.trim().toLowerCase() === v.contractor.toLowerCase());
        if (found) { contractor_id = found.id; contractor_name = found.name; }
        else { contractor_id = uuid(); contractor_name = v.contractor; ops.push({ op: 'insert', table: 'contractors', rows: [{ id: contractor_id, plantation_id: P, name: v.contractor }] }); }
      }
      const status = v.status === 'Done' && v.price != null ? 'To pay' : v.status;
      const row = { category: v.category, other_note: v.category === 'Upah Lain-lain' ? v.other_note : null, products: v.products, method: v.method,
        contractor_id, contractor_name, start_on: v.start_on, date_note: v.start_on ? null : v.date_note, status, price: v.price, note: v.note };
      let id = j?.id, ref = j?.ref;
      if (isNew) { id = uuid(); ref = nextRef('J-', D.jobs); ops.push({ op: 'insert', table: 'jobs', rows: [{ ...row, id, plantation_id: P, ref, created_by: D.me.id }], refPrefix: 'J-' }); }
      else ops.push({ op: 'update', table: 'jobs', values: row, eq: { id } });
      const want = new Set(v.batches || []);
      const have = new Set(D.jb.filter((x) => x.job_id === id).map((x) => x.batch_id));
      const add = [...want].filter((x) => !have.has(x)).map((x) => ({ job_id: id, batch_id: x, plantation_id: P }));
      const del = [...have].filter((x) => !want.has(x));
      if (add.length) ops.push({ op: 'insert', table: 'job_batches', rows: add });
      if (del.length) ops.push({ op: 'delete', table: 'job_batches', eq: { job_id: id }, in: ['batch_id', del] });
      await commit(ops, isNew ? `${ref} saved` : 'Saved', { label: isNew ? `New job ${ref}` : `Edit ${ref}` });
      if (isNew) location.hash = '#job-' + (D.jobs.find((x) => x.id === id)?.ref || ref);
    }, isNew ? 'Save job' : 'Save changes', false, true);
  }

  function contractorForm(c) {
    openSheet(`Edit ${c.name}`, [
      { key: 'name', label: 'Name', required: true, value: c.name },
      { key: 'phone', label: 'Phone', type: 'tel', mode: 'tel', value: c.phone },
      { key: 'ssm_or_ic', label: 'SSM or IC number', value: c.ssm_or_ic },
      { key: 'bank_name', label: 'Bank', value: c.bank_name, ph: 'e.g. Maybank' },
      { key: 'account_no', label: 'Account number', value: c.account_no, mode: 'numeric' },
      { key: 'usual_rates', label: 'Usual rates', value: c.usual_rates, ph: 'e.g. Sembur RM 250 per acre' },
      { key: 'address', label: 'Address', type: 'textarea', value: c.address }
    ], async (v) => {
      const { error } = await sb.from('contractors').update(v).eq('id', c.id);
      if (error) throw error;
      await sb.from('jobs').update({ contractor_name: v.name }).eq('contractor_id', c.id).neq('status', 'Paid');
      await refresh('Contractor saved');
    });
  }

  // ---------- paying a contractor ----------
  function payForm(jobs) {
    if (!jobs.length) return;
    const who = jobWho(jobs[0]);
    const total = jobs.reduce((s, j) => s + Number(j.price || 0), 0);
    const items = h('div', { class: 'pay-items' }, jobs.map((j) => h('div', { class: 'pi' }, h('span', {}, `${j.ref} · ${jobName(j)} · ${jobPlots(j)}`), h('b', {}, rm(j.price)))),
      h('div', { class: 'pi total' }, h('span', {}, 'Total to pay'), h('b', {}, rm(total))));
    const partners = D.members.filter((m) => m.active).map((m) => [m.display_name, m.display_name]);
    openSheet(`Pay ${who}`, [
      { type: 'info', node: items },
      { key: 'paid_by', label: 'Paid by', type: 'select', value: 'From the pool', options: [['From the pool', 'From the pool (plantation account)'], ...partners.map((p) => [p[0], p[1] + ' (own money, to claim back)'])] },
      { key: 'method', label: 'Method', type: 'select', value: 'Bank transfer', options: [['Bank transfer', 'Bank transfer'], ['DuitNow', 'DuitNow'], ['Cash', 'Cash'], ['Cheque', 'Cheque']] },
      { key: 'paid_on', label: 'Paid on', type: 'date', value: today(), required: true },
      { key: 'note', label: 'Note (optional)', value: '', ph: 'e.g. transfer ref 123456' },
      { type: 'note', label: 'After saving, you can attach the transfer slip or the contractor\'s invoice on the payment page.' }
    ], async (v) => {
      const { data, error } = await sb.rpc('record_contractor_payment', { p_job_ids: jobs.map((j) => j.id), p_paid_by: v.paid_by, p_method: v.method, p_paid_on: v.paid_on, p_note: v.note });
      if (error) throw error;
      await refresh('Payment recorded');
      const p = D.pays.find((x) => x.id === data);
      if (p) location.hash = '#pay-' + p.ref;
    }, 'Record payment');
  }

  PAGES.pay = (root, ref) => {
    const p = D.pays.find((x) => x.ref === ref);
    if (!p) { location.hash = '#jobs'; return; }
    const jobs = D.pj.filter((x) => x.payment_id === p.id).map((x) => D.jobs.find((j) => j.id === x.job_id)).filter(Boolean);
    setHead(`Payment ${p.ref}`, `${p.contractor_name || ''} · ${rm(p.amount)}`, ['Jobs', p.contractor_id ? '#jobs-c-' + p.contractor_id : '#jobs']);
    root.append(h('div', { class: 'card kvs' },
      kv('Paid to', p.contractor_id ? h('a', { href: '#jobs-c-' + p.contractor_id }, p.contractor_name) : p.contractor_name),
      kv('Amount', rm(p.amount)), kv('Paid on', dstr(p.paid_on)), kv('Method', p.method), kv('Paid by', p.paid_by, true),
      p.note ? kv('Note', p.note, true) : null));
    root.append(sec('Jobs in this payment', xpBtn(() => { const sp = SPEC.jobs(jobs, `Payment ${p.ref} · ${p.contractor_name || ''}`); sp.sub = `Paid ${dstr(p.paid_on)} · ${p.method} · ${p.paid_by}${p.note ? ' · ' + p.note : ''}`; return sp; }, `Payment ${p.ref}`)));
    root.append(card(jobs.map((j) => linkRow('#job-' + j.ref, `${j.ref} · ${jobName(j)}`, `${jobPlots(j)} · ${jobDate(j)}`, rm(j.price))),
      h('div', { class: 'trow total-row' }, h('span', { class: 'lmain' }, h('b', {}, 'Total')), h('span', { class: 'lright' }, rm(p.amount)))));
    root.append(attachBox('payment', p.id, 'Transfer slip & invoice'));
    if (D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Cancel ${p.ref}?`, [{ type: 'note', label: `Use this only if the payment was recorded by mistake. The ${jobs.length} job${jobs.length > 1 ? 's' : ''} go back to "To pay".` }], async () => {
      const { error } = await sb.rpc('cancel_contractor_payment', { p_payment: p.id });
      if (error) throw error;
      location.hash = p.contractor_id ? '#jobs-c-' + p.contractor_id : '#jobs';
      await refresh('Payment cancelled');
    }, 'Cancel payment', true) }, 'Cancel this payment'));
  };

  // ---------- photos and receipts ----------
  const urlCache = new Map();
  function attachBox(entity, id, title = 'Photos & receipts') {
    const box = h('div', { class: 'card' });
    const draw = () => {
      const list = D.atts.filter((a) => a.entity === entity && a.entity_id === id);
      const grid = h('div', { class: 'thumbs' }, list.map((a) => {
        const isPdf = /\.pdf$/i.test(a.storage_path);
        const link = h('a', { class: 'thumb' + (isPdf ? ' doc' : ''), target: '_blank', rel: 'noopener', href: urlCache.get(a.storage_path) || '#', 'aria-label': `${a.kind}, open` },
          isPdf ? h('span', {}, 'PDF') : h('img', { alt: a.kind, loading: 'lazy', src: urlCache.get(a.storage_path) || null }), h('small', {}, a.kind));
        const canDel = D.isAdmin || a.created_by === D.me.id;
        return h('div', { class: 'thumb-wrap' }, link, canDel ? h('button', { class: 'thumb-x', type: 'button', 'aria-label': 'Remove', onclick: async () => {
          if (!window.confirm('Remove this ' + a.kind.toLowerCase() + '?')) return;
          await sb.storage.from('files').remove([a.storage_path]);
          const { error } = await sb.from('attachments').delete().eq('id', a.id);
          if (error) return toast(friendly(error));
          D.atts = D.atts.filter((x) => x.id !== a.id); draw();
        } }, '×') : null);
      }));
      const status = h('small', { class: 'muted' });
      const picker = (label, kind, accept) => {
        const inp = h('input', { type: 'file', accept, multiple: true, class: 'vh', onchange: async (e) => {
          const files = [...e.target.files]; e.target.value = '';
          for (const [n, f] of files.entries()) {
            status.textContent = `Uploading ${n + 1} of ${files.length}…`;
            try { await upload(entity, id, kind, f); } catch (ex) { toast(friendly(ex)); }
          }
          status.textContent = '';
          draw();
        } });
        return h('label', { class: 'btn ghost up' }, inp, label);
      };
      box.replaceChildren(sec(`${title} (${list.length})`), list.length ? grid : h('p', { class: 'muted small' }, 'None yet.'),
        h('div', { class: 'up-row' }, picker('+ Photo', 'Photo', 'image/*'), picker('+ Receipt / invoice', 'Receipt', 'image/*,application/pdf')), status,
        h('small', { class: 'muted' }, 'Pick from the camera, your photos or files (WhatsApp images included).'));
      signUrls(list).then((changed) => { if (changed) draw(); });
    };
    draw();
    return box;
  }
  async function signUrls(list) {
    const need = list.map((a) => a.storage_path).filter((p) => !urlCache.has(p));
    if (!need.length) return false;
    const { data, error } = await sb.storage.from('files').createSignedUrls(need, 3600);
    if (error || !data) return false;
    for (const d of data) if (d.signedUrl) urlCache.set(d.path, d.signedUrl);
    return true;
  }
  async function reloadAtts() {
    const { data } = await sb.from('attachments').select('*').eq('plantation_id', D.plantation.id).order('created_at');
    if (data) D.atts = data;
  }
  async function upload(entity, id, kind, file) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    let blob = file, ext = isPdf ? 'pdf' : (file.name.split('.').pop() || 'jpg').toLowerCase(), type = file.type || (isPdf ? 'application/pdf' : 'image/jpeg');
    if (!isPdf) {
      const max = { Small: 1280, Medium: 2048 }[D.settings.photo_size || 'Small'];
      try { if (max || !/jpe?g|png|webp/.test(type)) { blob = await shrink(file, max || 4096); ext = 'jpg'; type = 'image/jpeg'; } } catch (_) { /* keep the original file */ }
    }
    if (blob.size > 10 * 1024 * 1024) throw new Error('This file is over 10 MB. Please pick a smaller one.');
    const path = `${D.plantation.id}/${entity}/${id}/${uuid()}.${ext}`;
    urlCache.set(path, URL.createObjectURL(blob));
    await commit([{ op: 'upload', path, blob, type },
      { op: 'insert', table: 'attachments', rows: [{ id: uuid(), plantation_id: D.plantation.id, entity, entity_id: id, kind, storage_path: path, bytes: blob.size, created_by: D.me.id }] }],
      null, { reload: false, label: `${kind} on ${entity}` });
  }
  async function shrink(file, max) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the photo'))), 'image/jpeg', 0.82));
  }

  // ================= SALES: HARVEST PICKS AND MONEY FROM BUYERS (Stage 3) =================
  const money2 = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pickFruit = (k) => Number(k.grade_a || 0) + Number(k.grade_b || 0) + Number(k.grade_c || 0);
  const pickAmt = (k) => Number(k.grade_a || 0) * Number(k.price_a || 0) + Number(k.grade_b || 0) * Number(k.price_b || 0) + Number(k.grade_c || 0) * Number(k.price_c || 0);
  const pickBatches = (k) => D.pkb.filter((x) => x.pick_id === k.id).map((x) => D.batches.find((b) => b.id === x.batch_id)).filter(Boolean).sort((a, b) => a.no - b.no);
  const pickPlots = (k) => { const bs = pickBatches(k); return bs.length ? bs.map((b) => 'P' + b.no).join(', ') : 'No peringkat'; };
  const pickRc = (k) => { const l = D.rp.find((x) => x.pick_id === k.id); return l ? D.rcs.find((r) => r.id === l.receipt_id) : null; };
  const pickWho = (k) => D.buyers.find((b) => b.id === k.buyer_id)?.name || k.buyer_name || null;
  const sortPicks = (list) => [...list].sort((a, b) => String(b.picked_on).localeCompare(String(a.picked_on)) || b.ref.localeCompare(a.ref));

  PAGES.sales = (root, arg) => {
    const bid = arg && arg.startsWith('b-') ? arg.slice(2) : null;
    const buyer = bid ? D.buyers.find((b) => b.id === bid) : null;
    if (bid && !buyer) { location.hash = '#sales'; return; }
    const list = sortPicks(D.picks.filter((k) => (bid ? k.buyer_id === bid : true)));
    if (buyer) setHead(buyer.name, 'Buyer · harvest picks and payments', ['All buyers', '#sales']);
    else setHead('Sales', 'Harvest picks and money from buyers');
    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => pickForm(null, { buyer: buyer?.name }) }, '+ Record a harvest pick'));

    const sumOf = (ks) => ({ fruit: ks.reduce((s, k) => s + pickFruit(k), 0), sold: ks.reduce((s, k) => s + pickAmt(k), 0), owes: ks.filter((k) => !pickRc(k)).reduce((s, k) => s + pickAmt(k), 0), recv: ks.filter((k) => pickRc(k)).reduce((s, k) => s + pickAmt(k), 0) });
    const tot = sumOf(list);
    if (!buyer) {
      root.append(h('div', { class: 'card sales-top' },
        D.picks.length ? [h('small', { class: 'muted' }, `${D.picks.length} pick${D.picks.length > 1 ? 's' : ''} recorded`), h('div', { class: 'h big' }, `${fmt(tot.fruit)} fruit picked`), h('div', {}, `Sold ${rm(tot.sold)} · buyers owe ${rm(tot.owes)}`)]
          : [h('div', { class: 'h big' }, 'No harvest yet'), h('small', { class: 'muted' }, 'Record each pick here: fruit by grade, the price per fruit that day, and who bought it.')]));
      if (D.buyers.length || D.picks.length) {
        root.append(sec('Summary by buyer', xpBtn(SPEC.buyers, 'Summary by buyer')));
        const rows = D.buyers.map((b) => ({ name: b.name, href: '#sales-b-' + b.id, x: sumOf(D.picks.filter((k) => k.buyer_id === b.id)) }));
        root.append(h('div', { class: 'card table' },
          h('div', { class: 'srow ghead' }, h('span', {}, 'Buyer'), h('span', { class: 'num' }, 'Fruit'), h('span', { class: 'num' }, 'Buyer owes'), h('span', { class: 'num' }, 'Received')),
          rows.map((r) => h('a', { class: 'srow', href: r.href }, h('span', { class: 'lk' }, r.name), h('span', { class: 'num' }, r.x.fruit ? fmt(r.x.fruit) : '—'), h('span', { class: 'num red-t' }, r.x.owes ? rm(r.x.owes) : '—'), h('span', { class: 'num green-t' }, r.x.recv ? rm(r.x.recv) : '—'))),
          h('div', { class: 'srow total' }, h('span', {}, 'Total'), h('span', { class: 'num' }, fmt(tot.fruit)), h('span', { class: 'num red-t' }, rm(tot.owes)), h('span', { class: 'num green-t' }, rm(tot.recv)))));
        if (tot.owes > 0) root.append(h('p', { class: 'muted small foot' }, 'When a buyer pays, tap their name above, tick the picks, then tap Record payment.'));
      }
    } else {
      root.append(h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('small', {}, 'Sold'), h('div', { class: 'h' }, rm(tot.sold))),
        h('div', { class: 'tile' }, h('small', {}, 'Buyer owes'), h('div', { class: 'h' }, rm(tot.owes))),
        h('div', { class: 'tile' }, h('small', {}, 'Received'), h('div', { class: 'h' }, rm(tot.recv)))));
      root.append(h('div', { class: 'card kvs' }, kv('Phone', buyer.phone), kv('Payment terms', buyer.payment_terms), kv('Grades bought', buyer.grades_bought, true), buyer.address ? kv('Address', buyer.address, true) : null,
        h('div', { class: 'kv wide' }, h('button', { class: 'btn small-btn', type: 'button', onclick: () => buyerForm(buyer) }, 'Edit buyer details'))));
      const unused = !list.length && !D.rcs.some((r) => r.buyer_id === bid);
      if (D.isAdmin && unused) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${buyer.name}?`, [{ type: 'note', label: 'This buyer has no picks or payments, so it can be removed from your list.' }], async () => {
        const { error } = await sb.from('buyers').delete().eq('id', bid); if (error) throw error;
        location.hash = '#sales'; await refresh('Buyer deleted');
      }, 'Delete buyer', true) }, 'Delete this buyer'));
    }

    const sel = new Set();
    const payable = (k) => buyer && !pickRc(k) && pickAmt(k) > 0;
    const recvBtn = h('button', { class: 'btn primary pay-btn', type: 'button', disabled: true, onclick: () => receiptForm(list.filter((k) => sel.has(k.id))) }, 'Tick picks paid');
    const drawRecv = () => { const t = list.filter((k) => sel.has(k.id)).reduce((s, k) => s + pickAmt(k), 0); recvBtn.disabled = !sel.size; recvBtn.textContent = sel.size ? `Record payment from ${buyer.name} · ${rm(t)}` : 'Tick picks paid'; };
    root.append(sec('Harvest picks', xpBtn(() => SPEC.picks(list, buyer ? `Harvest picks · ${buyer.name}` : undefined), 'Harvest picks')));
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'jrow ghead' + (buyer ? ' sel' : '') }, buyer ? h('span', {}, '') : null, h('span', {}, 'Date'), h('span', {}, 'Pick'), h('span', { class: 'num' }, CUR()), h('span', {}, 'Status')),
      list.length ? list.map((k) => {
        const rc = pickRc(k);
        const box = payable(k) ? h('input', { type: 'checkbox', 'aria-label': 'Select ' + k.ref, onchange: (e) => { if (e.target.checked) sel.add(k.id); else sel.delete(k.id); drawRecv(); } }) : null;
        return h('div', { class: 'jrow' + (buyer ? ' sel' : '') }, buyer ? h('span', { class: 'cb' }, box) : null,
          h('span', { class: 'd' }, dstr(k.picked_on).replace(/ \d{4}$/, ''), h('small', {}, String(k.picked_on).slice(0, 4))),
          h('span', {}, h('a', { href: '#pick-' + k.ref }, `${k.ref} · ${fmt(pickFruit(k))} fruit`), h('small', {}, `${pickPlots(k)}${!buyer ? ' · ' + (pickWho(k) || 'buyer to enter') : ''}`)),
          h('span', { class: 'num' }, money2(pickAmt(k))),
          h('span', {}, rc ? pill('Received', 'green') : pill('Buyer owes', 'amber'), rc ? h('a', { class: 'pv', href: '#rc-' + rc.ref }, rc.ref) : null));
      }) : h('p', { class: 'muted' }, 'No harvest picks yet.')));
    if (buyer && list.some(payable)) root.append(h('div', { class: 'pay-bar' }, recvBtn));

    const rcs = D.rcs.filter((r) => (bid ? r.buyer_id === bid : true)).sort((a, b) => b.ref.localeCompare(a.ref));
    root.append(sec('Payments received', xpBtn(() => SPEC.receipts(rcs, buyer ? `Payments from ${buyer.name}` : undefined), 'Buyer payments')));
    root.append(card(rcs.length ? rcs.map((r) => linkRow('#rc-' + r.ref, `${r.ref} · ${rm(r.amount)}`, `${r.buyer_name || ''} · ${dstr(r.received_on)} · ${r.method} · ${r.received_by}`, pill('Received', 'green'))) : h('p', { class: 'muted' }, 'No payments received yet.')));
  };

  // ---------- one harvest pick ----------
  PAGES.pick = (root, ref) => {
    const k = D.picks.find((x) => x.ref === ref);
    if (!k) { location.hash = '#sales'; return; }
    const rc = pickRc(k);
    const who = pickWho(k);
    setHead(`${k.ref} · ${fmt(pickFruit(k))} fruit`, `${dstr(k.picked_on)} · ${rc ? 'Received' : 'Buyer owes'}`, ['Sales', '#sales']);
    const g = (name, n, pr) => (n ? [h('span', {}, name), h('span', { class: 'r' }, fmt(n)), h('span', { class: 'r' }, money2(pr)), h('span', { class: 'r' }, money2(n * pr))] : []);
    root.append(h('div', { class: 'card' }, h('div', { class: 'grades' },
      h('span', { class: 'gh' }, 'Grade'), h('span', { class: 'gh r' }, 'Fruit'), h('span', { class: 'gh r' }, T(`${CUR()} each`) === `${CUR()} each` ? `${CUR()} ${LANG === 'ms' ? 'sebiji' : 'each'}` : T(`${CUR()} each`)), h('span', { class: 'gh r' }, CUR()),
      g('Grade A', Number(k.grade_a), Number(k.price_a)), g('Grade B', Number(k.grade_b), Number(k.price_b)), g('Grade C', Number(k.grade_c), Number(k.price_c)),
      h('span', { class: 't' }, 'Total'), h('span', { class: 't r' }, fmt(pickFruit(k))), h('span', { class: 't' }), h('span', { class: 't r' }, rm(pickAmt(k))))));
    root.append(h('div', { class: 'card kvs' },
      kv('Peringkat', pickBatches(k).length ? h('span', { class: 'chips' }, pickBatches(k).map((b) => h('a', { class: 'chip', href: '#p-' + b.no }, 'P' + b.no))) : 'None', true),
      kv('Buyer', who ? (k.buyer_id ? h('a', { href: '#sales-b-' + k.buyer_id }, who) : who) : 'Not entered yet'),
      kv('Picked on', dstr(k.picked_on)),
      kv('Payment', rc ? h('a', { href: '#rc-' + rc.ref }, `${rc.ref} · ${dstr(rc.received_on)}`) : 'Buyer owes', true),
      k.note ? kv('Notes', k.note, true) : null));
    if (!rc && k.buyer_id) root.append(h('a', { class: 'btn primary', href: '#sales-b-' + k.buyer_id }, `Record payment from ${who}`));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => pickForm(k) }, rc ? 'Edit notes or peringkat' : 'Edit this pick'));
    if (rc) root.append(h('p', { class: 'muted small foot' }, 'This pick is paid, so its fruit, prices and buyer are locked. The admin partner can cancel the payment if it was a mistake.'));
    root.append(attachBox('pick', k.id, 'Weighing slip & invoice'));
    if (D.isAdmin && !rc) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${k.ref}?`, [{ type: 'note', label: `${fmt(pickFruit(k))} fruit picked ${dstr(k.picked_on)} will be removed with its photos. This cannot be undone.` }], async () => {
      const paths = D.atts.filter((a) => a.entity === 'pick' && a.entity_id === k.id).map((a) => a.storage_path);
      if (paths.length) await sb.storage.from('files').remove(paths);
      await sb.from('attachments').delete().eq('entity', 'pick').eq('entity_id', k.id);
      const { error } = await sb.from('harvest_picks').delete().eq('id', k.id);
      if (error) throw error;
      location.hash = '#sales'; await refresh('Pick deleted');
    }, 'Delete pick', true) }, 'Delete this pick'));
  };

  // ---------- harvest pick form ----------
  function pickForm(k, preset = {}) {
    const isNew = !k;
    const locked = !!(k && pickRc(k));
    const last = sortPicks(D.picks)[0] || {};
    const val = (f) => (k ? (Number(k[f]) || '') : '');
    const priceVal = (f) => (k ? k[f] : last[f] ?? '');
    const num = (x) => { const n = Number(String(x ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; };
    const fields = [
      { key: 'batches', label: 'Peringkat picked (tick all)', type: 'chips', required: true, value: k ? pickBatches(k).map((b) => b.id) : (preset.batches || []), options: [...D.batches].sort((x, y) => x.no - y.no).map((b) => [b.id, 'P' + b.no]) },
      { key: 'picked_on', label: 'Date picked', type: 'date', required: true, value: k?.picked_on || today() }
    ];
    if (!locked) fields.push(
      { key: 'buyer', label: 'Sold to', value: k ? pickWho(k) : preset.buyer, ph: 'e.g. wholesaler, FAMA, market stall', list: D.buyers.map((b) => b.name), note: 'A new name is added to your buyers list.' },
      { type: 'head', label: 'Fruit by grade, and the price per fruit today' },
      { key: 'grade_a', label: 'Grade A fruit', type: 'number', mode: 'numeric', value: val('grade_a'), ph: '0', half: true },
      { key: 'price_a', label: 'Grade A RM each', type: 'number', mode: 'decimal', value: priceVal('price_a'), ph: '0.00', half: true },
      { key: 'grade_b', label: 'Grade B fruit', type: 'number', mode: 'numeric', value: val('grade_b'), ph: '0', half: true },
      { key: 'price_b', label: 'Grade B RM each', type: 'number', mode: 'decimal', value: priceVal('price_b'), ph: '0.00', half: true },
      { key: 'grade_c', label: 'Grade C fruit', type: 'number', mode: 'numeric', value: val('grade_c'), ph: '0', half: true },
      { key: 'price_c', label: 'Grade C RM each', type: 'number', mode: 'decimal', value: priceVal('price_c'), ph: '0.00', half: true },
      { type: 'info', render: (r) => { const f = num(r.grade_a) + num(r.grade_b) + num(r.grade_c); const t = num(r.grade_a) * num(r.price_a) + num(r.grade_b) * num(r.price_b) + num(r.grade_c) * num(r.price_c); return h('div', { class: 'live-total' }, h('span', {}, `${fmt(f)} fruit`, h('small', {}, isNew && last.ref ? `Prices filled in from ${last.ref}; change them if today's differ.` : '')), h('span', {}, rm(t))); } });
    fields.push({ key: 'note', label: 'Notes', type: 'textarea', value: k?.note, ph: 'e.g. weighed 1,250 kg; lorry from FAMA' });
    openSheet(isNew ? 'Record a harvest pick' : `Edit ${k.ref}`, fields, async (v) => {
      const P = D.plantation.id, ops = [];
      const row = { picked_on: v.picked_on, note: v.note };
      if (!locked) {
        for (const g of ['grade_a', 'grade_b', 'grade_c']) { row[g] = Math.round(v[g] || 0); if (v[g] && !Number.isInteger(v[g])) throw new Error('Fruit counts must be whole numbers.'); }
        for (const g of ['price_a', 'price_b', 'price_c']) row[g] = v[g] || 0;
        if (!(row.grade_a + row.grade_b + row.grade_c)) throw new Error('Enter the number of fruit for at least one grade.');
        if (['a', 'b', 'c'].some((x) => row['grade_' + x] > 0 && !row['price_' + x])) throw new Error('Enter the price for each grade that has fruit.');
        row.buyer_id = null; row.buyer_name = null;
        if (v.buyer) {
          const found = D.buyers.find((b) => b.name.trim().toLowerCase() === v.buyer.toLowerCase());
          if (found) { row.buyer_id = found.id; row.buyer_name = found.name; }
          else { row.buyer_id = uuid(); row.buyer_name = v.buyer; ops.push({ op: 'insert', table: 'buyers', rows: [{ id: row.buyer_id, plantation_id: P, name: v.buyer }] }); }
        }
      }
      let id = k?.id, ref = k?.ref;
      if (isNew) { id = uuid(); ref = nextRef('HP-', D.picks); ops.push({ op: 'insert', table: 'harvest_picks', rows: [{ ...row, id, plantation_id: P, ref, created_by: D.me.id }], refPrefix: 'HP-' }); }
      else ops.push({ op: 'update', table: 'harvest_picks', values: row, eq: { id } });
      const want = new Set(v.batches || []);
      const have = new Set(D.pkb.filter((x) => x.pick_id === id).map((x) => x.batch_id));
      const add = [...want].filter((x) => !have.has(x)).map((x) => ({ pick_id: id, batch_id: x, plantation_id: P }));
      const del = [...have].filter((x) => !want.has(x));
      if (add.length) ops.push({ op: 'insert', table: 'pick_batches', rows: add });
      if (del.length) ops.push({ op: 'delete', table: 'pick_batches', eq: { pick_id: id }, in: ['batch_id', del] });
      await commit(ops, isNew ? `${ref} saved` : 'Saved', { label: isNew ? `New harvest pick ${ref}` : `Edit ${ref}` });
      if (isNew) location.hash = '#pick-' + (D.picks.find((x) => x.id === id)?.ref || ref);
    }, isNew ? 'Save pick' : 'Save changes', false, true);
  }

  function buyerForm(b) {
    openSheet(`Edit ${b.name}`, [
      { key: 'name', label: 'Name', required: true, value: b.name },
      { key: 'phone', label: 'Phone', type: 'tel', mode: 'tel', value: b.phone },
      { key: 'payment_terms', label: 'Payment terms', value: b.payment_terms, ph: 'e.g. cash on the spot, or within 7 days' },
      { key: 'grades_bought', label: 'Grades they buy', value: b.grades_bought, ph: 'e.g. A and B only' },
      { key: 'address', label: 'Address', type: 'textarea', value: b.address }
    ], async (v) => {
      const { error } = await sb.from('buyers').update(v).eq('id', b.id);
      if (error) throw error;
      await sb.from('harvest_picks').update({ buyer_name: v.name }).eq('buyer_id', b.id);
      await refresh('Buyer saved');
    });
  }

  // ---------- money received from a buyer ----------
  function receiptForm(picks) {
    if (!picks.length) return;
    const who = pickWho(picks[0]);
    const total = picks.reduce((s, k) => s + pickAmt(k), 0);
    const items = h('div', { class: 'pay-items' }, picks.map((k) => h('div', { class: 'pi' }, h('span', {}, `${k.ref} · ${dstr(k.picked_on)} · ${fmt(pickFruit(k))} fruit`), h('b', {}, rm(pickAmt(k))))),
      h('div', { class: 'pi total' }, h('span', {}, 'Total received'), h('b', {}, rm(total))));
    const partners = D.members.filter((m) => m.active).map((m) => m.display_name);
    openSheet(`Payment from ${who}`, [
      { type: 'info', node: items },
      { key: 'received_by', label: 'Money went to', type: 'select', value: 'Into the pool', options: [['Into the pool', 'Into the pool (plantation account)'], ...partners.map((p) => [p, p + ' (holding it for the pool)'])] },
      { key: 'method', label: 'Method', type: 'select', value: 'Bank transfer', options: [['Bank transfer', 'Bank transfer'], ['DuitNow', 'DuitNow'], ['Cash', 'Cash'], ['Cheque', 'Cheque']] },
      { key: 'received_on', label: 'Received on', type: 'date', value: today(), required: true },
      { key: 'note', label: 'Note (optional)', value: '', ph: 'e.g. transfer ref 123456' },
      { type: 'note', label: 'After saving, you can attach the bank slip or the buyer\'s payment advice on the payment page.' }
    ], async (v) => {
      const { data, error } = await sb.rpc('record_buyer_receipt', { p_pick_ids: picks.map((k) => k.id), p_received_by: v.received_by, p_method: v.method, p_received_on: v.received_on, p_note: v.note });
      if (error) throw error;
      await refresh('Payment recorded');
      const r = D.rcs.find((x) => x.id === data);
      if (r) location.hash = '#rc-' + r.ref;
    }, 'Record payment');
  }

  PAGES.rc = (root, ref) => {
    const r = D.rcs.find((x) => x.ref === ref);
    if (!r) { location.hash = '#sales'; return; }
    const picks = D.rp.filter((x) => x.receipt_id === r.id).map((x) => D.picks.find((k) => k.id === x.pick_id)).filter(Boolean);
    setHead(`Payment ${r.ref}`, `${r.buyer_name || ''} · ${rm(r.amount)}`, ['Sales', r.buyer_id ? '#sales-b-' + r.buyer_id : '#sales']);
    root.append(h('div', { class: 'card kvs' },
      kv('From', r.buyer_id ? h('a', { href: '#sales-b-' + r.buyer_id }, r.buyer_name) : r.buyer_name),
      kv('Amount', rm(r.amount)), kv('Received on', dstr(r.received_on)), kv('Method', r.method), kv('Money went to', r.received_by, true),
      r.note ? kv('Note', r.note, true) : null));
    root.append(sec('Picks in this payment', xpBtn(() => { const sp = SPEC.picks(picks, `Payment ${r.ref} · ${r.buyer_name || ''}`); sp.sub = `Received ${dstr(r.received_on)} · ${r.method} · ${r.received_by}${r.note ? ' · ' + r.note : ''}`; return sp; }, `Payment ${r.ref}`)));
    root.append(card(picks.map((k) => linkRow('#pick-' + k.ref, `${k.ref} · ${fmt(pickFruit(k))} fruit`, `${pickPlots(k)} · ${dstr(k.picked_on)}`, rm(pickAmt(k)))),
      h('div', { class: 'trow total-row' }, h('span', { class: 'lmain' }, h('b', {}, 'Total')), h('span', { class: 'lright' }, rm(r.amount)))));
    root.append(attachBox('receipt', r.id, 'Bank slip & payment advice'));
    if (D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Cancel ${r.ref}?`, [{ type: 'note', label: `Use this only if the payment was recorded by mistake. The ${picks.length} pick${picks.length > 1 ? 's' : ''} go back to "Buyer owes".` }], async () => {
      const { error } = await sb.rpc('cancel_buyer_receipt', { p_receipt: r.id });
      if (error) throw error;
      location.hash = r.buyer_id ? '#sales-b-' + r.buyer_id : '#sales';
      await refresh('Payment cancelled');
    }, 'Cancel payment', true) }, 'Cancel this payment'));
  };

  // ================= EXPENSE AND CLAIMS (Stage 4) =================
  const EXP_TYPES = [['Transport', 'Transport (petrol, toll, parking)'], ['Meals', 'Meals'], ['Miscellaneous', 'Miscellaneous']];
  const exClaim = (e) => { const l = D.ce.find((x) => x.expense_id === e.id); return l ? D.claims.find((c) => c.id === l.claim_id) : null; };
  const exStatus = (e) => { if (e.paid_from_pool) return ['From the pool', 'green']; const c = exClaim(e); return !c ? ['Not claimed', 'gold'] : c.status === 'Paid' ? ['Paid', 'green'] : ['Claimed, unpaid', 'amber']; };
  const exWho = (e) => (e.paid_from_pool ? 'From the pool' : D.members.find((m) => m.id === e.member_id)?.display_name || 'Partner');
  const exHasReceipt = (e) => D.atts.some((a) => a.entity === 'expense' && a.entity_id === e.id);
  const memberName = (id) => D.members.find((m) => m.id === id)?.display_name || '—';
  const sortEx = (list) => [...list].sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)) || b.ref.localeCompare(a.ref));
  const canPayClaim = (c) => c.status === 'Claimed' && c.member_id !== D.me.id;

  PAGES.exp = (root, arg) => {
    const mid = arg && arg.startsWith('m-') ? arg.slice(2) : null;
    const pool = arg === 'pool';
    const member = mid ? D.members.find((m) => m.id === mid) : null;
    if (mid && !member) { location.hash = '#exp'; return; }
    const list = sortEx(D.expenses.filter((e) => (mid ? e.member_id === mid && !e.paid_from_pool : pool ? e.paid_from_pool : true)));
    if (member) setHead(member.display_name, (member.id === D.me.id ? 'You · ' : '') + 'expenses and claims', ['All partners', '#exp']);
    else if (pool) setHead('Paid from the pool', 'Small costs paid straight from the plantation account', ['All partners', '#exp']);
    else setHead('Expense', 'Partners\' own-pocket spending, and claims');
    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => expenseForm(null, { member: mid || (pool ? 'pool' : D.me.id) }) }, '+ Add expense'));

    const sumOf = (es) => ({ open: es.filter((e) => !e.paid_from_pool && !exClaim(e)).reduce((s, e) => s + Number(e.amount), 0), claimed: es.filter((e) => exClaim(e)?.status === 'Claimed').reduce((s, e) => s + Number(e.amount), 0), paid: es.filter((e) => exClaim(e)?.status === 'Paid').reduce((s, e) => s + Number(e.amount), 0) });
    const waiting = D.claims.filter(canPayClaim);
    if (waiting.length) root.append(h('a', { class: 'banner amber-b', href: '#cl-' + waiting[0].ref }, h('span', {}, h('b', {}, `${waiting.length} claim${waiting.length > 1 ? 's' : ''} waiting to be paid · ${rm(waiting.reduce((s, c) => s + Number(c.amount), 0))}`), h('small', {}, waiting.map((c) => `${c.ref} ${memberName(c.member_id)}`).join(' · '))), h('span', { class: 'chev' }, '›')));

    if (!mid && !pool) {
      const rows = D.members.filter((m) => m.active || D.expenses.some((e) => e.member_id === m.id)).map((m) => ({ name: m.display_name, href: '#exp-m-' + m.id, x: sumOf(D.expenses.filter((e) => e.member_id === m.id && !e.paid_from_pool)) }));
      const tot = sumOf(D.expenses);
      const poolTot = D.expenses.filter((e) => e.paid_from_pool).reduce((s, e) => s + Number(e.amount), 0);
      root.append(sec('Summary by partner', xpBtn(SPEC.partnersExp, 'Expense by partner')));
      root.append(h('div', { class: 'card table' },
        h('div', { class: 'srow ghead' }, h('span', {}, 'Partner'), h('span', { class: 'num' }, 'Not claimed'), h('span', { class: 'num' }, 'Claimed, unpaid'), h('span', { class: 'num' }, 'Paid')),
        rows.map((r) => h('a', { class: 'srow', href: r.href }, h('span', { class: 'lk' }, r.name), h('span', { class: 'num' }, r.x.open ? rm(r.x.open) : '—'), h('span', { class: 'num red-t' }, r.x.claimed ? rm(r.x.claimed) : '—'), h('span', { class: 'num green-t' }, r.x.paid ? rm(r.x.paid) : '—'))),
        poolTot ? h('a', { class: 'srow', href: '#exp-pool' }, h('span', { class: 'lk muted-l' }, 'From the pool'), h('span', { class: 'num' }, '—'), h('span', { class: 'num' }, '—'), h('span', { class: 'num green-t' }, rm(poolTot))) : null,
        h('div', { class: 'srow total' }, h('span', {}, 'Total'), h('span', { class: 'num' }, rm(tot.open)), h('span', { class: 'num red-t' }, rm(tot.claimed)), h('span', { class: 'num green-t' }, rm(tot.paid + poolTot)))));
      if (tot.open > 0) root.append(h('p', { class: 'muted small foot' }, 'To claim, tap your name above, tick your expenses, then tap Claim.'));
    } else if (member) {
      const x = sumOf(list);
      root.append(h('div', { class: 'tiles' },
        h('div', { class: 'tile' }, h('small', {}, 'Not claimed'), h('div', { class: 'h' }, rm(x.open))),
        h('div', { class: 'tile' }, h('small', {}, 'Claimed, unpaid'), h('div', { class: 'h' }, rm(x.claimed))),
        h('div', { class: 'tile' }, h('small', {}, 'Paid'), h('div', { class: 'h' }, rm(x.paid)))));
    }

    const canClaim = member && (member.id === D.me.id || D.isAdmin);
    const sel = new Set();
    const claimable = (e) => canClaim && !e.paid_from_pool && !exClaim(e);
    const claimBtn = h('button', { class: 'btn primary pay-btn', type: 'button', disabled: true, onclick: () => claimForm(list.filter((e) => sel.has(e.id))) }, 'Tick expenses to claim');
    const drawClaim = () => { const t = list.filter((e) => sel.has(e.id)).reduce((s, e) => s + Number(e.amount), 0); claimBtn.disabled = !sel.size; claimBtn.textContent = sel.size ? `Claim ${sel.size} expense${sel.size > 1 ? 's' : ''} · ${rm(t)}` : 'Tick expenses to claim'; };
    root.append(sec('Expenses', xpBtn(() => SPEC.expenses(list, member ? `Expenses · ${member.display_name}` : pool ? 'Expenses paid from the pool' : undefined), 'Expenses')));
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'jrow ghead' + (canClaim ? ' sel' : '') }, canClaim ? h('span', {}, '') : null, h('span', {}, 'Date'), h('span', {}, 'Expense'), h('span', { class: 'num' }, CUR()), h('span', {}, 'Status')),
      list.length ? list.map((e) => {
        const c = exClaim(e), st = exStatus(e);
        const box = claimable(e) ? h('input', { type: 'checkbox', 'aria-label': 'Select ' + e.ref, onchange: (ev) => { if (ev.target.checked) sel.add(e.id); else sel.delete(e.id); drawClaim(); } }) : null;
        return h('div', { class: 'jrow' + (canClaim ? ' sel' : '') }, canClaim ? h('span', { class: 'cb' }, box) : null,
          h('span', { class: 'd' }, dstr(e.spent_on).replace(/ \d{4}$/, ''), h('small', {}, String(e.spent_on).slice(0, 4))),
          h('span', {}, h('a', { href: '#ex-' + e.ref }, e.what || e.type), h('small', {}, `${e.ref} · ${e.type}${!member ? ' · ' + exWho(e) : ''}${exHasReceipt(e) ? ' · receipt ✓' : ''}`)),
          h('span', { class: 'num' }, money2(e.amount)),
          h('span', {}, pill(st[0], st[1]), c ? h('a', { class: 'pv', href: '#cl-' + c.ref }, c.ref) : null));
      }) : h('p', { class: 'muted' }, 'No expenses yet.')));
    if (canClaim && list.some(claimable)) root.append(h('div', { class: 'pay-bar' }, claimBtn));
    if (member && !canClaim && list.some((e) => !exClaim(e))) root.append(h('p', { class: 'muted small foot' }, `Only ${member.display_name} or the admin partner can claim these expenses.`));

    if (!pool) {
      const cls = D.claims.filter((c) => (mid ? c.member_id === mid : true)).sort((a, b) => b.ref.localeCompare(a.ref));
      root.append(sec('Claims', xpBtn(() => SPEC.claims(cls, member ? `Claims · ${member.display_name}` : undefined), 'Claims')));
      root.append(card(cls.length ? cls.map((c) => linkRow('#cl-' + c.ref, `${c.ref} · ${rm(c.amount)}`, `${memberName(c.member_id)} · claimed ${dstr(c.submitted_on)}${c.status === 'Paid' ? ` · paid ${dstr(c.paid_on)} by ${memberName(c.paid_by)}` : ''}`, pill(c.status === 'Paid' ? 'Paid' : 'Claimed, unpaid', c.status === 'Paid' ? 'green' : 'amber'))) : h('p', { class: 'muted' }, 'No claims yet.')));
    }
  };

  // ---------- one expense ----------
  PAGES.ex = (root, ref) => {
    const e = D.expenses.find((x) => x.ref === ref);
    if (!e) { location.hash = '#exp'; return; }
    const c = exClaim(e), st = exStatus(e);
    setHead(`${e.ref} · ${e.what || e.type}`, `${rm(e.amount)} · ${st[0]}`, ['Expense', e.paid_from_pool ? '#exp-pool' : '#exp-m-' + e.member_id]);
    root.append(h('div', { class: 'card kvs' },
      kv('Amount', rm(e.amount)), kv('Date', dstr(e.spent_on)), kv('Type', e.type), kv('Paid by', exWho(e)),
      kv('What for', e.what, true),
      kv('Claim', c ? h('a', { href: '#cl-' + c.ref }, `${c.ref} · ${c.status === 'Paid' ? 'paid ' + dstr(c.paid_on) : 'claimed, unpaid'}`) : e.paid_from_pool ? 'Not needed (paid from the pool)' : 'Not claimed yet', true)));
    if (!c) root.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => expenseForm(e) }, 'Edit this expense'));
    else root.append(h('p', { class: 'muted small foot' }, 'This expense is in a claim, so it is locked. Withdraw the claim first to change it.'));
    root.append(attachBox('expense', e.id, 'Receipt'));
    if (!c && (D.isAdmin)) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${e.ref}?`, [{ type: 'note', label: `${e.what || e.type} · ${rm(e.amount)} will be removed with its receipt. This cannot be undone.` }], async () => {
      const paths = D.atts.filter((a) => a.entity === 'expense' && a.entity_id === e.id).map((a) => a.storage_path);
      if (paths.length) await sb.storage.from('files').remove(paths);
      await sb.from('attachments').delete().eq('entity', 'expense').eq('entity_id', e.id);
      const { error } = await sb.from('expenses').delete().eq('id', e.id);
      if (error) throw error;
      location.hash = '#exp'; await refresh('Expense deleted');
    }, 'Delete expense', true) }, 'Delete this expense'));
  };

  function expenseForm(e, preset = {}) {
    const isNew = !e;
    const who0 = e ? (e.paid_from_pool ? 'pool' : e.member_id) : (preset.member || D.me.id);
    const people = D.members.filter((m) => m.active || m.id === who0).map((m) => [m.id, m.display_name + (m.id === D.me.id ? ' (me)' : '')]);
    openSheet(isNew ? 'Add an expense' : `Edit ${e.ref}`, [
      { key: 'type', label: 'Type', type: 'select', value: e?.type || 'Transport', options: EXP_TYPES },
      { key: 'what', label: 'What for', required: true, value: e?.what, ph: 'e.g. Petrol & toll to farm' },
      { key: 'who', label: 'Paid by', type: 'select', value: who0, options: [...people, ['pool', 'From the pool (plantation account)']], half: true },
      { key: 'amount', label: 'Amount (RM)', type: 'number', mode: 'decimal', required: true, value: e?.amount, ph: '0.00', half: true },
      { key: 'spent_on', label: 'Date', type: 'date', required: true, value: e?.spent_on || today() },
      { type: 'note', label: isNew ? 'After saving, add a photo of the receipt on the next page.' : 'Keep the receipt photo on this expense; it goes with the claim.' }
    ], async (v) => {
      if (!(v.amount > 0)) throw new Error('Amount must be more than ' + rm(0) + '.');
      const row = { type: v.type, what: v.what, amount: Math.round(v.amount * 100) / 100, spent_on: v.spent_on, paid_from_pool: v.who === 'pool', member_id: v.who === 'pool' ? null : v.who };
      let ref = e?.ref; const id = e?.id || uuid();
      const op = isNew ? { op: 'insert', table: 'expenses', rows: [{ ...row, id, plantation_id: D.plantation.id, ref: (ref = nextRef('EX-', D.expenses)) }], refPrefix: 'EX-' } : { op: 'update', table: 'expenses', values: row, eq: { id } };
      await commit([op], isNew ? `${ref} saved` : 'Saved', { label: isNew ? `New expense ${ref}` : `Edit ${ref}` });
      if (isNew) location.hash = '#ex-' + (D.expenses.find((x) => x.id === id)?.ref || ref);
    }, isNew ? 'Save expense' : 'Save changes', false, true);
  }

  // ---------- claims ----------
  function claimForm(exps) {
    if (!exps.length) return;
    const mid = exps[0].member_id;
    const total = exps.reduce((s, e) => s + Number(e.amount), 0);
    const pv = D.priv[mid];
    const noReceipt = exps.filter((e) => !exHasReceipt(e)).length;
    openSheet(`Claim · ${memberName(mid)}`, [
      { type: 'info', node: h('div', { class: 'pay-items' }, exps.map((e) => h('div', { class: 'pi' }, h('span', {}, `${dstr(e.spent_on)} · ${e.what || e.type}`), h('b', {}, rm(e.amount)))),
        h('div', { class: 'pi total' }, h('span', {}, `Total to claim (${exps.length} item${exps.length > 1 ? 's' : ''})`), h('b', {}, rm(total)))) },
      { type: 'info', node: h('div', { class: 'kv' }, h('div', { class: 'k' }, 'Pay to'), h('div', { class: 'v' }, pv && pv.account_no ? `${pv.bank_name || 'Bank'} · ${mask(pv.account_no)}` : 'No bank details yet (add them on the Partners page)')) },
      { key: 'note', label: 'Note to partners (optional)', value: '', ph: 'e.g. November trips to the farm' },
      { type: 'note', label: noReceipt ? `${noReceipt === exps.length ? (exps.length > 1 ? 'None of these expenses has a' : 'This expense has no') : noReceipt + ' of these ' + exps.length + ' expenses ' + (noReceipt > 1 ? 'have' : 'has') + ' no'} receipt photo yet. You can still claim, and add the photo on the expense later.` : 'The receipts attached to each expense go with the claim. Another partner marks it paid.' }
    ], async (v) => {
      const { data, error } = await sb.rpc('create_claim', { p_expense_ids: exps.map((e) => e.id), p_note: v.note });
      if (error) throw error;
      await refresh('Claim submitted');
      const c = D.claims.find((x) => x.id === data);
      if (c) location.hash = '#cl-' + c.ref;
    }, 'Submit claim');
  }

  PAGES.cl = (root, ref) => {
    const c = D.claims.find((x) => x.ref === ref);
    if (!c) { location.hash = '#exp'; return; }
    const exps = D.ce.filter((x) => x.claim_id === c.id).map((x) => D.expenses.find((e) => e.id === x.expense_id)).filter(Boolean);
    const paid = c.status === 'Paid';
    const mine = c.member_id === D.me.id;
    const pv = D.priv[c.member_id];
    setHead(`Claim ${c.ref}`, `${memberName(c.member_id)} · ${rm(c.amount)} · ${paid ? 'Paid' : 'Claimed, unpaid'}`, ['Expense', '#exp-m-' + c.member_id]);
    root.append(h('div', { class: 'card kvs' },
      kv('Claimed by', memberName(c.member_id)), kv('Amount', rm(c.amount)), kv('Submitted', dstr(c.submitted_on)), kv('Status', paid ? 'Paid' : 'Claimed, unpaid'),
      paid ? kv('Paid on', dstr(c.paid_on)) : null, paid ? kv('Paid by', memberName(c.paid_by)) : null,
      pv && pv.account_no ? kv('Pay to', `${pv.bank_name || 'Bank'} · ${pv.account_holder || ''} · ${pv.account_no}`, true) : null,
      c.note ? kv('Note', c.note, true) : null));
    root.append(sec('Expenses in this claim', xpBtn(() => SPEC.claimOne(c), `Claim ${c.ref}`)));
    root.append(card(exps.map((e) => linkRow('#ex-' + e.ref, e.what || e.type, `${dstr(e.spent_on)} · ${e.type}${exHasReceipt(e) ? ' · receipt ✓' : ' · no receipt yet'}`, rm(e.amount))),
      h('div', { class: 'trow total-row' }, h('span', { class: 'lmain' }, h('b', {}, 'Total')), h('span', { class: 'lright' }, rm(c.amount)))));
    if (!paid && !mine) root.append(h('button', { class: 'btn primary', type: 'button', onclick: () => openSheet(`Mark ${c.ref} paid`, [
      { type: 'info', node: h('div', { class: 'pay-items' }, h('div', { class: 'pi total' }, h('span', {}, `Pay ${memberName(c.member_id)}`), h('b', {}, rm(c.amount)))) },
      { key: 'paid_on', label: 'Paid on', type: 'date', required: true, value: today() },
      { key: 'note', label: 'Note (optional)', value: c.note, ph: 'e.g. transfer ref 123456' },
      { type: 'note', label: 'You are recorded as the partner who paid this claim. Add the transfer slip on the claim page.' }
    ], async (v) => {
      const { error } = await sb.from('claims').update({ status: 'Paid', paid_on: v.paid_on, note: v.note }).eq('id', c.id);
      if (error) throw error;
      await refresh('Claim marked paid');
    }, 'Mark paid') }, `Mark paid · ${rm(c.amount)}`));
    if (!paid && mine) root.append(h('p', { class: 'muted small foot' }, 'Another partner marks your claim paid when they transfer the money to you.'));
    root.append(attachBox('claim', c.id, 'Transfer slip'));
    if (!paid && (mine || D.isAdmin)) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Withdraw ${c.ref}?`, [{ type: 'note', label: 'The claim is removed and its expenses become "Not claimed" again, so they can be changed or claimed again.' }], async () => {
      const { error } = await sb.rpc('withdraw_claim', { p_claim: c.id });
      if (error) throw error;
      location.hash = '#exp-m-' + c.member_id; await refresh('Claim withdrawn');
    }, 'Withdraw claim', true) }, 'Withdraw this claim'));
    if (paid && D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Mark ${c.ref} unpaid?`, [{ type: 'note', label: 'Use this only if the claim was marked paid by mistake.' }], async () => {
      const { error } = await sb.rpc('reopen_claim', { p_claim: c.id });
      if (error) throw error;
      await refresh('Claim is unpaid again');
    }, 'Mark unpaid', true) }, 'Mark as not paid'));
  };

  // ================= FINANCE (Stage 5) =================
  const jobCost = (j) => (DONE.includes(j.status) && j.price != null ? Number(j.price) : 0);
  function money() {
    const pool = D.members.filter((m) => m.active).reduce((s, m) => s + Number(m.capital || 0), 0);
    const by = {};
    const add = (k, v) => { if (v) by[k] = (by[k] || 0) + v; };
    for (const p of D.purchases) add(p.category, Number(p.amount || 0));
    for (const j of D.jobs) add(j.category, jobCost(j));
    for (const e of D.expenses) add('Perbelanjaan Rakan Kongsi', Number(e.amount || 0));
    const spent = Object.values(by).reduce((s, v) => s + v, 0);
    const sales = D.picks.reduce((s, k) => s + pickAmt(k), 0);
    const received = D.rcs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const paidOut = D.pays.reduce((s, p) => s + Number(p.amount || 0), 0) + D.purchases.reduce((s, p) => s + Number(p.amount || 0), 0)
      + D.claims.filter((c) => c.status === 'Paid').reduce((s, c) => s + Number(c.amount || 0), 0) + D.expenses.filter((e) => e.paid_from_pool).reduce((s, e) => s + Number(e.amount || 0), 0);
    const owedOut = D.jobs.filter((j) => j.status === 'To pay').reduce((s, j) => s + Number(j.price || 0), 0) + D.claims.filter((c) => c.status === 'Claimed').reduce((s, c) => s + Number(c.amount || 0), 0);
    return { pool, by, spent, sales, profit: sales - spent, received, paidOut, cash: pool + received - paidOut, owedOut, unpriced: D.purchases.filter((p) => p.amount == null).length + D.jobs.filter((j) => DONE.includes(j.status) && j.price == null).length };
  }

  // Money at a glance: four bars around a zero line
  function glance(M) {
    const rows = [
      ['Pooled', M.pool, '#2A6FB0', M.pool ? `Capital the partners put in: ${rm(M.pool)}.` : 'Capital not entered yet: add each partner\'s capital in ☰ Partners.'],
      ['Spent', M.spent, '#D9930F', M.spent ? `${rm(M.spent)} spent so far${M.pool ? ', ' + Math.round(M.spent / M.pool * 100) + '% of the pool' : ''}.${M.unpriced ? ` ${M.unpriced} item${M.unpriced > 1 ? 's' : ''} still need a price.` : ''}` : `No costs entered yet.${M.unpriced ? ` ${M.unpriced} purchases and jobs are waiting for their price.` : ''}`],
      ['Sales', M.sales, '#1E8A5A', M.sales ? `${rm(M.sales)} in sales so far.` : 'No harvest sold yet.'],
      [M.profit < 0 ? 'Loss so far' : 'Profit so far', M.profit, M.profit < 0 ? '#C2410C' : '#1E8A5A', M.profit < 0 ? `Sales minus spending. A loss is normal before the first harvest; break-even needs ${rm(-M.profit)} more in sales.` : M.spent || M.sales ? 'Sales minus spending.' : 'Shows once costs and sales are entered.']
    ];
    const max = Math.max(1, ...rows.map((r) => Math.abs(r[1])));
    const minNeg = Math.min(0, ...rows.map((r) => r[1]));
    const neg = minNeg < 0;
    const zero = neg ? Math.min(40, Math.max(12, -minNeg / (max - minNeg) * 100)) : 0;
    const span = 100 - zero;
    const note = h('div', { class: 'g-note' }, rows[3][3]);
    const box = h('div', { class: 'card glance' }, h('div', { class: 'sec in' }, h('div', { class: 'h' }, 'Money at a glance'), h('small', { class: 'muted' }, 'Tap a bar')));
    const bars = h('div', { class: 'g-bars' });
    rows.forEach((r, i) => {
      const v = r[1];
      const w = v >= 0 ? (v / max) * span : Math.min(zero, (-v / -minNeg) * zero);
      const left = v >= 0 ? zero : zero - w;
      const b = h('button', { type: 'button', class: 'g-row' + (i === 3 ? ' on' : ''), 'aria-label': `${r[0]} ${rm(v)}`, onclick: (e) => { bars.querySelectorAll('.g-row').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); note.textContent = r[3]; } },
        h('span', { class: 'g-top' }, h('span', {}, r[0]), h('b', {}, (v < 0 ? '−' : '') + rm(Math.abs(v)))),
        h('span', { class: 'g-track' }, neg ? h('span', { class: 'g-zero', style: `left:${zero}%` }) : null, h('span', { class: 'g-bar', style: `left:${left}%;width:${Math.max(v ? 1.5 : 0, w)}%;background:${r[2]}` })));
      bars.append(b);
    });
    box.append(bars, h('div', { class: 'g-scale' }, h('span', {}, neg ? '← loss' : ''), h('span', {}, neg ? 'line = ' + CUR() + ' 0' : ''), h('span', {}, `${CUR()} ${fmt(Math.round(max))} →`)), note);
    return box;
  }

  PAGES.finance = (root) => {
    setHead('Finance', `${D.plantation.name} · capital, costs and sales`);
    const M = money();
    root.append(h('div', { class: 'pool-card' },
      h('small', {}, 'Capital pool'), h('div', { class: 'h' }, M.pool ? rm(M.pool) : 'Not entered yet'),
      h('div', {}, `Costs so far ${rm(M.spent)} · Sales ${rm(M.sales)}`),
      h('div', {}, M.profit < 0 ? `Loss so far ${rm(-M.profit)}` : `Profit so far ${rm(M.profit)}`),
      M.pool ? h('small', {}, `Cash left in the pool, about ${rm(M.cash)}${M.owedOut ? ` (still to pay out ${rm(M.owedOut)})` : ''}`) : h('small', {}, 'Add each partner\'s capital in ☰ Partners to see the pool and shares.')));
    const g = D.grants[0];
    if (g) root.append(h('a', { class: 'banner', href: '#agencies' }, h('span', {}, h('b', {}, `Grants received: ${g.quantity || g.title}`), h('small', {}, `${g.ref} · ${g.title}${g.conditions ? ' · conditions: ' + g.conditions : ''}`)), h('span', { class: 'chev' }, '›')));

    const act = D.members.filter((m) => m.active);
    root.append(sec('Partners and profit shares', xpBtn(SPEC.finance, 'Capital and shares')));
    root.append(card(act.map((m) => {
      const share = M.pool ? Number(m.capital || 0) / M.pool : 0;
      return h('a', { class: 'trow', href: '#partner-' + m.id }, h('span', { class: 'avatar' }, initials(m.display_name)),
        h('span', { class: 'lmain' }, h('b', {}, m.display_name), h('small', {}, `${rm(m.capital)} paid in${M.pool && M.profit ? ` · ${M.profit < 0 ? 'share of loss' : 'share of profit'} ${rm(Math.abs(M.profit) * share)}` : ''}`)),
        h('span', { class: 'lright h share' }, M.pool ? (share * 100).toFixed(1) + '%' : '—'));
    })));
    root.append(h('p', { class: 'muted small foot' }, 'Profit is shared by capital paid in, after all costs. Landowners get rent only.'));

    root.append(h('button', { class: 'btn gold', type: 'button', onclick: () => purchaseForm(null) }, '+ Record a purchase or payment'));
    root.append(sec('Purchases', xpBtn(SPEC.purchases, 'Purchases')));
    const list = [...D.purchases].sort((a, b) => String(b.purchased_on || '').localeCompare(String(a.purchased_on || '')) || b.ref.localeCompare(a.ref));
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'mrow p ghead' }, h('span', {}, 'Category · item · from'), h('span', { class: 'num' }, CUR()), h('span', {}, 'For')),
      list.length ? list.map((p) => h('div', { class: 'mrow p' },
        h('span', {}, h('a', { href: '#buy-' + p.ref }, `${p.category}${p.item ? ' · ' + p.item : ''}`), h('small', {}, `${p.ref} · ${p.supplier || '—'} · ${p.purchased_on ? dstr(p.purchased_on) : p.date_note || 'date to set'}`)),
        h('span', { class: 'num' }, p.amount != null ? money2(p.amount) : h('a', { class: 'pill amber', href: '#buy-' + p.ref }, 'Enter price')),
        h('span', { class: 'small-t' }, p.for_batches || '—'))) : h('p', { class: 'muted' }, 'No purchases yet.')));
    if (list.some((p) => p.amount == null)) root.append(h('p', { class: 'muted small foot' }, '"Enter price" = planting material from the planter\'s records, waiting for its price. Tap it to add the price.'));

    root.append(sec('Where the money went', xpBtn(SPEC.spend, 'Where the money went')));
    const cats = Object.entries(M.by).sort((a, b) => b[1] - a[1]);
    root.append(card(cats.length ? cats.map(([k, v]) => h('div', { class: 'spend' }, h('div', { class: 'spend-top' }, h('span', {}, k), h('b', {}, rm(v))), h('div', { class: 'spend-track' }, h('div', { class: 'spend-bar', style: `width:${Math.max(1, v / M.spent * 100)}%` }))))
      : h('p', { class: 'muted' }, 'No costs entered yet. Enter prices on the purchases above and costs on each job.')));
    if (!M.sales) root.append(h('div', { class: 'card note' }, h('p', {}, 'No sales yet. Harvest sales show here as soon as picks are recorded in Sales.')));
  };

  PAGES.buy = (root, ref) => {
    const p = D.purchases.find((x) => x.ref === ref);
    if (!p) { location.hash = '#finance'; return; }
    setHead(`${p.ref} · ${p.category}`, p.amount != null ? rm(p.amount) : 'Price to enter', ['Finance', '#finance']);
    const mr = p.material_receipt_id ? D.receipts.find((r) => r.id === p.material_receipt_id) : null;
    root.append(h('div', { class: 'card kvs' },
      kv('Item', p.item, true), kv('Supplier', p.supplier), kv('Amount', p.amount != null ? rm(p.amount) : 'Not entered yet'),
      kv('Date', p.purchased_on ? dstr(p.purchased_on) : p.date_note), kv('Paid by', p.paid_by),
      kv('For', p.for_batches, true), p.other_note ? kv('Notes', p.other_note, true) : null,
      mr ? kv('Planting material', h('a', { href: '#agencies' }, `${mr.ref} · ${fmt(mr.qty)} ${mr.type.toLowerCase()} from ${mr.source}`), true) : null));
    root.append(h('button', { class: p.amount == null ? 'btn primary' : 'btn ghost', type: 'button', onclick: () => purchaseForm(p) }, p.amount == null ? 'Enter the price' : 'Edit this purchase'));
    root.append(attachBox('purchase', p.id, 'Receipt & invoice'));
    if (D.isAdmin) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete ${p.ref}?`, [{ type: 'note', label: `${p.category}${p.item ? ' · ' + p.item : ''} will be removed with its receipts. This cannot be undone.` }], async () => {
      const paths = D.atts.filter((a) => a.entity === 'purchase' && a.entity_id === p.id).map((a) => a.storage_path);
      if (paths.length) await sb.storage.from('files').remove(paths);
      await sb.from('attachments').delete().eq('entity', 'purchase').eq('entity_id', p.id);
      const { error } = await sb.from('purchases').delete().eq('id', p.id);
      if (error) throw error;
      location.hash = '#finance'; await refresh('Purchase deleted');
    }, 'Delete purchase', true) }, 'Delete this purchase'));
  };

  function purchaseForm(p) {
    const isNew = !p;
    const cats = D.cats.filter((c) => c.grp !== 'Upah').map((c) => c.name);
    const all = p && !cats.includes(p.category) ? [p.category, ...cats] : cats;
    const partners = D.members.filter((m) => m.active).map((m) => m.display_name);
    const payers = ['From the pool', ...partners];
    if (p && p.paid_by && !payers.includes(p.paid_by)) payers.push(p.paid_by);
    openSheet(isNew ? 'Record a purchase or payment' : `Edit ${p.ref}`, [
      { key: 'category', label: 'Category', type: 'select', value: p?.category || 'Beli Baja', options: all.map((c) => [c, c]) },
      { key: 'other_note', label: 'Specify', required: true, value: p?.other_note, ph: 'e.g. Bayar bil air', showIf: (v) => v.category === 'Lain-lain' },
      { key: 'item', label: 'Item', value: p?.item, ph: 'e.g. 20 bags Vintage 15-15-15' },
      { key: 'supplier', label: 'From (supplier or person)', value: p?.supplier, list: [...new Set(D.purchases.map((x) => x.supplier).filter(Boolean))] },
      { key: 'amount', label: 'Amount (RM)', type: 'number', mode: 'decimal', value: p?.amount, ph: '0.00', half: true, note: isNew ? null : (p.amount == null ? 'From the planter\'s records.' : null) },
      { key: 'purchased_on', label: 'Date', type: 'date', value: p?.purchased_on || (isNew ? today() : ''), half: true },
      { key: 'paid_by', label: 'Paid by', type: 'select', value: p?.paid_by || 'From the pool', options: payers.map((x) => [x, x === 'From the pool' ? 'From the pool (plantation account)' : x]) },
      { key: 'for', label: 'For peringkat (optional)', type: 'chips', value: p ? D.batches.filter((b) => (p.for_batches || '').split(/[,+\s]+/).includes('P' + b.no)).map((b) => b.id) : [], options: [...D.batches].sort((x, y) => x.no - y.no).map((b) => [b.id, 'P' + b.no]) }
    ], async (v) => {
      const chosen = [...D.batches].sort((x, y) => x.no - y.no).filter((b) => (v.for || []).includes(b.id)).map((b) => 'P' + b.no);
      const keepNote = p && p.for_batches && !chosen.length ? p.for_batches : null;
      const extra = p && p.for_batches && /sulam/i.test(p.for_batches) && chosen.length ? ' + sulam' : '';
      const row = { category: v.category, other_note: v.category === 'Lain-lain' ? v.other_note : (p?.other_note ?? null), item: v.item, supplier: v.supplier,
        amount: v.amount == null ? null : Math.round(v.amount * 100) / 100, purchased_on: v.purchased_on, paid_by: v.paid_by,
        for_batches: chosen.length ? chosen.join(', ') + extra : keepNote };
      if (v.paid_by !== 'From the pool' && isNew) row.other_note = [row.other_note, `Paid by ${v.paid_by}; claim it in Expense if needed.`].filter(Boolean).join(' ');
      let ref = p?.ref;
      if (isNew) {
        let tries = 0, res;
        do {
          ref = nextRef('PB-', D.purchases.concat(tries ? [{ ref }] : []));
          res = await sb.from('purchases').insert({ ...row, plantation_id: D.plantation.id, ref, created_by: D.me.id }).select('id').single();
          tries++;
        } while (res.error && /duplicate|unique/i.test(res.error.message) && tries < 4);
        if (res.error) throw res.error;
      } else {
        const { error } = await sb.from('purchases').update(row).eq('id', p.id);
        if (error) throw error;
      }
      await refresh(isNew ? `${ref} saved` : 'Saved');
      if (isNew) location.hash = '#buy-' + ref;
    }, isNew ? 'Save purchase' : 'Save changes');
  }

  // ================= URGENT ALERTS (Stage 5) =================
  const AL_TYPES = ['Theft or trespass', 'Animal damage (wild boar, monkeys)', 'Fire', 'Flood or drainage', 'Pest or disease outbreak', 'Injury or accident', 'Contractor problem', 'Other'];
  const alKind = (st) => ({ Open: 'red', 'Action taken': 'gold', Closed: 'green' })[st];
  const ago = (ts) => { const d = new Date(ts); const mins = Math.round((Date.now() - d) / 60000); if (mins < 60) return mins <= 1 ? T('just now') : `${mins} ${LANG === 'ms' ? 'minit lalu' : 'min ago'}`; if (mins < 1440) return `${Math.round(mins / 60)} ${LANG === 'ms' ? 'jam lalu' : 'h ago'}`; return dstr(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); };
  const alActions = (a) => D.aa.filter((x) => x.alert_id === a.id).sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));

  function alertPanel() {
    const open = D.alerts.filter((a) => a.status !== 'Closed');
    const wrap = h('div', { class: 'view-part' });
    if (open.length) {
      wrap.append(h('div', { class: 'alert-red' },
        h('div', { class: 'h ah' }, svg('<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>'), `${open.length} urgent issue${open.length > 1 ? 's' : ''} open`),
        open.map((a) => { const last = alActions(a).at(-1); return h('a', { class: 'alert-item', href: '#alert-' + a.ref },
          h('span', { class: 'ai-top' }, h('b', {}, `${a.ref} · ${a.type}`), h('span', { class: 'pill ' + alKind(a.status) }, a.status)),
          h('small', {}, `${a.location || 'Whole plantation'} · ${a.urgency} · reported by ${memberName(a.reported_by)}, ${ago(a.reported_at)}`),
          h('small', {}, last ? 'Latest: ' + last.action : a.description || '')); })));
    } else {
      wrap.append(h('div', { class: 'alert-ok' }, svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'), h('div', {}, h('div', { class: 'h' }, 'No alert'), h('small', {}, 'All clear on the plantation'))));
    }
    wrap.append(h('div', { class: 'alert-btns' },
      h('button', { class: 'btn alert-btn', type: 'button', onclick: alertForm }, svg('<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>'), 'Report urgent issue'),
      h('a', { class: 'btn ghost', href: '#alerts' }, `All alerts (${D.alerts.length})`)));
    return wrap;
  }

  function alertForm() {
    const places = ['Whole plantation', ...D.blocks.map((b) => b.name), ...[...D.batches].sort((x, y) => x.no - y.no).map((b) => b.name), 'Fence / boundary', 'Pond (kolam)', 'Road / access'];
    openSheet('Report urgent issue', [
      { type: 'note', label: 'Partners who turned on notifications get it on their phone straight away; everyone sees it at the top of Home. If it can\'t wait, also call them.' },
      { key: 'type', label: 'What kind of issue', type: 'select', value: AL_TYPES[0], options: AL_TYPES.map((t) => [t, t]) },
      { key: 'location', label: 'Where', type: 'select', value: 'Whole plantation', options: places.map((p) => [p, p]), half: true },
      { key: 'urgency', label: 'How urgent', type: 'select', value: 'High', options: [['High', 'High: act today'], ['Critical', 'Critical: act now']], half: true },
      { key: 'description', label: 'What happened', type: 'textarea', required: true, ph: 'e.g. Fence broken on east side, about 40 plants uprooted' },
      { type: 'note', label: 'After sending, add photos on the alert page.' }
    ], async (v) => {
      const id = uuid(), ref = nextRef('AL-', D.alerts);
      await commit([{ op: 'insert', table: 'alerts', rows: [{ id, plantation_id: D.plantation.id, ref, type: v.type, location: v.location, urgency: v.urgency, description: v.description, status: 'Open', reported_by: D.me.id, reported_at: new Date().toISOString() }], refPrefix: 'AL-' }], 'Alert sent', { label: `Alert ${ref}` });
      location.hash = '#alert-' + (D.alerts.find((x) => x.id === id)?.ref || ref);
    }, 'Send alert', true, true);
  }

  PAGES.alerts = (root) => {
    setHead('All alerts', 'Urgent issues, open and closed', ['Home', '#']);
    root.append(h('div', { class: 'sec' }, h('span', {}), xpBtn(SPEC.alerts, 'Alerts')));
    root.append(h('button', { class: 'btn alert-btn', type: 'button', onclick: alertForm }, svg('<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>'), 'Report urgent issue'));
    const list = [...D.alerts].sort((a, b) => (a.status === 'Closed') - (b.status === 'Closed') || String(b.reported_at).localeCompare(String(a.reported_at)));
    root.append(card(list.length ? list.map((a) => linkRow('#alert-' + a.ref, `${a.ref} · ${a.type}`, `${a.location || 'Whole plantation'} · ${a.urgency} · ${ago(a.reported_at)}`, pill(a.status, alKind(a.status)))) : h('p', { class: 'muted' }, 'No alerts yet. Good.')));
  };

  PAGES.alert = (root, ref) => {
    const a = D.alerts.find((x) => x.ref === ref);
    if (!a) { location.hash = '#alerts'; return; }
    const closed = a.status === 'Closed';
    setHead(`${a.ref} · ${a.type}`, `${a.status} · ${a.urgency}`, ['Home', '#']);
    root.append(h('div', { class: 'card kvs' },
      kv('Where', a.location || 'Whole plantation'), kv('How urgent', a.urgency === 'Critical' ? 'Critical: act now' : 'High: act today'),
      kv('Reported by', `${memberName(a.reported_by)}, ${ago(a.reported_at)}`, true),
      closed ? kv('Closed', `${memberName(a.closed_by)}, ${ago(a.closed_at)}`, true) : null,
      kv('What happened', a.description, true)));
    root.append(sec('Actions taken'));
    const acts = alActions(a);
    root.append(card(acts.length ? acts.map((x) => h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, x.action), h('small', {}, `${memberName(x.member_id)} · ${ago(x.created_at)}`)))) : h('p', { class: 'muted' }, 'No actions yet.')));
    const save = async (text, close) => {
      const upd = close ? { status: 'Closed', closed_at: new Date().toISOString(), closed_by: D.me.id } : { status: 'Action taken' };
      await commit([{ op: 'insert', table: 'alert_actions', rows: [{ id: uuid(), alert_id: a.id, plantation_id: D.plantation.id, member_id: D.me.id, action: text, created_at: new Date().toISOString() }] },
        { op: 'update', table: 'alerts', values: upd, eq: { id: a.id } }], close ? 'Alert closed' : 'Action added', { label: `${a.ref} ${close ? 'closed' : 'action'}` });
    };
    if (!closed) {
      root.append(h('div', { class: 'alert-btns' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => openSheet('Add an action', [{ key: 'action', label: 'What was done', type: 'textarea', required: true, ph: 'e.g. Fence repaired by Rosli Jentera, RM 350' }], (v) => save(v.action, false), 'Add action', false, true) }, 'Add action'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => openSheet(`Close ${a.ref}`, [{ key: 'action', label: 'Closing note', type: 'textarea', required: true, ph: 'e.g. All fixed; checked on site' }], (v) => save(v.action, true), 'Close alert', false, true) }, 'Close alert')));
    } else if (D.isAdmin) {
      root.append(h('button', { class: 'btn link', type: 'button', onclick: async () => { const { error } = await sb.from('alerts').update({ status: 'Action taken', closed_at: null, closed_by: null }).eq('id', a.id); if (error) return toast(friendly(error)); await refresh('Alert reopened'); } }, 'Reopen this alert'));
    }
    root.append(attachBox('alert', a.id, 'Photos'));
    root.append(h('div', { class: 'alert-btns' }, h('a', { class: 'btn primary', href: '#' }, 'Done · back to Home'), h('a', { class: 'btn ghost', href: '#alerts' }, 'All alerts')));
  };

  // ================= REPORTS: EXCEL AND PDF (Stage 6) =================
  // A table spec: { title, sub?, cols: [{ h, t: 'text'|'money'|'int', w? }], rows: [[...]], foot?: [...] }
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load the report tool. Check your internet connection.')); }; document.head.append(s); });
    return loaded[src];
  }
  const safe = (v) => String(v ?? '').replace(/−/g, '-').replace(/✓/g, 'yes').replace(/[←-⇿]/g, '');
  const stamp = () => { const d = new Date(); return `${dstr(today())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const fileBase = (title) => `${D.plantation.name} - ${title} - ${today()}`.replace(/[\\/:*?"<>|]+/g, '-');

  // Excel/PDF in the chosen language: titles, headings and exact words such as statuses
  const trSpec = (sp) => ({ ...sp, title: T(sp.title), sub: sp.sub ? T(sp.sub) : sp.sub, sheet: sp.sheet ? T(sp.sheet) : sp.sheet,
    cols: sp.cols.map((c) => ({ ...c, h: T(cx(c.h)) })), rows: sp.rows.map((r) => r.map((v) => (typeof v === 'string' ? T(v) : v))), foot: sp.foot ? sp.foot.map((v) => (typeof v === 'string' ? T(v) : v)) : sp.foot });
  async function makeXlsx(specs) {
    specs = specs.map(trSpec);
    await loadScript('vendor/write-excel-file.min.js');
    const sheets = specs.map((sp, i) => {
      const bold = { fontWeight: 'bold' };
      const head = [[{ value: D.plantation.name, ...bold, fontSize: 14 }], [{ value: sp.title, ...bold }], [{ value: (sp.sub ? sp.sub + ' · ' : '') + T(`Made ${stamp()} by ${D.me.display_name}`) }], []];
      const cell = (v, c) => {
        if (v == null || v === '') return null;
        if ((c.t === 'money' || c.t === 'int') && typeof v === 'number' && isFinite(v)) return { value: c.t === 'money' ? Math.round(v * 100) / 100 : v, type: Number, format: c.t === 'money' ? '#,##0.00' : '#,##0' };
        return { value: safe(v), type: String };
      };
      const data = [...head, sp.cols.map((c) => ({ value: cx(c.h), ...bold, backgroundColor: '#E8EFE9', align: c.t === 'text' ? 'left' : 'right' })),
        ...sp.rows.map((r) => r.map((v, j) => cell(v, sp.cols[j]))),
        ...(sp.foot ? [sp.foot.map((v, j) => { const c = cell(v, sp.cols[j]); return c ? { ...c, ...bold } : null; })] : [])];
      const name = (sp.sheet || sp.title).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet' + (i + 1);
      return { data, sheet: name, columns: sp.cols.map((c) => ({ width: c.w || (c.t === 'text' ? 28 : 14) })), stickyRowsCount: 5 };
    });
    return await writeXlsxFile(sheets).toBlob();
  }

  async function makePdf(specs) {
    await loadScript('vendor/jspdf.umd.min.js');
    await loadScript('vendor/jspdf.plugin.autotable.min.js');
    specs = specs.map(trSpec);
    const wide = specs.some((s) => s.cols.length > 5);
    const doc = new window.jspdf.jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const fmtCell = (v, c) => (v == null || v === '' ? '' : (c.t === 'money' && typeof v === 'number') ? money2(v) : (c.t === 'int' && typeof v === 'number') ? fmt(v) : safe(v));
    specs.forEach((sp, i) => {
      if (i) doc.addPage();
      doc.setFillColor(31, 77, 58); doc.rect(0, 0, W, 22, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(safe(`LadangKita · ${D.plantation.name}`), 12, 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(safe(T(`Made ${stamp()} by ${D.me.display_name}`)), 12, 16);
      doc.setTextColor(27, 31, 28); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(safe(sp.title), 12, 32);
      let y = 34;
      if (sp.sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(92, 99, 94); const lines = doc.splitTextToSize(safe(sp.sub), W - 24); doc.text(lines, 12, 38); y = 36 + lines.length * 4.2; }
      const align = (c) => (c.t === 'text' ? 'left' : 'right');
      doc.autoTable({
        startY: y + 3, margin: { left: 12, right: 12, bottom: 16 },
        head: [sp.cols.map((c) => ({ content: cx(c.h), styles: { halign: align(c) } }))],
        body: sp.rows.map((r) => r.map((v, j) => fmtCell(v, sp.cols[j]))),
        foot: sp.foot ? [sp.foot.map((v, j) => ({ content: fmtCell(v, sp.cols[j]), styles: { halign: align(sp.cols[j]) } }))] : undefined,
        showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: [27, 31, 28], lineColor: [228, 226, 216], lineWidth: 0.1 },
        headStyles: { fillColor: [31, 77, 58], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [238, 243, 239], textColor: [27, 31, 28], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 249, 245] },
        columnStyles: Object.fromEntries(sp.cols.map((c, j) => [j, { halign: align(c) }]))
      });
    });
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120, 126, 122); doc.text(T(`Page ${p} of ${n}`), W - 12, doc.internal.pageSize.getHeight() - 8, { align: 'right' }); }
    return doc.output('blob');
  }

  // The export sheet: choose Excel or PDF, optionally save to Reports, then save or share on the phone.
  function exportSheet(getSpecs, title) {
    const f = $('sheet');
    const keep = h('input', { type: 'checkbox', id: 'xp-keep', checked: true });
    const status = h('p', { class: 'muted small', role: 'status' });
    const go = async (kind, btn) => {
      btns.querySelectorAll('button').forEach((b) => (b.disabled = true));
      status.textContent = kind === 'pdf' ? 'Making the PDF…' : 'Making the Excel file…';
      try {
        const specs = getSpecs();
        const blob = kind === 'pdf' ? await makePdf(specs) : await makeXlsx(specs);
        const ext = kind === 'pdf' ? 'pdf' : 'xlsx';
        const type = kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const name = `${fileBase(title)}.${ext}`;
        let saved = false;
        if (keep.checked) {
          status.textContent = 'Saving to Reports…';
          const uid = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
          const path = `${D.plantation.id}/reports/${today().slice(0, 7)}/${uid}.${ext}`;
          const up = await sb.storage.from('files').upload(path, blob, { contentType: type });
          if (up.error) throw up.error;
          const { error } = await sb.from('reports').insert({ plantation_id: D.plantation.id, name, storage_path: path, bytes: blob.size, made_by: D.me.id });
          if (error) { await sb.storage.from('files').remove([path]); throw error; }
          saved = true;
          reloadReports();
        }
        readySheet(name, blob, type, saved);
      } catch (ex) {
        status.textContent = friendly(ex);
        btns.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    };
    const btns = h('div', { class: 'sheet-btns' },
      h('button', { class: 'btn primary', type: 'button', onclick: (e) => go('xlsx', e.currentTarget) }, 'Excel'),
      h('button', { class: 'btn primary', type: 'button', onclick: (e) => go('pdf', e.currentTarget) }, 'PDF'));
    f.onsubmit = (e) => e.preventDefault(); f.oninput = null; f.onchange = null;
    f.replaceChildren(h('div', { class: 'h sheet-title' }, `Export · ${title}`),
      h('p', { class: 'muted small' }, 'Excel is best for working with the numbers; PDF is best for sending or printing.'),
      h('label', { class: 'check', for: 'xp-keep' }, keep, h('span', {}, 'Also save to Reports, so all partners can open it (kept 12 months)')),
      btns, status, h('button', { class: 'btn ghost', type: 'button', onclick: closeSheet }, 'Cancel'));
    $('sheet-wrap').hidden = false; document.body.classList.add('sheet-open');
  }

  function readySheet(name, blob, type, saved) {
    const f = $('sheet');
    const file = new File([blob], name, { type });
    const url = URL.createObjectURL(blob);
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const save = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      if (canShare) { try { await navigator.share({ files: [file], title: name }); return; } catch (ex) { if (ex && ex.name === 'AbortError') return; } }
      const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    } }, canShare ? 'Save or share' : 'Download');
    f.replaceChildren(h('div', { class: 'h sheet-title' }, 'Ready'),
      h('div', { class: 'pay-items' }, h('div', { class: 'pi' }, h('span', {}, name), h('b', {}, `${Math.max(1, Math.round(blob.size / 1024))} KB`))),
      h('p', { class: 'muted small' }, (saved ? 'Saved to Reports for all partners. ' : '') + (canShare ? 'Tap Save or share to keep it on this phone (Save to Files) or send it by WhatsApp or email.' : 'Tap Download to keep a copy on this device.')),
      save, h('button', { class: 'btn ghost', type: 'button', onclick: () => { URL.revokeObjectURL(url); closeSheet(); if (location.hash === '#reports') route(); } }, 'Done'));
  }

  const xpBtn = (getSpecs, title) => h('button', { class: 'btn small-btn xp', type: 'button', onclick: () => exportSheet(() => [].concat(getSpecs()), title) }, svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'), 'Excel / PDF');

  // ---------- table specs ----------
  const SPEC = {
    keyDates: () => ({ title: 'Key dates by peringkat', sheet: 'Peringkat', cols: [{ h: 'Peringkat', t: 'text', w: 14 }, { h: 'Blok', t: 'text', w: 16 }, { h: 'Planted', t: 'text', w: 14 }, { h: 'Variety', t: 'text', w: 12 }, { h: 'Plants', t: 'int' }, { h: 'Age (months)', t: 'int' }, { h: 'Est. area (ac)', t: 'money' }, { h: 'Last work', t: 'text', w: 14 }, { h: 'Next work', t: 'text', w: 26 }],
      rows: D.batches.map((b) => { const i = batchInfo(b); return [b.name, i.blockNames.join(' + '), dstr(b.planted_on), b.variety || '', b.plants, i.age, i.area != null ? Number(i.area) : null, i.lastWork ? dstr(i.lastWork.start_on) : '', i.next ? `${i.next.category} ${i.next.start_on ? dstr(i.next.start_on) : i.next.date_note || ''}` : '']; }),
      foot: ['Total', '', '', '', D.batches.reduce((s, b) => s + b.plants, 0), null, D.batches.reduce((s, b) => s + Number(b.measured_acres ?? b.est_acres ?? 0), 0), '', ''] }),
    jobs: (list, title = 'Jobs') => ({ title, sheet: 'Jobs', cols: [{ h: 'Ref', t: 'text', w: 8 }, { h: 'Date', t: 'text', w: 14 }, { h: 'Job', t: 'text', w: 26 }, { h: 'Peringkat', t: 'text', w: 16 }, { h: 'Contractor', t: 'text', w: 20 }, { h: 'Products', t: 'text', w: 24 }, { h: 'Status', t: 'text', w: 12 }, { h: 'Payment', t: 'text', w: 9 }, { h: 'RM', t: 'money' }],
      rows: list.map((j) => [j.ref, jobDate(j), jobName(j), jobPlots(j), jobWho(j) || '', j.products || '', statusLabel(j), jobPay(j)?.ref || '', j.price != null ? Number(j.price) : null]),
      foot: ['Total', '', `${list.length} jobs`, '', '', '', '', '', list.reduce((s, j) => s + Number(j.price || 0), 0)] }),
    contractors: () => { const g = D.contractors.map((c) => [c.name, D.jobs.filter((j) => j.contractor_id === c.id)]); const un = D.jobs.filter((j) => !j.contractor_id); if (un.length) g.push(['Contractor not entered', un]);
      const x = (js) => [js.filter((j) => OPEN.includes(j.status)).length, js.filter((j) => j.status === 'To pay').reduce((s, j) => s + Number(j.price || 0), 0), js.filter((j) => j.status === 'Paid').reduce((s, j) => s + Number(j.price || 0), 0)];
      return { title: 'Summary by contractor', sheet: 'Contractors', cols: [{ h: 'Contractor', t: 'text' }, { h: 'Open jobs', t: 'int' }, { h: 'Done, to pay (RM)', t: 'money', w: 18 }, { h: 'Paid (RM)', t: 'money' }], rows: g.map(([n, js]) => [n, ...x(js)]), foot: ['Total', ...x(D.jobs)] }; },
    payments: (list, title = 'Payments to contractors') => ({ title, sheet: 'Contractor payments', cols: [{ h: 'Ref', t: 'text', w: 9 }, { h: 'Paid on', t: 'text', w: 14 }, { h: 'Contractor', t: 'text', w: 22 }, { h: 'Jobs', t: 'text', w: 22 }, { h: 'Method', t: 'text', w: 14 }, { h: 'Paid by', t: 'text', w: 18 }, { h: 'RM', t: 'money' }],
      rows: list.map((p) => [p.ref, dstr(p.paid_on), p.contractor_name || '', D.pj.filter((x) => x.payment_id === p.id).map((x) => D.jobs.find((j) => j.id === x.job_id)?.ref).filter(Boolean).join(', '), p.method, p.paid_by, Number(p.amount)]),
      foot: ['Total', '', '', '', '', '', list.reduce((s, p) => s + Number(p.amount || 0), 0)] }),
    picks: (list, title = 'Harvest picks') => ({ title, sheet: 'Harvest picks', cols: [{ h: 'Ref', t: 'text', w: 9 }, { h: 'Date', t: 'text', w: 14 }, { h: 'Peringkat', t: 'text', w: 14 }, { h: 'Buyer', t: 'text', w: 20 }, { h: 'A', t: 'int', w: 8 }, { h: 'RM/A', t: 'money', w: 8 }, { h: 'B', t: 'int', w: 8 }, { h: 'RM/B', t: 'money', w: 8 }, { h: 'C', t: 'int', w: 8 }, { h: 'RM/C', t: 'money', w: 8 }, { h: 'Fruit', t: 'int', w: 9 }, { h: 'RM', t: 'money' }, { h: 'Paid', t: 'text', w: 9 }],
      rows: list.map((k) => [k.ref, dstr(k.picked_on), pickPlots(k), pickWho(k) || '', Number(k.grade_a), Number(k.price_a), Number(k.grade_b), Number(k.price_b), Number(k.grade_c), Number(k.price_c), pickFruit(k), pickAmt(k), pickRc(k)?.ref || 'owed']),
      foot: ['Total', '', '', '', list.reduce((s, k) => s + Number(k.grade_a), 0), null, list.reduce((s, k) => s + Number(k.grade_b), 0), null, list.reduce((s, k) => s + Number(k.grade_c), 0), null, list.reduce((s, k) => s + pickFruit(k), 0), list.reduce((s, k) => s + pickAmt(k), 0), ''] }),
    buyers: () => { const x = (ks) => [ks.reduce((s, k) => s + pickFruit(k), 0), ks.reduce((s, k) => s + pickAmt(k), 0), ks.filter((k) => !pickRc(k)).reduce((s, k) => s + pickAmt(k), 0), ks.filter((k) => pickRc(k)).reduce((s, k) => s + pickAmt(k), 0)];
      return { title: 'Summary by buyer', sheet: 'Buyers', cols: [{ h: 'Buyer', t: 'text' }, { h: 'Fruit', t: 'int' }, { h: 'Sold (RM)', t: 'money' }, { h: 'Buyer owes (RM)', t: 'money', w: 16 }, { h: 'Received (RM)', t: 'money' }], rows: D.buyers.map((b) => [b.name, ...x(D.picks.filter((k) => k.buyer_id === b.id))]), foot: ['Total', ...x(D.picks)] }; },
    receipts: (list, title = 'Payments received from buyers') => ({ title, sheet: 'Buyer payments', cols: [{ h: 'Ref', t: 'text', w: 9 }, { h: 'Received on', t: 'text', w: 14 }, { h: 'Buyer', t: 'text', w: 22 }, { h: 'Picks', t: 'text', w: 22 }, { h: 'Method', t: 'text', w: 14 }, { h: 'Money went to', t: 'text', w: 18 }, { h: 'RM', t: 'money' }],
      rows: list.map((r) => [r.ref, dstr(r.received_on), r.buyer_name || '', D.rp.filter((x) => x.receipt_id === r.id).map((x) => D.picks.find((k) => k.id === x.pick_id)?.ref).filter(Boolean).join(', '), r.method, r.received_by, Number(r.amount)]),
      foot: ['Total', '', '', '', '', '', list.reduce((s, r) => s + Number(r.amount || 0), 0)] }),
    expenses: (list, title = 'Expenses') => ({ title, sheet: 'Expenses', cols: [{ h: 'Ref', t: 'text', w: 9 }, { h: 'Date', t: 'text', w: 14 }, { h: 'Paid by', t: 'text', w: 18 }, { h: 'Type', t: 'text', w: 14 }, { h: 'What for', t: 'text', w: 28 }, { h: 'Receipt', t: 'text', w: 9 }, { h: 'Status', t: 'text', w: 16 }, { h: 'RM', t: 'money' }],
      rows: list.map((e) => [e.ref, dstr(e.spent_on), exWho(e), e.type, e.what || '', exHasReceipt(e) ? 'yes' : 'no', exStatus(e)[0] + (exClaim(e) ? ' ' + exClaim(e).ref : ''), Number(e.amount)]),
      foot: ['Total', '', '', '', '', '', '', list.reduce((s, e) => s + Number(e.amount || 0), 0)] }),
    partnersExp: () => { const x = (es) => [es.filter((e) => !e.paid_from_pool && !exClaim(e)).reduce((s, e) => s + Number(e.amount), 0), es.filter((e) => exClaim(e)?.status === 'Claimed').reduce((s, e) => s + Number(e.amount), 0), es.filter((e) => exClaim(e)?.status === 'Paid').reduce((s, e) => s + Number(e.amount), 0)];
      return { title: 'Expense summary by partner', sheet: 'Expense by partner', cols: [{ h: 'Partner', t: 'text' }, { h: 'Not claimed (RM)', t: 'money', w: 16 }, { h: 'Claimed, unpaid (RM)', t: 'money', w: 18 }, { h: 'Paid (RM)', t: 'money' }], rows: D.members.map((m) => [m.display_name, ...x(D.expenses.filter((e) => e.member_id === m.id && !e.paid_from_pool))]), foot: ['Total', ...x(D.expenses)] }; },
    claims: (list, title = 'Claims') => ({ title, sheet: 'Claims', cols: [{ h: 'Ref', t: 'text', w: 9 }, { h: 'Partner', t: 'text', w: 18 }, { h: 'Claimed on', t: 'text', w: 14 }, { h: 'Expenses', t: 'text', w: 24 }, { h: 'Status', t: 'text', w: 10 }, { h: 'Paid on', t: 'text', w: 14 }, { h: 'Paid by', t: 'text', w: 16 }, { h: 'RM', t: 'money' }],
      rows: list.map((c) => [c.ref, memberName(c.member_id), dstr(c.submitted_on), D.ce.filter((x) => x.claim_id === c.id).map((x) => D.expenses.find((e) => e.id === x.expense_id)?.ref).filter(Boolean).join(', '), c.status, c.paid_on ? dstr(c.paid_on) : '', c.paid_by ? memberName(c.paid_by) : '', Number(c.amount)]),
      foot: ['Total', '', '', '', '', '', '', list.reduce((s, c) => s + Number(c.amount || 0), 0)] }),
    claimOne: (c) => { const es = D.ce.filter((x) => x.claim_id === c.id).map((x) => D.expenses.find((e) => e.id === x.expense_id)).filter(Boolean); const sp = SPEC.expenses(es, `Claim ${c.ref} · ${memberName(c.member_id)}`); sp.sub = `Claimed ${dstr(c.submitted_on)} · ${c.status === 'Paid' ? `paid ${dstr(c.paid_on)} by ${memberName(c.paid_by)}` : 'not paid yet'}${c.note ? ' · ' + c.note : ''}`; return sp; },
    purchases: () => { const list = [...D.purchases].sort((a, b) => a.ref.localeCompare(b.ref)); return { title: 'Purchases', sheet: 'Purchases', cols: [{ h: 'Ref', t: 'text', w: 9 }, { h: 'Date', t: 'text', w: 14 }, { h: 'Category', t: 'text', w: 18 }, { h: 'Item', t: 'text', w: 22 }, { h: 'From', t: 'text', w: 20 }, { h: 'For', t: 'text', w: 12 }, { h: 'Paid by', t: 'text', w: 14 }, { h: 'RM', t: 'money' }],
      rows: list.map((p) => [p.ref, p.purchased_on ? dstr(p.purchased_on) : p.date_note || '', p.category, p.item || '', p.supplier || '', p.for_batches || '', p.paid_by, p.amount != null ? Number(p.amount) : 'price to enter']),
      foot: ['Total', '', '', '', '', '', '', list.reduce((s, p) => s + Number(p.amount || 0), 0)] }; },
    spend: () => { const M = money(); const rows = Object.entries(M.by).sort((a, b) => b[1] - a[1]); return { title: 'Where the money went', sheet: 'Costs by category', cols: [{ h: 'Category', t: 'text', w: 30 }, { h: 'RM', t: 'money' }, { h: '% of costs', t: 'money' }], rows: rows.map(([k, v]) => [k, v, M.spent ? v / M.spent * 100 : 0]), foot: ['Total', M.spent, M.spent ? 100 : 0] }; },
    finance: () => { const M = money(); const act = D.members.filter((m) => m.active);
      return { title: 'Capital, profit and shares', sheet: 'Finance', sub: `Capital ${rm(M.pool)} · costs ${rm(M.spent)} · sales ${rm(M.sales)} · ${M.profit < 0 ? 'loss' : 'profit'} ${rm(Math.abs(M.profit))} · cash left about ${rm(M.cash)}`,
        cols: [{ h: 'Partner', t: 'text' }, { h: 'Capital (RM)', t: 'money' }, { h: 'Share %', t: 'money' }, { h: M.profit < 0 ? 'Share of loss (RM)' : 'Share of profit (RM)', t: 'money', w: 18 }],
        rows: act.map((m) => { const sh = M.pool ? Number(m.capital || 0) / M.pool : 0; return [m.display_name, Number(m.capital || 0), sh * 100, Math.abs(M.profit) * sh]; }), foot: ['Total', M.pool, M.pool ? 100 : 0, Math.abs(M.profit)] }; },
    material: (list = D.receipts, title = 'Planting material received') => ({ title, sheet: 'Planting material', cols: [{ h: 'Ref', t: 'text', w: 8 }, { h: 'Received', t: 'text', w: 14 }, { h: 'From', t: 'text', w: 24 }, { h: 'How', t: 'text', w: 9 }, { h: 'Type', t: 'text', w: 9 }, { h: 'Used for', t: 'text', w: 18 }, { h: 'Qty', t: 'int' }],
      rows: [...list].sort((a, b) => a.ref.localeCompare(b.ref)).map((r) => [r.ref, dstr(r.received_on), r.source, r.how, r.type, D.uses.filter((u) => u.receipt_id === r.id).map((u) => u.batch_id ? 'P' + (D.batches.find((b) => b.id === u.batch_id)?.no) : u.use).join(', '), r.qty]),
      foot: ['Total', '', '', '', '', '', list.reduce((s, r) => s + r.qty, 0)] }),
    grants: () => ({ title: 'Grants and aid received', sheet: 'Grants', cols: [{ h: 'Ref', t: 'text', w: 8 }, { h: 'What', t: 'text', w: 26 }, { h: 'Agency', t: 'text', w: 26 }, { h: 'Status', t: 'text', w: 11 }, { h: 'Applied', t: 'text', w: 13 }, { h: 'Approved', t: 'text', w: 13 }, { h: 'Quantity', t: 'text', w: 18 }, { h: 'Value or cost', t: 'text', w: 20 }, { h: 'Conditions', t: 'text', w: 30 }, { h: 'Deliveries', t: 'int' }, { h: 'Received (qty)', t: 'int' }],
      rows: [...D.grants].sort((a, b) => a.ref.localeCompare(b.ref)).map((g) => [g.ref, g.title, agName(g.agency_id), g.status, dstr(g.applied_on), dstr(g.approved_on), g.quantity || '', g.value_note || '', g.conditions || '', grMaterial(g).length, grMaterial(g).reduce((s, r) => s + r.qty, 0)]) }),
    alerts: () => ({ title: 'Urgent alerts', sheet: 'Alerts', cols: [{ h: 'Ref', t: 'text', w: 8 }, { h: 'Reported', t: 'text', w: 16 }, { h: 'Type', t: 'text', w: 22 }, { h: 'Where', t: 'text', w: 16 }, { h: 'Urgency', t: 'text', w: 10 }, { h: 'Status', t: 'text', w: 12 }, { h: 'What happened', t: 'text', w: 30 }, { h: 'Actions', t: 'text', w: 40 }],
      rows: [...D.alerts].sort((a, b) => a.ref.localeCompare(b.ref)).map((a) => [a.ref, `${memberName(a.reported_by)}, ${ago(a.reported_at)}`, a.type, a.location || '', a.urgency, a.status, a.description || '', alActions(a).map((x) => `${memberName(x.member_id)}: ${x.action}`).join(' | ')]) }),
    marks: () => { const cols = mapLayout(); const ms = [...(D.marks || [])].sort(byMade);
      return { title: 'Map marks', sheet: 'Map marks', sub: 'Sketch from the back of the lot to the road: ' + cols.map((c) => `${c.k.name}: ${c.slices.map((x) => 'P' + x.b.no).join(' → ') || 'not planted'}`).join(' · '),
        cols: [{ h: 'No.', t: 'int' }, { h: 'Type', t: 'text', w: 9 }, { h: 'Note', t: 'text', w: 36 }, { h: 'Where', t: 'text', w: 26 }, { h: 'Added by', t: 'text', w: 14 }, { h: 'Added', t: 'text', w: 12 }, { h: 'GPS', t: 'text', w: 22 }],
        rows: ms.map((m, i) => [i + 1, m.type, m.note || '', markWhere(m, cols), m.created_by ? memberName(m.created_by) : '', m.created_at ? dstr(String(m.created_at).slice(0, 10)) : '', m.lat != null ? `${m.lat}, ${m.lng}` : '']) }; }
  };
  const fullReport = () => [SPEC.finance(), SPEC.spend(), SPEC.keyDates(), SPEC.contractors(), SPEC.jobs(sortJobs(D.jobs)), SPEC.payments(D.pays), SPEC.buyers(), SPEC.picks(sortPicks(D.picks)), SPEC.receipts(D.rcs), SPEC.partnersExp(), SPEC.expenses(sortEx(D.expenses)), SPEC.claims(D.claims), SPEC.purchases(), SPEC.grants(), SPEC.material(), SPEC.alerts(), SPEC.marks()];

  // ---------- Reports page ----------
  async function reloadReports() { const { data } = await sb.from('reports').select('*').eq('plantation_id', D.plantation.id).order('created_at', { ascending: false }); if (data) D.reports = data; if (location.hash === '#reports' && $('sheet-wrap').hidden) route(); }
  PAGES.reports = (root) => {
    setHead('Reports', 'Saved Excel and PDF files for all partners');
    root.append(h('div', { class: 'card' }, h('div', { class: 'h sheet-head' }, 'Full plantation report'),
      h('p', { class: 'muted small' }, 'Everything in one file: finance and shares, costs by category, peringkat, jobs and contractor payments, harvest and buyer payments, expenses and claims, purchases, planting material and alerts. Excel puts each part on its own sheet.'),
      h('button', { class: 'btn gold', type: 'button', onclick: () => exportSheet(fullReport, 'Full report') }, 'Make the full report')));
    root.append(h('p', { class: 'muted small foot' }, 'Every table in the app also has its own Excel / PDF button.'));
    const keepM = Number(D.settings.keep_reports_months || 12);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - keepM);
    const list = (D.reports || []).filter((r) => new Date(r.created_at) >= cutoff);
    const old = (D.reports || []).filter((r) => new Date(r.created_at) < cutoff);
    root.append(sec(`Saved reports (${list.length})`));
    const box = card(list.length ? list.map((r) => {
      const a = h('a', { class: 'lrow', href: '#', onclick: async (e) => { e.preventDefault(); const { data, error } = await sb.storage.from('files').createSignedUrl(r.storage_path, 600); if (error) return toast(friendly(error)); window.open(data.signedUrl, '_blank', 'noopener'); } },
        h('span', { class: 'doc-ico' }, /\.pdf$/i.test(r.storage_path) ? 'PDF' : 'XLS'),
        h('span', { class: 'lmain' }, h('b', {}, r.name.replace(`${D.plantation.name} - `, '')), h('small', {}, `${memberName(r.made_by)} · ${ago(r.created_at)} · ${Math.max(1, Math.round((r.bytes || 0) / 1024))} KB`)));
      const del = D.isAdmin ? h('button', { class: 'thumb-x rel', type: 'button', 'aria-label': 'Delete ' + r.name, onclick: async () => {
        if (!window.confirm('Delete this report for everyone?')) return;
        await sb.storage.from('files').remove([r.storage_path]);
        const { error } = await sb.from('reports').delete().eq('id', r.id);
        if (error) return toast(friendly(error));
        D.reports = D.reports.filter((x) => x.id !== r.id); route();
      } }, '×') : null;
      return h('div', { class: 'rep-row' }, a, del);
    }) : h('p', { class: 'muted' }, 'No saved reports yet. Use an Excel / PDF button on any table, or make the full report above.'));
    root.append(box, h('p', { class: 'muted small foot' }, `Reports are kept for ${keepM} months.`));
    if (D.isAdmin && old.length) (async () => {
      await sb.storage.from('files').remove(old.map((r) => r.storage_path));
      await sb.from('reports').delete().in('id', old.map((r) => r.id));
      D.reports = list;
    })();
  };

  // ================= PHONE NOTIFICATIONS (Stage 7b) =================
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64ToBytes = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  async function pushState() {
    if (isIOS && !isStandalone()) return 'install';
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && (await reg.pushManager.getSubscription()); return sub ? 'on' : 'off'; } catch (_) { return 'off'; }
  }
  async function enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for LadangKita. Allow them in the phone\'s Settings, then try again.' : 'Notifications were not allowed.');
    const { data, error } = await sb.functions.invoke('notify-alert', { body: { action: 'key' } });
    if (error || !data || !data.publicKey) throw new Error('Could not reach the notification service. Check your signal and try again.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) });
    const j = sub.toJSON();
    const { error: e2 } = await sb.from('push_subscriptions').upsert({ plantation_id: D.plantation.id, member_id: D.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
    if (e2) throw e2;
  }
  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  }
  async function testPush() {
    const { data, error } = await sb.functions.invoke('notify-alert', { body: { action: 'test' } });
    if (error) { let msg = 'The test could not be sent.'; try { const b = await error.context.json(); if (b.error) msg = b.error; } catch (_) {} throw new Error(msg); }
    return data;
  }
  function pushCard(onHome) {
    const box = h('div', { class: onHome ? 'card push-home' : 'card' });
    const draw = async () => {
      const st = await pushState();
      if (onHome && (st === 'on' || st === 'unsupported' || (() => { try { return localStorage.getItem('lk_push_hide') === '1'; } catch (_) { return false; } })())) { box.remove(); return; }
      const msg = h('p', { class: 'muted small', role: 'status' });
      const btn = (label, cls, fn) => h('button', { class: 'btn ' + cls, type: 'button', onclick: async (e) => { const b = e.currentTarget; busy(b, true, 'Please wait…'); try { await fn(); } catch (ex) { msg.textContent = friendly(ex); busy(b, false, label); return; } draw(); } }, label);
      const parts = [h('div', { class: 'h sheet-head' }, onHome ? 'Get urgent alerts on this phone' : 'Phone notifications')];
      if (st === 'install') parts.push(h('p', { class: 'small' }, 'On iPhone, notifications only work when LadangKita is opened from its Home Screen icon. In Safari tap Share → Add to Home Screen, open LadangKita from the new icon, then come back here.'));
      else if (st === 'unsupported') parts.push(h('p', { class: 'small muted' }, 'This browser cannot show notifications. On iPhone, use iOS 16.4 or newer with LadangKita added to the Home Screen.'));
      else if (st === 'denied') parts.push(h('p', { class: 'small' }, 'Notifications are blocked for LadangKita on this phone. Open the phone\'s Settings → Notifications → LadangKita and allow them, then come back.'));
      else if (st === 'off') parts.push(h('p', { class: 'small muted' }, 'When any partner reports an urgent issue, this phone gets a notification straight away, even when the app is closed.'), btn('Turn on notifications', 'primary', async () => { await enablePush(); toast('Notifications are on for this phone'); }));
      else parts.push(h('p', { class: 'small' }, 'On for this phone. You will be told straight away when another partner reports an urgent issue.'),
        h('div', { class: 'sheet-btns' }, btn('Send a test', 'ghost', async () => { await testPush(); toast('Test sent. It should arrive in a few seconds.'); }), btn('Turn off', 'ghost', async () => { await disablePush(); toast('Notifications are off for this phone'); })));
      if (onHome) parts.push(h('button', { class: 'btn link', type: 'button', onclick: () => { try { localStorage.setItem('lk_push_hide', '1'); } catch (_) {} box.remove(); } }, 'Not now'));
      parts.push(msg);
      box.replaceChildren(...parts);
    };
    draw();
    return box;
  }

  // ================= PARTNERS' DASHBOARD (Stage 7c) =================
  const wide = () => matchMedia('(min-width: 1000px)').matches;
  const forBatches = (txt) => D.batches.filter((b) => String(txt || '').split(/[,+\s]+/).includes('P' + b.no));
  // split an amount across peringkat by their plant counts
  function spread(acc, batches, amount, field) {
    if (!amount) return false;
    const tot = batches.reduce((s, b) => s + b.plants, 0);
    if (!batches.length || !tot) return false;
    for (const b of batches) acc[b.id][field] += amount * b.plants / tot;
    return true;
  }
  function perBatch() {
    const acc = Object.fromEntries(D.batches.map((b) => [b.id, { spent: 0, sales: 0, fruit: 0 }]));
    let shared = 0;
    for (const j of D.jobs) { const c = jobCost(j); if (c && !spread(acc, jobBatches(j), c, 'spent')) shared += c; }
    for (const p of D.purchases) { const c = Number(p.amount || 0); if (c && !spread(acc, forBatches(p.for_batches), c, 'spent')) shared += c; }
    for (const e of D.expenses) shared += Number(e.amount || 0);
    for (const k of D.picks) { const bs = pickBatches(k); if (!spread(acc, bs, pickAmt(k), 'sales')) shared -= 0; spread(acc, bs, pickFruit(k), 'fruit'); }
    return { acc, shared };
  }
  function outlook() {
    // expected flowering and harvest from each variety's crop calendar (Settings); actual hormon jobs override the induction date
    const addM = (d, m) => { if (!d || m == null) return null; const x = new Date(d); x.setMonth(x.getMonth() + Math.round(Number(m))); return x; };
    return [...D.batches].sort((x, y) => x.no - y.no).map((b) => {
      const t = (D.templates || []).find((x) => x.variety === b.variety);
      const horm = jobBatches ? D.jobs.filter((j) => /hormon/i.test(j.category) && DONE.includes(j.status) && j.start_on && D.jb.some((x) => x.job_id === j.id && x.batch_id === b.id)).sort((x, y) => x.start_on.localeCompare(y.start_on))[0] : null;
      const induce = horm ? new Date(horm.start_on) : t ? addM(b.planted_on, t.months_to_induction) : null;
      const harvest = induce && t ? addM(induce, t.months_induction_to_harvest) : null;
      return { b, t, horm, induce, harvest };
    });
  }
  const monthStr = (d) => (d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '');

  PAGES.dashboard = (root) => {
    setHead(D.plantation.name, `Partners' dashboard · updated ${D.savedAt ? ago(D.savedAt) : 'now'}`);
    const M = money();
    const owedToUs = D.picks.filter((k) => !pickRc(k)).reduce((s, k) => s + pickAmt(k), 0);
    root.append(h('div', { class: 'dash-actions' },
      h('button', { class: 'btn gold', type: 'button', onclick: () => exportSheet(fullReport, 'Full report') }, 'Download full report (Excel / PDF)'),
      D.isAdmin ? h('button', { class: 'btn ghost', type: 'button', onclick: topUpForm }, 'Add capital top-up') : null));
    root.append(alertPanel());
    const tile = (l, v, s, href, tone) => h('a', { class: 'kpi' + (tone ? ' ' + tone : ''), href }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), s ? h('div', { class: 's' }, s) : null);
    root.append(h('div', { class: 'kpis dash-kpis' },
      tile('Capital pooled', M.pool ? rm(M.pool) : 'Not entered', `${D.members.filter((m) => m.active).length} partner(s)`, '#finance'),
      tile('Spent so far', rm(M.spent), M.unpriced ? `${M.unpriced} item(s) still need a price` : 'All costs priced', '#finance'),
      tile('Sales so far', rm(M.sales), owedToUs ? `Buyers owe ${rm(owedToUs)}` : 'Nothing owed to us', '#sales'),
      tile(M.profit < 0 ? 'Loss so far' : 'Profit so far', rm(Math.abs(M.profit)), M.profit < 0 ? 'Normal before the first harvest' : 'Sales minus all costs', '#finance', M.profit < 0 ? 'neg' : 'pos'),
      tile('Cash left in the pool', M.pool ? 'about ' + rm(M.cash) : '—', M.owedOut ? `Still to pay out ${rm(M.owedOut)}` : 'Nothing waiting to be paid', '#finance'),
      tile('Plants', fmt(D.batches.reduce((s, b) => s + b.plants, 0)), `${D.batches.length} peringkat · ${D.blocks.length} blok`, '#status')));

    const grid = h('div', { class: 'dash-grid' });
    root.append(grid);
    const col1 = h('div', { class: 'dash-col' }), col2 = h('div', { class: 'dash-col' });
    grid.append(col1, col2);

    // Peringkat: cost, sales and profit
    const { acc, shared } = perBatch();
    const rows = [...D.batches].sort((x, y) => x.no - y.no).map((b) => { const a = acc[b.id]; const area = b.measured_acres ?? b.est_acres; return { b, a, area, profit: a.sales - a.spent }; });
    const totSpent = rows.reduce((s, r) => s + r.a.spent, 0) + shared;
    const totSales = rows.reduce((s, r) => s + r.a.sales, 0);
    const pSpec = () => ({ title: 'Peringkat: cost, sales and profit', sheet: 'Peringkat money', sub: 'Costs and sales that cover several peringkat are split by plant count. Partner expenses and items not linked to a peringkat are shown as shared costs.',
      cols: [{ h: 'Peringkat', t: 'text', w: 14 }, { h: 'Blok', t: 'text', w: 14 }, { h: 'Variety', t: 'text', w: 12 }, { h: 'Plants', t: 'int' }, { h: 'Acres', t: 'money' }, { h: 'Spent (RM)', t: 'money' }, { h: 'Sales (RM)', t: 'money' }, { h: 'Profit (RM)', t: 'money' }, { h: 'Cost per plant (RM)', t: 'money', w: 16 }],
      rows: [...rows.map((r) => [r.b.name, batchInfo(r.b).blockNames.join(' + '), r.b.variety || '', r.b.plants, r.area != null ? Number(r.area) : null, r.a.spent, r.a.sales, r.profit, r.b.plants ? r.a.spent / r.b.plants : null]), ['Shared costs', 'not charged to a peringkat', '', null, null, shared, 0, -shared, null]],
      foot: ['Total', '', '', D.batches.reduce((s, b) => s + b.plants, 0), rows.reduce((s, r) => s + Number(r.area || 0), 0), totSpent, totSales, totSales - totSpent, null] });
    col1.append(sec('Peringkat: cost, sales and profit', xpBtn(pSpec, 'Peringkat money')));
    col1.append(h('div', { class: 'card table scroll' }, h('table', { class: 'dtable' },
      h('thead', {}, h('tr', {}, ['Peringkat', 'Variety', 'Plants', 'Acres', 'Spent', 'Sales', 'Profit', CUR() + ' / plant'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, h('a', { href: '#p-' + r.b.no }, h('span', { class: 'long' }, r.b.name), h('span', { class: 'short' }, 'P' + r.b.no)), h('small', {}, batchInfo(r.b).blockNames.join(' + '))), h('td', {}, r.b.variety || '—'),
        h('td', { class: 'num' }, fmt(r.b.plants)), h('td', { class: 'num' }, r.area != null ? Number(r.area).toFixed(2) : '—'), h('td', { class: 'num' }, money2(r.a.spent)), h('td', { class: 'num' }, money2(r.a.sales)),
        h('td', { class: 'num ' + (r.profit < 0 ? 'red-t' : 'green-t') }, (r.profit < 0 ? '−' : '') + money2(Math.abs(r.profit))), h('td', { class: 'num' }, r.b.plants ? (r.a.spent / r.b.plants).toFixed(3) : '—'))),
        h('tr', { class: 'shared' }, h('td', {}, 'Shared costs', h('small', {}, 'Partner expenses and items not linked to a peringkat')), h('td', {}), h('td', {}), h('td', {}), h('td', { class: 'num' }, money2(shared)), h('td', { class: 'num' }, '0.00'), h('td', { class: 'num red-t' }, shared ? '−' + money2(shared) : '0.00'), h('td', {}))),
      h('tfoot', {}, h('tr', {}, h('td', {}, 'Total'), h('td', {}), h('td', { class: 'num' }, fmt(D.batches.reduce((s, b) => s + b.plants, 0))), h('td', { class: 'num' }, rows.reduce((s, r) => s + Number(r.area || 0), 0).toFixed(2)),
        h('td', { class: 'num' }, money2(totSpent)), h('td', { class: 'num' }, money2(totSales)), h('td', { class: 'num ' + (totSales - totSpent < 0 ? 'red-t' : 'green-t') }, (totSales - totSpent < 0 ? '−' : '') + money2(Math.abs(totSales - totSpent))), h('td', {}))))));

    // Harvest outlook
    const ol = outlook();
    const known = ol.filter((o) => o.harvest || o.induce);
    col1.append(sec('Harvest outlook'));
    if (!known.length) col1.append(h('div', { class: 'card note' }, h('p', {}, 'Set the variety on each peringkat (Status → tap a peringkat → Edit) to see when each is expected to flower and fruit. The months come from the crop calendar for each variety. Each plant gives one fruit in its first crop.')));
    else {
      const byMonth = {};
      for (const o of known) if (o.harvest) { const k = o.harvest.getFullYear() * 12 + o.harvest.getMonth(); (byMonth[k] = byMonth[k] || { d: o.harvest, list: [] }).list.push(o); }
      const nowM = new Date().getFullYear() * 12 + new Date().getMonth();
      col1.append(card(Object.values(byMonth).sort((a, b) => a.d - b.d).map((g) => h('div', { class: 'trow' }, h('span', { class: 'fc-m h' }, monthStr(g.d), g.d.getFullYear() * 12 + g.d.getMonth() <= nowM ? h('small', { class: 'due' }, 'due now') : null), h('span', { class: 'lmain' }, h('b', {}, g.list.map((o) => 'P' + o.b.no).join(', ')), h('small', {}, g.list.map((o) => `${o.b.variety}${o.horm ? ', hormon ' + dstr(o.horm.start_on) : ''}`).join(' · '))), h('span', { class: 'lright' }, `up to ${fmt(g.list.reduce((s, o) => s + o.b.plants, 0))} fruit`))),
        ol.filter((o) => !o.harvest).length ? h('p', { class: 'muted small' }, `No outlook yet for ${ol.filter((o) => !o.harvest).map((o) => 'P' + o.b.no).join(', ')}: set their variety.`) : null));
      col1.append(h('p', { class: 'muted small foot' }, 'An estimate from each variety\'s crop calendar (☰ Settings → Crop calendar); a hormon job that is done replaces the expected flowering date. "Up to" = one fruit per plant.'));
    }

    // Needs attention
    const need = [];
    const noPrice = D.jobs.filter((j) => DONE.includes(j.status) && j.price == null).length;
    const noContr = D.jobs.filter((j) => DONE.includes(j.status) && !j.contractor_id).length;
    const noPurchase = D.purchases.filter((p) => p.amount == null).length;
    const toPay = D.jobs.filter((j) => j.status === 'To pay');
    const claimsUnpaid = D.claims.filter((c) => c.status === 'Claimed');
    const openAl = D.alerts.filter((a) => a.status !== 'Closed');
    const noCap = D.members.filter((m) => m.active && !Number(m.capital));
    if (openAl.length) need.push(['Urgent alerts open', openAl.map((a) => `${a.ref} ${a.type}`).join(' · '), '', '#alerts']);
    if (toPay.length) need.push(['Contractors to pay', `${toPay.length} job(s) done`, rm(toPay.reduce((s, j) => s + Number(j.price || 0), 0)), '#jobs']);
    if (claimsUnpaid.length) need.push(['Partner claims unpaid', claimsUnpaid.map((c) => `${c.ref} ${memberName(c.member_id)}`).join(' · '), rm(claimsUnpaid.reduce((s, c) => s + Number(c.amount || 0), 0)), '#exp']);
    if (owedToUs) need.push(['Buyers owe us', `${D.picks.filter((k) => !pickRc(k)).length} pick(s) not paid yet`, rm(owedToUs), '#sales']);
    if (noPrice || noContr) need.push(['Jobs missing details', `${noPrice} without a price · ${noContr} without a contractor`, '', '#jobs-none']);
    if (noPurchase) need.push(['Purchases without a price', `${noPurchase} from the planter's records`, '', '#finance']);
    if (noCap.length) need.push(['Capital not entered', noCap.map((m) => m.display_name).join(', '), '', '#partners']);
    if (outbox.length) need.push(['Changes not synced on this device', `${outbox.length} waiting`, '', '#']);
    col2.append(sec('Needs attention'));
    col2.append(card(need.length ? need.map((n) => h('a', { class: 'trow', href: n[3] }, h('span', { class: 'dot gold' }), h('span', { class: 'lmain' }, h('b', {}, n[0]), h('small', {}, n[1])), n[2] ? h('span', { class: 'lright' }, n[2]) : null, h('span', { class: 'chev' }, '›'))) : h('p', { class: 'muted' }, 'Nothing needs attention. All clear.')));

    // Partner statement
    const act = D.members.filter((m) => m.active);
    const stBox = h('div', { class: 'card' });
    const drawSt = (m) => {
      const share = M.pool ? Number(m.capital || 0) / M.pool : 0;
      const es = D.expenses.filter((e) => e.member_id === m.id && !e.paid_from_pool);
      const sum = (f) => es.filter(f).reduce((s, e) => s + Number(e.amount), 0);
      const rowsSt = [['Capital paid in', rm(m.capital)], ['Share of the plantation', M.pool ? (share * 100).toFixed(1) + '%' : '—'],
        [M.profit < 0 ? 'Share of loss so far' : 'Share of profit so far', M.pool ? rm(Math.abs(M.profit) * share) : '—'],
        ['Own-pocket spending not claimed', rm(sum((e) => !exClaim(e)))], ['Claimed, waiting to be paid', rm(sum((e) => exClaim(e)?.status === 'Claimed'))], ['Claims paid back', rm(sum((e) => exClaim(e)?.status === 'Paid'))]];
      stBox.replaceChildren(
        h('div', { class: 'seg' }, act.map((x) => h('button', { type: 'button', class: x.id === m.id ? 'on' : '', onclick: () => drawSt(x) }, x.display_name))),
        ...rowsSt.map((r) => h('div', { class: 'st-row' }, h('span', {}, r[0]), h('b', {}, r[1]))),
        h('p', { class: 'muted small' }, 'Profit is shared by capital paid in, after all costs. No payouts until the pool is paid back or the partners agree to one.'));
      stBox.dataset.member = m.id;
    };
    const stSpec = () => { const m = D.members.find((x) => x.id === stBox.dataset.member) || D.me; const share = M.pool ? Number(m.capital || 0) / M.pool : 0; const es = D.expenses.filter((e) => e.member_id === m.id && !e.paid_from_pool);
      const sum = (f) => es.filter(f).reduce((s, e) => s + Number(e.amount), 0);
      return { title: `Partner statement · ${m.display_name}`, sheet: 'Partner statement', sub: `Plantation capital ${rm(M.pool)} · costs ${rm(M.spent)} · sales ${rm(M.sales)} · ${M.profit < 0 ? 'loss' : 'profit'} ${rm(Math.abs(M.profit))}`,
        cols: [{ h: 'Item', t: 'text', w: 34 }, { h: 'Amount / %', t: 'money', w: 16 }],
        rows: [['Capital paid in (RM)', Number(m.capital || 0)], ['Share of the plantation (%)', share * 100], [M.profit < 0 ? 'Share of loss so far (RM)' : 'Share of profit so far (RM)', Math.abs(M.profit) * share], ['Own-pocket spending not claimed (RM)', sum((e) => !exClaim(e))], ['Claimed, waiting to be paid (RM)', sum((e) => exClaim(e)?.status === 'Claimed')], ['Claims paid back (RM)', sum((e) => exClaim(e)?.status === 'Paid')]] }; };
    col2.append(sec('Partner statement', xpBtn(stSpec, 'Partner statement')));
    drawSt(act.find((x) => x.id === D.me.id) || act[0] || D.me);
    col2.append(stBox);

    // Recent activity
    const ev = [];
    const by = (id) => (id ? memberName(id) : null);
    for (const j of D.jobs) if (j.created_by) ev.push([j.created_at, by(j.created_by), `recorded job ${j.ref} · ${jobName(j)}`, '#job-' + j.ref]);
    for (const p of D.pays) ev.push([p.created_at, by(p.created_by), `paid ${p.contractor_name} ${rm(p.amount)} (${p.ref})`, '#pay-' + p.ref]);
    for (const k of D.picks) if (k.created_by) ev.push([k.created_at, by(k.created_by), `recorded harvest ${k.ref} · ${fmt(pickFruit(k))} fruit`, '#pick-' + k.ref]);
    for (const r of D.rcs) ev.push([r.created_at, by(r.created_by), `received ${rm(r.amount)} from ${r.buyer_name} (${r.ref})`, '#rc-' + r.ref]);
    for (const e of D.expenses) ev.push([e.created_at, e.paid_from_pool ? null : by(e.member_id), `${e.paid_from_pool ? 'pool paid' : 'spent'} ${rm(e.amount)} · ${e.what || e.type}`, '#ex-' + e.ref]);
    for (const p of D.purchases) if (p.created_by) ev.push([p.created_at, by(p.created_by), `recorded purchase ${p.ref} · ${p.category}`, '#buy-' + p.ref]);
    for (const a of D.alerts) ev.push([a.reported_at, by(a.reported_by), `reported ${a.ref} · ${a.type}`, '#alert-' + a.ref]);
    for (const m of D.marks || []) if (m.created_by) ev.push([m.created_at, by(m.created_by), `marked the map: ${m.type} · ${m.note || ''}`, '#mark-' + m.id]);
    for (const x of D.aa) ev.push([x.created_at, by(x.member_id), `action on alert: ${x.action}`, '#alert-' + (D.alerts.find((a) => a.id === x.alert_id)?.ref || '')]);
    const recent = ev.filter((e) => e[0]).sort((a, b) => String(b[0]).localeCompare(String(a[0]))).slice(0, 12);
    col2.append(sec('Recent activity'));
    col2.append(card(recent.length ? recent.map((e) => h('a', { class: 'trow act', href: e[3] }, h('span', { class: 'lmain' }, h('b', {}, `${e[1] || T('Someone')} ${T(e[2])}`), h('small', {}, ago(e[0]))))) : h('p', { class: 'muted' }, 'Nothing recorded in the app yet. New jobs, harvests, payments, expenses and alerts will show here.')));
  };

  function topUpForm() {
    const act = D.members.filter((m) => m.active);
    openSheet('Add capital top-up', [
      { key: 'member', label: 'Partner', type: 'select', value: D.me.id, options: act.map((m) => [m.id, `${m.display_name} (now ${rm(m.capital)})`]) },
      { key: 'amount', label: 'Top-up amount (RM)', type: 'number', mode: 'decimal', required: true, ph: '0.00' },
      { type: 'note', label: 'This adds to the partner\'s capital paid in, so everyone\'s share is recalculated. Keep the bank slip as a receipt.' }
    ], async (v) => {
      if (!(v.amount > 0)) throw new Error('The amount must be more than ' + rm(0) + '.');
      const m = act.find((x) => x.id === v.member);
      const { error } = await sb.from('members').update({ capital: Math.round((Number(m.capital || 0) + v.amount) * 100) / 100 }).eq('id', m.id);
      if (error) throw error;
      await refresh(`Capital for ${m.display_name} is now ${rm(Number(m.capital || 0) + v.amount)}`);
    }, 'Add top-up');
  }

  function cropForm(t) {
    openSheet(t ? `Rename ${t.variety}` : 'Add a variety', [
      { key: 'variety', label: 'Variety name', required: true, value: t?.variety, ph: 'e.g. MD2' },
      t ? { type: 'note', label: 'Peringkat set to this variety are renamed with it.' } : { type: 'note', label: 'Then set its months and tasks on the next screen.' }
    ], async (v) => {
      const name = v.variety.trim();
      if ((D.templates || []).some((x) => x.id !== t?.id && x.variety.toLowerCase() === name.toLowerCase())) throw new Error(`${name} is already in the list.`);
      if (t) {
        const { error } = await sb.from('crop_templates').update({ variety: name }).eq('id', t.id); if (error) throw error;
        if (name !== t.variety) { const r = await sb.from('batches').update({ variety: name }).eq('plantation_id', D.plantation.id).eq('variety', t.variety); if (r.error) throw r.error; }
      } else {
        const id = uuid();
        const { error } = await sb.from('crop_templates').insert({ id, plantation_id: D.plantation.id, variety: name, tasks: [] }); if (error) throw error;
        cropSel = id;
      }
      await refresh('Variety saved');
      location.hash = '#settings-crop';
    });
  }

  // crop calendar tasks for one peringkat, dated from its planting date
  function cropTasksCard(b) {
    const t = (D.templates || []).find((x) => x.variety === b.variety);
    if (!b.variety || !t || !b.planted_on) return null;
    const tasks = (Array.isArray(t.tasks) ? t.tasks : []).filter((x) => x && x.name && x.month != null);
    const rows = [...tasks.map((x) => ({ name: x.name, month: Number(x.month) })),
      ...(t.months_to_induction != null ? [{ name: 'Hormon (flower induction)', month: Number(t.months_to_induction), key: true }] : []),
      ...(t.months_to_induction != null && t.months_induction_to_harvest != null ? [{ name: 'Harvest starts', month: Number(t.months_to_induction) + Number(t.months_induction_to_harvest), key: true }] : [])]
      .sort((a, b2) => a.month - b2.month);
    if (!rows.length) return null;
    const at = (m) => { const d = new Date(b.planted_on); d.setMonth(d.getMonth() + Math.floor(m)); d.setDate(d.getDate() + Math.round((m % 1) * 30)); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
    const now = today();
    let nextShown = false;
    return h('div', {}, sec(`Crop calendar · ${b.variety}`, h('a', { class: 'btn small-btn', href: '#settings-crop' }, 'Edit')),
      card(rows.map((r) => { const d = at(r.month), past = d < now, next = !past && !nextShown; if (next) nextShown = true;
        return h('div', { class: 'trow' + (past ? ' past' : '') }, h('span', { class: 'lmain' }, h('b', {}, r.name), h('small', {}, `Month ${r.month} · ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`)), past ? pill('Passed', '') : next ? pill('Next', 'gold') : null); })),
      h('p', { class: 'muted small foot' }, 'A guide from the variety\'s calendar; record the real work as Jobs.'));
  }

  // ---------- pages still to build ----------
  const later = (title, stage, what) => (root) => {
    setHead(title, 'Coming soon');
    root.append(h('div', { class: 'card soon' }, h('div', { class: 'h' }, `${title} is being built`), h('p', { class: 'muted' }, what), h('p', {}, pill(stage, 'gold'))));
  };
  // ================= MAP (Stage 7d) =================
  // A sketch of the lot, not to scale: blok side by side (width by area), drains between them, the road at the bottom.
  // Inside each blok the peringkat are stacked from the back (top) by map_order; height = their share of the blok's area.
  const byMade = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0);
  const MARK_TYPES = ['Issue', 'Fence', 'Water', 'Note'];
  const MARK_COL = { Issue: '#B42318', Fence: '#8A5A00', Water: '#2A6FB0', Note: '#3A403C' };
  const PLANT_COLS = ['#7CC49A', '#B9D3EA', '#F2D58A', '#E7B7C8', '#C9B8E8', '#A7D8D0', '#F0B98A'];
  let mapMode = 'planted', markMode = false, markType = 'Issue', mapSel = null;
  const DRAIN = 1.2; // % width of each drain line
  function mapLayout() {
    const blocks = [...D.blocks].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const acres = blocks.map((k) => Number(k.est_acres || 0) || 1);
    const tot = acres.reduce((s, a) => s + a, 0);
    const usable = 100 - DRAIN * Math.max(0, blocks.length - 1);
    let left = 0;
    const cols = blocks.map((k, i) => { const w = usable * acres[i] / tot; const c = { k, left, w, slices: [] }; left += w + DRAIN; return c; });
    for (const c of cols) {
      const links = D.bb.filter((x) => x.block_id === c.k.id).map((x) => ({ x, b: D.batches.find((b) => b.id === x.batch_id) })).filter((r) => r.b)
        .sort((p, q) => (p.x.map_order ?? p.b.no) - (q.x.map_order ?? q.b.no) || p.b.no - q.b.no);
      const kAcres = Number(c.k.est_acres || 0);
      const share = links.map(({ x, b }) => { const area = Number(b.measured_acres ?? b.est_acres ?? 0); return b.plants && area ? area * x.plants / b.plants : 0; });
      let used = share.reduce((s, a) => s + a, 0);
      const scale = kAcres ? Math.max(1, used / kAcres) * kAcres : (used || 1);
      let top = 0;
      links.forEach(({ x, b }, i) => { const hgt = 100 * (share[i] || 0) / scale; c.slices.push({ b, x, top, h: hgt }); top += hgt; });
      c.planted = top;
    }
    return cols;
  }
  const sliceAt = (cols, px, py) => { for (const c of cols) if (px >= c.left && px <= c.left + c.w) { const s = c.slices.find((s) => py >= s.top && py <= s.top + s.h); return { c, s }; } return { c: null, s: null }; };
  const markWhere = (m, cols = mapLayout()) => {
    if (m.x == null) return 'Not placed on the sketch';
    const { c, s } = sliceAt(cols, Number(m.x) * 100, Number(m.y) * 100);
    if (s) return `${s.b.name} · ${c.k.name}`;
    return c ? `${c.k.name} · not in a planted area` : 'On a drain';
  };
  function plantGroup(b) {
    if (!b.planted_on) return 'Not planted';
    const d = new Date(b.planted_on), half = d.getMonth() < 6 ? 0 : 1;
    // two-month groups read best for this lot: Sep–Oct, Nov–Dec, …
    const m0 = d.getMonth() - (d.getMonth() % 2);
    return `${MONTHS[m0]}–${MONTHS[m0 + 1]} ${d.getFullYear()}` + (half ? '' : '');
  }
  function colourKey(b) { return mapMode === 'variety' ? (b.variety || 'Variety not set') : plantGroup(b); }

  PAGES.map = (root) => {
    setHead('Map', `${D.plantation.name} · sketch, not to scale`);
    const cols = mapLayout();
    const batchesSorted = [...D.batches].sort((a, b) => String(a.planted_on || '9').localeCompare(String(b.planted_on || '9')) || a.no - b.no);
    const keys = [...new Set(batchesSorted.map(colourKey))];
    const colOf = (b) => { const k = colourKey(b); return k === 'Variety not set' || k === 'Not planted' ? '#E4E2D8' : PLANT_COLS[keys.filter((x) => x !== 'Variety not set' && x !== 'Not planted').indexOf(k) % PLANT_COLS.length]; };

    root.append(h('div', { class: 'seg' }, [['planted', 'Colour by planting date'], ['variety', 'Colour by variety']].map(([v, l]) => h('button', { type: 'button', class: mapMode === v ? 'on' : '', onclick: () => { mapMode = v; route(); } }, l))));
    root.append(h('div', { class: 'map-legend' }, keys.map((k) => h('span', {}, h('i', { style: `background:${colOf(batchesSorted.find((b) => colourKey(b) === k))}` }), k))));
    const typeSel = h('select', { 'aria-label': 'Type of mark', onchange: (e) => { markType = e.target.value; } }, MARK_TYPES.map((t) => h('option', { value: t, selected: t === markType }, t)));
    const markBtn = h('button', { type: 'button', class: 'btn ' + (markMode ? 'primary' : 'ghost'), onclick: () => { markMode = !markMode; mapSel = null; route(); } }, markMode ? 'Now tap the map to place it' : 'Mark on map');
    root.append(h('div', { class: 'map-tools' }, typeSel, markBtn));

    const head = h('div', { class: 'map-head', 'aria-hidden': 'true' }, cols.map((c) => h('div', { style: `left:${c.left}%;width:${c.w}%` }, c.k.name, h('br'), c.k.est_acres != null ? `~${Number(c.k.est_acres).toFixed(2)} ac` : '')));
    const map = h('div', { class: 'map' + (markMode ? ' marking' : ''), role: 'group', 'aria-label': 'Plantation sketch' });
    for (let i = 1; i < cols.length; i++) map.append(h('div', { class: 'drain', style: `left:${cols[i].left - DRAIN}%;width:${DRAIN}%` }));
    for (const c of cols) {
      if (c.planted < 85) map.append(h('div', { class: 'unplanted', style: `left:${c.left}%;width:${c.w}%;top:${c.planted + (100 - c.planted) / 2 - 3}%` }, c.planted < 1 ? 'Not planted yet' : 'Rest not planted yet'));
      for (const s of c.slices) {
        const on = mapSel === s.b.id;
        map.append(h('button', { type: 'button', class: 'slice' + (on ? ' on' : '') + (mapSel && !on ? ' dim' : ''), 'aria-label': `${s.b.name}, ${c.k.name}, ${fmt(s.x.plants)} plants`,
          style: `left:${c.left}%;width:${c.w}%;top:${s.top}%;height:${s.h}%;background:${colOf(s.b)}`,
          onclick: (e) => { if (markMode) return; e.stopPropagation(); mapSel = on ? null : s.b.id; route(); } },
          s.h >= 4 ? h('span', {}, h('b', {}, 'P' + s.b.no), ' ', fmt(s.x.plants)) : null));
      }
    }
    const marks = [...(D.marks || [])].sort(byMade);
    marks.forEach((m, i) => { if (m.x == null) return; map.append(h('a', { class: 'pin', href: '#mark-' + m.id, style: `left:${Number(m.x) * 100}%;top:${Number(m.y) * 100}%;--c:${MARK_COL[m.type] || '#3A403C'}`, 'aria-label': `Mark ${i + 1}: ${m.type}, ${m.note || ''}`, onclick: (e) => { if (markMode) e.preventDefault(); } }, h('b', {}, String(i + 1)))); });
    map.addEventListener('click', (e) => {
      if (!markMode) { if (mapSel) { mapSel = null; route(); } return; }
      const r = map.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      markMode = false;
      markForm(null, { x, y, type: markType });
    });
    root.append(h('div', { class: 'map-wrap' }, head, map, h('div', { class: 'road', 'aria-hidden': 'true' }, h('div', { class: 'drain-h' }), h('div', {}, `Jalan (road) · front of the lot${D.plantation.length_m ? ', ' + fmt(D.plantation.length_m) + ' m' : ''}`))));

    if (mapSel) {
      const b = D.batches.find((x) => x.id === mapSel), info = batchInfo(b);
      root.append(h('div', { class: 'card map-sel' }, h('div', {}, h('div', { class: 'h' }, `${b.name} · ${info.blockNames.join(' + ')}`),
        h('small', { class: 'muted' }, `${fmt(b.plants)} plants · planted ${b.planted_on ? dstr(b.planted_on) : '—'}${info.age != null ? ' · ' + info.age + ' months' : ''}${b.variety ? ' · ' + b.variety : ''}`)),
        h('a', { class: 'btn primary', href: '#p-' + b.no }, 'Open peringkat')));
    } else root.append(h('p', { class: 'muted small foot' }, 'Tap a peringkat to see it. The order inside each blok can be changed with "Arrange".'));

    root.append(sec('Marks on the map', xpBtn(SPEC.marks, 'Map marks')));
    root.append(card(marks.length ? marks.map((m, i) => h('a', { class: 'trow', href: '#mark-' + m.id }, h('span', { class: 'mk-n', style: `--c:${MARK_COL[m.type] || '#3A403C'}` }, String(i + 1)),
      h('span', { class: 'lmain' }, h('b', {}, `${m.type} · ${m.note || 'No note'}`), h('small', {}, `${markWhere(m, cols)} · ${m.created_by ? memberName(m.created_by) + ', ' : ''}${ago(m.created_at)}`)), h('span', { class: 'chev' }, '›')))
      : h('p', { class: 'muted' }, 'No marks yet. Choose a type and press Mark on map.')));

    root.append(sec('Arrange the sketch'));
    root.append(card(cols.filter((c) => c.slices.length > 1).map((c) => h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, c.k.name), h('small', {}, `From the back: ${c.slices.map((s) => 'P' + s.b.no).join(' → ')} → road`)),
      h('button', { class: 'btn small-btn', type: 'button', onclick: () => arrangeForm(c) }, 'Arrange'))),
      h('p', { class: 'muted small' }, 'Heights come from each peringkat\'s area (measured area if entered, otherwise estimated from plants). Blok widths come from their area.')));
  };

  function arrangeForm(c) {
    const order = c.slices.map((s) => s.x);
    const list = h('div', { class: 'arrange' });
    const draw = () => list.replaceChildren(...order.map((x, i) => { const b = D.batches.find((y) => y.id === x.batch_id);
      return h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, `${i + 1}. ${b.name}`), h('small', {}, `${fmt(x.plants)} plants in ${c.k.name}`)),
        h('button', { type: 'button', class: 'btn small-btn', disabled: i === 0, 'aria-label': 'Move up', onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, '↑'),
        h('button', { type: 'button', class: 'btn small-btn', disabled: i === order.length - 1, 'aria-label': 'Move down', onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, '↓')); }));
    draw();
    openSheet(`Arrange ${c.k.name}`, [{ type: 'note', label: 'Top = back of the lot, bottom = next to the road.' }, { type: 'info', node: list }], async () => {
      for (const [i, x] of order.entries()) {
        const { error } = await sb.from('batch_blocks').update({ map_order: i + 1 }).eq('batch_id', x.batch_id).eq('block_id', x.block_id);
        if (error) throw error;
      }
      await refresh('Sketch order saved');
    });
  }

  function markForm(m, place) {
    const cols = mapLayout();
    const pos = m ? { x: m.x, y: m.y } : place;
    const where = pos && pos.x != null ? markWhere({ x: pos.x, y: pos.y }, cols) : '';
    const gps = { lat: m?.lat ?? null, lng: m?.lng ?? null };
    const gpsBox = h('div', { class: 'gps' });
    const drawGps = () => gpsBox.replaceChildren(...[gps.lat != null ? h('small', { class: 'muted' }, `GPS saved: ${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)} `) : null,
      h('button', { type: 'button', class: 'btn link', onclick: () => {
        if (!navigator.geolocation) return toast('This phone cannot share its location.');
        toast('Getting your location…');
        navigator.geolocation.getCurrentPosition((p) => { gps.lat = Math.round(p.coords.latitude * 1e6) / 1e6; gps.lng = Math.round(p.coords.longitude * 1e6) / 1e6; drawGps(); toast('Location added'); },
          () => toast('Location not available. Allow location for LadangKita in the phone settings.'), { enableHighAccuracy: true, timeout: 15000 });
      } }, gps.lat != null ? 'Update with where I stand now' : '+ Add my GPS location (stand at the spot)')].filter(Boolean));
    drawGps();
    openSheet(m ? 'Edit mark' : `New ${place.type.toLowerCase()} mark`, [
      where ? { type: 'note', label: `Where: ${where}` } : null,
      { key: 'type', label: 'Type', type: 'select', value: m ? m.type : place.type, options: MARK_TYPES.map((t) => [t, t]) },
      { key: 'note', label: 'Note', type: 'textarea', required: true, value: m?.note, ph: 'e.g. Fence post down, about 3 m gap' },
      { type: 'info', node: gpsBox },
      { type: 'note', label: m ? 'Add photos on the mark page.' : 'After saving you can add photos.' }
    ].filter(Boolean), async (v) => {
      const hit = pos && pos.x != null ? sliceAt(cols, Number(pos.x) * 100, Number(pos.y) * 100).s : null;
      if (m) {
        await commit([{ op: 'update', table: 'map_marks', values: { type: v.type, note: v.note, lat: gps.lat, lng: gps.lng }, eq: { id: m.id } }], 'Mark saved', { label: 'Map mark' });
      } else {
        const id = uuid();
        await commit([{ op: 'insert', table: 'map_marks', rows: [{ id, plantation_id: D.plantation.id, type: v.type, note: v.note, x: Math.round(pos.x * 10000) / 10000, y: Math.round(pos.y * 10000) / 10000, lat: gps.lat, lng: gps.lng, batch_id: hit ? hit.b.id : null, created_by: D.me.id, created_at: new Date().toISOString() }] }], 'Mark added', { label: 'Map mark' });
        location.hash = '#mark-' + id;
      }
    }, 'Save', false, true);
  }

  PAGES.mark = (root, id) => {
    const m = (D.marks || []).find((x) => x.id === id);
    if (!m) { location.hash = '#map'; return; }
    const n = [...D.marks].sort(byMade).indexOf(m) + 1;
    setHead(`Mark ${n} · ${m.type}`, markWhere(m), ['Map', '#map']);
    root.append(h('div', { class: 'card kvs' }, kv('Note', m.note, true), kv('Where', markWhere(m), true),
      kv('Added', `${m.created_by ? memberName(m.created_by) + ', ' : ''}${ago(m.created_at)}`, true),
      m.lat != null ? kv('GPS', h('a', { href: `https://maps.google.com/?q=${m.lat},${m.lng}`, target: '_blank', rel: 'noopener' }, `${Number(m.lat).toFixed(5)}, ${Number(m.lng).toFixed(5)} · open in Maps`), true) : null,
      m.alert_id ? kv('Alert', h('a', { href: '#alert-' + (D.alerts.find((a) => a.id === m.alert_id)?.ref || '') }, D.alerts.find((a) => a.id === m.alert_id)?.ref || '—'), true) : null));
    root.append(h('div', { class: 'alert-btns' }, h('button', { class: 'btn primary', type: 'button', onclick: () => markForm(m) }, 'Edit'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { mapSel = m.batch_id; location.hash = '#map'; } }, 'Show on map')));
    root.append(attachBox('map_mark', m.id));
    if (D.isAdmin || m.created_by === D.me.id) root.append(h('button', { class: 'btn link danger-t', type: 'button', onclick: () => openSheet(`Delete mark ${n}?`, [{ type: 'note', label: 'The mark and its note are removed from the map.' }], async () => {
      await commit([{ op: 'delete', table: 'map_marks', eq: { id: m.id } }], 'Mark deleted', { label: 'Delete map mark' });
      location.hash = '#map';
    }, 'Delete mark', true, true) }, 'Delete this mark'));
  };


  // ================= START =================
  async function start() {
    show('loading', 'Loading', 'Getting your plantation');
    await refreshOutbox();
    await flushOutbox();
    try { D = await loadAll(); }
    catch (e) {
      const { data: { session } } = await sb.auth.getSession();
      const snap = session && isNetErr(e) ? readSnap(session.user.id) : null;
      if (snap) { D = { ...snap, offline: true }; for (const x of outbox) applyLocal(x.ops); show('app', D.plantation.name, ''); route(); netBar(); return; }
      show('email', 'Sign in', 'Pineapple plantation records');
      return showErr('page-err', isNetErr(e) ? 'No signal, and this phone has no saved copy yet. Open the app once with signal first.' : 'Could not load your plantation: ' + friendly(e));
    }
    if (!D) return show('email', 'Sign in', 'Pineapple plantation records');
    if (!D.me) { $('nm-email').textContent = D.user.email; return show('nomember', 'Almost there', 'Your email is not on a plantation yet'); }
    show('app', D.plantation.name, '');
    route(); netBar();
  }

  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && D) { D = null; show('email', 'Sign in', 'Pineapple plantation records'); } });

  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return start();
    let saved = '';
    try { saved = localStorage.getItem('lk_pending_email') || ''; } catch (_) {}
    if (saved) { pendingEmail = saved; $('code-to').textContent = saved; show('code', 'Check your email', 'Enter the code we sent you'); }
    else show('email', 'Sign in', 'Pineapple plantation records');
  })();
}
