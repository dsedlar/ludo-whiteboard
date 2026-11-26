'use strict';
/* Ludo Whiteboard. Everything is drawn in "world" units, which are the pixels of court.jpg.
   Court feet map onto the image with fx()/fy(), so overlays and alignments are written in real feet. */

const NS = 'http://www.w3.org/2000/svg';
const IMG_W = 1854, IMG_H = 1157;
const APP_VERSION = 25; // shown in the Playbook so you can tell which version an iPad is running
const DATA_V = 4;
// Earlier versions used court images with different borders; this is how far to slide their drawings.
const shiftFor = v => (v === DATA_V ? [0, 0] : [v === 3 ? -28 : v === 2 ? 52 : -73, -28]);
// Where the 84 x 50 ft playing surface sits inside court.jpg.
const OX = 138, OY = 108, SX = 1577 / 84, SY = 940 / 50;
const fx = X => OX + X * SX, fy = Y => OY + Y * SY;

const VIEWS = {
  full:  { label: 'Full',  name: 'Full court',      vb: [0, 0, IMG_W, IMG_H], rot: 0,   tf: '' },
  tall:  { label: 'Tall',  name: 'Full court tall', vb: [0, 0, IMG_H, IMG_W], rot: 90,  tf: `translate(${IMG_H} 0) rotate(90)`, inv: `rotate(-90) translate(${-IMG_H} 0)` },
  halfL: { label: 'Half',  name: 'Half court',      vb: [0, 0, IMG_H, 987],   rot: 90,  tf: `translate(${IMG_H} 0) rotate(90)`, inv: `rotate(-90) translate(${-IMG_H} 0)` },
  halfR: { label: 'Half',  name: 'Half court',     vb: [0, 0, IMG_H, 987],   rot: -90, tf: `translate(0 ${IMG_W}) rotate(-90)`, inv: `rotate(90) translate(0 ${-IMG_W})` },
};
// A play can carry a picture (a photo of a drawing, or a PDF page). In the "pic" view the picture is the
// whole board; in a court view it is laid faintly over the court so it can be traced.
const picHeight = pic => Math.round(IMG_W * pic.h / pic.w);
const viewOf = st => (st.view === 'pic' && st.pic
  ? { label: 'Picture', name: 'Picture', vb: [0, 0, IMG_W, picHeight(st.pic)], rot: 0, tf: '' }
  : VIEWS[st['view']] || VIEWS.full);

