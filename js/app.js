// DV58 FROST notification center: the component.
// A stack of ice notifications. Point at it (or tap it, or Tab into it) and it fans out; point at one and it opens up;
// swipe one sideways, press its ×, or press Delete, and it shatters into frost; "Clear all" shatters the whole stack.
// New notifications fly in from the left and spring into the front.
// Each card is DOM (text, buttons, ARIA) transformed with matrix3d under a CSS perspective; the ice (ice.js) draws the same
// matrices with a camera that matches that perspective, so the glass and the text never drift apart.
import * as THREE from 'three';
import { SEED, POOL, ICONS, minutesAgo } from './data.js';
import { createIce } from './ice.js';

const Q = new URLSearchParams(location.search);
const html = document.documentElement;
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mqReduce.matches || Q.has('reduced');
const quiet = Q.has('quiet');
try { for (const k of Object.keys(localStorage)) if (k.startsWith('dv58') && !k.startsWith('dv58b.')) localStorage.removeItem(k); } catch (e) { /* storage off */ }

const $ = (s, r = document) => r.querySelector(s);
const page = $('.page'), stage = $('[data-stage]'), list = $('[data-list]'), region = $('[data-region]');
const countEl = $('[data-count]'), clearBtn = $('[data-clear]'), empty = $('[data-empty]'), live = $('[data-announce]');
const backCv = $('canvas.gl-back'), fxCv = $('canvas.gl-fx');

// ------------------------------------------------------------------ state
let notes = [];               // newest first
let uid = 0, poolIx = 0;
let expanded = false, pinned = false, hoverId = null, focusId = null, dragging = null;
let W = 420, H = 150, R = 18, D = 12, u = 1, PERSP = 1500;
let originX = 0, originY = 0, stageW = 0, stageH = 0;
let ice = null;
const F = new THREE.Matrix4().makeScale(1, -1, 1);
const DEG = Math.PI / 180;

function announce(t) { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); }
const fmtTime = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
};

// ------------------------------------------------------------------ DOM
function makeNote(d, t) {
  const id = ++uid;
  const li = document.createElement('li'); li.className = 'note'; li.dataset.id = id;
  const label = `${d.name}: ${d.title}`;
  li.innerHTML = `<article class="card" tabindex="-1" aria-labelledby="n${id}t" aria-describedby="n${id}w n${id}b">
      <div class="card-in">
        <header class="card-h"><span class="ic">${ICONS[d.app]}</span><h3 class="card-t" id="n${id}t"><span class="sr-only unread-sr">Unread. </span></h3>
          <time class="card-time"></time><i class="dot" aria-hidden="true"></i></header>
        <p class="card-who" id="n${id}w"></p>
        <p class="card-b" id="n${id}b"></p>
      </div>
      <button class="x" type="button" tabindex="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button>
    </article>`;
  li.querySelector('.card-t').append(label);
  li.querySelector('.card-who').textContent = d.who;
  li.querySelector('.card-b').textContent = d.body;
  li.querySelector('.x').setAttribute('aria-label', `Dismiss: ${label}`);
  const n = { id, d, t, unread: true, el: li, card: li.firstElementChild, timeEl: li.querySelector('time'),
    s: null, v: null, tg: null, k: 0, glow: 0, hov: 0, o: 1, lastCss: '', lastClip: '', lastO: -1, lastZ: -1, seed: id * 7 + 3 };
  li.classList.add('is-unread');
  n.timeEl.dateTime = new Date(t).toISOString(); n.timeEl.textContent = fmtTime(t);
  wire(n);
  return n;
}

const POSE_KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'piv'];
const zeroPose = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, piv: 0 });

