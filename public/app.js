// LadangKita – Stage 1: email-code sign-in, link login to partner record, show the plantation.
{
  const sb = window.supabase.createClient(LK_CONFIG.supabaseUrl, LK_CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const $ = (id) => document.getElementById(id);
  const views = ['loading', 'email', 'code', 'nomember', 'home'];
  const fmt = (n) => Number(n || 0).toLocaleString('en-MY');
  let pendingEmail = '';
  let resendAt = 0;

  function show(name, title, subtitle) {
    for (const v of views) $('v-' + v).hidden = v !== name;
    $('title').textContent = title;
    $('subtitle').textContent = subtitle;
    hideErr('page-err');
  }
  function showErr(id, msg) { const e = $(id); e.textContent = msg; e.hidden = false; }
  function hideErr(id) { $(id).hidden = true; }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

  function friendly(err) {
    const m = (err && (err.message || err.error_description)) || String(err);
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many codes asked for. Please wait a few minutes, then try again.';
    if (/expired|invalid|otp/i.test(m)) return 'That code is wrong or has expired. Check the latest email, or send a new code.';
    if (/fetch|network|failed to/i.test(m)) return 'No internet connection. Please check your signal and try again.';
    return m;
  }

  // ---------- sign in: step 1, email ----------
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

  // ---------- sign in: step 2, code ----------
  $('code').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (e.target.value.length === 6) $('f-code').requestSubmit();
  });

  $('f-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErr('code-err');
    const token = $('code').value.trim();
    if (!/^\d{6}$/.test(token)) return showErr('code-err', 'The code has 6 digits.');
    const btn = $('code-btn');
    busy(btn, true, 'Checking…');
    const { error } = await sb.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
    busy(btn, false, 'Sign in');
    if (error) return showErr('code-err', friendly(error));
    try { localStorage.removeItem('lk_pending_email'); } catch (_) {}
    await loadPlantation();
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

  for (const b of document.querySelectorAll('[data-signout]')) {
    b.addEventListener('click', async () => {
      await sb.auth.signOut();
      $('email').value = '';
      show('email', 'Sign in', 'Pineapple plantation records');
    });
  }
  $('recheck').addEventListener('click', () => loadPlantation());

  // ---------- after sign-in: link login, then load plantation ----------
  async function loadPlantation() {
    show('loading', 'Loading', 'Getting your plantation');
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return show('email', 'Sign in', 'Pineapple plantation records');

    // Link this login to a partner record with the same email (first sign-in only). Separate request, so the next reads see it.
    const claim = await sb.rpc('claim_membership');
    if (claim.error) console.warn('claim_membership', claim.error);

    const { data: mems, error } = await sb.from('members')
      .select('id, display_name, role, plantation_id, plantations(name, area_acres)')
      .eq('user_id', user.id).eq('active', true).limit(1);
    if (error) return pageError(error);
    if (!mems || !mems.length) {
      $('nm-email').textContent = user.email;
      return show('nomember', 'Almost there', 'Your email is not on a plantation yet');
    }
    const me = mems[0];
    const p = me.plantation_id;
    const [blocks, links, batches] = await Promise.all([
      sb.from('blocks').select('id, name, notes, sort').eq('plantation_id', p).order('sort'),
      sb.from('batch_blocks').select('block_id, batch_id, plants').eq('plantation_id', p),
      sb.from('batches').select('id, plants').eq('plantation_id', p)
    ]);
    const bad = blocks.error || links.error || batches.error;
    if (bad) return pageError(bad);

    const totalPlants = batches.data.reduce((s, b) => s + b.plants, 0);
    $('h-name').textContent = me.display_name;
    $('h-role').textContent = me.role === 'admin' ? 'Admin partner' : 'Partner';
    const kpis = [
      ['Plants', fmt(totalPlants)],
      ['Area', `${Number(me.plantations.area_acres).toFixed(2)} ac`],
      ['Blok', fmt(blocks.data.length)],
      ['Peringkat', fmt(batches.data.length)]
    ];
    $('h-kpis').replaceChildren(...kpis.map(([l, v]) => {
      const d = document.createElement('div'); d.className = 'kpi';
      const a = document.createElement('div'); a.className = 'l'; a.textContent = l;
      const b = document.createElement('div'); b.className = 'v'; b.textContent = v;
      d.append(a, b); return d;
    }));
    $('h-blocks').replaceChildren(...blocks.data.map((bk) => {
      const mine = links.data.filter((x) => x.block_id === bk.id);
      const plants = mine.reduce((s, x) => s + x.plants, 0);
      const row = document.createElement('div'); row.className = 'blk';
      const left = document.createElement('div');
      const n = document.createElement('div'); n.className = 'n'; n.textContent = bk.name;
      const s = document.createElement('div'); s.className = 's';
      s.textContent = `${mine.length} peringkat${bk.notes ? ' · ' + bk.notes : ''}`;
      left.append(n, s);
      const r = document.createElement('div'); r.className = 'p'; r.textContent = `${fmt(plants)} plants`;
      row.append(left, r); return row;
    }));
    show('home', me.plantations.name, `${me.role === 'admin' ? 'Admin' : 'Partner'} · ${user.email}`);
  }

  function pageError(err) {
    show('email', 'Sign in', 'Pineapple plantation records');
    showErr('page-err', 'Could not load your plantation: ' + friendly(err));
  }

  // ---------- start ----------
  (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return loadPlantation();
    let saved = '';
    try { saved = localStorage.getItem('lk_pending_email') || ''; } catch (_) {}
    if (saved) {
      pendingEmail = saved;
      $('code-to').textContent = saved;
      show('code', 'Check your email', 'Enter the code we sent you');
    } else {
      show('email', 'Sign in', 'Pineapple plantation records');
    }
  })();
}