const COLORS = ['#111111', '#b20000', '#0b4fd6', '#0a7d3b', '#ffd400', '#ffffff'];
const TOOLS = [
  ['move', 'Move'], ['cut', 'Cut'], ['pass', 'Pass'], ['dribble', 'Dribble'], ['screen', 'Screen'],
  ['line', 'Pen'], ['zone', 'Zone'], ['laser', 'Laser'], ['erase', 'Erase'],
];
const INK_TYPES = ['cut', 'pass', 'dribble', 'screen', 'line', 'zone'];
const BASE_TOKENS = ['o1', 'o2', 'o3', 'o4', 'o5', 'x1', 'x2', 'x3', 'x4', 'x5', 'ball'];
const TOKEN_ID = /^([ox]([1-9]|1\d|20)|ball\d?|coach|k\d{1,2})$/; // imported drills can have more than five a side
const PRESET_TAGS = ['Man offense', 'Zone offense', 'Press break', 'Baseline OB', 'Sideline OB', 'Defense', 'Press', 'Drill'];
const PLAYERS_MODE = /[?#&]players\b/.test(location.search + location.hash);

/* Built-in overlays, in court feet. x runs baseline to baseline (0-84), y sideline to sideline (0-50).
   "dir: true" means the overlay depends on which way the ball attacks, so the flip switch mirrors it. */
const OVERLAYS = [
  {
    id: 'thirds-boxes', name: 'Jaws', dir: true,
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
    // Dead zone behind the free-throw line, an outlet box on each side, and the five running lanes
    // (rail, slot, middle, slot, rail) from there to the far baseline.
    id: 'break', name: 'Primary/Secondary Break', dir: true,
    shapes: [
      { k: 'area', x: 19, y: 0, w: 65, h: 9, fill: '#3a3a3a', op: 0.22 },    // rail
      { k: 'area', x: 19, y: 41, w: 65, h: 9, fill: '#3a3a3a', op: 0.22 },   // rail
      { k: 'area', x: 19, y: 9, w: 65, h: 6, fill: '#000000', op: 0.34 },    // slot
      { k: 'area', x: 19, y: 35, w: 65, h: 6, fill: '#000000', op: 0.34 },   // slot
      { k: 'area', x: 19, y: 15, w: 65, h: 20, fill: '#5a0a0a', op: 0.26},   // middle
      { k: 'area', x: 0, y: 0, w: 19, h: 50, fill: '#8c0000', op: 0.32},     // dead zone
      { k: 'area', x: 19, y: 0, w: 11, h: 10, fill: '#ffffff', op: 0.42, edge: '#ffffff' },  // outlet box
      { k: 'area', x: 19, y: 40, w: 11, h: 10, fill: '#ffffff', op: 0.42, edge: '#ffffff' }, // outlet box
      { k: 'dash', x1: 19, y1: 9, x2: 84, y2: 9, c: '#e8e2cf' }, { k: 'dash', x1: 19, y1: 15, x2: 84, y2: 15, c: '#e8e2cf' },
      { k: 'dash', x1: 19, y1: 35, x2: 84, y2: 35, c: '#e8e2cf' }, { k: 'dash', x1: 19, y1: 41, x2: 84, y2: 41, c: '#e8e2cf' },
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

/* Starting alignments, as (feet out from the baseline, feet across the floor). */
const OFFENSES = [
  { name: '5-out',        o: [[30, 25], [21, 43], [21, 7], [4, 46.5], [4, 3.5]] },
  { name: '4-out 1-in',   o: [[29, 18], [29, 32], [9, 46], [9, 4], [7, 31]] },
  { name: 'Horns',        o: [[31, 25], [4, 46.5], [4, 3.5], [20, 18], [20, 32]] },
  { name: '1-4 high',     o: [[33, 25], [20, 43], [20, 7], [20, 18], [20, 32]] },
  { name: 'Box (BLOB)',   o: [[-2.6, 19], [7, 18], [7, 32], [19, 18], [19, 32]] },
];
const DEFENSES = [
  { name: 'Man to man', man: true },
  { name: '2-3 zone', x: [[20, 17], [20, 33], [9, 8], [9, 42], [7, 25]] },
  { name: '3-2 zone', x: [[23, 25], [19, 11], [19, 39], [7, 18], [7, 32]] },
  { name: '1-3-1 zone', x: [[25, 25], [16, 9], [16, 41], [15, 25], [5, 25]] },
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
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const kindOf = id => (id.startsWith('ball') ? 'b' : id === 'coach' ? 'c' : id[0]); // o, x, b, c, k (cone)
const isExtra = id => !BASE_TOKENS.includes(id);

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
  for (let i = 1; i < pts.length; i++) L += dist(pts[i], pts[i - 1]);
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
const endOf = view => (view === 'halfR' ? 'R' : 'L');
// (feet from the baseline, feet across) at the chosen end -> world pixels
const spot = (p, end) => [Math.round(fx(end === 'R' ? 84 - p[0] : p[0])), Math.round(fy(p[1]))];
function manDefense(o) { // each defender a third of the way from the player to the basket
  return o.map(p => [p[0] + (5.25 - p[0]) * 0.3, p[1] + (25 - p[1]) * 0.3]);
}
function defaultTokens(view) {
  const end = endOf(view), o = OFFENSES[0].o, x = manDefense(o), out = {};
  o.forEach((p, i) => { out['o' + (i + 1)] = spot(p, end); });
  x.forEach((p, i) => { out['x' + (i + 1)] = spot(p, end); });
  out.ball = spot([o[0][0] + 1.6, o[0][1] + 2.6], end);
  return out;
}
function blankState(view) {
  return {
    v: DATA_V, id: null, name: '', view, ovl: {}, flip: false, tags: [], notes: '', labels: {}, team: false,
    frames: [{ ink: [], tok: defaultTokens(view) }], cur: 0, tokMoved: false, bg: true, show: { o: false, x: false, b: false }, // a clean court: pieces are added from the Pieces panel
  };
}

let state = blankState('full');
const F = () => state.frames[state.cur];
let tool = 'cut', color = COLORS[0];
let fingerDraw = true, penSeen = false;
let customOverlays = [], teamOverlays = [], teamPlays = [];
let lib = { sets: [], aligns: [] }; // overlay sets and saved alignments, kept on this iPad
let dirty = false, presenting = false, presentLaser = true, anim = null;
const undoStack = [], redoStack = [];
const book = { q: '', tag: '', sort: 'recent' };

const board = $('board'), world = $('world');
const gOvl = $('ovl'), gInk = $('ink'), gLive = $('live'), gTok = $('tok');
const courtImg = new Image(); courtImg.src = 'court.jpg';

/* ---------- painting ---------- */
function fillOverlays(g, st) {
  g.replaceChildren();
  const rot = viewOf(st).rot;
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
      } else if (s.k === 'area') {
        const x = flip ? 84 - s.x - s.w : s.x;
        const r = S('rect', { x, y: s.y, width: s.w, height: s.h, fill: s.fill, 'fill-opacity': s.op });
        if (s.edge) { r.setAttribute('stroke', s.edge); r.setAttribute('stroke-width', 0.25); r.setAttribute('stroke-dasharray', '1 0.8'); }
        ft.append(r);
      } else if (s.k === 'ln') {
        ft.append(S('line', { x1: mx(s.x1), y1: s.y1, x2: mx(s.x2), y2: s.y2, stroke: '#ffffff', 'stroke-width': 0.13, 'stroke-linecap': 'square' }));
      } else if (s.k === 'dash') {
        ft.append(S('line', { x1: mx(s.x1), y1: s.y1, x2: mx(s.x2), y2: s.y2, stroke: s.c || '#00142d', 'stroke-width': s.c ? 0.25 : 0.45, 'stroke-dasharray': s.c ? '1.2 1' : '1.9 1.5' }));
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
  for (const o of [...customOverlays, ...teamOverlays]) {
    if (!st.ovl[o.id]) continue;
    const layer = S('g', { opacity: 0.85, 'pointer-events': 'none' });
    for (const it of o.items) { const n = inkNode(it); n.removeAttribute('data-ink'); layer.append(n); }
    g.append(layer);
  }
}
// The court as plain black lines on white, for when the background is hidden. Drawn in feet.
function courtLines(withFill) {
  const g = S('g', {});
  if (withFill) g.append(S('rect', { width: IMG_W, height: IMG_H, fill: '#ffffff' }));
  const ft = S('g', { transform: `translate(${OX} ${OY}) scale(${SX} ${SY})`, fill: 'none', stroke: '#111111', 'stroke-width': 0.17, 'pointer-events': 'none' });
  const add = (tag, attrs) => ft.append(S(tag, attrs));
  add('rect', { x: 0, y: 0, width: 84, height: 50 });
  add('line', { x1: 42, y1: 0, x2: 42, y2: 50 });
  add('circle', { cx: 42, cy: 25, r: 6 });
  for (const right of [false, true]) {
    const X = x => (right ? 84 - x : x), sweep = right ? 0 : 1;
    add('path', { d: `M${X(0)} 5.25 L${X(5.25)} 5.25 A19.75 19.75 0 0 ${sweep} ${X(5.25)} 44.75 L${X(0)} 44.75` }); // three-point line
    add('path', { d: `M${X(0)} 19 L${X(19)} 19 L${X(19)} 31 L${X(0)} 31` });                                     // lane
    add('path', { d: `M${X(19)} 19 A6 6 0 0 ${sweep} ${X(19)} 31` });                                             // free-throw circle
    add('line', { x1: X(4), y1: 22, x2: X(4), y2: 28 });                                                          // backboard
    add('circle', { cx: X(5.25), cy: 25, r: 0.75 });                                                              // rim
    for (const x of [7.6, 11.2, 14.3, 17.5]) { // lane marks
      add('line', { x1: X(x), y1: 19, x2: X(x), y2: 18.3 });
      add('line', { x1: X(x), y1: 31, x2: X(x), y2: 31.7 });
    }
  }
  g.append(ft);
  return g;
}
function fillPic(g, st, courtImage) {
  g.replaceChildren();
  if (courtImage) {
    const onPic = st.view === 'pic' && st.pic;
    courtImage.style.display = onPic || st.bg === false ? 'none' : '';
    $('blankBoard').style.display = !onPic && st.bg === false ? '' : 'none';
  }
  if (!st.pic) return;
  if (st.view === 'pic') {
    g.removeAttribute('transform');
    g.append(S('image', { href: st.pic.src, x: 0, y: 0, width: IMG_W, height: picHeight(st.pic), preserveAspectRatio: 'none' }));
    return;
  }
  const v = viewOf(st), [x, y, w, h] = v.vb;
  if (v.inv) g.setAttribute('transform', v.inv); else g.removeAttribute('transform');
  g.append(S('image', { href: st.pic.src, x, y, width: w, height: h, preserveAspectRatio: 'xMidYMid meet', opacity: st.picOp || 0.45, 'pointer-events': 'none' }));
}
function fillInk(g, fr) {
  g.replaceChildren(...fr.ink.map(inkNode));
}
function tokenNode(id, pos, rot, labels) {
  const g = S('g', { 'data-tok': id, transform: `translate(${pos[0]} ${pos[1]}) rotate(${-rot})` });
  g.append(S('circle', { r: 46, fill: 'transparent' }));
  const kind = kindOf(id);
  if (kind === 'b') {
    g.append(S('circle', { r: 14, fill: '#e8731a', stroke: '#111111', 'stroke-width': 2.5 }));
    return g;
  }
  if (kind === 'k') {
    g.append(S('polygon', { points: '0,-22 17,16 -17,16', fill: '#ff7a00', stroke: '#111111', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    return g;
  }
  const off = kind === 'o', coach = kind === 'c';
  const label = String((labels && labels[id]) || (coach ? 'C' : off ? id.slice(1) : 'X' + id.slice(1))).slice(0, 3);
  g.append(S('circle', { r: 25, fill: coach ? '#00142d' : off ? '#b20000' : '#ffffff', stroke: off || coach ? '#ffffff' : '#3c0019', 'stroke-width': 3 }));
  const size = label.length >= 3 ? 19 : label.length === 2 ? 24 : 30;
  const t = S('text', { 'text-anchor': 'middle', y: size * 0.35, 'font-size': size, 'font-weight': 700, fill: off || coach ? '#ffffff' : '#3c0019' });
  t.textContent = label;
  g.append(t);
  return g;
}
const paintOrder = { k: 0, c: 1, x: 2, o: 3, b: 4 };
function fillTokens(g, st, fr) {
  g.replaceChildren();
  const rot = viewOf(st).rot;
  const ids = Object.keys(fr.tok).sort((a, b) => paintOrder[kindOf(a)] - paintOrder[kindOf(b)]);
  for (const id of ids) {
    const kind = kindOf(id);
    if (kind in st.show && !st.show[kind]) continue;
    if (st.hidden && st.hidden[id]) continue; // a piece this play does not use
    g.append(tokenNode(id, fr.tok[id], rot, st.labels));
  }
}
function applyView() {
  const v = viewOf(state);
  board.setAttribute('viewBox', v.vb.join(' '));
  if (v.tf) world.setAttribute('transform', v.tf); else world.removeAttribute('transform');
  const shown = state.view === 'tall' ? 'full' : state.view === 'halfR' ? 'halfL' : state.view;
  for (const b of $('views').children) { b.setAttribute('aria-pressed', String(b.dataset.view === shown)); if (b.dataset.view === 'pic') b.hidden = !state.pic; }
}
function paintBoard() {
  fillPic($('pic'), state, $('courtImage'));
  fillOverlays(gOvl, state); fillInk(gInk, F()); fillTokens(gTok, state, F());
  syncChrome();
}
function paintAll() { applyView(); paintBoard(); }
function syncChrome() {
  $('playName').textContent = state.name || 'Untitled play';
  $('saveBtn').textContent = dirty || !state.id ? 'Save' : 'Saved';
  $('undoBtn').disabled = !undoStack.length;
  $('redoBtn').disabled = !redoStack.length;
  $('showO').setAttribute('aria-pressed', String(state.show.o));
  $('showX').setAttribute('aria-pressed', String(state.show.x));
  $('showB').setAttribute('aria-pressed', String(state.show.b));
  $('flipChk').checked = state.flip;
  $('bgBtn').setAttribute('aria-pressed', String(state.bg === false));
  $('bgBtn').querySelector('span').textContent = state.bg === false ? 'Show BG' : 'Hide BG';
  $('picSection').hidden = !state.pic;
  if (state.pic) $('picOpacity').value = String(Math.round((state.picOp || 0.45) * 100));
  const label = `${state.cur + 1} / ${state.frames.length}`;
  $('frameLabel').textContent = label; $('pFrameLabel').textContent = label;
  for (const id of ['framePrev', 'pPrev']) $(id).disabled = state.cur === 0;
  for (const id of ['frameNext', 'pNext']) $(id).disabled = state.cur >= state.frames.length - 1;
  $('frameDel').disabled = state.frames.length < 2;
  for (const id of ['playBtn', 'pPlay']) $(id).querySelector('span').textContent = anim ? 'Stop' : 'Play';
  $('pLaser').setAttribute('aria-pressed', String(presentLaser));
}

/* ---------- history and autosave ---------- */
const snap = () => JSON.stringify({ frames: state.frames, cur: state.cur, tokMoved: state.tokMoved });
function remember() { // call BEFORE changing ink, tokens or frames
  undoStack.push(snap());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}
function restore(json) {
  Object.assign(state, JSON.parse(json));
  touched(); paintBoard();
}
function undo() { if (undoStack.length && !anim) { redoStack.push(snap()); restore(undoStack.pop()); } }
function redo() { if (redoStack.length && !anim) { undoStack.push(snap()); restore(redoStack.pop()); } }
function touched() {
  dirty = true;
  if (!PLAYERS_MODE) { try { localStorage.setItem('wb.current', JSON.stringify(state)); } catch (e) { /* storage may be unavailable */ } }
  syncChrome();
}
function savePrefs() {
  try { localStorage.setItem('wb.prefs', JSON.stringify({ tool, color, fingerDraw, penSeen })); } catch (e) { /* ignore */ }
}
function saveLib(quiet) {
  if (!quiet) lib.updated = Date.now();
  try { localStorage.setItem('wb.lib', JSON.stringify(lib)); } catch (e) { /* ignore */ }
  if (!quiet && onLocalChange) onLocalChange('lib');
}
function cleanLib(saved) {
  const out = { sets: [], aligns: [], updated: Number(saved && saved.updated) || 0 };
  if (!saved) return out;
  out.sets = (Array.isArray(saved.sets) ? saved.sets : []).filter(s => s && Array.isArray(s.ids)).map(s => ({ id: String(s.id), name: String(s.name).slice(0, 30), ids: s.ids.map(String) }));
  out.aligns = (Array.isArray(saved.aligns) ? saved.aligns : []).filter(a => a && a.tok).map(a => ({ id: String(a.id), name: String(a.name).slice(0, 30), tok: cleanTokens(a.tok, [0, 0], 'halfL') }));
  return out;
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
let onLocalChange = null; // cloud.js sets this so it hears about every local save and delete
const dbPut = (name, v, quiet) => {
  if (!quiet && onLocalChange) onLocalChange('put', name, v);
  return store(name, 'readwrite', s => (s ? s.put(v) : void mem[name].set(v.id, v)));
};
const dbDel = (name, id, quiet) => {
  if (!quiet && onLocalChange) onLocalChange('del', name, id);
  return store(name, 'readwrite', s => (s ? s.delete(id) : void mem[name].delete(id)));
};

/* ---------- validating anything loaded from disk or an imported file ---------- */
function cleanInk(list, shift) {
  const [dx, dy] = shift || [0, 0];
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || !INK_TYPES.includes(it.t) || !/^#[0-9a-f]{6}$/i.test(it.c) || !Array.isArray(it.p)) continue;
    const p = it.p.slice(0, 4000).map((n, i) => Number(n) + (i % 2 === 0 ? dx : dy));
    if (p.length < 4 || p.some(n => !Number.isFinite(n))) continue;
    out.push({ id: uid(), t: it.t, c: it.c, p });
  }
  return out;
}
function cleanTokens(raw, shift, view) {
  const [dx, dy] = shift, out = defaultTokens(view);
  if (raw && typeof raw === 'object') {
    for (const id in raw) {
      const p = raw[id];
      if (TOKEN_ID.test(id) && Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) out[id] = [+p[0] + dx, +p[1] + dy];
    }
  }
  return out;
}
function cleanPic(p) {
  if (!p || typeof p.src !== 'string' || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.src) || p.src.length > 3000000) return null;
  const w = Number(p.w), h = Number(p.h);
  return w > 0 && h > 0 ? { src: p.src, w, h } : null;
}
function cleanPlay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pic = cleanPic(raw.pic);
  const view = raw.view === 'pic' && pic ? 'pic' : VIEWS[raw.view] ? raw.view : 'full';
  const st = blankState(view), shift = shiftFor(raw.v);
  st.id = typeof raw.id === 'string' ? raw.id.slice(0, 40) : null;
  st.name = String(raw.name || '').slice(0, 60);
  st.flip = !!raw.flip;
  st.tokMoved = !!raw.tokMoved;
  st.bg = raw.bg !== false;
  if (pic) { st.pic = pic; st.picOp = Math.max(0.1, Math.min(1, Number(raw.picOp) || 0.45)); }
  st.team = !!raw.team;
  st.notes = String(raw.notes || '').slice(0, 4000);
  if (raw.hidden && typeof raw.hidden === 'object') { st.hidden = {}; for (const id in raw.hidden) if (TOKEN_ID.test(id) && raw.hidden[id]) st.hidden[id] = true; }
  st.tags = (Array.isArray(raw.tags) ? raw.tags : []).map(t => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 12);
  if (raw.labels && typeof raw.labels === 'object') {
    for (const id in raw.labels) if (/^[ox]\d{1,2}$/.test(id) && raw.labels[id]) st.labels[id] = String(raw.labels[id]).slice(0, 3);
  }
  const frames = Array.isArray(raw.frames) && raw.frames.length ? raw.frames.slice(0, 30) : [{ ink: raw.ink, tok: raw.tok }];
  st.frames = frames.map(f => ({ ink: cleanInk(f && f.ink, shift), tok: cleanTokens(f && f.tok, shift, view) }));
  st.cur = Math.max(0, Math.min(st.frames.length - 1, Number(raw.cur) || 0));
  if (raw.show) st.show = { o: raw.show.o !== false, x: raw.show.x !== false, b: raw.show.b !== false };
  if (raw.ovl && typeof raw.ovl === 'object') for (const k in raw.ovl) if (raw.ovl[k]) st.ovl[String(k).slice(0, 40)] = true;
  st.updated = Number(raw.updated) || Date.now();
  return st;
}
function cleanOverlay(o) {
  return { v: DATA_V, id: String(o.id).slice(0, 40), name: String(o.name || 'Overlay').slice(0, 40), updated: Number(o.updated) || 0, items: cleanInk(o.items, shiftFor(o.v)) };
}

/* ---------- frames and animation ---------- */
// Which pieces a frame's lines move: a cut, dribble or screen that starts on a player moves that player;
// a dribble carries the ball with it; a pass that starts near the ball sends the ball to the end of the line.
function movesFor(fr) {
  const moves = {};
  const ids = Object.keys(fr.tok);
  const shown = id => !(state.hidden && state.hidden[id]);
  const players = ids.filter(id => 'oxc'.includes(kindOf(id)) && shown(id)), balls = ids.filter(id => kindOf(id) === 'b' && shown(id));
  for (const it of fr.ink) {
    if (!['cut', 'dribble', 'screen'].includes(it.t)) continue;
    const pts = toPts(it.p);
    let best = null, bd = 60;
    for (const id of players) {
      if (moves[id]) continue;
      const d = dist(fr.tok[id], pts[0]);
      if (d < bd) { bd = d; best = id; }
    }
    if (!best) continue;
    moves[best] = [fr.tok[best], ...pts];
    if (it.t === 'dribble') {
      for (const b of balls) {
        if (moves[b] || dist(fr.tok[b], fr.tok[best]) > 80) continue;
        const off = [fr.tok[b][0] - fr.tok[best][0], fr.tok[b][1] - fr.tok[best][1]];
        moves[b] = moves[best].map(p => [p[0] + off[0], p[1] + off[1]]);
      }
    }
  }
  for (const it of fr.ink) {
    if (it.t !== 'pass') continue;
    const pts = toPts(it.p);
    let best = null, bd = 110;
    for (const b of balls) {
      if (moves[b]) continue;
      const d = dist(fr.tok[b], pts[0]);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) continue;
    const [ux, uy] = endDir(pts), e = pts[pts.length - 1];
    moves[best] = [fr.tok[best], ...pts.slice(0, -1), [e[0] - ux * 36, e[1] - uy * 36]];
  }
  return moves;
}
function endPositions(fr) {
  const tok = clone(fr.tok), moves = movesFor(fr);
  for (const id in moves) { const e = moves[id][moves[id].length - 1]; tok[id] = [Math.round(e[0]), Math.round(e[1])]; }
  return tok;
}
function pointAt(pts, t) {
  const total = pathLength(pts);
  let want = total * t;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i], pts[i - 1]);
    if (want <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(1, want / seg) : 1;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    want -= seg;
  }
  return pts[pts.length - 1];
}
function gotoFrame(i) {
  if (anim || i < 0 || i >= state.frames.length) return;
  state.cur = i; touched(); paintBoard();
}
function addFrame() {
  if (anim) return;
  if (state.frames.length >= 30) { toast('A play can have up to 30 steps.'); return; }
  remember();
  state.frames.splice(state.cur + 1, 0, { ink: [], tok: endPositions(F()) });
  state.cur++; state.tokMoved = true;
  touched(); paintBoard();
  toast(`Step ${state.cur + 1} added. Players start where their lines ended.`);
}
function deleteFrame() {
  if (anim || state.frames.length < 2) return;
  remember();
  state.frames.splice(state.cur, 1);
  state.cur = Math.min(state.cur, state.frames.length - 1);
  touched(); paintBoard();
  toast('Step deleted.', 'Undo', undo);
}
function stopAnim() {
  if (!anim) return;
  cancelAnimationFrame(anim.raf); clearTimeout(anim.timer);
  state.cur = anim.start; anim = null;
  paintBoard();
}
function playAnim() {
  if (anim) { stopAnim(); return; }
  const start = state.cur, first = state.frames.length > 1 ? 0 : state.cur;
  anim = { start, raf: 0, timer: 0 };
  const run = i => {
    if (!anim) return;
    state.cur = i; paintBoard();
    const moves = movesFor(state.frames[i]), ids = Object.keys(moves), rot = viewOf(state).rot;
    const els = {};
    for (const id of ids) els[id] = gTok.querySelector(`[data-tok="${id}"]`);
    const t0 = performance.now(), dur = ids.length ? 1500 : 500;
    const tick = now => {
      if (!anim) return;
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      for (const id of ids) {
        if (!els[id]) continue;
        const p = pointAt(moves[id], e);
        els[id].setAttribute('transform', `translate(${r1(p[0])} ${r1(p[1])}) rotate(${-rot})`);
      }
      if (t < 1) { anim.raf = requestAnimationFrame(tick); return; }
      if (i < state.frames.length - 1) anim.timer = setTimeout(() => run(i + 1), 550);
      else anim.timer = setTimeout(stopAnim, 1300);
    };
    anim.raf = requestAnimationFrame(tick);
  };
  run(first);
}

/* ---------- pointer input: Pencil draws, a finger moves players ---------- */
let active = null; // the one pointer we are following
function worldPoint(e) {
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(world.getScreenCTM().inverse());
  return [r1(p.x), r1(p.y)];
}
function eraseAt(e) {
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const extra = hit && hit.closest && hit.closest('#tok [data-tok]');
  if (extra && isExtra(extra.getAttribute('data-tok'))) {
    if (!active.changed) { remember(); active.changed = true; }
    for (const fr of state.frames) delete fr.tok[extra.getAttribute('data-tok')];
    extra.remove();
    return;
  }
  const g = hit && hit.closest && hit.closest('#ink [data-ink]');
  if (!g) return;
  if (!active.changed) { remember(); active.changed = true; }
  F().ink = F().ink.filter(it => it.id !== g.getAttribute('data-ink'));
  g.remove();
}
const currentTool = () => (PLAYERS_MODE || (presenting && presentLaser) ? 'laser' : tool);
board.addEventListener('pointerdown', e => {
  if (active || anim || e.button > 0) return;
  const pen = e.pointerType === 'pen', t = currentTool();
  if (pen && !penSeen) {
    penSeen = true; fingerDraw = false; $('fingerChk').checked = false; savePrefs();
    toast('Pencil found. Fingers now only move players.');
  }
  const tokEl = e.target.closest && e.target.closest('#tok [data-tok]');
  const mayDraw = pen || e.pointerType === 'mouse' || fingerDraw || t === 'laser';
  let mode = null;
  if (PLAYERS_MODE) mode = 'draw';
  else if (tokEl && t !== 'erase' && (t === 'move' || !pen)) mode = 'drag';
  else if (t === 'move') mode = null;
  else if (mayDraw) mode = t === 'erase' ? 'erase' : 'draw';
  if (!mode) return;
  e.preventDefault();
  try { board.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers cannot be captured */ }
  active = { id: e.pointerId, mode, tool: t, changed: false };
  const p = worldPoint(e);
  if (mode === 'drag') {
    active.tok = tokEl.getAttribute('data-tok'); active.el = tokEl;
    const cur = F().tok[active.tok];
    active.off = [cur[0] - p[0], cur[1] - p[1]];
    gTok.append(tokEl); // bring to front
  } else if (mode === 'draw') {
    active.pts = [p];
    active.path = t === 'laser'
      ? S('path', { class: 'laser', fill: 'none', stroke: '#ff2a2a', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
      : S('path', { fill: t === 'zone' ? color : 'none', 'fill-opacity': 0.2, stroke: color, 'stroke-width': 5.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    gLive.append(active.path);
  } else eraseAt(e);
});
board.addEventListener('pointermove', e => {
  if (!active || e.pointerId !== active.id) return;
  if (active.mode === 'drag') {
    const p = worldPoint(e);
    const x = Math.round(Math.max(0, Math.min(IMG_W, p[0] + active.off[0]))), y = Math.round(Math.max(0, Math.min(IMG_H, p[1] + active.off[1])));
    if (!active.changed) { remember(); active.changed = true; }
    F().tok[active.tok] = [x, y];
    active.el.setAttribute('transform', `translate(${x} ${y}) rotate(${-viewOf(state).rot})`);
  } else if (active.mode === 'draw') {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      const p = worldPoint(ev), last = active.pts[active.pts.length - 1];
      if (dist(p, last) >= 2.5) active.pts.push(p);
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
    if (a.tool === 'laser') { // the laser never becomes part of the play: it fades and is gone
      if (a.pts.length > 1) a.path.setAttribute('d', smooth(a.pts));
      a.path.classList.add('fade');
      setTimeout(() => a.path.remove(), 1700);
      return;
    }
    a.path.remove();
    const pts = simplify(a.pts, 1.6);
    if (e.type === 'pointerup' && pts.length >= 2 && pathLength(pts) >= 14) {
      remember();
      const it = { id: uid(), t: a.tool, c: color, p: pts.flat() };
      F().ink.push(it);
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
  if (id === 'laser') return S('svg', { viewBox: '0 0 24 24' }, S('path', { d: 'M4 20 14 10M12 4v3M20 12h-3M18 6l-2 2M18 18l-2-2M6 6l2 2' }), S('circle', { cx: 15, cy: 9, r: 2 }));
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
    b.addEventListener('click', () => { setColor(c); if (['move', 'erase', 'laser'].includes(tool)) setTool('cut'); });
    $('colorBtns').append(b);
  });
  for (const [id, label] of [['full', 'Full'], ['halfL', 'Half']]) { // the other views still open if a saved play uses one
    const b = H('button', { 'data-view': id, 'aria-pressed': 'false', 'aria-label': id === 'full' ? 'Full court' : 'Half court' }, label);
    b.addEventListener('click', () => setView(id));
    $('views').append(b);
  }
  for (const o of OFFENSES) {
    const b = H('button', { class: 'btn small' }, o.name);
    b.addEventListener('click', () => applyAlignment({ o: o.o }));
    $('offBtns').append(b);
  }
  for (const d of DEFENSES) {
    const b = H('button', { class: 'btn small' }, d.name);
    b.addEventListener('click', () => applyAlignment(d.man ? { man: true } : { x: d.x }));
    $('defBtns').append(b);
  }
  for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'x1', 'x2', 'x3', 'x4', 'x5']) {
    const inp = H('input', { type: 'text', id: 'lab-' + id, maxlength: '3', placeholder: id[0] === 'o' ? id[1] : 'X' + id[1], 'aria-label': 'Label for ' + id.toUpperCase(), autocomplete: 'off', autocapitalize: 'characters' });
    inp.addEventListener('input', () => {
      const v = inp.value.trim().slice(0, 3);
      if (v) state.labels[id] = v; else delete state.labels[id];
      touched(); fillTokens(gTok, state, F());
    });
    $(id[0] === 'o' ? 'labO' : 'labX').append(inp);
  }
  const picBtn = H('button', { 'data-view': 'pic', 'aria-pressed': 'false', 'aria-label': 'Picture', hidden: '' }, 'Pic');
  picBtn.addEventListener('click', () => setView('pic'));
  $('views').append(picBtn);
}
function setView(id) {
  if (state.view === id || anim) return;
  state.view = id;
  if (!state.tokMoved) for (const fr of state.frames) Object.assign(fr.tok, defaultTokens(id));
  touched(); paintAll();
}
function toggleShow(k) { state.show[k] = !state.show[k]; touched(); fillTokens(gTok, state, F()); }
$('showO').addEventListener('click', () => toggleShow('o'));
$('showX').addEventListener('click', () => toggleShow('x'));
$('showB').addEventListener('click', () => toggleShow('b'));
$('resetTok').addEventListener('click', () => {
  remember(); Object.assign(F().tok, defaultTokens(state.view)); state.tokMoved = false; delete state.hidden; touched(); fillTokens(gTok, state, F());
});
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('trashBtn').addEventListener('click', () => {
  if (anim) return;
  remember();
  const fr = F();
  fr.ink = [];
  if (state.frames.length === 1) { Object.assign(fr.tok, defaultTokens(state.view)); state.tokMoved = false; }
  touched(); paintBoard();
  toast(state.frames.length > 1 ? `Step ${state.cur + 1} cleared.` : 'Board cleared.', 'Undo', undo);
});
$('framePrev').addEventListener('click', () => gotoFrame(state.cur - 1));
$('frameNext').addEventListener('click', () => gotoFrame(state.cur + 1));
$('frameAdd').addEventListener('click', addFrame);
$('frameDel').addEventListener('click', deleteFrame);
$('playBtn').addEventListener('click', playAnim);
$('bgBtn').addEventListener('click', () => { state.bg = state.bg === false; touched(); paintBoard(); });

/* ---------- pieces: alignments, extra pieces, labels ---------- */
function applyAlignment(a) {
  if (anim) return;
  remember();
  const fr = F(), end = endOf(state.view);
  if (state.hidden) { for (const id of BASE_TOKENS) if ((a.tok) || (a.o && (id[0] === 'o' || id === 'ball')) || ((a.x || a.man) && id[0] === 'x')) delete state.hidden[id]; }
  if (a.tok) Object.assign(fr.tok, clone(a.tok));
  if (a.o) {
    a.o.forEach((p, i) => { fr.tok['o' + (i + 1)] = spot(p, end); });
    fr.tok.ball = spot([a.o[0][0] + 1.6, a.o[0][1] + 2.6], end);
    state.show.o = true; state.show.b = true;
  }
  if (a.x) { a.x.forEach((p, i) => { fr.tok['x' + (i + 1)] = spot(p, end); }); state.show.x = true; }
  if (a.man) { // put each defender between their player and the nearer basket
    for (let i = 1; i <= 5; i++) {
      const o = fr.tok['o' + i], right = o[0] > fx(42), bx = fx(right ? 84 - 5.25 : 5.25), by = fy(25);
      fr.tok['x' + i] = [Math.round(o[0] + (bx - o[0]) * 0.3), Math.round(o[1] + (by - o[1]) * 0.3)];
    }
    state.show.x = true;
  }
  state.tokMoved = true;
  touched(); fillTokens(gTok, state, fr);
}
function addPiece(kind) {
  if (anim) return;
  let id = kind;
  if (kind === 'cone') {
    let n = 1; while (F().tok['k' + n]) n++;
    if (n > 20) { toast('That is plenty of cones.'); return; }
    id = 'k' + n;
  } else if (F().tok[id]) { toast(kind === 'coach' ? 'The coach is already on the board.' : 'The second ball is already on the board.'); return; }
  remember();
  const v = viewOf(state), end = endOf(state.view);
  const count = Object.keys(F().tok).filter(isExtra).length;
  const pos = spot([36 - (count % 5) * 3, 6 + Math.floor(count / 5) * 3], v === VIEWS.full || v === VIEWS.tall ? 'L' : end);
  for (const fr of state.frames) fr.tok[id] = pos.slice();
  touched(); fillTokens(gTok, state, F());
}
$('addCone').addEventListener('click', () => addPiece('cone'));
$('addCoach').addEventListener('click', () => addPiece('coach'));
$('addBall').addEventListener('click', () => addPiece('ball2'));
$('clearExtras').addEventListener('click', () => {
  if (!Object.keys(F().tok).some(isExtra)) return;
  remember();
  for (const fr of state.frames) for (const id of Object.keys(fr.tok)) if (isExtra(id)) delete fr.tok[id];
  touched(); fillTokens(gTok, state, F());
});
function sureButton(label, act) { // a delete button that asks once more before acting
  const b = H('button', { class: 'link' }, label);
  b.addEventListener('click', () => {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Really delete?'; return; }
    act();
  });
  return b;
}
function renderAligns() {
  const ul = $('alignList');
  ul.replaceChildren();
  for (const a of lib.aligns) {
    const use = H('button', { class: 'btn small' }); use.textContent = a.name;
    use.addEventListener('click', () => applyAlignment({ tok: a.tok }));
    ul.append(H('li', {}, use, sureButton('Delete', () => { lib.aligns = lib.aligns.filter(x => x.id !== a.id); saveLib(); renderAligns(); })));
  }
}
$('alignSave').addEventListener('click', () => {
  const name = $('alignName').value.trim() || 'Alignment ' + (lib.aligns.length + 1);
  const tok = {};
  for (const id of BASE_TOKENS) tok[id] = F().tok[id].slice();
  lib.aligns.push({ id: uid(), name: name.slice(0, 30), tok });
  saveLib(); $('alignName').value = ''; renderAligns();
  toast(`Saved "${name}". It will put players back in these exact spots.`);
});
function syncLabels() {
  for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'x1', 'x2', 'x3', 'x4', 'x5']) $('lab-' + id).value = state.labels[id] || '';
}

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

/* ---------- side panels ---------- */
function openPanel(which) { // 'overlays', 'pieces' or null
  const pairs = [['overlays', 'overlayPanel', 'overlayBtn'], ['pieces', 'piecesPanel', 'piecesBtn']];
  for (const [name, panel, btn] of pairs) {
    const show = name === which && $(panel).hidden;
    $(panel).hidden = !show;
    $(btn).setAttribute('aria-expanded', String(show));
    if (show && name === 'overlays') renderOverlayList();
    if (show && name === 'pieces') { renderAligns(); syncLabels(); }
  }
}
$('overlayBtn').addEventListener('click', () => openPanel('overlays'));
$('piecesBtn').addEventListener('click', () => openPanel('pieces'));

function renderOverlayList() {
  const ul = $('overlayList');
  ul.replaceChildren();
  const all = [...OVERLAYS.map(o => ({ o, kind: 'built' })), ...customOverlays.map(o => ({ o, kind: 'mine' })), ...teamOverlays.map(o => ({ o, kind: 'team' }))];
  for (const { o, kind } of all) {
    const cb = H('input', { type: 'checkbox', id: 'ov-' + o.id });
    cb.checked = !!state.ovl[o.id];
    cb.addEventListener('change', () => {
      if (cb.checked) state.ovl[o.id] = true; else delete state.ovl[o.id];
      touched(); fillOverlays(gOvl, state);
    });
    const name = H('span'); name.textContent = o.name + (kind === 'team' ? ' (team)' : '');
    const li = H('li', {}, H('label', { class: 'check' }, cb, name));
    if (kind === 'mine') {
      li.append(sureButton('Delete', async () => {
        await dbDel('overlays', o.id);
        customOverlays = customOverlays.filter(x => x.id !== o.id);
        delete state.ovl[o.id];
        renderOverlayList(); fillOverlays(gOvl, state);
      }));
    }
    ul.append(li);
  }
  const sets = $('setList');
  sets.replaceChildren();
  if (!lib.sets.length) sets.append(H('li', { class: 'empty' }, 'No sets yet.'));
  for (const s of lib.sets) {
    const use = H('button', { class: 'btn small' }); use.textContent = s.name;
    use.addEventListener('click', () => {
      state.ovl = {};
      for (const id of s.ids) state.ovl[id] = true;
      touched(); fillOverlays(gOvl, state); renderOverlayList();
    });
    sets.append(H('li', {}, use, sureButton('Delete', () => { lib.sets = lib.sets.filter(x => x.id !== s.id); saveLib(); renderOverlayList(); })));
  }
}
$('flipChk').addEventListener('change', e => { state.flip = e.target.checked; touched(); fillOverlays(gOvl, state); });
$('fingerChk').addEventListener('change', e => { fingerDraw = e.target.checked; savePrefs(); });
$('ovlSave').addEventListener('click', async () => {
  if (!F().ink.length) { toast('Draw the areas on the board first.'); return; }
  const name = $('ovlName').value.trim() || 'Overlay ' + (customOverlays.length + 1);
  const o = { v: DATA_V, id: 'c-' + uid(), name: name.slice(0, 40), updated: Date.now(), items: clone(F().ink) };
  try { await dbPut('overlays', o); } catch (e) { toast('Could not save the overlay on this iPad.'); return; }
  customOverlays.push(o);
  remember();
  F().ink = []; state.ovl[o.id] = true;
  $('ovlName').value = '';
  touched(); paintBoard(); renderOverlayList();
  toast(`Saved "${o.name}" as an overlay.`);
});
$('setSave').addEventListener('click', () => {
  const ids = Object.keys(state.ovl);
  if (!ids.length) { toast('Switch on the overlays you want in the set first.'); return; }
  const name = $('setName').value.trim() || 'Set ' + (lib.sets.length + 1);
  lib.sets.push({ id: uid(), name: name.slice(0, 30), ids });
  saveLib(); $('setName').value = ''; renderOverlayList();
});

/* ---------- play details: name, tags, notes ---------- */
let dlgDone = null;
function askDetails(title) {
  $('dlgTitle').textContent = title;
  $('nameInput').value = state.name || '';
  $('notesInput').value = state.notes || '';
  $('teamChk').checked = !!state.team;
  const chosen = new Set(state.tags);
  const chips = $('tagChips');
  chips.replaceChildren();
  for (const t of PRESET_TAGS) {
    const b = H('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(chosen.has(t)) }, t);
    b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
    chips.append(b);
  }
  $('tagsInput').value = state.tags.filter(t => !PRESET_TAGS.includes(t)).join(', ');
  $('dialog').hidden = false;
  $('nameInput').focus();
  return new Promise(res => { dlgDone = res; });
}
function closeDialog(v) { $('dialog').hidden = true; if (dlgDone) { dlgDone(v); dlgDone = null; } }
$('dlgCancel').addEventListener('click', () => closeDialog(null));
$('nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  if (!name) return;
  const tags = [...$('tagChips').children].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);
  for (const t of $('tagsInput').value.split(',')) { const v = t.trim().slice(0, 30); if (v && !tags.includes(v)) tags.push(v); }
  closeDialog({ name: name.slice(0, 60), tags: tags.slice(0, 12), notes: $('notesInput').value.slice(0, 4000), team: $('teamChk').checked });
});
async function savePlay(details) {
  if (PLAYERS_MODE) return;
  if (!state.id || !state.name || details) {
    const d = await askDetails(state.id ? 'Play details' : 'Save play');
    if (!d) return;
    Object.assign(state, d);
  }
  if (!state.id || state.id.startsWith('t-')) state.id = uid();
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
  stopAnim();
  state = st; undoStack.length = 0; redoStack.length = 0; dirty = false;
  if (!PLAYERS_MODE) { try { localStorage.setItem('wb.current', JSON.stringify(state)); } catch (e) { /* ignore */ } }
  paintAll();
  if (!$('overlayPanel').hidden) renderOverlayList();
  if (!$('piecesPanel').hidden) syncLabels();
}

/* ---------- pictures of the board ---------- */
function thumb(st, frameIdx, bare) {
  const v = viewOf(st), fr = st.frames[frameIdx == null ? 0 : frameIdx];
  const svg = S('svg', { viewBox: v.vb.join(' '), preserveAspectRatio: 'xMidYMid meet', 'font-family': 'Helvetica, Arial, sans-serif' });
  const w = S('g', v.tf ? { transform: v.tf } : {});
  const o = S('g', {}), i = S('g', {}), t = S('g', {});
  const onPicture = st.view === 'pic' && st.pic, pg = S('g', {});
  if (bare && !onPicture && st.bg === false) w.append(courtLines(false)); // exported pictures paint the white themselves
  if (!bare && !onPicture) w.append(st.bg === false
    ? courtLines(true)
    : S('image', { href: 'court.jpg', width: IMG_W, height: IMG_H, preserveAspectRatio: 'none' }));
  w.append(pg, o, i, t);
  fillPic(pg, st, null); fillOverlays(o, st); fillInk(i, fr); fillTokens(t, st, fr);
  svg.append(w);
  return svg;
}
async function boardImage(st, frameIdx) {
  const v = viewOf(st), [vx, vy, W, Hh] = v.vb, k = 2, head = 70;
  const cv = document.createElement('canvas');
  cv.width = W * k; cv.height = (Hh + head) * k;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#b20000'; ctx.fillRect(0, 0, cv.width, head * k);
  ctx.fillStyle = '#ffffff'; ctx.font = `600 ${34 * k}px "Avenir Next Condensed", "Arial Narrow", Arial, sans-serif`; ctx.textBaseline = 'middle';
  const title = (st.name || 'Untitled play').toUpperCase() + (st.frames.length > 1 ? `   ${frameIdx + 1} / ${st.frames.length}` : '');
  ctx.fillText(title, 24 * k, head * k / 2, cv.width - 48 * k);
  if (!courtImg.complete) await new Promise(r => { courtImg.onload = courtImg.onerror = r; });
  ctx.save();
  ctx.translate(0, head * k); ctx.scale(k, k); ctx.translate(-vx, -vy);
  ctx.beginPath(); ctx.rect(vx, vy, W, Hh); ctx.clip();
  if (v.rot === 90) { ctx.translate(IMG_H, 0); ctx.rotate(Math.PI / 2); }
  if (v.rot === -90) { ctx.translate(0, IMG_W); ctx.rotate(-Math.PI / 2); }
  if (st.bg === false) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, IMG_W, IMG_H); }
  else if (!(st.view === 'pic' && st.pic)) ctx.drawImage(courtImg, 0, 0, IMG_W, IMG_H);
  ctx.restore();
  const svg = thumb(st, frameIdx, true);
  svg.setAttribute('xmlns', NS); svg.setAttribute('width', W * k); svg.setAttribute('height', Hh * k);
  svg.prepend(board.querySelector('defs').cloneNode(true));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    ctx.drawImage(img, 0, head * k, W * k, Hh * k);
  } finally { URL.revokeObjectURL(url); }
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
const fileSlug = s => (s || 'ludo-play').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'ludo-play';
async function shareFile(file, title) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = H('a', { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
$('shareBtn').addEventListener('click', async () => {
  try {
    const blob = await boardImage(state, state.cur);
    const step = state.frames.length > 1 ? `-step-${state.cur + 1}` : '';
    await shareFile(new File([blob], fileSlug(state.name) + step + '.png', { type: 'image/png' }), state.name || 'Ludo play');
  } catch (e) { toast('Could not make the picture on this device.'); }
});

/* ---------- present mode ---------- */
function setPresent(on) {
  presenting = on;
  document.body.classList.toggle('present', on);
  if (on) openPanel(null);
  syncChrome();
}
$('presentBtn').addEventListener('click', () => { presentLaser = true; setPresent(true); toast('Presenting. The Pencil is a laser pointer; tap Laser to draw instead.'); });
$('pExit').addEventListener('click', () => { stopAnim(); if (PLAYERS_MODE) showBook(true); else setPresent(false); });
$('pPrev').addEventListener('click', () => gotoFrame(state.cur - 1));
$('pNext').addEventListener('click', () => gotoFrame(state.cur + 1));
$('pPlay').addEventListener('click', playAnim);
$('pLaser').addEventListener('click', () => { presentLaser = !presentLaser; syncChrome(); });

/* ---------- playbook ---------- */
async function myPlays() {
  try { return (await dbAll('plays')).map(cleanPlay).filter(Boolean).map(p => { if (!p.id) p.id = uid(); return p; }); } catch (e) { return []; }
}
function playCard(p, team) {
  const open = H('button', { class: 'thumb', 'aria-label': 'Open ' + p.name }, thumb(p, 0));
  open.addEventListener('click', () => {
    const st = clone(p); st.cur = 0;
    loadState(st); showBook(false);
    if (PLAYERS_MODE) setPresent(true);
  });
  const title = H('b'); title.textContent = p.name || 'Untitled play';
  const when = H('small');
  when.textContent = viewOf(p).name + (p.frames.length > 1 ? ` · ${p.frames.length} steps` : '') + (team ? '' : ' · ' + new Date(p.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const meta = H('div', { class: 'meta' }, title, when);
  if (p.tags.length) {
    const tags = H('div', { class: 'tags' });
    for (const t of p.tags) { const s = H('span'); s.textContent = t; tags.append(s); }
    meta.append(tags);
  }
  if (p.notes) { const n = H('p', { class: 'notes' }); n.textContent = p.notes; meta.append(n); }
  const card = H('article', { class: 'card' }, open, meta);
  if (!team && !PLAYERS_MODE) {
    const dup = H('button', { class: 'btn' }, 'Duplicate');
    dup.addEventListener('click', async () => {
      const c = clone(p); c.id = uid(); c.name = (p.name + ' copy').slice(0, 60); c.updated = Date.now();
      await dbPut('plays', c); renderPlaybook();
    });
    const share = H('button', { class: 'btn' }, 'Send');
    share.addEventListener('click', () => exportPlays([p], p.name));
    const del = H('button', { class: 'btn' }, 'Delete');
    del.addEventListener('click', async () => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Really delete?'; del.classList.add('warn'); return; }
      await dbDel('plays', p.id);
      if (state.id === p.id) { state.id = null; dirty = true; syncChrome(); }
      renderPlaybook();
    });
    card.append(H('div', { class: 'acts' }, dup, share, del));
  }
  return card;
}
function matches(p) {
  if (book.tag && !p.tags.includes(book.tag)) return false;
  if (!book.q) return true;
  return (p.name + ' ' + p.tags.join(' ') + ' ' + p.notes).toLowerCase().includes(book.q.toLowerCase());
}
function sorted(list) {
  return list.slice().sort((a, b) => (book.sort === 'name' ? a.name.localeCompare(b.name) : b.updated - a.updated));
}
async function renderPlaybook() {
  const mine = PLAYERS_MODE ? [] : await myPlays();
  const tags = [...new Set([...mine, ...teamPlays].flatMap(p => p.tags))].sort();
  if (book.tag && !tags.includes(book.tag)) book.tag = '';
  const bar = $('tagFilter');
  bar.replaceChildren();
  for (const t of tags.length ? ['', ...tags] : []) {
    const b = H('button', { class: 'chip-btn', 'aria-pressed': String(book.tag === t) }); b.textContent = t || 'All';
    b.addEventListener('click', () => { book.tag = t; renderPlaybook(); });
    bar.append(b);
  }
  const fill = (grid, list, team, emptyMsg) => {
    grid.replaceChildren();
    const show = sorted(list.filter(matches));
    if (!show.length) grid.append(H('p', { class: 'empty' }, list.length ? 'No plays match that search.' : emptyMsg));
    for (const p of show) grid.append(playCard(p, team));
  };
  $('mineSection').hidden = PLAYERS_MODE;
  if (!PLAYERS_MODE) fill($('playGrid'), mine, false, 'No saved plays yet. Draw a play on the board and tap Save. It is kept on this iPad and works without Wi-Fi.');
  $('teamSection').hidden = !PLAYERS_MODE && !teamPlays.length;
  fill($('teamGrid'), teamPlays, true, 'The team playbook is empty. Your coaches have not published any plays yet.');
}
function showBook(on) {
  $('playbook').hidden = !on;
  if (on) { stopAnim(); openPanel(null); if (PLAYERS_MODE) setPresent(false); renderPlaybook(); }
}
$('bookBtn').addEventListener('click', () => showBook(true));
$('closeBook').addEventListener('click', () => showBook(false));
$('bookSearch').addEventListener('input', e => { book.q = e.target.value.trim(); renderPlaybook(); });
$('bookSort').addEventListener('change', e => { book.sort = e.target.value; renderPlaybook(); });
$('newPlay').addEventListener('click', () => {
  const st = blankState('full');
  st.labels = clone(state.labels);
  loadState(st); showBook(false);
});

async function exportPlays(plays, label, fname) {
  const used = new Set(plays.flatMap(p => Object.keys(p.ovl)));
  const data = { app: 'bishops-whiteboard', version: 2, plays, overlays: customOverlays.filter(o => used.has(o.id)) };
  await shareFile(new File([JSON.stringify(data)], fname || fileSlug(label) + '.json', { type: 'application/json' }), label);
}
$('exportAll').addEventListener('click', async () => {
  const plays = await myPlays();
  if (!plays.length) { toast('There are no saved plays to export yet.'); return; }
  exportPlays(plays, 'Ludo playbook', 'team-playbook.json');
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (/\.fdb$/i.test(f.name)) { importFastDraw(f); return; }
  if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name)) { importPicture(f); return; }
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) { importPdf(f); return; }
  try {
    const data = JSON.parse(await f.text());
    if (!data || data.app !== 'bishops-whiteboard' || !Array.isArray(data.plays)) throw new Error('wrong file');
    const idMap = {};
    for (const o of Array.isArray(data.overlays) ? data.overlays : []) {
      if (!o) continue;
      const fresh = cleanOverlay(o);
      if (!fresh.items.length) continue;
      fresh.id = 'c-' + uid(); fresh.updated = Date.now(); idMap[o.id] = fresh.id;
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
    toast('That file is not a Ludo Whiteboard export.');
  }
});

/* ---------- FastDraw library import (the reading itself is in fastdraw.js) ---------- */
async function importFastDraw(file) {
  toast('Reading the FastDraw file…');
  let result;
  try { result = parseFastDraw(await file.arrayBuffer(), { fx, fy, uid }); }
  catch (e) { toast('That FastDraw file could not be read.'); return; }
  let n = 0;
  for (const raw of result.plays) {
    const p = cleanPlay(raw);
    if (!p) continue;
    p.id = raw.id; p.updated = Date.now(); // the same FastDraw play always gets the same id, so importing twice replaces it
    if (!p.tags.includes('FastDraw')) p.tags.push('FastDraw');
    try { await dbPut('plays', p); n++; } catch (e) { toast('This iPad ran out of room while importing.'); break; }
  }
  const r = result.report, extra = [];
  if (r.skippedItems) extra.push(`${r.skippedItems} item${r.skippedItems === 1 ? '' : 's'} could not be read`);
  if (r.textBoxes) extra.push(`${r.textBoxes} text box${r.textBoxes === 1 ? '' : 'es'} moved into the notes`);
  if (r.partial.length) extra.push(`${r.partial.length} play${r.partial.length === 1 ? ' is' : 's are'} incomplete`);
  $('importReport').textContent = `Imported ${n} play${n === 1 ? '' : 's'} from FastDraw` + (extra.length ? ': ' + extra.join(', ') + '.' : '.') +
    (r.partial.length ? ' Incomplete: ' + r.partial.slice(0, 12).join(', ') + (r.partial.length > 12 ? '…' : '') + '.' : '') +
    (Object.keys(r.unknown).length || Object.keys(r.guessedLines).length ? ' Codes not recognised: ' + [...Object.keys(r.unknown), ...Object.keys(r.guessedLines)].join(', ') + '.' : '');
  $('importReport').hidden = false;
  toast(`Imported ${n} plays from FastDraw.`);
  renderPlaybook();
}

/* ---------- pictures and PDFs: a photo of a drawing, or pages from a PDF, become plays you can draw on ---------- */
const PIC_MAX = 1600; // longest side in pixels, to keep plays small enough to store and sync
function canvasToPic(cv) { return { src: cv.toDataURL('image/jpeg', 0.82), w: cv.width, h: cv.height }; }
function picturePlay(name, pic, tag) {
  const st = blankState('pic');
  st.id = uid(); st.name = name.slice(0, 60); st.pic = pic; st.picOp = 0.45; st.tags = [tag]; st.updated = Date.now();
  return st;
}
const baseName = f => f.name.replace(/\.[^.]+$/, '') || 'Imported picture';
async function importPicture(file) {
  try {
    const url = URL.createObjectURL(file), img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = Math.min(1, PIC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    const play = picturePlay(baseName(file), canvasToPic(cv), 'Picture');
    await dbPut('plays', clone(play));
    loadState(play); showBook(false);
    toast('Picture added. Draw on it, or pick a court view to trace it onto the court.');
  } catch (e) { toast('That picture could not be opened.'); }
}
let pdfReady = null;
function loadPdfLibrary() { // only fetched the first time a PDF is imported
  if (!pdfReady) {
    pdfReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => { pdfReady = null; rej(new Error('pdf library')); };
      document.head.append(s);
    });
  }
  return pdfReady;
}
async function importPdf(file) {
  toast('Reading the PDF…');
  try {
    const lib = await loadPdfLibrary();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = Math.min(doc.numPages, 60);
    let n = 0;
    for (let k = 1; k <= pages; k++) {
      const page = await doc.getPage(k);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: PIC_MAX / Math.max(base.width, base.height) });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const name = baseName(file) + (doc.numPages > 1 ? ' p.' + k : '');
      await dbPut('plays', picturePlay(name, canvasToPic(cv), 'PDF'));
      n++;
    }
    $('importReport').textContent = `Imported ${n} page${n === 1 ? '' : 's'} from "${file.name}" as picture plays` + (doc.numPages > pages ? ` (the first ${pages} of ${doc.numPages})` : '') + '. Open one to draw on it or trace it onto the court.';
    $('importReport').hidden = false;
    toast(`Imported ${n} page${n === 1 ? '' : 's'}.`);
    renderPlaybook();
  } catch (e) { toast('That PDF could not be read.'); }
}
$('picBtn').addEventListener('click', () => $('picFile').click());
$('picFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) importPdf(f); else importPicture(f);
});
$('picOpacity').addEventListener('input', e => { state.picOp = Number(e.target.value) / 100; touched(); fillPic($('pic'), state, $('courtImage')); });
$('picRemove').addEventListener('click', () => {
  if ($('picRemove').dataset.sure !== '1') { $('picRemove').dataset.sure = '1'; $('picRemove').textContent = 'Really remove?'; return; }
  $('picRemove').dataset.sure = ''; $('picRemove').textContent = 'Remove picture';
  delete state.pic; if (state.view === 'pic') state.view = 'full';
  touched(); paintAll();
});