// ------------------------------------------------------------------ layout: the target pose of every card
function sizeFromStage() {
  const r = stage.getBoundingClientRect(), pr = page.getBoundingClientRect();
  stageW = r.width; stageH = r.height;
  originX = r.left - pr.left + r.width / 2; originY = r.top - pr.top + r.height / 2;
  const phone = innerWidth < 560;
  W = Math.round(phone ? Math.min(350, innerWidth - 72) : Math.max(260, Math.min(640, stageW / 1.8, stageH * 0.96)));
  if (!phone) W = Math.round(Math.min(W, stageW - 300));
  H = Math.round(W * (phone ? 0.42 : 0.355)); if (phone) H = Math.max(H, 120);
  R = Math.round(W * 0.04); D = Math.round(W * 0.042);
  u = W / 420; PERSP = phone ? 1100 : 1500;
  html.style.setProperty('--card-w', W + 'px'); html.style.setProperty('--card-h', H + 'px'); html.style.setProperty('--u', u);
  list.style.perspective = PERSP + 'px';
}

// rest: the concept's hero (four readable cards cascading down to the right, older ones fanned behind like book pages)
// open: the cascade spreads further, the old pages fan wider, and the card under the pointer opens up fully
function layout() {
  const n = notes.length, out = [];
  const hk = notes.findIndex((x) => x.id === (dragging ? null : (focusId ?? hoverId)));
  const F4 = 4;
  let hi = 0, cx = 0, cyShift = 0;
  if (!expanded) {
    const dx = 28 * u, dy = 72 * u, dz = 30;
    for (let k = 0; k < n; k++) {
      const p = zeroPose();
      if (k < F4) { p.x = -k * dx; p.y = k * dy; p.z = -k * dz; p.ry = 19 + k * 1.5; p.rx = -8; }
      else { const j = k - F4 + 1; p.x = -(F4 - 1) * dx - j * 30 * u; p.y = (F4 - 1) * dy - j * 5 * u; p.z = -(F4 - 1) * dz - j * 22; p.ry = 19 + j * 6; p.rx = -8; }
      out.push(p);
    }
    hi = (Math.min(n, F4) - 1) * dy; cx = (stageW < 560 ? 44 : 64) * u;
  } else {
    const dy = Math.max(60 * u, Math.min(104 * u, (stageH - 40 - H) / 3)), dx = 62 * u, dz = 34;
    const narrow = stageW < W * 2.25;
    for (let k = 0; k < n; k++) {
      const p = zeroPose();
      if (k < F4) { p.x = -k * dx; p.y = k * dy; p.z = -k * dz; p.ry = 9 + k * 1.5; p.rx = -4; p.rz = k * 0.6; }
      else { const j = k - F4 + 1; p.x = -(F4 - 1) * dx - 46 * u - j * 50 * u; p.y = (F4 - 1) * dy - 6 * u - j * 14 * u; p.z = -(F4 - 1) * dz - 30 - j * 24; p.ry = 16 + j * 10; p.rx = -4; p.rz = 2 + j * 1.2; }
      if (k === hk) {
        if (k < F4) { p.z += k ? 80 : 18; p.ry -= k ? 4 : 2; p.y += k ? 6 * u : 0; p.x -= k ? 8 * u : 0; }   // lifts towards you, over the newer ones
        else if (narrow) { p.x = -1.5 * dx; p.y = 1.5 * dy; p.z = 130; p.ry = 6; }   // phone: lifted over the stack
        else { p.x -= W * 0.3; p.z = 110; p.ry = 7; p.rz = 0; }   // slid out of the fan to the left, staying under the pointer
      }
      out.push(p);
    }
    hi = (Math.min(n, F4) - 1) * dy; cx = 96 * u; cyShift = -4 * u;
  }
  const cy = hi / 2 + cyShift;
  for (const p of out) { p.y -= cy; p.x += cx; }
  fitWidth(out, hk);
  if (dragging) { const p = out[notes.indexOf(dragging.n)]; if (p) { p.x += dragging.dx; p.rz -= dragging.dx * 0.018; p.ry += dragging.dx * 0.025; p.z += Math.min(40, Math.abs(dragging.dx) * 0.2); } }
  return { out, hk };
}

// ------------------------------------------------------------------ springs
function retarget() {
  const { out, hk } = layout();
  notes.forEach((n, k) => {
    n.tg = out[k]; n.k = k;
    if (!n.s) { n.s = { ...out[k] }; n.v = zeroPose(); }
    const readable = k < 4 || (expanded && k === hk);
    n.ot = readable ? 1 : 0;
    n.glowT = (k === hk ? 0.55 : 0) + (k === 0 ? 0.25 : 0);
    n.hovT = k === hk ? 1 : 0;
    n.zT = expanded && k === hk && k > 0 ? 500 : 100 - k;
    n.el.classList.toggle('is-hk', expanded && k === hk);
    n.el.classList.toggle('is-lifted', n.zT >= 500);
  });
  wake();
}

