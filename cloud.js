'use strict';
/* Cloud sync. Plays always live on this iPad first (see app.js), so the app works with no connection.
   When a coach is signed in, this file copies changes to and from the shared Firebase database.
   If two iPads change the same play, the most recently saved copy wins. */
(function () {
  const cfg = window.FIREBASE_CONFIG;
  const status = text => { $('cloudStatus').textContent = text; };
  if (!cfg || !window.firebase) {
    status('Cloud sync is not set up yet. Plays are saved on this iPad only.');
    $('cloudBtn').hidden = true;
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth(), fs = firebase.firestore();
  // Keep a copy of the cloud data on the device and hold unsent changes until there is a connection.
  fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  let user = null, isStaff = false, stops = [];
  const lower = s => String(s || '').toLowerCase();
  const who = () => (user && (user.displayName || user.email)) || '';

  function showStatus() {
    if (!user) { status('Not signed in. Plays are saved on this iPad only.'); $('cloudBtn').textContent = 'Sign in to sync'; return; }
    $('cloudBtn').textContent = 'Sign out';
    if (!user.emailVerified) { status('Check your ves.org inbox, tap the link in the email, then sign in again.'); return; }
    const role = isStaff || PLAYERS_MODE ? '' : ' (view only: ask a coach to add you to the staff list)';
    status(navigator.onLine ? `Synced as ${who()}${role}` : `Offline as ${who()}. Changes will upload when you are back online.`);
  }
  addEventListener('online', showStatus);
  addEventListener('offline', showStatus);

  function stopListening() { for (const s of stops) s(); stops = []; }
  function denied(e) {
    if (e && e.code === 'permission-denied') status('This account is not allowed to see the playbook. Ask a coach to add you to the staff list.');
  }

  /* ---------- sending local changes up ---------- */
  function pushPlay(p) {
    return fs.collection('plays').doc(p.id).set({ json: JSON.stringify(p), name: p.name || '', updated: Number(p.updated) || Date.now(), team: !!p.team, deleted: false, by: user.email }).catch(denied);
  }
  function pushOverlay(o) {
    return fs.collection('overlays').doc(o.id).set({ json: JSON.stringify(o), updated: Number(o.updated) || Date.now(), deleted: false, by: user.email }).catch(denied);
  }
  function tombstone(col, id) { // a deleted item leaves a marker so other iPads delete their copy too
    return fs.collection(col).doc(id).set({ json: '', name: '', updated: Date.now(), team: false, deleted: true, by: user.email }).catch(denied);
  }
  function pushLib() {
    return fs.doc('library/shared').set({ json: JSON.stringify(lib), updated: Number(lib.updated) || Date.now(), by: user.email }).catch(denied);
  }
  onLocalChange = (op, name, v) => {
    if (!user || !isStaff || !user.emailVerified) return;
    if (op === 'lib') pushLib();
    else if (op === 'put') (name === 'plays' ? pushPlay : pushOverlay)(v);
    else if (op === 'del') tombstone(name, v);
  };

  /* ---------- bringing cloud changes down (staff) ---------- */
  // Shared by plays and overlays: apply what changed in the cloud, then on the first pass upload
  // anything this iPad has that the cloud does not.
  function listen(col, clean, push, after) {
    let first = true;
    const seen = new Map(); // id -> {updated, deleted} as last seen in the cloud
    stops.push(fs.collection(col).onSnapshot(async snap => {
      const local = new Map((await dbAll(col)).map(x => [x.id, x]));
      for (const ch of snap.docChanges()) {
        const id = ch.doc.id, d = ch.doc.data();
        if (ch.type === 'removed') { seen.delete(id); continue; }
        seen.set(id, { updated: Number(d.updated) || 0, deleted: !!d.deleted });
        if (ch.doc.metadata.hasPendingWrites) continue; // our own change, not yet confirmed
        const mine = local.get(id), mineAt = mine ? Number(mine.updated) || 0 : -1;
        if (d.deleted) {
          if (mine && mineAt <= d.updated) { await dbDel(col, id, true); local.delete(id); }
        } else if (d.updated > mineAt) {
          let item = null;
          try { item = clean(JSON.parse(d.json)); } catch (e) { /* skip a damaged entry */ }
          if (item) { item.id = id; item.updated = Number(d.updated); await dbPut(col, item, true); local.set(id, item); }
        }
      }
      if (first) {
        first = false;
        for (const [id, mine] of local) {
          const c = seen.get(id);
          if (!c || (Number(mine.updated) || 0) > c.updated) push(mine);
        }
      }
      after([...local.values()]);
    }, denied));
  }

  function startStaff() {
    listen('plays', cleanPlay, pushPlay, () => { if (!$('playbook').hidden) renderPlaybook(); });
    listen('overlays', cleanOverlay, pushOverlay, list => {
      customOverlays = list.map(cleanOverlay);
      fillOverlays(gOvl, state);
      if (!$('overlayPanel').hidden) renderOverlayList();
    });
    let first = true;
    stops.push(fs.doc('library/shared').onSnapshot(doc => {
      const d = doc.data();
      const mineAt = Number(lib.updated) || 0;
      if (d && !doc.metadata.hasPendingWrites && d.updated > mineAt) {
        try { lib = cleanLib(JSON.parse(d.json)); lib.updated = Number(d.updated); saveLib(true); } catch (e) { /* keep ours */ }
        if (!$('overlayPanel').hidden) renderOverlayList();
        if (!$('piecesPanel').hidden) renderAligns();
      } else if (first && (lib.sets.length || lib.aligns.length) && (!d || mineAt > d.updated)) pushLib();
      first = false;
    }, denied));
  }

  /* ---------- view only: players, and anyone not on the staff list ---------- */
  function startViewer() {
    stops.push(fs.collection('plays').where('team', '==', true).onSnapshot(snap => {
      teamPlays = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (d.deleted) return;
        try { const p = cleanPlay(JSON.parse(d.json)); if (p) { p.id = 't-' + doc.id; teamPlays.push(p); } } catch (e) { /* skip */ }
      });
      if (!$('playbook').hidden) renderPlaybook();
    }, denied));
    stops.push(fs.collection('overlays').onSnapshot(snap => {
      const mine = new Set(customOverlays.map(o => o.id));
      teamOverlays = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (d.deleted || mine.has(doc.id)) return;
        try { const o = cleanOverlay(JSON.parse(d.json)); o.id = doc.id; teamOverlays.push(o); } catch (e) { /* skip */ }
      });
      fillOverlays(gOvl, state);
    }, denied));
  }

  auth.onAuthStateChanged(async u => {
    stopListening();
    user = u; isStaff = false;
    if (u && !/@ves\.org$/i.test(u.email || '')) {
      await auth.signOut();
      status('Please sign in with your ves.org account.');
      return;
    }
    if (!u || !u.emailVerified) { showStatus(); return; }
    try {
      const snap = await fs.doc('config/staff').get();
      const emails = ((snap.data() || {}).emails || []).map(lower);
      isStaff = emails.includes(lower(u.email));
      try { localStorage.setItem('wb.staff', isStaff ? lower(u.email) : ''); } catch (e) { /* ignore */ }
    } catch (e) { // offline with nothing cached: trust what we learned last time on this iPad
      try { isStaff = localStorage.getItem('wb.staff') === lower(u.email); } catch (e2) { isStaff = false; }
    }
    showStatus();
    if (isStaff && !PLAYERS_MODE) startStaff(); else startViewer();
  });

  /* ---------- sign-in dialog ---------- */
  const msg = text => { $('signMsg').textContent = text; };
  function explain(e) {
    const code = (e && e.code) || '';
    if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) return 'That email and password do not match an account.';
    if (code.includes('email-already-in-use')) return 'There is already an account for that email. Use Sign in.';
    if (code.includes('weak-password')) return 'Choose a password with at least 6 characters.';
    if (code.includes('network-request-failed')) return 'No connection. Sign in when you are online.';
    if (code.includes('popup')) return 'The Google window did not open. Use your ves.org email and a password below instead.';
    return 'Sign-in did not work. Try the email and password option below.';
  }
  $('cloudBtn').addEventListener('click', () => {
    if (user) { auth.signOut(); return; }
    msg(''); $('signin').hidden = false;
  });
  $('signClose').addEventListener('click', () => { $('signin').hidden = true; });
  $('signGoogle').addEventListener('click', async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ hd: 'ves.org' });
      await auth.signInWithPopup(provider);
      $('signin').hidden = true;
    } catch (e) { msg(explain(e)); }
  });
  const creds = () => [$('signEmail').value.trim(), $('signPass').value];
  $('signForm').addEventListener('submit', async e => {
    e.preventDefault();
    const [email, pass] = creds();
    try {
      const res = await auth.signInWithEmailAndPassword(email, pass);
      if (!res.user.emailVerified) { res.user.sendEmailVerification().catch(() => {}); msg('Almost there. Tap the link we emailed you, then sign in again.'); return; }
      $('signin').hidden = true;
    } catch (err) { msg(explain(err)); }
  });
  $('signCreate').addEventListener('click', async () => {
    const [email, pass] = creds();
    if (!/@ves\.org$/i.test(email)) { msg('Use your ves.org email address.'); return; }
    try {
      const res = await auth.createUserWithEmailAndPassword(email, pass);
      await res.user.sendEmailVerification();
      msg('Account created. Tap the link we emailed you, then come back and sign in.');
    } catch (err) { msg(explain(err)); }
  });
})();