/* ---------- printable playbook ---------- */
async function showPrint() {
  const list = sorted([...(await myPlays()), ...(PLAYERS_MODE ? teamPlays : [])].filter(matches));
  if (!list.length) { toast('There are no plays to print.'); return; }
  const pages = $('printPages');
  pages.replaceChildren();
  for (const p of list) {
    const head = H('h3'); head.textContent = p.name || 'Untitled play';
    const sub = H('p', { class: 'psub' }); sub.textContent = [viewOf(p).name, ...p.tags].join(' · ');
    const steps = H('div', { class: 'psteps' });
    p.frames.forEach((_, i) => {
      const fig = H('figure', {}, thumb(p, i));
      if (p.frames.length > 1) { const c = H('figcaption'); c.textContent = 'Step ' + (i + 1); fig.append(c); }
      const [, , w, h] = viewOf(p).vb; fig.style.aspectRatio = `${w} / ${h}`;
      steps.append(fig);
    });
    const card = H('section', { class: 'pcard' }, head, sub, steps);
    if (p.notes) { const n = H('p', { class: 'pnotes' }); n.textContent = p.notes; card.append(n); }
    pages.append(card);
  }
  $('printView').hidden = false;
}
$('printBtn').addEventListener('click', showPrint);
$('printClose').addEventListener('click', () => { $('printView').hidden = true; });
$('printGo').addEventListener('click', () => {
  try { window.print(); } catch (e) { toast('Printing is not available here. Take a screenshot instead.'); }
});