function step(dt) {
  let moving = false;
  const kSt = reduced ? 900 : 190, kDa = reduced ? 60 : 22;
  for (const n of notes) {
    const st = n.stiff || kSt, da = n.damp || kDa;
    for (const key of POSE_KEYS) {
      if (key === 'piv') { n.s.piv = n.tg.piv; continue; }
      const x = n.s[key], v = n.v[key], target = n.tg[key];
      const a = -st * (x - target) - da * v;
      const nv = v + a * dt, nx = x + nv * dt;
      n.v[key] = nv; n.s[key] = nx;
      if (Math.abs(nx - target) > 0.02 || Math.abs(nv) > 0.05) moving = true;
    }
    n.o += (n.ot - n.o) * Math.min(1, dt * (reduced ? 60 : n.ot < n.o ? 22 : 9));
    n.glow += (n.glowT - n.glow) * Math.min(1, dt * 7);
    n.hov += (n.hovT - n.hov) * Math.min(1, dt * 10);
    if (Math.abs(n.o - n.ot) > 0.004 || Math.abs(n.glow - n.glowT) > 0.004) moving = true;
    if (n.stiff && !moving) { n.stiff = 0; n.damp = 0; }
  }
  return moving;
}

const tmpM = new THREE.Matrix4(), tmpR = new THREE.Matrix4(), tmpE = new THREE.Euler();
// Keep every readable card (the cascade and a lifted one) fully on screen with a 12 px margin: project their corners
// through the page's perspective, slide the whole stack sideways if a card pokes out, and tighten the cascade if it
// is wider than the screen. The old fanned pages may still run off the left edge.
const fitM = new THREE.Matrix4(), fitV = new THREE.Vector3();
function fitWidth(out, hk) {
  const L = -originX + 12, Rr = innerWidth - originX - 12;
  const ext = () => {
    let lo = Infinity, hi = -Infinity;
    out.forEach((p, k) => {
      if (k >= 4 && k !== hk) return;
      worldMatrix(p, fitM);
      for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        fitV.set(x * W / 2, y * H / 2, 0).applyMatrix4(fitM);
        const sx = fitV.x * PERSP / (PERSP - fitV.z); lo = Math.min(lo, sx); hi = Math.max(hi, sx);
      }
    });
    return [lo, hi];
  };
  for (let pass = 0; pass < 8; pass++) {
    let [lo, hi] = ext();
    if (lo >= L - 0.5 && hi <= Rr + 0.5) return;
    if (hi - lo > Rr - L) {                                   // too wide: pull the cascade together around the front card
      const f = Math.max(0, 1 - ((hi - lo) - (Rr - L) + 2) / Math.max(1, Math.abs(out[Math.min(3, out.length - 1)].x - out[0].x) * 1.1)), x0 = out[0].x;
      out.forEach((p, k) => { if (k < 4 || k === hk) p.x = x0 + (p.x - x0) * f; });
      [lo, hi] = ext();
    }
    const shift = hi > Rr ? Rr - hi : lo < L ? L - lo : 0;
    for (const p of out) p.x += shift;
  }
}

function worldMatrix(s, out = new THREE.Matrix4()) {
  out.makeTranslation(s.x + s.piv, s.y, s.z);
  tmpE.set(s.rx * DEG, s.ry * DEG, s.rz * DEG, 'YXZ'); tmpR.makeRotationFromEuler(tmpE);
  out.multiply(tmpR); out.multiply(tmpM.makeTranslation(-s.piv, 0, 0));
  return out;
}
const cssM = new THREE.Matrix4();
function cssMatrix(m) { cssM.copy(F).multiply(m).multiply(F); return 'matrix3d(' + cssM.elements.map((v) => +v.toFixed(5)).join(',') + ')'; }

