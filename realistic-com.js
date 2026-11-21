/* =====================================================================
   realistic-com.js  —  Realistic component views for NGSpice Circuit Simulator Studio

   Every part of the editor (SYMS in ngspice.js) gets a "photo-style" drawing:
     resistor with colour bands, ceramic / electrolytic capacitors, coil inductor,
     battery, signal generators, glass / plastic diodes, 5 mm LED (colour follows
     the value), TO-92 BJTs, TO-220 MOSFETs, DIP op-amp, VCVS / VCCS modules,
     555 timer DIP-8, CMOS logic ICs (CD4xxx), generic IC block, ground plate,
     net-label tag.

   Pin positions are IDENTICAL to the schematic symbols, so wires, netlist
   generation, auto-layout and simulation are not affected by the view.

   Public API (window.RC):
     RC.on            true while the Realistic view is active
     RC.has(key)      does a realistic drawing exist for SYMS[key] ?
     RC.draw(part)    SVG string for a part (local coordinates, 1 grid = 10 px)
     RC.defs()        <defs> markup (gradients) used by the drawings
     RC.set(bool)     switch view programmatically
     RC.toggle()      swap Schematic <-> Realistic
   ===================================================================== */
(function () {
  'use strict';

  const RC = (window.RC = { on: false });

  /* ---------------------------------------------------------------- helpers */
  const SU = { t: 1e12, g: 1e9, meg: 1e6, k: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
  function num(s) {
    const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(meg|[tgkmunpfµ])?/i.exec(s == null ? '' : String(s));
    return m ? +m[1] * (m[2] ? SU[m[2].toLowerCase()] : 1) : NaN;
  }
  function fmt(v, unit) {
    if (!isFinite(v)) return '';
    if (v === 0) return '0' + (unit || '');
    const P = ['f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T'];
    let e = Math.floor(Math.log10(Math.abs(v)) / 3);
    e = Math.max(-5, Math.min(4, e));
    return +(v / Math.pow(10, 3 * e)).toPrecision(3) + P[e + 5] + (unit || '');
  }
  const X = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = (x, y, s, o) => {
    o = o || {};
    return `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" font-size="${o.s || 7}" ${o.b ? 'font-weight="700"' : ''} ` +
      `fill="${o.c || '#e6e9ee'}" stroke="none" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">${X(s)}</text>`;
  };
  const TS = (x, y, str, sz, c) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-size="${sz}" font-weight="700" fill="${c}" stroke="none" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif">${X(str)}</text>`;
  const tok = (p) => String(p.v == null ? '' : p.v).trim().split(/\s+/)[0] || '';

  /* metal lead (silver wire) */
  const lead = (d) =>
    `<path d="${d}" fill="none" stroke="#7d848e" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#dfe4ea" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  /* solid shape + glossy shading overlay.  el = tag + geometry attributes */
  const sh = (el, fill, stroke, sw) =>
    `<${el} fill="${fill}" stroke="${stroke || 'rgba(0,0,0,.5)'}" stroke-width="${sw || 0.8}"/>` +
    `<${el} fill="url(#rc-gloss)" stroke="none"/>`;

  /* leads from every pin to the edge of a rectangular body  r=[x1,y1,x2,y2] */
  function leadsFor(pins, r) {
    let d = '';
    pins.forEach(([, dx, dy]) => {
      const x = dx * 10, y = dy * 10;
      if (x < r[0]) d += `M${x} ${y}H${r[0]}`;
      else if (x > r[2]) d += `M${x} ${y}H${r[2]}`;
      else if (y < r[1]) d += `M${x} ${y}V${r[1]}`;
      else if (y > r[3]) d += `M${x} ${y}V${r[3]}`;
    });
    return lead(d);
  }
  const chipBody = (r, rx) =>
    sh(`rect x="${r[0]}" y="${r[1]}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" rx="${rx || 3}"`, '#1d2025', '#050607', 1);
  const pin1dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#0a0b0d" stroke="#555b64" stroke-width=".6"/>`;

  /* ----------------------------------------------------- resistor colour code */
  const BC = ['#15171a', '#7a431d', '#d12f2f', '#f08a1c', '#f2d21f', '#2e9d46', '#2f64d1', '#8a45c8', '#8a8f96', '#f4f4f4'];
  const GOLD = '#d4af37', SILVER = '#c4c8ce';
  function bands(v) {
    if (!(v > 0)) return null;
    let e = Math.floor(Math.log10(v) + 1e-9);
    let d = Math.round((v / Math.pow(10, e)) * 10);
    if (d >= 100) { d = 10; e++; }
    const mul = e - 1;
    if (mul > 9 || mul < -2) return null;
    return [BC[Math.floor(d / 10)], BC[d % 10], mul >= 0 ? BC[mul] : mul === -1 ? GOLD : SILVER];
  }
  /* EIA 3-digit capacitor code (100n -> 104) */
  function capCode(v) {
    if (!(v > 0)) return 'C';
    const pf = v * 1e12;
    if (pf < 10) return +pf.toPrecision(2) + 'p';
    let e = Math.floor(Math.log10(pf) + 1e-9), m = Math.round(pf / Math.pow(10, e - 1));
    if (m >= 100) { m = 10; e++; }
    return '' + m + (e - 1);
  }

  /* ---------------------------------------------------------- shared <defs> */
  RC.defs = function () {
    return '<defs>' +
      '<linearGradient id="rc-gloss" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".38" stop-color="#fff" stop-opacity=".05"/>' +
        '<stop offset=".72" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>' +
      '<radialGradient id="rc-dome" cx=".35" cy=".3" r=".75">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#fff" stop-opacity=".12"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>' +
      '<linearGradient id="rc-metal" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f4f6f9"/><stop offset=".5" stop-color="#aab1bb"/><stop offset="1" stop-color="#6f7681"/></linearGradient>' +
      '<linearGradient id="rc-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f78e0"/><stop offset="1" stop-color="#17358a"/></linearGradient>' +
      '<linearGradient id="rc-orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dba03c"/><stop offset="1" stop-color="#bf8426"/></linearGradient>' +
      '<linearGradient id="rc-black" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d323a"/><stop offset="1" stop-color="#0b0d10"/></linearGradient>' +
      '</defs>';
  };

  /* ----------------------------------------------------------- drawings */
  const LEDCOL = { red: '#ff3b30', green: '#34c759', blue: '#2f7bff', yellow: '#ffd60a', orange: '#ff9500', white: '#f2f4f7', amber: '#ffb000' };
  const ledColor = (v) => {
    const s = String(v || '').toLowerCase();
    for (const k in LEDCOL) if (s.indexOf(k) >= 0) return LEDCOL[k];
    return LEDCOL.red;
  };

  const gateNo = { INV: '4069', BUF: '4050', AND2: '4081', NAND2: '4011', OR2: '4071', NOR2: '4001', XOR2: '4070', XNOR2: '4077', AND3: '4073', NAND3: '4023', OR3: '4075', NOR3: '4025' };
  const pin555 = { gnd: 1, trig: 2, out: 3, rst: 4, ctl: 5, thr: 6, dis: 7, vcc: 8 };

  function axialDiode(o) {
    const w = o.w, h = o.h;
    let g = lead(`M-30 0H${-w + 1}M${w - 1} 0H30`);
    g += sh(`rect x="${-w}" y="${-h}" width="${2 * w}" height="${2 * h}" rx="${o.rx || 2}"`, o.body, 'rgba(0,0,0,.55)', 0.9);
    if (o.glass) {
      g += `<path d="M${-w + 2} 0H${w - 6}" stroke="#2b2b2b" stroke-width="1.6" stroke-linecap="round"/>` +
        `<rect x="${-w - 1.2}" y="${-h * 0.55}" width="2.2" height="${h * 1.1}" fill="#b0b6bf" stroke="rgba(0,0,0,.4)" stroke-width=".5"/>` +
        `<rect x="${w - 1}" y="${-h * 0.55}" width="2.2" height="${h * 1.1}" fill="#b0b6bf" stroke="rgba(0,0,0,.4)" stroke-width=".5"/>`;
    }
    g += `<rect x="${w - 6}" y="${-h}" width="3.2" height="${2 * h}" fill="${o.band}" stroke="rgba(0,0,0,.3)" stroke-width=".4"/>`;
    return g;
  }

  function dcValue(v) {
    const m = /dc\s+([-+]?[\d.]+(?:e[-+]?\d+)?\s*(?:meg|[tgkmunpf])?)/i.exec(v || '') || /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?\s*(?:meg|[tgkmunpf])?)\s*$/i.exec(v || '');
    return m ? fmt(num(m[1]), 'V') : '';
  }

  function generator(kind) {
    const wave = {
      sin: 'M-11 -3q2.75-6 5.5 0t5.5 0t5.5 0t5.5 0',
      pulse: 'M-11 1V-7H-6V1H-1V-7H4V1H9V-7H11',
      pwl: 'M-11 1L-5-7-1-2 3-6 11 1',
      tri: 'M-11 -3L-8.25 -7 -2.75 1 2.75 -7 8.25 1 11 -3',
      saw: 'M-11 1L-5.5 -7V1L0 -7V1L5.5 -7V1L11 -7',
      noise: 'M-11 -3L-9 -6 -7 0 -5 -7 -3 1 -1 -4 1 -7 3 0 5 -6 7 1 9 -5 11 -3'
    }[kind];
    return lead('M-30 0H-22M22 0H30') +
      sh('rect x="-19" y="-14" width="38" height="28" rx="3.5"', '#434d59', '#14181d', 1) +
      '<rect x="-13.5" y="-10" width="27" height="14" rx="1.8" fill="#a6dcab" stroke="#10151a" stroke-width="1"/>' +
      '<path d="M-13 -3H13M0 -10V4" stroke="#6fae78" stroke-width=".5" opacity=".8"/>' +
      `<path d="${wave}" fill="none" stroke="#1b5d2d" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
      '<circle cx="-9" cy="9" r="2.7" fill="#d8dde4" stroke="#222" stroke-width=".6"/><circle cx="0" cy="9" r="2.7" fill="#d8dde4" stroke="#222" stroke-width=".6"/>' +
      '<circle cx="9" cy="9" r="2.7" fill="#d8dde4" stroke="#222" stroke-width=".6"/>' +
      '<path d="M-9 7.4v1.8M0 7.4v1.8M9 7.4v1.8" stroke="#333" stroke-width=".8"/>' +
      '<circle cx="-22" cy="0" r="3.3" fill="#d83a34" stroke="#6b0f0b" stroke-width=".9"/><circle cx="22" cy="0" r="3.3" fill="#23262b" stroke="#000" stroke-width=".9"/>' +
      T(-22, 0.1, '+', { s: 4.5, b: 1, c: '#fff' }) + T(22, 0.1, '−', { s: 4.5, b: 1, c: '#bbb' });
  }

  function to92(p, pnp) {
    const name = tok(p).slice(0, 8) || (pnp ? '2N2907' : '2N2222');
    return lead('M-30 0H-4M20 -30V-3M20 30V3') +
      sh('path d="M-4 -17H4A17 17 0 0 1 4 17H-4Z"', '#23262b', '#050607', 1) +
      '<path d="M-3.2 -15V15" stroke="#6b717a" stroke-width=".8"/>' +
      T(8.5, 1.8, name, { s: 5, c: '#d7dce3' }) + T(8.5, 8.8, 'TO-92', { s: 3.8, c: '#8f97a2' });
  }

  function to220(p, pch, four) {
    const dTop = !pch, tabY = dTop ? -23 : 13, holeY = dTop ? -18 : 18;
    let g = lead('M-30 0H-8M20 -30V-13M20 30V13' + (four ? 'M30 0H24' : ''));
    g += sh(`rect x="-6" y="${tabY}" width="30" height="10" rx="1.5"`, '#b9c0ca', '#4a5059', 0.9);
    g += `<circle cx="3" cy="${holeY}" r="3" fill="#2a2f36" stroke="#3a4048" stroke-width=".8"/>`;
    g += sh('rect x="-8" y="-13" width="32" height="26" rx="2"', '#1f2227', '#050607', 1);
    g += T(8, 1.5, pch ? 'P-MOS' : 'N-MOS', { s: 6, b: 1, c: '#dfe3e9' }) + T(8, 9, 'TO-220', { s: 3.8, c: '#8f97a2' });
    return g;
  }

  /* ------------------------------------------------------------- part table */
  const DRAW = {
    R(p) {
      const v = num(p.v), b = bands(v) || ['#8a8f96', '#8a8f96', '#8a8f96'];
      return lead('M-30 0H-16M16 0H30') +
        sh('rect x="-13" y="-4.6" width="26" height="9.2" rx="1"', '#d9bb86', 'rgba(0,0,0,.45)', 0.7) +
        sh('rect x="-18.5" y="-6.5" width="7" height="13" rx="3.2"', '#d9bb86', 'rgba(0,0,0,.5)', 0.8) +
        sh('rect x="11.5" y="-6.5" width="7" height="13" rx="3.2"', '#d9bb86', 'rgba(0,0,0,.5)', 0.8) +
        [-8.5, -4, 0.5].map((x, i) => `<rect x="${x}" y="-4.6" width="2.4" height="9.2" fill="${b[i]}"/>`).join('') +
        `<rect x="7.5" y="-4.6" width="2.4" height="9.2" fill="${GOLD}"/>` +
        '<rect x="-13" y="-4.6" width="26" height="9.2" rx="1" fill="url(#rc-gloss)" opacity=".7"/>';
    },
    C(p) {
      return lead('M-30 0H-9M9 0H30') +
        sh('circle r="11.5"', '#e29a3b', 'rgba(60,30,0,.6)', 1) +
        '<circle r="8.6" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/>' +
        T(0, 2.6, capCode(num(p.v)), { s: 8, b: 1, c: '#4a2706' });
    },
    Cp(p) {
      const raw = String(p.v == null ? '' : p.v).trim().split(/\s+/)[0] || 'C';
      const fs = raw.length <= 3 ? 7.2 : raw.length <= 4 ? 6.2 : 5.2;
      return lead('M-30 0H-14M14 0H30') +
        '<rect x="-14.5" y="-11.5" width="29" height="23" rx="3.2" fill="url(#rc-blue)"/>' +
        '<path d="M7 -11.5H11.3A3.2 3.2 0 0 1 14.5 -8.3V8.3A3.2 3.2 0 0 1 11.3 11.5H7Z" fill="#dfe3ea"/>' +
        '<rect x="8.2" y="-1" width="4.7" height="1.7" fill="#2a3550"/>' +
        '<rect x="-14.5" y="-11.5" width="29" height="23" rx="3.2" fill="none" stroke="#0a1a4a" stroke-width="1.1"/>' +
        '<rect x="-12.4" y="-8.9" width="18.2" height="1.7" rx=".85" fill="#fff" opacity=".35"/>' +
        TS(-10.3, -2.6, '+', 8, '#fff') + TS(-2.7, 4.6, raw, fs + 0.6, '#fff');
    },
    L() {
      let g = lead('M-30 0H-20M20 0H30') + sh('rect x="-19" y="-4" width="38" height="8" rx="2"', '#3d424a', '#0b0c0e', 0.8);
      for (let i = 0; i < 8; i++) {
        const x = -17.5 + i * 5;
        g += `<ellipse cx="${x}" cy="0" rx="2.3" ry="8.8" fill="none" stroke="#8a4a14" stroke-width="3"/>` +
          `<ellipse cx="${x}" cy="0" rx="2.3" ry="8.8" fill="none" stroke="#e29a49" stroke-width="2"/>` +
          `<path d="M${x - 1.2} -7.6Q${x - 2.4} 0 ${x - 1.2} 7.6" fill="none" stroke="#ffd9a3" stroke-width=".7" opacity=".8"/>`;
      }
      return g;
    },
    V(p) {
      const v = p.v || '', k = /\bnoise\s*\(/i.test(v) ? 'noise' : /\btri\s*\(/i.test(v) ? 'tri' : /\bsaw\s*\(/i.test(v) ? 'saw' : /sin|ac\s/i.test(v) ? 'sin' : /pulse/i.test(v) ? 'pulse' : /pwl/i.test(v) ? 'pwl' : 'dc';
      if (k !== 'dc') return generator(k);
      return lead('M-30 0H-18M15 0H30') +
        '<rect x="-15.5" y="-10.8" width="31" height="21.6" rx="3.4" fill="url(#rc-black)"/>' +
        '<path d="M-12.1 -10.8H-6.6V10.8H-12.1A3.4 3.4 0 0 1 -15.5 7.4V-7.4A3.4 3.4 0 0 1 -12.1 -10.8Z" fill="url(#rc-orange)"/>' +
        '<rect x="-15.5" y="-10.8" width="31" height="21.6" rx="3.4" fill="none" stroke="#050607" stroke-width="1.1"/>' +
        '<rect x="-18.8" y="-3.6" width="3.6" height="7.2" rx="1.2" fill="#e3b84f" stroke="#6a4d10" stroke-width=".8"/>' +
        '<rect x="-4.7" y="-8.4" width="17.7" height="1.2" rx=".6" fill="#9aa1ab" opacity=".55"/>' +
        TS(-11, 3.2, '+', 10, '#3a2306') + TS(4.5, 3.3, dcValue(v) || 'DC', 9, '#fff');
    },
    I() {
      return lead('M-30 0H-13M13 0H30') +
        sh('circle r="14"', '#4d8aa8', 'rgba(0,0,0,.55)', 1) +
        '<circle r="10.8" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>' +
        '<path d="M-7 0H4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M9 0L2-5V5Z" fill="#fff"/>' +
        '<circle cx="-12.2" cy="0" r="1.6" fill="#d9a25c"/><circle cx="12.2" cy="0" r="1.6" fill="#d9a25c"/>';
    },
    D() { return axialDiode({ w: 11.5, h: 6.4, body: '#1a1c20', band: '#d6dae0', rx: 2.4 }); },
    ZEN() { return axialDiode({ w: 11, h: 4.8, body: '#86b9cf', band: '#16181b', glass: 1 }); },
    LED(p) {
      const c = ledColor(p.v);
      return lead('M-30 0H-4.5V-2.5M30 0H4.5V-2.5') +
        `<rect x="-11" y="-5.4" width="22" height="3.4" rx="1" fill="${c}" stroke="rgba(0,0,0,.5)" stroke-width=".8"/>` +
        `<path d="M-8.5 -5.4V-12A8.5 8.5 0 0 1 8.5 -12V-5.4Z" fill="${c}" fill-opacity=".92" stroke="rgba(0,0,0,.5)" stroke-width=".9"/>` +
        '<path d="M-3 -5.4V-12M3 -5.4V-9.5M-3 -12H3" fill="none" stroke="rgba(60,60,60,.55)" stroke-width="1"/>' +
        '<path d="M-8.5 -5.4V-12A8.5 8.5 0 0 1 8.5 -12V-5.4Z" fill="url(#rc-dome)"/>' +
        `<path d="M11.5 -15L15.5 -19M13.5 -9.5L18.5 -11.5" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`;
    },
    QN(p) { return to92(p, 0); },
    QP(p) { return to92(p, 1); },
    MN(p) { return to220(p, 0, 0); },
    MP(p) { return to220(p, 1, 0); },
    MN4(p) { return to220(p, 0, 1); },
    MP4(p) { return to220(p, 1, 1); },
    OA() {
      const r = [-22, -30, 22, 30], S = SYMS;
      return leadsFor(S.OA.pins, r) + lead('M-22 0H-26M22 -20H26M22 20H26') +
        chipBody(r, 3) +
        '<path d="M-5 -30A5 5 0 0 0 5 -30Z" fill="#07080a" stroke="#4a5058" stroke-width=".6"/>' + pin1dot(-16, -23) +
        T(0, 4, 'µA741', { s: 8, b: 1 }) + T(0, 13, 'OP-AMP', { s: 4.6, c: '#8f97a2' }) +
        T(-17, -16.5, '+', { s: 8, b: 1, c: '#ffd36b' }) + T(-17, 23.5, '−', { s: 8, b: 1, c: '#9fb0c4' }) + T(19.5, -2.8, 'OUT', { a: 'end', s: 4.6, c: '#8f97a2' });
    },
    EV(p) { return module(p, 'VCVS', '×' + (p.v || '')); },
    GV(p) { return module(p, 'VCCS', (fmt(num(p.v), 'S') || p.v || '')); },
    GND() {
      return lead('M0 0V6') +
        '<circle cx="0" cy="3.5" r="2.7" fill="url(#rc-metal)" stroke="#4a5059" stroke-width=".8"/><path d="M-1.6 3.5H1.6" stroke="#4a5059" stroke-width=".8"/>' +
        sh('rect x="-13" y="6" width="26" height="5.5" rx="1"', '#b3bac4', '#4a5059', 0.8) +
        '<path d="M-11 19L-7 11.5M-5 19L-1 11.5M1 19L5 11.5M7 19L11 11.5" stroke="#6e7681" stroke-width="1.6" stroke-linecap="round"/>';
    },
    LBL(p) {
      const w = 14 + Math.max(2, (p.v || '').length) * 7;
      return lead('M0 0H6') +
        sh(`path d="M6 0L12-8H${w}V8H12Z"`, '#f4c542', '#6d5000', 1.1) +
        '<circle cx="10" cy="0" r="1.5" fill="#fffbe6" stroke="#6d5000" stroke-width=".7"/>';
    },
    BOX(p) {
      const S = SYMS, pins = S.BOX.dyn(p), n = p.np || 2, l = Math.ceil(n / 2), h = Math.max(l, n - l, 2) * 20, r = [-50, -h / 2, 50, h / 2];
      let g = leadsFor(pins, r) + chipBody(r, 4) + '<path d="M-5 ' + r[1] + 'A5 5 0 0 0 5 ' + r[1] + 'Z" fill="#07080a" stroke="#4a5058" stroke-width=".6"/>' + pin1dot(-44, r[1] + 7);
      g += T(0, 4, p.n || 'U', { s: 11, b: 1 });
      pins.forEach(([nm, dx, dy]) => { g += T(dx < 0 ? -46 : 46, dy * 10 + 2.5, nm, { a: dx < 0 ? 'start' : 'end', s: 6.5, c: '#8f97a2' }); });
      return g;
    },
    NE555() {
      const S = SYMS, r = [-40, -40, 40, 40];
      let g = leadsFor(S.NE555.pins, r) + chipBody(r, 5) + pin1dot(-33, -33);
      g += T(0, 5, 'NE555', { s: 13, b: 1 }) + T(0, 15, 'TIMER', { s: 6, c: '#8f97a2' });
      const L = (y, s) => T(-35, y + 2.5, s, { a: 'start', s: 6.5, c: '#aab2bd' }), R = (y, s) => T(35, y + 2.5, s, { a: 'end', s: 6.5, c: '#aab2bd' });
      g += L(-30, 'TRIG') + L(-10, 'THR') + L(10, 'CTRL') + L(30, 'RST') + R(-20, 'OUT') + R(20, 'DIS') + T(0, -30, 'VCC', { s: 6.5, c: '#aab2bd' }) + T(0, 36, 'GND', { s: 6.5, c: '#aab2bd' });
      S.NE555.pins.forEach(([nm, dx, dy]) => {
        const x = dx * 10, y = dy * 10, n = pin555[nm];
        g += dx === 0 ? T(x + 7, y + (dy < 0 ? 7 : -3), n, { s: 6, b: 1, c: '#ffd36b' }) : T(x + (dx < 0 ? 5 : -5), y - 2.2, n, { s: 6, b: 1, c: '#ffd36b' });
      });
      return g;
    }
  };

  /* VCVS / VCCS controlled-source modules (green PCB with a chip) */
  function module(p, title, gain) {
    const S = SYMS, r = [-20, -22, 20, 22], pins = S[p.t].pins;
    let g = leadsFor(pins, r) + sh('rect x="-20" y="-22" width="40" height="44" rx="3.5"', '#1f8f55', '#0a3a20', 1);
    g += '<path d="M-20 -10H-11V-3M-20 10H-11V3M0 -22V-12M0 22V12" fill="none" stroke="#e0bd78" stroke-width="1.1" opacity=".75"/>';
    g += sh('rect x="-9" y="-8" width="18" height="16" rx="1.2"', '#1b1d21', '#000', 0.8) + pin1dot(-6, -5.2);
    g += T(0, 1.2, title, { s: 5.6, b: 1 }) + T(0, 6.6, '⇢', { s: 5, c: '#8f97a2' });
    g += pins.map(([, dx, dy]) => {
      const x = dx * 10, y = dy * 10;
      return `<circle cx="${x < -20 ? -20 : x > 20 ? 20 : x}" cy="${y < -22 ? -22 : y > 22 ? 22 : y}" r="2.3" fill="#d6a948" stroke="#6b4e0c" stroke-width=".6"/>`;
    }).join('');
    g += T(5.5, -14.5, '+', { s: 7, b: 1, c: '#fff' }) + T(5.5, 19.5, '−', { s: 7, b: 1, c: '#fff' }) + T(-15, 15.5, gain, { a: 'start', s: 5.4, b: 1, c: '#fff' });
    return g;
  }

  /* CMOS logic chips: one drawing for the 12 gates */
  function gateChip(p) {
    const S = SYMS, key = p.t.slice(2), r = [-28, -30, 28, 30], pins = S[p.t].pins;
    let g = leadsFor(pins, r) + chipBody(r, 3) + pin1dot(-22, -24);
    g += T(0, -1, 'CD' + (gateNo[key] || '40xx'), { s: 7.4, b: 1 }) + T(0, 9, key, { s: 6.4, c: '#ffd36b', b: 1 });
    pins.forEach(([nm, dx, dy]) => {
      const x = dx * 10, y = dy * 10;
      if (nm === 'Y') g += T(24, y + 2.2, 'Y', { a: 'end', s: 6, c: '#aab2bd' });
      else if (nm === 'VDD') g += T(0, -23, 'VDD', { s: 5.5, c: '#aab2bd' });
      else if (nm === 'VSS') g += T(0, 27.5, 'VSS', { s: 5.5, c: '#aab2bd' });
      else g += T(-24, y + 2.2, nm, { a: 'start', s: 6, c: '#aab2bd' });
    });
    return g;
  }

  RC.has = function (k) {
    return !!(DRAW[k] || (k && k.slice(0, 2) === 'G_'));
  };
  RC.draw = function (p) {
    const f = DRAW[p.t] || (p.t.slice(0, 2) === 'G_' ? gateChip : null);
    return f ? f(p) : '';
  };

  /* ------------------------------------------------- on-screen gradient defs */
  function ensureDefs() {
    if (document.getElementById('rcDefs')) return;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.id = 'rcDefs';
    s.setAttribute('width', '0');
    s.setAttribute('height', '0');
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    s.innerHTML = RC.defs();
    document.body.appendChild(s);
  }

  /* ------------------------------------------------- Schematic <-> Realistic */
  function refresh() {
    ['vlSch', 'vlReal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('on', (id === 'vlReal') === RC.on);
    });
    const r = document.getElementById('viewRocker');
    if (r) { r.classList.toggle('on', RC.on); r.setAttribute('aria-checked', RC.on ? 'true' : 'false'); }
    document.documentElement.classList.toggle('realistic', RC.on);
    try { if (typeof buildPalette === 'function') buildPalette(document.getElementById('psearch').value); } catch (e) {}
    try { if (typeof draw === 'function') draw(); } catch (e) {}
    try { if (typeof inspect === 'function') inspect(); } catch (e) {}
    const h = document.getElementById('sHint');
    if (h) h.textContent = RC.on ? 'Realistic view — real component bodies (same pins & wiring)' : 'Schematic view';
  }
  RC.set = function (on) {
    RC.on = !!on;
    try { localStorage.setItem('ngspice-view', RC.on ? 'realistic' : 'schematic'); } catch (e) {}
    refresh();
  };
  RC.toggle = function () { RC.set(!RC.on); };

  ensureDefs();
  const rk = document.getElementById('viewRocker');
  if (rk) rk.addEventListener('click', RC.toggle);
  const ls = document.getElementById('vlSch'), lr = document.getElementById('vlReal');
  if (ls) ls.addEventListener('click', () => RC.set(false));
  if (lr) lr.addEventListener('click', () => RC.set(true));
  /* keyboard shortcut: T = swap view (ignored while typing) */
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); RC.toggle(); }
  });

  /* restore the last used view once ngspice.js has finished starting up */
  window.addEventListener('load', () => {
    let v = null;
    try { v = localStorage.getItem('ngspice-view'); } catch (e) {}
    if (v === 'realistic') RC.set(true); else refresh();
  });
})();
