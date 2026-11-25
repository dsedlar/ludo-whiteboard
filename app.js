'use strict';
/* Bishops Whiteboard. Everything is drawn in "world" units, which are the pixels of court.jpg.
   Court feet map onto the image with fx()/fy(), so overlays are written in real feet. */

const NS = 'http://www.w3.org/2000/svg';
const IMG_W = 1750, IMG_H = 1213;
const DATA_V = 2; // version 1 drawings were made on a court image that was 125 px wider at each end
// Where the 84 x 50 ft playing surface sits inside court.jpg.
const OX = 86, OY = 136, SX = 1577 / 84, SY = 940 / 50;
const fx = X => OX + X * SX, fy = Y => OY + Y * SY;

const VIEWS = {
  full:  { label: 'Full',       vb: [0, 0, IMG_W, IMG_H],  rot: 0,   tf: '' },
  tall:  { label: 'Full tall',  vb: [0, 0, IMG_H, IMG_W],  rot: 90,  tf: `translate(${IMG_H} 0) rotate(90)` },
  halfL: { label: 'Left half',  vb: [60, 0, 1093, 935],  rot: 90,  tf: `translate(${IMG_H} 0) rotate(90)` },
  halfR: { label: 'Right half', vb: [60, 0, 1093, 935],  rot: -90, tf: `translate(0 ${IMG_W}) rotate(-90)` },
};

const COLORS = ['#111111', '#b20000', '#0b4fd6', '#0a7d3b', '#ffd400', '#ffffff'];
const TOOLS = [
  ['move', 'Move'], ['cut', 'Cut'], ['pass', 'Pass'], ['dribble', 'Dribble'],
  ['screen', 'Screen'], ['line', 'Pen'], ['zone', 'Zone'], ['erase', 'Erase'],
];
const INK_TYPES = ['cut', 'pass', 'dribble', 'screen', 'line', 'zone'];
const TOKENS = ['o1', 'o2', 'o3', 'o4', 'o5', 'x1', 'x2', 'x3', 'x4', 'x5', 'ball'];

/* Built-in overlays, in court feet. x runs baseline to baseline (0-84), y sideline to sideline (0-50).
   "dir: true" means the overlay depends on which way the ball attacks, so the flip switch mirrors it. */