// Where a card drawn above covers this one, in this card's own CSS px: the cover's corners carried into this card's
// frame and projected onto its plane along the view ray. A text line that any cover touches fades out, so text never
// shows through the ice of a newer card and never gets cut mid-line.
const inv = new THREE.Matrix4(), v3 = new THREE.Vector3(), eye = new THREE.Vector3();
function quadOn(back, front) {
  inv.copy(back.m).invert();
  eye.set(0, 0, PERSP).applyMatrix4(inv);
  const pad = 6 + D * 0.3, pts = [];
  for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    v3.set(x * (W / 2 + pad), y * (H / 2 + pad), 0).applyMatrix4(front.m).applyMatrix4(inv);
    const t = eye.z / (eye.z - v3.z);
    pts.push([eye.x + (v3.x - eye.x) * t + W / 2, H / 2 - (eye.y + (v3.y - eye.y) * t)]);
  }
  return pts;
}
function inQuad(q, x, y) {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c === 0) continue; const sg = c > 0 ? 1 : -1; if (!s) s = sg; else if (sg !== s) return false; }
  return true;
}
function linesOf(n) {
  if (n.lines) return n.lines;
  const pad = parseFloat(getComputedStyle(n.card.firstElementChild).paddingLeft) || 20;
  n.lines = [...n.card.querySelectorAll('.card-h, .card-who, .card-b')].map((el) => ({ el, cov: false, x0: pad, x1: W - pad, y0: el.offsetTop, y1: el.offsetTop + el.offsetHeight }));
  return n.lines;
}
function coverLines(n, quads) {
  for (const L of linesOf(n)) {
    let cov = false;
    if (quads.length) {
      outer: for (const fy of [0.08, 0.5, 0.92]) for (const fx of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const x = L.x0 + (L.x1 - L.x0) * fx, y = L.y0 + (L.y1 - L.y0) * fy;
        for (const q of quads) if (inQuad(q, x, y)) { cov = true; break outer; }
      }
    }
    if (cov !== L.cov) { L.cov = cov; L.el.classList.toggle('is-cov', cov); }
  }
}

function apply(t) {
  for (const n of notes) n.m = worldMatrix(n.s, n.m || new THREE.Matrix4());
  const pulled = notes.find((x) => x.zT >= 500);
  notes.forEach((n, k) => {
    const css = cssMatrix(n.m);
    if (css !== n.lastCss) { n.el.style.transform = css; n.lastCss = css; }
    const z = n.zT ?? 100 - k; if (z !== n.lastZ) { n.el.style.zIndex = z; n.lastZ = z; }
    const o = Math.round(n.o * 100) / 100; if (o !== n.lastO) { n.el.style.setProperty('--o', o); n.lastO = o; n.el.classList.toggle('is-hidden', o < 0.05); }
    // newer cards in front, and a card pulled out of the deck, hide the text they cover
    if (n.zT >= 500) coverLines(n, []);
    else if (n.o > 0.01) {
      const quads = [], front = notes[k - 1];
      if (front && front.zT < 500) quads.push(quadOn(n, front));
      if (pulled && pulled !== n) quads.push(quadOn(n, pulled));
      coverLines(n, quads);
    }
    if (ice) ice.update(n.id, n.m, z >= 500 ? -1 : k, n.glow, n.hov, 1);
    if (ice && n.arriving) {
      const sp = Math.min(1, Math.abs(n.v.x) / 2400);
      ice.streak(n.id, n.m, sp > 0.03 ? sp : 0);
      if (sp <= 0.03 && Math.abs(n.s.x - n.tg.x) < 30) { n.arriving = false; ice.streak(n.id, n.m, 0); }
    }
  });
}

