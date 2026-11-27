/* dmm.js — Realistic handheld Digital Multimeter (DMM).  Load AFTER ngspice.js, BEFORE live-effects.js.

   Nothing is added to ngspice.js: this file registers the part from the outside (SYMS, PAL, typeFor, inspect, dupSel).

   The DMM is ONE part with two probes (red = pin 1 = +, black = pin 2 = COM).  The rotary dial chooses what it measures:

        dial position      netlist element it becomes                 what it does
        ---------------    ----------------------------------------   ------------------------------------------
        OFF                RDMMOFF1 a b 1G                            open circuit, display blank
        V=  (DC volts)     RDMMDV1  a b 10meg                         10 Mohm across the probes, reads V(red) - V(black)
        V~  (AC volts)     RDMMAV1  a b 10meg                         same, true-RMS of the AC part
        Ω   (resistance)   VDMMOH1  a b DC 0.4                        0.4 V test source, R = 0.4 V / test current (circuit must be unpowered)
        A=  (DC amps)      VDMMDA1  a b DC 0                          0 V series source, reads the current red -> black
        A~  (AC amps)      VDMMAA1  a b DC 0                          same, true-RMS of the AC part

   The mode is stored in the element NAME (RDMMDV1 / RDMMAV1 / VDMMDA1 / VDMMAA1 / RDMMOFF1), so a netlist typed by hand
   or loaded from a file turns back into a DMM with the dial in the right position.

   Click the dial on the canvas: a click on a dial label jumps to it, a click on the left / right half of the knob turns it
   one step anticlockwise / clockwise.  The Inspector has the same choice as a drop-down.

   The rubber holster (outer rounded frame) is red, the body inside stays dark grey. The reading (live-effects.js) is shown on the LCD with 7-segment digits (seg7.js) in 3 3/4 digits (3999 counts) with auto-range, REAL-LIFE limits: V= OL above 600 V, V~ OL above 600 V, ohm OL above 4 Mohm, A OL above 10 A and SHORT at 100 A
   (the meter burns at 100 A).  DMM.setRange('ext') switches to the extended simulator ranges (nA..kA, uV..MV, mohm..Mohm).  The part burns / short-circuits at 100 A (DMM.maxA()) (live-effects.js). */
