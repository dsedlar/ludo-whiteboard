'use strict';
/* FastDraw (.fdb) import.

   FastDraw does not publish its file format, so this reader was worked out from sample files.
   What it relies on:
   - A library file starts with an index of names (UTF-16 text), followed by one record per play.
   - Each play record holds its id, name, playbook and series ids, then a list of frames.
   - Each frame holds the part of the court it shows, its notes, and a list of items. Positions are in
     feet: x across the floor (0-50), y from the baseline out.
   - Items are players, lines (cut, dribble, pass, screen as straight, curved or freehand), cones,
     shaded shapes and text boxes. An item may be preceded by a color.
   Anything it does not recognise is skipped and counted, never guessed at silently.

   parseFastDraw(arrayBuffer, { fx, fy, uid }) returns { plays, report }. */

function parseFastDraw(buf, env) {
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), N = b.length;
  const { fx, fy, uid } = env;
  const utf8 = new TextDecoder('utf-8');
  if (N < 20 || utf8.decode(b.subarray(0, 8)) !== 'FastDraw') throw new Error('not a FastDraw file');

  /* ---------- low-level reading ---------- */
  let i = 0;
  const need = n => { if (i + n > N) throw new Error('ran past the end of the file'); };
  const u8 = () => { need(1); return b[i++]; };
  const u16 = () => { need(2); const v = dv.getUint16(i); i += 2; return v; };
  const u32at = at => dv.getUint32(at);
  const f64 = () => { need(8); const v = dv.getFloat64(i); i += 8; return v; };
  const f32 = () => { need(4); const v = dv.getFloat32(i); i += 4; return v; };
  const str = () => { // length-prefixed text; a length of 0xffff means "no value"
    const n = u16();
    if (n === 0xffff) return null;
    need(n);
    const s = utf8.decode(b.subarray(i, i + n)); i += n;
    return s;
  };
  const isCoord = at => { // does a plausible court coordinate (a double between -60 and 160) start here?
    if (at + 8 > N) return false;
    const c = b[at];
    if (c !== 0x40 && c !== 0xc0 && c !== 0x3f && c !== 0xbf) return false;
    const d = dv.getFloat64(at);
    return d > -60 && d < 160;
  };
  const allZero = (at, n) => { for (let k = 0; k < n; k++) if (b[at + k] !== 0) return false; return at + n <= N; };
  const printable = (at, n) => { if (at + n > N || n < 1) return false; for (let k = 0; k < n; k++) { const c = b[at + k]; if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) return false; } return true; };
  const isUuidAt = at => {
    if (at + 38 > N || b[at] !== 0 || b[at + 1] !== 36) return false;
    for (let k = 0; k < 36; k++) {
      const c = b[at + 2 + k], dash = k === 8 || k === 13 || k === 18 || k === 23;
      if (dash ? c !== 45 : !((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) return false;
    }
    return true;
  };

  /* ---------- where the play records are ---------- */
  // A record is: play id, name, a spare text, playbook id, series id. Finding that shape is more
  // dependable than relying on the few bytes in front of it.
  const starts = [];
  for (let at = 0; at + 120 < N; at++) {
    if (b[at + 1] !== 36 || !isUuidAt(at)) continue;
    let p = at + 38;
    const nameLen = dv.getUint16(p);
    if (nameLen > 300 || (nameLen && !printable(p + 2, nameLen))) continue;
    p += 2 + nameLen;
    const spare = dv.getUint16(p);
    if (spare > 300) continue;
    p += 2 + spare;
    const okId = q => isUuidAt(q) || (b[q] === 0 && b[q + 1] === 0);
    if (!okId(p)) continue;
    p += isUuidAt(p) ? 38 : 2;
    if (!okId(p)) continue;
    starts.push(at);
    at = p;
  }
  if (!starts.length) throw new Error('no plays found in this file');

  /* ---------- the index: names of playbooks and series ---------- */
  const names = {}; // id -> text
  (function readIndex() {
    const limit = starts[0];
    const tab = [], posOf = new Map(), endOf = [];
    const utf16 = (at, n) => { let s = ''; for (let k = 0; k < n; k++) s += String.fromCharCode(dv.getUint16(at + 2 * k)); return s; };
    for (let at = 0; at + 9 < limit;) { // entries are numbered 0, 1, 2 ... in order, which makes them easy to find
      if (b[at] === 0 && u32at(at + 1) === tab.length) {
        const len = u32at(at + 5);
        if (len < 400 && at + 9 + 2 * len <= limit) {
          let ok = true;
          for (let k = 0; k < len && ok; k++) { const c = dv.getUint16(at + 9 + 2 * k); if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) ok = false; }
          if (ok) { posOf.set(at, tab.length); tab.push(utf16(at + 9, len)); endOf.push(at + 9 + 2 * len); at = endOf[endOf.length - 1]; continue; }
        }
      }
      at++;
    }
    const isId = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
    const ids = []; tab.forEach((s, k) => { if (isId(s)) ids.push(k); });
    const textKey = tab.indexOf('text');
    if (textKey < 0) return;
    const tokenAt = at => { // a text entry, or a back-reference to one
      if (posOf.has(at)) { const k = posOf.get(at); return { id: k, next: endOf[k] }; }
      if (b[at] === 1 && at + 5 <= limit) { const k = u32at(at + 1); if (k < tab.length) return { id: k, next: at + 5 }; }
      return null;
    };
    ids.forEach((k, n) => {
      const from = endOf[k], to = n + 1 < ids.length ? endOf[ids[n + 1]] - 80 : limit;
      for (let at = from; at < to; at++) {
        const key = tokenAt(at);
        if (!key || key.id !== textKey) continue;
        const val = tokenAt(key.next);
        if (val && tab[val.id]) { names[tab[k]] = tab[val.id]; break; }
      }
    });
  })();

  /* ---------- line types, worked out from the notes on sample plays ---------- */
  const STYLE = {
    0x9b: 'cut', 0x9c: 'dribble', 0x9d: 'pass', 0x9e: 'screen',           // straight
    0x6f: 'cut', 0x70: 'dribble', 0x71: 'pass', 0x72: 'screen',           // one bend (curve)
    0x65: 'cut', 0x66: 'dribble', 0x68: 'cut', 0x69: 'dribble', 0x74: 'cut', // multi-point
    0xbf: 'cut', 0xc0: 'pass', 0xc1: 'screen', 0xc2: 'dribble',           // freehand
  };
  const TRUE_CURVE4 = new Set([0x74]); // four points that form one smooth curve
  const report = { plays: 0, frames: 0, skippedItems: 0, textBoxes: 0, unknown: {}, guessedLines: {}, partial: [] };
  const noteUnknown = key => { report.unknown[key] = (report.unknown[key] || 0) + 1; report.skippedItems++; };

  /* ---------- reading one frame's items ---------- */
  function readItems(count) {
    const items = [];
    for (let c = 0; c < count; c++) {
      let color = null;
      if (b[i] === 0 && b[i + 1] === 1 && !isCoord(i + 2)) { i += 2; need(4); color = '#' + [1, 2, 3].map(k => b[i + k].toString(16).padStart(2, '0')).join(''); i += 4; }
      const type = u8(), code = u8();
      if (type === 1 && code === 0x40) {            // player
        const label = str() || ''; const x = f64(), y = f64(); f64(); const ball = u8(); u8();
        items.push({ k: 'player', label, x, y, ball: ball === 1, color });
      } else if (type === 1 && code === 0x3e) {     // text box
        f64(); const x = f64(), y = f64(); const html = str() || ''; f64(); f32(); str();
        items.push({ k: 'text', x, y, html });
      } else if (type === 1 && code === 0x91) {     // four-cornered shaded area
        const v = []; for (let k = 0; k < 8; k++) v.push(f64());
        items.push({ k: 'poly', pts: [[v[0], v[1]], [v[2], v[3]], [v[4], v[5]], [v[6], v[7]]], color });
      } else if (type === 1 && (code === 0x92 || code === 0x93)) { // oval or box, given as x, y, width, height
        const x = f64(), y = f64(), w = f64(), h = f64();
        items.push({ k: code === 0x92 ? 'oval' : 'box', x, y, w, h, color });
      } else if (type === 0 && b[i] === 0 && b[i + 1] < 60 && isCoord(i + 2) && isCoord(i + 10) && b[i + 18] <= 2) { // freehand path
        const n = u16(), start = [f64(), f64()], segs = [];
        for (let k = 0; k < n; k++) {
          const kind = u8();
          if (kind > 2) throw new Error('unreadable path');
          const pts = []; for (let m = 0; m <= kind; m++) pts.push([f64(), f64()]);
          segs.push(pts);
        }
        items.push({ k: 'path', code, start, segs, color });
      } else if (type === 0 && allZero(i, 8) && isCoord(i + 8) && isCoord(i + 16)) { // a single-point marker
        i += 8; const x = f64(), y = f64();
        items.push({ k: 'marker', code, x, y });
      } else if (type === 0 && isCoord(i)) {         // straight or bent line: a run of points
        const pts = [];
        while (isCoord(i) && isCoord(i + 8)) pts.push([f64(), f64()]);
        if (pts.length < 2) throw new Error('unreadable line');
        items.push({ k: 'line', code, pts, color });
      } else {
        const key = type.toString(16).padStart(2, '0') + code.toString(16).padStart(2, '0');
        throw Object.assign(new Error('unknown item'), { unknownKey: key });
      }
    }
    return items;
  }

  const frameStartsAt = at => at + 35 <= N && b[at] === 1 && b[at + 1] === 0 && b[at + 2] >= 1 && b[at + 2] <= 9 &&
    (() => { const w = dv.getFloat64(at + 19), h = dv.getFloat64(at + 27); return w >= 40 && w <= 70 && h >= 30 && h <= 130; })();

  function readFrame(end) {
    need(39);
    i += 2; const courtType = u8();
    const view = { ox: f64(), oy: f64(), w: f64(), h: f64() };
    i += 4;
    const notes = str() || '';
    let title = '';
    for (;;) { // optional texts (a spare one and the frame's title) sit between the notes and the item count
      if (i + 2 > end) break;
      const len = dv.getUint16(i);
      if (len === 0xffff) { i += 2; continue; }
      if (len > 0 && len < 400 && b[i + 2] > 1 && printable(i + 2, len)) { title = str() || title; continue; }
      if (len === 0) { // an empty text, or an item count of zero?
        if (i + 2 >= end || frameStartsAt(i + 2)) break;
        i += 2; continue;
      }
      break;
    }
    const count = u16();
    const frame = { courtType, view, notes, title, items: [], complete: true };
    const before = i;
    try { frame.items = readItems(count); }
    catch (e) { frame.complete = false; if (e.unknownKey === '0000') { /* padding at the end of the file */ } else if (e.unknownKey) noteUnknown(e.unknownKey); else report.skippedItems++; i = before; throw Object.assign(e, { frame }); }
    return frame;
  }

  /* ---------- reading every play ---------- */
  const raw = [];
  starts.forEach((at, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] - 6 : N;
    i = at;
    const play = { frames: [], partial: false };
    try {
      play.id = str(); play.name = str() || 'Untitled'; str();
      play.playbook = str() || ''; play.series = str() || '';
      i += 8 + 8 + 4 + 4; // two dates, a year, a spacer
      str(); str(); play.author = str() || ''; str(); str(); str();
      const frameCount = u16();
      for (let f = 0; f < frameCount && i < end - 38; f++) {
        try { play.frames.push(readFrame(end)); }
        catch (e) {
          if (end - i < 45 && !(e.frame && e.frame.items.length)) break; // just the padding at the end of the file
          play.partial = true;
          if (e.frame) play.frames.push(e.frame);
          // carry on from the next frame we can recognise
          let q = i + 1;
          while (q < end && !frameStartsAt(q)) q++;
          if (q >= end) break;
          i = q;
        }
      }
    } catch (e) { play.partial = true; }
    if (play.id) raw.push(play);
  });

  /* ---------- turning FastDraw plays into Ludo plays ---------- */
  const courtLength = t => (t === 5 ? 94 : t === 3 ? 91.86 : 84);
  const courtWidth = t => (t === 3 ? 49.2126 : 50);
  const untag = html => String(html || '').replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\r]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
  const round1 = n => Math.round(n * 10) / 10;

  function convert(p) {
    let frames = p.frames.slice();
    while (frames.length > 1 && !frames[frames.length - 1].items.length && !untag(frames[frames.length - 1].notes)) frames.pop();
    if (!frames.length) return null;

    const region = fr => { // which part of the floor does this frame show?
      const L = courtLength(fr.courtType), top = fr.view.oy, bottom = fr.view.oy + fr.view.h;
      if (bottom <= L / 2 + 8) return 'near';
      if (top >= L / 2 - 8) return 'far';
      return 'full';
    };
    const regions = frames.map(region);
    const view = regions.every(r => r === 'near') ? 'halfL' : regions.every(r => r === 'far') ? 'halfR' : 'tall';
    const toWorld = (fr, x, y) => { // FastDraw feet -> pixels on our court image
      const L = courtLength(fr.courtType), W = courtWidth(fr.courtType);
      let along;
      if (view === 'tall') along = y * 84 / L;          // whole floor: stretch to our 84 ft court
      else if (view === 'halfR') along = 84 - (L - y);   // keep the distance from the far baseline
      else along = y;                                    // keep the distance from the near baseline
      return [round1(fx(along)), round1(fy(50 - x * 50 / W))];
    };

    const labels = {}, ids = new Map(), used = new Set();
    const free = (prefix, want) => { // pick a piece id, preferring the natural one (player 3 -> o3)
      if (want && !used.has(prefix + want)) return prefix + want;
      for (let n = 1; n <= 20; n++) if (!used.has(prefix + n)) return prefix + n;
      return null;
    };
    const out = [];
    const noteLines = [];
    frames.forEach((fr, fi) => {
      const tok = {}, ink = [], seen = {};
      let balls = 0, cones = 0;
      const texts = [];
      const addInk = (t, c, pts) => {
        const flat = [];
        for (const pt of pts) { const w = toWorld(fr, pt[0], pt[1]); flat.push(w[0], w[1]); }
        if (flat.length >= 4) ink.push({ id: uid(), t, c: c || '#111111', p: flat });
      };
      const sampleQuad = (a, c, e, n) => { const r = []; for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; r.push([u * u * a[0] + 2 * u * t * c[0] + t * t * e[0], u * u * a[1] + 2 * u * t * c[1] + t * t * e[1]]); } return r; };
      const sampleCubic = (a, c1, c2, e, n) => { const r = []; for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; r.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]); } return r; };
      const styleOf = code => { if (STYLE[code]) return STYLE[code]; const k = code.toString(16); report.guessedLines[k] = (report.guessedLines[k] || 0) + 1; return 'cut'; };

      for (const it of fr.items) {
        if (it.k === 'player') {
          const label = it.label.trim();
          const defense = /^x/i.test(label);
          const kind = defense ? 'x' : 'o';
          const nth = (seen[kind + label] = (seen[kind + label] || 0) + 1);
          const key = kind + '|' + label + '|' + nth;
          let id = ids.get(key);
          if (!id) {
            const num = (defense ? label.slice(1) : label).match(/^\d{1,2}$/);
            if (!defense && /^c$/i.test(label) && !used.has('coach')) id = 'coach';
            else id = free(kind, num && +num[0] >= 1 && +num[0] <= 20 ? String(+num[0]) : null);
            if (!id) { report.skippedItems++; continue; }
            ids.set(key, id); used.add(id);
            const natural = id === 'coach' ? 'C' : defense ? 'X' + id.slice(1) : id.slice(1);
            if (label && label.toUpperCase() !== natural && id !== 'coach') labels[id] = label.slice(0, 3);
          }
          tok[id] = toWorld(fr, it.x, it.y).map(Math.round);
          if (it.ball) {
            const bid = balls === 0 ? 'ball' : 'ball' + (balls + 1);
            if (balls < 9) { tok[bid] = [tok[id][0] + 30, tok[id][1] + 30]; used.add(bid); }
            balls++;
          }
        } else if (it.k === 'line') {
          const t = styleOf(it.code);
          if (it.pts.length === 3 && [0x6f, 0x70, 0x71, 0x72].includes(it.code)) addInk(t, it.color, sampleQuad(it.pts[0], it.pts[1], it.pts[2], 14));
          else if (it.pts.length === 4 && TRUE_CURVE4.has(it.code)) addInk(t, it.color, sampleCubic(it.pts[0], it.pts[1], it.pts[2], it.pts[3], 18));
          else addInk(t, it.color, it.pts);
        } else if (it.k === 'path') {
          const pts = [it.start];
          for (const s of it.segs) {
            const a = pts[pts.length - 1];
            if (s.length === 1) pts.push(s[0]);
            else if (s.length === 2) pts.push(...sampleQuad(a, s[0], s[1], 10).slice(1));
            else pts.push(...sampleCubic(a, s[0], s[1], s[2], 12).slice(1));
          }
          addInk(styleOf(it.code), it.color, pts);
        } else if (it.k === 'marker') {
          if (it.code === 0x6c && cones < 20) { cones++; tok['k' + cones] = toWorld(fr, it.x, it.y).map(Math.round); used.add('k' + cones); }
          else noteUnknown('marker ' + it.code.toString(16));
        } else if (it.k === 'poly' || it.k === 'box' || it.k === 'oval') {
          let pts;
          if (it.k === 'oval') { pts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; pts.push([it.x + it.w / 2 + Math.cos(a) * it.w / 2, it.y + it.h / 2 + Math.sin(a) * it.h / 2]); } }
          else {
            const corners = it.k === 'box' ? [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]] : it.pts;
            pts = [];
            corners.forEach((a, k) => { const e = corners[(k + 1) % corners.length]; for (const t of [0, 0.08, 0.5, 0.92]) pts.push([a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t]); });
          }
          addInk('zone', it.color || '#ffd400', pts);
        } else if (it.k === 'text') {
          const t = untag(it.html); if (t) texts.push(t);
          report.textBoxes++;
        }
      }
      const said = [fr.title && fr.title.trim(), untag(fr.notes), texts.length ? 'On the diagram: ' + texts.join(' | ') : ''].filter(Boolean).join('\n');
      if (said) noteLines.push((frames.length > 1 ? 'Step ' + (fi + 1) + ': ' : '') + said);
      out.push({ ink, tok });
      report.frames++;
    });

    // A piece missing from a step stays where it last was (or first appears), so it does not jump about.
    const pieceIds = [...used].filter(id => !/^k\d/.test(id));
    for (const id of pieceIds) {
      let last = null;
      for (const fr of out) { if (fr.tok[id]) last = fr.tok[id]; else if (last) fr.tok[id] = last.slice(); }
      let next = null;
      for (let k = out.length - 1; k >= 0; k--) { if (out[k].tok[id]) next = out[k].tok[id]; else if (next) out[k].tok[id] = next.slice(); }
    }
    const hidden = {};
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'x1', 'x2', 'x3', 'x4', 'x5', 'ball']) if (!used.has(id)) hidden[id] = true;

    const tags = [names[p.series], names[p.playbook]].filter(Boolean).map(t => t.slice(0, 30));
    if (p.partial) report.partial.push(p.name);
    report.plays++;
    return {
      v: 4, id: ('fd-' + p.id).slice(0, 40), name: p.name.slice(0, 60), view, ovl: {}, flip: false,
      tags: [...new Set(tags)], notes: noteLines.join('\n\n').slice(0, 4000), labels, team: false,
      frames: out, cur: 0, tokMoved: true, show: { o: true, x: true, b: true }, hidden, updated: Date.now(),
    };
  }

  const plays = raw.map(convert).filter(Boolean);
  return { plays, report };
}

if (typeof module !== 'undefined') module.exports = { parseFastDraw };