// ------------------------------------------------------------------ the loop (sleeps under reduced motion when still)
let raf = 0, last = 0, t0 = performance.now(), awake = false;
function wake() { if (!raf) { awake = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
let frozen = false, tick = 0, quality = 0, slow = 0, seen = 0;
// adaptive quality: if more than a third of frames run long for a second, drop the ice's pixel ratio a step
function watch(dt) {
  seen++; if (dt > 0.0125) slow++;
  if (seen >= 90) { if (slow > seen / 3 && quality < 0.5) { quality += 0.25; resize(); } seen = 0; slow = 0; }
}
function frame(now) {
  raf = 0;
  if (frozen) return;
  let dt = Math.min(0.034, (now - last) / 1000); last = now;
  let moving = false;
  const sub = Math.ceil(dt / 0.009); for (let i = 0; i < sub; i++) moving = step(dt / sub) || moving;
  apply(now);
  const busy = moving || dragging || (ice && ice.fxActive()) || notes.some((n) => n.arriving);
  // at rest only the slow idle light moves: draw it on every other display frame (60 fps), the GPU gets half the work
  if (ice && (busy || (tick++ & 1) === 0)) { ice.render(now, (now - t0) / 1000); watch(dt); }
  const keep = busy || (ice && !reduced);
  if (keep) raf = requestAnimationFrame(frame); else awake = false;
}

// ------------------------------------------------------------------ actions
function renderCount() {
  const n = notes.length, unread = notes.filter((x) => x.unread).length;
  countEl.textContent = n ? `${n} notification${n === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}` : 'No notifications';
  clearBtn.disabled = !n;
  clearTimeout(emptyT);
  if (n) { empty.hidden = true; region.classList.remove('is-empty'); }
  else emptyT = setTimeout(() => { if (!notes.length) { empty.hidden = false; region.classList.add('is-empty'); } }, 450);   // after the frost settles
  // roving tab stop
  const cur = notes.find((x) => x.id === focusId) || notes[0];
  for (const x of notes) { const on = x === cur; x.card.tabIndex = on ? 0 : -1; x.el.querySelector('.x').tabIndex = on ? 0 : -1; }
}

function insert(d, opts = {}) {
  const n = makeNote(d, opts.t ?? Date.now());
  notes.unshift(n); list.prepend(n.el); place(n);
  if (ice) ice.add(n.id, n.seed);
  while (notes.length > 10) { const old = notes.pop(); drop(old); }
  if (opts.arrive) {
    const { out } = layout();
    const tp = out[0];
    n.s = { ...tp, x: -(originX + W * 1.1) - 60, y: tp.y + 26 * u, z: 60, ry: -14, rz: 3, rx: 0 };
    n.v = { ...zeroPose(), x: reduced ? 0 : 900 };
    if (reduced) n.s = { ...tp };
    n.stiff = reduced ? 0 : 120; n.damp = reduced ? 0 : 15.5; n.arriving = !reduced;
    n.o = 1;
    announce(`New notification. ${d.name}: ${d.title}. ${d.who}.`);
  }
  retarget(); renderCount();
  return n;
}

function place(n) {
  const st = n.el.style; st.width = W + 'px'; st.height = H + 'px'; st.left = (originX - W / 2) + 'px'; st.top = (originY - H / 2) + 'px';
  n.lines = null;
}

function drop(n) {                                   // quietly removed (overflow)
  n.el.remove(); if (ice) ice.remove(n.id);
}

function arrive() {
  const d = POOL[poolIx++ % POOL.length];
  return insert(d, { arrive: true });
}

// dir ±1; impact in card px from the centre (y up)
function dismiss(n, dir = 1, impact = null, silent = false) {
  const k = notes.indexOf(n); if (k < 0) return;
  const hadFocus = n.el.contains(document.activeElement);
  notes.splice(k, 1);
  const m = n.m ? n.m.clone() : worldMatrix(n.s);
  if (ice) {
    ice.remove(n.id);
    if (!reduced) ice.shatter(m, dir, impact || [dir * W * 0.42, 0], [n.v.x * 0.5, n.v.y * 0.5], performance.now());
  }
  n.el.classList.add('is-shattering'); n.el.inert = true;
  setTimeout(() => n.el.remove(), reduced ? 200 : 260);
  if (focusId === n.id) focusId = null;
  if (hoverId === n.id) hoverId = null;
  if (!silent) announce(`Dismissed. ${n.d.name}: ${n.d.title}.`);
  retarget(); renderCount();
  if (hadFocus) { const next = notes[Math.min(k, notes.length - 1)]; if (next) next.card.focus({ preventScroll: true }); else clearBtn.disabled ? region.focus({ preventScroll: true }) : clearBtn.focus(); }
  if (!notes.length) scheduleRefill();
  wake();
}

let clearing = false;
function clearAll() {
  if (!notes.length || clearing) return;
  clearing = true; const all = notes.slice(); const hadFocus = region.contains(document.activeElement);
  expanded = false; pinned = false; setPinnedUI();
  all.forEach((n, i) => setTimeout(() => { dismiss(n, 1, [W * 0.42, (Math.random() - 0.5) * H * 0.4], true); if (i === all.length - 1) { clearing = false; if (hadFocus) region.focus({ preventScroll: true }); } }, reduced ? 0 : i * 95));
  announce('All notifications cleared.');
}

let refillT = 0, emptyT = 0;
function scheduleRefill() {
  if (quiet) return; clearTimeout(refillT);
  refillT = setTimeout(() => { if (notes.length) return; restore(); }, 3600);
}
function restore() {
  clearTimeout(refillT);
  const seeds = SEED.slice(0, 9).reverse();                  // oldest first, so the newest ends in front
  seeds.forEach((d, i) => setTimeout(() => insert(d, { arrive: i >= seeds.length - 3, t: minutesAgo(d.ago) }), reduced ? 0 : i * (i >= seeds.length - 3 ? 380 : 70)));
}

function markRead(n) {
  if (!n.unread) return; n.unread = false; n.el.classList.remove('is-unread'); n.el.querySelector('.unread-sr').remove(); renderCount();
}

function setExpanded(v) { if (expanded === v) return; expanded = v; region.classList.toggle('is-open', v); retarget(); }
function setPinnedUI() { const t = $('[data-demo=fan]'); if (t) t.setAttribute('aria-pressed', pinned ? 'true' : 'false'); }
function syncOpen() { setExpanded(pinned || hoverInside || focusInside || !!dragging); }
let hoverInside = false, focusInside = false, leaveT = 0, hoverLock = 0;

// ------------------------------------------------------------------ input on one card
function wire(n) {
  const el = n.el, card = n.card;
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveT); hoverInside = true;
    // while a page slides out of the fan, the pages it uncovers do not steal the hover (no flip-flopping)
    const now = performance.now(), k = notes.indexOf(n);
    if (now < hoverLock && hoverId != null && hoverId !== n.id && k >= 4) return;
    hoverId = n.id; if (expanded && k >= 4) hoverLock = now + 520;
    syncOpen(); retarget();
  });
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    // a card that just moved out from under a still pointer is not left: check again once it has settled
    const lifted = n.zT >= 500 || performance.now() < hoverLock;
    if (hoverId === n.id && !lifted) hoverId = null;
    clearTimeout(leaveT); leaveT = setTimeout(() => {
      const h = notes.find((x) => x.id === hoverId); if (h && !h.el.matches(':hover')) hoverId = null;
      if (!hoverId && !list.querySelector('.note:hover')) { hoverInside = false; syncOpen(); }
      retarget();
    }, lifted ? 320 : 280);
  });
  card.addEventListener('focus', () => { focusId = n.id; focusInside = true; syncOpen(); renderCount(); retarget(); });
  el.querySelector('.x').addEventListener('focus', () => { focusId = n.id; focusInside = true; syncOpen(); retarget(); });
  el.querySelector('.x').addEventListener('click', (e) => {
    e.stopPropagation(); dismiss(n, 1, [W * 0.38, H * 0.3]);
  });
  card.addEventListener('keydown', (e) => {
    const k = notes.indexOf(n);
    const go = (i) => { const t = notes[Math.max(0, Math.min(notes.length - 1, i))]; if (t) t.card.focus({ preventScroll: true }); };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(k + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(k - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(notes.length - 1); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === card) { e.preventDefault(); dismiss(n, 1); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openNote(n); }
    else if (e.key === 'Escape') { e.preventDefault(); pinned = false; setPinnedUI(); region.focus({ preventScroll: true }); }
  });
  // drag / swipe sideways to dismiss; vertical movement stays page scroll (touch-action: pan-y)
  let st = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.x')) return;
    st = { x: e.clientX, y: e.clientY, id: e.pointerId, hist: [[performance.now(), e.clientX]], type: e.pointerType };
    n.pdClosed = !expanded || (e.pointerType !== 'mouse' && !pinned);
  });
  card.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!dragging) {
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.2) { if (Math.abs(dy) > 12) st = null; return; }
      dragging = { n, dx: 0 }; card.setPointerCapture(e.pointerId); el.classList.add('is-drag'); syncOpen();
    }
    e.preventDefault();
    dragging.dx = dx; st.hist.push([performance.now(), e.clientX]); if (st.hist.length > 8) st.hist.shift();
    n.stiff = 900; n.damp = 55; retarget();
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const was = dragging && dragging.n === n ? dragging : null; const s0 = st; st = null;
    if (!was) return;
    dragging = null; el.classList.remove('is-drag');
    const h = s0.hist, a = h[0], b = h[h.length - 1], vx = (b[1] - a[1]) / Math.max(16, b[0] - a[0]);
    if (Math.abs(was.dx) > W * 0.3 || Math.abs(vx) > 0.6) {
      const dir = Math.sign(was.dx || vx);
      n.v.x = vx * 1000;
      dismiss(n, dir, [dir * W * 0.45, 0]);
    } else { n.stiff = 0; n.damp = 0; retarget(); }
    n.dragEnd = performance.now();
    syncOpen();
  };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  card.addEventListener('click', (e) => {
    if (e.target.closest('.x')) return;
    if (n.dragEnd && performance.now() - n.dragEnd < 300) return;
    // touch: the first tap opens the stack; a tap on an open stack opens the notification
    if (n.pdClosed || !expanded) { n.pdClosed = false; pinned = true; setPinnedUI(); syncOpen(); hoverId = null; retarget(); return; }
    if (hoverId !== n.id && e.pointerType !== 'mouse' && notes.indexOf(n) > 0) { hoverId = n.id; retarget(); return; }
    openNote(n);
  });
}