(function () {
  'use strict';
  if (typeof SYMS === 'undefined' || typeof S === 'undefined') return;     /* ngspice.js not loaded */

  const $id = (i) => document.getElementById(i);
  const MODES = ['off', 'dv', 'av', 'oh', 'da', 'aa'];                           /* dial order, anticlockwise -> clockwise */
  const INFO = {
    off: { pre: 'RDMMOFF', v: '1G',     name: 'OFF',        lab: 'OFF', ang: -125, kind: '',  ac: false },
    dv:  { pre: 'RDMMDV',  v: '10meg',  name: 'DC volts',   lab: 'V=',  ang: -75,  kind: 'V', ac: false },
    av:  { pre: 'RDMMAV',  v: '10meg',  name: 'AC volts',   lab: 'V~',  ang: -25,  kind: 'V', ac: true  },
    oh:  { pre: 'VDMMOH',  v: 'DC 0.4', name: 'Resistance', lab: 'Ω',   ang: 25,   kind: 'R', ac: false },
    da:  { pre: 'VDMMDA',  v: 'DC 0',   name: 'DC amps',    lab: 'A=',  ang: 75,   kind: 'A', ac: false },
    aa:  { pre: 'VDMMAA',  v: 'DC 0',   name: 'AC amps',    lab: 'A~',  ang: 125,  kind: 'A', ac: true  }
  };
  const NAME_RE = /^([rv])dmm(off|dv|av|oh|da|aa)(\d|_|$)/i;
  const modeOfName = (n) => { const m = NAME_RE.exec(String(n || '')); return m ? m[2].toLowerCase() : null; };
  /* mode of a part: the model field (kept by Duplicate / Undo) first, then the element name (netlist typed by hand) */
  const modeOf = (p) => (p && INFO[p.dm] ? p.dm : modeOfName(p && p.n)) || 'dv';

  /* ---------- LCD text: 4 digits (max 9999), auto-range.  v = measured value (V, A or ohm).  Returns { t: digits, u: unit } ----------
     Every kind has a ladder of units [scale in base units, label].  The unit is the biggest one the value reaches (so the display never
     shows 1000 of a unit: it moves up to 1.000 of the next one); the decimals keep 4 significant digits (9.999 / 99.99 / 999.9 / 9999).
       Current     nA -> uA -> mA -> A -> kA     up to 9999 kA, from 10000 kA the display shows SHORT
       Resistance  mOhm -> Ohm -> kOhm -> MOhm   up to 100.0 MOhm, above that OL
       Voltage     uV -> mV -> V -> kV -> MV     up to 100.0 MV,   above that OL */
  const LADDER = {
    A: { u: [[1e-9, 'nA'], [1e-6, 'µA'], [1e-3, 'mA'], [1, 'A'], [1e3, 'kA']], base: 3, max: 9.999e6, over: 'SHORT', floor: 1e-12 },
    R: { u: [[1e-3, 'mΩ'], [1, 'Ω'], [1e3, 'kΩ'], [1e6, 'MΩ']], base: 1, max: 100e6, over: 'OL', floor: 1e-6 },
    V: { u: [[1e-6, 'µV'], [1e-3, 'mV'], [1, 'V'], [1e3, 'kV'], [1e6, 'MV']], base: 2, max: 100e6, over: 'OL', floor: 5e-10 }
  };
  const dec = (x) => (x < 10 ? 3 : x < 100 ? 2 : x < 1000 ? 1 : 0);          /* 4 significant digits */
  function formatExt(mode, v) {
    const I = INFO[mode]; if (!I || !I.kind) return { t: '', u: '' };
    const L = LADDER[I.kind], top = L.u[L.u.length - 1][1], base = L.u[L.base][1];
    if (isNaN(v)) return { t: L.over, u: I.kind === 'A' ? top : base };       /* no value */
    let a = Math.abs(v); if (a < L.floor) a = 0;
    if (!isFinite(a) || a > L.max * (I.kind === 'A' ? 1.00005 : 1.0005) || Number(a.toPrecision(4)) >= (I.kind === 'A' ? 1e7 : Infinity))
      return { t: L.over, u: I.kind === 'A' ? top : base };                   /* SHORT (>= 10000 kA) / OL */
    if (a === 0) return { t: (0).toFixed(3), u: base };                       /* zero: shown in the base unit */
    const r4 = Number(a.toPrecision(4));                                      /* the value as it will be shown (rounding can reach the next unit) */
    let k = 0; for (let i = 0; i < L.u.length; i++) if (r4 >= L.u[i][0] * (1 - 1e-9)) k = i;
    const x = a / L.u[k][0], s = x.toFixed(dec(x));
    return { t: (v < 0 ? '-' : '') + s, u: L.u[k][1] };
  }

  /* ---------- REAL-LIFE ranges (default): a handheld with the dial of the photo (200 / 2k / 20k ... positions) but in the 4-type ranges
     (400 / 4 / 40 / 400, 3999 counts) instead of the 2-type ones (200 / 2 / 20 / 200, 1999 counts).
     [full scale, divisor, decimals, unit]: the first range whose full scale holds the value is used.
       DC volts   400.0 mV / 4.000 V / 40.00 V / 400.0 V / 600 V         above 600 V  -> OL
       AC volts   400.0 V / 600 V (true RMS)                             above 600 V  -> OL
       Current    400.0 uA / 4.000 mA / 40.00 mA / 400.0 mA / 10.00 A    above 10 A   -> OL,  100 A or more -> SHORT (the meter is shorted / fuse blows)
       Resistance 400.0 ohm / 4.000 k / 40.00 k / 400.0 k / 4.000 M      above 4 Mohm or open -> OL */
  const REAL = {
    V:  [[0.4, 1e-3, 1, 'mV'], [4, 1, 3, 'V'], [40, 1, 2, 'V'], [400, 1, 1, 'V'], [600, 1, 0, 'V']],
    VA: [[400, 1, 1, 'V'], [600, 1, 0, 'V']],
    R:  [[400, 1, 1, 'Ω'], [4e3, 1e3, 3, 'kΩ'], [40e3, 1e3, 2, 'kΩ'], [400e3, 1e3, 1, 'kΩ'], [4e6, 1e6, 3, 'MΩ']],
    A:  [[400e-6, 1e-6, 1, 'µA'], [4e-3, 1e-3, 3, 'mA'], [40e-3, 1e-3, 2, 'mA'], [400e-3, 1e-3, 1, 'mA'], [10, 1, 2, 'A']]
  };
  const SHORT_A = 100;                                                         /* real DMM: 100 A through the meter = short circuit */
  function formatReal(mode, v) {
    const I = INFO[mode]; if (!I || !I.kind) return { t: '', u: '' };
    const R = REAL[I.kind === 'V' && I.ac ? 'VA' : I.kind], top = R[R.length - 1];
    if (isNaN(v)) return { t: 'OL', u: top[3] };
    let a = Math.abs(v); if (a < 1e-12) a = 0;
    if (I.kind === 'A' && a >= SHORT_A) return { t: 'SHORT', u: 'A' };
    if (!isFinite(a) || a > top[0] * 1.0005) return { t: 'OL', u: I.kind === 'R' ? 'Ω' : top[3] };
    const r = R.find((q) => a <= q[0] * 1.0005) || top;
    return { t: (v < 0 && a !== 0 ? '-' : '') + (a / r[1]).toFixed(r[2]), u: r[3] };
  }
  /* DMM.range: 'real' (default, handheld limits) or 'ext' (nA..kA, uV..MV, mohm..Mohm) */
  let RANGE = 'real';
  const format = (mode, v) => (RANGE === 'ext' ? formatExt : formatReal)(mode, v);
  const setRange = (r) => { RANGE = r === 'ext' ? 'ext' : 'real'; try { draw(); } catch (e) { /* ignore */ } };
  const maxA = () => (RANGE === 'ext' ? 10000 : SHORT_A);                      /* current at which the DMM burns / shorts (live-effects.js) */

  /* ---------- drawing (local coordinates, 1 grid = 10 px, pins 2 grid units either side of the centre line) ---------- */
  const JX = { a10: -30, ma: -10, com: 10, vw: 30 }, JY = 58, DY = 20;   /* DY = dial centre */               /* jack positions */
  const PINX = { red: 20, blk: -20 }, PINY = 90;                             /* probe tips = the two pins */
  const mono = 'font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"';
  const sans = "font-family=\"system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif\"";
  const tx = (x, y, s, sz, c, o) => `<text x="${x}" y="${y}" text-anchor="${(o && o.a) || 'middle'}" font-size="${sz}" ${(o && o.b) ? 'font-weight="700"' : ''} fill="${c}" stroke="none" ${(o && o.m) ? mono : sans}>${esc(s)}</text>`;
  const fx = (p, r) => (p && p.id ? ` data-fx="${p.id}" data-role="${r}"` : '');

  function dial(mode) {
    const cx = 0, cy = DY, I = INFO[mode];
    let g = `<circle cx="0" cy="${DY}" r="23" fill="#15181d" stroke="#050607" stroke-width="1.2"/>`;
    /* tick marks + labels around the dial */
    MODES.forEach((k) => {
      const a = INFO[k].ang * Math.PI / 180, s = Math.sin(a), c = -Math.cos(a), on = k === mode;
      g += `<line x1="${(cx + s * 19).toFixed(1)}" y1="${(cy + c * 19).toFixed(1)}" x2="${(cx + s * 23).toFixed(1)}" y2="${(cy + c * 23).toFixed(1)}" stroke="${on ? '#ffd23f' : '#8d96a3'}" stroke-width="1.4" stroke-linecap="round"/>`;
      g += tx((cx + s * 32).toFixed(1), (cy + c * 32 + 2).toFixed(1), INFO[k].lab, 6.4, on ? '#ffd23f' : '#c7cdd6', { b: 1 });
    });
    /* knob */
    g += `<circle cx="0" cy="${DY}" r="16" fill="url(#dmm-knob)" stroke="#000" stroke-width="1"/>`;
    for (let i = 0; i < 24; i++) { const a = i * 15 * Math.PI / 180; g += `<line x1="${(Math.sin(a) * 14.6).toFixed(1)}" y1="${(DY - Math.cos(a) * 14.6).toFixed(1)}" x2="${(Math.sin(a) * 16).toFixed(1)}" y2="${(DY - Math.cos(a) * 16).toFixed(1)}" stroke="#000" stroke-width="1.1" opacity=".55"/>`; }
    g += `<g transform="translate(0 ${DY}) rotate(${I.ang})"><path d="M-3 0L-1.6-14.5H1.6L3 0Z" fill="#f4f6f8" stroke="#6b7280" stroke-width=".5"/><circle r="3.2" fill="#2b2f36" stroke="#000" stroke-width=".6"/></g>`;
    return g;
  }

  function jacks(mode) {
    const I = INFO[mode], amps = I.kind === 'A';
    const J = (x, lab, col, hot) => `<circle cx="${x}" cy="${JY}" r="5.4" fill="#0b0c0e" stroke="${col}" stroke-width="1.6"/><circle cx="${x}" cy="${JY}" r="2.2" fill="${hot ? '#c9a15a' : '#050505'}"/>` + tx(x, JY - 8.2, lab, 4.8, '#e9edf2', { b: 1 });
    return J(JX.a10, '10A', '#e8590c', amps) + J(JX.ma, 'mA', '#e8590c', false) + J(JX.com, 'COM', '#9aa3ae', true) + J(JX.vw, 'VΩ', '#e03131', !amps && I.kind !== '');
  }

  function leads(mode) {
    const amps = INFO[mode].kind === 'A', rj = amps ? JX.a10 : JX.vw;
    const cable = (jx, px, col, dk) => `<path d="M${jx} ${JY + 1}C${jx} 82 ${px} 66 ${px} 80" fill="none" stroke="#000" stroke-width="4.6" stroke-linecap="round" opacity=".55"/><path d="M${jx} ${JY + 1}C${jx} 82 ${px} 66 ${px} 80" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
    const probe = (px, col, hi) => `<rect x="${px - 3.4}" y="76" width="6.8" height="12" rx="2.2" fill="${col}" stroke="#000" stroke-width=".8"/><rect x="${px - 3.4}" y="76" width="2.6" height="12" rx="1.2" fill="${hi}" opacity=".55"/><path d="M${px - 1.2} 88H${px + 1.2}L${px + .5} ${PINY}H${px - .5}Z" fill="#cfd5dc" stroke="#6b7280" stroke-width=".5"/>`;
    const plug = (x, col) => `<rect x="${x - 3}" y="${JY - 3}" width="6" height="7" rx="1.5" fill="${col}" stroke="#000" stroke-width=".7"/>`;
    return cable(JX.com, PINX.blk, '#1c1f24') + cable(rj, PINX.red, '#d62828') + plug(JX.com, '#1c1f24') + plug(rj, '#d62828') + probe(PINX.blk, '#23262b', '#9aa3ae') + probe(PINX.red, '#d62828', '#ff9a9a');
  }

  function drawDMM(p) {
    const mode = modeOf(p), I = INFO[mode], f = (window.FX && p && p.id) ? FX.get(p) : { t: '' }, off = mode === 'off';
    const lcdOn = !!f.t && !off;
    let g = '';
    /* red rubber holster (the rounded outer frame) around the dark grey body */
    g += '<rect x="-43" y="-80" width="86" height="150" rx="13" fill="#d62828" stroke="#4a0808" stroke-width="1.6"/>';
    g += '<rect x="-43" y="-80" width="86" height="150" rx="13" fill="url(#dmm-gloss)" stroke="none"/>';
    g += '<rect x="-37" y="-74" width="74" height="138" rx="8" fill="#2a2e35" stroke="#0a0b0d" stroke-width="1.2"/>';
    /* brand */
    g += tx(0, -65.5, 'DMM-4000', 6.4, '#e6e9ee', { b: 1 });
    /* LCD */
    g += '<rect x="-31" y="-61" width="62" height="34" rx="3" fill="#10141a" stroke="#000" stroke-width="1"/>';
    g += `<rect x="-29" y="-59" width="58" height="30" rx="2" fill="${lcdOn ? '#bcc4ae' : '#aeb7a2'}" stroke="#0b0d10" stroke-width=".8"/>`;
    g += '<rect x="-29" y="-59" width="58" height="9" rx="2" fill="#ffffff" opacity=".10"/>';
    /* 7-segment digits (seg7.js); unlit segments are ghosted like a real LCD */
    g += window.SEG7 ? SEG7.holder(p, off ? '' : f.t, { x: -28, y: -50.5, w: 42, h: 16, n: 5, on: '#1b1f1a', off: 'rgba(30,36,28,.15)' })
      : `<text${fx(p, 'txt')} x="15" y="-38.5" text-anchor="end" font-size="13" font-weight="700" fill="#10281a" ${mono}>${esc(off ? '' : f.t)}</text>`;
    g += `<text${fx(p, 'dmmu')} x="28" y="-38.5" text-anchor="end" font-size="6.6" font-weight="700" fill="#10281a" ${mono}>${esc(off ? '' : (f.u || ''))}</text>`;
    if (!off) {
      g += tx(-26, -52, I.kind === 'R' ? 'Ω' : (I.ac ? 'AC' : 'DC'), 6, '#10281a', { a: 'start', b: 1, m: 1 });
      g += tx(-26, -31.4, 'AUTO', 4.6, '#10281a', { a: 'start', b: 1, m: 1 });
      if (I.ac) g += tx(-4, -31.4, 'RMS', 4.6, '#10281a', { a: 'start', b: 1, m: 1 });
    }
    /* analog-style bar scale under the digits */
    g += '<path d="M-26 -34H27" stroke="#10281a" stroke-width=".4" opacity=".35"/>';
    /* function buttons */
    ['HOLD', 'RANGE', 'REL'].forEach((b, i) => { const x = -23 + i * 23; g += `<rect x="${x - 9}" y="-24" width="18" height="7" rx="2.4" fill="#3a3f48" stroke="#000" stroke-width=".7"/>` + tx(x, -18.9, b, 3.8, '#dfe4ea', { b: 1 }); });
    g += dial(mode);
    g += jacks(mode);
    g += leads(mode);
    g += `<circle${fx(p, 'pwr')} cx="31" cy="-70.5" r="1.6" fill="${lcdOn ? '#46ff7a' : '#1b3a25'}"/>`;
    return g;
  }

  /* gradients used by the drawing (added once to the page) */
  function defs() {
    if ($id('dmmDefs')) return;
    const svg = $id('svg'); if (!svg) return;
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); d.id = 'dmmDefs';
    d.innerHTML = '<radialGradient id="dmm-knob" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#4a505a"/><stop offset=".55" stop-color="#23272d"/><stop offset="1" stop-color="#0d0f12"/></radialGradient>' +
      '<linearGradient id="dmm-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>';
    svg.insertBefore(d, svg.firstChild);
  }

  /* ---------- part registration (outside ngspice.js) ---------- */
  SYMS.DMM = {
    pre: 'RDMMDV', fmt: 'two', pins: [['1', 2, 9], ['2', -2, 9]], bb: [-5, -8.2, 5, 9.2], ib: [-50, -88, 50, 96],
    def: '10meg', name: 'DMM (Multimeter)', cat: 'Measurement', draw: drawDMM,
    lbl: (p) => INFO[modeOf(p)].name
  };
  /* the netlist text of a DMM turns back into a DMM part */
  if (typeof window.typeFor === 'function' && !window.typeFor.dmmHooked) {
    const base = window.typeFor;
    const t = function (e, mods) {
      try { if ((e.k === 'R' || e.k === 'V') && NAME_RE.test(e.n) && NAME_RE.exec(e.n)[1].toUpperCase() === e.k) return 'DMM'; } catch (err) { /* fall through */ }
      return base(e, mods);
    };
    t.dmmHooked = true; window.typeFor = t;
  }
  /* palette: Measurement group, next to the Voltmeter */
  try {
    if (typeof PAL !== 'undefined' && !PAL.some((q) => q.k === 'DMM')) {
      let at = -1; PAL.forEach((q, i) => { if (q.g === 'Measurement') at = i; });
      const item = { k: 'DMM', g: 'Measurement', n: 'DMM (Multimeter)' };
      if (at >= 0) PAL.splice(at + 1, 0, item); else PAL.push(item);
      const q = $id('psearch'); buildPalette(q ? q.value : '');
    }
  } catch (e) { /* palette is optional */ }

  /* ---------- mode change: the NAME and the VALUE of the element follow the dial ---------- */
  const numOf = (n) => { const m = /(\d+)$/.exec(String(n || '')); return m ? m[1] : ''; };
  function freeName(pre, want, self) {
    let k = want ? +want : 1;
    const used = (n) => S.M.parts.some((q) => q !== self && String(q.n).toLowerCase() === (pre + n).toLowerCase());
    while (used(k)) k++;
    return pre + k;
  }
  function apply(p, mode) {                       /* inside mutate(): make name + value match the dial */
    const I = INFO[mode]; p.dm = mode;
    const want = numOf(p.n);
    if (modeOfName(p.n) !== mode || !NAME_RE.test(p.n)) p.n = freeName(I.pre, want, p);
    p.v = I.v;
  }
  const outputOn = () => (typeof SIMLIVE !== 'undefined' && SIMLIVE) || (typeof ANIM !== 'undefined' && ANIM.on);
  function setMode(p, mode) {
    if (!INFO[mode] || modeOf(p) === mode && modeOfName(p.n) === mode) return;
    const was = outputOn();
    mutate(() => { apply(p, mode); });
    if (was) setTimeout(() => { if (window.CIRC) window.CIRC.rerun = true; try { const b = $id('bRunSim'); if (b) b.click(); } finally { if (window.CIRC) window.CIRC.rerun = false; } }, 40);
  }
  /* a duplicated DMM keeps the dial position: newName() only knows the prefix, so fix name + value afterwards */
  (function hookDup() {
    const base = window.dupSel; if (typeof base !== 'function' || base.dmmHooked) return;
    const d = function () {
      try { S.M.parts.forEach((q) => { if (q.t === 'DMM' && S.sel.has(q.id)) q.dm = modeOf(q); }); } catch (e) { /* ignore */ }   /* the copy keeps the dial position */
      const r = base.apply(this, arguments);
      try {
        const bad = S.M.parts.filter((q) => q.t === 'DMM' && (modeOfName(q.n) !== modeOf(q) || !NAME_RE.test(q.n)));
        if (bad.length) { S.M.parts.forEach((q) => { if (bad.indexOf(q) >= 0) apply(q, modeOf(q)); }); try { afterEdit(true); } catch (e) { /* ignore */ } }
      } catch (e) { /* ignore */ }
      return r;
    };
    d.dmmHooked = true; window.dupSel = d;
  })();

  /* ---------- click on the dial (canvas) ---------- */
  function toLocal(p, wx, wy) {
    let x = wx - p.x * U, y = wy - p.y * U; const a = -(p.r || 0) * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    let lx = x * c - y * s, ly = x * s + y * c; if (p.m) lx = -lx; return [lx, ly];
  }
  let down = null;
  $id('svg').addEventListener('pointerdown', (e) => {
    down = null;
    if (e.button !== 0 || e.shiftKey || e.altKey || S.tool !== 'select' || S.wire) return;
    const [wx, wy] = toWorld(e);
    if (pinAt(wx, wy, 7)) return;
    const p = partAt(wx, wy);
    if (!p || p.t !== 'DMM') return;
    const [lx, ly] = toLocal(p, wx, wy);
    if (Math.hypot(lx, ly - DY) <= 38) down = { id: p.id, x: e.clientX, y: e.clientY, lx, ly };
  }, true);
  addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;      /* a drag moves the part, it does not turn the dial */
    const p = S.M.parts.find((q) => q.id === d.id); if (!p || p.bn) return;
    let best = null, bd = 13;                                                 /* a dial label: jump straight to it */
    MODES.forEach((k) => { const a = INFO[k].ang * Math.PI / 180, x = Math.sin(a) * 32, y = DY - Math.cos(a) * 32, dd = Math.hypot(d.lx - x, d.ly - y); if (dd < bd) { bd = dd; best = k; } });
    if (!best) {                                                              /* the knob: left half = anticlockwise, right half = clockwise */
      if (Math.hypot(d.lx, d.ly - DY) > 19) return;
      const i = MODES.indexOf(modeOf(p)); best = MODES[Math.max(0, Math.min(MODES.length - 1, i + (d.lx < 0 ? -1 : 1)))];
    }
    setMode(p, best);
  });

  /* ---------- inspector ---------- */
  const baseInspect = window.inspect;
  window.inspect = function () {
    baseInspect.apply(this, arguments);
    try {
      const ids = [...S.sel]; if (ids.length !== 1 || S.selW) return;
      const p = S.M.parts.find((q) => q.id === ids[0]); if (!p || p.t !== 'DMM') return;
      const P = $id('pProp'), head = P.querySelector('.ph'), m = modeOf(p);
      const fv = $id('fV'); if (fv) { fv.readOnly = true; if (fv.parentNode) fv.parentNode.firstChild.textContent = 'Internal element (set by the dial)'; }
      const h = `<div class="field">Dial position<select id="dmmMode">${MODES.map((k) => `<option value="${k}" ${k === m ? 'selected' : ''}>${INFO[k].lab}  ${INFO[k].name}</option>`).join('')}</select></div>
        <p class="hint">Red probe = pin 1 (+), black probe = COM. Click the dial on the canvas to turn it. <b>V</b> positions put 10 MΩ across the probes (parallel, like a voltmeter); <b>Ω</b> applies a 0.4 V test voltage and reads R = 0.4 V / current: measure a resistor with the circuit <b>unpowered</b> (other sources falsify the reading; OL = open circuit or above 4 MΩ). <b>A</b> positions are a 0 V series element (in the path, like an ammeter). AC positions read true RMS of the AC part. OL = over-range (above 600 V, 10 A or 4 MΩ); at 100 A the DMM shows SHORT, short-circuits and burns. The DMM short-circuits and burns at 100 A.</p>`;
      if (head) head.insertAdjacentHTML('afterend', h);
    } catch (e) { /* inspector extras are optional */ }
  };
  $id('pProp').addEventListener('change', (e) => {
    if (e.target.id !== 'dmmMode') return;
    const p = S.M.parts.find((q) => S.sel.has(q.id)); if (p && p.t === 'DMM') setMode(p, e.target.value);
  });

  defs();
  window.DMM = { modes: MODES, info: INFO, mode: modeOf, format, setMode, draw: drawDMM, setRange, maxA, get range() { return RANGE; } };
})();
