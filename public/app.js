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
    const [pl, members, priv, blocks, batches, bb, jobs, jb, receipts, uses, grants, agencies, alerts] = await Promise.all([
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
      q('alerts', 'id, ref, type, location, urgency, status').neq('status', 'Closed')
    ]);
    const bad = [pl, members, priv, blocks, batches, bb, jobs, jb, receipts, uses, grants, agencies, alerts].find((r) => r.error);
    if (bad) throw bad.error;
    return {
      user, me, isAdmin: me.role === 'admin', plantation: pl.data,
      members: members.data, priv: Object.fromEntries(priv.data.map((r) => [r.member_id, r])),
      blocks: blocks.data, batches: batches.data, bb: bb.data, jobs: jobs.data, jb: jb.data,
      receipts: receipts.data, uses: uses.data, grants: grants.data, agencies: agencies.data, alerts: alerts.data
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
    const tab = TABS[name] || (name === 'p' ? 'status' : '');
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
  // fields: {key,label,type:'text'|'email'|'tel'|'number'|'date'|'select'|'textarea'|'head'|'note',value,options,ph,mode,note,required,list}
  function openSheet(title, fields, onSave, saveLabel = 'Save') {
    const f = $('sheet');
    f.replaceChildren();
    f.append(h('div', { class: 'h sheet-title' }, title));
    const inputs = {};
    for (const fd of fields) {
      if (fd.type === 'head') { f.append(h('div', { class: 'h sheet-head' }, fd.label)); continue; }
      if (fd.type === 'note') { f.append(h('div', { class: 'note-box' }, fd.label)); continue; }
      const id = 'f_' + fd.key;
      let input;
      if (fd.type === 'select') input = h('select', { id }, fd.options.map((o) => h('option', { value: o[0], selected: String(o[0]) === String(fd.value ?? '') }, o[1])));
      else if (fd.type === 'textarea') input = h('textarea', { id, rows: 3, placeholder: fd.ph || '' });
      else input = h('input', { id, type: fd.type || 'text', inputmode: fd.mode, placeholder: fd.ph || '', autocomplete: 'off', list: fd.list ? id + '_l' : null, step: fd.type === 'number' ? 'any' : null });
      if (fd.type !== 'select') input.value = fd.value ?? '';
      inputs[fd.key] = input;
      f.append(h('label', { class: 'field', for: id }, h('span', {}, fd.label, fd.required ? ' *' : ''), input,
        fd.list ? h('datalist', { id: id + '_l' }, fd.list.map((v) => h('option', { value: v }))) : null,
        fd.note ? h('small', {}, fd.note) : null));
    }
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    const save = h('button', { class: 'btn primary', type: 'submit' }, saveLabel);
    f.append(err, h('div', { class: 'sheet-btns' }, h('button', { class: 'btn ghost', type: 'button', onclick: closeSheet }, 'Cancel'), save));
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.hidden = true;
      const vals = {};
      for (const fd of fields) {
        if (!inputs[fd.key]) continue;
        let v = inputs[fd.key].value.trim();
        if (fd.required && !v) { err.textContent = `Please fill in ${fd.label}.`; err.hidden = false; inputs[fd.key].focus(); return; }
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
    document.body.classList.add('sheet-open');
    const first = Object.values(inputs)[0];
    if (first && matchMedia('(min-width: 700px)').matches) first.focus();
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
    const toEnter = D.jobs.filter((j) => j.price == null && j.status !== 'Planned').length + 0;
    root.append(h('div', { class: 'kpis' },
      kpi('Plants', fmt(plants), `${D.batches.length} peringkat`, '#status'),
      kpi('Area', `${Number(D.plantation.area_acres || 0).toFixed(2)} ac`, `${D.blocks.length} blok`, '#status'),
      kpi('Partners', fmt(D.members.filter((m) => m.active).length), D.isAdmin ? 'Tap to add' : 'In this plantation', '#partners'),
      kpi('Jobs recorded', fmt(D.jobs.length), toEnter ? `${toEnter} need contractor and cost` : 'All costs entered', '#status')));
    const upcoming = D.jobs.filter((j) => ['Planned', 'Quoted', 'In progress'].includes(j.status));
    root.append(sec('Coming up'));
    root.append(card(upcoming.length ? upcoming.map((j) => {
      const names = D.jb.filter((x) => x.job_id === j.id).map((x) => D.batches.find((b) => b.id === x.batch_id)).filter(Boolean).map((b) => 'P' + b.no);
      return h('div', { class: 'trow' }, h('span', { class: 'dot gold' }), h('span', { class: 'lmain' }, h('b', {}, j.category), h('small', {}, `${j.start_on ? dstr(j.start_on) : j.date_note || 'Date to set'} · ${names.join(', ')}${j.note ? ' · ' + j.note : ''}`)), pill(j.status, 'gold'));
    }) : h('p', { class: 'muted' }, 'Nothing planned yet.')));
    root.append(h('div', { class: 'card note' }, h('p', {}, h('strong', {}, 'Being built: '), 'Jobs, Sales, Expense, Finance and Map are coming next, in that order. Everything you see here is your real plantation data.')));
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
      return h('div', { class: 'trow' },
        h('span', { class: 'mark ' + (done ? 'done' : 'todo') }, done ? '✓' : '○'),
        h('span', { class: 'lmain' }, h('b', {}, j.category), h('small', {}, `${j.ref} · ${j.start_on ? dstr(j.start_on) : j.date_note || 'Date to set'}${j.products ? ' · ' + j.products : ''}${j.method ? ' · ' + j.method : ''}`)),
        h('span', { class: 'lright' }, j.price != null ? rm(j.price) : done ? pill('Cost to enter', 'amber') : pill(j.status, 'gold')));
    }) : h('p', { class: 'muted' }, 'No work recorded yet.')));
    root.append(h('p', { class: 'muted small foot' }, 'Recording new jobs, contractors and costs comes in the next stage (Jobs).'));
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
        { key: 'joined_on', label: 'Joined on', type: 'date', value: m?.joined_on || (isNew ? new Date().toISOString().slice(0, 10) : '') },
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

  // ---------- pages still to build ----------
  const later = (title, stage, what) => (root) => {
    setHead(title, 'Coming soon');
    root.append(h('div', { class: 'card soon' }, h('div', { class: 'h' }, `${title} is being built`), h('p', { class: 'muted' }, what), h('p', {}, pill(stage, 'gold'))));
  };
  PAGES.jobs = later('Jobs', 'Stage 2', 'Record work by contractors on one or more peringkat, with products, method, photos and receipts, then pay contractors.');
  PAGES.sales = later('Sales', 'Stage 3', 'Record each harvest pick by grade and price, and the money received from buyers.');
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