function openNote(n) {
  markRead(n);
  n.el.classList.remove('is-opened'); void n.el.offsetWidth; n.el.classList.add('is-opened');
  n.glow = 1.2; wake();
  announce(`Opened. ${n.d.name}: ${n.d.title}. ${n.d.who}. ${n.d.body}`);
}

// leaving the stack by keyboard or tapping elsewhere closes it
region.addEventListener('focusout', () => setTimeout(() => {
  if (!list.contains(document.activeElement)) { focusInside = false; focusId = null; syncOpen(); retarget(); renderCount(); }
}, 0));
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  if (!e.target.closest('.note') && !e.target.closest('[data-demo]') && pinned) { pinned = false; setPinnedUI(); hoverId = null; syncOpen(); retarget(); }
});
clearBtn.addEventListener('click', clearAll);
$('[data-restore]').addEventListener('click', restore);

// the three state tiles replay their state on the live stack
document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
  const what = b.dataset.demo;
  if (what === 'arrive') { pinned = false; setPinnedUI(); syncOpen(); arrive(); }
  else if (what === 'fan') { pinned = !pinned; setPinnedUI(); syncOpen(); retarget(); }
  else if (what === 'shatter') {
    if (!notes.length) { restore(); return; }
    dismiss(notes[0], 1, [W * 0.42, H * 0.1]);
  }
}));

