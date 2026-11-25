'use strict';
/* Cloud sync with Supabase. Plays always live on this iPad first (see app.js), so the app works with
   no connection. When a coach is signed in and online, sync() compares this iPad with the shared
   table and copies whichever side is newer. If two iPads change the same play, the latest save wins. */
(function () {
  const cfg = window.SUPABASE_CONFIG;
  const status = text => { $('cloudStatus').textContent = text; };
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) {
    status('Cloud sync is not set up yet. Plays are saved on this iPad only.');
    $('cloudBtn').hidden = true;
    return;
  }

  const sb = supabase.createClient(cfg.url, cfg.anonKey);
  const TABLE = 'wb_items';
  const KINDS = { plays: 'play', overlays: 'overlay' }; // local store name -> kind column
  let user = null, isStaff = false, busy = false, again = false, timer = 0, lastError = '';

  /* Deletes made on this iPad are remembered until they have been sent, so other iPads delete too. */
  const readDeleted = () => { try { return JSON.parse(localStorage.getItem('wb.deleted') || '{}'); } catch (e) { return {}; } };
  const writeDeleted = d => { try { localStorage.setItem('wb.deleted', JSON.stringify(d)); } catch (e) { /* ignore */ } };

  function showStatus() {
    if (!user) { status('Not signed in. Plays are saved on this iPad only.'); $('cloudBtn').textContent = 'Sign in to sync'; return; }
    $('cloudBtn').textContent = 'Sign out';
    const who = user.email || '';
    if (!navigator.onLine) { status(`Offline as ${who}. Changes will upload when you are back online.`); return; }
    if (lastError) { status(`Signed in as ${who}, but syncing failed: ${lastError}`); return; }
    const role = isStaff || PLAYERS_MODE ? '' : ' (view only: ask a coach to add you to the staff list)';
    status(`Synced as ${who}${role}`);
  }

  function schedule(ms) { clearTimeout(timer); timer = setTimeout(sync, ms == null ? 1500 : ms); }
  onLocalChange = (op, name, v) => {
    if (op === 'del' && KINDS[name]) { const d = readDeleted(); d[KINDS[name] + ':' + v] = Date.now(); writeDeleted(d); }
    schedule();
  };
  addEventListener('online', () => { showStatus(); schedule(200); });
  addEventListener('offline', showStatus);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(200); });
  setInterval(() => { if (!document.hidden) sync(); }, 60000);

  const rowFor = (kind, item) => ({
    kind, id: item.id, data: item, name: item.name || '', team: kind === 'play' && !!item.team,
    deleted: false, updated: Number(item.updated) || Date.now(), updated_by: user.email,
  });
  const fail = error => { throw new Error(error.message || 'the database refused the request'); };

  async function fetchData(ids) { // full rows for the given "kind:id" keys, 100 at a time
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      const { data, error } = await sb.from(TABLE).select('kind,id,data,updated').in('id', part.map(k => k.slice(k.indexOf(':') + 1)));
      if (error) fail(error);
      out.push(...data.filter(r => part.includes(r.kind + ':' + r.id)));
    }
    return out;
  }

  async function syncStaff() {
    const { data: remote, error } = await sb.from(TABLE).select('kind,id,updated,deleted');
    if (error) fail(error);
    const cloud = new Map(remote.map(r => [r.kind + ':' + r.id, r]));
    const deleted = readDeleted();
    const local = new Map(); // "kind:id" -> item
    for (const name in KINDS) for (const it of await dbAll(name)) local.set(KINDS[name] + ':' + it.id, it);
    const storeOf = kind => (kind === 'play' ? 'plays' : 'overlays');
    const up = [], want = [];
    let changed = false;

    for (const [key, r] of cloud) {
      const [kind] = key.split(':'), mine = local.get(key), at = Number(r.updated) || 0;
      if (kind === 'library') continue;
      if (r.deleted) {
        if (mine && (Number(mine.updated) || 0) <= at) { await dbDel(storeOf(kind), r.id, true); local.delete(key); changed = true; }
        delete deleted[key];
      } else if (deleted[key] && deleted[key] >= at) {
        up.push({ kind, id: r.id, data: null, name: '', team: false, deleted: true, updated: deleted[key], updated_by: user.email });
      } else if (!mine || at > (Number(mine.updated) || 0)) {
        want.push(key); delete deleted[key];
      }
    }
    for (const [key, mine] of local) {
      const r = cloud.get(key), kind = key.split(':')[0];
      if (!r || (Number(mine.updated) || 0) > (Number(r.updated) || 0)) up.push(rowFor(kind, mine));
    }
    for (const key in deleted) if (!cloud.has(key)) delete deleted[key]; // never reached the cloud: nothing to tell it

    for (const r of await fetchData(want)) {
      const item = r.kind === 'play' ? cleanPlay(r.data) : cleanOverlay(r.data || {});
      if (!item) continue;
      item.id = r.id; item.updated = Number(r.updated);
      await dbPut(storeOf(r.kind), item, true); changed = true;
    }

    // shared alignments and overlay sets: one row, latest wins
    const libRow = cloud.get('library:shared'), libAt = Number(lib.updated) || 0;
    if (libRow && Number(libRow.updated) > libAt) {
      const { data, error: e2 } = await sb.from(TABLE).select('data,updated').eq('kind', 'library').eq('id', 'shared');
      if (e2) fail(e2);
      if (data[0]) { lib = cleanLib(data[0].data); lib.updated = Number(data[0].updated); saveLib(true); changed = true; }
    } else if ((lib.sets.length || lib.aligns.length) && (!libRow || libAt > Number(libRow.updated))) {
      up.push({ kind: 'library', id: 'shared', data: lib, name: '', team: false, deleted: false, updated: libAt || Date.now(), updated_by: user.email });
    }

    for (let i = 0; i < up.length; i += 50) {
      const { error: e3 } = await sb.from(TABLE).upsert(up.slice(i, i + 50));
      if (e3) fail(e3);
    }
    for (const r of up) if (r.deleted) delete deleted[r.kind + ':' + r.id];
    writeDeleted(deleted);

    if (changed) {
      customOverlays = (await dbAll('overlays')).map(cleanOverlay);
      fillOverlays(gOvl, state);
      if (!$('playbook').hidden) renderPlaybook();
      if (!$('overlayPanel').hidden) renderOverlayList();
      if (!$('piecesPanel').hidden) renderAligns();
    }
  }

  async function syncViewer() { // players, and anyone not on the staff list: read what they are allowed to see
    const { data, error } = await sb.from(TABLE).select('kind,id,data,updated,deleted,team');
    if (error) fail(error);
    const mine = new Set(customOverlays.map(o => o.id));
    teamPlays = teamPlays.filter(p => p.fromFile); teamOverlays = teamOverlays.filter(o => o.fromFile); // keep any from team-playbook.json
    for (const r of data) {
      if (r.deleted || !r.data) continue;
      if (r.kind === 'play' && r.team) { const p = cleanPlay(r.data); if (p) { p.id = 't-' + r.id; teamPlays.push(p); } }
      if (r.kind === 'overlay' && !mine.has(r.id)) { const o = cleanOverlay(r.data); o.id = r.id; teamOverlays.push(o); }
    }
    fillOverlays(gOvl, state);
    if (!$('playbook').hidden) renderPlaybook();
  }

  async function sync() {
    if (!user || !navigator.onLine) { showStatus(); return; }
    if (busy) { again = true; return; }
    busy = true;
    try {
      if (isStaff && !PLAYERS_MODE) await syncStaff(); else await syncViewer();
      lastError = '';
    } catch (e) {
      lastError = /fetch|network/i.test(e.message) ? 'no connection to the database' : e.message;
    }
    busy = false;
    showStatus();
    if (again) { again = false; schedule(300); }
  }

  async function setUser(u) {
    user = u || null; isStaff = false; lastError = '';
    if (!user) { showStatus(); return; }
    const key = 'wb.staff';
    try {
      const { data, error } = await sb.rpc('wb_is_staff');
      if (error) throw error;
      isStaff = data === true;
      try { localStorage.setItem(key, isStaff ? user.email : ''); } catch (e) { /* ignore */ }
    } catch (e) { // offline: trust what we learned last time on this iPad
      try { isStaff = localStorage.getItem(key) === user.email; } catch (e2) { isStaff = false; }
    }
    showStatus();
    sync();
  }
  sb.auth.getSession().then(({ data }) => setUser(data && data.session && data.session.user));
  sb.auth.onAuthStateChange((event, session) => {
    const next = session && session.user;
    if ((next && next.id) !== (user && user.id)) setTimeout(() => setUser(next), 0);
  });

  /* ---------- sign-in dialog ---------- */
  const msg = text => { $('signMsg').textContent = text; };
  $('cloudBtn').addEventListener('click', async () => {
    if (user) { await sb.auth.signOut(); return; }
    msg(''); $('signin').hidden = false; $('signEmail').focus();
  });
  $('signClose').addEventListener('click', () => { $('signin').hidden = true; });
  $('signForm').addEventListener('submit', async e => {
    e.preventDefault();
    msg('Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email: $('signEmail').value.trim(), password: $('signPass').value });
    if (error) {
      msg(/fetch|network/i.test(error.message) ? 'No connection. Sign in when you are online.' : 'That email and password do not match an account.');
      return;
    }
    $('signPass').value = '';
    $('signin').hidden = true;
  });
})();