/* ---------- team playbook: a file published next to the app that every device reads ---------- */
async function loadTeam() {
  try {
    const res = await fetch('team-playbook.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || data.app !== 'bishops-whiteboard') return;
    const mineIds = new Set(customOverlays.map(o => o.id));
    // the cloud may also supply team plays (cloud.js), so only replace the ones that came from this file
    const fileOverlays = (Array.isArray(data.overlays) ? data.overlays : []).filter(o => o && o.id && !mineIds.has(String(o.id))).map(cleanOverlay);
    fileOverlays.forEach(o => { o.fromFile = true; });
    teamOverlays = [...teamOverlays.filter(o => !o.fromFile), ...fileOverlays];
    const filePlays = (Array.isArray(data.plays) ? data.plays : []).map(cleanPlay).filter(Boolean).map((p, i) => { p.id = 't-' + (p.id || i); p.fromFile = true; return p; });
    teamPlays = [...teamPlays.filter(p => !p.fromFile), ...filePlays];
  } catch (e) { /* no team playbook, or offline before the first visit */ }
}

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
    lib = cleanLib(JSON.parse(localStorage.getItem('wb.lib') || 'null'));
    if (!PLAYERS_MODE) { const cur = cleanPlay(JSON.parse(localStorage.getItem('wb.current') || 'null')); if (cur) state = cur; }
  } catch (e) { /* start fresh */ }
  $('fingerChk').checked = fingerDraw;
  setTool(tool); setColor(color);
  paintAll();
  try { customOverlays = (await dbAll('overlays')).map(cleanOverlay); } catch (e) { customOverlays = []; }
  await loadTeam();
  fillOverlays(gOvl, state);
  $('appVersion').textContent = 'Version ' + APP_VERSION;
  $('blankBoard').append(courtLines(true));
  if (PLAYERS_MODE) { document.body.classList.add('players'); showBook(true); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) {
    // When a new version has finished downloading, switch to it right away instead of on the next launch.
    // The board is saved continuously, so reloading loses nothing.
    const hadOne = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadOne) location.reload(); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
start();