const OVERLAYS = [
  {
    id: 'thirds-boxes', name: 'Thirds and boxes', dir: true,
    shapes: [
      { k: 'box', x: 0, y: 0, w: 11, h: 12 }, { k: 'box', x: 0, y: 38, w: 11, h: 12 },
      { k: 'box', x: 42, y: 0, w: 7, h: 11 }, { k: 'box', x: 42, y: 39, w: 7, h: 11 },
      { k: 'box', x: 73, y: 0, w: 11, h: 12 }, { k: 'box', x: 73, y: 38, w: 11, h: 12 },
      { k: 'dash', x1: 28, y1: 0, x2: 28, y2: 50 }, { k: 'dash', x1: 56, y1: 0, x2: 56, y2: 50 },
      { k: 'num', x: 14, y: 25, t: '1' }, { k: 'num', x: 42, y: 25, t: '2' }, { k: 'num', x: 70, y: 25, t: '3' },
      { k: 'arrow', x1: 8, x2: 34, y: -1.5, t: 'BALL ATTACKS' },
    ],
  },
  {
    id: 'volleyball', name: 'Volleyball lines',
    shapes: [
      { k: 'ln', x1: 12.17, y1: 10.13, x2: 71.88, y2: 10.13 }, { k: 'ln', x1: 12.17, y1: 39.81, x2: 71.88, y2: 39.81 },
      { k: 'ln', x1: 12.17, y1: 10.13, x2: 12.17, y2: 39.81 }, { k: 'ln', x1: 71.88, y1: 10.13, x2: 71.88, y2: 39.81 },
      { k: 'ln', x1: 31.93, y1: 10.13, x2: 31.93, y2: 39.81 }, { k: 'ln', x1: 52.12, y1: 10.13, x2: 52.12, y2: 39.81 },
      { k: 'ln', x1: 10.81, y1: 10.13, x2: 11.45, y2: 10.13 }, { k: 'ln', x1: 72.65, y1: 10.13, x2: 73.24, y2: 10.13 },
      { k: 'ln', x1: 10.81, y1: 39.81, x2: 11.45, y2: 39.81 }, { k: 'ln', x1: 72.65, y1: 39.81, x2: 73.24, y2: 39.81 },
    ],
  },
];

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
function S(tag, attrs, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  n.append(...kids);
  return n;
}
function H(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]);
  }
  n.append(...kids);
  return n;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const r1 = n => Math.round(n * 10) / 10;
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- geometry for ink ---------- */
function toPts(flat) {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
function simplify(pts, eps) { // Ramer-Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    let worst = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > worst) { worst = d; idx = i; }
    }
    if (worst > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function smooth(pts, closed) {
  const f = p => `${r1(p[0])} ${r1(p[1])}`;
  if (pts.length === 2) return `M${f(pts[0])} L${f(pts[1])}`;
  let d = `M${f(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    d += ` Q${f(pts[i])} ${f(m)}`;
  }
  d += ` L${f(pts[pts.length - 1])}`;
  return closed ? d + ' Z' : d;
}
function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (!seg) continue;
    let t = step - carry;
    while (t <= seg) { out.push([ax + (bx - ax) * t / seg, ay + (by - ay) * t / seg]); t += step; }
    carry = seg - (t - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function wavy(pts) { // dribble: a sine wave laid along the stroke, flattened near both ends
  const step = 4, r = resample(pts, step), n = r.length, L = (n - 1) * step;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = r[Math.max(0, i - 2)], b = r[Math.min(n - 1, i + 2)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const t = i * step;
    const amp = 8 * Math.max(0, Math.min(1, t / 16, (L - t - 26) / 16));
    const off = Math.sin(t * Math.PI / 17) * amp;
    d += `${i ? ' L' : 'M'}${r1(r[i][0] + nx * off)} ${r1(r[i][1] + ny * off)}`;
  }
  return d;
}
function endDir(pts) {
  const e = pts[pts.length - 1];
  for (let i = pts.length - 2; i >= 0; i--) {
    const dx = e[0] - pts[i][0], dy = e[1] - pts[i][1], len = Math.hypot(dx, dy);
    if (len >= 22 || i === 0) return len ? [dx / len, dy / len] : [1, 0];
  }
  return [1, 0];
}

function inkNode(it) {
  const g = S('g', { 'data-ink': it.id || '' });
  const pts = toPts(it.p), c = it.c;
  if (pts.length < 2) return g;
  if (it.t === 'zone') {
    g.append(S('path', { d: smooth(pts, true), fill: c, 'fill-opacity': 0.28, stroke: c, 'stroke-width': 4, 'stroke-linejoin': 'round' }));
    return g;
  }
  const d = it.t === 'dribble' ? wavy(pts) : smooth(pts);
  const line = S('path', { d, fill: 'none', stroke: c, 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (it.t === 'pass') line.setAttribute('stroke-dasharray', '17 14');
  g.append(S('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 36, 'pointer-events': 'stroke' }), line);
  const [ex, ey] = pts[pts.length - 1], [ux, uy] = endDir(pts);
  if (it.t === 'screen') {
    g.append(S('line', { x1: ex - uy * 24, y1: ey + ux * 24, x2: ex + uy * 24, y2: ey - ux * 24, stroke: c, 'stroke-width': 6.5, 'stroke-linecap': 'round' }));
  } else if (it.t !== 'line') {
    const bx = ex - ux * 30, by = ey - uy * 30;
    g.append(S('polygon', { points: `${r1(ex + ux * 4)},${r1(ey + uy * 4)} ${r1(bx - uy * 13)},${r1(by + ux * 13)} ${r1(bx + uy * 13)},${r1(by - ux * 13)}`, fill: c, stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  return g;
}

/* ---------- board state ---------- */
function defaultTokens(view) {
  // A 5-out set with a matching shell, given as (feet from the baseline, feet across).
  const spots = {
    o1: [30, 25], o2: [21, 43], o3: [21, 7], o4: [4, 46.5], o5: [4, 3.5],
    x1: [24, 25], x2: [17, 37], x3: [17, 13], x4: [6.5, 40], x5: [6.5, 10], ball: [31.6, 27.6],
  };
  const right = view === 'halfR', out = {};
  for (const id in spots) out[id] = [Math.round(fx(right ? 84 - spots[id][0] : spots[id][0])), Math.round(fy(spots[id][1]))];
  return out;
}
function blankState(view) {
  return { v: DATA_V, id: null, name: '', view, ovl: {}, flip: false, ink: [], tok: defaultTokens(view), tokMoved: false, show: { o: true, x: true, b: true } };
}

let state = blankState('halfL');
let tool = 'cut', color = COLORS[0];
let fingerDraw = true, penSeen = false;
let customOverlays = [];
let dirty = false;
const undoStack = [], redoStack = [];

const board = $('board'), world = $('world');
const gOvl = $('ovl'), gInk = $('ink'), gLive = $('live'), gTok = $('tok');

/* ---------- painting ---------- */
function fillOverlays(g, st) {
  g.replaceChildren();
  const rot = VIEWS[st.view].rot;
  for (const o of OVERLAYS) {
    if (!st.ovl[o.id]) continue;
    const flip = o.dir && st.flip;
    const mx = x => (flip ? 84 - x : x);
    const ft = S('g', { transform: `translate(${OX} ${OY}) scale(${SX} ${SY})`, 'pointer-events': 'none' });
    for (const s of o.shapes) {
      if (s.k === 'box') {
        const x = flip ? 84 - s.x - s.w : s.x;
        ft.append(
          S('rect', { x, y: s.y, width: s.w, height: s.h, fill: '#f3eed4', 'fill-opacity': 0.55 }),
          S('rect', { x, y: s.y, width: s.w, height: s.h, fill: 'url(#hatch)', stroke: '#3c0019', 'stroke-width': 0.3 }));
      } else if (s.k === 'ln') {
        ft.append(S('line', { x1: mx(s.x1), y1: s.y1, x2: mx(s.x2), y2: s.y2, stroke: '#ffffff', 'stroke-width': 0.13, 'stroke-linecap': 'square' }));
      } else if (s.k === 'dash') {
        ft.append(S('line', { x1: mx(s.x1), y1: s.y1, x2: mx(s.x2), y2: s.y2, stroke: '#00142d', 'stroke-width': 0.45, 'stroke-dasharray': '1.9 1.5' }));
      } else if (s.k === 'num') {
        const t = S('text', { 'text-anchor': 'middle', y: 0.95, 'font-size': 2.7, 'font-weight': 700, fill: '#ffffff' });
        t.textContent = s.t;
        ft.append(S('g', { transform: `translate(${mx(s.x)} ${s.y}) rotate(${-rot})` }, S('circle', { r: 2.2, fill: '#00142d', stroke: '#ffffff', 'stroke-width': 0.15 }), t));
      } else if (s.k === 'arrow') {
        const a = mx(s.x1), b = mx(s.x2), dir = Math.sign(b - a);
        const t = S('text', { x: (a + b) / 2, y: s.y - 1, 'text-anchor': 'middle', 'font-size': 1.5, 'font-weight': 700, 'letter-spacing': 0.35, fill: '#ffffff' });
        t.textContent = s.t;
        ft.append(
          S('line', { x1: a, y1: s.y, x2: b - dir * 1.5, y2: s.y, stroke: '#ffffff', 'stroke-width': 0.4 }),
          S('polygon', { points: `${b},${s.y} ${b - dir * 2.2},${s.y - 0.9} ${b - dir * 2.2},${s.y + 0.9}`, fill: '#ffffff' }), t);
      }
    }
    g.append(ft);
  }
  for (const o of customOverlays) {
    if (!st.ovl[o.id]) continue;
    const layer = S('g', { opacity: 0.85, 'pointer-events': 'none' });
    for (const it of o.items) { const n = inkNode(it); n.removeAttribute('data-ink'); layer.append(n); }
    g.append(layer);
  }
}
function fillInk(g, st) {
  g.replaceChildren(...st.ink.map(inkNode));
}
function tokenNode(id, pos, rot) {
  const g = S('g', { 'data-tok': id, transform: `translate(${pos[0]} ${pos[1]}) rotate(${-rot})` });
  g.append(S('circle', { r: 46, fill: 'transparent' }));
  if (id === 'ball') {
    g.append(S('circle', { r: 14, fill: '#e8731a', stroke: '#111111', 'stroke-width': 2.5 }));
    return g;
  }
  const off = id[0] === 'o';
  g.append(S('circle', { r: 25, fill: off ? '#b20000' : '#ffffff', stroke: off ? '#ffffff' : '#3c0019', 'stroke-width': 3 }));
  const t = S('text', { 'text-anchor': 'middle', y: off ? 10.5 : 9, 'font-size': off ? 30 : 25, 'font-weight': 700, fill: off ? '#ffffff' : '#3c0019' });
  t.textContent = off ? id[1] : 'X' + id[1];
  g.append(t);
  return g;
}
function fillTokens(g, st) {
  g.replaceChildren();
  const rot = VIEWS[st.view].rot;
  for (const id of TOKENS) {
    const kind = id === 'ball' ? 'b' : id[0];
    if (st.show[kind] && st.tok[id]) g.append(tokenNode(id, st.tok[id], rot));
  }
}
function applyView() {
  const v = VIEWS[state.view];
  board.setAttribute('viewBox', v.vb.join(' '));
  if (v.tf) world.setAttribute('transform', v.tf); else world.removeAttribute('transform');
  for (const b of $('views').children) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
}
function paintAll() {
  applyView();
  fillOverlays(gOvl, state); fillInk(gInk, state); fillTokens(gTok, state);
  syncChrome();
}
function syncChrome() {
  $('playName').textContent = state.name || 'Untitled play';
  $('saveBtn').textContent = dirty || !state.id ? 'Save' : 'Saved';
  $('undoBtn').disabled = !undoStack.length;
  $('redoBtn').disabled = !redoStack.length;
  $('showO').setAttribute('aria-pressed', String(state.show.o));
  $('showX').setAttribute('aria-pressed', String(state.show.x));
  $('showB').setAttribute('aria-pressed', String(state.show.b));
  $('flipChk').checked = state.flip;
}

/* ---------- history and autosave ---------- */
const snap = () => JSON.stringify({ ink: state.ink, tok: state.tok, tokMoved: state.tokMoved });
function remember() { // call BEFORE changing ink or tokens
  undoStack.push(snap());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}
function restore(json) {
  Object.assign(state, JSON.parse(json));
  touched();
  fillInk(gInk, state); fillTokens(gTok, state);
}
function undo() { if (undoStack.length) { redoStack.push(snap()); restore(undoStack.pop()); } }
function redo() { if (redoStack.length) { undoStack.push(snap()); restore(redoStack.pop()); } }
function touched() {
  dirty = true;
  try { localStorage.setItem('wb.current', JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ }
  syncChrome();
}
function savePrefs() {
  try { localStorage.setItem('wb.prefs', JSON.stringify({ tool, color, fingerDraw, penSeen })); } catch (e) { /* ignore */ }
}

/* ---------- storage: plays and custom overlays live in IndexedDB on this iPad ---------- */
const mem = { plays: new Map(), overlays: new Map() };
let dbp = null;
function openDb() {
  if (!dbp) {
    dbp = new Promise(resolve => {
      try {
        const rq = indexedDB.open('bishops-whiteboard', 1);
        rq.onupgradeneeded = () => {
          rq.result.createObjectStore('plays', { keyPath: 'id' });
          rq.result.createObjectStore('overlays', { keyPath: 'id' });
        };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  return dbp;
}
async function store(name, mode, fn) {
  const db = await openDb();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const rq = fn(tx.objectStore(name));
    tx.oncomplete = () => resolve(rq && rq.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
const dbAll = name => store(name, 'readonly', s => (s ? s.getAll() : { result: [...mem[name].values()] }));
const dbPut = (name, v) => store(name, 'readwrite', s => (s ? s.put(v) : void mem[name].set(v.id, v)));
const dbDel = (name, id) => store(name, 'readwrite', s => (s ? s.delete(id) : void mem[name].delete(id)));

/* ---------- validating anything loaded from disk or an imported file ---------- */
function cleanInk(list, dx) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || !INK_TYPES.includes(it.t) || !/^#[0-9a-f]{6}$/i.test(it.c) || !Array.isArray(it.p)) continue;
    const p = it.p.slice(0, 4000).map((n, i) => Number(n) + (dx && i % 2 === 0 ? dx : 0));
    if (p.length < 4 || p.some(n => !Number.isFinite(n))) continue;
    out.push({ id: uid(), t: it.t, c: it.c, p });
  }
  return out;
}
function cleanPlay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const view = VIEWS[raw.view] ? raw.view : 'full';
  const st = blankState(view);
  st.id = typeof raw.id === 'string' ? raw.id.slice(0, 40) : null;
  st.name = String(raw.name || '').slice(0, 60);
  st.flip = !!raw.flip;
  const dx = raw.v === DATA_V ? 0 : -125;
  st.ink = cleanInk(raw.ink, dx);
  st.tokMoved = !!raw.tokMoved;
  for (const id of TOKENS) {
    const p = raw.tok && raw.tok[id];
    if (Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) st.tok[id] = [+p[0] + dx, +p[1]];
  }
  if (raw.show) st.show = { o: raw.show.o !== false, x: raw.show.x !== false, b: raw.show.b !== false };
  if (raw.ovl && typeof raw.ovl === 'object') for (const k in raw.ovl) if (raw.ovl[k]) st.ovl[String(k).slice(0, 40)] = true;
  st.updated = Number(raw.updated) || Date.now();
  return st;
}

/* ---------- pointer input: Pencil draws, a finger moves players ---------- */
let active = null; // the one pointer we are following
function worldPoint(e) {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(world.getScreenCTM().inverse());
  return [r1(p.x), r1(p.y)];
}
function eraseAt(e) {
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const g = hit && hit.closest && hit.closest('#ink [data-ink]');
  if (!g) return;
  if (!active.changed) { remember(); active.changed = true; }
  state.ink = state.ink.filter(it => it.id !== g.getAttribute('data-ink'));
  g.remove();
}
board.addEventListener('pointerdown', e => {
  if (active || e.button > 0) return;
  const pen = e.pointerType === 'pen';
  if (pen && !penSeen) {
    penSeen = true; fingerDraw = false; $('fingerChk').checked = false; savePrefs();
    toast('Pencil found. Fingers now only move players.');
  }
  const tokEl = e.target.closest && e.target.closest('#tok [data-tok]');
  const mayDraw = pen || e.pointerType === 'mouse' || fingerDraw;
  let mode = null;
  if (tokEl && (tool === 'move' || !pen)) mode = 'drag';
  else if (tool === 'move') mode = null;
  else if (mayDraw) mode = tool === 'erase' ? 'erase' : 'draw';
  if (!mode) return;
  e.preventDefault();
  try { board.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers cannot be captured */ }
  active = { id: e.pointerId, mode, changed: false };
  const p = worldPoint(e);
  if (mode === 'drag') {
    active.tok = tokEl.getAttribute('data-tok'); active.el = tokEl;
    const cur = state.tok[active.tok];
    active.off = [cur[0] - p[0], cur[1] - p[1]];
    gTok.append(tokEl); // bring to front
  } else if (mode === 'draw') {
    active.pts = [p];
    active.path = S('path', { fill: tool === 'zone' ? color : 'none', 'fill-opacity': 0.2, stroke: color, 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    gLive.append(active.path);
  } else eraseAt(e);
});
board.addEventListener('pointermove', e => {
  if (!active || e.pointerId !== active.id) return;
  if (active.mode === 'drag') {
    const p = worldPoint(e);
    const x = Math.max(0, Math.min(IMG_W, p[0] + active.off[0])), y = Math.max(0, Math.min(IMG_H, p[1] + active.off[1]));
    if (!active.changed) { remember(); active.changed = true; }
    state.tok[active.tok] = [Math.round(x), Math.round(y)];
    active.el.setAttribute('transform', `translate(${Math.round(x)} ${Math.round(y)}) rotate(${-VIEWS[state.view].rot})`);
  } else if (active.mode === 'draw') {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const p = worldPoint(ev), last = active.pts[active.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 2.5) active.pts.push(p);
    }
    if (!active.raf) active.raf = requestAnimationFrame(() => {
      if (!active || !active.path) return;
      active.raf = 0;
      if (active.pts.length > 1) active.path.setAttribute('d', smooth(active.pts));
    });
  } else eraseAt(e);
});
function endPointer(e) {
  if (!active || e.pointerId !== active.id) return;
  const a = active; active = null;
  if (a.mode === 'drag') {
    if (a.changed) { state.tokMoved = true; touched(); }
  } else if (a.mode === 'draw') {
    gLive.replaceChildren();
    const pts = simplify(a.pts, 1.6);
    if (e.type === 'pointerup' && pts.length >= 2 && pathLength(pts) >= 14) {
      remember();
      const it = { id: uid(), t: tool, c: color, p: pts.flat() };
      state.ink.push(it);
      gInk.append(inkNode(it));
      touched();
    }
  } else if (a.changed) touched();
}
board.addEventListener('pointerup', endPointer);
board.addEventListener('pointercancel', endPointer);
for (const ev of ['gesturestart', 'gesturechange', 'contextmenu', 'dblclick']) document.addEventListener(ev, e => e.preventDefault());

/* ---------- toolbar ---------- */
function toolIcon(id) {
  if (id === 'move') return S('svg', { viewBox: '0 0 24 24' }, S('path', { d: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3' }));
  if (id === 'erase') return S('svg', { viewBox: '0 0 24 24' }, S('path', { d: 'M4 15 13 6l6 6-7 7H8zM9 10l6 6M12 19h8' }));
  const svg = S('svg', { viewBox: '0 0 190 110' });
  const p = id === 'zone' ? [30, 60, 60, 20, 130, 18, 165, 55, 130, 92, 60, 90] : [14, 92, 70, 60, 120, 44, 168, 22];
  const n = inkNode({ t: id, c: '#000000', p });
  n.querySelectorAll('[stroke]').forEach(x => { if (x.getAttribute('stroke') !== 'transparent') { x.setAttribute('stroke', 'currentColor'); x.style.strokeWidth = id === 'zone' ? '6' : '8'; } });
  n.querySelectorAll('[fill]').forEach(x => { if (x.getAttribute('fill') !== 'none') { x.setAttribute('fill', 'currentColor'); x.style.fill = 'currentColor'; } });
  svg.append(n);
  return svg;
}
function setTool(id) {
  tool = id;
  for (const b of $('toolBtns').children) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
  savePrefs();
}
function setColor(c) {
  color = c;
  for (const b of $('colorBtns').children) b.setAttribute('aria-pressed', String(b.dataset.color === c));
  savePrefs();
}
function buildChrome() {
  for (const [id, label] of TOOLS) {
    const b = H('button', { class: 'tool', 'data-tool': id, 'aria-pressed': 'false' }, toolIcon(id), H('span', {}, label));
    b.addEventListener('click', () => setTool(id));
    $('toolBtns').append(b);
  }
  COLORS.forEach((c, i) => {
    const dot = H('i'); dot.style.background = c;
    const b = H('button', { class: 'swatch', 'data-color': c, 'aria-pressed': 'false', 'aria-label': ['Black', 'Garnet', 'Blue', 'Green', 'Yellow', 'White'][i] + ' pencil' }, dot);
    b.addEventListener('click', () => { setColor(c); if (tool === 'move' || tool === 'erase') setTool('cut'); });
    $('colorBtns').append(b);
  });
  for (const id in VIEWS) {
    const b = H('button', { 'data-view': id, 'aria-pressed': 'false' }, VIEWS[id].label);
    b.addEventListener('click', () => setView(id));
    $('views').append(b);
  }
}
function setView(id) {
  if (state.view === id) return;
  state.view = id;
  if (!state.tokMoved) state.tok = defaultTokens(id);
  touched(); paintAll();
}
function toggleShow(k) { state.show[k] = !state.show[k]; touched(); fillTokens(gTok, state); }
$('showO').addEventListener('click', () => toggleShow('o'));
$('showX').addEventListener('click', () => toggleShow('x'));
$('showB').addEventListener('click', () => toggleShow('b'));
$('resetTok').addEventListener('click', () => {
  remember(); state.tok = defaultTokens(state.view); state.tokMoved = false; touched(); fillTokens(gTok, state);
});
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('trashBtn').addEventListener('click', () => {
  if (!state.ink.length && !state.tokMoved) return;
  remember();
  state.ink = []; state.tok = defaultTokens(state.view); state.tokMoved = false;
  touched(); fillInk(gInk, state); fillTokens(gTok, state);
  toast('Board cleared.', 'Undo', undo);
});

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(msg, actLabel, act) {
  $('toastMsg').textContent = msg;
  const b = $('toastAct');
  b.hidden = !actLabel;
  if (actLabel) { b.textContent = actLabel; b.onclick = () => { $('toast').hidden = true; act(); }; }
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, actLabel ? 6000 : 3200);
}

/* ---------- overlays panel ---------- */
function renderOverlayList() {
  const ul = $('overlayList');
  ul.replaceChildren();
  const all = [...OVERLAYS.map(o => ({ o, custom: false })), ...customOverlays.map(o => ({ o, custom: true }))];
  if (!all.length) ul.append(H('li', { class: 'empty' }, 'No overlays yet.'));
  for (const { o, custom } of all) {
    const cb = H('input', { type: 'checkbox', id: 'ov-' + o.id });
    cb.checked = !!state.ovl[o.id];
    cb.addEventListener('change', () => {
      if (cb.checked) state.ovl[o.id] = true; else delete state.ovl[o.id];
      touched(); fillOverlays(gOvl, state);
    });
    const name = H('span'); name.textContent = o.name;
    const li = H('li', {}, H('label', { class: 'check' }, cb, name));
    if (custom) {
      const del = H('button', { class: 'link' }, 'Delete');
      del.addEventListener('click', async () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Really delete?'; return; }
        await dbDel('overlays', o.id);
        customOverlays = customOverlays.filter(x => x.id !== o.id);
        delete state.ovl[o.id];
        renderOverlayList(); fillOverlays(gOvl, state);
      });
      li.append(del);
    }
    ul.append(li);
  }
}
$('overlayBtn').addEventListener('click', () => {
  const p = $('overlayPanel');
  p.hidden = !p.hidden;
  $('overlayBtn').setAttribute('aria-expanded', String(!p.hidden));
  if (!p.hidden) renderOverlayList();
});
$('flipChk').addEventListener('change', e => { state.flip = e.target.checked; touched(); fillOverlays(gOvl, state); });
$('fingerChk').addEventListener('change', e => { fingerDraw = e.target.checked; savePrefs(); });
$('ovlSave').addEventListener('click', async () => {
  if (!state.ink.length) { toast('Draw the areas on the board first.'); return; }
  const name = $('ovlName').value.trim() || 'Overlay ' + (customOverlays.length + 1);
  const o = { v: DATA_V, id: 'c-' + uid(), name: name.slice(0, 40), items: clone(state.ink) };
  try { await dbPut('overlays', o); } catch (e) { toast('Could not save the overlay on this iPad.'); return; }
  customOverlays.push(o);
  remember();
  state.ink = []; state.ovl[o.id] = true;
  $('ovlName').value = '';
  touched(); fillInk(gInk, state); fillOverlays(gOvl, state); renderOverlayList();
  toast(`Saved "${o.name}" as an overlay.`);
});

/* ---------- saving plays ---------- */
let dlgDone = null;
function askName(title, initial) {
  $('dlgTitle').textContent = title;
  $('nameInput').value = initial || '';
  $('dialog').hidden = false;
  $('nameInput').focus();
  return new Promise(res => { dlgDone = res; });
}
function closeDialog(v) { $('dialog').hidden = true; if (dlgDone) { dlgDone(v); dlgDone = null; } }
$('dlgCancel').addEventListener('click', () => closeDialog(null));
$('nameForm').addEventListener('submit', e => { e.preventDefault(); const v = $('nameInput').value.trim(); if (v) closeDialog(v); });

async function savePlay(rename) {
  if (!state.id || !state.name || rename) {
    const name = await askName(state.id ? 'Rename play' : 'Save play', state.name);
    if (!name) return;
    state.name = name;
  }
  if (!state.id) state.id = uid();
  state.updated = Date.now();
  try { await dbPut('plays', clone(state)); } catch (e) { toast('Could not save on this iPad. Storage may be full.'); return; }
  dirty = false;
  try { localStorage.setItem('wb.current', JSON.stringify(state)); } catch (e) { /* ignore */ }
  syncChrome();
  toast(`Saved "${state.name}" to the playbook.`);
}
$('saveBtn').addEventListener('click', () => savePlay(false));
$('playName').addEventListener('click', () => savePlay(true));

function loadState(st) {
  state = st; undoStack.length = 0; redoStack.length = 0; dirty = false;
  try { localStorage.setItem('wb.current', JSON.stringify(state)); } catch (e) { /* ignore */ }
  paintAll(); renderOverlayList();
}

/* ---------- playbook ---------- */
function thumb(st) {
  const v = VIEWS[st.view];
  const svg = S('svg', { viewBox: v.vb.join(' '), preserveAspectRatio: 'xMidYMid meet' });
  const w = S('g', v.tf ? { transform: v.tf } : {});
  const o = S('g', {}), i = S('g', {}), t = S('g', {});
  w.append(S('image', { href: 'court.jpg', width: IMG_W, height: IMG_H, preserveAspectRatio: 'none' }), o, i, t);
  fillOverlays(o, st); fillInk(i, st); fillTokens(t, st);
  svg.append(w);
  return svg;
}
async function renderPlaybook() {
  const grid = $('playGrid');
  let plays = [];
  try { plays = (await dbAll('plays')).map(cleanPlayKeepIds).filter(Boolean); } catch (e) { /* show empty */ }
  plays.sort((a, b) => b.updated - a.updated);
  grid.replaceChildren();
  if (!plays.length) {
    grid.append(H('p', { class: 'empty' }, 'No saved plays yet. Draw a play on the board and tap Save. It is kept on this iPad and works without Wi-Fi.'));
    return;
  }
  for (const p of plays) {
    const open = H('button', { class: 'thumb', 'aria-label': 'Open ' + p.name }, thumb(p));
    open.addEventListener('click', () => { loadState(p); showBook(false); });
    const title = H('b'); title.textContent = p.name;
    const when = H('small'); when.textContent = VIEWS[p.view].label + ' · ' + new Date(p.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const dup = H('button', { class: 'btn' }, 'Duplicate');
    dup.addEventListener('click', async () => {
      const c = clone(p); c.id = uid(); c.name = (p.name + ' copy').slice(0, 60); c.updated = Date.now();
      await dbPut('plays', c); renderPlaybook();
    });
    const share = H('button', { class: 'btn' }, 'Share');
    share.addEventListener('click', () => exportPlays([p], p.name));
    const del = H('button', { class: 'btn' }, 'Delete');
    del.addEventListener('click', async () => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Really delete?'; del.classList.add('warn'); return; }
      await dbDel('plays', p.id);
      if (state.id === p.id) { state.id = null; dirty = true; syncChrome(); }
      renderPlaybook();
    });
    grid.append(H('article', { class: 'card' }, open, H('div', { class: 'meta' }, title, when), H('div', { class: 'acts' }, dup, share, del)));
  }
}
function cleanPlayKeepIds(raw) {
  const st = cleanPlay(raw);
  if (st && !st.id) st.id = uid();
  return st;
}
function showBook(on) {
  $('playbook').hidden = !on;
  if (on) { $('overlayPanel').hidden = true; $('overlayBtn').setAttribute('aria-expanded', 'false'); renderPlaybook(); }
}
$('bookBtn').addEventListener('click', () => showBook(true));
$('closeBook').addEventListener('click', () => showBook(false));
$('newPlay').addEventListener('click', () => {
  const st = blankState(state.view);
  st.ovl = clone(state.ovl); st.flip = state.flip;
  loadState(st); showBook(false);
});

async function exportPlays(plays, label) {
  const used = new Set(plays.flatMap(p => Object.keys(p.ovl)));
  const data = { app: 'bishops-whiteboard', version: 1, plays, overlays: customOverlays.filter(o => used.has(o.id)) };
  const fname = (label || 'bishops-playbook').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.json';
  const file = new File([JSON.stringify(data)], fname, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: label || 'Bishops playbook' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = H('a', { href: URL.createObjectURL(file), download: fname });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
$('exportAll').addEventListener('click', async () => {
  const plays = (await dbAll('plays')).map(cleanPlayKeepIds).filter(Boolean);
  if (!plays.length) { toast('There are no saved plays to export yet.'); return; }
  exportPlays(plays, 'bishops-playbook');
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || data.app !== 'bishops-whiteboard' || !Array.isArray(data.plays)) throw new Error('wrong file');
    const idMap = {};
    for (const o of Array.isArray(data.overlays) ? data.overlays : []) {
      const items = cleanInk(o && o.items, o && o.v === DATA_V ? 0 : -125);
      if (!items.length) continue;
      const fresh = { v: DATA_V, id: 'c-' + uid(), name: String(o.name || 'Overlay').slice(0, 40), items };
      idMap[o.id] = fresh.id;
      await dbPut('overlays', fresh); customOverlays.push(fresh);
    }
    let n = 0;
    for (const raw of data.plays) {
      const p = cleanPlay(raw);
      if (!p) continue;
      p.id = uid(); p.updated = Date.now();
      const ovl = {};
      for (const k in p.ovl) ovl[idMap[k] || k] = true;
      p.ovl = ovl;
      await dbPut('plays', p); n++;
    }
    toast(n === 1 ? 'Imported 1 play.' : `Imported ${n} plays.`);
    renderPlaybook();
  } catch (err) {
    toast('That file is not a Bishops Whiteboard export.');
  }
});

/* ---------- start ---------- */
async function start() {
  buildChrome();
  try {
    const prefs = JSON.parse(localStorage.getItem('wb.prefs') || 'null');
    if (prefs) {
      if (TOOLS.some(t => t[0] === prefs.tool)) tool = prefs.tool;
      if (COLORS.includes(prefs.color)) color = prefs.color;
      fingerDraw = prefs.fingerDraw !== false; penSeen = !!prefs.penSeen;
    }
    const cur = cleanPlay(JSON.parse(localStorage.getItem('wb.current') || 'null'));
    if (cur) state = cur;
  } catch (e) { /* start fresh */ }
  $('fingerChk').checked = fingerDraw;
  setTool(tool); setColor(color);
  paintAll();
  try { customOverlays = (await dbAll('overlays')).map(o => ({ v: DATA_V, id: String(o.id), name: String(o.name || 'Overlay').slice(0, 40), items: cleanInk(o.items, o.v === DATA_V ? 0 : -125) })); } catch (e) { customOverlays = []; }
  fillOverlays(gOvl, state);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