// ------------------------------------------------------------------ size + boot
function resize() {
  sizeFromStage();
  const pw = page.clientWidth, ph = page.scrollHeight;
  for (const c of [backCv, fxCv]) { c.style.width = pw + 'px'; c.style.height = ph + 'px'; }
  for (const n of notes) place(n);
  list.style.perspectiveOrigin = `${originX}px ${originY}px`;
  if (ice) {
    const dpr = Math.max(0.75, Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2.4e6 / Math.max(1, pw * ph))) - quality);
    ice.setSize(pw, ph, dpr); ice.setView(originX, originY, PERSP); ice.setCardSize(W, H, R, D);
    ice.setStackExtent(W + 200 * u, H + 150 * u, [64 * u - 90 * u - W / 2 - 60 * u, 64 * u + W / 2, H * 0.5 + 120 * u, 64 * u]);
  }
  for (const n of notes) { n.lastCss = ''; n.lines = null; }
  retarget(); wake();
}

function boot() {
  if (!Q.has('nogl')) ice = createIce({ back: backCv, fx: fxCv, motion: reduced ? 0 : 1 });
  html.classList.toggle('gl', !!ice); html.classList.toggle('nogl', !ice);
  sizeFromStage();
  if (ice) { ice.setCardSize(W, H, R, D); ice.prewarm(4); }
  // seed: oldest first so the newest ends up in front, already in place (the showcase opens composed)
  for (const d of SEED.slice(0, 9).reverse()) insert(d, { t: minutesAgo(d.ago) });
  resize();
  for (const n of notes) { n.s = { ...n.tg }; n.o = n.ot; n.glow = n.glowT; }
  if (ice) ice.compile();
  new ResizeObserver(() => resize()).observe(page);
  addEventListener('resize', resize);
  setInterval(() => { for (const n of notes) { const t = fmtTime(n.t); if (n.timeEl.textContent !== t) n.timeEl.textContent = t; } }, 20000);
  mqReduce.addEventListener('change', (e) => { reduced = e.matches || Q.has('reduced'); if (ice) ice.setMotion(reduced ? 0 : 1); wake(); });
  // the demo: one arrival soon after load, then now and then while nobody is reading
  if (!quiet) {
    let auto = 0;
    setTimeout(function tick() {
      if (auto >= 4) return;
      if (!expanded && !dragging && document.visibilityState === 'visible' && notes.length) { arrive(); auto++; }
      setTimeout(tick, 17000);
    }, 2200);
  }
  html.classList.add('ready');
  wake();
}

