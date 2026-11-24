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
  const rm = (n) => 'RM ' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dstr = (d) => { if (!d) return ''; const [y, m, day] = String(d).slice(0, 10).split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
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
    if (back) { b.hidden = false; b.textContent = '‹ ' + back[0]; b.href = back[1]; } else b.hidden = true;
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
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const claim = await sb.rpc('claim_membership'); // links first sign-in to the partner record; separate request
    if (claim.error) console.warn('claim_membership', claim.error);
    const mine = await sb.from('members').select('*').eq('user_id', user.id).eq('active', true).limit(1);
    if (mine.error) throw mine.error;
    if (!mine.data.length) return { user, me: null };
    const me = mine.data[0];
    const p = me.plantation_id;
    const q = (t, sel = '*') => sb.from(t).select(sel).eq('plantation_id', p);
    const [pl, members, priv, blocks, batches, bb, jobs, jb, receipts, uses, grants, agencies, alerts, cats, contractors, pays, pj, atts, settings, buyers, picks, pkb, rcs, rp] = await Promise.all([
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
      q('alerts', 'id, ref, type, location, urgency, status').neq('status', 'Closed'),
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
      q('receipt_picks')
    ]);
    const all = [pl, members, priv, blocks, batches, bb, jobs, jb, receipts, uses, grants, agencies, alerts, cats, contractors, pays, pj, atts, settings, buyers, picks, pkb, rcs, rp];
    const bad = all.find((r) => r.error);
    if (bad) throw bad.error;
    return {
      user, me, isAdmin: me.role === 'admin', plantation: pl.data,
      members: members.data, priv: Object.fromEntries(priv.data.map((r) => [r.member_id, r])),
      blocks: blocks.data, batches: batches.data, bb: bb.data, jobs: jobs.data, jb: jb.data,
      receipts: receipts.data, uses: uses.data, grants: grants.data, agencies: agencies.data, alerts: alerts.data,
      cats: cats.data, contractors: contractors.data, pays: pays.data, pj: pj.data, atts: atts.data, settings: settings.data || {},
      buyers: buyers.data, picks: picks.data, pkb: pkb.data, rcs: rcs.data, rp: rp.data
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

  // ================= ROUTER =================
  const TABS = { status: 'status', map: 'map', jobs: 'jobs', sales: 'sales', exp: 'exp', finance: 'finance' };
  function route() {
    if (!D || !D.me) return;
    closeMenu();
    closeSheet();
    const hash = decodeURIComponent(location.hash.slice(1));
    const [name, arg] = hash.split(/-(.+)/);
    const page = PAGES[name] || PAGES.home;
    const tab = TABS[name] || { p: 'status', job: 'jobs', pay: 'jobs', pick: 'sales', rc: 'sales' }[name] || '';
    for (const a of document.querySelectorAll('#tabs a')) a.classList.toggle('on', a.dataset.tab === tab);
    const root = $('v-app');
    root.replaceChildren();
    try { page(root, arg); } catch (e) { console.error(e); root.append(h('div', { class: 'card' }, h('p', { class: 'err' }, 'Something went wrong on this page: ' + e.message))); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('back').addEventListener('click', (e) => { if (history.length > 1 && $('back').dataset.useHistory) { e.preventDefault(); history.back(); } });

  async function refresh(msg) {
    try { D = await loadAll(); } catch (e) { return toast(friendly(e)); }
    route();
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
  function openSheet(title, fields, onSave, saveLabel = 'Save', danger = false) {
    const f = $('sheet');
    f.replaceChildren();
    f.append(h('div', { class: 'h sheet-title' }, title));
    const inputs = {}, wraps = [], renders = [];
    const raw = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.getVal ? el.getVal() : el.value]));
    for (const fd of fields) {
      let wrap;
      if (fd.type === 'head') wrap = h('div', { class: 'h sheet-head' }, fd.label);
      else if (fd.type === 'note') wrap = h('div', { class: 'note-box' }, fd.label);
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
        wrap = h(fd.type === 'chips' ? 'div' : 'label', { class: 'field' + (fd.half ? ' half' : ''), for: fd.type === 'chips' ? null : id }, h('span', {}, fd.label, fd.required ? ' *' : ''), input,
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
    const open = D.alerts;
    if (open.length) {
      root.append(h('div', { class: 'alert-red' },
        h('div', { class: 'h ah' }, svg('<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>'), `${open.length} urgent issue${open.length > 1 ? 's' : ''} open`),
        open.map((a) => h('div', { class: 'alert-item' }, h('b', {}, `${a.type}${a.location ? ' · ' + a.location : ''}`), h('small', {}, `${a.urgency} · ${a.status}`)))));
    } else {
      root.append(h('div', { class: 'alert-ok' }, svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
        h('div', {}, h('div', { class: 'h' }, 'No alert'), h('small', {}, 'All clear on the plantation'))));
    }
    const plants = D.batches.reduce((s, b) => s + b.plants, 0);
    const toEnter = D.jobs.filter((j) => DONE.includes(j.status) && (j.price == null || !j.contractor_id)).length;
    const toPay = D.jobs.filter((j) => j.status === 'To pay').reduce((s, j) => s + Number(j.price || 0), 0);
    const owed = D.picks.filter((k) => !pickRc(k)).reduce((s, k) => s + pickAmt(k), 0);
    root.append(h('div', { class: 'kpis' },
      kpi('Plants', fmt(plants), `${D.batches.length} peringkat`, '#status'),
      kpi('Area', `${Number(D.plantation.area_acres || 0).toFixed(2)} ac`, `${D.blocks.length} blok`, '#status'),
      D.picks.length ? kpi('Sales', rm(D.picks.reduce((s, k) => s + pickAmt(k), 0)), owed ? `Buyers owe ${rm(owed)}` : 'All paid', '#sales')
        : kpi('Partners', fmt(D.members.filter((m) => m.active).length), D.isAdmin ? 'Tap to add' : 'In this plantation', '#partners'),
      toPay ? kpi('To pay contractors', rm(toPay), `${D.jobs.filter((j) => j.status === 'To pay').length} jobs done`, '#jobs')
        : kpi('Jobs', fmt(D.jobs.length), toEnter ? `${toEnter} need contractor and cost` : 'All costs entered', toEnter ? '#jobs-none' : '#jobs')));
    const upcoming = D.jobs.filter((j) => ['Planned', 'Quoted', 'In progress'].includes(j.status));
    root.append(sec('Coming up'));
    root.append(card(upcoming.length ? upcoming.map((j) => {
      const names = D.jb.filter((x) => x.job_id === j.id).map((x) => D.batches.find((b) => b.id === x.batch_id)).filter(Boolean).map((b) => 'P' + b.no);
      return h('a', { class: 'trow', href: '#job-' + j.ref }, h('span', { class: 'dot gold' }), h('span', { class: 'lmain' }, h('b', {}, jobName(j)), h('small', {}, `${jobDate(j)} · ${names.join(', ')}${jobWho(j) ? ' · ' + jobWho(j) : ''}${j.note ? ' · ' + j.note : ''}`)), pill(j.status, 'gold'));
    }) : h('p', { class: 'muted' }, 'Nothing planned yet.')));
    root.append(h('a', { class: 'btn gold', href: '#jobs' }, 'Jobs and contractor payments'));
    if (toEnter) root.append(h('a', { class: 'banner amber-b', href: '#jobs-none' }, h('span', {}, h('b', {}, `${toEnter} past job${toEnter > 1 ? 's' : ''} need a contractor and price`), h('small', {}, 'From the planter\'s records. Tap to complete them.')), h('span', { class: 'chev' }, '›')));
    root.append(h('div', { class: 'card note' }, h('p', {}, h('strong', {}, 'Being built: '), 'Expense, Finance and Map are coming next. Everything you see here is your real plantation data.')));
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

    root.append(sec('Key dates by peringkat'));
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
      const { error } = await sb.from('batches').update(v).eq('id', b.id);
      if (error) throw error;
      await refresh('Saved');
    });
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
  PAGES.agencies = (root) => {
    setHead('Agencies', 'Agencies, grants and aid');
    root.append(card(D.agencies.length ? D.agencies.map((a) => h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, a.name), h('small', {}, [a.type, a.programme].filter(Boolean).join(' · '))))) : h('p', { class: 'muted' }, 'No agencies yet.')));
    root.append(sec('Grants and aid received'));
    root.append(card(D.grants.map((g) => {
      const recs = D.receipts.filter((r) => r.grant_id === g.id);
      const used = D.uses.filter((u) => recs.some((r) => r.id === u.receipt_id) && u.batch_id).map((u) => D.batches.find((b) => b.id === u.batch_id)?.no).filter(Boolean);
      return h('div', { class: 'trow' }, h('span', { class: 'lmain' }, h('b', {}, `${g.ref} · ${g.title}`),
        h('small', {}, `${g.quantity || ''}${g.value_note ? ' · ' + g.value_note : ''}${g.conditions ? ' · Conditions: ' + g.conditions : ''}`),
        used.length ? h('small', {}, 'Planted in Peringkat ' + [...new Set(used)].sort((a, b) => a - b).join(', ')) : null), pill(g.status, 'green'));
    })));
    root.append(sec('Planting material received'));
    const tot = D.receipts.reduce((s, r) => s + r.qty, 0);
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'mrow ghead' }, h('span', {}, 'Ref · from'), h('span', {}, 'How'), h('span', { class: 'num' }, 'Qty')),
      D.receipts.map((r) => h('div', { class: 'mrow' }, h('span', {}, h('b', {}, r.ref), h('small', {}, `${r.source} · ${r.type}${r.received_on ? ' · ' + dstr(r.received_on) : ''}`)), h('span', {}, r.how), h('span', { class: 'num' }, fmt(r.qty)))),
      h('div', { class: 'mrow total' }, h('span', {}, 'Total'), h('span', {}), h('span', { class: 'num' }, fmt(tot)))));
    root.append(h('p', { class: 'muted small foot' }, 'Adding agencies and recording new grants comes in a later stage.'));
  };

  // ---------- Settings ----------
  PAGES.settings = (root) => {
    setHead('Settings', D.plantation.name);
    const p = D.plantation;
    root.append(sec('Plantation profile', D.isAdmin ? h('button', { class: 'btn small-btn', type: 'button', onclick: editPlantation }, 'Edit') : null));
    root.append(h('div', { class: 'card kvs' },
      kv('Name', p.name, true), kv('SSM number', p.ssm_no), kv('Business type', p.business_type), kv('Started', dstr(p.started_on)),
      kv('Area', p.area_acres ? `${Number(p.area_acres).toFixed(2)} acres${p.length_m ? ` (${fmt(p.length_m)} m × ${fmt(p.width_m)} m)` : ''}` : ''),
      kv('Address', [p.address, p.district_state].filter(Boolean).join(', '), true), kv('GPS', p.gps, true),
      kv('Landowner', p.landowner), kv('Rent', p.rent_amount != null ? `${rm(p.rent_amount)}${p.rent_period ? ' / ' + p.rent_period.toLowerCase() : ''}` : ''),
      kv('Lease ends', dstr(p.lease_ends_on)), kv('Phone', p.phone), kv('Email', p.email, true)));
    if (!D.isAdmin) root.append(h('p', { class: 'muted small foot' }, 'Only the admin partner can change the plantation profile.'));
    root.append(sec('Me'));
    root.append(card(linkRow('#partner-' + D.me.id, 'My details', `${D.me.display_name} · ${D.user.email}`)));
    root.append(h('button', { class: 'btn ghost', type: 'button', onclick: signOut }, 'Sign out'));
    root.append(h('p', { class: 'muted small foot center-t' }, 'LadangKita · Stage 1'));
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
      root.append(sec('Summary by contractor'));
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
    root.append(sec(cid || none ? 'Jobs' : 'All jobs'));
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'jrow ghead' + (contractor ? ' sel' : '') }, contractor ? h('span', {}, '') : null, h('span', {}, 'Date'), h('span', {}, 'Job'), h('span', { class: 'num' }, 'RM'), h('span', {}, 'Status')),
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
      root.append(sec('Payments to contractors'));
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
      const { error } = await sb.from('jobs').update({ status: st, start_on: j.start_on || (st === 'In progress' ? today() : null) }).eq('id', j.id);
      if (error) { toast(friendly(error)); busy(e.currentTarget, false, step[0]); return; }
      await refresh(step[1] === 'Done' && j.price == null ? 'Marked done. Enter the price so it can be paid.' : 'Saved');
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
      let contractor_id = null, contractor_name = null;
      if (v.contractor) {
        const found = D.contractors.find((c) => c.name.trim().toLowerCase() === v.contractor.toLowerCase());
        if (found) { contractor_id = found.id; contractor_name = found.name; }
        else {
          const { data, error } = await sb.from('contractors').insert({ plantation_id: D.plantation.id, name: v.contractor }).select('id, name').single();
          if (error) throw error;
          contractor_id = data.id; contractor_name = data.name;
        }
      }
      const status = v.status === 'Done' && v.price != null ? 'To pay' : v.status;
      const row = { category: v.category, other_note: v.category === 'Upah Lain-lain' ? v.other_note : null, products: v.products, method: v.method,
        contractor_id, contractor_name, start_on: v.start_on, date_note: v.start_on ? null : v.date_note, status, price: v.price, note: v.note };
      let id = j?.id, ref = j?.ref;
      if (isNew) {
        let tries = 0, res;
        do {
          ref = nextRef('J-', D.jobs.concat(tries ? [{ ref: ref }] : []));
          res = await sb.from('jobs').insert({ ...row, plantation_id: D.plantation.id, ref, created_by: D.me.id }).select('id').single();
          tries++;
        } while (res.error && /duplicate|unique/i.test(res.error.message) && tries < 4);
        if (res.error) throw res.error;
        id = res.data.id;
      } else {
        const { error } = await sb.from('jobs').update(row).eq('id', id);
        if (error) throw error;
      }
      const want = new Set(v.batches || []);
      const have = new Set(D.jb.filter((x) => x.job_id === id).map((x) => x.batch_id));
      const add = [...want].filter((b) => !have.has(b)).map((b) => ({ job_id: id, batch_id: b, plantation_id: D.plantation.id }));
      const del = [...have].filter((b) => !want.has(b));
      if (add.length) { const { error } = await sb.from('job_batches').insert(add); if (error) throw error; }
      if (del.length) { const { error } = await sb.from('job_batches').delete().eq('job_id', id).in('batch_id', del); if (error) throw error; }
      await refresh(isNew ? `${ref} saved` : 'Saved');
      if (isNew) location.hash = '#job-' + ref;
    }, isNew ? 'Save job' : 'Save changes');
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
    root.append(sec('Jobs in this payment'));
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
          await reloadAtts(); draw();
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
    const uid = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
    const path = `${D.plantation.id}/${entity}/${id}/${uid}.${ext}`;
    const up = await sb.storage.from('files').upload(path, blob, { contentType: type, upsert: false });
    if (up.error) throw up.error;
    const { error } = await sb.from('attachments').insert({ plantation_id: D.plantation.id, entity, entity_id: id, kind, storage_path: path, bytes: blob.size, created_by: D.me.id });
    if (error) { await sb.storage.from('files').remove([path]); throw error; }
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
        root.append(sec('Summary by buyer'));
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
    root.append(sec('Harvest picks'));
    root.append(h('div', { class: 'card table' },
      h('div', { class: 'jrow ghead' + (buyer ? ' sel' : '') }, buyer ? h('span', {}, '') : null, h('span', {}, 'Date'), h('span', {}, 'Pick'), h('span', { class: 'num' }, 'RM'), h('span', {}, 'Status')),
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
    root.append(sec('Payments received'));
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
      h('span', { class: 'gh' }, 'Grade'), h('span', { class: 'gh r' }, 'Fruit'), h('span', { class: 'gh r' }, 'RM each'), h('span', { class: 'gh r' }, 'RM'),
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
          else {
            const { data, error } = await sb.from('buyers').insert({ plantation_id: D.plantation.id, name: v.buyer }).select('id, name').single();
            if (error) throw error;
            row.buyer_id = data.id; row.buyer_name = data.name;
          }
        }
      }
      let id = k?.id, ref = k?.ref;
      if (isNew) {
        let tries = 0, res;
        do {
          ref = nextRef('HP-', D.picks.concat(tries ? [{ ref }] : []));
          res = await sb.from('harvest_picks').insert({ ...row, plantation_id: D.plantation.id, ref, created_by: D.me.id }).select('id').single();
          tries++;
        } while (res.error && /duplicate|unique/i.test(res.error.message) && tries < 4);
        if (res.error) throw res.error;
        id = res.data.id;
      } else {
        const { error } = await sb.from('harvest_picks').update(row).eq('id', id);
        if (error) throw error;
      }
      const want = new Set(v.batches || []);
      const have = new Set(D.pkb.filter((x) => x.pick_id === id).map((x) => x.batch_id));
      const add = [...want].filter((b) => !have.has(b)).map((b) => ({ pick_id: id, batch_id: b, plantation_id: D.plantation.id }));
      const del = [...have].filter((b) => !want.has(b));
      if (add.length) { const { error } = await sb.from('pick_batches').insert(add); if (error) throw error; }
      if (del.length) { const { error } = await sb.from('pick_batches').delete().eq('pick_id', id).in('batch_id', del); if (error) throw error; }
      await refresh(isNew ? `${ref} saved` : 'Saved');
      if (isNew) location.hash = '#pick-' + ref;
    }, isNew ? 'Save pick' : 'Save changes');
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
    root.append(sec('Picks in this payment'));
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

  // ---------- pages still to build ----------
  const later = (title, stage, what) => (root) => {
    setHead(title, 'Coming soon');
    root.append(h('div', { class: 'card soon' }, h('div', { class: 'h' }, `${title} is being built`), h('p', { class: 'muted' }, what), h('p', {}, pill(stage, 'gold'))));
  };
  PAGES.exp = later('Expense', 'Stage 4', 'Partners record what they paid from their own pocket (transport, meals and other costs) and claim it back.');
  PAGES.finance = later('Finance', 'Stage 5', 'Capital pool, purchases, where the money went, and profit shares.');
  PAGES.map = later('Map', 'Later stage', 'The plantation sketch with blok, peringkat and marks for issues, fences and water.');
  PAGES.reports = later('Reports', 'Stage 6', 'Excel and PDF reports saved for all partners, kept for 12 months.');

  // ================= START =================
  async function start() {
    show('loading', 'Loading', 'Getting your plantation');
    try { D = await loadAll(); }
    catch (e) { show('email', 'Sign in', 'Pineapple plantation records'); return showErr('page-err', 'Could not load your plantation: ' + friendly(e)); }
    if (!D) return show('email', 'Sign in', 'Pineapple plantation records');
    if (!D.me) { $('nm-email').textContent = D.user.email; return show('nomember', 'Almost there', 'Your email is not on a plantation yet'); }
    show('app', D.plantation.name, '');
    route();
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