window.__dv58 = {
  ready: new Promise((r) => { const go = () => { boot(); requestAnimationFrame(() => requestAnimationFrame(r)); }; document.fonts?.ready ? document.fonts.ready.then(go) : go(); }),
  state: () => ({ quality, n: notes.length, expanded, pinned, gl: !!ice, reduced, hover: hoverId, focus: focusId, W, H,
    unread: notes.filter((x) => x.unread).length, fx: ice ? ice.fxActive() : false, ids: notes.map((x) => x.id), titles: notes.map((x) => `${x.d.name}: ${x.d.title}`),
    moving: notes.some((x) => Math.abs(x.s.x - x.tg.x) > 1 || Math.abs(x.s.y - x.tg.y) > 1) }),
  arrive, clearAll, restore,
  dismissFront: (dir = 1) => notes[0] && dismiss(notes[0], dir),
  fan: (v) => { pinned = !!v; setPinnedUI(); syncOpen(); retarget(); },
  hover: (i) => { hoverId = notes[i]?.id ?? null; hoverInside = hoverId != null; syncOpen(); retarget(); },
  settle: () => { for (const n of notes) { n.s = { ...n.tg }; n.v = zeroPose(); n.o = n.ot; n.arriving = false; } wake(); },
  only: (k) => { while (notes.length > k) drop(notes.pop()); retarget(); renderCount(); for (const n of notes) { n.s = { ...n.tg }; n.v = zeroPose(); } wake(); },
  freeze: (v) => { frozen = !!v; if (!frozen) wake(); },
  rect: (i) => { const r = notes[i]?.el.getBoundingClientRect(); return r && { x: r.left, y: r.top, w: r.width, h: r.height }; },
};
// test hook: where the ice of card i lands on screen (projected corners) vs its DOM box
window.__dv58.align = (i = 0) => {
  const n = notes[i]; if (!n || !ice) return null; const cam = ice.camera, pr = page.getBoundingClientRect(), xs = [], ys = [];
  for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    const v = new THREE.Vector3(x * W / 2, y * H / 2, 0).applyMatrix4(n.m).project(cam);
    xs.push((v.x * 0.5 + 0.5) * page.clientWidth + pr.left); ys.push((-v.y * 0.5 + 0.5) * page.scrollHeight + pr.top);
  }
  const r = n.el.getBoundingClientRect();
  return Math.max(Math.abs(Math.min(...xs) - r.left), Math.abs(Math.max(...xs) - r.right), Math.abs(Math.min(...ys) - r.top), Math.abs(Math.max(...ys) - r.bottom));
};
